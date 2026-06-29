#!/usr/bin/env python3
"""Render per-cell metric tables for navigation-3way, one table per rung.

A rung-repo row is emitted ONLY when all three arms (baseline, grove, lsp) are
`harvested` — i.e. the (rung,repo) cell is comparable. Read-only: reads the
ledger (experiment/state.json) and the harvested transcripts it points at; never
writes state. Tool-call counts come from the SAME jq logic as
experiment/side-metrics.sh so the numbers reconcile with the engagement gate.

Subagents: when an arm calls the `Agent` tool, the subagent's own tool calls are
ALREADY inline in the parent transcript (each subagent turn is an assistant event
tagged with `parent_tool_use_id`). Counting all assistant tool_use blocks is
therefore the complete total — parent plus every subagent. The `sub` column
reports how many of those calls were made inside subagents (the parent_tool_use_id
subset); it is a breakdown OF the total, not an addition to it. The separate
evidence/.../subagents/agent-*.jsonl files duplicate these inline events and are
deliberately NOT read — adding them would double-count.

Usage:
  scripts/report-metrics.py                # all rungs L1..L5
  scripts/report-metrics.py L2 L3          # only the named rungs
  scripts/report-metrics.py --json L2      # machine-readable rows instead of md

Run from the repo root (where experiment/state.json lives).
"""
import json, subprocess, sys, os
from collections import Counter

ARMS = ["baseline", "grove", "lsp"]
STATE = "experiment/state.json"

# jq over the parent stream-json transcript. Mirrors side-metrics.sh: tool_use
# blocks live in assistant events; num_turns lives in the result event. The
# parent transcript ALREADY contains every subagent's tool calls inline — a
# subagent turn is an assistant event tagged with `parent_tool_use_id` (pointing
# at the spawning Agent call). So counting all assistant tool_use blocks is the
# COMPLETE total (parent + all subagent depths); we additionally tag the subset
# that carries `parent_tool_use_id` to report how much was done inside subagents.
# The separate evidence/.../subagents/agent-*.jsonl files are a duplicate
# extraction of these same inline events and must NOT be added — that double-counts.
JQ = r'''
{ turns: ((map(select(.type=="result"))[0]).num_turns // 0),
  names: [ .[]|select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name ],
  sub:   [ .[]|select(.type=="assistant" and .parent_tool_use_id!=null)
              |.message.content[]?|select(.type=="tool_use")|.name ] }
'''


def split(counter):
    """Classify a name->count Counter into the reported buckets."""
    bash = counter.get("Bash", 0)
    read = counter.get("Read", 0)
    lsp = counter.get("LSP", 0)                  # Claude Code's native LSP tool
    grove = sum(v for k, v in counter.items() if k.startswith("mcp__grove__"))
    total = sum(counter.values())
    other = total - bash - read - grove - lsp
    ob = {k: v for k, v in counter.items()
          if k not in ("Bash", "Read", "LSP") and not k.startswith("mcp__grove__")}
    return dict(total=total, bash=bash, grove=grove, lsp=lsp, read=read,
                other=other, ob=ob)


def tool_counts(evidence):
    """Complete tool split for a cell from its parent transcript alone.

    Returns (turns, split_dict, sub_calls). The parent already embeds subagent
    tool calls inline, so split_dict is the true total; sub_calls is how many of
    those were made inside subagents (assistant events with parent_tool_use_id).
    """
    out = subprocess.run(["jq", "-s", JQ, evidence], capture_output=True, text=True)
    d = json.loads(out.stdout)
    return d["turns"], split(Counter(d["names"])), len(d["sub"])


def notes(sp, arm, sub_calls):
    """Explain the `other` bucket, report subagent share, flag anomalies."""
    parts = []
    ob = sp["ob"]
    if ob:
        parts.append("other=" + ",".join(f"{k}×{v}" for k, v in sorted(ob.items())))
    if sub_calls:
        parts.append(f"incl {sub_calls} subagent call(s)")
    if arm == "grove" and sp["grove"] == 0:
        parts.append("⚠ no grove tool")
    if arm == "lsp" and sp["lsp"] == 0:
        parts.append("⚠ no LSP tool")
    return "; ".join(parts)


def load():
    with open(STATE) as f:
        s = json.load(f)
    return s["sides"], s.get("judge", {})


def rung_repos(sides, rung):
    return sorted({cid.split("-", 2)[2] for cid in sides if cid.startswith(rung + "-")})


def complete(sides, rung, repo):
    cells = {a: sides.get(f"{rung}-{a}-{repo}") for a in ARMS}
    if all(c and c["status"] == "harvested" for c in cells.values()):
        return cells
    return None


def row(sides, judge, rung, repo, arm):
    cells = complete(sides, rung, repo)
    assert cells is not None, f"{rung}-{repo} is not fully harvested"
    c = cells[arm]
    sc = judge.get(f"{rung}-{repo}", {}).get("scores", {}).get(arm, {})
    turns, sp, sub_calls = tool_counts(c["evidence"])
    return {
        "repo": repo, "arm": arm, "turns": turns, "total": sp["total"],
        "bash": sp["bash"], "grove": sp["grove"], "lsp": sp["lsp"],
        "read": sp["read"], "other": sp["other"], "sub": sub_calls,
        "wall_s": round(c["run_wall_s"]), "ctx_k": round(c["context"] / 1000),
        "grounding": sc.get("grounding"), "completeness": sc.get("completeness"),
        "notes": notes(sp, arm, sub_calls),
    }


def render_md(sides, judge, rung):
    repos = [r for r in rung_repos(sides, rung) if complete(sides, rung, r)]
    if not repos:
        return None
    out = [f"### {rung} — {len(repos)} repos complete\n",
           "| Repo | Arm | Turns | Tot | bash | grove | lsp | read | other | sub | "
           "Wall(s) | Ctx(k) | Grnd | Cmpl | Notes |",
           "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|"]
    g = lambda v: "—" if v is None else v
    for repo in repos:
        for arm in ARMS:
            r = row(sides, judge, rung, repo, arm)
            out.append(
                f"| {r['repo']} | {r['arm']} | {r['turns']} | {r['total']} | "
                f"{r['bash']} | {r['grove']} | {r['lsp']} | {r['read']} | {r['other']} | "
                f"{r['sub']} | {r['wall_s']} | {r['ctx_k']} | {g(r['grounding'])} | "
                f"{g(r['completeness'])} | {r['notes']} |")
    return "\n".join(out)


def main():
    args = [a for a in sys.argv[1:] if a != "--json"]
    as_json = "--json" in sys.argv
    rungs = args or ["L1", "L2", "L3", "L4", "L5"]
    if not os.path.exists(STATE):
        sys.exit(f"run from repo root: {STATE} not found")
    sides, judge = load()
    if as_json:
        rows = []
        for rung in rungs:
            for repo in rung_repos(sides, rung):
                if complete(sides, rung, repo):
                    for arm in ARMS:
                        rows.append({"rung": rung, **row(sides, judge, rung, repo, arm)})
        print(json.dumps(rows, indent=2))
        return
    blocks = [render_md(sides, judge, r) for r in rungs]
    blocks = [b for b in blocks if b]
    if not blocks:
        print("No rung has a repo with all three arms harvested yet.")
        return
    print("\n\n".join(blocks))


if __name__ == "__main__":
    main()
