import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RecordingStep } from "./browser-recorder.js";

export interface Point {
  x: number;
  y: number;
}

export interface CursorKeyframe {
  position: Point;
  timestamp: number;
  action: RecordingStep["action"];
}

export interface ZoomKeyframe {
  center: Point;
  scale: number;
  timestamp: number;
  durationMs: number;
}

export interface StylePreset {
  name: string;
  cursorSize: number;
  cursorColor: string;
  cursorTrailEnabled: boolean;
  zoomScale: number;
  zoomDurationMs: number;
  zoomEasing: EasingFunction;
  motionSmoothing: number;
  backgroundColor: string;
  borderRadius: number;
  shadowEnabled: boolean;
}

export type EasingFunction =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "cubic-bezier";

export interface VideoProcessorOptions {
  inputDir: string;
  outputDir: string;
  width: number;
  height: number;
  fps: number;
  preset: StylePreset;
  steps: RecordingStep[];
  cursorPositions?: CursorKeyframe[];
}

export interface ProcessedVideo {
  videoPath: string;
  thumbnailPath: string;
  durationMs: number;
  frameCount: number;
  resolution: { width: number; height: number };
}

// --- Easing functions ---

function easeLinear(t: number): number {
  return t;
}

function easeInQuad(t: number): number {
  return t * t;
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getEasing(name: EasingFunction): (t: number) => number {
  switch (name) {
    case "linear":
      return easeLinear;
    case "ease-in":
      return easeInQuad;
    case "ease-out":
      return easeOutQuad;
    case "ease-in-out":
    case "cubic-bezier":
      return easeInOutCubic;
  }
}

// --- Cursor animation ---

export function interpolateCursorPath(
  keyframes: CursorKeyframe[],
  totalDurationMs: number,
  fps: number,
  smoothing: number
): Point[] {
  if (keyframes.length === 0) return [];
  if (keyframes.length === 1) {
    const frameCount = Math.ceil((totalDurationMs / 1000) * fps);
    return Array.from({ length: frameCount }, () => ({
      ...keyframes[0]!.position,
    }));
  }

  const frameCount = Math.ceil((totalDurationMs / 1000) * fps);
  const points: Point[] = [];
  const ease = easeInOutCubic;

  for (let frame = 0; frame < frameCount; frame++) {
    const t = frame / (frameCount - 1);
    const timeMs = t * totalDurationMs;

    // Find surrounding keyframes
    let kfIndex = 0;
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i + 1]!.timestamp >= timeMs) {
        kfIndex = i;
        break;
      }
      kfIndex = i;
    }

    const kf0 = keyframes[kfIndex]!;
    const kf1 = keyframes[Math.min(kfIndex + 1, keyframes.length - 1)]!;

    if (kf0.timestamp === kf1.timestamp) {
      points.push({ ...kf0.position });
      continue;
    }

    // Normalized progress between these two keyframes
    const segmentT = Math.max(
      0,
      Math.min(
        1,
        (timeMs - kf0.timestamp) / (kf1.timestamp - kf0.timestamp)
      )
    );
    const easedT = ease(segmentT);

    // Cubic bezier interpolation with control points for smooth curves
    const controlOffset = smoothing * 0.5;
    const dx = kf1.position.x - kf0.position.x;

    // Control points offset along the x-axis for natural curve
    const cp1: Point = {
      x: kf0.position.x + dx * controlOffset,
      y: kf0.position.y,
    };
    const cp2: Point = {
      x: kf1.position.x - dx * controlOffset,
      y: kf1.position.y,
    };

    // Cubic bezier formula
    const u = 1 - easedT;
    const x =
      u * u * u * kf0.position.x +
      3 * u * u * easedT * cp1.x +
      3 * u * easedT * easedT * cp2.x +
      easedT * easedT * easedT * kf1.position.x;
    const y =
      u * u * u * kf0.position.y +
      3 * u * u * easedT * cp1.y +
      3 * u * easedT * easedT * cp2.y +
      easedT * easedT * easedT * kf1.position.y;

    points.push({ x: Math.round(x), y: Math.round(y) });
  }

  return points;
}

// --- Zoom keyframe generation ---

