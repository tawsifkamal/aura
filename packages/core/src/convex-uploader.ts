import { readFile } from "node:fs/promises";

export interface RunMetadata {
  timestamp: number;
  branch?: string;
  pr?: number;
  commitSha?: string;
  summary: string;
  source: "skill" | "pr";
  routesTested?: string[];
  durationMs?: number;
  traceId?: string;
}

export interface UploadResult {
  runId: string;
  dashboardUrl: string;
}

export interface ConvexUploaderOptions {
  convexUrl: string;
  dashboardBaseUrl?: string;
}

async function uploadFileToConvex(
  convexUrl: string,
  filePath: string,
): Promise<string> {
  const generateRes = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "runs:generateUploadUrl",
      args: {},
      format: "json",
    }),
  });

  if (!generateRes.ok) {
    throw new Error(
      `Failed to generate upload URL: ${String(generateRes.status)}`,
    );
  }

  const { value: uploadUrl } = (await generateRes.json()) as {
    value: string;
  };

  const fileBuffer = await readFile(filePath);
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
  };

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload file: ${String(uploadRes.status)}`);
  }

  const { storageId } = (await uploadRes.json()) as { storageId: string };
  return storageId;
}

async function callMutation(
  convexUrl: string,
  path: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });

  if (!res.ok) {
    throw new Error(`Convex mutation ${path} failed: ${String(res.status)}`);
  }

  const data = (await res.json()) as { value: unknown };
  return data.value;
}

export async function createRun(
  options: ConvexUploaderOptions,
  metadata: RunMetadata,
): Promise<UploadResult> {
  const runId = (await callMutation(options.convexUrl, "runs:create", {
    ...metadata,
    status: "queued",
  })) as string;

  const baseUrl = options.dashboardBaseUrl ?? "http://localhost:3000";
  return {
    runId,
    dashboardUrl: `${baseUrl}/runs/${runId}`,
  };
}

export async function updateRunStatus(
  options: ConvexUploaderOptions,
  runId: string,
  status: "queued" | "running" | "uploading" | "completed" | "failed",
  extra?: { error?: string; durationMs?: number },
): Promise<void> {
  await callMutation(options.convexUrl, "runs:updateStatus", {
    id: runId,
    status,
    ...extra,
  });
}

export async function uploadVideo(
  options: ConvexUploaderOptions,
  runId: string,
  videoPath: string,
): Promise<void> {
  const storageId = await uploadFileToConvex(options.convexUrl, videoPath);
  await callMutation(options.convexUrl, "runs:attachVideo", {
    id: runId,
    videoStorageId: storageId,
  });
}

export async function uploadScreenshots(
  options: ConvexUploaderOptions,
  runId: string,
  screenshotPaths: string[],
): Promise<void> {
  const storageIds: string[] = [];
  for (const path of screenshotPaths) {
    const sid = await uploadFileToConvex(options.convexUrl, path);
    storageIds.push(sid);
  }
  await callMutation(options.convexUrl, "runs:attachScreenshots", {
    id: runId,
    screenshotStorageIds: storageIds,
  });
}
