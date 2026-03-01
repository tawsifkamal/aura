import { Hono } from "hono";

const edits = new Hono<{ Bindings: Env }>();

const STUB_VERSIONS = [
  {
    _id: "edit_001",
    runId: "run_001",
    version: 1,
    parentVersionId: null,
    operations: [{ type: "trim", startMs: 1000, endMs: 15000 }],
    status: "completed",
    videoUrl: null,
    error: undefined,
    createdAt: 1709281000000,
  },
];

// GET /api/runs/:runId/edits — list edit versions
edits.get("/", (c) => {
  const runId = c.req.param("runId");
  const versions = STUB_VERSIONS.filter((v) => v.runId === runId);
  return c.json(versions);
});

// POST /api/runs/:runId/edits — apply edit
edits.post("/", async (c) => {
  const runId = c.req.param("runId");
  const body = await c.req.json();
  const id = `edit_${crypto.randomUUID().slice(0, 8)}`;

  return c.json({
    _id: id,
    runId,
    version: (STUB_VERSIONS.length + 1),
    parentVersionId: body.parentVersionId ?? null,
    operations: [body.operation],
    status: "pending",
    videoUrl: null,
    error: undefined,
    createdAt: Date.now(),
  });
});

// POST /api/runs/:runId/edits/revert — revert to original
edits.post("/revert", async (c) => {
  const runId = c.req.param("runId");
  const id = `edit_${crypto.randomUUID().slice(0, 8)}`;

  return c.json({
    _id: id,
    runId,
    version: 0,
    parentVersionId: null,
    operations: [],
    status: "completed",
    videoUrl: null,
    error: undefined,
    createdAt: Date.now(),
  });
});

// PATCH /api/edits/:editId/status — update edit version status (pipeline use)
edits.patch("/:editId/status", async (c) => {
  const { editId } = c.req.param();
  const body = await c.req.json();

  return c.json({
    success: true,
    editId,
    status: body.status,
    videoStorageId: body.videoStorageId,
    error: body.error,
  });
});

export { edits };