export function generateZoomKeyframes(
  steps: RecordingStep[],
  cursorKeyframes: CursorKeyframe[],
  preset: StylePreset
): ZoomKeyframe[] {
  const zoomActions = new Set(["click", "type"]);
  const zooms: ZoomKeyframe[] = [];

  for (const step of steps) {
    if (!zoomActions.has(step.action)) continue;

    // Find matching cursor keyframe for position
    const cursorKf = cursorKeyframes.find(
      (kf) => Math.abs(kf.timestamp - step.timestamp) < 100
    );

    if (cursorKf) {
      zooms.push({
        center: cursorKf.position,
        scale: preset.zoomScale,
        timestamp: step.timestamp,
        durationMs: preset.zoomDurationMs,
      });
    }
  }

  return zooms;
}

// --- Frame-level zoom interpolation ---

export function getZoomAtTime(
  timeMs: number,
  zoomKeyframes: ZoomKeyframe[],
  easing: EasingFunction
): { center: Point; scale: number } {
  const ease = getEasing(easing);
  const defaultResult = { center: { x: 0, y: 0 }, scale: 1.0 };

  if (zoomKeyframes.length === 0) return defaultResult;

  // Find active zoom
  for (const zoom of zoomKeyframes) {
    const zoomStart = zoom.timestamp;
    const zoomPeak = zoomStart + zoom.durationMs * 0.3;
    const zoomEnd = zoomStart + zoom.durationMs;

    if (timeMs >= zoomStart && timeMs <= zoomEnd) {
      let progress: number;
      let scale: number;

      if (timeMs <= zoomPeak) {
        // Zooming in
        progress = (timeMs - zoomStart) / (zoomPeak - zoomStart);
        scale = 1.0 + (zoom.scale - 1.0) * ease(progress);
      } else {
        // Zooming out
        progress = (timeMs - zoomPeak) / (zoomEnd - zoomPeak);
        scale = zoom.scale - (zoom.scale - 1.0) * ease(progress);
      }

      return { center: zoom.center, scale };
    }
  }

  return defaultResult;
}

// --- Style presets ---

export const PRESETS: Record<string, StylePreset> = {
  default: {
    name: "Default",
    cursorSize: 24,
    cursorColor: "#000000",
    cursorTrailEnabled: true,
    zoomScale: 1.5,
    zoomDurationMs: 1200,
    zoomEasing: "ease-in-out",
    motionSmoothing: 0.7,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    shadowEnabled: true,
  },
  minimal: {
    name: "Minimal",
    cursorSize: 20,
    cursorColor: "#333333",
    cursorTrailEnabled: false,
    zoomScale: 1.3,
    zoomDurationMs: 800,
    zoomEasing: "ease-out",
    motionSmoothing: 0.5,
    backgroundColor: "#ffffff",
    borderRadius: 0,
    shadowEnabled: false,
  },
  dramatic: {
    name: "Dramatic",
    cursorSize: 28,
    cursorColor: "#000000",
    cursorTrailEnabled: true,
    zoomScale: 2.0,
    zoomDurationMs: 1600,
    zoomEasing: "cubic-bezier",
    motionSmoothing: 0.9,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    shadowEnabled: true,
  },
};

// --- FFmpeg command generation ---

export interface FFmpegCommand {
  executable: string;
  args: string[];
  description: string;
}

export function buildFFmpegCompositeCommand(
  inputVideoPath: string,
  cursorOverlayFilter: string,
  zoomFilter: string,
  outputPath: string,
  fps: number
): FFmpegCommand {
  const filters = [cursorOverlayFilter, zoomFilter]
    .filter((f) => f.length > 0)
    .join(",");

  const args = [
    "-i",
    inputVideoPath,
    "-vf",
    filters || "null",
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ];

  return {
    executable: "ffmpeg",
    args,
    description: `Composite video with cursor overlay and zoom effects -> ${outputPath}`,
  };
}

export function buildCursorOverlayFilter(
  points: Point[],
  preset: StylePreset
): string {
  if (points.length === 0) return "";

  // Generate a drawbox filter that moves with the cursor
  // This creates a simple cursor indicator at each frame
  const size = preset.cursorSize;
  const color = preset.cursorColor.replace("#", "0x") + "@0.8";

  // For a simple approach, use the first position as static
  // Full per-frame cursor requires a more complex filter graph
  const firstPoint = points[0]!;
  return `drawbox=x=${String(firstPoint.x - size / 2)}:y=${String(firstPoint.y - size / 2)}:w=${String(size)}:h=${String(size)}:color=${color}:t=fill`;
}

