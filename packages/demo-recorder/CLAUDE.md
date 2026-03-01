# demo-recorder — Browser Automation Video Generator

## What This Does

Records videos of browser-use AI automating UI verification tasks. You describe what to test → CLI generates a video of the browser doing it.

## How To Use

### 1. Generate Tasks JSON

When user describes a UI to test, create a JSON array of tasks:

```json
[
  {"id": "step-id", "description": "Navigate to /path. Do action. Verify result."}
]
```

**Task Format:**
- `id`: Short kebab-case identifier (e.g., `login-success`, `form-submit`)
- `description`: Plain English instructions. Include:
  - Where to navigate: `Navigate to /login`
  - What to interact with: `Type 'admin' into the field with id=username`
  - What to verify: `Confirm the element with id=success-banner is visible`

**Example — Login Page Test:**
```json
[
  {
    "id": "login-success",
    "description": "Navigate to /login. Type 'admin' into the field with id=username and 'password123' into the field with id=password. Click the button with id=sign-in-button. Confirm the element with id=success-banner is visible."
  },
  {
    "id": "login-failure",
    "description": "Navigate to /login. Type 'hacker' into the field with id=username and 'wrongpass' into the field with id=password. Click the button with id=sign-in-button. Confirm the element with id=error-banner is visible."
  }
]
```

### 2. Run the CLI

```bash
cd /Users/macbookpro/Documents/projects/aura/packages/demo-recorder
python -m demo_recorder.cli \
  --tasks '[{"id":"...", "description":"..."}]' \
  --base-url http://localhost:3000
```

**Arguments:**
- `--tasks` (required): JSON array string of tasks
- `--base-url` (default: `http://localhost:3000`): App base URL
- `--headless` (required for containers/CI): Run browser without display
- `--max-steps` (optional): Max agent steps
- `--output-dir` (optional): Override output directory

**IMPORTANT:** Always use `--headless` when running in containers, CI, or any environment without a display (e.g., Daytona sandbox, Docker, GitHub Actions).

### 3. Parse Output

CLI prints structured output:
```
VERDICT: pass
REASONING: Both verification steps completed successfully...
VIDEO: /path/to/demos/2026-03-01-120000/recording.mp4
OUTPUT_DIR: /path/to/demos/2026-03-01-120000
```

**Parse these lines:**
- `VERDICT:` → `pass` or `fail`
- `VIDEO:` → Path to trimmed recording
- `OUTPUT_DIR:` → Folder with video + summary.md

## Writing Good Task Descriptions

**DO:**
- Use element IDs: `the field with id=username`
- Be explicit: `Type 'admin'` not `enter credentials`
- Include verification: `Confirm the element with id=X is visible`
- One logical flow per task

**DON'T:**
- Use CSS selectors (use IDs or text content)
- Assume state persists between tasks (each navigates fresh)
- Skip the verification step

## Example Invocation

User says: "Test the login page at /login with admin/password123"

**Local (with display):**
```bash
python -m demo_recorder.cli --tasks '[
  {"id":"login-success","description":"Navigate to /login. Type admin into the field with id=username and password123 into the field with id=password. Click the button with id=sign-in-button. Confirm the element with id=success-banner is visible."}
]' --base-url http://localhost:3000
```

**Container/CI (headless):**
```bash
python -m demo_recorder.cli --tasks '[
  {"id":"login-success","description":"Navigate to /login. Type admin into id=username and password123 into id=password. Click id=sign-in-button. Confirm id=success-banner is visible."}
]' --base-url http://localhost:3000 --headless
```

Then report the VERDICT and VIDEO path to the user.
