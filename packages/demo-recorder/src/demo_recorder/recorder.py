import asyncio
import os
from pathlib import Path
from datetime import datetime

from browser_use import Agent, Browser

from .diff_analyzer import DiffAnalyzer, UIChange


def get_llm(model: str | None = None):
    if model is None or model == "browser-use":
        from browser_use import ChatBrowserUse
        return ChatBrowserUse()
    elif model.startswith("claude"):
        from browser_use import ChatAnthropic
        return ChatAnthropic(model=model)
    elif model.startswith("gemini"):
        from browser_use import ChatGoogle
        return ChatGoogle(model=model)
    else:
        from browser_use import ChatOpenAI
        return ChatOpenAI(model=model)


class DemoRecorder:
    def __init__(
        self,
        repo_path: Path,
        output_dir: Path | None = None,
        base_url: str = "http://localhost:3000",
        model: str = "browser-use",
    ):
        self.repo_path = Path(repo_path)
        self.base_url = base_url
        self.model = model

        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
            self.output_dir = self.repo_path / "demos" / timestamp

        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.analyzer = DiffAnalyzer(self.repo_path)

    async def record(
        self,
        task: str | None = None,
        prompt: str | None = None,
        max_steps: int = 10,
        base_ref: str = "HEAD~1",
    ) -> Path:
        changes: list[UIChange] = []

        if task is None:
            changes, auto_task = self.analyzer.analyze(base_ref)
            change_summary = self.analyzer.summarize_changes(changes)

            if prompt:
                # Main agent provided context — fuse it with git diff hints
                task = (
                    f"{prompt.strip()}\n\n"
                    f"Git diff context:\n{change_summary}\n\n"
                    f"Start at {self.base_url}. "
                    f"Take 2 seconds between actions for visibility."
                )
            else:
                task = auto_task
                if not task or task == f"Navigate to {self.base_url}.":
                    task = (
                        f"Navigate to {self.base_url}. "
                        f"Explore the page by scrolling and clicking interactive elements. "
                        f"Click any buttons you find. "
                        f"If there are forms, fill them with test data. "
                        f"Navigate to any visible links. "
                        f"Take 2 seconds between each action."
                    )

        print(f"Recording demo to: {self.output_dir}")
        print(f"Task: {task}")
        print(f"UI changes detected: {len(changes)}")

        browser = Browser(
            headless=False,
            record_video_dir=self.output_dir,
        )

        llm = get_llm(self.model)

        agent = Agent(
            task=task,
            llm=llm,
            browser=browser,
        )

        await agent.run(max_steps=max_steps)

        # Generate summary
        self._write_summary(changes, task, prompt=prompt)

        print(f"Demo recorded to: {self.output_dir}")
        return self.output_dir

    def _write_summary(self, changes: list[UIChange], task: str, prompt: str | None = None) -> None:
        summary_path = self.output_dir / "summary.md"

        lines = [
            f"# Demo Recording - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "",
        ]

        if prompt:
            lines += ["## Agent Prompt", prompt, ""]

        lines += [
            "## Task",
            task,
            "",
            "## Changes Detected",
        ]

        if changes:
            for change in changes:
                lines.append(f"- `{change.file_path}`")
                if change.component_name:
                    lines.append(f"  - Component: {change.component_name}")
                if change.route:
                    lines.append(f"  - Route: {change.route}")
                if change.interactions:
                    lines.append(f"  - Interactions: {', '.join(change.interactions)}")
        else:
            lines.append("- No UI file changes detected")

        lines.extend([
            "",
            "## Output",
            "- Video: See `.webm` file in this directory",
            "",
            "---",
            "*Recorded with demo-recorder*",
        ])

        summary_path.write_text("\n".join(lines))


async def record_demo(
    repo_path: str = ".",
    output_dir: str | None = None,
    base_url: str = "http://localhost:3000",
    task: str | None = None,
    prompt: str | None = None,
    max_steps: int = 10,
    model: str = "browser-use",
) -> Path:
    recorder = DemoRecorder(
        repo_path=Path(repo_path),
        output_dir=Path(output_dir) if output_dir else None,
        base_url=base_url,
        model=model,
    )
    return await recorder.record(task=task, prompt=prompt, max_steps=max_steps)
