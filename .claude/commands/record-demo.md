# Record Demo

Record a Screen Studio-style video demo of frontend changes using browser-use TypeScript agent.

You are an AI assistant that records demo videos of web application changes. Follow these steps precisely.

## Step 1: Analyze Changes

Run `git diff` to identify what files changed. Determine:
- Which component/page files were modified
- Which routes are likely affected
- What interactive elements (buttons, forms, modals) were added or changed

Focus on React/Next.js/Vite projects. Look for changes in:
- `src/`, `app/`, `pages/`, `components/` directories
- Files with `.tsx`, `.jsx`, `.ts`, `.js` extensions
- Route-defining files (e.g., `page.tsx`, `index.tsx`, `route.ts`)

## Step 2: Detect Web App Type

Check `package.json` for framework indicators:
- `next` -> Next.js app
- `react` -> React app
- `vue` -> Vue app
- `vite` -> Vite-based app
- `@angular/core` -> Angular app

Identify the dev start script (usually `dev`, `start`, or `serve`).

## Step 3: Start Dev Server

Start the development server in the background:
1. Detect the start command from `package.json` scripts (`dev` preferred)
2. Run it in the background
3. Poll `localhost` on common ports (3000, 5173, 8080, 4200) until the server responds
4. Wait for HTTP 200 before proceeding

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
