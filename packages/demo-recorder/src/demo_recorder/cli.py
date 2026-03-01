"""
cli.py — CLI entry point for demo-recorder.

Called by Claude Code (or any agent) to record a UI verification session.

Usage:
    python -m demo_recorder.cli --tasks '[{"id":"login-success","description":"..."}]' --base-url http://localhost:3000

Output (stdout, parseable by the caller):
    VERDICT: pass
    REASONING: Both verification steps completed successfully...
    VIDEO: /path/to/demos/2026-03-01-120000/recording.mp4
    OUTPUT_DIR: /path/to/demos/2026-03-01-120000
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from demo_recorder.task_runner import run_tasks


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run browser-use demo recorder from the CLI",
    )
    parser.add_argument(
        "--tasks",
        type=str,
        required=True,
        help='JSON array of tasks: \'[{"id": "step-1", "description": "..."}]\'',
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default="http://localhost:3000",
        help="Base URL of the running app (default: http://localhost:3000)",
    )
    parser.add_argument(
        "--max-steps",
        type=int,
        default=None,
        help="Maximum agent steps (optional)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Override output directory (optional)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="browser-use",
        help="LLM model: browser-use (default), claude-sonnet-4-20250514, gpt-4o, gemini-2.0-flash",
    )
    parser.add_argument(
        "--convex-url",
        type=str,
        default=None,
        help="Convex deployment URL to upload video (e.g. https://hardy-salmon-997.convex.cloud)",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run browser in headless mode (required for containers/CI)",
    )
    args = parser.parse_args()

    # Parse tasks JSON
    try:
        tasks = json.loads(args.tasks)
    except json.JSONDecodeError as e:
        print(f"ERROR: --tasks is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(tasks, list) or not tasks:
        print("ERROR: --tasks must be a non-empty JSON array", file=sys.stderr)
        sys.exit(1)

    # Run the demo
    result = asyncio.run(
        run_tasks(
            tasks=tasks,
            base_url=args.base_url,
            output_dir=args.output_dir,
            max_steps=args.max_steps,
            model=args.model,
            convex_url=args.convex_url,
            headless=args.headless,
        )
    )

    # Find the video file (trimmed recording.mp4 preferred, fallback to raw)
    video_path = None
    for pattern in ("recording.mp4", "*.mp4", "*.webm"):
        matches = list(result.output_path.glob(pattern))
        if matches:
            video_path = matches[0]
            break

    # Structured output Claude Code can parse
    print(f"VERDICT: {result.verdict or 'unknown'}")
    print(f"REASONING: {result.verdict_reasoning or ''}")
    print(f"VIDEO: {video_path or 'not found'}")
    print(f"OUTPUT_DIR: {result.output_path}")
    if result.video_url:
        print(f"VIDEO_URL: {result.video_url}")

    if not result.success:
        print(f"ERROR: {result.error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
