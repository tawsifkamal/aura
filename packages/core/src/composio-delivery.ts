/**
 * Composio integration for multi-channel delivery.
 *
 * Routes completed demo videos and summaries to user-linked channels
 * (Slack, Discord, email, etc.) via the Composio SDK. Falls back to
 * AgentMail (US-013) when no Composio channels are configured.
 */

import { sendEmail, getAgentMailConfig } from "./agentmail.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelType =
  | "slack"
  | "discord"
  | "email"
  | "teams"
  | "telegram"
  | "webhook";

export interface ChannelConfig {
  type: ChannelType;
  id: string;
  name: string;
  target: string; // channel ID, email, webhook URL, etc.
  enabled: boolean;
}

export interface DeliveryPreferences {
  userId: string;
  channels: ChannelConfig[];
  fallbackToEmail: boolean;
  emailAddress?: string;
}

export interface DeliveryPayload {
  runId: string;
  dashboardUrl: string;
  videoUrl?: string;
  summary: string;
  status: "completed" | "failed";
  routesTested?: string[];
  branch?: string;
  pr?: number;
  error?: string;
}

export interface ChannelDeliveryResult {
  channel: ChannelConfig;
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface DeliveryResult {
  results: ChannelDeliveryResult[];
  usedFallback: boolean;
  fallbackResult?: { success: boolean; error?: string };
}

export interface ComposioConfig {
  apiKey: string;
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getComposioConfig(): ComposioConfig | null {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const baseUrl =
    process.env.COMPOSIO_BASE_URL ?? "https://backend.composio.dev/api/v1";

  if (!apiKey) return null;

  return { apiKey, baseUrl };
}

export function isComposioAvailable(): boolean {
  return getComposioConfig() !== null;
}

// ---------------------------------------------------------------------------
// Channel-specific message formatting
// ---------------------------------------------------------------------------

function formatSlackMessage(payload: DeliveryPayload): Record<string, unknown> {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text:
          payload.status === "completed"
            ? "Demo Recording Complete"
            : "Demo Recording Failed",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: payload.summary,
      },
    },
  ];

  if (payload.dashboardUrl) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${payload.dashboardUrl}|View on Dashboard>`,
      },
    });
  }

  if (payload.videoUrl) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${payload.videoUrl}|Watch Video>`,
      },
    });
  }

  if (payload.routesTested && payload.routesTested.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Routes tested:* ${payload.routesTested.map((r) => `\`${r}\``).join(", ")}`,
      },
    });
  }

  if (payload.pr) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `PR #${String(payload.pr)}${payload.branch ? ` | Branch: ${payload.branch}` : ""}`,
        },
      ],
    });
  }

  if (payload.error) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Error:*\n\`\`\`${payload.error}\`\`\``,
      },
    });
  }

  return { blocks };
}

function formatDiscordMessage(
  payload: DeliveryPayload,
): Record<string, unknown> {
  const embed: Record<string, unknown> = {
    title:
      payload.status === "completed"
        ? "Demo Recording Complete"
        : "Demo Recording Failed",
    description: payload.summary,
    color: payload.status === "completed" ? 0x000000 : 0x999999,
    fields: [] as Array<Record<string, unknown>>,
  };

  const fields = embed.fields as Array<Record<string, unknown>>;

  if (payload.dashboardUrl) {
    fields.push({
      name: "Dashboard",
      value: `[View](${payload.dashboardUrl})`,
      inline: true,
    });
  }

  if (payload.videoUrl) {
    fields.push({
      name: "Video",
      value: `[Watch](${payload.videoUrl})`,
      inline: true,
    });
  }

  if (payload.routesTested && payload.routesTested.length > 0) {
    fields.push({
      name: "Routes Tested",
      value: payload.routesTested.map((r) => `\`${r}\``).join(", "),
    });
  }

  if (payload.pr) {
    fields.push({
      name: "PR",
      value: `#${String(payload.pr)}`,
      inline: true,
    });
  }

  if (payload.error) {
    fields.push({
      name: "Error",
      value: `\`\`\`${payload.error}\`\`\``,
    });
  }

  return { embeds: [embed] };
}

