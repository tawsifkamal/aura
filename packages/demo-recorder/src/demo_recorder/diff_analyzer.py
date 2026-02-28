import subprocess
from pathlib import Path
from dataclasses import dataclass


@dataclass
class UIChange:
    file_path: str
    change_type: str  # added, modified, deleted
    component_name: str | None
    route: str | None
    interactions: list[str]


class DiffAnalyzer:
    def __init__(self, repo_path: Path):
        self.repo_path = repo_path

    def get_changed_files(self, base: str = "HEAD~1") -> list[str]:
        result = subprocess.run(
            ["git", "diff", "--name-only", base],
            cwd=self.repo_path,
            capture_output=True,
            text=True,
        )
        return [f for f in result.stdout.strip().split("\n") if f]

    def get_ui_files(self, files: list[str]) -> list[str]:
        ui_extensions = {".tsx", ".jsx", ".vue", ".svelte"}
        ui_dirs = {"pages", "app", "routes", "components", "src"}

        ui_files = []
        for f in files:
            path = Path(f)
            if path.suffix in ui_extensions:
                if any(part in path.parts for part in ui_dirs):
                    ui_files.append(f)
        return ui_files

    def analyze_file(self, file_path: str) -> UIChange:
        full_path = self.repo_path / file_path
        interactions = []
        component_name = None
        route = None

        # Detect route from file path
        if "app/" in file_path or "pages/" in file_path:
            route = self._extract_route(file_path)

        if full_path.exists():
            content = full_path.read_text()

            # Extract component name
            if "export default function " in content:
                start = content.find("export default function ") + 24
                end = content.find("(", start)
                component_name = content[start:end].strip()
            elif "export function " in content:
                start = content.find("export function ") + 16
                end = content.find("(", start)
                component_name = content[start:end].strip()

            # Detect interactive elements
            if "<button" in content.lower() or "Button" in content:
                interactions.append("click_button")
            if "<form" in content.lower() or "Form" in content:
                interactions.append("fill_form")
            if "<input" in content.lower() or "Input" in content:
                interactions.append("type_input")
            if "<select" in content.lower() or "Select" in content:
                interactions.append("select_option")
            if "modal" in content.lower() or "Modal" in content or "Dialog" in content:
                interactions.append("open_modal")
            if "<a " in content.lower() or "Link" in content:
                interactions.append("click_link")

        return UIChange(
            file_path=file_path,
            change_type="modified" if full_path.exists() else "deleted",
            component_name=component_name,
            route=route,
            interactions=interactions,
        )

    def _extract_route(self, file_path: str) -> str:
        path = Path(file_path)

        # Next.js app router
        if "app/" in file_path:
            parts = []
            in_app = False
            for part in path.parts:
                if part == "app":
                    in_app = True
                    continue
                if in_app and part not in ("page.tsx", "page.jsx", "layout.tsx"):
                    if not part.startswith("("):  # Skip route groups
                        parts.append(part)
            return "/" + "/".join(parts) if parts else "/"

        # Pages router
        if "pages/" in file_path:
            name = path.stem
            if name == "index":
                return "/"
            return "/" + name

        return "/"

    def generate_task(self, changes: list[UIChange], base_url: str) -> str:
        task_parts = [f"Navigate to {base_url}"]

        visited_routes = set()
        for change in changes:
            if change.route and change.route not in visited_routes:
                if change.route != "/":
                    task_parts.append(f"Then navigate to {change.route}")
                visited_routes.add(change.route)

            for interaction in change.interactions:
                if interaction == "click_button":
                    task_parts.append("Find and click any visible buttons")
                elif interaction == "fill_form":
                    task_parts.append("If there's a form, fill it with test data")
                elif interaction == "open_modal":
                    task_parts.append("If there's a modal trigger, open it")
                elif interaction == "click_link":
                    task_parts.append("Click on navigation links to explore")

        task_parts.append("Take your time to show each interaction clearly")
        task_parts.append("Wait 2 seconds between actions for visibility")

        return ". ".join(task_parts) + "."

    def analyze(self, base: str = "HEAD~1") -> tuple[list[UIChange], str]:
        changed = self.get_changed_files(base)
        ui_files = self.get_ui_files(changed)

        if not ui_files:
            # Fallback: check all uncommitted changes
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
            )
            all_files = [line[3:] for line in result.stdout.strip().split("\n") if line]
            ui_files = self.get_ui_files(all_files)

        changes = [self.analyze_file(f) for f in ui_files]
        return changes, self.generate_task(changes, "http://localhost:3000")
