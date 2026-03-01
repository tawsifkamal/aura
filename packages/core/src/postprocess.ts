import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { updateRunStatus, uploadVideo, updateRunAnnotations } from "./convex-uploader.js";

const execFileAsync = promisify(execFile);

export interface RawAnnotationSection {
  task?: string;
  description?: string;
  path?: string;
  routePath?: string;
  startMs?: number;
  endMs?: number;
  timestampMs?: number;
  x?: number;
  y?: number;
  xNorm?: number;
  yNorm?: number;
}

export interface AnnotationSection {
  task: string;
  path: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
}

interface InteractionEvent {
  type: "click" | "hover";
  atMs: number;
  x: number;
  y: number;
  note: string;
}

export interface PostprocessRequest {
  runId: string;
  inputVideoUrl: string;
  sections: RawAnnotationSection[];
  outputPath?: string;
}

export interface PostprocessOptions {
  convexUrl: string;
}

export interface PostprocessResult {
  runId: string;
  processedVideoPath: string;
  outputSizeBytes: number;
  annotations: AnnotationSection[];
  subtitlesVtt: string;
  uploadedVideo: boolean;
}

async function resolveBinary(name: "ffmpeg" | "ffprobe"): Promise<string> {
  const override = process.env[name.toUpperCase()];
  if (override) return override;
  try {
    const { stdout } = await execFileAsync("which", [name]);
    const resolved = stdout.trim();
    if (resolved) return resolved;
  } catch {
    // noop
  }
  throw new Error(`${name} is required on PATH.`);
}

async function getVideoInfo(
  inputPath: string,
): Promise<{ width: number; height: number; durationSec: number }> {
  const ffprobe = await resolveBinary("ffprobe");
  const { stdout } = await execFileAsync(ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    inputPath,
  ]);

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width: number; height: number }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const durationSec = Number(parsed.format?.duration ?? "0");
  if (!stream || !durationSec) {
    throw new Error("Unable to inspect source video via ffprobe.");
  }
  return { width: stream.width, height: stream.height, durationSec };
}

function msToVtt(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const msPart = total % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
}

function buildVtt(sections: AnnotationSection[]): string {
  const lines = ["WEBVTT", ""];
  sections.forEach((section, idx) => {
    lines.push(String(idx + 1));
    lines.push(`${msToVtt(section.startMs)} --> ${msToVtt(section.endMs)}`);
    lines.push(`${section.task} (${section.path})`);
    lines.push("");
  });
  return lines.join("\n");
}

function normalizeSections(
  sections: RawAnnotationSection[],
  width: number,
  height: number,
  durationSec: number,
): AnnotationSection[] {
  const durationMs = Math.floor(durationSec * 1000);
  const out: AnnotationSection[] = [];

  sections.forEach((raw, idx) => {
    const startMs = Math.max(0, Math.floor(raw.startMs ?? raw.timestampMs ?? idx * 1200));
    const endMs = Math.min(
      durationMs,
      Math.max(startMs + 350, Math.floor(raw.endMs ?? startMs + 1300)),
    );
    const xFromNorm = typeof raw.xNorm === "number" ? Math.round(raw.xNorm * width) : undefined;
    const yFromNorm = typeof raw.yNorm === "number" ? Math.round(raw.yNorm * height) : undefined;
    const x = Math.max(0, Math.min(width, Math.floor(raw.x ?? xFromNorm ?? width / 2)));
    const y = Math.max(0, Math.min(height, Math.floor(raw.y ?? yFromNorm ?? height / 2)));

    out.push({
      task: String(raw.task ?? raw.description ?? `Section ${idx + 1}`),
      path: String(raw.path ?? raw.routePath ?? "/"),
      startMs,
      endMs,
      x,
      y,
    });
  });

  if (out.length > 0) return out.sort((a, b) => a.startMs - b.startMs);
  return [
    {
      task: "Overview",
      path: "/",
      startMs: 250,
      endMs: Math.min(durationMs, 1800),
      x: Math.floor(width / 2),
      y: Math.floor(height / 2),
    },
  ];
}

function sectionsToEvents(sections: AnnotationSection[]): InteractionEvent[] {
  const events: InteractionEvent[] = [];
  for (const section of sections) {
    events.push({
      type: "click",
      atMs: section.startMs,
      x: section.x,
      y: section.y,
      note: `${section.task} (${section.path})`,
    });
    events.push({
      type: "hover",
      atMs: Math.min(section.endMs, section.startMs + 420),
      x: section.x,
      y: section.y,
      note: `${section.task} (${section.path})`,
    });
  }
  return events.sort((a, b) => a.atMs - b.atMs);
}

