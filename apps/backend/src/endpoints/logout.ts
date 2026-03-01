import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";
import { deleteCookie } from "hono/cookie";

export class Logout extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Clear session cookie and log out",
    responses: {
      "200": {
        description: "Logged out successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    deleteCookie(c, "aura_session", {
      path: "/",
      secure: true,
      sameSite: "None",
    });

    return c.json({ success: true });
  }
}
