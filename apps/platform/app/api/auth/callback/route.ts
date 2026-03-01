import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * After GitHub OAuth completes, the CF Worker backend redirects here.
 * The aura_session cookie is already set on the backend domain.
 * We set a lightweight "session" cookie on the platform domain so
 * Next.js middleware can gate protected routes without a cross-origin call.
 */
export async function GET(request: NextRequest) {
  const redirect = request.nextUrl.searchParams.get("redirect") ?? "/dashboard";
  const url = new URL(redirect, request.url);

  const response = NextResponse.redirect(url);
  response.cookies.set("session", "authenticated", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days (matches backend cookie)
  });

  return response;
}
