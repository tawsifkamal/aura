import { describe, it, expect } from "vitest";
import {
  parseEditRequest,
  buildEditAPICall,
} from "./conversational-edit.js";

describe("parseEditRequest", () => {
  describe("trim operations", () => {
    it("parses 'trim the first 5 seconds'", () => {
      const result = parseEditRequest("trim the first 5 seconds");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("trim");
      expect(result?.params.startMs).toBe(5000);
    });

    it("parses 'cut from 2s to 10s'", () => {
      const result = parseEditRequest("cut from 2s to 10s");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("trim");
    });

    it("parses 'remove the last 3 seconds'", () => {
      const result = parseEditRequest("remove the last 3 seconds");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("trim");
    });
  });

  describe("zoom operations", () => {
    it("parses 'zoom in on the button click'", () => {
      const result = parseEditRequest("zoom in on the button click");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("zoom");
    });

    it("parses 'zoom 2x'", () => {
      const result = parseEditRequest("zoom 2x");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("zoom");
      expect(result?.params.intensity).toBe(2);
    });

    it("parses 'focus on the sidebar'", () => {
      const result = parseEditRequest("focus on the sidebar");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("zoom");
    });
  });

  describe("export operations", () => {
    it("parses 'make it a GIF'", () => {
      const result = parseEditRequest("make it a GIF");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("export");
      expect(result?.params.format).toBe("gif");
    });

    it("parses 'export as mp4'", () => {
      const result = parseEditRequest("export as mp4");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("export");
      expect(result?.params.format).toBe("mp4");
    });

    it("parses '30 fps'", () => {
      const result = parseEditRequest("export 30fps mp4");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("export");
      expect(result?.params.fps).toBe(30);
    });

    it("parses 'higher quality'", () => {
      const result = parseEditRequest("higher quality export");
      expect(result).not.toBeNull();
      expect(result?.params.quality).toBe("high");
    });
  });

  describe("style presets", () => {
    it("parses 'use dramatic style'", () => {
      const result = parseEditRequest("use dramatic style");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("style_preset");
      expect(result?.params.preset).toBe("dramatic");
    });

    it("parses 'make it minimal'", () => {
      const result = parseEditRequest("make it minimal");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("style_preset");
      expect(result?.params.preset).toBe("minimal");
    });

    it("parses 'switch to default preset'", () => {
      const result = parseEditRequest("switch to default preset");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("style_preset");
      expect(result?.params.preset).toBe("default");
    });
  });

  describe("crop operations", () => {
    it("parses 'crop to 1280x720'", () => {
      const result = parseEditRequest("crop to 1280x720");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("crop");
      expect(result?.params.width).toBe(1280);
      expect(result?.params.height).toBe(720);
    });
  });

  describe("split operations", () => {
    it("parses 'split at 5 seconds'", () => {
      const result = parseEditRequest("split at 5 seconds");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("split");
      expect(result?.params.atMs).toBe(5000);
    });

    it("parses 'remove everything after 10s'", () => {
      const result = parseEditRequest("remove everything after 10s");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("split");
      expect(result?.params.removeSegment).toBe("after");
    });
  });

  describe("cursor operations", () => {
    it("parses 'bigger cursor'", () => {
      const result = parseEditRequest("bigger cursor");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("cursor_emphasis");
    });

    it("parses 'smoother cursor'", () => {
      const result = parseEditRequest("smoother cursor");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("cursor_emphasis");
      expect(Number(result?.params.smoothing)).toBeGreaterThan(0.5);
    });
  });

  describe("unrecognized inputs", () => {
    it("returns null for gibberish", () => {
      expect(parseEditRequest("asdfghjkl")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseEditRequest("")).toBeNull();
    });

    it("returns null for generic text", () => {
      expect(parseEditRequest("the weather is nice today")).toBeNull();
    });
  });
});

describe("buildEditAPICall", () => {
  it("builds applyEdit call for trim operation", () => {
    const call = buildEditAPICall("run-123", {
      type: "trim",
      params: { startMs: 0, endMs: 5000 },
      confidence: 0.9,
      rawText: "trim to 5 seconds",
    });
    expect(call?.path).toBe("edits:applyEdit");
    expect(call?.args.runId).toBe("run-123");
  });

  it("builds exports:create call for export operation", () => {
    const call = buildEditAPICall("run-456", {
      type: "export",
      params: { format: "gif", fps: 15, quality: "web" },
      confidence: 0.9,
      rawText: "make it a gif",
    });
    expect(call?.path).toBe("exports:create");
    expect(call?.args.format).toBe("gif");
  });

  it("includes parentVersionId when provided", () => {
    const call = buildEditAPICall(
      "run-789",
      {
        type: "zoom",
        params: { intensity: 2, centerX: 640, centerY: 360, startMs: 0, durationMs: 2000 },
        confidence: 0.85,
        rawText: "zoom 2x",
      },
      "ver-001",
    );
    expect(call?.args.parentVersionId).toBe("ver-001");
  });
});
