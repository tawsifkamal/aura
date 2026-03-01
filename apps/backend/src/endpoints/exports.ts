import { Hono } from "hono";
import type { ConvexClient } from "../convex";

const exports_ = new Hono<{ Bindings: Env; Variables: { convex: ConvexClient } }>();

// GET /api/runs/:runId/exports — list export jobs
exports_.get("/", async (c) => {
  const convex = c.get("convex");
  const runId = c.req.param("runId");

  const jobs = await convex.query("exports:list", { runId });
  return c.json(jobs);
});

// POST /api/runs/:runId/exports — create export job
exports_.post("/", async (c) => {
  const convex = c.get("convex");
  const runId = c.req.param("runId");
  const body = await c.req.json();

  const jobId = await convex.mutation<string>("exports:create", {
    runId,
    editVersionId: body.editVersionId,
    format: body.format ?? "mp4",
    fps: body.fps ?? 30,
    width: body.width ?? 1920,
    height: body.height ?? 1080,
    quality: body.quality ?? "web",
    maxFileSizeMb: body.maxFileSizeMb,
  });

  // Fetch the full created job to return
  const job = await convex.query("exports:get", { id: jobId });
  return c.json(job);
});

// PATCH /api/exports/:exportId/progress — update export progress (pipeline use)
exports_.patch("/:exportId/progress", async (c) => {
  const convex = c.get("convex");
  const { exportId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("exports:updateProgress", {
    id: exportId,
    progress: body.progress,
    status: body.status,
    eta: body.eta,
  });

  return c.json({
    success: true,
    exportId,
    progress: body.progress,
    status: body.status,
  });
});

// POST /api/exports/:exportId/complete — mark export complete
exports_.post("/:exportId/complete", async (c) => {
  const convex = c.get("convex");
  const { exportId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("exports:complete", {
    id: exportId,
    outputStorageId: body.outputStorageId,
    fileSizeBytes: body.fileSizeBytes,
  });

  return c.json({
    success: true,
    exportId,
    status: "completed",
  });
});

// POST /api/exports/:exportId/fail — mark export failed
exports_.post("/:exportId/fail", async (c) => {
  const convex = c.get("convex");
  const { exportId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("exports:fail", {
    id: exportId,
    error: body.error,
  });

  return c.json({
    success: true,
    exportId,
    status: "failed",
  });
});

export { exports_ };
