import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { runId, prompt } = await request.json();

  // Stub — will be wired to an AI editing pipeline later
  console.log(`[prompt] run=${runId} prompt="${prompt}"`);

  return NextResponse.json({ ok: true, message: "Prompt received" });
}
