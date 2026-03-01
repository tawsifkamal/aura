import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession } from "../cookie";
import type { ConvexClient } from "../convex";
import {
  getBranchSha,
  branchExists,
  createBranch,
  fileExists,
  createFile,
  createPullRequest,
  getRepoPublicKey,
  setRepoSecret,
} from "../github";
import { encryptSecret } from "../crypto";
import {
  AURA_WORKFLOW_YAML,
  WORKFLOW_FILE_PATH,
  SETUP_BRANCH_NAME,
} from "../workflow-template";

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

// POST /:repoId/setup — trigger automated setup (PR + secret) via GitHub API
repositories.post("/:repoId/setup", async (c) => {
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

  // Verify the repo is enabled
  const repo = await convex.query<{
    _id: string;
    status: string;
    owner: string;
    name: string;
    defaultBranch: string;
  } | null>("repositories:getByUserAndGithubId", {
    userId,
    githubRepoId,
  });

  if (!repo || (repo.status !== "added" && repo.status !== "synced")) {
    return c.json({ error: "Repository not enabled" }, { status: 400 });
  }

  // Get user's API key
  const user = await convex.query<{ apiKey?: string } | null>(
    "users:getByGithubId",
    { githubUserId: session.github_user_id },
  );

  if (!user?.apiKey) {
    return c.json(
      { error: "No API key found. Sign out and sign back in to generate one." },
      { status: 400 },
    );
  }

  // Set setup status to pending
  await convex.mutation("repositories:updateSetupStatus", {
    id: repo._id,
    setupStatus: "pending",
  });

  const token = session.access_token;
  const owner = repo.owner;
  const repoName = repo.name;
  const defaultBranch = repo.defaultBranch;
  const apiKey = user.apiKey;
  const repoDocId = repo._id;

  // Run the setup in the background via waitUntil
  const setupPromise = (async () => {
    try {
      // 1. Get default branch SHA
      const sha = await getBranchSha(token, owner, repoName, defaultBranch);

      // 2. Check if workflow file already exists on default branch
      const workflowExists = await fileExists(
        token, owner, repoName, WORKFLOW_FILE_PATH, defaultBranch,
      );

      let prUrl: string | undefined;
      let prNumber: number | undefined;

      if (!workflowExists) {
        // 3. Create setup branch (append timestamp if branch already exists)
        let branchName = SETUP_BRANCH_NAME;
        if (await branchExists(token, owner, repoName, branchName)) {
          branchName = `${SETUP_BRANCH_NAME}-${Date.now()}`;
        }
        await createBranch(token, owner, repoName, branchName, sha);

        // 4. Create workflow file on the new branch
        await createFile(
          token,
          owner,
          repoName,
          WORKFLOW_FILE_PATH,
          AURA_WORKFLOW_YAML,
          "Add Aura CI workflow for PR demo recordings",
          branchName,
        );

        // 5. Create PR
        const pr = await createPullRequest(
          token,
          owner,
          repoName,
          "Add Aura CI workflow",
          "This PR adds the Aura GitHub Actions workflow that triggers demo recordings on every pull request.\n\nMerge this PR to enable automatic demo recordings.",
          branchName,
          defaultBranch,
        );
        prUrl = pr.html_url;
        prNumber = pr.number;
      }

      // 6. Set the AURA_API_KEY secret (always, even if workflow already existed)
      const pubKey = await getRepoPublicKey(token, owner, repoName);
      const encryptedKey = encryptSecret(pubKey.key, apiKey);
      await setRepoSecret(
        token, owner, repoName, "AURA_API_KEY", encryptedKey, pubKey.key_id,
      );

      // 7. Update Convex with success
      await convex.mutation("repositories:updateSetupStatus", {
        id: repoDocId,
        setupStatus: "completed" as const,
        ...(prUrl ? { setupPrUrl: prUrl } : {}),
        ...(prNumber ? { setupPrNumber: prNumber } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[setup] Failed for ${owner}/${repoName}:`, message);
      await convex.mutation("repositories:updateSetupStatus", {
        id: repoDocId,
        setupStatus: "failed" as const,
        setupError: message,
      });
    }
  })();

  c.executionCtx.waitUntil(setupPromise);

  return c.json({ success: true });
});

// GET /:repoId/setup-status — poll for setup progress
repositories.get("/:repoId/setup-status", async (c) => {
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

  const repo = await convex.query<{
    setupStatus?: string;
    setupPrUrl?: string;
    setupPrNumber?: number;
    setupError?: string;
  } | null>("repositories:getByUserAndGithubId", {
    userId,
    githubRepoId,
  });

  if (!repo) {
    return c.json({ error: "Repository not found" }, { status: 404 });
  }

  return c.json({
    setupStatus: repo.setupStatus ?? null,
    setupPrUrl: repo.setupPrUrl ?? null,
    setupPrNumber: repo.setupPrNumber ?? null,
    setupError: repo.setupError ?? null,
  });
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
