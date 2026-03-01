// @ts-nocheck
// Type annotations are not portable due to internal @convex-dev/better-auth types.
// This file is deployed as a Convex component — types are resolved at codegen time.
import { createApi } from "@convex-dev/better-auth";
import schema from "./schema";
import { createAuthOptions } from "../auth";

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(schema, createAuthOptions);
