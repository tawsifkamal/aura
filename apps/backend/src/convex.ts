/**
 * Lightweight Convex HTTP API client for Cloudflare Workers.
 *
 * Uses Convex's built-in REST endpoints:
 *   POST <CONVEX_URL>/api/query   { path, args, format: "json" }
 *   POST <CONVEX_URL>/api/mutation { path, args, format: "json" }
 *
 * Auth: "Authorization: Convex <deploy_key>" when CONVEX_DEPLOY_KEY is set.
 * Local dev (no key) omits the header — Convex dev server doesn't require auth.
 */

export class ConvexClient {
  private baseUrl: string;
  private deployKey: string | undefined;

  constructor(url: string, deployKey?: string) {
    // Strip trailing slash
    this.baseUrl = url.replace(/\/+$/, "");
    this.deployKey = deployKey || undefined;
  }

  async query<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.call<T>("query", path, args);
  }

  async mutation<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.call<T>("mutation", path, args);
  }

  private async call<T>(kind: "query" | "mutation", path: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/api/${kind}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.deployKey) {
      headers["Authorization"] = `Convex ${this.deployKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ path, args, format: "json" }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Convex ${kind} "${path}" failed (${res.status}): ${text}`);
    }

    const envelope = (await res.json()) as { value: T; status: string };

    if (envelope.status !== "success") {
      throw new Error(`Convex ${kind} "${path}" returned status: ${envelope.status}`);
    }

    return envelope.value;
  }
}
