import { Hono } from "hono";
import type { ConvexClient } from "../convex";

export const webhooks = new Hono<{
  Bindings: Env;
  Variables: { convex: ConvexClient };
}>();

// POST /pr — called by GitHub Actions when a PR is opened/updated
webhooks.post("/pr", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const apiKey = authHeader.slice(7); // strip "Bearer "

  const convex: ConvexClient = c.get("convex");

  // Validate the API key against Convex
  const user = await convex.query<{ _id: string; githubLogin: string } | null>(
    "users:getByApiKey",
    { apiKey },
  );

  if (!user) {
    return c.json({ error: "Invalid API key" }, { status: 403 });
  }

  const body = await c.req.json<{
    repository_id: number;
    branch: string;
    base_branch?: string;
    pr_number?: number;
    commit_sha?: string;
  }>();

  // Verify the user has this repository enabled
  const repo = await convex.query<{
    _id: string;
    status: string;
    defaultBranch: string;
  } | null>(
    "repositories:getByUserAndGithubId",
    { userId: user._id, githubRepoId: body.repository_id },
  );

  if (!repo || (repo.status !== "added" && repo.status !== "synced")) {
    return c.json(
      { error: "Repository not enabled for this API key" },
      { status: 403 },
    );
  }

  // Only process PRs targeting the default branch
  if (body.base_branch && body.base_branch !== repo.defaultBranch) {
    return c.json({
      success: true,
      message: "Skipped — PR does not target the default branch",
      base_branch: body.base_branch,
      default_branch: repo.defaultBranch,
    });
  }

  console.log(
    `[webhook/pr] user=${user.githubLogin} repo=${body.repository_id} branch=${body.branch} base=${body.base_branch ?? repo.defaultBranch} pr=${body.pr_number ?? "none"} sha=${body.commit_sha ?? "none"}`,
  );

  return c.json({
    success: true,
    message: "PR webhook received",
    user: user.githubLogin,
    repository_id: body.repository_id,
    branch: body.branch,
  });
});
