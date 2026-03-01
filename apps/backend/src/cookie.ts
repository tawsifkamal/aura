// HMAC-SHA256 cookie signing using Web Crypto (works in Workers runtime)

const encoder = new TextEncoder();

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bufferToHex(sig);
}

async function hmacVerify(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const expected = await hmacSign(secret, payload);
  return expected === signature;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encode a session object into a signed cookie value: `base64payload.signature`
 */
export async function signSession(
  secret: string,
  session: Record<string, unknown>
): Promise<string> {
  const payload = btoa(JSON.stringify(session));
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

/**
 * Verify and decode a signed cookie value. Returns null if tampered or malformed.
 */
export async function verifySession<T = Record<string, unknown>>(
  secret: string,
  cookie: string
): Promise<T | null> {
  const dotIndex = cookie.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payload = cookie.slice(0, dotIndex);
  const signature = cookie.slice(dotIndex + 1);

  const valid = await hmacVerify(secret, payload, signature);
  if (!valid) return null;

  try {
    return JSON.parse(atob(payload)) as T;
  } catch {
    return null;
  }
}
