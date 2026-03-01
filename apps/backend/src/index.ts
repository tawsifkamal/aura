import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie } from "hono/cookie";
import { ALLOWED_ORIGINS } from "./types";
import { ConvexClient } from "./convex";
import { verifySession } from "./cookie";
import { GitHubAuthRedirect } from "./endpoints/githubAuth";
import { GitHubCallback } from "./endpoints/githubCallback";
import { SessionInfo } from "./endpoints/sessionInfo";
import { Logout } from "./endpoints/logout";
import { runs } from "./endpoints/runs";
import { edits } from "./endpoints/edits";
import { exports_ } from "./endpoints/exports";
import { repositories } from "./endpoints/repositories";
import { webhooks } from "./endpoints/webhook";

const app = new Hono<{ Bindings: Env; Variables: { convex: ConvexClient } }>();

// CORS — allow credentials (cookies) from allowed origins
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      return ALLOWED_ORIGINS[0]!;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Convex client middleware — inject on all /api/* routes
app.use("/api/*", async (c, next) => {
  const client = new ConvexClient(c.env.CONVEX_URL, c.env.CONVEX_ADMIN_SECRET);
  c.set("convex", client);
  await next();
});

const openapi = fromHono(app, {
  docs_url: "/",
});

// Auth endpoints (OpenAPI documented)
openapi.get("/api/auth/github", GitHubAuthRedirect);
openapi.get("/api/auth/callback/github", GitHubCallback);
openapi.get("/api/auth/session", SessionInfo);
openapi.post("/api/auth/logout", Logout);

// Data endpoints (backed by Convex)
app.route("/api/runs", runs);
app.route("/api/runs/:runId/edits", edits);
app.route("/api/runs/:runId/exports", exports_);
app.route("/api/repositories", repositories);
app.route("/api/webhooks", webhooks);

// Top-level ID-based routes for pipeline consumers
app.patch("/api/edits/:editId/status", async (c) => {
  const convex = c.get("convex");
  const { editId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("edits:updateVersionStatus", {
    id: editId,
    status: body.status,
    videoStorageId: body.videoStorageId,
    error: body.error,
  });

  return c.json({ success: true, editId, status: body.status });
});

app.patch("/api/exports/:exportId/progress", async (c) => {
  const convex = c.get("convex");
  const { exportId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("exports:updateProgress", {
    id: exportId,
    progress: body.progress,
    status: body.status,
    eta: body.eta,
  });

  return c.json({ success: true, exportId, progress: body.progress });
});

app.post("/api/exports/:exportId/complete", async (c) => {
  const convex = c.get("convex");
  const { exportId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("exports:complete", {
    id: exportId,
    outputStorageId: body.outputStorageId,
    fileSizeBytes: body.fileSizeBytes,
  });

  return c.json({ success: true, exportId, status: "completed" });
});

app.post("/api/exports/:exportId/fail", async (c) => {
  const convex = c.get("convex");
  const { exportId } = c.req.param();
  const body = await c.req.json();

  await convex.mutation("exports:fail", {
    id: exportId,
    error: body.error,
  });

  return c.json({ success: true, exportId, status: "failed" });
});

// API key endpoint — returns the user's API key
app.get("/api/auth/api-key", async (c) => {
  const raw = getCookie(c, "aura_session");
  if (!raw) {
    return c.json({ error: "Not authenticated" }, { status: 401 });
  }

  const session = await verifySession<{ github_user_id: number }>(
    c.env.COOKIE_SECRET,
    raw,
  );
  if (!session) {
    return c.json({ error: "Not authenticated" }, { status: 401 });
  }

  const convex = c.get("convex");
  const user = await convex.query<{ apiKey?: string } | null>(
    "users:getByGithubId",
    { githubUserId: session.github_user_id },
  );

  if (!user || !user.apiKey) {
    return c.json({ error: "No API key found" }, { status: 404 });
  }

  return c.json({ apiKey: user.apiKey });
});

// Upload URL endpoint — generates Convex storage upload URL
app.post("/api/upload-url", async (c) => {
  const convex = c.get("convex");
  const uploadUrl = await convex.mutation<string>("runs:generateUploadUrl");
  return c.json({ uploadUrl });
});

export default app;
