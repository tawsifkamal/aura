# Record Demo

Record a Screen Studio-style video demo of frontend changes using browser-use TypeScript agent.

You are an AI assistant that records demo videos of web application changes. Follow these steps precisely.

## Step 1: Detect Web App and Analyze Changes

Use the `@repo/core` package utilities to detect the project type and analyze code changes.
The implementation lives in `packages/core/src/`.

### 1a. Detect Web App Type

Run `detectWebApp(projectDir)` from `@repo/core/web-app-detector` or manually check `package.json`:

**Framework detection** (checked in priority order):
- `next` -> Next.js (port 3000)
- `nuxt` -> Nuxt (port 3000)
- `@remix-run/react` -> Remix (port 3000)
- `astro` -> Astro (port 4321)
- `@sveltejs/kit` or `svelte` -> SvelteKit (port 5173)
- `vue` -> Vue (port 5173)
- `@angular/core` -> Angular (port 4200)
- `vite` -> Vite (port 5173)
- `react` -> React (port 3000)

**Dev script detection** (checked in order): `dev`, `start`, `serve`, `develop`

If no web framework is detected, stop and inform the user this project doesn't appear to be a web app.

### 1b. Analyze Git Diff

Run `git diff --name-status` (both staged and unstaged) to get changed files. For each file, classify it:

**Component files** — files in directories named: `components`, `ui`, `shared`, `common`, `features`
**Page files** — files in directories named: `pages`, `app`, `views`, `routes`
**Route files** — files matching patterns: `page.tsx`, `index.tsx`, `route.ts`, `layout.tsx`, `+page.svelte`, `[param].tsx`

Only consider frontend extensions: `.tsx`, `.jsx`, `.ts`, `.js`, `.vue`, `.svelte`

### 1c. Infer Affected Routes

From the changed files, infer which routes the browser agent should visit:

**Next.js App Router**: `app/dashboard/page.tsx` -> `/dashboard`
**Next.js Pages Router**: `pages/about.tsx` -> `/about`
**Generic pages/views dirs**: `pages/settings.tsx` -> `/settings`
**Dynamic segments**: `app/users/[id]/page.tsx` -> `/users/:id`
**Component name hinting**: `components/Dashboard.tsx` -> `/dashboard` (low confidence)

Assign confidence levels: **high** (direct page/route file), **medium** (in pages/views dir), **low** (component name guess).

### 1d. Read the Diff Content

Run `git diff` (full diff, not just names) to get the actual code changes. Use this to:
- Identify interactive elements that were added or changed (buttons, forms, modals, inputs)
- Understand what the user should see differently in the UI
- Build context for what the browser agent should interact with and verify

Print a summary of findings before proceeding:
```
Web App Detected: [framework] (port [port])
Dev Script: npm run [script]
Changed Files: [N] total ([M] components, [P] pages, [R] routes)
Inferred Routes: [list of routes with confidence]
Key Changes: [brief description of what changed in the UI]
```

## Step 2: Start Dev Server

Use `startDevServer()` from `@repo/core/dev-server` or follow these manual steps.
The implementation lives in `packages/core/src/dev-server.ts`.

### 2a. Resolve the dev command

Use the dev script detected in Step 1 (usually `npm run dev`). If no script was found, check for `start`, `serve`, or `develop` in `package.json` scripts.

### 2b. Check if server is already running

Before spawning a new process, check if something is already listening on the expected port:
- Try an HTTP GET to `http://localhost:<port>`
- If it responds (any status code), the server is already up — skip to Step 3

### 2c. Start the server in background

Run the dev command as a background process:
- Use `spawn` with `detached: true` and `stdio: ["ignore", "pipe", "pipe"]`
- Keep a reference to the child process for cleanup later
- Set `FORCE_COLOR=0` to avoid ANSI escape codes in output

### 2d. Poll until ready

Poll `http://localhost:<port>` every 500ms until:
- An HTTP response is received (any status, including redirects) — server is ready
- Or 60 seconds have elapsed — timeout and fail

**Port priority**: Use the port from Step 1 detection. If the server doesn't respond on the expected port, scan fallback ports: `3000, 5173, 8080, 4200, 4321, 8000`.

### 2e. Confirm and report

Once the server is ready, print:
```
Dev server ready at http://localhost:<port>
```

**Cleanup**: Remember to kill the server process when done recording (Step 5). Use `process.kill(-pid, 'SIGTERM')` to kill the process group.

## Step 3: Navigate and Record with browser-use

Use the `browser-use` TypeScript library (npm package) with Playwright for browser automation.
The session orchestration lives in `packages/core/src/browser-recorder.ts`.

