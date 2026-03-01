/**
 * Conversational video editing via Composio channels.
 *
 * Parses natural language edit requests from Slack/Discord/email
 * replies and translates them into structured editing API calls
 * (US-014). Supports multi-round conversational editing threads.
 */

import { deliverToAllChannels } from "./composio-delivery.js";
import type {
  DeliveryPreferences,
  DeliveryPayload,
  ChannelConfig,
} from "./composio-delivery.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditOperationType =
  | "crop"
  | "trim"
  | "split"
  | "zoom"
  | "cursor_emphasis"
  | "style_preset"
  | "export";

export interface ParsedEditRequest {
  type: EditOperationType;
  params: Record<string, unknown>;
  confidence: number;
  rawText: string;
}

export interface ConversationContext {
  runId: string;
  channelType: string;
  channelTarget: string;
  threadId?: string;
  editHistory: ParsedEditRequest[];
}

export interface EditReply {
  message: string;
  success: boolean;
  editVersionId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// NLP parsing — pattern-based extraction
// ---------------------------------------------------------------------------

const TRIM_PATTERNS = [
  /trim\s+(?:the\s+)?first\s+(\d+)\s*(?:s(?:econds?)?|ms)/i,
  /trim\s+(?:the\s+)?last\s+(\d+)\s*(?:s(?:econds?)?|ms)/i,
  /cut\s+(?:from\s+)?(\d+)\s*(?:s|ms)?\s*(?:to|-)?\s*(\d+)\s*(?:s|ms)?/i,
  /remove\s+(?:the\s+)?(?:first|last)\s+(\d+)\s*(?:s(?:econds?)?|ms)/i,
  /trim\s+(?:to\s+)?(\d+)\s*(?:s|ms)?\s*(?:to|-)\s*(\d+)\s*(?:s|ms)?/i,
  /keep\s+only\s+(\d+)\s*(?:s|ms)?\s*(?:to|-)\s*(\d+)\s*(?:s|ms)?/i,
];

const ZOOM_PATTERNS = [
  /zoom\s+(?:in(?:to)?|on)\s+(?:the\s+)?(.+?)(?:\s+at\s+(\d+)\s*(?:s|ms)?)?$/i,
  /(?:focus|magnify)\s+(?:on\s+)?(?:the\s+)?(.+)/i,
  /zoom\s+(\d+(?:\.\d+)?)\s*x/i,
  /(?:increase|more)\s+zoom/i,
  /(?:decrease|less|reduce)\s+zoom/i,
];

const CROP_PATTERNS = [
  /crop\s+(?:to\s+)?(\d+)\s*x\s*(\d+)/i,
  /crop\s+(?:the\s+)?(?:top|bottom|left|right)/i,
  /resize\s+(?:to\s+)?(\d+)\s*x\s*(\d+)/i,
];

const SPLIT_PATTERNS = [
  /split\s+at\s+(\d+)\s*(?:s(?:econds?)?|ms)/i,
  /(?:remove|delete|cut)\s+(?:everything\s+)?(?:before|after)\s+(\d+)\s*(?:s(?:econds?)?|ms)/i,
];

const STYLE_PATTERNS = [
  /(?:make\s+it|switch\s+to|use|apply)\s+(?:the\s+)?(minimal|dramatic|default)\s*(?:style|preset|theme)?/i,
  /(?:more|less)\s+(dramatic|minimal|subtle)/i,
  /(minimal|dramatic|default)\s+(?:style|preset|mode)/i,
];

const CURSOR_PATTERNS = [
  /(?:bigger|larger|increase)\s+cursor/i,
  /(?:smaller|decrease|reduce)\s+cursor/i,
  /(?:add|more|longer)\s+(?:cursor\s+)?trail/i,
  /(?:remove|no|shorter)\s+(?:cursor\s+)?trail/i,
  /(?:smooth|smoother)\s+cursor/i,
  /cursor\s+(?:size|emphasis)\s+(\d+)/i,
];

const EXPORT_PATTERNS = [
  /(?:make\s+it|export\s+as|convert\s+to)\s+(?:a\s+)?gif/i,
  /(?:make\s+it|export\s+as|convert\s+to)\s+(?:an?\s+)?mp4/i,
  /(?:export|download|save)\s+(?:as\s+)?(mp4|gif)/i,
  /(\d+)\s*fps/i,
  /(?:higher|lower|better)\s+quality/i,
];

function parseMs(value: string, unit?: string): number {
  const num = Number(value);
  if (unit && (unit.startsWith("s") || unit === "seconds")) {
    return num * 1000;
  }
  // If value is small (< 300), assume seconds
  if (num < 300 && !unit) return num * 1000;
  return num;
}

/**
 * Parse a natural language edit request into a structured operation.
 * Returns null if the request cannot be understood.
 */
export function parseEditRequest(text: string): ParsedEditRequest | null {
  const normalized = text.trim();

  // --- Trim ---
  for (const pattern of TRIM_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const isTrimFirst = /first|beginning|start/i.test(normalized);
      const isTrimLast = /last|end/i.test(normalized);
      const isRange = match[2] !== undefined;

      if (isRange && match[1] && match[2]) {
        return {
          type: "trim",
          params: {
            startMs: parseMs(match[1]),
            endMs: parseMs(match[2]),
          },
          confidence: 0.9,
          rawText: normalized,
        };
      }

      if (match[1]) {
        const ms = parseMs(match[1]);
        if (isTrimFirst) {
          return {
            type: "trim",
            params: { startMs: ms, endMs: -1 },
            confidence: 0.85,
            rawText: normalized,
          };
        }
        if (isTrimLast) {
          return {
            type: "trim",
            params: { startMs: 0, endMs: -ms },
            confidence: 0.85,
            rawText: normalized,
          };
        }
      }

      return {
        type: "trim",
        params: { startMs: 0, endMs: parseMs(match[1] ?? "0") },
        confidence: 0.7,
        rawText: normalized,
      };
    }
  }