function formatGenericMessage(payload: DeliveryPayload): string {
  const lines: string[] = [
    payload.status === "completed"
      ? "Demo Recording Complete"
      : "Demo Recording Failed",
    "",
    payload.summary,
    "",
  ];

  if (payload.dashboardUrl) {
    lines.push(`Dashboard: ${payload.dashboardUrl}`);
  }
  if (payload.videoUrl) {
    lines.push(`Video: ${payload.videoUrl}`);
  }
  if (payload.routesTested && payload.routesTested.length > 0) {
    lines.push(`Routes tested: ${payload.routesTested.join(", ")}`);
  }
  if (payload.pr) {
    lines.push(`PR #${String(payload.pr)}`);
  }
  if (payload.error) {
    lines.push(`Error: ${payload.error}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Composio API calls
// ---------------------------------------------------------------------------

async function executeComposioAction(
  config: ComposioConfig,
  action: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${config.baseUrl}/actions/${action}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({ input: params }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `Composio action ${action} failed (${String(res.status)}): ${text}`,
      };
    }

    const data = (await res.json()) as unknown;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: `Composio action error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Channel delivery
// ---------------------------------------------------------------------------

async function deliverToChannel(
  config: ComposioConfig,
  channel: ChannelConfig,
  payload: DeliveryPayload,
): Promise<ChannelDeliveryResult> {
  try {
    let result: { success: boolean; data?: unknown; error?: string };

    switch (channel.type) {
      case "slack": {
        const message = formatSlackMessage(payload);
        result = await executeComposioAction(config, "SLACK_SEND_MESSAGE", {
          channel: channel.target,
          ...message,
        });
        break;
      }
      case "discord": {
        const message = formatDiscordMessage(payload);
        result = await executeComposioAction(
          config,
          "DISCORD_SEND_MESSAGE",
          {
            channel_id: channel.target,
            ...message,
          },
        );
        break;
      }
      case "teams": {
        const text = formatGenericMessage(payload);
        result = await executeComposioAction(
          config,
          "MICROSOFT_TEAMS_SEND_MESSAGE",
          {
            channel_id: channel.target,
            content: text,
          },
        );
        break;
      }
      case "telegram": {
        const text = formatGenericMessage(payload);
        result = await executeComposioAction(
          config,
          "TELEGRAM_SEND_MESSAGE",
          {
            chat_id: channel.target,
            text,
          },
        );
        break;
      }
      case "webhook": {
        try {
          const res = await fetch(channel.target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          result = {
            success: res.ok,
            error: res.ok ? undefined : `Webhook returned ${String(res.status)}`,
          };
        } catch (err) {
          result = {
            success: false,
            error: `Webhook error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
        break;
      }
      case "email": {
        const agentMailConfig = getAgentMailConfig();
        if (agentMailConfig) {
          const emailResult = await sendEmail(agentMailConfig, {
            to: channel.target,
            subject:
              payload.status === "completed"
                ? "Demo Recording Complete"
                : "Demo Recording Failed",
            dashboardUrl: payload.dashboardUrl,
            videoUrl: payload.videoUrl,
            summary: payload.summary,
            status: payload.status,
            routesTested: payload.routesTested,
            error: payload.error,
          });
          result = {
            success: emailResult.success,
            error: emailResult.error,
          };
        } else {
          result = {
            success: false,
            error: "AgentMail not configured for email delivery",
          };
        }
        break;
      }
    }

    return {
      channel,
      success: result.success,
      error: result.error,
      messageId: typeof result.data === "string" ? result.data : undefined,
    };
  } catch (err) {
    return {
      channel,
      success: false,
      error: `Delivery failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Main delivery orchestration
// ---------------------------------------------------------------------------

/**
 * Deliver a run result to all enabled channels for a user.
 *
 * Attempts delivery to each enabled channel independently — one
 * channel's failure does not block others. If no Composio channels
 * are configured or all fail, falls back to AgentMail email.
 */
export async function deliverToAllChannels(
  preferences: DeliveryPreferences,
  payload: DeliveryPayload,
): Promise<DeliveryResult> {
  const enabledChannels = preferences.channels.filter((c) => c.enabled);

  // No channels configured — use fallback
  if (enabledChannels.length === 0) {
    const fallbackResult = await deliverFallbackEmail(preferences, payload);
    return {
      results: [],
      usedFallback: true,
      fallbackResult,
    };
  }

  const config = getComposioConfig();

  // Composio not configured — use fallback
  if (!config) {
    const fallbackResult = await deliverFallbackEmail(preferences, payload);
    return {
      results: [],
      usedFallback: true,
      fallbackResult,
    };
  }

  // Deliver to all enabled channels in parallel
  const results = await Promise.all(
    enabledChannels.map((channel) =>
      deliverToChannel(config, channel, payload),
    ),
  );

  // If all channels failed and fallback is enabled, try email
  const allFailed = results.every((r) => !r.success);
  let usedFallback = false;
  let fallbackResult: { success: boolean; error?: string } | undefined;

  if (allFailed && preferences.fallbackToEmail) {
    fallbackResult = await deliverFallbackEmail(preferences, payload);
    usedFallback = true;
  }

  return { results, usedFallback, fallbackResult };
}

async function deliverFallbackEmail(
  preferences: DeliveryPreferences,
  payload: DeliveryPayload,
): Promise<{ success: boolean; error?: string }> {
  const agentMailConfig = getAgentMailConfig();
  if (!agentMailConfig) {
    return { success: false, error: "AgentMail not configured" };
  }

  const to = preferences.emailAddress;
  if (!to) {
    return { success: false, error: "No fallback email address configured" };
  }

  const result = await sendEmail(agentMailConfig, {
    to,
    subject:
      payload.status === "completed"
        ? "Demo Recording Complete"
        : "Demo Recording Failed",
    dashboardUrl: payload.dashboardUrl,
    videoUrl: payload.videoUrl,
    summary: payload.summary,
    status: payload.status,
    routesTested: payload.routesTested,
    error: payload.error,
  });

  return { success: result.success, error: result.error };
}

// ---------------------------------------------------------------------------
// Connection management helpers
// ---------------------------------------------------------------------------

/**
 * Build a Composio OAuth initiation URL for connecting a new channel.
 */
export function buildConnectionUrl(
  channelType: ChannelType,
  redirectUrl: string,
): string | null {
  const config = getComposioConfig();
  if (!config) return null;

  const integrationMap: Record<ChannelType, string> = {
    slack: "slack",
    discord: "discord",
    email: "gmail",
    teams: "microsoft-teams",
    telegram: "telegram",
    webhook: "",
  };

  const integration = integrationMap[channelType];
  if (!integration) return null;

  return `${config.baseUrl}/integrations/${integration}/connect?redirect_url=${encodeURIComponent(redirectUrl)}`;
}

/**
 * Check if a specific channel integration is connected via Composio.
 */
export async function checkConnection(
  channelType: ChannelType,
): Promise<boolean> {
  const config = getComposioConfig();
  if (!config) return false;

  const integrationMap: Record<ChannelType, string> = {
    slack: "slack",
    discord: "discord",
    email: "gmail",
    teams: "microsoft-teams",
    telegram: "telegram",
    webhook: "",
  };

  const integration = integrationMap[channelType];
  if (!integration) return channelType === "webhook"; // Webhooks don't need OAuth

  try {
    const res = await fetch(
      `${config.baseUrl}/connectedAccounts?integration_id=${integration}`,
      {
        headers: { "x-api-key": config.apiKey },
      },
    );

    if (!res.ok) return false;

    const data = (await res.json()) as { items?: unknown[] };
    return (data.items?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
