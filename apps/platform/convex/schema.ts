import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    githubUserId: v.number(),
    githubLogin: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    scopes: v.string(),
    repositories: v.array(
      v.object({
        id: v.number(),
        fullName: v.string(),
        name: v.string(),
        owner: v.string(),
        isPrivate: v.boolean(),
        htmlUrl: v.string(),
        defaultBranch: v.string(),
      }),
    ),
    connectedAt: v.string(),
  })
    .index("by_github_user_id", ["githubUserId"])
    .index("by_api_key", ["apiKey"]),

  repositories: defineTable({
    userId: v.id("users"),
    githubRepoId: v.number(),
    fullName: v.string(),
    name: v.string(),
    owner: v.string(),
    isPrivate: v.boolean(),
    htmlUrl: v.string(),
    defaultBranch: v.string(),
    status: v.union(
      v.literal("available"),
      v.literal("added"),
      v.literal("synced"),
    ),
    addedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    setupStatus: v.optional(
      v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    ),
    setupPrUrl: v.optional(v.string()),
    setupPrNumber: v.optional(v.number()),
    setupError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_github_id", ["userId", "githubRepoId"])
    .index("by_status", ["status"]),

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
    annotationSections: v.optional(
      v.array(
        v.object({
          task: v.string(),
          path: v.string(),
          startMs: v.number(),
          endMs: v.number(),
          x: v.number(),
          y: v.number(),
        }),
      ),
    ),
    subtitlesVtt: v.optional(v.string()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_status", ["status"])
    .index("by_branch", ["branch"]),

  editVersions: defineTable({
    runId: v.id("runs"),
    version: v.number(),
    parentVersionId: v.union(v.id("editVersions"), v.null()),
    operations: v.array(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    videoStorageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_status", ["status"]),

  exportJobs: defineTable({
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
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    progress: v.number(),
    eta: v.optional(v.string()),
    outputStorageId: v.optional(v.id("_storage")),
    fileSizeBytes: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_status", ["status"]),
});
