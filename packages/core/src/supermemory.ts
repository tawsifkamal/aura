export interface SupermemoryConfig {
  endpoint: string;
  apiKey?: string;
}

export interface RunContext {
  sessionId: string;
  branch?: string;
  routes: string[];
  components: string[];
  summary: string;
  timestamp: number;
}

export interface RetrievedContext {
  entries: RunContext[];
  relevanceScores: number[];
}

export async function storeRunContext(
  config: SupermemoryConfig,
  context: RunContext,
): Promise<boolean> {
  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    hdrs["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    const res = await fetch(`${config.endpoint}/v1/memories`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        content: formatContextForStorage(context),
        metadata: {
          sessionId: context.sessionId,
          branch: context.branch ?? "",
          routes: context.routes.join(","),
          timestamp: context.timestamp,
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function retrieveContext(
  config: SupermemoryConfig,
  query: {
    branch?: string;
    routes?: string[];
    components?: string[];
    limit?: number;
  },
): Promise<RetrievedContext> {
  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    hdrs["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const searchQuery = buildSearchQuery(query);

  try {
    const res = await fetch(`${config.endpoint}/v1/search`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        query: searchQuery,
        limit: query.limit ?? 5,
        filters: query.branch ? { branch: query.branch } : undefined,
      }),
    });

    if (!res.ok) {
      return { entries: [], relevanceScores: [] };
    }

    const data = (await res.json()) as {
      results: Array<{
        content: string;
        score: number;
        metadata: Record<string, string>;
      }>;
    };

    const entries: RunContext[] = data.results.map((r) =>
      parseStoredContext(r.content, r.metadata),
    );
    const relevanceScores = data.results.map((r) => r.score);

    return { entries, relevanceScores };
  } catch {
    return { entries: [], relevanceScores: [] };
  }
}

export function mergeContextIntoPrompt(
  basePrompt: string,
  retrieved: RetrievedContext,
): string {
  if (retrieved.entries.length === 0) return basePrompt;

  const contextBlock = retrieved.entries
    .map((entry, i) => {
      const score = retrieved.relevanceScores[i] ?? 0;
      const routeList = entry.routes.join(", ");
      return `- [${String(Math.round(score * 100))}% relevant] ${entry.summary} (routes: ${routeList})`;
    })
    .join("\n");

  return `${basePrompt}\n\n## Prior run context\n\nThe following prior recordings are relevant to this run:\n${contextBlock}\n\nUse this context to prioritize which routes and interactions to focus on.`;
}

function formatContextForStorage(context: RunContext): string {
  return [
    `Session: ${context.sessionId}`,
    `Branch: ${context.branch ?? "unknown"}`,
    `Routes: ${context.routes.join(", ")}`,
    `Components: ${context.components.join(", ")}`,
    `Summary: ${context.summary}`,
    `Time: ${new Date(context.timestamp).toISOString()}`,
  ].join("\n");
}

function buildSearchQuery(query: {
  branch?: string;
  routes?: string[];
  components?: string[];
}): string {
  const parts: string[] = [];
  if (query.branch) parts.push(`branch: ${query.branch}`);
  if (query.routes?.length) parts.push(`routes: ${query.routes.join(", ")}`);
  if (query.components?.length)
    parts.push(`components: ${query.components.join(", ")}`);
  return parts.join(" | ") || "recent recordings";
}

function parseStoredContext(
  content: string,
  metadata: Record<string, string>,
): RunContext {
  const lines = content.split("\n");
  const get = (prefix: string): string =>
    lines
      .find((l) => l.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() ?? "";

  return {
    sessionId: get("Session: ") || metadata["sessionId"] || "",
    branch: get("Branch: ") || metadata["branch"] || undefined,
    routes: (get("Routes: ") || metadata["routes"] || "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
    components: (get("Components: ") || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    summary: get("Summary: "),
    timestamp: Number(metadata["timestamp"]) || 0,
  };
}

export function getSupermemoryConfig(): SupermemoryConfig | null {
  const endpoint = process.env["SUPERMEMORY_ENDPOINT"];
  if (!endpoint) return null;

  return {
    endpoint,
    apiKey: process.env["SUPERMEMORY_API_KEY"],
  };
}
