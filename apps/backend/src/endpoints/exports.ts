import { Hono } from "hono";

const exports_ = new Hono<{ Bindings: Env }>();

const STUB_EXPORTS = [
  {
    _id: "export_001",
    _creationTime: 1709282000000,
    runId: "run_001",
    editVersionId: undefined,
    format: "mp4",
    fps: 30,
    width: 1920,
    height: 1080,
    quality: "web",
    maxFileSizeMb: undefined,
    status: "completed",
    progress: 100,
    eta: undefined,
    outputUrl: null,
    fileSizeBytes: 4200000,
    error: undefined,
    createdAt: 1709282000000,
    completedAt: 1709282060000,
  },
];

// GET /api/runs/:runId/exports — list export jobs
exports_.get("/", (c) => {
  const runId = c.req.param("runId");
  const jobs = STUB_EXPORTS.filter((j) => j.runId === runId);
  return c.json(jobs);
});

// POST /api/runs/:runId/exports — create export job
exports_.post("/", async (c) => {
  const runId = c.req.param("runId");
  const body = await c.req.json();
  const id = `export_${crypto.randomUUID().slice(0, 8)}`;

  return c.json({
    _id: id,
    _creationTime: Date.now(),
    runId,
    editVersionId: body.editVersionId,
    format: body.format ?? "mp4",
    fps: body.fps ?? 30,
    width: body.width ?? 1920,
    height: body.height ?? 1080,
    quality: body.quality ?? "web",
    maxFileSizeMb: body.maxFileSizeMb,
    status: "queued",
    progress: 0,
    eta: undefined,
    outputUrl: null,
    fileSizeBytes: undefined,
    error: undefined,
    createdAt: Date.now(),
    completedAt: undefined,
  });
});

// PATCH /api/exports/:exportId/progress — update export progress (pipeline use)
exports_.patch("/:exportId/progress", async (c) => {
  const { exportId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    exportId,
    progress: body.progress,
    status: body.status,
    eta: body.eta,
  });
});

// POST /api/exports/:exportId/complete — mark export complete
exports_.post("/:exportId/complete", async (c) => {
  const { exportId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    exportId,
    status: "completed",
    outputStorageId: body.outputStorageId,
    fileSizeBytes: body.fileSizeBytes,
    completedAt: Date.now(),
  });
});

// POST /api/exports/:exportId/fail — mark export failed
exports_.post("/:exportId/fail", async (c) => {
  const { exportId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    exportId,
    status: "failed",
    error: body.error,
  });
});

export { exports_ };
