# Aura — Browser Automation Demo Recorder

Monorepo for recording browser automation videos using browser-use AI.

## Quick Start — Record a Demo

When user describes UI to verify, use the demo-recorder CLI:

```bash
cd /Users/macbookpro/Documents/projects/aura/packages/demo-recorder && \
python -m demo_recorder.cli \
  --tasks '[{"id":"task-id","description":"Navigate to /path. Do X. Verify Y."}]' \
  --base-url http://localhost:3000
```

**Output:**
```
VERDICT: pass
VIDEO: /path/to/demos/YYYY-MM-DD-HHMMSS/recording.mp4
```

## Task Format

```json
[
  {"id": "login-test", "description": "Navigate to /login. Type 'user' into id=username. Click id=submit. Confirm id=success is visible."}
]
```

- `id`: kebab-case step identifier
- `description`: What to navigate, interact with, and verify

See `packages/demo-recorder/CLAUDE.md` for detailed task-writing guide.

## Project Structure

```
packages/
  demo-recorder/     # CLI + browser-use runner
    src/demo_recorder/
      cli.py         # Entry point: python -m demo_recorder.cli
      task_runner.py # Builds prompt, runs agent, trims video
      recorder.py    # LLM config
demos/               # Output videos (timestamped folders)
```

## Development

```bash
# Install deps
cd packages/demo-recorder && pip install -e .

# Run demo recorder
python -m demo_recorder.cli --tasks '[...]' --base-url http://localhost:3000
```

## Environment

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env` for the browser-use agent.
