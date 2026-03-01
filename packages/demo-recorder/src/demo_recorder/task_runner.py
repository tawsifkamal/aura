"""
task_runner.py — converts a tasks[] array into a single browser-agent session.

Each task in the array becomes a numbered step in one combined prompt.
The browser agent executes all steps sequentially in one session → one video.

Task IDs act as labeled checkpoints in the recording timeline, not separate runs.

Input shape (from upstream agent like Claude Code):
    tasks = [
        {"id": "auth-1", "description": "..."},
        {"id": "auth-2", "description": "..."},
    ]
"""

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime

import httpx
from browser_use import Agent, Browser

from .recorder import get_llm


async def upload_to_convex(convex_url: str, video_path: Path) -> str | None:
    """
    Upload video to Convex blob storage and return the viewable URL.

    1. Call runs:generateUploadUrl to get a signed upload URL
    2. POST the video file to that URL
    3. Get back storageId
    4. Call runs:getVideoUrl to get the viewable URL
    """
    async with httpx.AsyncClient(timeout=120.0) as client:
        # Step 1: Get upload URL
        gen_res = await client.post(
            f"{convex_url}/api/mutation",
            json={"path": "runs:generateUploadUrl", "args": {}, "format": "json"},
        )
        if gen_res.status_code != 200:
            print(f"  ⚠️ Failed to get upload URL: {gen_res.status_code}")
            return None

        upload_url = gen_res.json().get("value")
        if not upload_url:
            print("  ⚠️ No upload URL returned")
            return None

        # Step 2: Upload the video file
        video_bytes = video_path.read_bytes()
        ext = video_path.suffix.lower()
        mime_types = {".mp4": "video/mp4", ".webm": "video/webm"}
        content_type = mime_types.get(ext, "application/octet-stream")

        upload_res = await client.post(
            upload_url,
            content=video_bytes,
            headers={"Content-Type": content_type},
        )
        if upload_res.status_code != 200:
            print(f"  ⚠️ Failed to upload video: {upload_res.status_code}")
            return None

        storage_id = upload_res.json().get("storageId")
        if not storage_id:
            print("  ⚠️ No storageId returned")
            return None

        # Step 3: Get the viewable URL via a query
        url_res = await client.post(
            f"{convex_url}/api/query",
            json={
                "path": "runs:getStorageUrl",
                "args": {"storageId": storage_id},
                "format": "json",
            },
        )
        if url_res.status_code == 200:
            video_url = url_res.json().get("value")
            if video_url:
                print(f"  ✅ Uploaded to Convex: {video_url[:80]}...")
                return video_url

        # Fallback: return storage ID if we can't get URL
        print(f"  ✅ Uploaded to Convex (storageId: {storage_id})")
        return f"convex:storage:{storage_id}"


def trim_black_opening(video_path: Path) -> Path:
    """
    Use ffmpeg blackdetect to find where real content starts and trim the
    about:blank / black opening frames from the recording.

    Returns the trimmed video path (replaces original in-place).
    Falls back and returns original path if ffmpeg is not available.
    """
    try:
        # Run blackdetect to find black intervals
        result = subprocess.run(
            [
                "ffmpeg", "-i", str(video_path),
                "-vf", "blackdetect=d=0.3:pix_th=0.15",
                "-an", "-f", "null", "/dev/null",
            ],
            capture_output=True,
            text=True,
        )
        # Parse black_end times from stderr output
        black_ends = re.findall(
            r"black_end:(\d+\.?\d*)",
            result.stderr,
        )
        if not black_ends:
            return video_path  # no black opening detected

        trim_start = float(black_ends[0])  # end of first black segment
        if trim_start < 0.5:
            return video_path  # too short to bother trimming

        trimmed_path = video_path.with_name("recording.mp4")
        subprocess.run(
            [
                "ffmpeg", "-i", str(video_path),
                "-ss", str(trim_start),
                "-c", "copy",
                str(trimmed_path),
                "-y",
            ],
            check=True,
            capture_output=True,
        )
        video_path.unlink()  # remove the un-trimmed original
        print(f"  Trimmed {trim_start:.1f}s of blank opening → {trimmed_path.name}")
        return trimmed_path

    except (FileNotFoundError, subprocess.CalledProcessError):
        # ffmpeg not installed or failed — return original untouched
        return video_path


