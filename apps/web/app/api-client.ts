const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://aura-backend.poppets-grungy03.workers.dev";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

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

export function getSession() {
  return apiFetch<SessionResponse>("/api/auth/session");
}

export function logout() {
  return apiFetch<{ success: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export function getAuthUrl() {
  return apiFetch<{ authorization_url: string; state: string }>(
    "/api/auth/github?redirect=false"
  );
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export interface Run {
  _id: string;
  _creationTime: number;
  timestamp: number;
  branch?: string;
  pr?: number;
  commitSha?: string;
  summary: string;
  videoUrl: string | null;
  status: "queued" | "running" | "uploading" | "completed" | "failed";
  source: "skill" | "pr";
  screenshotStorageIds?: string[];
  routesTested?: string[];
  durationMs?: number;
  error?: string;
  traceId?: string;
}

export interface RunDetail extends Run {
  screenshotUrls: string[];
}

export function listRuns(opts?: { status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch<Run[]>(`/api/runs${qs ? `?${qs}` : ""}`);
}

export function getRun(runId: string) {
  return apiFetch<RunDetail>(`/api/runs/${runId}`);
}

export function createRun(data: {
  timestamp?: number;
  branch?: string;
  pr?: number;
  commitSha?: string;
  summary: string;
  status?: string;
  source?: string;
  routesTested?: string[];
  traceId?: string;
}) {
  return apiFetch<Run>("/api/runs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRunStatus(
  runId: string,
  data: { status: string; durationMs?: number; error?: string }
) {
  return apiFetch(`/api/runs/${runId}/status`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Edits ───────────────────────────────────────────────────────────────────

export interface EditVersion {
  _id: string;
  runId: string;
  version: number;
  parentVersionId: string | null;
  operations: unknown[];
  status: string;
  videoUrl: string | null;
  error?: string;
  createdAt: number;
}

export function listEditVersions(runId: string) {
  return apiFetch<EditVersion[]>(`/api/runs/${runId}/edits`);
}

export function applyEdit(
  runId: string,
  data: {
    parentVersionId?: string;
    operation: Record<string, unknown>;
  }
) {
  return apiFetch<EditVersion>(`/api/runs/${runId}/edits`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function revertEdits(runId: string) {
  return apiFetch<EditVersion>(`/api/runs/${runId}/edits/revert`, {
    method: "POST",
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export interface ExportJob {
  _id: string;
  _creationTime: number;
  runId: string;
  editVersionId?: string;
  format: "mp4" | "gif";
  fps: number;
  width: number;
  height: number;
  quality: "web" | "high" | "preview";
  maxFileSizeMb?: number;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  eta?: string;
  outputUrl: string | null;
  fileSizeBytes?: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export function listExports(runId: string) {
  return apiFetch<ExportJob[]>(`/api/runs/${runId}/exports`);
}

export function createExport(
  runId: string,
  data: {
    format: string;
    fps: number;
    width: number;
    height: number;
    quality: string;
    maxFileSizeMb?: number;
    editVersionId?: string;
  }
) {
  return apiFetch<ExportJob>(`/api/runs/${runId}/exports`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export function generateUploadUrl() {
  return apiFetch<{ uploadUrl: string }>("/api/upload-url", {
    method: "POST",
  });
}