import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  { ignores: ["convex/_generated/**"] },
  ...nextJsConfig,
];
