import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext, ALLOWED_ORIGINS } from "../types";
import { setCookie } from "hono/cookie";
import { signSession } from "../cookie";
import { ConvexClient } from "../convex";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  html_url: string;
  default_branch: string;
}

export class GitHubCallback extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Handle GitHub OAuth callback",
    request: {
      query: z.object({
        code: z.string(),
        state: z.string().optional(),
      }),
    },
    responses: {
      "200": {
        description: "OAuth successful — returns user, token, and repos",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              user: z.object({
                id: z.number(),
                login: z.string(),
                email: z.string().nullable(),
                name: z.string().nullable(),
                avatar_url: z.string(),
              }),
              repositories: z.array(
                z.object({
                  id: z.number(),
                  full_name: z.string(),
                  name: z.string(),
                  owner: z.string(),
                  private: z.boolean(),
                  html_url: z.string(),
                  default_branch: z.string(),
                })
              ),
              scopes: z.string(),
            }),
          },
        },
      },
      "400": {
        description: "OAuth error",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
              error_description: z.string().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { code } = data.query;

    const clientId = c.env.GITHUB_CLIENT_ID;
    const clientSecret = c.env.GITHUB_CLIENT_SECRET;
    const redirectUri = c.env.GITHUB_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return c.json(
        { error: "GitHub OAuth not configured on server" },
        { status: 500 }
      );
    }

    // Exchange code for access token
    const tokenRes = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = (await tokenRes.json()) as GitHubTokenResponse;

    if (tokenData.error) {
      return c.json(
        {
          error: tokenData.error,
          error_description: tokenData.error_description,
        },
        { status: 400 }
      );
    }

    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope;

    // Fetch user profile and repos in parallel
    const [userRes, reposRes] = await Promise.all([
      fetch(`${GITHUB_API}/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "aura-backend",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
      fetch(`${GITHUB_API}/user/repos?per_page=100&sort=updated&type=all`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "aura-backend",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
    ]);

    if (!userRes.ok) {
      const body = await userRes.text();
      console.error(`[github] /user failed: ${userRes.status} ${body}`);
      return c.json(
        {
          error: "Failed to fetch GitHub user profile",
          github_status: userRes.status,
          detail: body,
        },
        { status: 502 }
      );
    }

    const user = (await userRes.json()) as GitHubUser;
    const repos = reposRes.ok
      ? ((await reposRes.json()) as GitHubRepo[])
      : [];

    const repoList = repos.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: r.owner.login,
      private: r.private,
      html_url: r.html_url,
      default_branch: r.default_branch,
    }));

    const credentials = {
      github_user_id: user.id,
      github_login: user.login,
      access_token: accessToken,
      scopes,
      repositories: repoList,
      connected_at: new Date().toISOString(),
    };

    // Store credentials in Convex
    const convex = new ConvexClient(c.env.CONVEX_URL, c.env.CONVEX_DEPLOY_KEY);
    await convex.mutation("users:upsert", {
      githubUserId: user.id,
      githubLogin: user.login,
      accessToken: accessToken,
      scopes,
      repositories: repoList.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        name: r.name,
        owner: r.owner,
        isPrivate: r.private,
        htmlUrl: r.html_url,
        defaultBranch: r.default_branch,
      })),
      connectedAt: credentials.connected_at,
    });

    // Build signed session cookie with user profile info
    const session = {
      github_user_id: user.id,
      github_login: user.login,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      access_token: accessToken,
      scopes,
      connected_at: credentials.connected_at,
    };

    const signedValue = await signSession(c.env.COOKIE_SECRET, session);

    setCookie(c, "aura_session", signedValue, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Redirect to frontend if a `redirect_to` query param matches an allowed origin
    const url = new URL(c.req.url);
    const redirectTo = url.searchParams.get("redirect_to");
    if (redirectTo && ALLOWED_ORIGINS.some((o) => redirectTo.startsWith(o))) {
      return c.redirect(redirectTo, 302);
    }

    return c.json({
      success: true,
      user: {
        id: user.id,
        login: user.login,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
      },
      repositories: repoList,
      scopes,
    });
  }
}

