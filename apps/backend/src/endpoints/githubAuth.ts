import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

const SCOPES = ["repo", "workflow", "read:user", "user:email"].join(" ");

export class GitHubAuthRedirect extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Generate GitHub OAuth authorization URL and redirect",
    responses: {
      "302": {
        description: "Redirects to GitHub OAuth authorization page",
      },
      "200": {
        description:
          "Returns the authorization URL (if ?redirect=false is set)",
        content: {
          "application/json": {
            schema: z.object({
              authorization_url: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    const clientId = c.env.GITHUB_CLIENT_ID;
    const redirectUri = c.env.GITHUB_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return c.json(
        { error: "GitHub OAuth not configured on server" },
        { status: 500 }
      );
    }

    const url = new URL(c.req.url);
    const redirectTo = url.searchParams.get("redirect_to");

    // Encode redirect_to in state so it survives the OAuth round-trip
    const nonce = crypto.randomUUID();
    const state = redirectTo
      ? btoa(JSON.stringify({ nonce, redirect_to: redirectTo }))
      : nonce;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
    });

    const authorizationUrl = `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;

    if (url.searchParams.get("redirect") === "false") {
      return c.json({ authorization_url: authorizationUrl, state });
    }

    return c.redirect(authorizationUrl, 302);
  }
}
