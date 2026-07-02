"""Minimal MCP server exposing FastContext repository exploration as a tool.

Wraps the working FastContext explorer (make_fastcontext_agent) so any MCP-capable
harness (Claude Code, Cursor, etc.) can delegate repo exploration and receive
compact file:line citations instead of spending its own context on broad reads.

Run (stdio):
    uv run --with mcp --project /home/boni/src/fastcontext \
        python /home/boni/src/fastcontext/mcp_server.py

Required env (OpenAI-compatible endpoint for the explorer model):
    FC_BASE_URL, FC_MODEL, and optionally FC_API_KEY / FC_REASONING_EFFORT /
    FC_MAX_TOKENS / FC_TEMPERATURE.
"""

import json
import os
import sys
import time

from mcp.server.fastmcp import FastMCP

from fastcontext.agent.agent_factory import make_fastcontext_agent
from fastcontext.agent.llm import Message

mcp = FastMCP("fastcontext")

MAX_TURNS_CAP = 6


def _one_line(s, n=140):
    s = (s or "").replace("\n", " / ").strip()
    return s if len(s) <= n else s[:n] + " ..."


# --- FC_PLAN_FIRST: two-phase plan-then-act explorer -------------------------
# Phase 1 (recon): the model gets Grove (structure verbs) + a submit_plan tool.
# It maps the code, then MUST call submit_plan (its focus area) to unlock phase 2.
# Enforcement is by the HARNESS, not the prompt (a 4B ignores "MANDATORY" text and
# never emits a free-text plan — with tools in scope it always calls a tool). So the
# plan is itself a TOOL CALL, and after FC_RECON_TURNS grove turns Grove is CLOSED
# (schema + execution enforced, since the 4B hallucinates closed tools) leaving
# submit_plan the only option. Tuning: 4/4 plan emission on redis/django/tokio.
# Phase 2 (execute): all real tools; the model executes its plan at its discretion.
RECON_VERBS = {"map", "symbols", "outline", "definition"}
PLAN_SCHEMA = {
    "type": "function",
    "function": {
        "name": "submit_plan",
        "description": ("Record your focus area and unlock the execution tools "
                        "(Read, Grep, Glob, and Grove source/callers). Call this after 1-2 "
                        "Grove structure calls, once you know where the answer lives."),
        "parameters": {"type": "object", "properties": {
            "focus_files": {"type": "string", "description": "the 2-5 files/dirs to investigate"},
            "focus_symbols": {"type": "string", "description": "key functions/types, with grove ids where known"},
            "steps": {"type": "string", "description": "ordered sub-goals; for each, what to find and which tool (source/Read/Grep)"},
        }, "required": ["focus_files", "steps"]},
    },
}
PHASE1_NOTE = (
    "\n\n## PLANNING PHASE\nYou are scoping WHERE to look before investigating. Tools now:\n"
    "- Grove — structure only: map, symbols, outline, definition.\n"
    "- submit_plan — records your focus area and unlocks the execution tools.\n\n"
    "Do 1-2 Grove calls to locate the relevant code (e.g. `symbols . --name-contains "
    "--name <term>`, then `map <dir>` or `outline <file>`). As soon as you can name the "
    "files and symbols involved, CALL submit_plan(focus_files, focus_symbols, steps). "
    "You CANNOT read bodies, Grep, or answer until you call submit_plan; after 1-2 Grove "
    "calls Grove closes and submit_plan is your only option — do not over-explore."
)
PHASE2_NOTE = (
    "EXECUTION PHASE — your plan is recorded (below) and all tools are unlocked: Grove "
    "(incl. source/callers), Read, Grep, Glob. Execute your plan to answer the ORIGINAL "
    "question, choosing whichever tool fits each step — Grove for named symbols, Grep for "
    "literal text, Read to confirm a range. Cite file:line and emit <final_answer> when done."
)


def _grove_verb(arguments):
    try:
        cmd = (json.loads(arguments or "{}").get("command") or "").strip().split()
        return cmd[0] if cmd else ""
    except Exception:
        return ""


# Session-scoped plan cache: the recon/plan phase runs ONCE per repo per server
# process (= per session). The first explore call maps structure and produces a
# plan; every later call skips recon and gets that plan injected as a standing hint,
# running straight in execute with all tools. Keyed by work_dir so repos don't mix.
_PLAN_CACHE: dict[str, str] = {}
CACHED_HINT = (
    "PRIOR STRUCTURAL MAP of this repository, from an earlier recon pass (use as a "
    "starting hint — it may not fully cover THIS question; verify with tools):\n"
)


