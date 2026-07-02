import os
import platform
import shutil
from pathlib import Path


def _find_existing_rg() -> str | None:
    rg_name = "rg.exe" if platform.system() == "Windows" else "rg"
    rg = shutil.which(rg_name)
    if rg and os.path.exists(rg):
        return rg
    return None


RG_PATH = _find_existing_rg()


def _remap_parts(path: str, cwd: Path) -> Path:
    """Reinterpret a model-supplied path as workspace-relative.

    Small explorer models often invent absolute paths (e.g. `/flask/src`) instead
    of using the real workspace path. Strip any leading slash and a leading segment
    that duplicates the workspace basename, then anchor under cwd.
    """
    parts = [x for x in Path(path).parts if x not in ("/", "\\", "")]
    if parts and parts[0] == cwd.name:
        parts = parts[1:]
    return cwd.joinpath(*parts).resolve() if parts else cwd


def resolve_search_path(path: str | None, cwd: str) -> str:
    """Resolve a Glob/Grep path into a real location inside the workspace.

    Never escapes cwd and never hard-fails: a bogus path degrades to searching the
    whole workspace so the explorer still gathers evidence.
    """
    cwd_p = Path(cwd).resolve()
    if not path:
        return str(cwd_p)
    p = Path(path)
    cand = (p if p.is_absolute() else cwd_p / p).resolve()
    if cand.is_relative_to(cwd_p):
        return str(cand) if cand.exists() else str(cwd_p)
    remapped = _remap_parts(path, cwd_p)
    if remapped.is_relative_to(cwd_p) and remapped.exists():
        return str(remapped)
    return str(cwd_p)


def resolve_read_path(path: str, cwd: str) -> str | None:
    """Resolve a Read path into a real location inside the workspace, or None if it
    truly escapes. Existence is checked by the caller so a clear error is returned.

    Unlike search, Read stays strict: a foreign absolute path (e.g. `/etc/passwd`)
    is rejected. The only remap is when the model duplicated the workspace basename
    as the leading segment (e.g. `/flask-fctest/src/app.py`)."""
    cwd_p = Path(cwd).resolve()
    p = Path(path)
    cand = (p if p.is_absolute() else cwd_p / p).resolve()
    if cand.is_relative_to(cwd_p):
        return str(cand)
    parts = [x for x in p.parts if x not in ("/", "\\", "")]
    if parts and parts[0] == cwd_p.name:
        remapped = cwd_p.joinpath(*parts[1:]).resolve() if parts[1:] else cwd_p
        if remapped.is_relative_to(cwd_p):
            return str(remapped)
    return None
