/**
 * Aura webhook server — receives GitHub App webhook events for
 * pull_request and issue_comment, validates signatures, and
 * dispatches recording pipeline jobs.
 *
 * Deployable as a standalone Node.js service on Fly.io, Railway,
 * or AWS (Lambda behind API Gateway, ECS, etc.).
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PRContext } from "@repo/core";
import { verifySignature } from "./verify.js";
import { dispatchJob, retryJob } from "./dispatch.js";

const PORT = Number(process.env.PORT ?? "3001");
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// PR event handler
// ---------------------------------------------------------------------------

interface PRWebhookPayload {
  action?: string;
  number?: number;
  pull_request?: {
    number: number;
    head: {
      sha: string;
      ref: string;
    };
  };
  repository?: {
    owner: { login: string };
    name: string;
    full_name: string;
  };
}

function extractPRContext(payload: PRWebhookPayload): PRContext | null {
  const pr = payload.pull_request;
  const repo = payload.repository;
  if (!pr || !repo) return null;

  return {
    owner: repo.owner.login,
    repo: repo.name,
    prNumber: pr.number,
    commitSha: pr.head.sha,
    branch: pr.head.ref,
    diff: "", // Diff will be fetched by the pipeline
  };
}

async function handlePullRequest(payload: PRWebhookPayload): Promise<{
  dispatched: boolean;
  reason: string;
  runId?: string;
}> {
  const action = payload.action;

  // Only trigger on open, synchronize (new push), or reopened
  if (
    action !== "opened" &&
    action !== "synchronize" &&
    action !== "reopened"
  ) {
    return { dispatched: false, reason: `Skipped action: ${action ?? "unknown"}` };
  }

  const pr = extractPRContext(payload);
  if (!pr) {
    return { dispatched: false, reason: "Could not extract PR context" };
  }

  const job = await dispatchJob(pr);
  return {
    dispatched: true,
    reason: `Job dispatched for PR #${String(pr.prNumber)}`,
    runId: job.runId,
  };
}

// ---------------------------------------------------------------------------
// Comment command handler (retry/re-run)
// ---------------------------------------------------------------------------

interface CommentPayload {
  action?: string;
  comment?: {
    body?: string;
    user?: { login: string };
  };
  issue?: {
    number: number;
    pull_request?: { url: string };
  };
  repository?: {
    owner: { login: string };
    name: string;
  };
}

const RETRY_COMMAND = /\/aura\s+(?:re-?run|retry)/i;

async function handleIssueComment(payload: CommentPayload): Promise<{
  dispatched: boolean;
  reason: string;
  runId?: string;
}> {
  if (payload.action !== "created") {
    return { dispatched: false, reason: "Not a new comment" };
  }

  // Only handle PR comments (issues with pull_request field)
  if (!payload.issue?.pull_request) {
    return { dispatched: false, reason: "Not a PR comment" };
  }

  const body = payload.comment?.body ?? "";
  if (!RETRY_COMMAND.test(body)) {
    return { dispatched: false, reason: "No /aura command found" };
  }

  const repo = payload.repository;
  if (!repo) {
    return { dispatched: false, reason: "Missing repository context" };
  }

  const pr: PRContext = {
    owner: repo.owner.login,
    repo: repo.name,
    prNumber: payload.issue.number,
    commitSha: "", // Will be resolved from PR API
    branch: "",
    diff: "",
  };

  const job = await retryJob(pr);
  return {
    dispatched: true,
    reason: `Re-run dispatched for PR #${String(pr.prNumber)}`,
    runId: job.runId,
  };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { status: "ok", service: "aura-webhook" });
    return;
  }

  // Only accept POST to /webhook
  if (req.method !== "POST" || (req.url !== "/webhook" && req.url !== "/")) {
    json(res, 404, { error: "Not found" });
    return;
  }

  const body = await readBody(req);

  // Verify signature if secret is configured
  if (WEBHOOK_SECRET) {
    const sig = req.headers["x-hub-signature-256"] as string | undefined;
    if (!verifySignature(body, sig, WEBHOOK_SECRET)) {
      json(res, 401, { error: "Invalid signature" });
      return;
    }
  }

  const event = req.headers["x-github-event"] as string | undefined;
  const deliveryId = req.headers["x-github-delivery"] as string | undefined;

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  console.log(
    `[webhook] event=${event ?? "unknown"} delivery=${deliveryId ?? "unknown"}`,
  );

  try {
    let result: { dispatched: boolean; reason: string; runId?: string };

    switch (event) {
      case "pull_request":
        result = await handlePullRequest(payload as PRWebhookPayload);
        break;
      case "issue_comment":
        result = await handleIssueComment(payload as CommentPayload);
        break;
      case "ping":
        json(res, 200, { status: "pong" });
        return;
      default:
        json(res, 200, { status: "ignored", event });
        return;
    }

    console.log(
      `[webhook] ${result.dispatched ? "dispatched" : "skipped"}: ${result.reason}`,
    );
    json(res, 200, result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    console.error(`[webhook] error: ${message}`);
    json(res, 500, { error: message });
  }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  handleWebhook(req, res).catch((err: unknown) => {
    console.error("[webhook] unhandled error:", err);
    if (!res.headersSent) {
      json(res, 500, { error: "Internal server error" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[aura-webhook] listening on port ${String(PORT)}`);
});
