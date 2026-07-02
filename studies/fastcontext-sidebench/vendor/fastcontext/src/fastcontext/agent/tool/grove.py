import json
import os
import shlex
import shutil
import subprocess
from pathlib import Path

from .tool import Tool

GROVE_BIN = os.getenv("GROVE_BIN") or shutil.which("grove") or "/home/boni/.nvm/versions/node/v24.3.0/bin/grove"

# Read-only EXPLORATION verbs only. Excluded on purpose: setup/serve (init, fetch,
# ingest, index, serve, lock, registry), registry metadata (languages), and the
# post-edit syntax checker (check) — none help a read-only code search.
ALLOWED_VERBS = {"outline", "symbols", "source", "callers", "definition", "map"}


class GroveTool(Tool):
    name = "Grove"
    description: str = Tool.load_desc(Path(__file__).parent / "grove.md")
    parameters = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": (
                    "grove CLI arguments WITHOUT the leading 'grove'. "
                    'e.g. "symbols . --kind function --name-contains --name rename", '
                    '"outline merge-ort.c", or "source c:merge-ort.c#detect_regular_renames@1600". '
                    "Allowed verbs: outline, symbols, source, callers, definition, map."
                ),
            },
        },
        "required": ["command"],
    }

    async def call(self, parameters: str, **kwargs) -> str:
        params: dict = json.loads(parameters)
        cmd = (params.get("command") or "").strip()
        cwd = kwargs.get("cwd", str(Path.cwd()))
        if not cmd:
            return "<system-reminder>Grove: `command` is required.</system-reminder>"
        try:
            parts = shlex.split(cmd)
        except ValueError as e:
            return f"<system-reminder>Grove: could not parse command ({e}).</system-reminder>"
        if parts and parts[0] == "grove":
            parts = parts[1:]
        if not parts or parts[0] not in ALLOWED_VERBS:
            return (
                f"<system-reminder>Grove: verb must be one of {sorted(ALLOWED_VERBS)}. "
                f"Got: {parts[0] if parts else '(none)'}.</system-reminder>"
            )
        # Sandbox: keep path args inside the workspace (symbol ids like c:dir/file.c#n@1 are fine).
        for a in parts[1:]:
            if a.startswith("-"):
                continue
            if a.startswith("/") or a == ".." or a.startswith("../") or "/../" in a:
                return f"<system-reminder>Grove: path `{a}` must be inside the workspace (relative, no '..').</system-reminder>"
        try:
            out = subprocess.run(
                [GROVE_BIN, *parts], cwd=cwd, capture_output=True, text=True, timeout=30
            )
        except FileNotFoundError:
            return "<system-reminder>Grove: binary not found (set GROVE_BIN or install `grove`).</system-reminder>"
        except subprocess.TimeoutExpired:
            return "<system-reminder>Grove: timed out after 30s.</system-reminder>"

        text = out.stdout if out.returncode == 0 else (out.stderr or out.stdout)
        if not text.strip():
            return "No results." if out.returncode == 0 else "<system-reminder>Grove: empty error output.</system-reminder>"
        lines = text.splitlines()
        if len(lines) > 120:
            text = "\n".join(lines[:120]) + f"\n...(truncated {len(lines) - 120} more lines)"
        return text
