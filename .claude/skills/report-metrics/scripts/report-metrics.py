#!/usr/bin/env python3
"""Render per-cell metric tables for navigation-3way, one table per rung.

A rung-repo row is emitted ONLY when all three arms (baseline, grove, lsp) are
`harvested` — i.e. the (rung,repo) cell is comparable. Read-only: reads the
ledger (experiment/state.json) and the harvested transcripts it points at; never
writes state. Tool-call counts come from the SAME jq logic as
experiment/side-metrics.sh so the numbers reconcile with the engagement gate.

Subagents: when an arm calls the `Agent` tool, the subagent's own tool calls live
in separate transcripts under `<rung>/raw/subagents/<repo>-<rung>.<arm>/agent-*.jsonl`,
NOT in the parent. Those are folded into the split so the counts are TRUE totals
(parent + subagents); the `sub` column reports how many calls came from subagents,
and Notes verifies the harvested transcript count matches the parent's spawn count.
Turns stays parent-only — subagent transcripts carry no result/num_turns event.

Usage:
  scripts/report-metrics.py                # all rungs L1..L5
  scripts/report-metrics.py L2 L3          # only the named rungs
  scripts/report-metrics.py --json L2      # machine-readable rows instead of md

Run from the repo root (where experiment/state.json lives).
"""
import json, subprocess, sys, os, glob
from collections import Counter

ARMS = ["baseline", "grove", "lsp"]
STATE = "experiment/state.json"

# jq -> tool_use names + parent num_turns. Mirrors side-metrics.sh: tool_use
# blocks live in assistant events; num_turns lives in the result event. Subagent
# transcripts carry no result event, so $r resolves to the parent's when present
# and turns falls back to 0 (we only read turns from the parent file).
JQ = r'''
[ .[]|select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name ] as $names
| (map(select(.type=="result"))[0]) as $r
| {turns:($r.num_turns//0), names:$names}
'''


def _names_and_turns(transcript):
    out = subprocess.run(["jq", "-s", JQ, transcript], capture_output=True, text=True)
    d = json.loads(out.stdout)
    return Counter(d["names"]), d["turns"]


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


def subagent_files(evidence, rung, repo, arm):
    """Harvested subagent transcripts for a cell (empty list if none)."""
    grp = os.path.join(os.path.dirname(evidence), "subagents", f"{repo}-{rung}.{arm}")
    return sorted(glob.glob(os.path.join(grp, "agent-*.jsonl")))


def tool_counts(evidence, rung, repo, arm):
    """True tool split = parent + every harvested subagent transcript.

    Returns (turns, split_dict, sub_calls, sub_files_n, spawns) where split_dict
    is over parent+subagents combined, sub_calls is the tool-call count folded in
    from subagents, sub_files_n is how many subagent transcripts were found, and
    spawns is the parent's `Agent` tool-call count (what SHOULD have been found).
    """
    parent, turns = _names_and_turns(evidence)
    spawns = parent.get("Agent", 0)
    combined = Counter(parent)
    sub_calls = 0
    subs = subagent_files(evidence, rung, repo, arm)
    for f in subs:
        c, _ = _names_and_turns(f)
        combined.update(c)
        sub_calls += sum(c.values())
    return turns, split(combined), sub_calls, len(subs), spawns


def notes(sp, arm, sub_calls, sub_files_n, spawns):
    """Explain the `other` bucket, report folded subagents, flag anomalies."""
    parts = []
    ob = sp["ob"]
    if ob:
        parts.append("other=" + ",".join(f"{k}×{v}" for k, v in sorted(ob.items())))
    if spawns and sub_files_n == spawns:
        parts.append(f"+{sub_calls} calls from {sub_files_n} subagent(s) folded in")
    elif spawns:                                 # spawned but transcripts missing
        parts.append(f"⚠ {spawns - sub_files_n}/{spawns} subagent transcript(s) "
                     f"missing — split still undercounts")
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
    turns, sp, sub_calls, sub_files_n, spawns = tool_counts(
        c["evidence"], rung, repo, arm)
    return {
        "repo": repo, "arm": arm, "turns": turns, "total": sp["total"],
        "bash": sp["bash"], "grove": sp["grove"], "lsp": sp["lsp"],
        "read": sp["read"], "other": sp["other"], "sub": sub_calls,
        "wall_s": round(c["run_wall_s"]), "ctx_k": round(c["context"] / 1000),
        "grounding": sc.get("grounding"), "completeness": sc.get("completeness"),
        "notes": notes(sp, arm, sub_calls, sub_files_n, spawns),
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
