import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

from .recorder import record_demo

load_dotenv()


def main():
    parser = argparse.ArgumentParser(
        description="Record video demos of web app changes"
    )
    parser.add_argument(
        "--repo",
        "-r",
        default=".",
        help="Path to git repository (default: current directory)",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output directory for recordings (default: demos/YYYY-MM-DD-HHMMSS)",
    )
    parser.add_argument(
        "--url",
        "-u",
        default="http://localhost:3000",
        help="Base URL of the app (default: http://localhost:3000)",
    )
    parser.add_argument(
        "--task",
        "-t",
        help="Custom task for the agent (default: auto-generated from git diff)",
    )
    parser.add_argument(
        "--steps",
        "-s",
        type=int,
        default=10,
        help="Maximum steps for the agent (default: 10)",
    )
    parser.add_argument(
        "--model",
        "-m",
        default="browser-use",
        help="Model to use (default: browser-use). Also supports claude-*, gpt-*, gemini-*",
    )

    args = parser.parse_args()

    try:
        output_path = asyncio.run(
            record_demo(
                repo_path=args.repo,
                output_dir=args.output,
                base_url=args.url,
                task=args.task,
                max_steps=args.steps,
                model=args.model,
            )
        )
        print(f"\nDemo saved to: {output_path}")
        print("Files:")
        for f in output_path.iterdir():
            print(f"  - {f.name}")
    except KeyboardInterrupt:
        print("\nRecording cancelled")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
