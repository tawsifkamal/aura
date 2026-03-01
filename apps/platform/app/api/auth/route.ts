import { NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/**
 * DELETE /api/auth — Log out.
 * Clears the platform session cookie and calls the backend logout endpoint.
 */
export async function DELETE(request: Request) {
  // Call backend logout to clear the aura_session cookie
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: request.headers.get("cookie") ?? "",
      },
    });
  } catch {
    // Best effort — clear platform cookie even if backend is unreachable
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