### 3a. Initialize recording session

Use `createSession()` from `@repo/core/browser-recorder`:
- Pass `baseUrl` (from Step 2), `routes` (from Step 1), and optional tracing/memory config
- Call `createOutputDir()` to create `demos/[timestamp]/` and `demos/[timestamp]/screenshots/`

### 3b. Set up browser-use Agent

```typescript
import { Agent } from "browser-use";
```

Configure the browser-use Agent with:
- The detected localhost URL as the starting point
- Routes from Step 1 as navigation targets
- Headless mode (or headed for debugging)
- Viewport: 1280x720 for consistent recording

### 3c. Navigate affected routes

For each inferred route (sorted by confidence: high first):
1. Navigate to the URL using browser-use Agent
2. Wait for the page to be fully loaded (networkidle)
3. Take a screenshot using Playwright's `page.screenshot()` — save to `screenshots/step-N.png`
4. Log the step with `addStep(session, { action: "navigate", url })`

### 3d. Record interactions

Use Playwright's built-in video recording:
- Configure `browser.newContext({ recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } } })`
- The video is saved automatically when the context is closed

For each page, use browser-use to:
- Identify interactive elements on the page
- Click buttons, fill forms, toggle states as the diff suggests
- Take screenshots after each interaction

### 3e. Laminar tracing integration

If Laminar is configured (`LAMINAR_ENDPOINT` env var):
- Use `buildLaminarMetadata()` to generate trace metadata
- Attach trace ID to the recording session
- Each browser-use step emits trace data for observability

### 3f. Supermemory context integration

If Supermemory is configured (`SUPERMEMORY_ENDPOINT` env var):
- Use `buildSupermemoryQuery()` to retrieve prior run context
- Use retrieved context to refine which routes to visit and what to interact with
- After recording, store this session's context for future runs

### 3g. Save outputs

- Close the browser context to finalize the video file
- Move the video to `demos/[timestamp]/recording.mp4`
- Call `writeSummary()` to generate `demos/[timestamp]/summary.md`
- Call `completeSession()` to mark the session as done

## Step 4: AI-Driven Interaction Based on Diff

Use `generateInteractionPlan()` from `@repo/core/interaction-planner` to analyze the diff
and decide what to interact with. The implementation lives in `packages/core/src/interaction-planner.ts`.

### 4a. Extract interactive elements from diff

Parse the git diff content (from Step 1d) to find:
- **HTML/JSX elements**: `<button>`, `<input>`, `<textarea>`, `<select>`, `<form>`, `<a>`, checkboxes, radios
- **ARIA roles**: `role="button"`, `role="tab"`, `role="switch"`
- **Event handlers**: `onClick`, `onSubmit`, `onChange`, `onInput`, `onToggle`

For each element found, extract the best selector in priority order:
1. `id` attribute -> `#myButton`
2. `data-testid` -> `[data-testid="submit-btn"]`
3. `aria-label` -> `[aria-label="Close"]`
4. `className` -> `button.primary`
5. Text content -> `button:has-text("Save")`
6. Fallback to element type -> `button`

### 4b. Generate interaction plan

`generateInteractionPlan(diff, routes)` returns a structured plan:
- Each step maps an interactive element to its route
- Steps sorted by confidence (high first) then action type (click > type > select > toggle > submit)
- Each step includes: route, selector, action type, wait time, and whether to screenshot after

### 4c. Execute the interaction plan

For each step in the plan, use browser-use to:
1. Navigate to the step's route (if not already there)
2. Wait for the target element to be visible
3. Perform the action:
   - **click**: Click the element
   - **type**: Type sample text into the field (use realistic placeholder data)
   - **select**: Select the first available option
   - **toggle**: Click to toggle state
   - **submit**: Fill required fields first, then submit
4. Wait the specified duration (500ms for most, 2000ms for submit)
5. Take a screenshot and log the step

### 4d. Handle missing elements gracefully

If a planned element is not found on the page:
- Log it as skipped (the diff may reference a component not yet rendered)
- Continue with the next step
- Do not fail the entire recording

Print a summary of the interaction plan before executing:
```
Interaction Plan: [N] actions across [M] routes
  1. [click] button:has-text("Save") on /settings (high confidence)
  2. [type] input#email on /profile (high confidence)
  3. [toggle] [role="switch"] on /settings (medium confidence)
```

## Step 5: Generate Screen Studio-Style Video and Summary

Use `prepareVideoProcessing()` from `@repo/core/video-processor` to apply post-processing effects.
The implementation lives in `packages/core/src/video-processor.ts`.

