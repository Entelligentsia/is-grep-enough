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


async def _instrumented_loop(agent, prompt, max_turns):
    """Replay the FastContext agent loop while timing each LLM call and tool call.
    Returns (final_text, turns) where turns is a structured per-turn record."""
    llm, toolset = agent.llm, agent.toolset
    messages = [Message(role="system", content=agent.system_prompt), Message(role="user", content=prompt)]
    turns = []
    step = None
    n = 0
    while True:
        n += 1
        if n > max_turns + 1:
            break
        if n == max_turns + 1:
            messages.append(Message(role="user",
                content="Max number of turns reached. Please provide the final answer based on the information you have gathered."))
        t0 = time.perf_counter()
        try:
            step = await llm.acall(messages, toolset.schema_list())
        except Exception as e:
            turns.append({"turn": n, "llm_ms": (time.perf_counter() - t0) * 1000, "error": str(e), "tools": []})
            break
        llm_ms = (time.perf_counter() - t0) * 1000
        messages.append(step)
        rec = {"turn": n, "llm_ms": llm_ms, "usage": step.usage, "content": step.content, "tools": []}
        if step.tool_calls:
            for c in step.tool_calls:
                tt0 = time.perf_counter()
                res = await toolset._single_tool_call(c.name, c.arguments, c.id)
                rec["tools"].append({"name": c.name, "args": c.arguments,
                                     "ms": (time.perf_counter() - tt0) * 1000,
                                     "failed": res.failed, "obs": _one_line(res.output)})
                messages.append(Message(role="tool", content=res.output, tool_call_id=c.id))
            turns.append(rec)
        else:
            turns.append(rec)
            break
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
    result, turns = await _instrumented_loop(agent, query, min(max_turns, MAX_TURNS_CAP))
    wall_ms = (time.perf_counter() - wall0) * 1000
    with open(timing_path, "w", encoding="utf-8") as f:
        json.dump({"query": query, "work_dir": work_dir, "wall_ms": wall_ms, "turns": turns}, f)
    print(f"[fastcontext] done in {wall_ms:.0f}ms -> {traj}", file=sys.stderr)
    return result


if __name__ == "__main__":
    mcp.run()
