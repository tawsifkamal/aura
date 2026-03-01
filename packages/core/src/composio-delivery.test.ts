import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isComposioAvailable,
  getComposioConfig,
  deliverToAllChannels,
  buildConnectionUrl,
} from "./composio-delivery.js";
import type {
  DeliveryPreferences,
  DeliveryPayload,
} from "./composio-delivery.js";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  vi.unstubAllEnvs();
});

describe("getComposioConfig", () => {
  it("returns null when COMPOSIO_API_KEY is not set", () => {
    delete process.env.COMPOSIO_API_KEY;
    expect(getComposioConfig()).toBeNull();
  });

  it("returns config when API key is set", () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    const config = getComposioConfig();
    expect(config).not.toBeNull();
    expect(config?.apiKey).toBe("test-key");
    delete process.env.COMPOSIO_API_KEY;
  });
});

describe("isComposioAvailable", () => {
  it("returns false without API key", () => {
    delete process.env.COMPOSIO_API_KEY;
    expect(isComposioAvailable()).toBe(false);
  });

  it("returns true with API key", () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    expect(isComposioAvailable()).toBe(true);
    delete process.env.COMPOSIO_API_KEY;
  });
});

describe("deliverToAllChannels", () => {
  const payload: DeliveryPayload = {
    runId: "run-123",
    dashboardUrl: "https://dashboard.example.com/runs/run-123",
    summary: "Demo recording completed",
    status: "completed",
    routesTested: ["/login", "/dashboard"],
  };

  it("falls back to email when no channels configured", async () => {
    const prefs: DeliveryPreferences = {
      userId: "user-1",
      channels: [],
      fallbackToEmail: true,
      emailAddress: "user@example.com",
    };

    // Mock AgentMail
    process.env.AGENTMAIL_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "msg-1" }),
    });

    const result = await deliverToAllChannels(prefs, payload);
    expect(result.usedFallback).toBe(true);
    delete process.env.AGENTMAIL_API_KEY;
  });

  it("falls back when Composio is not configured", async () => {
    delete process.env.COMPOSIO_API_KEY;
    const prefs: DeliveryPreferences = {
      userId: "user-1",
      channels: [
        {
          type: "slack",
          id: "ch-1",
          name: "general",
          target: "C123456",
          enabled: true,
        },
      ],
      fallbackToEmail: true,
      emailAddress: "user@example.com",
    };

    process.env.AGENTMAIL_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "msg-1" }),
    });

    const result = await deliverToAllChannels(prefs, payload);
    expect(result.usedFallback).toBe(true);
    delete process.env.AGENTMAIL_API_KEY;
  });

  it("delivers to webhook channels directly (no Composio)", async () => {
    process.env.COMPOSIO_API_KEY = "test-key";

    const prefs: DeliveryPreferences = {
      userId: "user-1",
      channels: [
        {
          type: "webhook",
          id: "wh-1",
          name: "My Webhook",
          target: "https://hooks.example.com/aura",
          enabled: true,
        },
      ],
      fallbackToEmail: false,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await deliverToAllChannels(prefs, payload);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.channel.type).toBe("webhook");

    delete process.env.COMPOSIO_API_KEY;
  });

  it("does not block on individual channel failures", async () => {
    process.env.COMPOSIO_API_KEY = "test-key";

    const prefs: DeliveryPreferences = {
      userId: "user-1",
      channels: [
        {
          type: "webhook",
          id: "wh-1",
          name: "Webhook",
          target: "https://hooks.example.com/fail",
          enabled: true,
        },
      ],
      fallbackToEmail: false,
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await deliverToAllChannels(prefs, payload);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.success).toBe(false);

    delete process.env.COMPOSIO_API_KEY;
  });
});

describe("buildConnectionUrl", () => {
  it("returns null when Composio not configured", () => {
    delete process.env.COMPOSIO_API_KEY;
    expect(buildConnectionUrl("slack", "https://example.com/callback")).toBeNull();
  });

  it("builds URL for Slack", () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    const url = buildConnectionUrl("slack", "https://example.com/callback");
    expect(url).toContain("slack");
    expect(url).toContain("redirect_url");
    delete process.env.COMPOSIO_API_KEY;
  });

  it("returns null for webhook type (no OAuth needed)", () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    const url = buildConnectionUrl("webhook", "https://example.com/callback");
    expect(url).toBeNull();
    delete process.env.COMPOSIO_API_KEY;
  });
});
