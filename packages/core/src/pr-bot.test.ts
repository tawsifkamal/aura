import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCommentBody, COMMENT_MARKER } from "./pr-bot.js";
import type { CommentState } from "./pr-bot.js";

// Mock fetch globally for API tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("buildCommentBody", () => {
  it("includes the aura-bot marker", () => {
    const state: CommentState = {
      commentId: 1,
      status: "queued",
    };
    const body = buildCommentBody(state);
    expect(body).toContain(COMMENT_MARKER);
  });

  it("renders queued status", () => {
    const body = buildCommentBody({
      commentId: 1,
      status: "queued",
    });
    expect(body).toContain("Queued");
  });

  it("renders running status", () => {
    const body = buildCommentBody({
      commentId: 1,
      status: "running",
    });
    expect(body).toContain("Recording");
  });

  it("renders uploading status", () => {
    const body = buildCommentBody({
      commentId: 1,
      status: "uploading",
    });
    expect(body).toContain("Uploading");
  });

  it("renders completed status with video and dashboard links", () => {
    const body = buildCommentBody({
      commentId: 1,
      status: "completed",
      videoUrl: "https://example.com/video.mp4",
      dashboardUrl: "https://dashboard.example.com/runs/123",
      summary: "Tested login flow",
      routesTested: ["/login", "/dashboard"],
    });
    expect(body).toContain("Completed");
    expect(body).toContain("https://dashboard.example.com/runs/123");
    expect(body).toContain("Tested login flow");
    expect(body).toContain("/login");
    expect(body).toContain("/dashboard");
  });

  it("renders failed status with error", () => {
    const body = buildCommentBody({
      commentId: 1,
      status: "failed",
      error: "Browser crashed during recording",
      dashboardUrl: "https://dashboard.example.com/runs/456",
    });
    expect(body).toContain("Failed");
    expect(body).toContain("Browser crashed during recording");
    expect(body).toContain("https://dashboard.example.com/runs/456");
  });

  it("handles completed status without optional fields", () => {
    const body = buildCommentBody({
      commentId: 1,
      status: "completed",
    });
    expect(body).toContain("Completed");
    // Should not crash without video, dashboard, summary, or routes
  });
});

describe("COMMENT_MARKER", () => {
  it("is a valid HTML comment", () => {
    expect(COMMENT_MARKER).toMatch(/^<!--.*-->$/);
  });
});
