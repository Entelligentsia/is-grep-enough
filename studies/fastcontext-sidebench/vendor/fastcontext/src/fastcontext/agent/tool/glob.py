import json
import subprocess
from pathlib import Path

from .tool import Tool
from .utils import RG_PATH, resolve_search_path


def run(directory: str, pattern: str, cwd: str) -> str:
    command = [RG_PATH, "--files", directory, "--glob", pattern]
    timeout = 10  # seconds
    try:
        output = subprocess.run(
            command, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout
        )
    except subprocess.TimeoutExpired:
        return f"<system-reminder>Glob timed out after {timeout}s</system-reminder>"

    if output.returncode == 0:
        return output.stdout if isinstance(output.stdout, str) else output.stdout.decode("utf-8", errors="replace")
    else:
        return output.stderr if isinstance(output.stderr, str) else output.stderr.decode("utf-8", errors="replace")


class GlobTool(Tool):
    name = "Glob"
    description: str = Tool.load_desc(Path(__file__).parent / "glob.md")
    parameters = {
        "type": "object",
        "properties": {
            "directory": {
                "type": "string",
                "description": "The absolute path of the directory to search in. If not provided, the current working directory will be used.",
            },
            "pattern": {
                "type": "string",
                "description": "The glob pattern to match files or directories.",
            },
        },
        "required": ["pattern"],
    }

    async def call(self, parameters: str, **kwargs) -> str:
        cwd = kwargs.get("cwd", str(Path.cwd()))
        params: dict = json.loads(parameters)
        directory = resolve_search_path(params.get("directory"), cwd)
        pattern = params.get("pattern")

        if not Path(directory).is_dir():
            directory = str(Path(cwd).resolve())

        output = run(directory, pattern, cwd=cwd)

        limit = 100
        matched_files = output.splitlines()
        if len(matched_files) > limit:
            matched_files = matched_files[:limit]
            matched_files.append(
                f"Results are truncated: showing first {limit} results. Consider using a more specific path or pattern."
            )

        if not matched_files:
            return "No files found"
        return "\n".join(matched_files)
