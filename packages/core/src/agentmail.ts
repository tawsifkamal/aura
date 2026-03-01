export interface AgentMailConfig {
  apiKey: string;
  from?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  dashboardUrl: string;
  videoUrl?: string;
  status: "completed" | "failed";
  summary: string;
  routesTested?: string[];
  prUrl?: string;
  prCommentUrl?: string;
  error?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function buildEmailHtml(payload: EmailPayload): string {
  const statusLabel =
    payload.status === "completed" ? "Completed" : "Failed";

  const sections: string[] = [
    `<h2>Aura Demo Recording — ${statusLabel}</h2>`,
    `<p>${payload.summary}</p>`,
  ];

  if (payload.dashboardUrl) {
    sections.push(
      `<p><strong>Dashboard:</strong> <a href="${payload.dashboardUrl}">${payload.dashboardUrl}</a></p>`,
    );
  }

  if (payload.videoUrl) {
    sections.push(
      `<p><strong>Video:</strong> <a href="${payload.videoUrl}">Watch recording</a></p>`,
    );
  }

  if (payload.routesTested && payload.routesTested.length > 0) {
    const routeItems = payload.routesTested
      .map((r) => `<li><code>${r}</code></li>`)
      .join("");
    sections.push(
      `<p><strong>Routes tested:</strong></p><ul>${routeItems}</ul>`,
    );
  }

  if (payload.prUrl) {
    sections.push(
      `<p><strong>Pull Request:</strong> <a href="${payload.prUrl}">${payload.prUrl}</a></p>`,
    );
  }

  if (payload.prCommentUrl) {
    sections.push(
      `<p><strong>PR Comment:</strong> <a href="${payload.prCommentUrl}">View comment</a></p>`,
    );
  }

  if (payload.error) {
    sections.push(
      `<p><strong>Error:</strong></p><pre>${payload.error}</pre>`,
    );
  }

  sections.push(
    `<hr><p style="color:#888;font-size:12px">Sent by Aura — demo video bot</p>`,
  );

  return sections.join("\n");
}

function buildEmailText(payload: EmailPayload): string {
  const statusLabel =
    payload.status === "completed" ? "Completed" : "Failed";

  const lines: string[] = [
    `Aura Demo Recording — ${statusLabel}`,
    "",
    payload.summary,
    "",
    `Dashboard: ${payload.dashboardUrl}`,
  ];

  if (payload.videoUrl) {
    lines.push(`Video: ${payload.videoUrl}`);
  }

  if (payload.routesTested && payload.routesTested.length > 0) {
    lines.push("", "Routes tested:");
    for (const r of payload.routesTested) {
      lines.push(`  - ${r}`);
    }
  }

  if (payload.prUrl) {
    lines.push(`PR: ${payload.prUrl}`);
  }

  if (payload.error) {
    lines.push("", `Error: ${payload.error}`);
  }

  return lines.join("\n");
}

export async function sendEmail(
  config: AgentMailConfig,
  payload: EmailPayload,
): Promise<SendResult> {
  const from = config.from ?? "aura@agentmail.to";
  const statusLabel =
    payload.status === "completed" ? "Completed" : "Failed";

  try {
    const res = await fetch("https://api.agentmail.to/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject:
          payload.subject ||
          `Aura Demo Recording — ${statusLabel}`,
        html: buildEmailHtml(payload),
        text: buildEmailText(payload),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `AgentMail API error ${String(res.status)}: ${text}`,
      };
    }

    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export function getAgentMailConfig(): AgentMailConfig | null {
  const apiKey = process.env["AGENTMAIL_API_KEY"];
  if (!apiKey) return null;

  return {
    apiKey,
    from: process.env["AGENTMAIL_FROM"],
  };
}
