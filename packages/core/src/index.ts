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

export {
  extractInteractiveElements,
  generateInteractionPlan,
} from "./interaction-planner.js";
export type {
  InteractionType,
  InteractiveElement,
  InteractionStep,
  InteractionPlan,
} from "./interaction-planner.js";

export {
  createSession,
  createOutputDir,
  addStep,
  buildNavigationScript,
  writeSummary,
  completeSession,
  buildLaminarMetadata,
  buildSupermemoryQuery,
} from "./browser-recorder.js";
export type {
  RecordingStep,
  RecordingSession,
  BrowserRecorderOptions,
  LaminarTraceConfig,
  SupermemoryConfig,
} from "./browser-recorder.js";

export {
  interpolateCursorPath,
  generateZoomKeyframes,
  getZoomAtTime,
  getEasing,
  prepareVideoProcessing,
  writeRenderManifest,
  buildRenderManifest,
  buildFFmpegCompositeCommand,
  buildCursorOverlayFilter,
  buildZoomPanFilter,
  PRESETS,
} from "./video-processor.js";
export type {
  Point,
  CursorKeyframe,
  ZoomKeyframe,
  StylePreset,
  EasingFunction,
  VideoProcessorOptions,
  ProcessedVideo,
  FFmpegCommand,
  RenderManifest,
} from "./video-processor.js";

export {
  createRun,
  updateRunStatus,
  uploadVideo,
  uploadScreenshots,
} from "./convex-uploader.js";
export type {
  RunMetadata,
  UploadResult,
  ConvexUploaderOptions,
} from "./convex-uploader.js";

export {
  findExistingComment,
  postOrUpdateComment,
  updateCommentStatus,
  buildCommentBody,
  COMMENT_MARKER,
} from "./pr-bot.js";
export type {
  RunStatus,
  PRContext,
  PRBotOptions,
  CommentState,
} from "./pr-bot.js";

export {
  sendEmail,
  getAgentMailConfig,
} from "./agentmail.js";
export type {
  AgentMailConfig,
  EmailPayload,
  SendResult,
} from "./agentmail.js";

export {
  storeRunContext,
  retrieveContext,
  mergeContextIntoPrompt,
  getSupermemoryConfig,
} from "./supermemory.js";
export type {
  SupermemoryConfig as SupermemoryClientConfig,
  RunContext,
  RetrievedContext,
} from "./supermemory.js";

export {
  createTrace,
  startSpan,
  endSpan,
  addSpanEvent,
  endTrace,
  exportTrace,
  buildTraceUrl,
  getLaminarConfig,
} from "./laminar.js";
export type {
  LaminarConfig,
  TraceSpan,
  TraceEvent,
  RunTrace,
} from "./laminar.js";

export {
  buildSandboxConfig,
  createSandbox,
  runInSandbox,
  exportArtifact,
  destroySandbox,
  runPipeline,
  buildRecordingPipelineSteps,
} from "./sandbox.js";
export type {
  SandboxConfig,
  SandboxHandle,
  PipelineRunOptions,
  PipelineResult,
} from "./sandbox.js";
