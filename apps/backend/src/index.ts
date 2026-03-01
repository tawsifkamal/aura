import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ALLOWED_ORIGINS } from "./types";
import { GitHubAuthRedirect } from "./endpoints/githubAuth";
import { GitHubCallback } from "./endpoints/githubCallback";
import { SessionInfo } from "./endpoints/sessionInfo";
import { Logout } from "./endpoints/logout";

const app = new Hono<{ Bindings: Env }>();

// CORS — allow credentials (cookies) from allowed origins
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      return ALLOWED_ORIGINS[0]!;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

const openapi = fromHono(app, {
  docs_url: "/",
});

// Auth endpoints
openapi.get("/api/auth/github", GitHubAuthRedirect);
openapi.get("/api/auth/callback/github", GitHubCallback);
openapi.get("/api/auth/session", SessionInfo);
openapi.post("/api/auth/logout", Logout);

export default app;
