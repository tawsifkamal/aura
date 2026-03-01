import { Hono } from "hono";
import type { ConvexClient } from "../convex";

const edits = new Hono<{ Bindings: Env; Variables: { convex: ConvexClient } }>();

// GET /api/runs/:runId/edits — list edit versions
edits.get("/", async (c) => {
  const convex = c.get("convex");
  const runId = c.req.param("runId");

  const versions = await convex.query("edits:listVersions", { runId });
  return c.json(versions);
});

// POST /api/runs/:runId/edits — apply edit
edits.post("/", async (c) => {
  const convex = c.get("convex");
  const runId = c.req.param("runId");
  const body = await c.req.json();

  const versionId = await convex.mutation<string>("edits:applyEdit", {
    runId,
    parentVersionId: body.parentVersionId,
    operation: body.operation,
  });

  // Fetch the full created version to return
  const version = await convex.query("edits:getVersion", { id: versionId });
  return c.json(version);
});

// POST /api/runs/:runId/edits/revert — revert to original
edits.post("/revert", async (c) => {
  const convex = c.get("convex");
  const runId = c.req.param("runId");

  const versionId = await convex.mutation<string>("edits:revert", { runId });

  const version = await convex.query("edits:getVersion", { id: versionId });
  return c.json(version);
});

// PATCH /api/edits/:editId/status — update edit version status (pipeline use)
edits.patch("/:editId/status", async (c) => {
  const convex = c.get("convex");
  const { editId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("edits:updateVersionStatus", {
    id: editId,
    status: body.status,
    videoStorageId: body.videoStorageId,
    error: body.error,
  });

  return c.json({
    success: true,
    editId,
    status: body.status,
  });
});

export { edits };
