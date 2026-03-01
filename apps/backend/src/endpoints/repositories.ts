import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession } from "../cookie";
import type { ConvexClient } from "../convex";

interface SessionPayload {
  github_user_id: number;
  github_login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  access_token: string;
  scopes: string;
  connected_at: string;
}

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  html_url: string;
  default_branch: string;
  description: string | null;
  language: string | null;
  updated_at: string;
}

export const repositories = new Hono<{
  Bindings: Env;
  Variables: { convex: ConvexClient };
}>();

async function getSession(c: any): Promise<SessionPayload | null> {
  const raw = getCookie(c, "aura_session");
  if (!raw) return null;
  return verifySession<SessionPayload>(c.env.COOKIE_SECRET, raw);
}

async function getUserId(c: any, session: SessionPayload): Promise<string | null> {
  const convex: ConvexClient = c.get("convex");
  const user = await convex.query<{ _id: string } | null>(
    "users:getByGithubId",
    { githubUserId: session.github_user_id },
  );
  return user?._id ?? null;
}

// GET / — list repos from GitHub API, with optional ?q= search
repositories.get("/", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ error: "Not authenticated" }, { status: 401 });
  }

  const q = c.req.query("q")?.toLowerCase();

  // Fetch repos from GitHub directly
  const ghRes = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&type=all",
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "aura-backend",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!ghRes.ok) {
    const body = await ghRes.text();
    return c.json(
      { error: "Failed to fetch repositories from GitHub", detail: body },
      { status: 502 },
    );
  }

  let repos = (await ghRes.json()) as GitHubRepo[];

  // Filter by search query if provided
  if (q) {
    repos = repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)),
    );
  }

  // Get the user's enabled repos from Convex to annotate the list
  const userId = await getUserId(c, session);
  let enabledGithubIds = new Set<number>();
  if (userId) {
    const convex: ConvexClient = c.get("convex");
    const enabled = await convex.query<Array<{ githubRepoId: number; status: string }>>(
      "repositories:listByUser",
      { userId },
    );
    enabledGithubIds = new Set(
      enabled
        .filter((r) => r.status === "added" || r.status === "synced")
        .map((r) => r.githubRepoId),
    );
  }

  return c.json(
    repos.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: r.owner.login,
      private: r.private,
      html_url: r.html_url,
      default_branch: r.default_branch,
      description: r.description,
      language: r.language,
      updated_at: r.updated_at,
      enabled: enabledGithubIds.has(r.id),
    })),
  );
});

// GET /enabled — list only enabled repos (from Convex)
repositories.get("/enabled", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = await getUserId(c, session);
  if (!userId) {
    return c.json({ error: "User not found" }, { status: 404 });
  }

  const convex: ConvexClient = c.get("convex");
  const added = await convex.query<unknown[]>("repositories:listByUserAndStatus", {
    userId,
    status: "added",
  });
  const synced = await convex.query<unknown[]>("repositories:listByUserAndStatus", {
    userId,
    status: "synced",
  });

  return c.json([...added, ...synced]);
});

// POST /:repoId/enable — enable a repo (add to Convex with status "added")
// Body: { full_name, name, owner, private, html_url, default_branch }
repositories.post("/:repoId/enable", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = await getUserId(c, session);
  if (!userId) {
    return c.json({ error: "User not found" }, { status: 404 });
  }

  const githubRepoId = parseInt(c.req.param("repoId"), 10);
  const body = await c.req.json<{
    full_name: string;
    name: string;
    owner: string;
    private: boolean;
    html_url: string;
    default_branch: string;
  }>();

  const convex: ConvexClient = c.get("convex");

  // Upsert the repo into the repositories table, then set status to "added"
  await convex.mutation("repositories:upsertFromGitHub", {
    userId,
    repos: [
      {
        githubRepoId,
        fullName: body.full_name,
        name: body.name,
        owner: body.owner,
        isPrivate: body.private,
        htmlUrl: body.html_url,
        defaultBranch: body.default_branch,
      },
    ],
  });

  // Find the repo we just upserted and set its status to "added"
  const allRepos = await convex.query<Array<{ _id: string; githubRepoId: number }>>(
    "repositories:listByUser",
    { userId },
  );
  const repo = allRepos.find((r) => r.githubRepoId === githubRepoId);
  if (repo) {
    await convex.mutation("repositories:updateStatus", {
      id: repo._id,
      status: "added",
    });
  }

  const updated = repo
    ? await convex.query("repositories:get", { id: repo._id })
    : null;

  return c.json({ success: true, repository: updated });
});

// POST /:repoId/disable — disable a repo (set status back to "available" or delete from Convex)
repositories.post("/:repoId/disable", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = await getUserId(c, session);
  if (!userId) {
    return c.json({ error: "User not found" }, { status: 404 });
  }

  const githubRepoId = parseInt(c.req.param("repoId"), 10);

  const convex: ConvexClient = c.get("convex");
  const allRepos = await convex.query<Array<{ _id: string; githubRepoId: number }>>(
    "repositories:listByUser",
    { userId },
  );
  const repo = allRepos.find((r) => r.githubRepoId === githubRepoId);
  if (repo) {
    // Delete the repo from Convex entirely (only enabled repos are stored)
    await convex.mutation("repositories:remove", { id: repo._id });
  }

  return c.json({ success: true });
});