@dataclass
class TasksResult:
    tasks: list[dict]
    prompt: str
    output_path: Path
    success: bool
    verdict: str | None = None       # "pass" / "fail" / None if unknown
    verdict_reasoning: str | None = None
    error: str | None = None
    video_url: str | None = None     # Convex signed URL if uploaded


def build_prompt(tasks: list[dict], base_url: str) -> str:
    """
    Merge all task descriptions into one numbered browser-agent instruction string.

    Each task's `id` becomes a labeled step marker so it maps to a point in
    the recorded video timeline. All steps run in a single browser session.
    """
    steps = "\n".join(
        f"  Step {i + 1} [{task['id']}]: {task['description'].strip()}"
        for i, task in enumerate(tasks)
    )

    return (
        f"Complete the following verification steps in order:\n\n"
        f"{steps}\n\n"
        f"Recording instructions (important):\n"
        f"- Complete ALL steps in sequence — do not skip any.\n"
        f"- Wait 1-2 seconds between each action so interactions are clearly visible.\n"
        f"- After filling a field, pause briefly before clicking submit.\n"
        f"- After each step completes, pause 2 seconds before starting the next step.\n"
        f"- If a step cannot be completed (element not found, page error, etc.), stop immediately and report failure. Do not retry endlessly.\n"
        f"- Do not close the browser when done."
    )


