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
    pr_number?: number;
    commit_sha?: string;
  }>();

  console.log(
    `[webhook/pr] user=${user.githubLogin} repo=${body.repository_id} branch=${body.branch} pr=${body.pr_number ?? "none"} sha=${body.commit_sha ?? "none"}`,
  );

  return c.json({
    success: true,
    message: "PR webhook received",
    user: user.githubLogin,
    repository_id: body.repository_id,
    branch: body.branch,
  });
});
