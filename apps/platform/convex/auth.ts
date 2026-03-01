import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericDataModel } from "convex/server";
import { components } from "./_generated/api";
import authConfig from "./auth.config";

export const authComponent = createClient(components.betterAuth);

export const createAuthOptions = (
  ctx: GenericCtx<GenericDataModel>,
): BetterAuthOptions => {
  return {
    appName: "Aura",
    baseURL: process.env.SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true },
    plugins: [convex({ authConfig })],
  };
};

export const createAuth = (ctx: GenericCtx<GenericDataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};

export const getCurrentUser = authComponent.clientApi().getAuthUser;
