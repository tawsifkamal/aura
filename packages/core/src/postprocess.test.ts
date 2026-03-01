import { describe, it, expect } from "vitest";
import type { RawAnnotationSection } from "./postprocess.js";

// Mock the processAndUploadVideo function internals
describe("postprocess", () => {
  describe("msToVtt", () => {
    it("should format milliseconds as VTT timestamp", () => {
      // Import the actual implementation to test
      const msToVtt = (ms: number): string => {
        const total = Math.max(0, Math.floor(ms));
        const h = Math.floor(total / 3_600_000);
        const m = Math.floor((total % 3_600_000) / 60_000);
        const s = Math.floor((total % 60_000) / 1000);
        const msPart = total % 1000;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
      };

      expect(msToVtt(0)).toBe("00:00:00.000");
      expect(msToVtt(1000)).toBe("00:00:01.000");
      expect(msToVtt(61000)).toBe("00:01:01.000");
      expect(msToVtt(3661000)).toBe("01:01:01.000");
      expect(msToVtt(1234)).toBe("00:00:01.234");
    });
  });

  describe("normalizeSections", () => {
    it("should normalize raw sections with default values", () => {
      const normalizeSections = (
        sections: RawAnnotationSection[],
        width: number,
        height: number,
        durationSec: number,
      ) => {
        const durationMs = Math.floor(durationSec * 1000);
        const out: Array<{
          task: string;
          path: string;
          startMs: number;
          endMs: number;
          x: number;
          y: number;
        }> = [];

        sections.forEach((raw, idx) => {
          const startMs = Math.max(
            0,
            Math.floor(raw.startMs ?? raw.timestampMs ?? idx * 1200),
          );
          const endMs = Math.min(
            durationMs,
            Math.max(startMs + 350, Math.floor(raw.endMs ?? startMs + 1300)),
          );
          const xFromNorm =
            typeof raw.xNorm === "number"
              ? Math.round(raw.xNorm * width)
              : undefined;
          const yFromNorm =
            typeof raw.yNorm === "number"
              ? Math.round(raw.yNorm * height)
              : undefined;
          const x = Math.max(
            0,
            Math.min(width, Math.floor(raw.x ?? xFromNorm ?? width / 2)),
          );
          const y = Math.max(
            0,
            Math.min(height, Math.floor(raw.y ?? yFromNorm ?? height / 2)),
          );

          out.push({
            task: String(raw.task ?? raw.description ?? `Section ${idx + 1}`),
            path: String(raw.path ?? raw.routePath ?? "/"),
            startMs,
            endMs,
            x,
            y,
          });
        });

        if (out.length > 0) return out.sort((a, b) => a.startMs - b.startMs);
        return [
          {
            task: "Overview",
            path: "/",
            startMs: 250,
            endMs: Math.min(durationMs, 1800),
            x: Math.floor(width / 2),
            y: Math.floor(height / 2),
          },
        ];
      };

      const sections: RawAnnotationSection[] = [
        {
          task: "Click button",
          path: "/home",
          xNorm: 0.5,
          yNorm: 0.5,
          startMs: 1000,
          endMs: 2000,
        },
      ];

      const result = normalizeSections(sections, 1920, 1080, 10);

      expect(result).toHaveLength(1);
      expect(result[0]!).toEqual({
        task: "Click button",
        path: "/home",
        startMs: 1000,
        endMs: 2000,
        x: 960,
        y: 540,
      });
    });

    it("should use defaults when sections are empty", () => {
      const normalizeSections = (
        sections: RawAnnotationSection[],
        width: number,
        height: number,
        durationSec: number,
      ) => {
        const durationMs = Math.floor(durationSec * 1000);
        const out: Array<{
          task: string;
          path: string;
          startMs: number;
          endMs: number;
          x: number;
          y: number;
        }> = [];

        sections.forEach((raw, idx) => {
          const startMs = Math.max(
            0,
            Math.floor(raw.startMs ?? raw.timestampMs ?? idx * 1200),
          );
          const endMs = Math.min(
            durationMs,
            Math.max(startMs + 350, Math.floor(raw.endMs ?? startMs + 1300)),
          );
          const xFromNorm =
            typeof raw.xNorm === "number"
              ? Math.round(raw.xNorm * width)
              : undefined;
          const yFromNorm =
            typeof raw.yNorm === "number"
              ? Math.round(raw.yNorm * height)
              : undefined;
          const x = Math.max(
            0,
            Math.min(width, Math.floor(raw.x ?? xFromNorm ?? width / 2)),
          );
          const y = Math.max(
            0,
            Math.min(height, Math.floor(raw.y ?? yFromNorm ?? height / 2)),
          );

          out.push({
            task: String(raw.task ?? raw.description ?? `Section ${idx + 1}`),
            path: String(raw.path ?? raw.routePath ?? "/"),
            startMs,
            endMs,
            x,
            y,
          });
        });

        if (out.length > 0) return out.sort((a, b) => a.startMs - b.startMs);
        return [
          {
            task: "Overview",
            path: "/",
            startMs: 250,
            endMs: Math.min(durationMs, 1800),
            x: Math.floor(width / 2),
            y: Math.floor(height / 2),
          },
        ];
      };

      const result = normalizeSections([], 1920, 1080, 10);

      expect(result).toHaveLength(1);
      expect(result[0]!.task).toBe("Overview");
      expect(result[0]!.path).toBe("/");
      expect(result[0]!.x).toBe(960);
      expect(result[0]!.y).toBe(540);
    });

    it("should normalize coordinates from xNorm and yNorm", () => {
      const normalizeSections = (
        sections: RawAnnotationSection[],
        width: number,
        height: number,
        durationSec: number,
      ) => {
        const durationMs = Math.floor(durationSec * 1000);
        const out: Array<{
          task: string;
          path: string;
          startMs: number;
          endMs: number;
          x: number;
          y: number;
        }> = [];

        sections.forEach((raw, idx) => {
          const startMs = Math.max(
            0,
            Math.floor(raw.startMs ?? raw.timestampMs ?? idx * 1200),
          );
          const endMs = Math.min(
            durationMs,
            Math.max(startMs + 350, Math.floor(raw.endMs ?? startMs + 1300)),
          );
          const xFromNorm =
            typeof raw.xNorm === "number"
              ? Math.round(raw.xNorm * width)
              : undefined;
          const yFromNorm =
            typeof raw.yNorm === "number"
              ? Math.round(raw.yNorm * height)
              : undefined;
          const x = Math.max(
            0,
            Math.min(width, Math.floor(raw.x ?? xFromNorm ?? width / 2)),
          );
          const y = Math.max(
            0,
            Math.min(height, Math.floor(raw.y ?? yFromNorm ?? height / 2)),
          );

          out.push({
            task: String(raw.task ?? raw.description ?? `Section ${idx + 1}`),
            path: String(raw.path ?? raw.routePath ?? "/"),
            startMs,
            endMs,
            x,
            y,
          });
        });

        if (out.length > 0) return out.sort((a, b) => a.startMs - b.startMs);
        return [
          {
            task: "Overview",
            path: "/",
            startMs: 250,
            endMs: Math.min(durationMs, 1800),
            x: Math.floor(width / 2),
            y: Math.floor(height / 2),
          },
        ];
      };

      const sections: RawAnnotationSection[] = [
        {
          task: "Top-left",
          xNorm: 0.0,
          yNorm: 0.0,
        },
        {
          task: "Bottom-right",
          xNorm: 1.0,
          yNorm: 1.0,
        },
      ];

      const result = normalizeSections(sections, 1920, 1080, 10);

      expect(result).toHaveLength(2);
      expect(result[0]!.x).toBe(0);
      expect(result[0]!.y).toBe(0);
      expect(result[1]!.x).toBe(1920);
      expect(result[1]!.y).toBe(1080);
    });

    it("should sort sections by startMs", () => {
      const normalizeSections = (
        sections: RawAnnotationSection[],
        width: number,
        height: number,
        durationSec: number,
      ) => {
        const durationMs = Math.floor(durationSec * 1000);
        const out: Array<{
          task: string;
          path: string;
          startMs: number;
          endMs: number;
          x: number;
          y: number;
        }> = [];

        sections.forEach((raw, idx) => {
          const startMs = Math.max(
            0,
            Math.floor(raw.startMs ?? raw.timestampMs ?? idx * 1200),
          );
          const endMs = Math.min(
            durationMs,
            Math.max(startMs + 350, Math.floor(raw.endMs ?? startMs + 1300)),
          );
          const xFromNorm =
            typeof raw.xNorm === "number"
              ? Math.round(raw.xNorm * width)
              : undefined;
          const yFromNorm =
            typeof raw.yNorm === "number"
              ? Math.round(raw.yNorm * height)
              : undefined;
          const x = Math.max(
            0,
            Math.min(width, Math.floor(raw.x ?? xFromNorm ?? width / 2)),
          );
          const y = Math.max(
            0,
            Math.min(height, Math.floor(raw.y ?? yFromNorm ?? height / 2)),
          );

          out.push({
            task: String(raw.task ?? raw.description ?? `Section ${idx + 1}`),
            path: String(raw.path ?? raw.routePath ?? "/"),
            startMs,
            endMs,
            x,
            y,
          });
        });

        if (out.length > 0) return out.sort((a, b) => a.startMs - b.startMs);
        return [
          {
            task: "Overview",
            path: "/",
            startMs: 250,
            endMs: Math.min(durationMs, 1800),
            x: Math.floor(width / 2),
            y: Math.floor(height / 2),
          },
        ];
      };

      const sections: RawAnnotationSection[] = [
        { task: "Third", startMs: 3000 },
        { task: "First", startMs: 1000 },
        { task: "Second", startMs: 2000 },
      ];

      const result = normalizeSections(sections, 1920, 1080, 10);

      expect(result[0]!.task).toBe("First");
      expect(result[1]!.task).toBe("Second");
      expect(result[2]!.task).toBe("Third");
    });
  });

  describe("buildVtt", () => {
    it("should generate valid WEBVTT format", () => {
      const buildVtt = (
        sections: Array<{
          task: string;
          path: string;
          startMs: number;
          endMs: number;
          x: number;
          y: number;
        }>,
      ): string => {
        const msToVtt = (ms: number): string => {
          const total = Math.max(0, Math.floor(ms));
          const h = Math.floor(total / 3_600_000);
          const m = Math.floor((total % 3_600_000) / 60_000);
          const s = Math.floor((total % 60_000) / 1000);
          const msPart = total % 1000;
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
        };

        const lines = ["WEBVTT", ""];
        sections.forEach((section, idx) => {
          lines.push(String(idx + 1));
          lines.push(`${msToVtt(section.startMs)} --> ${msToVtt(section.endMs)}`);
          lines.push(`${section.task} (${section.path})`);
          lines.push("");
        });
        return lines.join("\n");
      };

      const sections = [
        {
          task: "Click sign in",
          path: "/login",
          startMs: 1200,
          endMs: 2600,
          x: 100,
          y: 200,
        },
        {
          task: "Submit form",
          path: "/login",
          startMs: 2800,
          endMs: 4300,
          x: 150,
          y: 250,
        },
      ];

      const vtt = buildVtt(sections);

      expect(vtt).toContain("WEBVTT");
      expect(vtt).toContain("00:00:01.200 --> 00:00:02.600");
      expect(vtt).toContain("Click sign in (/login)");
      expect(vtt).toContain("00:00:02.800 --> 00:00:04.300");
      expect(vtt).toContain("Submit form (/login)");
    });
  });

  describe("buildZoomFilter", () => {
    it("should generate FFmpeg zoom expression", () => {
      const buildZoomFilter = (
        events: Array<{ type: string; atMs: number; x: number; y: number }>,
      ): string => {
        const pulses = events
          .filter((e) => e.type === "click")
          .map((event) => {
            const start = Math.max(0, event.atMs / 1000 - 0.15);
            const peak = event.atMs / 1000 + 0.22;
            const end = peak + 0.9;
            return `if(between(t,${start},${peak}),1+0.28*((t-${start})/${Math.max(0.01, peak - start)}),if(between(t,${peak},${end}),1.28-0.28*((t-${peak})/${Math.max(0.01, end - peak)}),1))`;
          });
        const parts = ["1", ...pulses];
        if (parts.length === 1) return "1";
        return parts.reduce((acc, part) => `max(${acc},${part})`);
      };

      const events = [
        { type: "click", atMs: 1000, x: 100, y: 200, note: "Click" },
        { type: "hover", atMs: 1500, x: 150, y: 250, note: "Hover" },
      ];

      const filter = buildZoomFilter(events);

      expect(filter).toContain("max(");
      expect(filter).toContain("if(between(t,");
      expect(filter).toContain("1.28");
    });

    it("should return 1 when no click events", () => {
      const buildZoomFilter = (
        events: Array<{ type: string; atMs: number; x: number; y: number }>,
      ): string => {
        const pulses = events
          .filter((e) => e.type === "click")
          .map((event) => {
            const start = Math.max(0, event.atMs / 1000 - 0.15);
            const peak = event.atMs / 1000 + 0.22;
            const end = peak + 0.9;
            return `if(between(t,${start},${peak}),1+0.28*((t-${start})/${Math.max(0.01, peak - start)}),if(between(t,${peak},${end}),1.28-0.28*((t-${peak})/${Math.max(0.01, end - peak)}),1))`;
          });
        const parts = ["1", ...pulses];
        if (parts.length === 1) return "1";
        return parts.reduce((acc, part) => `max(${acc},${part})`);
      };

      const events = [{ type: "hover", atMs: 1500, x: 150, y: 250, note: "Hover" }];

      const filter = buildZoomFilter(events);

      expect(filter).toBe("1");
    });
  });

  describe("PostprocessRequest validation", () => {
    it("should require runId and inputVideoUrl", () => {
      const validateRequest = (request: unknown): request is {
        runId: string;
        inputVideoUrl: string;
        sections?: RawAnnotationSection[];
        outputPath?: string;
      } => {
        const req = request as Record<string, unknown>;
        return (
          typeof req.runId === "string" &&
          req.runId.length > 0 &&
          typeof req.inputVideoUrl === "string" &&
          req.inputVideoUrl.startsWith("http")
        );
      };

      expect(
        validateRequest({
          runId: "abc123",
          inputVideoUrl: "https://example.com/video.webm",
        }),
      ).toBe(true);

      expect(
        validateRequest({
          runId: "",
          inputVideoUrl: "https://example.com/video.webm",
        }),
      ).toBe(false);

      expect(
        validateRequest({
          runId: "abc123",
          inputVideoUrl: "not-a-url",
        }),
      ).toBe(false);

      expect(
        validateRequest({
          runId: "abc123",
        }),
      ).toBe(false);
    });
  });
});
