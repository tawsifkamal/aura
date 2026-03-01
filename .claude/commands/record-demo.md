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

## Step 4: Navigate and Record with browser-use

Use the browser-use TypeScript library to:
1. Open the app at the detected localhost URL
2. Navigate to routes affected by the code changes
3. Interact with changed UI elements (click buttons, fill forms, toggle states)
4. Capture screenshots at each interaction step
5. Record the full session as video

Integration points (wire up when available):
- **Laminar**: Trace each browser-use run for observability
- **Supermemory**: Recall prior run context for smarter navigation planning

## Step 5: Generate Demo Output

Create a `demos/[timestamp]/` folder containing:
- `recording.mp4` - Screen Studio-style video with smooth cursor animation and zoom emphasis
- `screenshots/` - Individual screenshots of each interaction step
- `summary.md` - Markdown summary of what was tested and demonstrated

Apply post-processing effects:
- Smooth synthetic cursor animation between interaction targets
- Zoom-in emphasis on click/type actions
- Clean, deterministic motion paths

## Step 6: Report Results

Print the output path and summary to the user:
```
Demo recorded successfully!
Output: demos/YYYY-MM-DD-HHMMSS/
  - recording.mp4
  - screenshots/ (N screenshots)
  - summary.md

Summary: [brief description of what was recorded]
```

## Implementation Notes

- This skill uses TypeScript/Node.js only - no Python runtime dependency
- browser-use TypeScript library handles browser automation
- Video post-processing uses Node.js-based rendering pipeline
- All orchestration is TypeScript-first

## Arguments

$ARGUMENTS - Optional: specific routes or interactions to focus on (e.g., "record the login flow" or "demo the new settings page")
