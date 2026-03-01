export type RunStatus =
  | "queued"
  | "running"
  | "uploading"
  | "completed"
  | "failed";

export interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  commitSha: string;
  branch: string;
  diff: string;
}

export interface PRBotOptions {
  githubToken: string;
  dashboardBaseUrl?: string;
}

export interface CommentState {
  commentId: number;
  runId?: string;
  dashboardUrl?: string;
  status: RunStatus;
  summary?: string;
  routesTested?: string[];
  videoUrl?: string;
  error?: string;
}

const COMMENT_MARKER = "<!-- aura-bot -->";
const API_BASE = "https://api.github.com";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function buildCommentBody(state: CommentState): string {
  const lines: string[] = [COMMENT_MARKER, "", "## Aura Demo Recording", ""];

  switch (state.status) {
    case "queued":
      lines.push("> **Status**: Queued — waiting to start...");
      break;
    case "running":
      lines.push("> **Status**: Recording — navigating and capturing demo...");
      break;
    case "uploading":
      lines.push("> **Status**: Uploading — processing video and artifacts...");
      break;
    case "completed": {
      lines.push("> **Status**: Completed");
      lines.push("");

      if (state.videoUrl) {
        lines.push(
          `https://github.com/user-attachments/assets/video-preview`,
        );
        lines.push("");
        lines.push(`[Watch full video](${state.videoUrl})`);
        lines.push("");
      }

      if (state.dashboardUrl) {
        lines.push(`[View on dashboard](${state.dashboardUrl})`);
        lines.push("");
      }

      if (state.summary) {
        lines.push("### Summary");
        lines.push("");
        lines.push(state.summary);
        lines.push("");
      }

      if (state.routesTested && state.routesTested.length > 0) {
        lines.push("### Routes tested");
        lines.push("");
        for (const route of state.routesTested) {
          lines.push(`- \`${route}\``);
        }
        lines.push("");
      }
      break;
    }
    case "failed":
      lines.push("> **Status**: Failed");
      lines.push("");
      if (state.error) {
        lines.push("```");
        lines.push(state.error);
        lines.push("```");
        lines.push("");
      }
      if (state.dashboardUrl) {
        lines.push(`[View on dashboard](${state.dashboardUrl})`);
        lines.push("");
      }
      break;
  }

  return lines.join("\n");
}

export async function findExistingComment(
  options: PRBotOptions,
  context: PRContext,
): Promise<number | null> {
  const url = `${API_BASE}/repos/${context.owner}/${context.repo}/issues/${String(context.prNumber)}/comments?per_page=100`;
  const res = await fetch(url, {
    headers: headers(options.githubToken),
  });

  if (!res.ok) return null;

  const comments = (await res.json()) as Array<{
    id: number;
    body?: string;
  }>;
  const existing = comments.find(
    (c) => c.body && c.body.includes(COMMENT_MARKER),
  );
  return existing?.id ?? null;
}

export async function postOrUpdateComment(
  options: PRBotOptions,
  context: PRContext,
  state: CommentState,
): Promise<CommentState> {
  const body = buildCommentBody(state);
  const existingId = await findExistingComment(options, context);

  if (existingId) {
    const url = `${API_BASE}/repos/${context.owner}/${context.repo}/issues/comments/${String(existingId)}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: headers(options.githubToken),
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      throw new Error(
        `Failed to update PR comment: ${String(res.status)}`,
      );
    }

    return { ...state, commentId: existingId };
  }

  const url = `${API_BASE}/repos/${context.owner}/${context.repo}/issues/${String(context.prNumber)}/comments`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(options.githubToken),
    body: JSON.stringify({ body }),
  });

  if (!res.ok) {
    throw new Error(`Failed to post PR comment: ${String(res.status)}`);
  }

  const data = (await res.json()) as { id: number };
  return { ...state, commentId: data.id };
}

export async function updateCommentStatus(
  options: PRBotOptions,
  context: PRContext,
  state: CommentState,
  status: RunStatus,
  updates?: Partial<
    Pick<
      CommentState,
      "summary" | "routesTested" | "videoUrl" | "dashboardUrl" | "error"
    >
  >,
): Promise<CommentState> {
  const newState: CommentState = {
    ...state,
    ...updates,
    status,
  };
  return postOrUpdateComment(options, context, newState);
}

export { buildCommentBody, COMMENT_MARKER };
