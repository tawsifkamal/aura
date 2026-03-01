import type { RegisteredMutation } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("uploading"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let runsQuery;
    if (args.status) {
      runsQuery = ctx.db
        .query("runs")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    } else {
      runsQuery = ctx.db
        .query("runs")
        .withIndex("by_timestamp")
        .order("desc")
        .take(limit);
    }

    const runs = await runsQuery;

    return Promise.all(
      runs.map(async (run) => {
        const storageId = run.videoStorageId as string | undefined;
        const videoUrl = storageId
          ? await ctx.storage.getUrl(storageId)
          : null;
        return { ...run, videoUrl };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) return null;

    const storageId = run.videoStorageId as string | undefined;
    const videoUrl = storageId
      ? await ctx.storage.getUrl(storageId)
      : null;

    const screenshotUrls: string[] = [];
    const sids = run.screenshotStorageIds as string[] | undefined;
    if (sids) {
      for (const sid of sids) {
        const url = await ctx.storage.getUrl(sid);
        if (url) screenshotUrls.push(url);
      }
    }

    return { ...run, videoUrl, screenshotUrls };
  },
});

export const create = mutation({
  args: {
    timestamp: v.number(),
    branch: v.optional(v.string()),
    pr: v.optional(v.number()),
    commitSha: v.optional(v.string()),
    summary: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("uploading"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    source: v.union(v.literal("skill"), v.literal("pr")),
    routesTested: v.optional(v.array(v.string())),
    traceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("runs", args);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("runs"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("uploading"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const attachVideo = mutation({
  args: {
    id: v.id("runs"),
    videoStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      videoStorageId: args.videoStorageId,
      status: "completed" as const,
    });
  },
});

export const attachScreenshots = mutation({
  args: {
    id: v.id("runs"),
    screenshotStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      screenshotStorageIds: args.screenshotStorageIds,
    });
  },
});

export const updateAnnotations = mutation({
  args: {
    id: v.id("runs"),
    annotations: v.array(
      v.object({
        task: v.string(),
        path: v.string(),
        startMs: v.number(),
        endMs: v.number(),
        x: v.number(),
        y: v.number(),
      }),
    ),
    subtitlesVtt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      annotationSections: args.annotations,
      subtitlesVtt: args.subtitlesVtt,
    });
  },
});

export const generateUploadUrl: RegisteredMutation<
  "public",
  Record<string, never>,
  Promise<string>
> = mutation({
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return ctx.storage.getUrl(args.storageId);
  },
});