  // --- Zoom ---
  for (const pattern of ZOOM_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const intensityMatch = normalized.match(/(\d+(?:\.\d+)?)\s*x/i);
      const intensity = intensityMatch ? Number(intensityMatch[1]) : 2.0;
      const atMatch = normalized.match(/at\s+(\d+)\s*(?:s|ms)?/i);
      const startMs = atMatch?.[1] ? parseMs(atMatch[1]) : 0;

      return {
        type: "zoom",
        params: {
          intensity,
          centerX: 640,
          centerY: 360,
          startMs,
          durationMs: 2000,
        },
        confidence: /zoom/i.test(normalized) ? 0.85 : 0.7,
        rawText: normalized,
      };
    }
  }

  // --- Export / GIF ---
  for (const pattern of EXPORT_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const format = /gif/i.test(normalized) ? "gif" : "mp4";
      const fpsMatch = normalized.match(/(\d+)\s*fps/i);
      const fps = fpsMatch ? Number(fpsMatch[1]) : format === "gif" ? 15 : 30;

      let quality: "web" | "high" | "preview" = "web";
      if (/higher|better|high/i.test(normalized)) quality = "high";
      if (/lower|preview|small/i.test(normalized)) quality = "preview";

      return {
        type: "export",
        params: { format, fps, quality },
        confidence: 0.9,
        rawText: normalized,
      };
    }
  }

  // --- Style presets ---
  for (const pattern of STYLE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const preset = match[1].toLowerCase();
      const mapped =
        preset === "subtle" ? "minimal" : (preset as "default" | "minimal" | "dramatic");
      return {
        type: "style_preset",
        params: { preset: mapped },
        confidence: 0.9,
        rawText: normalized,
      };
    }
  }

  // --- Crop ---
  for (const pattern of CROP_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const width = match[1] ? Number(match[1]) : 1280;
      const height = match[2] ? Number(match[2]) : 720;
      return {
        type: "crop",
        params: { x: 0, y: 0, width, height },
        confidence: 0.8,
        rawText: normalized,
      };
    }
  }

  // --- Split ---
  for (const pattern of SPLIT_PATTERNS) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const atMs = parseMs(match[1]);
      const removeSegment = /before/i.test(normalized) ? "before" : "after";
      return {
        type: "split",
        params: { atMs, removeSegment },
        confidence: 0.85,
        rawText: normalized,
      };
    }
  }

  // --- Cursor ---
  for (const pattern of CURSOR_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const sizeMatch = normalized.match(/(\d+)\s*(?:px)?/);
      const size = sizeMatch ? Number(sizeMatch[1]) : 20;

      let trailLength = 5;
      if (/no\s+trail|remove\s+trail|shorter/i.test(normalized)) trailLength = 0;
      if (/more\s+trail|longer|add/i.test(normalized)) trailLength = 12;

      let smoothing = 0.5;
      if (/smooth/i.test(normalized)) smoothing = 0.8;

      const isBigger = /bigger|larger|increase/i.test(normalized);
      const isSmaller = /smaller|decrease|reduce/i.test(normalized);

      return {
        type: "cursor_emphasis",
        params: {
          trailLength,
          size: isBigger ? 32 : isSmaller ? 12 : size,
          smoothing,
        },
        confidence: 0.75,
        rawText: normalized,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Build editing API call from parsed request
// ---------------------------------------------------------------------------

export function buildEditAPICall(
  runId: string,
  request: ParsedEditRequest,
  parentVersionId?: string,
): {
  path: string;
  args: Record<string, unknown>;
} | null {
  if (request.type === "export") {
    return {
      path: "exports:create",
      args: {
        runId,
        format: request.params.format ?? "mp4",
        fps: request.params.fps ?? 30,
        width: 1280,
        height: 720,
        quality: request.params.quality ?? "web",
      },
    };
  }

  return {
    path: "edits:applyEdit",
    args: {
      runId,
      ...(parentVersionId ? { parentVersionId } : {}),
      operation: {
        type: request.type,
        ...request.params,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Execute edit via Convex
// ---------------------------------------------------------------------------

export async function executeEditRequest(
  convexUrl: string,
  runId: string,
  request: ParsedEditRequest,
  parentVersionId?: string,
): Promise<EditReply> {
  const call = buildEditAPICall(runId, request, parentVersionId);
  if (!call) {
    return {
      message: "I couldn't understand that edit request. Try something like 'trim the first 5 seconds' or 'make it a GIF'.",
      success: false,
    };
  }

  try {
    const res = await fetch(`${convexUrl}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: call.path,
        args: call.args,
        format: "json",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        message: `Edit failed: ${text}`,
        success: false,
        error: text,
      };
    }

    const data = (await res.json()) as { value: string };

    const opLabel = request.type === "export" ? "Export" : request.type;
    return {
      message: `${opLabel} applied successfully. Processing your request...`,
      success: true,
      editVersionId: data.value,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      message: `Edit failed: ${errMsg}`,
      success: false,
      error: errMsg,
    };
  }
}

// ---------------------------------------------------------------------------
// Conversational handler — full round-trip
// ---------------------------------------------------------------------------

/**
 * Handle an incoming conversational edit request.
 *
 * 1. Parse the natural language request
 * 2. Execute the edit via the backend API
 * 3. Send a reply back through the same channel
 */
export async function handleEditMessage(
  context: ConversationContext,
  messageText: string,
  convexUrl: string,
  preferences?: DeliveryPreferences,
): Promise<EditReply> {
  // Parse the request
  const parsed = parseEditRequest(messageText);
  if (!parsed) {
    const reply: EditReply = {
      message:
        "I didn't understand that edit request. Try:\n" +
        "- 'trim the first 5 seconds'\n" +
        "- 'zoom in on the button click'\n" +
        "- 'make it a GIF'\n" +
        "- 'use dramatic style'\n" +
        "- 'bigger cursor'\n" +
        "- 'crop to 1280x720'",
      success: false,
    };

    // Send help message back
    if (preferences) {
      await sendReplyToChannel(preferences, context, reply.message);
    }

    return reply;
  }

  // Find parent version from edit history
  const lastEdit = context.editHistory[context.editHistory.length - 1];
  const parentVersionId = lastEdit
    ? (lastEdit.params.editVersionId as string | undefined)
    : undefined;

  // Execute the edit
  const reply = await executeEditRequest(
    convexUrl,
    context.runId,
    parsed,
    parentVersionId,
  );

  // Track in conversation history
  context.editHistory.push(parsed);

  // Send reply back through channel
  if (preferences) {
    await sendReplyToChannel(preferences, context, reply.message);

    // If edit was successful and produced a new version, re-deliver the video
    if (reply.success && reply.editVersionId && parsed.type !== "export") {
      const redeliveryPayload: DeliveryPayload = {
        runId: context.runId,
        dashboardUrl: `${process.env.DASHBOARD_BASE_URL ?? "http://localhost:3000"}/runs/${context.runId}`,
        summary: `Video updated: ${parsed.type} applied`,
        status: "completed",
      };
      await deliverToAllChannels(preferences, redeliveryPayload);
    }
  }

  return reply;
}

async function sendReplyToChannel(
  preferences: DeliveryPreferences,
  context: ConversationContext,
  message: string,
): Promise<void> {
  // Find the originating channel
  const channel = preferences.channels.find(
    (c) =>
      c.type === context.channelType && c.target === context.channelTarget,
  );

  if (!channel) return;

  const replyChannel: ChannelConfig = {
    ...channel,
    enabled: true,
  };

  const replyPrefs: DeliveryPreferences = {
    ...preferences,
    channels: [replyChannel],
    fallbackToEmail: false,
  };

  await deliverToAllChannels(replyPrefs, {
    runId: context.runId,
    dashboardUrl: `${process.env.DASHBOARD_BASE_URL ?? "http://localhost:3000"}/runs/${context.runId}`,
    summary: message,
    status: "completed",
  });
}
