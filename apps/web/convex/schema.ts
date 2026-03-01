import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  runs: defineTable({
    timestamp: v.number(),
    branch: v.optional(v.string()),
    pr: v.optional(v.number()),
    commitSha: v.optional(v.string()),
    summary: v.string(),
    videoStorageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("uploading"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    source: v.union(v.literal("skill"), v.literal("pr")),
    screenshotStorageIds: v.optional(v.array(v.id("_storage"))),
    routesTested: v.optional(v.array(v.string())),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
    traceId: v.optional(v.string()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_status", ["status"])
    .index("by_branch", ["branch"]),
});
