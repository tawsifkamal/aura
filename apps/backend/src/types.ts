import type { Context } from "hono";

export type AppContext = Context<{ Bindings: Env }>;

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
  }
}
