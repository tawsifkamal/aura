/**
 * GitHub webhook signature verification using HMAC-SHA256.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signature, "utf8"),
  );
}
