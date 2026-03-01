# demo-recorder

Record video demos of browser automation tasks using browser-use AI agent.

## Quick Start (Daytona)

```python
from daytona import Daytona, CreateSandboxFromSnapshotParams

sandbox = Daytona().create(CreateSandboxFromSnapshotParams(snapshot="glimse"))

result = sandbox.process.exec('''
export BROWSER_USE_API_KEY="$BROWSER_USE_API_KEY"
python -m demo_recorder.cli \
  --tasks '[{"id":"test","description":"Navigate to https://example.com. Confirm page loads."}]' \
  --base-url https://example.com \
  --headless
''', timeout=300)

print(result.result)
# VERDICT: pass
# VIDEO: /workspace/demos/2026-03-01-120000/recording.mp4
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSER_USE_API_KEY` | Yes | browser-use cloud API key |
| `ANTHROPIC_API_KEY` | For Claude Code | Claude Code agent |
| `CONVEX_URL` | No | Video upload destination |

## Architecture

```
Daytona Sandbox (glimse snapshot)
├── /root/.claude/CLAUDE.md    # Claude Code reads this for task format
├── demo-recorder (pip)        # CLI tool
├── claude CLI                 # Claude Code agent
├── Playwright + Chromium      # Headless browser
└── ffmpeg                     # Video processing
```

**Flow:**
1. Claude Code reads `/root/.claude/CLAUDE.md` for instructions
2. User describes what to test
3. Claude generates tasks JSON
4. Claude calls `python -m demo_recorder.cli --tasks '...' --headless`
5. CLI returns `VERDICT`, `VIDEO` path, `VIDEO_URL`

## CLI Usage

```bash
python -m demo_recorder.cli \
  --tasks '[{"id":"login","description":"Navigate to /login. Type admin into id=username. Click id=submit."}]' \
  --base-url http://localhost:3000 \
  --headless
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--tasks` | Yes | - | JSON array of tasks |
| `--base-url` | No | `localhost:3000` | App base URL |
| `--headless` | **Yes in containers** | `false` | Headless browser mode |
| `--max-steps` | No | `tasks * 8` | Max agent steps |
| `--output-dir` | No | `demos/<timestamp>` | Output directory |
| `--convex-url` | No | - | Upload video to Convex |

### Output

```
VERDICT: pass
REASONING: All verification steps completed successfully
VIDEO: /workspace/demos/2026-03-01-120000/recording.mp4
OUTPUT_DIR: /workspace/demos/2026-03-01-120000
VIDEO_URL: https://convex.cloud/video/abc123
```

## Task Format

```json
[
  {
    "id": "login-success",
    "description": "Navigate to /login. Type admin into id=username. Type secret into id=password. Click id=submit. Confirm id=success-banner is visible."
  }
]
```

**Rules:**
- Use element IDs: `id=username`, `id=submit-button`
- Be explicit: `Type admin` not `enter credentials`
- Include verification: `Confirm id=success-banner is visible`

## Using with Claude Code

Claude Code automatically reads `/root/.claude/CLAUDE.md` in the sandbox and knows how to use the CLI.

```bash
# In Daytona sandbox
export ANTHROPIC_API_KEY="..."
export BROWSER_USE_API_KEY="..."

claude -p "Test the login at https://myapp.com/login with admin/password123"
```

Claude will:
1. Parse the request
2. Generate tasks JSON per CLAUDE.md format
3. Run `python -m demo_recorder.cli --tasks '...' --headless`
4. Return the video URL

## Daytona Snapshot

The `glimse` snapshot includes everything pre-installed:

- Python 3.12 + demo-recorder
- Claude Code CLI
- Playwright + Chromium
- ffmpeg
- CLAUDE.md context

### Rebuilding Snapshot

```python
from daytona import Daytona, Image, CreateSnapshotParams

daytona = Daytona()
image = Image.from_dockerfile("packages/demo-recorder/Dockerfile.daytona")

# Delete old
try:
    daytona.snapshot.delete(daytona.snapshot.get("glimse"))
except:
    pass

# Create new
daytona.snapshot.create(
    CreateSnapshotParams(name="glimse", image=image),
    on_logs=print
)
```

The Dockerfile uses `ARG CACHE_BUST` to force fresh pulls from GitHub.

## Full Example (Python)

```python
from daytona import Daytona, CreateSandboxFromSnapshotParams
import json, base64, os

daytona = Daytona()
sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="glimse"))

# Prepare tasks (base64 to avoid shell escaping)
tasks = [{"id": "homepage", "description": "Navigate to https://example.com. Confirm the heading is visible."}]
tasks_b64 = base64.b64encode(json.dumps(tasks).encode()).decode()

# Write tasks file
sandbox.process.exec(f"echo {tasks_b64} | base64 -d > /workspace/tasks.json")

# Run
result = sandbox.process.exec(f'''
export BROWSER_USE_API_KEY="{os.getenv('BROWSER_USE_API_KEY')}"
python -m demo_recorder.cli \
  --tasks "$(cat /workspace/tasks.json)" \
  --base-url https://example.com \
  --headless
''', timeout=300)

# Parse output
for line in result.result.split('\n'):
    if line.startswith('VIDEO:'):
        print(f"Video saved: {line.split(': ')[1]}")
    if line.startswith('VERDICT:'):
        print(f"Result: {line.split(': ')[1]}")

# Cleanup
daytona.delete(sandbox)
```

## Key Implementation Details

### --headless Flag

Added for container environments (Daytona, Docker, CI). **Always use in sandboxes.**

```python
# task_runner.py
browser_session = Browser(
    headless=headless,  # True in containers
    record_video_dir=str(output_dir),
)
```

### CLAUDE.md

Dockerfile copies CLAUDE.md to `/root/.claude/`:

```dockerfile
RUN mkdir -p /root/.claude && \
    curl -fsSL https://raw.githubusercontent.com/tawsifkamal/aura/main/packages/demo-recorder/CLAUDE.md \
    -o /root/.claude/CLAUDE.md
```

### Cache Busting

To ensure fresh code from GitHub:

```dockerfile
ARG CACHE_BUST=20260301015012
RUN pip install --no-cache-dir "git+https://github.com/tawsifkamal/aura.git#subdirectory=packages/demo-recorder"
```

Update `CACHE_BUST` value to force rebuild.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Browser fails to start | Use `--headless` flag |
| Shell escaping errors | Use base64 encoding for tasks JSON |
| No video output | Check `demos/` dir, ensure ffmpeg installed |
| Old code in snapshot | Update `CACHE_BUST` in Dockerfile, rebuild |

## Files

```
packages/demo-recorder/
├── src/demo_recorder/
│   ├── cli.py              # CLI entry point
│   ├── task_runner.py      # Core runner (--headless support)
│   └── recorder.py         # LLM config
├── Dockerfile.daytona      # Snapshot definition
├── CLAUDE.md               # Claude Code context
└── README.md               # This file
```
