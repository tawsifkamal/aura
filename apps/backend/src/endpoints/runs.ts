import { Hono } from "hono";
import type { ConvexClient } from "../convex";

const runs = new Hono<{ Bindings: Env; Variables: { convex: ConvexClient } }>();

// GET /api/runs — list runs
runs.get("/", async (c) => {
  const convex = c.get("convex");
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status") || undefined;
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 50;

  const result = await convex.query("runs:list", { status, limit });
  return c.json(result);
});

// GET /api/runs/:runId — get single run
runs.get("/:runId", async (c) => {
  const convex = c.get("convex");
  const { runId } = c.req.param();

  const run = await convex.query("runs:get", { id: runId });
  if (!run) {
    return c.json({ error: "Run not found" }, { status: 404 });
  }

  return c.json(run);
});

// POST /api/runs — create run
runs.post("/", async (c) => {
  const convex = c.get("convex");
  const body = await c.req.json();

  const runId = await convex.mutation<string>("runs:create", {
    timestamp: body.timestamp ?? Date.now(),
    branch: body.branch,
    pr: body.pr,
    commitSha: body.commitSha,
    summary: body.summary ?? "",
    status: body.status ?? "queued",
    source: body.source ?? "skill",
    routesTested: body.routesTested,
    traceId: body.traceId,
  });

  // Fetch the full created run to return
  const run = await convex.query("runs:get", { id: runId });
  return c.json(run);
});

// PATCH /api/runs/:runId/status — update run status
runs.patch("/:runId/status", async (c) => {
  const convex = c.get("convex");
  const { runId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("runs:updateStatus", {
    id: runId,
    status: body.status,
    error: body.error,
    durationMs: body.durationMs,
  });

  return c.json({ success: true, runId, status: body.status });
});

// POST /api/runs/:runId/video — attach video
runs.post("/:runId/video", async (c) => {
  const convex = c.get("convex");
  const { runId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("runs:attachVideo", {
    id: runId,
    videoStorageId: body.videoStorageId,
  });

  return c.json({ success: true, runId, videoStorageId: body.videoStorageId });
});

// POST /api/runs/:runId/screenshots — attach screenshots
runs.post("/:runId/screenshots", async (c) => {
  const convex = c.get("convex");
  const { runId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("runs:attachScreenshots", {
    id: runId,
    screenshotStorageIds: body.screenshotStorageIds ?? [],
  });

  return c.json({
    success: true,
    runId,
    screenshotStorageIds: body.screenshotStorageIds ?? [],
  });
});

// POST /api/runs/:runId/annotations — update annotations
runs.post("/:runId/annotations", async (c) => {
  const convex = c.get("convex");
  const { runId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("runs:updateAnnotations", {
    id: runId,
    annotations: body.annotations ?? [],
    subtitlesVtt: body.subtitlesVtt ?? "",
  });

  return c.json({
    success: true,
    runId,
    annotations: body.annotations ?? [],
    subtitlesVtt: body.subtitlesVtt ?? "",
  });
});

export { runs };
