- use snapshot "glimpse-pt3"
- make sure to set the BROWSER_USE_API_KEY to pass in runtime daytona sandbox env vars
also use right daytona sandbox api 


look at  the last two cells (below and below that in demo.ipynb that's how you use it with daytona)


CELL 1

# ─── Daytona: Start Sandbox & Verify Snapshot Contents ───────────────────────
# Spin up a sandbox from "glimse" snapshot and verify everything installed correctly

from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona_client = Daytona()

# Create sandbox from our custom snapshot
sandbox = daytona_client.create(CreateSandboxFromSnapshotParams(snapshot="glimpse-pt3"))
print(f"✅ Sandbox created: {sandbox.id}")

# Check files installed by Dockerfile
print("\n📁 Checking Dockerfile-installed files:")

checks = [
    ("CLAUDE.md", "test -f /root/.claude/CLAUDE.md"),
    ("demo-recorder package", "python -c 'import demo_recorder; print(demo_recorder.__file__)'"),
    ("claude CLI", "which claude"),
    ("playwright chromium", "test -d /root/.cache/ms-playwright/chromium-* && echo 'installed'"),
    ("ffmpeg", "which ffmpeg"),
    ("git", "which git"),
]

for name, cmd in checks:
    result = sandbox.process.exec(cmd)
    if result.exit_code == 0:
        print(f"  ✅ {name}")
    else:
        print(f"  ❌ {name}: NOT FOUND")

print(f"\n🔑 Sandbox ID: {sandbox.id}")


CELL 2

# ─── Run demo-recorder in Daytona Sandbox ─────────────────────────────────────
# Test with a simple Google search task

import os
import json
import base64
from dotenv import load_dotenv

load_dotenv()

# Task: Google search flow
tasks = [
    {
        "id": "google-search",
        "description": (
            "Navigate to https://www.google.com. "
            "Type Anthropic Claude AI into the search box. "
            "Press Enter or click the search button. "
            "Wait for results to load. "
            "Click on the first result that mentions Anthropic."
        )
    }
]

tasks_json = json.dumps(tasks)
tasks_b64 = base64.b64encode(tasks_json.encode()).decode()

# Load API keys from .env
browser_use_key = os.getenv("BROWSER_USE_API_KEY")
convex_url = os.getenv("CONVEX_URL", CONVEX_URL)  # Fall back to notebook constant

if not browser_use_key:
    raise ValueError("BROWSER_USE_API_KEY not set in .env")

print("🚀 Running demo-recorder in sandbox...")
print(f"   Task: {tasks[0]['id']}")
print(f"   Convex: {convex_url}")

# First, install browser-use[video] for recording support
print("\n📦 Installing browser-use[video] for recording...")
sandbox.process.exec("pip install --no-cache-dir 'browser-use[video]'", timeout=120)

# Write tasks via base64 to avoid shell escaping issues
sandbox.process.exec(f"echo {tasks_b64} | base64 -d > /workspace/tasks.json")

# Verify
verify = sandbox.process.exec("cat /workspace/tasks.json")
print(f"   Tasks JSON: {verify.result.strip()}")

# Run the CLI with --headless and --convex-url flags
cmd = f'''
export BROWSER_USE_API_KEY="{browser_use_key}"
cd /workspace
python -m demo_recorder.cli \
  --tasks "$(cat /workspace/tasks.json)" \
  --base-url https://www.google.com \
  --headless \
  --convex-url "{convex_url}"
'''

print("\n⏳ Running browser agent (this may take a minute)...")
result = sandbox.process.exec(cmd, timeout=300)  # 5 min timeout
print("\n📤 Output:")
print(result.result)

if result.exit_code != 0:
    print(f"\n❌ Exit code: {result.exit_code}")