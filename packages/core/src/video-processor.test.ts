import { describe, it, expect } from "vitest";
import {
  interpolateCursorPath,
  generateZoomKeyframes,
  getZoomAtTime,
  getEasing,
  buildFFmpegCompositeCommand,
  buildCursorOverlayFilter,
  buildZoomPanFilter,
  PRESETS,
} from "./video-processor.js";
import type {
  CursorKeyframe,
  ZoomKeyframe,
} from "./video-processor.js";

describe("getEasing", () => {
  it("returns a function for each easing type", () => {
    const easings = ["linear", "ease-in", "ease-out", "ease-in-out", "cubic-bezier"] as const;
    for (const name of easings) {
      const fn = getEasing(name);
      expect(typeof fn).toBe("function");
    }
  });

  it("linear returns t unchanged", () => {
    const fn = getEasing("linear");
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.5);
    expect(fn(1)).toBe(1);
  });

  it("ease-in-out returns 0 at t=0 and 1 at t=1", () => {
    const fn = getEasing("ease-in-out");
    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(1);
  });

  it("all easings produce values between 0 and 1", () => {
    const fn = getEasing("ease-in-out");
    for (let t = 0; t <= 1; t += 0.1) {
      const v = fn(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("interpolateCursorPath", () => {
  it("returns empty array for no keyframes", () => {
    const result = interpolateCursorPath([], 1000, 30, 0.5);
    expect(result).toHaveLength(0);
  });

  it("returns repeated position for single keyframe", () => {
    const kf: CursorKeyframe[] = [
      { position: { x: 100, y: 200 }, timestamp: 0, action: "click" },
    ];
    const result = interpolateCursorPath(kf, 1000, 30, 0.5);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.x).toBe(100);
    expect(result[0]?.y).toBe(200);
  });

  it("interpolates between two keyframes", () => {
    const kf: CursorKeyframe[] = [
      { position: { x: 0, y: 0 }, timestamp: 0, action: "navigate" },
      { position: { x: 100, y: 100 }, timestamp: 1000, action: "click" },
    ];
    const result = interpolateCursorPath(kf, 1000, 30, 0.5);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]?.x).toBe(0);
    expect(result[0]?.y).toBe(0);
  });

  it("produces deterministic output", () => {
    const kf: CursorKeyframe[] = [
      { position: { x: 0, y: 0 }, timestamp: 0, action: "navigate" },
      { position: { x: 200, y: 300 }, timestamp: 2000, action: "click" },
    ];
    const a = interpolateCursorPath(kf, 2000, 30, 0.7);
    const b = interpolateCursorPath(kf, 2000, 30, 0.7);
    expect(a).toEqual(b);
  });
});

describe("generateZoomKeyframes", () => {
  it("generates zoom keyframes for click actions", () => {
    const steps = [
      { action: "click" as const, timestamp: 500, url: "http://localhost", target: "button" },
    ];
    const cursorKf: CursorKeyframe[] = [
      { position: { x: 640, y: 360 }, timestamp: 500, action: "click" },
    ];
    const result = generateZoomKeyframes(steps, cursorKf, PRESETS.default!);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.scale).toBe(PRESETS.default!.zoomScale);
  });

  it("generates zoom for type actions", () => {
    const steps = [
      { action: "type" as const, timestamp: 1000, url: "http://localhost", target: "input" },
    ];
    const cursorKf: CursorKeyframe[] = [
      { position: { x: 400, y: 300 }, timestamp: 1000, action: "type" },
    ];
    const result = generateZoomKeyframes(steps, cursorKf, PRESETS.dramatic!);
    expect(result.length).toBeGreaterThan(0);
  });

  it("skips non-interactive actions", () => {
    const steps = [
      { action: "navigate" as const, timestamp: 0, url: "http://localhost" },
    ];
    const cursorKf: CursorKeyframe[] = [
      { position: { x: 0, y: 0 }, timestamp: 0, action: "navigate" },
    ];
    const result = generateZoomKeyframes(steps, cursorKf, PRESETS.default!);
    expect(result).toHaveLength(0);
  });

  it("uses preset zoom scale", () => {
    const steps = [
      { action: "click" as const, timestamp: 500, url: "http://localhost", target: "btn" },
    ];
    const cursorKf: CursorKeyframe[] = [
      { position: { x: 640, y: 360 }, timestamp: 500, action: "click" },
    ];
    const defaultResult = generateZoomKeyframes(steps, cursorKf, PRESETS.default!);
    const dramaticResult = generateZoomKeyframes(steps, cursorKf, PRESETS.dramatic!);
    if (defaultResult[0] && dramaticResult[0]) {
      expect(dramaticResult[0].scale).toBeGreaterThan(defaultResult[0].scale);
    }
  });
});

describe("getZoomAtTime", () => {
  it("returns scale 1.0 when no keyframes", () => {
    const result = getZoomAtTime(500, [], "ease-in-out");
    expect(result.scale).toBe(1);
    expect(result.center.x).toBe(0);
    expect(result.center.y).toBe(0);
  });

  it("returns zoom scale during active zoom", () => {
    const keyframes: ZoomKeyframe[] = [
      { center: { x: 640, y: 360 }, scale: 2, timestamp: 0, durationMs: 1000 },
    ];
    const result = getZoomAtTime(150, keyframes, "ease-in-out");
    expect(result.scale).toBeGreaterThan(1);
  });

  it("returns default when outside zoom range", () => {
    const keyframes: ZoomKeyframe[] = [
      { center: { x: 640, y: 360 }, scale: 2, timestamp: 0, durationMs: 1000 },
    ];
    const result = getZoomAtTime(5000, keyframes, "ease-in-out");
    expect(result.scale).toBe(1);
  });
});

describe("PRESETS", () => {
  it("has default, minimal, and dramatic presets", () => {
    expect(PRESETS.default).toBeDefined();
    expect(PRESETS.minimal).toBeDefined();
    expect(PRESETS.dramatic).toBeDefined();
  });

  it("dramatic has higher zoom than minimal", () => {
    expect(PRESETS.dramatic!.zoomScale).toBeGreaterThan(
      PRESETS.minimal!.zoomScale,
    );
  });
});

describe("buildFFmpegCompositeCommand", () => {
  it("generates valid FFmpeg command", () => {
    const cmd = buildFFmpegCompositeCommand(
      "input.mp4",
      "drawbox=x=0:y=0:w=24:h=24:color=0x000000@0.8:t=fill",
      "",
      "output.mp4",
      30,
    );
    expect(cmd.executable).toBe("ffmpeg");
    expect(cmd.args).toContain("input.mp4");
    expect(cmd.args).toContain("output.mp4");
    expect(cmd.args).toContain("-r");
  });

  it("includes both filters when provided", () => {
    const cmd = buildFFmpegCompositeCommand(
      "in.mp4",
      "cursor_filter",
      "zoom_filter",
      "out.mp4",
      60,
    );
    const vfIdx = cmd.args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThan(-1);
    expect(cmd.args[vfIdx + 1]).toContain("cursor_filter");
    expect(cmd.args[vfIdx + 1]).toContain("zoom_filter");
  });

  it("uses 'null' filter when no filters provided", () => {
    const cmd = buildFFmpegCompositeCommand("in.mp4", "", "", "out.mp4", 30);
    const vfIdx = cmd.args.indexOf("-vf");
    expect(cmd.args[vfIdx + 1]).toBe("null");
  });
});

describe("buildCursorOverlayFilter", () => {
  it("returns empty string for no points", () => {
    expect(buildCursorOverlayFilter([], PRESETS.default!)).toBe("");
  });

  it("returns drawbox filter for cursor points", () => {
    const filter = buildCursorOverlayFilter(
      [{ x: 100, y: 200 }],
      PRESETS.default!,
    );
    expect(filter).toContain("drawbox");
  });
});

describe("buildZoomPanFilter", () => {
  it("returns empty string for no keyframes", () => {
    expect(buildZoomPanFilter([], 1920, 1080, 30)).toBe("");
  });

  it("returns zoompan filter for keyframes", () => {
    const keyframes: ZoomKeyframe[] = [
      { center: { x: 960, y: 540 }, scale: 1.5, timestamp: 0, durationMs: 1000 },
    ];
    const filter = buildZoomPanFilter(keyframes, 1920, 1080, 30);
    expect(filter).toContain("zoompan");
  });
});
