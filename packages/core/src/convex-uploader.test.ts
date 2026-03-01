import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRun, updateRunStatus } from "./convex-uploader.js";

// Mock fetch for Convex API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("createRun", () => {
  it("creates a run and returns runId with dashboardUrl", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: "run-abc-123" }),
    });

    const result = await createRun(
      { convexUrl: "http://localhost:3210" },
      {
        timestamp: Date.now(),
        summary: "Test run",
        source: "skill",
      },
    );

    expect(result.runId).toBe("run-abc-123");
    expect(result.dashboardUrl).toContain("/runs/run-abc-123");
  });

  it("uses custom dashboard base URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: "run-xyz" }),
    });

    const result = await createRun(
      {
        convexUrl: "http://localhost:3210",
        dashboardBaseUrl: "https://my-dashboard.com",
      },
      {
        timestamp: Date.now(),
        summary: "Test",
        source: "pr",
        branch: "feat/test",
        pr: 42,
      },
    );

    expect(result.dashboardUrl).toContain("https://my-dashboard.com/runs/");
  });

  it("sends correct mutation path and args", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: "run-id" }),
    });

    await createRun(
      { convexUrl: "http://localhost:3210" },
      {
        timestamp: 1234567890,
        summary: "PR #5 demo",
        source: "pr",
        branch: "main",
        commitSha: "abc123",
      },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3210/api/mutation");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.path).toBe("runs:create");
  });

  it("throws on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(
      createRun(
        { convexUrl: "http://localhost:3210" },
        { timestamp: Date.now(), summary: "Test", source: "skill" },
      ),
    ).rejects.toThrow();
  });
});

describe("updateRunStatus", () => {
  it("calls update mutation with correct args", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: null }),
    });

    await updateRunStatus(
      { convexUrl: "http://localhost:3210" },
      "run-123",
      "completed",
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.path).toBe("runs:updateStatus");
    const args = body.args as Record<string, unknown>;
    expect(args.id).toBe("run-123");
    expect(args.status).toBe("completed");
  });

  it("passes extra fields (error, durationMs)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: null }),
    });

    await updateRunStatus(
      { convexUrl: "http://localhost:3210" },
      "run-456",
      "failed",
      { error: "Timeout", durationMs: 5000 },
    );

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    const args = body.args as Record<string, unknown>;
    expect(args.error).toBe("Timeout");
    expect(args.durationMs).toBe(5000);
  });
});
