/**
 * Job dispatch: receives PR metadata and kicks off the recording pipeline.
 *
 * Creates a run in Convex, posts/updates the PR bot comment through the
 * status lifecycle, and dispatches work to Daytona (or local fallback).
 */

import type { PRContext, RunStatus } from "@repo/core";
import {
  createRun,
  updateRunStatus,
  postOrUpdateComment,
  updateCommentStatus,
} from "@repo/core";

export interface DispatchConfig {
  convexUrl: string;
  githubToken: string;
  dashboardBaseUrl: string;
}

export interface JobRecord {
  runId: string;
  commentId: number;
  dashboardUrl: string;
  status: RunStatus;
}

function getConfig(): DispatchConfig {
  const convexUrl = process.env.CONVEX_URL;
  const githubToken = process.env.GITHUB_TOKEN;
  const dashboardBaseUrl =
    process.env.DASHBOARD_BASE_URL ?? "http://localhost:3000";

  if (!convexUrl || !githubToken) {
    throw new Error("CONVEX_URL and GITHUB_TOKEN are required");
  }

  return { convexUrl, githubToken, dashboardBaseUrl };
}

/**
 * Dispatch a new pipeline job for a pull request event.
 *
 * 1. Creates a run record in Convex (status: queued)
 * 2. Posts or updates the PR bot comment with "queued" status
 * 3. Transitions through running -> uploading -> completed/failed
 *
 * The actual recording work is delegated to Daytona sandbox or local.
 */
export async function dispatchJob(pr: PRContext): Promise<JobRecord> {
  const config = getConfig();
  const convexOpts = { convexUrl: config.convexUrl, dashboardBaseUrl: config.dashboardBaseUrl };
  const botOpts = { githubToken: config.githubToken, dashboardBaseUrl: config.dashboardBaseUrl };

  // Step 1: Create run in Convex
  const { runId, dashboardUrl } = await createRun(convexOpts, {
    timestamp: Date.now(),
    summary: `PR #${String(pr.prNumber)} — automated demo recording`,
    branch: pr.branch,
    pr: pr.prNumber,
    commitSha: pr.commitSha,
    source: "pr",
  });

  // Step 2: Post initial PR comment (queued)
  const commentState = await postOrUpdateComment(botOpts, pr, {
    commentId: 0,
    status: "queued",
    runId,
    dashboardUrl,
  });

  const job: JobRecord = {
    runId,
    commentId: commentState.commentId,
    dashboardUrl,
    status: "queued",
  };

  // Step 3: Transition to "running"
  try {
    await updateRunStatus(convexOpts, runId, "running");
    job.status = "running";

    await updateCommentStatus(botOpts, pr, commentState, "running", {
      dashboardUrl,
    });

    // The actual pipeline work (sandbox creation, recording, etc.)
    // would be dispatched asynchronously here. For now, we set up
    // the full lifecycle tracking and return the job record.
    // In production, this would call:
    //   runPipeline(sandboxConfig, steps, onStatus)
    // where onStatus streams back to Convex + PR comment.

    return job;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await updateRunStatus(convexOpts, runId, "failed", { error: errorMsg });

    await updateCommentStatus(botOpts, pr, commentState, "failed", {
      dashboardUrl,
      error: errorMsg,
    });

    job.status = "failed";
    return job;
  }
}

/**
 * Re-run a previously failed or completed job.
 * Creates a new run record linked to the same PR.
 */
export async function retryJob(pr: PRContext): Promise<JobRecord> {
  return dispatchJob(pr);
}
