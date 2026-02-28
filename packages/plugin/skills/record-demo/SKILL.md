---
name: record-demo
description: Use this skill when the user wants to record a video demo of their web app changes, create a PR preview, or document UI changes visually. Triggers on "record demo", "video of changes", "show what changed", "PR preview".
version: 0.2.0
---

# Record Demo

Record a video demo of web app changes using browser-use AI agent.

## Prerequisites

- Python 3.11+
- OpenAI API key set (`OPENAI_API_KEY`)
- Dev server running (or will be started)

## Workflow

### Step 1: Check/Install demo-recorder

```bash
# Check if installed
python -c "import demo_recorder" 2>/dev/null || {
  echo "Installing demo-recorder..."
  pip install -e packages/demo-recorder
}
```

### Step 2: Ensure Dev Server Running

Check if dev server is running on expected port:
```bash
lsof -i :3000 | grep LISTEN || {
  echo "Starting dev server..."
  npm run dev &
  sleep 5
}
```

### Step 3: Run Demo Recorder

Execute the Python CLI:
```bash
cd /path/to/repo
record-demo --url http://localhost:3000 --steps 10
```

Or with custom task:
```bash
record-demo --task "Navigate to homepage, click the Login button, fill the form"
```

### Step 4: Report Output

The recorder will:
1. Analyze git diff for UI changes
2. Generate an interaction task
3. Launch browser with video recording
4. AI agent interacts with the app
5. Save video to `demos/YYYY-MM-DD-HHMMSS/`

Report the output path to user:
```
Demo recorded to: demos/2026-02-28-143000/
Files:
  - recording.webm
  - summary.md
```

## Output

- `recording.webm` - Video file of the demo
- `summary.md` - What was changed and recorded

User can attach these to their PR.

## Fallback: Screenshot Mode

If video recording fails (missing ffmpeg, etc.), fall back to Playwright MCP screenshot mode:
1. Use `mcp__playwright__browser_navigate`
2. Use `mcp__playwright__browser_take_screenshot` for each state
3. Create animated GIF from screenshots (if ffmpeg available)

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--url` | localhost:3000 | Base URL |
| `--steps` | 10 | Max agent steps |
| `--task` | auto | Custom task |
| `--model` | gpt-4o-mini | OpenAI model |
| `--output` | demos/timestamp | Output dir |