async function downloadToFile(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download input video (${String(res.status)}).`);
  }
  await mkdir(dirname(path), { recursive: true });
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buffer);
}

function buildZoomFilter(events: InteractionEvent[]): string {
  const pulses = events
    .filter((e) => e.type === "click")
    .map((event) => {
      const start = Math.max(0, event.atMs / 1000 - 0.15);
      const peak = event.atMs / 1000 + 0.22;
      const end = peak + 0.9;
      return `if(between(t,${start},${peak}),1+0.28*((t-${start})/${Math.max(0.01, peak - start)}),if(between(t,${peak},${end}),1.28-0.28*((t-${peak})/${Math.max(0.01, end - peak)}),1))`;
    });
  const parts = ["1", ...pulses];
  if (parts.length === 1) return "1";
  return parts.reduce((acc, part) => `max(${acc},${part})`);
}

function buildFocusExpr(
  events: InteractionEvent[],
  axis: "x" | "y",
  fallback: number,
): string {
  const ordered = [...events].sort((a, b) => a.atMs - b.atMs);
  if (ordered.length === 0) return String(fallback);
  let expr = String(fallback);
  for (const event of ordered) {
    const t = Math.max(0, event.atMs / 1000 - 0.12);
    const coord = axis === "x" ? event.x : event.y;
    expr = `if(gte(t,${t}),${coord},${expr})`;
  }
  return expr;
}

async function renderStylizedVideo(
  inputPath: string,
  outputPath: string,
  events: InteractionEvent[],
  width: number,
  height: number,
  durationSec: number,
): Promise<void> {
  const ffmpeg = await resolveBinary("ffmpeg");
  const padX = 160;
  const padY = 96;
  const outW = width + padX * 2;
  const outH = height + padY * 2;
  const zoomExpr = buildZoomFilter(events);
  const focusXExpr = buildFocusExpr(events, "x", width / 2);
  const focusYExpr = buildFocusExpr(events, "y", height / 2);
  const centeredXExpr = `max(0,min(iw-${width},(${focusXExpr})*${zoomExpr}-${width}/2))`;
  const centeredYExpr = `max(0,min(ih-${height},(${focusYExpr})*${zoomExpr}-${height}/2))`;

  const filterComplex = [
    `color=c=#10172A:s=${outW}x${outH}:d=${durationSec}[bg]`,
    `[0:v]scale=w='iw*(${zoomExpr})':h='ih*(${zoomExpr})':eval=frame,crop=${width}:${height}:x='${centeredXExpr}':y='${centeredYExpr}',format=yuv420p[cam]`,
    `[bg][cam]overlay=${padX}:${padY}[final]`,
  ].join(";");

  const temp = await mkdtemp(join(tmpdir(), "aura-post-filters-"));
  const filterFile = join(temp, "filter_complex.txt");
  await writeFile(filterFile, filterComplex, "utf8");
  try {
    await execFileAsync(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-filter_complex_script",
      filterFile,
      "-map",
      "[final]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function processAndUploadVideo(
  request: PostprocessRequest,
  options: PostprocessOptions,
): Promise<PostprocessResult> {
  const convexOpts = { convexUrl: options.convexUrl };
  const tempDir = await mkdtemp(join(tmpdir(), "aura-postprocess-"));
  const inputPath = join(tempDir, "input.webm");
  const outputPath = request.outputPath
    ? resolve(process.cwd(), request.outputPath)
    : join(resolve(process.cwd(), "output"), `postprocessed-${Date.now()}.mp4`);

  try {
    await updateRunStatus(convexOpts, request.runId, "uploading");
    await downloadToFile(request.inputVideoUrl, inputPath);
    const info = await getVideoInfo(inputPath);
    const annotations = normalizeSections(
      request.sections ?? [],
      info.width,
      info.height,
      info.durationSec,
    );
    const events = sectionsToEvents(annotations);
    const vtt = buildVtt(annotations);

    await mkdir(dirname(outputPath), { recursive: true });
    await renderStylizedVideo(
      inputPath,
      outputPath,
      events,
      info.width,
      info.height,
      info.durationSec,
    );

    await uploadVideo(convexOpts, request.runId, outputPath);
    await updateRunAnnotations(convexOpts, request.runId, {
      annotations,
      subtitlesVtt: vtt,
    });

    const outputStats = await stat(outputPath);
    await updateRunStatus(convexOpts, request.runId, "completed");

    return {
      runId: request.runId,
      processedVideoPath: outputPath,
      outputSizeBytes: outputStats.size,
      annotations,
      subtitlesVtt: vtt,
      uploadedVideo: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunStatus(convexOpts, request.runId, "failed", { error: message });
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: createReadStream(filePath) as unknown as BodyInit,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed upload to pre-signed URL (${String(res.status)}): ${body}`);
  }
}
