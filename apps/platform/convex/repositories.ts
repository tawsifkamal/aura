import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// List all repositories for a user
export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// List repositories by status for a user
export const listByUserAndStatus = query({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("available"),
      v.literal("added"),
      v.literal("synced"),
    ),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return all.filter((r) => r.status === args.status);
  },
});

// Upsert repositories from GitHub (called during OAuth)
// Inserts new repos as "available", preserves status of existing ones
export const upsertFromGitHub = mutation({
  args: {
    userId: v.id("users"),
    repos: v.array(
      v.object({
        githubRepoId: v.number(),
        fullName: v.string(),
        name: v.string(),
        owner: v.string(),
        isPrivate: v.boolean(),
        htmlUrl: v.string(),
        defaultBranch: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Get existing repos for this user
    const existing = await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const existingByGithubId = new Map(
      existing.map((r) => [r.githubRepoId, r]),
    );

    for (const repo of args.repos) {
      const ex = existingByGithubId.get(repo.githubRepoId);
      if (ex) {
        // Update metadata but preserve status
        await ctx.db.patch(ex._id, {
          fullName: repo.fullName,
          name: repo.name,
          owner: repo.owner,
          isPrivate: repo.isPrivate,
          htmlUrl: repo.htmlUrl,
          defaultBranch: repo.defaultBranch,
        });
      } else {
        // New repo — insert as "available"
        await ctx.db.insert("repositories", {
          userId: args.userId,
          githubRepoId: repo.githubRepoId,
          fullName: repo.fullName,
          name: repo.name,
          owner: repo.owner,
          isPrivate: repo.isPrivate,
          htmlUrl: repo.htmlUrl,
          defaultBranch: repo.defaultBranch,
          status: "available",
        });
      }
    }
  },
});

// Update repository status (add, sync, etc.)
export const updateStatus = mutation({
  args: {
    id: v.id("repositories"),
    status: v.union(
      v.literal("available"),
      v.literal("added"),
      v.literal("synced"),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "added" || args.status === "synced") {
      patch.addedAt = now;
    }
    if (args.status === "synced") {
      patch.lastSyncedAt = now;
    }
    await ctx.db.patch(args.id, patch);
  },
});

// Get a single repository
export const get = query({
  args: { id: v.id("repositories") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

// Remove a repository (when user disables it)
export const remove = mutation({
  args: { id: v.id("repositories") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
