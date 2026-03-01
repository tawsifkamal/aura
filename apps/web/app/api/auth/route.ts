import { NextResponse } from "next/server";

const VALID_USER = "n@gmail.com";
const VALID_PASS = "12345678";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (email === VALID_USER && password === VALID_PASS) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set("session", "authenticated", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  }

  return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
