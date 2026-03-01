import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";
import { getCookie } from "hono/cookie";
import { verifySession } from "../cookie";

interface SessionPayload {
  github_user_id: number;
  github_login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  access_token: string;
  scopes: string;
  connected_at: string;
}

export class SessionInfo extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Get current session details from cookie",
    responses: {
      "200": {
        description: "Returns the current session",
        content: {
          "application/json": {
            schema: z.object({
              authenticated: z.boolean(),
              session: z
                .object({
                  github_user_id: z.number(),
                  github_login: z.string(),
                  name: z.string().nullable(),
                  email: z.string().nullable(),
                  avatar_url: z.string(),
                  scopes: z.string(),
                  connected_at: z.string(),
                })
                .nullable(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    const raw = getCookie(c, "aura_session");

    if (!raw) {
      return c.json({ authenticated: false, session: null });
    }

    const session = await verifySession<SessionPayload>(
      c.env.COOKIE_SECRET,
      raw
    );

    if (!session) {
      return c.json({ authenticated: false, session: null });
    }

    // Return profile info but never expose the access_token
    return c.json({
      authenticated: true,
      session: {
        github_user_id: session.github_user_id,
        github_login: session.github_login,
        name: session.name,
        email: session.email,
        avatar_url: session.avatar_url,
        scopes: session.scopes,
        connected_at: session.connected_at,
      },
    });
  }
}
