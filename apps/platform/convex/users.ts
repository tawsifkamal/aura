import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./auth";

export const upsert = mutation({
  args: {
    adminSecret: v.string(),
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
  },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
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
        refreshToken: args.refreshToken,
        ...(args.apiKey ? { apiKey: args.apiKey } : {}),
        scopes: args.scopes,
        repositories: args.repositories,
        connectedAt: args.connectedAt,
      });
      return existing._id;
    }

    const { adminSecret, ...data } = args;
    return ctx.db.insert("users", data);
  },
});

export const getByApiKey = query({
  args: { adminSecret: v.string(), apiKey: v.string() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    return ctx.db
      .query("users")
      .withIndex("by_api_key", (q) => q.eq("apiKey", args.apiKey))
      .unique();
  },
});

export const getByGithubId = query({
  args: { adminSecret: v.string(), githubUserId: v.number() },
  handler: async (ctx, args) => {
    requireAdmin(args.adminSecret);
    return ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
  },
});
