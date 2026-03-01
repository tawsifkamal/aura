import { Hono } from "hono";

const runs = new Hono<{ Bindings: Env }>();

// Stub data
const STUB_RUNS = [
  {
    _id: "run_001",
    _creationTime: 1709280000000,
    timestamp: 1709280000000,
    branch: "feat/login-page",
    pr: 42,
    commitSha: "a1b2c3d4e5f6789012345678901234567890abcd",
    summary: "Recorded login page interactions: form submission, validation errors, successful auth redirect",
    videoUrl: null,
    status: "completed" as const,
    source: "pr" as const,
    screenshotStorageIds: [],
    routesTested: ["/login", "/dashboard"],
    durationMs: 18500,
    error: undefined,
    traceId: "trace_abc123",
  },
  {
    _id: "run_002",
    _creationTime: 1709270000000,
    timestamp: 1709270000000,
    branch: "main",
    commitSha: "b2c3d4e5f67890123456789012345678901abcde",
    summary: "Recorded homepage hero section and navigation menu interactions",
    videoUrl: null,
    status: "completed" as const,
    source: "skill" as const,
    screenshotStorageIds: [],
    routesTested: ["/", "/about"],
    durationMs: 12300,
    error: undefined,
    traceId: undefined,
  },
  {
    _id: "run_003",
    _creationTime: 1709260000000,
    timestamp: 1709260000000,
    branch: "fix/signup-validation",
    pr: 38,
    commitSha: "c3d4e5f678901234567890123456789012abcdef",
    summary: "Recording failed — dev server did not start within timeout",
    videoUrl: null,
    status: "failed" as const,
    source: "pr" as const,
    screenshotStorageIds: [],
    routesTested: [],
    durationMs: undefined,
    error: "Dev server failed to start: port 3000 not responding after 60s",
    traceId: "trace_def456",
  },
];

// GET /api/runs — list runs
runs.get("/", (c) => {
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status");
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 50;

  let filtered = STUB_RUNS;
  if (status) {
    filtered = filtered.filter((r) => r.status === status);
  }

  return c.json(filtered.slice(0, limit));
});

// GET /api/runs/:runId — get single run
runs.get("/:runId", (c) => {
  const { runId } = c.req.param();
  const run = STUB_RUNS.find((r) => r._id === runId);

  if (!run) {
    return c.json({ error: "Run not found" }, { status: 404 });
  }

  return c.json({
    ...run,
    screenshotUrls: [],
  });
});

// POST /api/runs — create run
runs.post("/", async (c) => {
  const body = await c.req.json();
  const id = `run_${crypto.randomUUID().slice(0, 8)}`;

  return c.json({
    _id: id,
    _creationTime: Date.now(),
    timestamp: body.timestamp ?? Date.now(),
    branch: body.branch,
    pr: body.pr,
    commitSha: body.commitSha,
    summary: body.summary ?? "",
    videoUrl: null,
    status: body.status ?? "queued",
    source: body.source ?? "skill",
    screenshotStorageIds: [],
    routesTested: body.routesTested ?? [],
    durationMs: undefined,
    error: undefined,
    traceId: body.traceId,
  });
});

// PATCH /api/runs/:runId/status — update run status
runs.patch("/:runId/status", async (c) => {
  const { runId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    runId,
    status: body.status,
    durationMs: body.durationMs,
    error: body.error,
  });
});

// POST /api/runs/:runId/video — attach video
runs.post("/:runId/video", async (c) => {
  const { runId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    runId,
    videoStorageId: body.videoStorageId,
  });
});

// POST /api/runs/:runId/screenshots — attach screenshots
runs.post("/:runId/screenshots", async (c) => {
  const { runId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    runId,
    screenshotStorageIds: body.screenshotStorageIds ?? [],
  });
});

// POST /api/runs/:runId/annotations — update annotations
runs.post("/:runId/annotations", async (c) => {
  const { runId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    runId,
    annotations: body.annotations ?? [],
    subtitlesVtt: body.subtitlesVtt ?? "",
  });
});

export { runs };
