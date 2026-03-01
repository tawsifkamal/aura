# Aura/Glimpse — API & Data Shape Reference

> Auto-generated reference of every endpoint, Convex function, webhook handler, and shared type in the codebase.

---

## Table of Contents

1. [Convex Backend (RPC)](#1-convex-backend-rpc)
   - [Schema / Data Models](#schema--data-models)
   - [Runs](#runs)
   - [Edits](#edits)
   - [Exports](#exports)
   - [Auth & HTTP](#auth--http)
2. [Webhook Server (HTTP)](#2-webhook-server-http)
   - [Health Check](#health-check)
   - [GitHub Webhook](#github-webhook)
   - [Event Handlers](#event-handlers)
   - [Dispatch Functions](#dispatch-functions)
3. [Next.js API Routes](#3-nextjs-api-routes)
4. [Core Package Types](#4-core-package-types)
   - [Diff Analysis](#diff-analysis)
   - [Web App Detection](#web-app-detection)
   - [Route Inference](#route-inference)
   - [Dev Server](#dev-server)
   - [Interaction Planning](#interaction-planning)
   - [Browser Recording](#browser-recording)
   - [Video Processing](#video-processing)
   - [Convex Uploader](#convex-uploader)
   - [PR Bot](#pr-bot)
   - [Laminar Tracing](#laminar-tracing)
   - [Supermemory](#supermemory)
   - [AgentMail](#agentmail)
   - [Sandbox](#sandbox)
   - [Conversational Editing](#conversational-editing)
   - [Composio Delivery](#composio-delivery)
   - [AWS Pipeline](#aws-pipeline)
5. [Environment Variables](#5-environment-variables)
6. [Data Flow](#6-data-flow)

---

## 1. Convex Backend (RPC)

All backend functions live in `apps/platform/convex/`. They are invoked via the Convex RPC protocol (not REST). The client uses `useQuery()` / `useMutation()` React hooks.

### Schema / Data Models

#### `runs`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | `number` | yes | When the run was initiated |
| `branch` | `string` | no | Git branch name |
| `pr` | `number` | no | GitHub PR number |
| `commitSha` | `string` | no | Git commit hash |
| `summary` | `string` | yes | Description of what was tested |
| `videoStorageId` | `Id<_storage>` | no | Reference to generated video |
| `status` | `"queued" \| "running" \| "uploading" \| "completed" \| "failed"` | yes | Run state |
| `source` | `"skill" \| "pr"` | yes | Trigger source |
| `screenshotStorageIds` | `Id<_storage>[]` | no | Screenshot storage IDs |
| `routesTested` | `string[]` | no | Routes/pages tested |
| `durationMs` | `number` | no | Video duration in ms |
| `error` | `string` | no | Error message if failed |
| `traceId` | `string` | no | Trace ID for debugging |

**Indexes:** `by_timestamp`, `by_status`, `by_branch`

#### `editVersions`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runId` | `Id<runs>` | yes | Parent run |
| `version` | `number` | yes | Incrementing version number |
| `parentVersionId` | `Id<editVersions> \| null` | yes | Parent version for history |
| `operations` | `any[]` | yes | Array of edit operations |
| `status` | `"pending" \| "processing" \| "completed" \| "failed"` | yes | Processing state |
| `videoStorageId` | `Id<_storage>` | no | Edited video output |
| `error` | `string` | no | Error if failed |
| `createdAt` | `number` | yes | Creation timestamp |

**Indexes:** `by_run`, `by_status`

#### `exportJobs`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runId` | `Id<runs>` | yes | Parent run |
| `editVersionId` | `Id<editVersions>` | no | Edit version (null = base video) |
| `format` | `"mp4" \| "gif"` | yes | Output format |
| `fps` | `number` | yes | Frames per second |
| `width` | `number` | yes | Output width (px) |
| `height` | `number` | yes | Output height (px) |
| `quality` | `"web" \| "high" \| "preview"` | yes | Quality tier |
| `maxFileSizeMb` | `number` | no | Max file size constraint |
| `status` | `"queued" \| "processing" \| "completed" \| "failed"` | yes | Job state |
| `progress` | `number` | yes | 0–100 |
| `eta` | `string` | no | Estimated time to completion |
| `outputStorageId` | `Id<_storage>` | no | Final output file |
| `fileSizeBytes` | `number` | no | Final file size |
| `error` | `string` | no | Error if failed |
| `createdAt` | `number` | yes | Creation timestamp |
| `completedAt` | `number` | no | Completion timestamp |

**Indexes:** `by_run`, `by_status`

---

### Runs

**File:** `convex/runs.ts`

#### `runs.list` — Query

```typescript
// Arguments
{ limit?: number; status?: "queued" | "running" | "uploading" | "completed" | "failed" }

// Returns
Array<Run & { videoUrl: string | null }>
```

#### `runs.get` — Query

```typescript
// Arguments
{ id: Id<"runs"> }

// Returns
(Run & { videoUrl: string | null; screenshotUrls: string[] }) | null
```

#### `runs.create` — Mutation

```typescript
// Arguments
{
  timestamp: number;
  branch?: string;
  pr?: number;
  commitSha?: string;
  summary: string;
  status: "queued" | "running" | "uploading" | "completed" | "failed";
  source: "skill" | "pr";
  routesTested?: string[];
  traceId?: string;
}

// Returns
string  // created run ID
```

#### `runs.updateStatus` — Mutation

```typescript
// Arguments
{ id: Id<"runs">; status: RunStatus; error?: string; durationMs?: number }

// Returns
void
```

#### `runs.attachVideo` — Mutation

```typescript
// Arguments
{ id: Id<"runs">; videoStorageId: Id<"_storage"> }

// Returns
void  // also sets status to "completed"
```

#### `runs.attachScreenshots` — Mutation

```typescript
// Arguments
{ id: Id<"runs">; screenshotStorageIds: Id<"_storage">[] }

// Returns
void
```

#### `runs.generateUploadUrl` — Mutation (public)

```typescript
// Arguments
{}

// Returns
string  // temporary Convex storage upload URL
```

---

### Edits

**File:** `convex/edits.ts`

#### `edits.listVersions` — Query

```typescript
// Arguments
{ runId: Id<"runs"> }

// Returns
Array<EditVersion & { videoUrl: string | null }>
```

#### `edits.getVersion` — Query

```typescript
// Arguments
{ id: Id<"editVersions"> }

// Returns
(EditVersion & { videoUrl: string | null }) | null
```

#### `edits.applyEdit` — Mutation

```typescript
// Arguments
{
  runId: Id<"runs">;
  parentVersionId?: Id<"editVersions">;
  operation: EditOperation;  // see below
}

// Returns
string  // created editVersion ID
```

**Edit Operation Types:**

```typescript
// Crop
{ type: "crop"; x: number; y: number; width: number; height: number }

// Trim
{ type: "trim"; startMs: number; endMs: number }

// Split
{ type: "split"; atMs: number; removeSegment: "before" | "after" }

// Zoom
{ type: "zoom"; intensity: number; centerX: number; centerY: number; startMs: number; durationMs: number }

// Cursor Emphasis
{ type: "cursor_emphasis"; trailLength: number; size: number; smoothing: number }

// Style Preset
{ type: "style_preset"; preset: "default" | "minimal" | "dramatic"; overrides?: { zoomScale?: number; cornerRadius?: number; motionSmoothing?: number } }
```

#### `edits.revert` — Mutation

```typescript
// Arguments
{ runId: Id<"runs"> }

// Returns
string  // created revert version ID (empty operations)
```

#### `edits.updateVersionStatus` — Mutation

```typescript
// Arguments
{ id: Id<"editVersions">; status: EditStatus; videoStorageId?: Id<"_storage">; error?: string }

// Returns
void
```

---

### Exports

**File:** `convex/exports.ts`

#### `exports.list` — Query

```typescript
// Arguments
{ runId: Id<"runs"> }

// Returns
Array<ExportJob & { outputUrl: string | null }>
```

#### `exports.get` — Query

```typescript
// Arguments
{ id: Id<"exportJobs"> }

// Returns
(ExportJob & { outputUrl: string | null }) | null
```

#### `exports.create` — Mutation

```typescript
// Arguments
{
  runId: Id<"runs">;
  editVersionId?: Id<"editVersions">;
  format: "mp4" | "gif";
  fps: number;
  width: number;
  height: number;
  quality: "web" | "high" | "preview";
  maxFileSizeMb?: number;
}

// Returns
string  // created exportJob ID
```

#### `exports.updateProgress` — Mutation

```typescript
// Arguments
{ id: Id<"exportJobs">; progress: number; status?: ExportStatus; eta?: string }

// Returns
void
```

#### `exports.complete` — Mutation

```typescript
// Arguments
{ id: Id<"exportJobs">; outputStorageId: Id<"_storage">; fileSizeBytes: number }

// Returns
void
```

#### `exports.fail` — Mutation

```typescript
// Arguments
{ id: Id<"exportJobs">; error: string }

// Returns
void
```

---

### Auth & HTTP

**File:** `convex/auth.ts`, `convex/http.ts`

- **Auth provider:** BetterAuth with Convex adapter
- **Auth method:** Email/password
- **HTTP routes:** Auto-registered by BetterAuth (`/api/auth/*`)
- **Environment:** `SITE_URL`, `BETTER_AUTH_SECRET`

---

## 2. Webhook Server (HTTP)

**App:** `apps/webhook/` — standalone Node.js HTTP server
**Default port:** 3001

### Health Check

```
GET /health
```

**Response:**
```json
{ "status": "ok", "service": "aura-webhook" }
```

### GitHub Webhook

```
POST /webhook
POST /
```

**Required Headers:**

| Header | Description |
|--------|-------------|
| `x-github-event` | Event type: `pull_request`, `issue_comment`, `ping` |
| `x-github-delivery` | Unique delivery ID |
| `x-hub-signature-256` | HMAC-SHA256 signature (if secret configured) |

**Response shape (all events):**
```typescript
{
  dispatched: boolean;
  reason: string;
  runId?: string;
  status?: "pong" | "ignored";
  event?: string;
  error?: string;
}
```

### Event Handlers

#### Pull Request (`pull_request`)

**Accepted actions:** `opened`, `synchronize`, `reopened`

**Payload (from GitHub):**
```typescript
{
  action: string;
  pull_request: {
    number: number;
    head: { sha: string; ref: string };
  };
  repository: {
    owner: { login: string };
    name: string;
    full_name: string;
  };
}
```

**Success response:**
```json
{ "dispatched": true, "reason": "Job dispatched for PR #123", "runId": "<uuid>" }
```

#### Issue Comment (`issue_comment`)

**Accepted:** `created` action + comment body matches `/aura (re-?run|retry)/i`

**Payload (from GitHub):**
```typescript
{
  action: string;
  comment: { body: string; user: { login: string } };
  issue: { number: number; pull_request?: { url: string } };
  repository: { owner: { login: string }; name: string };
}
```

**Success response:**
```json
{ "dispatched": true, "reason": "Re-run dispatched for PR #123", "runId": "<uuid>" }
```

#### Ping (`ping`)

```json
{ "status": "pong" }
```

#### Unknown events

```json
{ "status": "ignored", "event": "<event-name>" }
```

### Dispatch Functions

**File:** `apps/webhook/src/dispatch.ts`

#### `dispatchJob(pr: PRContext): Promise<JobRecord>`

Lifecycle: create run (queued) → post PR comment → update to running

```typescript
interface JobRecord {
  runId: string;
  commentId: number;
  dashboardUrl: string;
  status: RunStatus;
}
```

#### `retryJob(pr: PRContext): Promise<JobRecord>`

Delegates to `dispatchJob()` (creates a new run).

---

## 3. Next.js API Routes

**App:** `apps/platform/`

### `GET|POST /api/auth/[...all]`

Catch-all auth route delegating to BetterAuth. Handles sign-in, sign-up, sign-out, session management.

**Client setup** (`lib/auth-client.ts`):
```typescript
const authClient = createAuthClient({ plugins: [convexClient()] });
```

**Server setup** (`lib/auth-server.ts`):
- Reads `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `SITE_URL`, `BETTER_AUTH_SECRET`

---

## 4. Core Package Types

**Package:** `packages/core/src/`

### Diff Analysis

**File:** `diff-analyzer.ts`

```typescript
interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  isComponent: boolean;
  isPage: boolean;
  isRoute: boolean;
  extension: string;
}

interface DiffAnalysis {
  changedFiles: ChangedFile[];
  componentFiles: ChangedFile[];
  pageFiles: ChangedFile[];
  routeFiles: ChangedFile[];
  diff: string;
}
```

### Web App Detection

**File:** `web-app-detector.ts`

```typescript
type Framework = "nextjs" | "react" | "vue" | "vite" | "angular" | "svelte" | "nuxt" | "remix" | "astro" | "unknown";

interface WebAppInfo {
  isWebApp: boolean;
  framework: Framework;
  devScript: string | null;
  devPort: number | null;
  dependencies: Record<string, string>;
}
```

### Route Inference

**File:** `route-inferrer.ts`

```typescript
interface InferredRoute {
  route: string;
  source: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}
```

### Dev Server

**File:** `dev-server.ts`

```typescript
interface DevServerOptions {
  projectDir: string;
  port?: number;
  script?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface DevServerHandle {
  url: string;
  port: number;
  process: ChildProcess;
  kill: () => void;
}
```

### Interaction Planning

**File:** `interaction-planner.ts`

```typescript
type InteractionType = "click" | "type" | "select" | "toggle" | "submit" | "hover" | "scroll" | "navigate";

interface InteractiveElement {
  type: InteractionType;
  selector: string;
  description: string;
  sourceFile: string;
  confidence: "high" | "medium" | "low";
}

interface InteractionStep {
  order: number;
  route: string;
  element: InteractiveElement;
  value?: string;
  waitAfterMs?: number;
  screenshotAfter: boolean;
}

interface InteractionPlan {
  steps: InteractionStep[];
  summary: string;
  elementsFound: number;
  routesCovered: string[];
}
```

### Browser Recording

**File:** `browser-recorder.ts`

```typescript
interface RecordingStep {
  timestamp: number;
  action: "navigate" | "click" | "type" | "screenshot" | "wait";
  target?: string;
  value?: string;
  screenshotPath?: string;
  url?: string;
}

interface RecordingSession {
  id: string;
  startedAt: number;
  completedAt?: number;
  baseUrl: string;
  outputDir: string;
  steps: RecordingStep[];
  videoPath?: string;
  summaryPath?: string;
  routes: InferredRoute[];
  traceId?: string;
}

interface BrowserRecorderOptions {
  baseUrl: string;
  outputDir?: string;
  routes: InferredRoute[];
  headless?: boolean;
  viewport?: { width: number; height: number };
  tracing?: { laminarEndpoint?: string; enabled: boolean };
  memory?: { supermemoryEndpoint?: string; enabled: boolean };
}
```

### Video Processing

**File:** `video-processor.ts`

```typescript
interface Point { x: number; y: number }

interface CursorKeyframe {
  position: Point;
  timestamp: number;
  action: RecordingStep["action"];
}

interface ZoomKeyframe {
  center: Point;
  scale: number;
  timestamp: number;
  durationMs: number;
}

interface StylePreset {
  name: string;
  cursorSize: number;
  cursorColor: string;
  cursorTrailEnabled: boolean;
  zoomScale: number;
  zoomDurationMs: number;
  zoomEasing: EasingFunction;
  motionSmoothing: number;
  backgroundColor: string;
  borderRadius: number;
  shadowEnabled: boolean;
}

type EasingFunction = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "cubic-bezier";

interface VideoProcessorOptions {
  inputDir: string;
  outputDir: string;
  width: number;
  height: number;
  fps: number;
  preset: StylePreset;
  steps: RecordingStep[];
  cursorPositions?: CursorKeyframe[];
}

interface ProcessedVideo {
  videoPath: string;
  thumbnailPath: string;
  durationMs: number;
  frameCount: number;
  resolution: { width: number; height: number };
}

// Built-in presets: "default", "minimal", "dramatic"
```

### Convex Uploader

**File:** `convex-uploader.ts`

```typescript
interface RunMetadata {
  timestamp: number;
  branch?: string;
  pr?: number;
  commitSha?: string;
  summary: string;
  source: "skill" | "pr";
  routesTested?: string[];
  durationMs?: number;
  traceId?: string;
}

interface UploadResult {
  runId: string;
  dashboardUrl: string;
}

interface ConvexUploaderOptions {
  convexUrl: string;
  dashboardBaseUrl?: string;
}
```

### PR Bot

**File:** `pr-bot.ts`

```typescript
type RunStatus = "queued" | "running" | "uploading" | "completed" | "failed";

interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  commitSha: string;
  branch: string;
  diff: string;
}

interface PRBotOptions {
  githubToken: string;
  dashboardBaseUrl?: string;
}

interface CommentState {
  commentId: number;
  runId?: string;
  dashboardUrl?: string;
  status: RunStatus;
  summary?: string;
  routesTested?: string[];
  videoUrl?: string;
  error?: string;
}
```

**GitHub API calls made:**
- `GET /repos/{owner}/{repo}/issues/{pr}/comments?per_page=100`
- `POST /repos/{owner}/{repo}/issues/{pr}/comments`
- `PATCH /repos/{owner}/{repo}/issues/comments/{id}`

Comment marker: `<!-- aura-bot -->`

### Laminar Tracing

**File:** `laminar.ts`

```typescript
interface LaminarConfig {
  endpoint: string;
  apiKey?: string;
  projectId?: string;
}

interface TraceSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: "ok" | "error";
  attributes: Record<string, string | number | boolean>;
  events: TraceEvent[];
}

interface TraceEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

interface RunTrace {
  traceId: string;
  spans: TraceSpan[];
  startTime: number;
  endTime?: number;
  status: "ok" | "error";
  traceUrl?: string;
}
```

### Supermemory

**File:** `supermemory.ts`

```typescript
interface RunContext {
  sessionId: string;
  branch?: string;
  routes: string[];
  components: string[];
  summary: string;
  timestamp: number;
}

interface RetrievedContext {
  entries: RunContext[];
  relevanceScores: number[];
}

interface SupermemoryConfig {
  endpoint: string;
  apiKey?: string;
}
```

### AgentMail

**File:** `agentmail.ts`

```typescript
interface AgentMailConfig {
  apiKey: string;
  from?: string;
}

interface EmailPayload {
  to: string;
  subject: string;
  dashboardUrl: string;
  videoUrl?: string;
  status: "completed" | "failed";
  summary: string;
  routesTested?: string[];
  prUrl?: string;
  prCommentUrl?: string;
  error?: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
```

### Sandbox

**File:** `sandbox.ts`

```typescript
interface SandboxConfig {
  image?: string;
  repo?: string;
  branch?: string;
  envVars?: Record<string, string>;
  timeout?: number;
}

interface SandboxHandle {
  id: string;
  status: "creating" | "running" | "stopped" | "failed";
  host?: string;
  port?: number;
}

interface PipelineRunOptions {
  sandbox: SandboxHandle;
  command: string;
  args?: string[];
  cwd?: string;
}

interface PipelineResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  artifacts: string[];
}
```

### Conversational Editing

**File:** `conversational-edit.ts`

```typescript
type EditOperationType = "crop" | "trim" | "split" | "zoom" | "cursor_emphasis" | "style_preset" | "export";

interface ParsedEditRequest {
  type: EditOperationType;
  params: Record<string, unknown>;
  confidence: number;
  rawText: string;
}

interface ConversationContext {
  runId: string;
  channelType: string;
  channelTarget: string;
  threadId?: string;
  editHistory: ParsedEditRequest[];
}

interface EditReply {
  message: string;
  success: boolean;
  editVersionId?: string;
  error?: string;
}
```

### Composio Delivery

**File:** `composio-delivery.ts`

```typescript
type ChannelType = "slack" | "discord" | "email" | "teams" | "telegram" | "webhook";

interface ChannelConfig {
  type: ChannelType;
  id: string;
  name: string;
  target: string;
  enabled: boolean;
}

interface DeliveryPreferences {
  userId: string;
  channels: ChannelConfig[];
  fallbackToEmail: boolean;
  emailAddress?: string;
}

interface DeliveryPayload {
  runId: string;
  dashboardUrl: string;
  videoUrl?: string;
  summary: string;
  status: "completed" | "failed";
  routesTested?: string[];
  branch?: string;
  pr?: number;
  error?: string;
}

interface ChannelDeliveryResult {
  channel: ChannelConfig;
  success: boolean;
  error?: string;
  messageId?: string;
}

interface DeliveryResult {
  results: ChannelDeliveryResult[];
  usedFallback: boolean;
  fallbackResult?: { success: boolean; error?: string };
}

interface ComposioConfig {
  apiKey: string;
  baseUrl: string;
}
```

### AWS Pipeline

**File:** `aws-pipeline.ts`

```typescript
interface AWSPipelineConfig {
  region: string;
  mediaConvertEndpoint: string;
  inputBucket: string;
  outputBucket: string;
  roleArn: string;
  queueArn: string;
  deadLetterQueueUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

type JobPriority = "low" | "normal" | "high";

interface TranscodeJobRequest {
  idempotencyKey: string;
  inputKey: string;
  outputKeyPrefix: string;
  format: "mp4" | "gif";
  fps: number;
  width: number;
  height: number;
  quality: "web" | "high" | "preview";
  maxFileSizeMb?: number;
  priority: JobPriority;
  hwAccelerated: boolean;
  metadata?: Record<string, string>;
}

type JobStatus = "submitted" | "progressing" | "completed" | "failed" | "canceled";

interface TranscodeJobResult {
  jobId: string;
  idempotencyKey: string;
  status: JobStatus;
  progress: number;
  outputKey?: string;
  fileSizeBytes?: number;
  durationMs?: number;
  error?: string;
  costEstimate?: CostEstimate;
}

interface CostEstimate {
  transcodeMinutes: number;
  estimatedCostUsd: number;
  tier: "basic" | "professional" | "reserved";
}

interface ProcessingTelemetry {
  jobId: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  inputSizeBytes: number;
  outputSizeBytes?: number;
  transcodeMinutes: number;
  hwAccelerated: boolean;
  retryCount: number;
  costEstimate: CostEstimate;
}

interface DeadLetterMessage {
  jobId: string;
  idempotencyKey: string;
  error: string;
  originalRequest: TranscodeJobRequest;
  failedAt: number;
  retryCount: number;
}
```

---

## 5. Environment Variables

| Variable | Used In | Required | Description |
|----------|---------|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Platform (client) | yes | Convex backend URL for browser |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Platform (auth) | yes | Convex auth callback domain |
| `CONVEX_URL` | Webhook | yes | Convex backend URL for server |
| `CONVEX_DEPLOYMENT` | Platform (dev) | no | Convex deployment ID |
| `SITE_URL` | Auth config | yes | Auth base URL for callbacks |
| `BETTER_AUTH_SECRET` | Auth | yes | Encryption key for sessions |
| `GITHUB_TOKEN` | Webhook | yes | GitHub API token for PR comments |
| `GITHUB_WEBHOOK_SECRET` | Webhook | no | HMAC secret for webhook verification |
| `DASHBOARD_BASE_URL` | Webhook | no | Links in PR comments (default: `http://localhost:3000`) |
| `PORT` | Webhook | no | Server port (default: `3001`) |

---

## 6. Data Flow

```
GitHub PR Event
       │
       ▼
┌──────────────┐    POST /webhook     ┌─────────────────┐
│  GitHub App  │ ──────────────────▶  │  Webhook Server  │
└──────────────┘                      │  (port 3001)     │
                                      └────────┬────────┘
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         │                     │                     │
                         ▼                     ▼                     ▼
                  Create Convex Run      Post PR Comment      Launch Sandbox
                  (status: queued)       (<!-- aura-bot -->)   (Daytona)
                         │                                           │
                         │                                           ▼
                         │                                   ┌──────────────┐
                         │                                   │  Pipeline:   │
                         │                                   │  1. Diff     │
                         │                                   │  2. Detect   │
                         │                                   │  3. Routes   │
                         │                                   │  4. Plan     │
                         │                                   │  5. Record   │
                         │                                   │  6. Process  │
                         │                                   └──────┬───────┘
                         │                                          │
                         ▼                                          ▼
                  ┌─────────────┐                          Upload Video/Screenshots
                  │   Convex    │ ◀────────────────────────  to Convex Storage
                  │  Database   │
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐     useQuery / useMutation
                  │  Dashboard  │ ◀───── React hooks
                  │  (Next.js)  │
                  └─────────────┘
                         │
                         ▼
                  User edits video → applyEdit → new editVersion
                  User exports     → create export job → AWS MediaConvert / FFmpeg
                  Delivery         → Composio (Slack/Discord/Email/etc.)
```