async def run_tasks(
    tasks: list[dict],
    base_url: str = "http://localhost:3000",
    output_dir: str | Path | None = None,
    model: str = "browser-use",
    max_steps: int | None = None,
    convex_url: str | None = None,
    headless: bool = False,
) -> TasksResult:
    """
    Run all tasks as one browser agent session, recording a single video.

    Args:
        tasks:      List of {"id": str, "description": str} dicts.
        base_url:   Base URL of the running app.
        output_dir: Where to save the video and summary. Defaults to demos/<timestamp>/.
        model:      LLM model (e.g. "browser-use", "gpt-4o", "claude-3-5-sonnet-latest").
        max_steps:  Max agent steps. Defaults to len(tasks) * 8.

    Returns:
        TasksResult with the output path and success flag.
    """
    # Resolve output directory
    if output_dir is None:
        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        cwd = Path.cwd()
        repo_root = cwd
        for parent in [cwd, *cwd.parents]:
            if (parent / "turbo.json").exists() or (parent / ".git").exists():
                repo_root = parent
                break
        output_dir = repo_root / "demos" / timestamp
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Scale max_steps with number of tasks if not overridden
    if max_steps is None:
        max_steps = len(tasks) * 8

    # Build one combined prompt from all tasks
    prompt = build_prompt(tasks, base_url)

    print(f"Running {len(tasks)} task(s) in one session → {output_dir}")
    print(f"\nPrompt preview:\n{'-' * 60}")
    print(prompt)
    print("-" * 60 + "\n")

    try:
        browser_session = Browser(
            headless=headless,
            record_video_dir=str(output_dir),
            record_video_size={"width": 1920, "height": 1080},
        )

        llm = get_llm(model)

        # ground_truth = all task descriptions — the judge compares the
        # final browser state against this to produce a pass/fail verdict.
        ground_truth = "\n".join(
            f"[{t['id']}]: {t['description'].strip()}" for t in tasks
        )

        # Derive start URL — first route from task descriptions, or base_url fallback
        import re as _re
        steps_text = "\n".join(t['description'] for t in tasks)
        first_route = _re.search(r"Navigate to (/\S+)", steps_text)
        start_url = f"{base_url}{first_route.group(1)}" if first_route else base_url

        agent = Agent(
            task=prompt,
            llm=llm,
            browser=browser_session,
            ground_truth=ground_truth,
            # Explicit initial navigation — bypasses directly_open_url regex
            # (which silently bails when >1 unique URL is found in the prompt)
        )

        # agent.run() auto-closes the browser session internally (await self.close() in its own finally block)
        history = await agent.run(max_steps=max_steps)

        # Wait for video to finalize - ffmpeg needs time to write moov atom
        # Longer delay in headless/container mode as video encoding can be slower
        import asyncio
        finalize_delay = 5 if headless else 3
        print(f"  Waiting {finalize_delay}s for video to finalize...")
        await asyncio.sleep(finalize_delay)

        # Extract judge verdict — judgement() returns verdict as bool (True=pass) or string
        judgement = history.judgement() if hasattr(history, 'judgement') else None
        if judgement:
            raw = judgement.get('verdict')
            if isinstance(raw, bool):
                verdict = 'pass' if raw else 'fail'
            elif isinstance(raw, str):
                verdict = raw.lower()
            else:
                verdict = 'pass' if history.is_done() else 'fail'
            verdict_reasoning = (
                judgement.get('reasoning') or judgement.get('failure_reason') or history.final_result() or ''
            )
        else:
            verdict = 'pass' if history.is_done() else 'fail'
            verdict_reasoning = history.final_result() or ''
        verdict_icon = "✅" if verdict == "pass" else "❌"
        print(f"{verdict_icon} Judge verdict: {verdict.upper()} — {str(verdict_reasoning)[:120]}")

        # Find recorded video (skip trimming - it can corrupt videos)
        video_files = list(output_dir.glob("*.mp4")) + list(output_dir.glob("*.webm"))
        final_video_path: Path | None = None
        for video_file in video_files:
            # Validate video has proper moov atom (ffprobe will fail if corrupt)
            try:
                probe_result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", str(video_file)],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if probe_result.returncode == 0 and "duration" in probe_result.stdout:
                    # Also check frame count to detect dropped frames
                    frame_check = subprocess.run(
                        ["ffprobe", "-v", "error", "-select_streams", "v:0",
                         "-count_packets", "-show_entries", "stream=nb_read_packets",
                         "-of", "csv=p=0", str(video_file)],
                        capture_output=True, text=True, timeout=30,
                    )
                    frame_count = int(frame_check.stdout.strip()) if frame_check.stdout.strip().isdigit() else 0
                    duration_match = re.search(r"duration=(\d+\.?\d*)", probe_result.stdout)
                    duration = float(duration_match.group(1)) if duration_match else 0
                    expected_fps = 25  # typical browser recording fps
                    expected_frames = duration * expected_fps * 0.5  # allow 50% frame drop threshold

                    if frame_count < expected_frames and duration > 2:
                        print(f"  ⚠️ Low frame count: {frame_count} frames for {duration:.1f}s video (expected ~{int(duration * expected_fps)})")

                    final_video_path = video_file
                    file_size = video_file.stat().st_size
                    print(f"  ✅ Valid video: {video_file.name} ({file_size / 1024:.1f} KB, {frame_count} frames)")
                else:
                    print(f"  ⚠️ Corrupt video (no moov atom): {video_file.name}")
            except (subprocess.TimeoutExpired, FileNotFoundError):
                # ffprobe not available or timeout - use file anyway
                final_video_path = video_file

        # Upload to Convex if URL provided
        video_url: str | None = None
        if convex_url and final_video_path and final_video_path.exists():
            print(f"  Uploading to Convex...")
            video_url = await upload_to_convex(convex_url, final_video_path)

        # Write summary
        summary_path = output_dir / "summary.md"
        task_list = "\n".join(
            f"- **[{t['id']}]** {t['description']}" for t in tasks
        )
        summary_path.write_text(
            f"# Demo Recording — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            f"## Verdict: {verdict_icon} {verdict.upper()}\n"
            f"{verdict_reasoning}\n\n"
            f"## Tasks ({len(tasks)} steps)\n{task_list}\n\n"
            f"## Full Prompt\n```\n{prompt}\n```\n\n"
            f"## Output\n- Video: see `recording.mp4` in this directory\n\n"
            f"---\n*Recorded with demo-recorder task_runner*\n"
        )

        print(f"✓ Recording complete → {output_dir}")
        if video_url:
            print(f"VIDEO_URL: {video_url}")
        return TasksResult(
            tasks=tasks,
            prompt=prompt,
            output_path=output_dir,
            success=True,
            verdict=verdict,
            verdict_reasoning=verdict_reasoning,
            video_url=video_url,
        )

    except Exception as exc:  # noqa: BLE001
        print(f"✗ Recording failed: {exc}")
        return TasksResult(
            tasks=tasks,
            prompt=prompt,
            output_path=output_dir,
            success=False,
            error=str(exc),
        )
