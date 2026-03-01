import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./auth";

export const create = mutation({
  args: {
    runId: v.id("runs"),
    editVersionId: v.optional(v.id("editVersions")),
    format: v.union(v.literal("mp4"), v.literal("gif")),
    fps: v.number(),
    width: v.number(),
    height: v.number(),
    quality: v.union(
      v.literal("web"),
      v.literal("high"),
      v.literal("preview"),
    ),
    maxFileSizeMb: v.optional(v.number()),
    adminSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    return ctx.db.insert("exportJobs", {
      ...args,
      status: "queued" as const,
      progress: 0,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { runId: v.id("runs"), adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const jobs = await ctx.db
      .query("exportJobs")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("desc")
      .collect();

    return Promise.all(
      jobs.map(async (job) => {
        const outputUrl = job.outputStorageId
          ? await ctx.storage.getUrl(job.outputStorageId as string)
          : null;
        return { ...job, outputUrl };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("exportJobs"), adminSecret: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const job = await ctx.db.get(args.id);
    if (!job) return null;

    const outputUrl = job.outputStorageId
      ? await ctx.storage.getUrl(job.outputStorageId as string)
      : null;
    return { ...job, outputUrl };
  },
});

export const updateProgress = mutation({
  args: {
    id: v.id("exportJobs"),
    progress: v.number(),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    eta: v.optional(v.string()),
    adminSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const complete = mutation({
  args: {
    id: v.id("exportJobs"),
    outputStorageId: v.id("_storage"),
    fileSizeBytes: v.number(),
    adminSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    await ctx.db.patch(args.id, {
      status: "completed" as const,
      progress: 100,
      outputStorageId: args.outputStorageId,
      fileSizeBytes: args.fileSizeBytes,
      completedAt: Date.now(),
    });
  },
});

export const fail = mutation({
  args: {
    id: v.id("exportJobs"),
    error: v.string(),
    adminSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    await ctx.db.patch(args.id, {
      status: "failed" as const,
      error: args.error,
    });
  },
});
