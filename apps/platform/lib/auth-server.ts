import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

function createAuthHelpers() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

  if (!convexUrl || !convexSiteUrl) {
    return null;
  }

  return convexBetterAuthNextJs({
    convexUrl,
    convexSiteUrl,
  });
}

let _helpers: ReturnType<typeof createAuthHelpers>;

function getHelpers() {
  if (_helpers === undefined) {
    _helpers = createAuthHelpers();
  }
  return _helpers;
}

export async function getToken() {
  const helpers = getHelpers();
  if (!helpers) return undefined;
  return helpers.getToken();
}

export async function isAuthenticated() {
  const helpers = getHelpers();
  if (!helpers) return false;
  return helpers.isAuthenticated();
}

export const handler = {
  GET: async (request: Request) => {
    const helpers = getHelpers();
    if (!helpers) {
      return new Response("Auth not configured", { status: 503 });
    }
    return helpers.handler.GET(request);
  },
  POST: async (request: Request) => {
    const helpers = getHelpers();
    if (!helpers) {
      return new Response("Auth not configured", { status: 503 });
    }
    return helpers.handler.POST(request);
  },
};
