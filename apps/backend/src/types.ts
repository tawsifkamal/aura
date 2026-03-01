import type { Context } from "hono";
import type { ConvexClient } from "./convex";

export type AppContext = Context<{ Bindings: Env; Variables: { convex: ConvexClient } }>;

// Add more origins here as needed
export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://aura-backend.poppets-grungy03.workers.dev",
];

declare global {
  interface Env {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_REDIRECT_URI: string;
    COOKIE_SECRET: string;
    CONVEX_URL: string;
    CONVEX_DEPLOY_KEY: string;
    DAYTONA_API_KEY: string;
    BROWSER_USE_API_KEY: string;
    ANTHROPIC_API_KEY: string;
    GROQ_API_KEY: string;
  }
}
