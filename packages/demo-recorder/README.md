# demo-recorder

Record video demos of web app changes using browser-use AI agent.

## Install

```bash
cd packages/demo-recorder
pip install -e ".[dev]"
```

Or with uv:
```bash
uv pip install -e .
```

## Requirements

- Python 3.11+
- OpenAI API key: `export OPENAI_API_KEY=sk-...`
- Dev server running on localhost

## Usage

### CLI

```bash
# Auto-detect changes from git diff
record-demo

# Custom URL
record-demo --url http://localhost:5173

# Custom task
record-demo --task "Click the login button, fill the form, submit"

# More steps for complex flows
record-demo --steps 20
```

### Python

```python
from demo_recorder import DemoRecorder
import asyncio

async def main():
    recorder = DemoRecorder(
        repo_path=".",
        base_url="http://localhost:3000",
    )
    output = await recorder.record()
    print(f"Saved to: {output}")

asyncio.run(main())
```

## How it works

1. Analyzes `git diff` to find changed UI files (.tsx, .jsx, etc.)
2. Detects interactive elements (buttons, forms, modals)
3. Generates a task for the browser-use agent
4. Agent navigates and interacts with the app
5. Records video to `demos/YYYY-MM-DD-HHMMSS/`

## Output

```
demos/
└── 2026-02-28-143000/
    ├── recording.webm   # Video file
    └── summary.md       # What was recorded
```