async def _instrumented_loop(agent, prompt, max_turns, work_dir=""):
    """Replay the FastContext agent loop while timing each LLM call and tool call.
    Returns (final_text, turns) where turns is a structured per-turn record."""
    llm, toolset = agent.llm, agent.toolset
    plan_first = os.getenv("FC_PLAN_FIRST") == "1"
    force_at = int(os.getenv("FC_RECON_TURNS", "2"))   # grove-recon turns before Grove closes
    grove_schema = next((s for s in toolset.schema_list() if s["function"]["name"] == "Grove"), None)
    cached_plan = _PLAN_CACHE.get(work_dir) if plan_first else None
    do_recon = bool(plan_first and grove_schema and not cached_plan)
    sys_content = agent.system_prompt + (PHASE1_NOTE if do_recon else "")
    messages = [Message(role="system", content=sys_content), Message(role="user", content=prompt)]
    if cached_plan:
        messages.append(Message(role="user", content=CACHED_HINT + cached_plan))
    turns = []
    step = None
    n = 0
    phase = "recon" if do_recon else "execute"
    grove_turns = 0
    while True:
        n += 1
        if n > max_turns + 1:
            break
        if n == max_turns + 1:
            messages.append(Message(role="user",
                content="Max number of turns reached. Please provide the final answer based on the information you have gathered."))
        if phase == "recon":
            # recon budget: Grove(structure)+submit_plan; once spent, ONLY submit_plan
            schemas = ([grove_schema] if grove_turns < force_at else []) + [PLAN_SCHEMA]
        else:
            schemas = [s for s in toolset.schema_list() if s["function"]["name"] != "submit_plan"]
        allowed = {s["function"]["name"] for s in schemas}
        t0 = time.perf_counter()
        try:
            step = await llm.acall(messages, schemas)
        except Exception as e:
            turns.append({"turn": n, "llm_ms": (time.perf_counter() - t0) * 1000, "error": str(e), "tools": []})
            break
        llm_ms = (time.perf_counter() - t0) * 1000
        messages.append(step)
        rec = {"turn": n, "phase": phase, "llm_ms": llm_ms, "usage": step.usage, "content": step.content, "tools": []}
        if step.tool_calls:
            used_grove = False
            transition = False
            for c in step.tool_calls:
                tt0 = time.perf_counter()
                if c.name == "submit_plan" and phase == "recon":
                    if c.arguments:
                        _PLAN_CACHE[work_dir] = c.arguments   # cache for the rest of the session
                    obs = "Plan recorded. Execution tools unlocked: Read, Grep, Glob, Grove (source/callers)."
                    rec["tools"].append({"name": c.name, "args": c.arguments, "ms": 0.0, "failed": False, "obs": _one_line(obs)})
                    messages.append(Message(role="tool", content=obs, tool_call_id=c.id))
                    messages.append(Message(role="user", content=PHASE2_NOTE + "\n\nYour recorded plan:\n" + (c.arguments or "")))
                    transition = True
                    continue
                if c.name not in allowed:
                    if phase == "recon":
                        obs = ("<system-reminder>Grove is CLOSED. Your only tool now is submit_plan. "
                               "Call submit_plan(focus_files, focus_symbols, steps) from what you found.</system-reminder>")
                    else:
                        obs = ("<system-reminder>Planning is done. Use Read/Grep/Glob/Grove to execute "
                               "your plan, then emit <final_answer>.</system-reminder>")
                elif phase == "recon" and c.name == "Grove" and _grove_verb(c.arguments) not in RECON_VERBS:
                    obs = ("<system-reminder>Planning phase: Grove is limited to "
                           "map/symbols/outline/definition. source/callers/Read/Grep/Glob unlock "
                           "after you call submit_plan.</system-reminder>")
                else:
                    res = await toolset._single_tool_call(c.name, c.arguments, c.id)
                    obs = res.output
                    if c.name == "Grove":
                        used_grove = True
                    rec["tools"].append({"name": c.name, "args": c.arguments,
                                         "ms": (time.perf_counter() - tt0) * 1000,
                                         "failed": res.failed, "obs": _one_line(obs)})
                    messages.append(Message(role="tool", content=res.output, tool_call_id=c.id))
                    continue
                rec["tools"].append({"name": c.name, "args": c.arguments, "ms": 0.0, "failed": True, "obs": _one_line(obs)})
                messages.append(Message(role="tool", content=obs, tool_call_id=c.id))
            if used_grove:
                grove_turns += 1
            if transition:
                phase = "execute"
            turns.append(rec)
        else:
            turns.append(rec)
            if phase == "execute":
                break  # a text-only turn in execute phase is the final answer
    final = step.content if (step and turns and not turns[-1].get("tools")) else None
    return final or "", turns

# Where per-call trajectories are written, so runs are inspectable as proof.
TRAJ_DIR = os.environ.get(
    "FC_MCP_TRAJ_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fastcontext-mcp"),
)


@mcp.tool()
async def explore(query: str, repo_path: str = "", max_turns: int = 6) -> str:
    """Explore a code repository and return compact file:line citations for code
    relevant to the query. Read-only (Read/Glob/Grep). Prefer this over broad
    manual reads/greps when you need to locate WHERE relevant code lives in an
    unfamiliar repo.

    Args:
        query: Natural-language description of what to find, e.g.
            "where is session cookie signing implemented".
        repo_path: Absolute path to the repository root. Defaults to the server's
            working directory (the dir the harness was launched from).
        max_turns: Max exploration turns before forcing a final answer (default 6).

    Returns:
        A short explanation followed by a <final_answer> block of path:line-range
        citations.
    """
    work_dir = os.path.abspath(repo_path) if repo_path else os.getcwd()
    if not os.path.isdir(work_dir):
        return f"Error: repo_path '{work_dir}' is not a directory."

    os.makedirs(TRAJ_DIR, exist_ok=True)
    stamp = int(time.time() * 1000)
    traj = os.path.join(TRAJ_DIR, f"traj_{stamp}.jsonl")
    timing_path = os.path.join(TRAJ_DIR, f"traj_{stamp}.timing.json")

    print(f"[fastcontext] explore work_dir={work_dir} query={query!r}", file=sys.stderr)
    agent = make_fastcontext_agent(trajectory_file=traj, work_dir=work_dir)
    wall0 = time.perf_counter()
    result, turns = await _instrumented_loop(agent, query, min(max_turns, MAX_TURNS_CAP), work_dir=work_dir)
    wall_ms = (time.perf_counter() - wall0) * 1000
    with open(timing_path, "w", encoding="utf-8") as f:
        json.dump({"query": query, "work_dir": work_dir, "wall_ms": wall_ms, "turns": turns}, f)
    print(f"[fastcontext] done in {wall_ms:.0f}ms -> {traj}", file=sys.stderr)
    return result


if __name__ == "__main__":
    mcp.run()
