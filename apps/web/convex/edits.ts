import type { Value } from "convex/values";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const editOperationValidator = v.union(
  v.object({
    type: v.literal("crop"),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
  }),
  v.object({
    type: v.literal("trim"),
    startMs: v.number(),
    endMs: v.number(),
  }),
  v.object({
    type: v.literal("split"),
    atMs: v.number(),
    removeSegment: v.union(v.literal("before"), v.literal("after")),
  }),
  v.object({
    type: v.literal("zoom"),
    intensity: v.number(),
    centerX: v.number(),
    centerY: v.number(),
    startMs: v.number(),
    durationMs: v.number(),
  }),
  v.object({
    type: v.literal("cursor_emphasis"),
    trailLength: v.number(),
    size: v.number(),
    smoothing: v.number(),
  }),
  v.object({
    type: v.literal("style_preset"),
    preset: v.union(
      v.literal("default"),
      v.literal("minimal"),
      v.literal("dramatic"),
    ),
    overrides: v.optional(
      v.object({
        zoomScale: v.optional(v.number()),
        cornerRadius: v.optional(v.number()),
        motionSmoothing: v.optional(v.number()),
      }),
    ),
  }),
);

export const listVersions = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("editVersions")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("desc")
      .collect();

    return Promise.all(
      versions.map(async (ver) => {
        const videoUrl = ver.videoStorageId
          ? await ctx.storage.getUrl(ver.videoStorageId as string)
          : null;
        return { ...ver, videoUrl };
      }),
    );
  },
});

export const getVersion = query({
  args: { id: v.id("editVersions") },
  handler: async (ctx, args) => {
    const ver = await ctx.db.get(args.id);
    if (!ver) return null;

    const videoUrl = ver.videoStorageId
      ? await ctx.storage.getUrl(ver.videoStorageId as string)
      : null;
    return { ...ver, videoUrl };
  },
});

export const applyEdit = mutation({
  args: {
    runId: v.id("runs"),
    parentVersionId: v.optional(v.id("editVersions")),
    operation: editOperationValidator,
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");

    const existingVersions = await ctx.db
      .query("editVersions")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    const versionNumber = existingVersions.length + 1;

    const parentId = args.parentVersionId ?? null;
    const parentOps: Value[] = [];
    if (parentId) {
      const parent = await ctx.db.get(parentId);
      if (parent) {
        const ops = parent.operations as Value[];
        parentOps.push(...(ops ?? []));
      }
    }

    const allOperations: Value[] = [...parentOps, args.operation as Value];

    return ctx.db.insert("editVersions", {
      runId: args.runId,
      version: versionNumber,
      parentVersionId: parentId,
      operations: allOperations,
      status: "pending" as const,
      createdAt: Date.now(),
    });
  },
});

export const revert = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return ctx.db.insert("editVersions", {
      runId: args.runId,
      version: 0,
      parentVersionId: null,
      operations: [],
      status: "completed" as const,
      createdAt: Date.now(),
    });
  },
});

export const updateVersionStatus = mutation({
  args: {
    id: v.id("editVersions"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    videoStorageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, status, videoStorageId, error } = args;
    await ctx.db.patch(id, {
      status,
      ...(videoStorageId ? { videoStorageId } : {}),
      ...(error ? { error } : {}),
    });
  },
});
