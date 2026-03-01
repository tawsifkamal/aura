import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const upsert = mutation({
  args: {
    githubUserId: v.number(),
    githubLogin: v.string(),
    accessToken: v.string(),
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        githubLogin: args.githubLogin,
        accessToken: args.accessToken,
        scopes: args.scopes,
        repositories: args.repositories,
        connectedAt: args.connectedAt,
      });
      return existing._id;
    }

    return ctx.db.insert("users", args);
  },
});

export const getByGithubId = query({
  args: { githubUserId: v.number() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
  },
});
