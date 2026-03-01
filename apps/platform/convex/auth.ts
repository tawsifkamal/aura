/**
 * Shared admin secret validation for all Convex functions.
 *
 * Every query/mutation called by the backend workers must include
 * `adminSecret` in its args. This is validated against the
 * CONVEX_ADMIN_SECRET environment variable.
 */

export function requireAdmin(adminSecret: string | undefined): void {
  const expected = process.env.CONVEX_ADMIN_SECRET;
  if (!expected) {
    throw new Error("CONVEX_ADMIN_SECRET environment variable is not set");
  }
  if (!adminSecret || adminSecret !== expected) {
    throw new Error("Unauthorized: invalid admin secret");
  }
}
