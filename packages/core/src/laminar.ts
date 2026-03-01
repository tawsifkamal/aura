export interface LaminarConfig {
  endpoint: string;
  apiKey?: string;
  projectId?: string;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: "ok" | "error";
  attributes: Record<string, string | number | boolean>;
  events: TraceEvent[];
}

export interface TraceEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface RunTrace {
  traceId: string;
  spans: TraceSpan[];
  startTime: number;
  endTime?: number;
  status: "ok" | "error";
  traceUrl?: string;
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createTrace(config: LaminarConfig): RunTrace {
  const traceId = generateId();
  return {
    traceId,
    spans: [],
    startTime: Date.now(),
    status: "ok",
    traceUrl: buildTraceUrl(config, traceId),
  };
}

export function startSpan(
  trace: RunTrace,
  name: string,
  attributes?: Record<string, string | number | boolean>,
): TraceSpan {
  const span: TraceSpan = {
    traceId: trace.traceId,
    spanId: generateId().slice(0, 16),
    name,
    startTime: Date.now(),
    status: "ok",
    attributes: attributes ?? {},
    events: [],
  };
  trace.spans.push(span);
  return span;
}

export function endSpan(
  span: TraceSpan,
  status?: "ok" | "error",
): void {
  span.endTime = Date.now();
  if (status) span.status = status;
}

export function addSpanEvent(
  span: TraceSpan,
  name: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  span.events.push({
    name,
    timestamp: Date.now(),
    attributes,
  });
}

export function endTrace(
  trace: RunTrace,
  status?: "ok" | "error",
): void {
  trace.endTime = Date.now();
  if (status) trace.status = status;

  const hasError = trace.spans.some((s) => s.status === "error");
  if (hasError && trace.status === "ok") {
    trace.status = "error";
  }
}

export async function exportTrace(
  config: LaminarConfig,
  trace: RunTrace,
): Promise<boolean> {
  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "aura" } },
            {
              key: "project.id",
              value: { stringValue: config.projectId ?? "aura" },
            },
          ],
        },
        scopeSpans: [
          {
            spans: trace.spans.map((span) => ({
              traceId: span.traceId,
              spanId: span.spanId,
              name: span.name,
              startTimeUnixNano: String(span.startTime * 1_000_000),
              endTimeUnixNano: String(
                (span.endTime ?? Date.now()) * 1_000_000,
              ),
              status: {
                code: span.status === "ok" ? 1 : 2,
              },
              attributes: Object.entries(span.attributes).map(
                ([key, value]) => ({
                  key,
                  value:
                    typeof value === "string"
                      ? { stringValue: value }
                      : typeof value === "number"
                        ? { intValue: String(value) }
                        : { boolValue: value },
                }),
              ),
              events: span.events.map((e) => ({
                name: e.name,
                timeUnixNano: String(e.timestamp * 1_000_000),
                attributes: Object.entries(e.attributes ?? {}).map(
                  ([key, value]) => ({
                    key,
                    value:
                      typeof value === "string"
                        ? { stringValue: value }
                        : typeof value === "number"
                          ? { intValue: String(value) }
                          : { boolValue: value },
                  }),
                ),
              })),
            })),
          },
        ],
      },
    ],
  };

  const hdrs: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    hdrs["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    const res = await fetch(
      `${config.endpoint}/v1/traces`,
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify(payload),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function buildTraceUrl(
  config: LaminarConfig,
  traceId: string,
): string {
  const base = config.endpoint.replace(/\/api$/, "").replace(/\/$/, "");
  const project = config.projectId ?? "aura";
  return `${base}/project/${project}/traces/${traceId}`;
}

export function getLaminarConfig(): LaminarConfig | null {
  const endpoint = process.env["LAMINAR_ENDPOINT"];
  if (!endpoint) return null;

  return {
    endpoint,
    apiKey: process.env["LAMINAR_API_KEY"],
    projectId: process.env["LAMINAR_PROJECT_ID"] ?? "aura",
  };
}