export function buildZoomPanFilter(
  zoomKeyframes: ZoomKeyframe[],
  width: number,
  height: number,
  fps: number
): string {
  if (zoomKeyframes.length === 0) return "";

  // Generate zoompan filter for smooth zoom effects
  // Default: no zoom (zoom=1, centered)
  return `zoompan=z='1':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${String(width)}x${String(height)}:fps=${String(fps)}`;
}

// --- Rendering metadata ---

export interface RenderManifest {
  sessionId: string;
  inputDir: string;
  outputDir: string;
  preset: string;
  resolution: { width: number; height: number };
  fps: number;
  cursorKeyframeCount: number;
  zoomKeyframeCount: number;
  totalSteps: number;
  estimatedDurationMs: number;
}

export function buildRenderManifest(
  options: VideoProcessorOptions,
  cursorKeyframes: CursorKeyframe[],
  zoomKeyframes: ZoomKeyframe[]
): RenderManifest {
  const firstStep = options.steps[0];
  const lastStep = options.steps[options.steps.length - 1];
  const estimatedDurationMs =
    firstStep && lastStep ? lastStep.timestamp - firstStep.timestamp + 2000 : 0;

  return {
    sessionId: new Date().toISOString().replace(/[:.]/g, "-"),
    inputDir: options.inputDir,
    outputDir: options.outputDir,
    preset: options.preset.name,
    resolution: { width: options.width, height: options.height },
    fps: options.fps,
    cursorKeyframeCount: cursorKeyframes.length,
    zoomKeyframeCount: zoomKeyframes.length,
    totalSteps: options.steps.length,
    estimatedDurationMs,
  };
}

export async function writeRenderManifest(
  outputDir: string,
  manifest: RenderManifest
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const manifestPath = join(outputDir, "render-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifestPath;
}

// --- Main processing pipeline ---

export async function prepareVideoProcessing(
  options: VideoProcessorOptions
): Promise<{
  cursorPath: Point[];
  zoomKeyframes: ZoomKeyframe[];
  manifest: RenderManifest;
  ffmpegCommand: FFmpegCommand;
}> {
  const { steps, preset, fps, width, height, inputDir, outputDir } = options;

  // Build cursor keyframes from recording steps
  const cursorKeyframes: CursorKeyframe[] =
    options.cursorPositions ??
    steps
      .filter((s) => s.target || s.url)
      .map((s, i) => ({
        position: {
          // Default positions spread across viewport if not provided
          x: Math.round(width * (0.2 + (0.6 * i) / Math.max(steps.length - 1, 1))),
          y: Math.round(height * 0.5),
        },
        timestamp: s.timestamp,
        action: s.action,
      }));

  // Calculate total duration
  const firstTs = steps[0]?.timestamp ?? 0;
  const lastTs = steps[steps.length - 1]?.timestamp ?? 0;
  const totalDurationMs = lastTs - firstTs + 2000;

  // Generate smooth cursor path
  const cursorPath = interpolateCursorPath(
    cursorKeyframes,
    totalDurationMs,
    fps,
    preset.motionSmoothing
  );

  // Generate zoom keyframes
  const zoomKeyframes = generateZoomKeyframes(steps, cursorKeyframes, preset);

  // Build render manifest
  const manifest = buildRenderManifest(options, cursorKeyframes, zoomKeyframes);

  // Find input video
  const inputFiles = await readdir(inputDir).catch(() => [] as string[]);
  const videoFile =
    inputFiles.find((f) => f.endsWith(".webm") || f.endsWith(".mp4")) ??
    "recording.webm";
  const inputVideoPath = join(inputDir, videoFile);
  const outputVideoPath = join(outputDir, "recording.mp4");

  // Build FFmpeg command
  const cursorFilter = buildCursorOverlayFilter(cursorPath, preset);
  const zoomFilter = buildZoomPanFilter(
    zoomKeyframes,
    width,
    height,
    fps
  );

  const ffmpegCommand = buildFFmpegCompositeCommand(
    inputVideoPath,
    cursorFilter,
    zoomFilter,
    outputVideoPath,
    fps
  );

  // Write manifest
  await writeRenderManifest(outputDir, manifest);

  return {
    cursorPath,
    zoomKeyframes,
    manifest,
    ffmpegCommand,
  };
}