### 5a. Choose a style preset

Available presets (`PRESETS` from `@repo/core`):
- **default**: Balanced zoom (1.5x), cursor trail, 12px rounded corners, shadow
- **minimal**: Subtle zoom (1.3x), no trail, sharp corners, clean
- **dramatic**: Deep zoom (2.0x), cursor trail, 16px rounded, dark background

### 5b. Generate smooth cursor animation

`interpolateCursorPath()` creates a frame-by-frame cursor position array:
- Uses cubic bezier interpolation between interaction keyframes
- Easing function (ease-in-out) ensures natural acceleration/deceleration
- `motionSmoothing` (0-1) controls curve intensity — higher = smoother arcs
- Output: one `{x, y}` point per video frame at the target FPS

The cursor path is **deterministic** — same inputs always produce the same animation.

### 5c. Generate zoom keyframes

`generateZoomKeyframes()` creates zoom-in effects on click/type actions:
- Each click/type step triggers a zoom toward the cursor position
- Zoom-in takes 30% of duration, zoom-out takes 70% (asymmetric for emphasis)
- Zoom scale and duration are configurable via the style preset

### 5d. Build FFmpeg render command

`prepareVideoProcessing()` returns an FFmpeg command that:
1. Takes the raw Playwright recording (`.webm`) as input
2. Applies cursor overlay filter (drawbox at animated positions)
3. Applies zoom/pan filter for smooth zoom effects
4. Encodes to H.264 MP4 with `yuv420p` pixel format
5. Uses `-movflags +faststart` for web-optimized playback
6. Writes `render-manifest.json` with all processing metadata

Run the FFmpeg command:
```bash
ffmpeg -i input.webm -vf "drawbox=...,zoompan=..." -r 30 -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -y recording.mp4
```

### 5e. Generate summary

Call `writeSummary()` from `@repo/core/browser-recorder` to create `summary.md` with:
- Session metadata (ID, timestamp, duration)
- Routes visited with confidence levels
- Step-by-step action log with timestamps
- Description of changes tested

### 5f. Upload to dashboard

Use `@repo/core/convex-uploader` to upload the recording to the Aura dashboard (Convex backend):

1. Call `createRun()` with metadata (timestamp, branch, commitSha, summary, source: "skill", routesTested)
2. Call `updateRunStatus()` to set status to "uploading"
3. Call `uploadVideo()` to upload the MP4 to Convex storage
4. Call `uploadScreenshots()` to upload screenshot files
5. Call `updateRunStatus()` to set status to "completed" with durationMs

The Convex URL defaults to `CONVEX_URL` env var or `http://localhost:3210`.
The dashboard base URL defaults to `http://localhost:3000`.

### 5g. Report results with dashboard link

**IMPORTANT**: The final response to the user MUST always include:
1. The **dashboard link** pointing to the specific run (e.g., `http://localhost:3000/runs/<runId>`) — not just the dashboard root
2. A **short summary** of what was recorded and tested
3. Local file paths for reference

The `createRun()` function from Step 5f returns `{ runId, dashboardUrl }`. Use `dashboardUrl` directly in the output.

Print the final output in this format:

```
Demo recorded successfully!

**Dashboard**: <dashboardUrl>

**Summary**: <1-2 sentence description of what frontend areas were recorded and tested>

**Routes tested**: /, /settings, /profile (list the routes visited)

Local files: demos/YYYYMMDD-HHMMSS/
  - recording.mp4 (Screen Studio-style, [preset] preset)
  - screenshots/ ([N] screenshots)
  - summary.md
  - render-manifest.json

Duration: [X]s | Resolution: 1280x720 | FPS: 30
```

If the upload to the dashboard fails, still report the local files and note the upload failure:
```
Demo recorded successfully! (dashboard upload failed: <error>)
Local files: demos/YYYYMMDD-HHMMSS/
...
```

## Implementation Notes

- This skill uses TypeScript/Node.js only — no Python runtime dependency
- browser-use TypeScript library handles browser automation
- Video post-processing uses FFmpeg via Node.js child_process
- Cursor animation uses cubic bezier interpolation for smooth, deterministic paths
- Zoom effects use asymmetric easing (fast zoom-in, slow zoom-out)
- Dashboard backed by Convex (schema in `apps/web/convex/schema.ts`)
- Dashboard link must point to the specific run (`/runs/<runId>`), never just `/`
- All orchestration is TypeScript-first

## Arguments

$ARGUMENTS - Optional: specific routes or interactions to focus on (e.g., "record the login flow" or "demo the new settings page")
