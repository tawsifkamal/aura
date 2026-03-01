import type { RunDetail, ExportJob } from "./types";
export type { RunDetail, ExportJob } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// --- Auth ---

export interface Session {
  github_user_id: number;
  github_login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  scopes: string;
  connected_at: string;
}

export interface SessionResponse {
  authenticated: boolean;
  session: Session | null;
}

export function getSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/auth/session");
}

export function logout(): Promise<{ success: boolean }> {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

export function getGitHubAuthUrl(redirectTo?: string): string {
  const params = new URLSearchParams();
  if (redirectTo) params.set("redirect_to", redirectTo);
  const qs = params.toString();
  return `${API_URL}/api/auth/github${qs ? `?${qs}` : ""}`;
}

// --- Runs ---

export interface RunListItem {
  _id: string;
  _creationTime: number;
  timestamp: number;
  branch?: string;
  pr?: number;
  commitSha?: string;
  summary: string;
  status: "queued" | "running" | "uploading" | "completed" | "failed";
  source: "skill" | "pr";
  videoUrl: string | null;
  routesTested?: string[];
  durationMs?: number;
  error?: string;
  traceId?: string;
}

export function listRuns(opts?: {
  status?: string;
  limit?: number;
}): Promise<RunListItem[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch(`/api/runs${qs ? `?${qs}` : ""}`);
}

export function getRun(runId: string): Promise<RunDetail> {
  return apiFetch(`/api/runs/${runId}`);
}

// --- Edits ---

export interface EditVersion {
  _id: string;
  runId: string;
  version: number;
  parentVersionId: string | null;
  operations: Record<string, unknown>[];
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  error?: string;
  createdAt: number;
}

export function listEditVersions(runId: string): Promise<EditVersion[]> {
  return apiFetch(`/api/runs/${runId}/edits`);
}

export function applyEdit(
  runId: string,
  body: { parentVersionId?: string; operation: Record<string, unknown> },
): Promise<EditVersion> {
  return apiFetch(`/api/runs/${runId}/edits`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function revertEdits(runId: string): Promise<EditVersion> {
  return apiFetch(`/api/runs/${runId}/edits/revert`, { method: "POST" });
}

// --- Repositories ---

export interface Repository {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  description: string | null;
  language: string | null;
  updated_at: string;
  enabled: boolean;
}

export interface EnabledRepo {
  _id: string;
  userId: string;
  githubRepoId: number;
  fullName: string;
  name: string;
  owner: string;
  isPrivate: boolean;
  htmlUrl: string;
  defaultBranch: string;
  status: "available" | "added" | "synced";
  addedAt?: number;
  lastSyncedAt?: number;
}

export function listRepositories(q?: string): Promise<Repository[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const qs = params.toString();
  return apiFetch(`/api/repositories${qs ? `?${qs}` : ""}`);
}

export function listEnabledRepositories(): Promise<EnabledRepo[]> {
  return apiFetch("/api/repositories/enabled");
}

export function enableRepository(
  githubRepoId: number,
  repo: {
    full_name: string;
    name: string;
    owner: string;
    private: boolean;
    html_url: string;
    default_branch: string;
  },
): Promise<{ success: boolean; repository: EnabledRepo }> {
  return apiFetch(`/api/repositories/${githubRepoId}/enable`, {
    method: "POST",
    body: JSON.stringify(repo),
  });
}

export function disableRepository(
  githubRepoId: number,
): Promise<{ success: boolean }> {
  return apiFetch(`/api/repositories/${githubRepoId}/disable`, {
    method: "POST",
  });
}

// --- Exports ---

export function listExports(runId: string): Promise<ExportJob[]> {
  return apiFetch(`/api/runs/${runId}/exports`);
}

export function createExport(
  runId: string,
  config: {
    format: "mp4" | "gif";
    fps: number;
    width: number;
    height: number;
    quality: "web" | "high" | "preview";
    maxFileSizeMb?: number;
  },
): Promise<ExportJob> {
  return apiFetch(`/api/runs/${runId}/exports`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}