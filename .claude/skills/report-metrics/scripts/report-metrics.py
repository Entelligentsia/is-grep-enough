#!/usr/bin/env python3
"""Render per-cell metric tables for navigation-3way, one table per rung.

A rung-repo row is emitted ONLY when all three arms (baseline, grove, lsp) are
`harvested` — i.e. the (rung,repo) cell is comparable. Read-only: reads the
ledger (experiment/state.json) and the harvested transcripts it points at; never
writes state. Tool-call counts come from the SAME jq logic as
experiment/side-metrics.sh so the numbers reconcile with the engagement gate.

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

# jq over a stream-json transcript -> {turns, names[]}. Mirrors side-metrics.sh:
# tool_use blocks live in assistant events; num_turns lives in the result event.
JQ = r'''
[ .[]|select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name ] as $names
| (map(select(.type=="result"))[0]) as $r
| {turns:($r.num_turns//0), names:$names}
'''


def tool_counts(transcript):
    """Return (turns, total, bash, grove, lsp, read, other, other_breakdown)."""
    out = subprocess.run(["jq", "-s", JQ, transcript],
                         capture_output=True, text=True)
    d = json.loads(out.stdout)
    c = Counter(d["names"])
    bash = c.get("Bash", 0)
    read = c.get("Read", 0)
    lsp = c.get("LSP", 0)                       # Claude Code's native LSP tool
    grove = sum(v for k, v in c.items() if k.startswith("mcp__grove__"))
    total = sum(c.values())
    other = total - bash - read - grove - lsp
    ob = {k: v for k, v in c.items()
          if k not in ("Bash", "Read", "LSP") and not k.startswith("mcp__grove__")}
    return d["turns"], total, bash, grove, lsp, read, other, ob


def notes(ob, arm, grove, lsp):
    """Explain the `other` bucket + flag engagement anomalies.

    `Agent×N` means the arm spawned subagents — their INTERNAL tool calls are not
    in this transcript, so bash/read/grove/lsp here UNDERCOUNT real exploration
    (context tokens still include subagents). `ToolSearch` is the deferred-tool
    loader. A grove/lsp arm with zero capability calls is a gate concern.
    """
    parts = []
    if ob:
        parts.append("other=" + ",".join(f"{k}×{v}" for k, v in sorted(ob.items())))
    if "Agent" in ob:
        parts.append("⚠ subagents — tool counts undercount")
    if arm == "grove" and grove == 0:
        parts.append("⚠ no grove tool")
    if arm == "lsp" and lsp == 0:
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
    turns, tot, bash, grove, lsp, read, other, ob = tool_counts(c["evidence"])
    return {
        "repo": repo, "arm": arm, "turns": turns, "total": tot,
        "bash": bash, "grove": grove, "lsp": lsp, "read": read, "other": other,
        "wall_s": round(c["run_wall_s"]), "ctx_k": round(c["context"] / 1000),
        "grounding": sc.get("grounding"), "completeness": sc.get("completeness"),
        "notes": notes(ob, arm, grove, lsp),
    }


def render_md(sides, judge, rung):
    repos = [r for r in rung_repos(sides, rung) if complete(sides, rung, r)]
    if not repos:
        return None
    out = [f"### {rung} — {len(repos)} repos complete\n",
           "| Repo | Arm | Turns | Tot | bash | grove | lsp | read | other | "
           "Wall(s) | Ctx(k) | Grnd | Cmpl | Notes |",
           "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|"]
    g = lambda v: "—" if v is None else v
    for repo in repos:
        for arm in ARMS:
            r = row(sides, judge, rung, repo, arm)
            out.append(
                f"| {r['repo']} | {r['arm']} | {r['turns']} | {r['total']} | "
                f"{r['bash']} | {r['grove']} | {r['lsp']} | {r['read']} | {r['other']} | "
                f"{r['wall_s']} | {r['ctx_k']} | {g(r['grounding'])} | "
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
