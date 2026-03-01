export {
  analyzeDiff,
  getChangedFiles,
  getGitDiff,
  parseDiffNameStatus,
} from "./diff-analyzer.js";
export type { ChangedFile, DiffAnalysis } from "./diff-analyzer.js";

export { detectWebApp } from "./web-app-detector.js";
export type { Framework, WebAppInfo } from "./web-app-detector.js";

export { inferRoutes, buildNavigationPlan } from "./route-inferrer.js";
export type { InferredRoute } from "./route-inferrer.js";

export {
  startDevServer,
  resolveDevCommand,
  httpCheck,
  waitForPort,
  findActivePort,
} from "./dev-server.js";
export type { DevServerOptions, DevServerHandle } from "./dev-server.js";
