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

import json
import os
import re
import signal
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime

import httpx
from browser_use import Agent, BrowserProfile

from .recorder import get_llm


# ── Xvfb + ffmpeg screen recording ────────────────────────────────────

def start_xvfb(display: str = ":99", resolution: str = "1920x1080x24") -> subprocess.Popen:
    """Start a virtual X display."""
    proc = subprocess.Popen(
        ["Xvfb", display, "-screen", "0", resolution, "-ac", "-nolisten", "tcp"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    os.environ["DISPLAY"] = display
    time.sleep(1)  # give Xvfb time to initialize
    print(f"  Xvfb started on {display} ({resolution})")
    return proc


def start_screen_recording(
    output_path: Path,
    display: str = ":99",
    resolution: str = "1920x1080",
    fps: int = 25,
) -> subprocess.Popen:
    """Start ffmpeg screen capture of the virtual display."""
    proc = subprocess.Popen(
        [
            "ffmpeg",
            "-f", "x11grab",
            "-video_size", resolution,
            "-framerate", str(fps),
            "-i", display,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-y",
            str(output_path),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"  Screen recording started → {output_path.name}")
    return proc


def stop_screen_recording(proc: subprocess.Popen | None) -> None:
    """Stop ffmpeg gracefully by sending 'q' to flush the file."""
    if proc is None or proc.poll() is not None:
        return
    try:
        proc.stdin.write(b"q")
        proc.stdin.flush()
        proc.wait(timeout=10)
        print("  Screen recording stopped")
    except Exception:
        proc.kill()
        proc.wait(timeout=5)


def stop_xvfb(proc: subprocess.Popen | None) -> None:
    """Terminate the Xvfb process."""
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


# ── Interaction event extraction from browser-use history ─────────────

def extract_interaction_events(history, recording_start_time: float) -> list[dict]:
    """
    Walk the browser-use AgentHistoryList and pull out interaction events
    with coordinates and timestamps relative to the recording start.

    Returns a list of dicts like:
        {"type": "click", "atMs": 4500, "x": 320, "y": 180, "note": "clicked button"}
    """
    events: list[dict] = []

    for step in history.history:
        # Get the step's timestamp relative to recording start
        step_time_ms = 0
        if step.metadata and hasattr(step.metadata, 'step_start_time'):
            step_time_ms = int((step.metadata.step_start_time - recording_start_time) * 1000)
            step_time_ms = max(0, step_time_ms)

        # Extract action types and coordinates from model_output + results
        if not step.model_output:
            continue

        actions = step.model_output.action or []
        results = step.result or []

        for action_idx, action in enumerate(actions):
            action_dict = action.model_dump(exclude_none=True, mode='json')
            # action_dict has one key like "click_element", "input_text", etc.
            action_type = list(action_dict.keys())[0] if action_dict else None
            if not action_type:
                continue

            action_params = action_dict[action_type]

            # Try to get click coordinates from the action result metadata
            click_x = None
            click_y = None
            if action_idx < len(results) and results[action_idx].metadata:
                meta = results[action_idx].metadata
                click_x = meta.get('click_x')
                click_y = meta.get('click_y')

            # Also check action params for explicit coordinates
            if click_x is None and isinstance(action_params, dict):
                click_x = action_params.get('coordinate_x')
                click_y = action_params.get('coordinate_y')

            # Build the note from action context
            note = ""
            if isinstance(action_params, dict):
                note = action_params.get('text', '') or action_params.get('url', '') or ''

            if action_type in ('click_element', 'click'):
                if click_x is not None and click_y is not None:
                    events.append({
                        "type": "click",
                        "atMs": step_time_ms,
                        "x": int(click_x),
                        "y": int(click_y),
                        "note": note or "click",
                    })
            elif action_type in ('input_text', 'type'):
                if click_x is not None and click_y is not None:
                    events.append({
                        "type": "click",
                        "atMs": step_time_ms,
                        "x": int(click_x),
                        "y": int(click_y),
                        "note": f"type: {note[:50]}",
                    })
            elif action_type in ('scroll_down', 'scroll_up', 'scroll'):
                # No coordinates needed for scroll, but record it
                events.append({
                    "type": "scroll",
                    "atMs": step_time_ms,
                    "x": 960,
                    "y": 540,
                    "note": action_type,
                })

    events.sort(key=lambda e: e["atMs"])
    return events


# ── Convex upload ──────────────────────────────────────────────────────

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


# ── Data types ─────────────────────────────────────────────────────────

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
    interaction_events: list[dict] = field(default_factory=list)


# ── Prompt builder ─────────────────────────────────────────────────────

def build_prompt(tasks: list[dict], base_url: str) -> str:
    """
    Merge all task descriptions into one numbered browser-agent instruction string.
    Expands relative paths (e.g. /banana) to full URLs (e.g. http://localhost:3000/banana).
    """
    # Expand relative paths like "Navigate to /path" → "Navigate to http://localhost:3000/path"
    expanded_tasks = []
    for task in tasks:
        desc = task['description'].strip()
        desc = re.sub(
            r'Navigate to (/\S+)',
            lambda m: f'Navigate to {base_url}{m.group(1)}',
            desc,
        )
        expanded_tasks.append(desc)

    steps = "\n".join(
        f"  Step {i + 1} [{tasks[i]['id']}]: {desc}"
        for i, desc in enumerate(expanded_tasks)
    )

    return (
        f"The app is running at {base_url}\n\n"
        f"Complete the following verification steps in order:\n\n"
        f"{steps}\n\n"
        f"Recording instructions (important):\n"
        f"- Complete ALL steps in sequence — do not skip any.\n"
        f"- If a step cannot be completed (element not found, page error, etc.), stop immediately and report failure. Do not retry endlessly.\n"
        f"- Do not close the browser when done."
    )


# ── Main runner ────────────────────────────────────────────────────────

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

    When headless=True (container/CI mode):
      - Starts Xvfb virtual display at :99 (1920x1080)
      - Runs browser NON-headless on the virtual display
      - Uses ffmpeg x11grab to screen-record the display
      - Produces a clean MP4 from real rendered pixels

    When headless=False (local dev with real display):
      - Uses Playwright's built-in record_video_dir
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

    xvfb_proc = None
    ffmpeg_proc = None
    use_xvfb = headless  # use virtual display in container mode

    try:
        # ── Set up virtual display if in container mode ──
        if use_xvfb:
            xvfb_proc = start_xvfb(":99", "1920x1080x24")
            # Move cursor to top-left corner so it doesn't sit in center of frame
            subprocess.run(["xdotool", "mousemove", "0", "0"], timeout=5, check=False)

        # ── Configure browser ──
        if use_xvfb:
            # Non-headless on virtual display, kiosk mode hides toolbar
            # so viewport = full 1920x1080 display = accurate click coordinates
            browser_profile = BrowserProfile(
                headless=False,
                args=["--kiosk"],
                wait_between_actions=1.5,
                minimum_wait_page_load_time=1.0,
            )
        else:
            # Local dev: use Playwright's built-in recording
            browser_profile = BrowserProfile(
                headless=False,
                record_video_dir=str(output_dir),
                record_video_size={"width": 1920, "height": 1080},
                wait_between_actions=1.5,
                minimum_wait_page_load_time=1.0,
            )

        llm = get_llm(model)

        ground_truth = "\n".join(
            f"[{t['id']}]: {t['description'].strip()}" for t in tasks
        )

        agent = Agent(
            task=prompt,
            llm=llm,
            browser_profile=browser_profile,
            ground_truth=ground_truth,
        )

        # ── Start screen recording right before the agent runs ──
        video_path = output_dir / "recording.mp4"
        if use_xvfb:
            ffmpeg_proc = start_screen_recording(video_path, ":99", "1920x1080", 25)
            time.sleep(0.5)  # let ffmpeg initialize

        # ── Run the agent ──
        recording_start_time = time.time()
        history = await agent.run(max_steps=max_steps)

        # ── Extract interaction events from history (before trim adjustment) ──
        interaction_events = extract_interaction_events(history, recording_start_time)
        print(f"  Extracted {len(interaction_events)} interaction events")

        # ── Small delay so the final frame is captured ──
        import asyncio
        await asyncio.sleep(2)

        # ── Stop screen recording ──
        if ffmpeg_proc:
            stop_screen_recording(ffmpeg_proc)
            ffmpeg_proc = None

        # ── Trim loading screen from start of video ──
        # Hardcoded 6.5s delay for browser-use splash screen
        trim_offset_sec = 6.5 if use_xvfb else 0.0
        print(f"  Trim offset: {trim_offset_sec:.2f}s")

        if use_xvfb and trim_offset_sec > 1.0:
            trimmed_path = output_dir / "trimmed.mp4"
            trim_result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", f"{trim_offset_sec:.2f}",
                    "-i", str(video_path),
                    "-c", "copy",
                    str(trimmed_path),
                ],
                capture_output=True, text=True, timeout=30,
            )
            if trim_result.returncode == 0 and trimmed_path.exists() and trimmed_path.stat().st_size > 0:
                trimmed_path.rename(video_path)
                print(f"TRIM_OFFSET: {trim_offset_sec:.2f}")
                # Adjust interaction event timestamps by the trim offset
                trim_offset_ms = int(trim_offset_sec * 1000)
                for event in interaction_events:
                    event["atMs"] = max(0, event["atMs"] - trim_offset_ms)
            else:
                print(f"  Warning: trim failed (rc={trim_result.returncode}), keeping original video")
                if trimmed_path.exists():
                    trimmed_path.unlink()

        # ── Extract judge verdict ──
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

        # ── Find and validate video ──
        video_files = list(output_dir.glob("*.mp4")) + list(output_dir.glob("*.webm"))
        final_video_path: Path | None = None
        for video_file in video_files:
            try:
                probe_result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", str(video_file)],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if probe_result.returncode == 0 and "duration" in probe_result.stdout:
                    final_video_path = video_file
                    file_size = video_file.stat().st_size
                    duration_match = re.search(r"duration=(\d+\.?\d*)", probe_result.stdout)
                    duration = float(duration_match.group(1)) if duration_match else 0
                    print(f"  ✅ Valid video: {video_file.name} ({file_size / 1024:.1f} KB, {duration:.1f}s)")
                else:
                    print(f"  ⚠️ Corrupt video: {video_file.name}")
            except (subprocess.TimeoutExpired, FileNotFoundError):
                final_video_path = video_file

        # ── Upload to Convex ──
        video_url: str | None = None
        if convex_url and final_video_path and final_video_path.exists():
            print(f"  Uploading to Convex...")
            video_url = await upload_to_convex(convex_url, final_video_path)

        # ── Write summary ──
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

        # ── Write events JSON ──
        events_path = output_dir / "events.json"
        events_path.write_text(json.dumps(interaction_events, indent=2))
        print(f"EVENTS_JSON: {json.dumps(interaction_events)}")

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
            interaction_events=interaction_events,
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

    finally:
        # Always clean up processes
        if ffmpeg_proc:
            stop_screen_recording(ffmpeg_proc)
        if xvfb_proc:
            stop_xvfb(xvfb_proc)
