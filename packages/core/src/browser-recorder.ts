import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InferredRoute } from "./route-inferrer.js";

export interface RecordingStep {
  timestamp: number;
  action: "navigate" | "click" | "type" | "screenshot" | "wait";
  target?: string;
  value?: string;
  screenshotPath?: string;
  url?: string;
}

export interface RecordingSession {
  id: string;
  startedAt: number;
  completedAt?: number;
  baseUrl: string;
  outputDir: string;
  steps: RecordingStep[];
  videoPath?: string;
  summaryPath?: string;
  routes: InferredRoute[];
  traceId?: string;
}

export interface BrowserRecorderOptions {
  baseUrl: string;
  outputDir?: string;
  routes: InferredRoute[];
  headless?: boolean;
  viewport?: { width: number; height: number };
  tracing?: {
    laminarEndpoint?: string;
    enabled: boolean;
  };
  memory?: {
    supermemoryEndpoint?: string;
    enabled: boolean;
  };
}

function generateSessionId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function defaultOutputDir(): string {
  return join(process.cwd(), "demos", generateSessionId());
}

export async function createOutputDir(dir: string): Promise<{
  rootDir: string;
  screenshotsDir: string;
}> {
  const screenshotsDir = join(dir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  return { rootDir: dir, screenshotsDir };
}

export function createSession(
  options: BrowserRecorderOptions
): RecordingSession {
  const id = generateSessionId();
  const outputDir = options.outputDir ?? defaultOutputDir();

  return {
    id,
    startedAt: Date.now(),
    baseUrl: options.baseUrl,
    outputDir,
    steps: [],
    routes: options.routes,
  };
}

export function addStep(
  session: RecordingSession,
  step: Omit<RecordingStep, "timestamp">
): RecordingStep {
  const fullStep: RecordingStep = {
    ...step,
    timestamp: Date.now(),
  };
  session.steps.push(fullStep);
  return fullStep;
}

export function buildNavigationScript(
  routes: InferredRoute[],
  baseUrl: string
): string[] {
  return routes.map((route) => {
    try {
      return new URL(route.route, baseUrl).toString();
    } catch {
      return `${baseUrl}${route.route}`;
    }
  });
}

export async function writeSummary(
  session: RecordingSession,
  diffSummary: string
): Promise<string> {
  const summaryPath = join(session.outputDir, "summary.md");

  const routeList = session.routes
    .map(
      (r) =>
        `- \`${r.route}\` (${r.confidence} confidence — ${r.reason})`
    )
    .join("\n");

  const stepLog = session.steps
    .map((s, i) => {
      const time = new Date(s.timestamp).toISOString();
      const detail = s.target ?? s.url ?? s.value ?? "";
      return `${String(i + 1)}. **${s.action}** ${detail} _(${time})_`;
    })
    .join("\n");

  const duration = session.completedAt
    ? `${String(Math.round((session.completedAt - session.startedAt) / 1000))}s`
    : "in progress";

  const content = `# Demo Recording Summary

## Session
- **ID**: ${session.id}
- **Started**: ${new Date(session.startedAt).toISOString()}
- **Duration**: ${duration}
- **Base URL**: ${session.baseUrl}

## Routes Visited
${routeList}

## Steps Recorded
${stepLog}

## Changes Tested
${diffSummary}

## Output
- Video: ${session.videoPath ?? "pending post-processing"}
- Screenshots: ${String(session.steps.filter((s) => s.screenshotPath).length)} captured
`;

  await writeFile(summaryPath, content, "utf-8");
  session.summaryPath = summaryPath;
  return summaryPath;
}

export function completeSession(session: RecordingSession): RecordingSession {
  session.completedAt = Date.now();
  return session;
}

export interface LaminarTraceConfig {
  endpoint: string;
  apiKey?: string;
  projectId?: string;
}

export interface SupermemoryConfig {
  endpoint: string;
  apiKey?: string;
}

export function buildLaminarMetadata(
  session: RecordingSession,
  config: LaminarTraceConfig
): Record<string, string> {
  return {
    "laminar.endpoint": config.endpoint,
    "laminar.project": config.projectId ?? "aura",
    "session.id": session.id,
    "session.baseUrl": session.baseUrl,
    "session.routes": session.routes.map((r) => r.route).join(","),
  };
}

export function buildSupermemoryQuery(
  session: RecordingSession
): Record<string, string> {
  return {
    routes: session.routes.map((r) => r.route).join(","),
    baseUrl: session.baseUrl,
    sessionId: session.id,
  };
}
