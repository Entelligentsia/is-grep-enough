#!/usr/bin/env python3
"""Build a BLIND judging packet for one (rung, repo) cell of the nav-3way experiment.

Extracts each arm's final answer from its harvested raw transcript, scrubs the
identity tells that would reveal which tool the arm used (grove / lsp / baseline),
assigns the three answers stable-random A/B/C labels, and writes:

  <outdir>/<rung>-<repo>.packet.md   the blind packet a judge subagent reads
                                     (prompt + reference key + answers A/B/C)
  <outdir>/<rung>-<repo>.mapping.json the A/B/C -> arm map + per-arm process
                                      metrics. ORCHESTRATOR-ONLY: never show this
                                      to the blind judge.

The label assignment is deterministic per cell (seeded by the cell id) so re-runs
are reproducible, but is NOT the source order (baseline/grove/lsp) — so a judge
cannot infer the arm from the label position.

Usage:
  judge-pack.py <rung> <repo> [--root <testbench-root>] [--outdir <dir>]

Run from anywhere; --root defaults to the testbench repo inferred from this
script's location (…/.claude/skills/judge-arm/scripts -> repo root).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

ARMS = ["baseline", "grove", "lsp"]

# Identity tells to neutralize in the final ANSWER prose. We only touch the
# answer text (not the reference key), and only tool *names* — grounding and
# completeness are properties of the content, not of which tool is mentioned, so
# replacing a handful of names with <TOOL> does not move the gradeable signal.
# Order matters: longer/more-specific patterns first.
TELLS = [
    r"mcp__grove__\w+", r"\bgrove\b", r"\btree[- ]?sitter\b",
    r"\brust[- ]analyzer\b", r"\blanguage server\b", r"\bclangd\b",
    r"\bpyright\b", r"\bjdtls\b", r"\bgopls\b", r"\btsserver\b",
    r"\bgoToDefinition\b", r"\bgo to definition\b", r"\bworkspaceSymbol\b",
    r"\btextDocument/\w+", r"\bLSP\b", r"\bripgrep\b",
    r"\bbaseline arm\b", r"\bthe baseline\b",
]
TELL_RE = re.compile("|".join(TELLS), re.IGNORECASE)


def repo_root_from_script() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    # …/.claude/skills/judge-arm/scripts -> up 4
    return os.path.abspath(os.path.join(here, "..", "..", "..", ".."))


def extract_answer(raw_path: str) -> str:
    """Final answer = the result event's .result; fallback to last assistant text."""
    result_text, last_assistant = None, None
    with open(raw_path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(obj, dict):
                continue
            if obj.get("type") == "result" and obj.get("result"):
                result_text = obj["result"]
            if obj.get("type") == "assistant":
                for c in obj.get("message", {}).get("content", []):
                    if isinstance(c, dict) and c.get("type") == "text" and c.get("text", "").strip():
                        last_assistant = c["text"]
    return (result_text or last_assistant or "").strip()


def metrics(root: str, raw_path: str) -> dict:
    sm = os.path.join(root, "experiment", "side-metrics.sh")
    try:
        out = subprocess.run(["bash", sm, raw_path], capture_output=True, text=True, timeout=120)
        return json.loads(out.stdout)
    except Exception as e:  # metrics are advisory for the un-blind step
        return {"error": str(e)}


def scrub(text: str) -> str:
    return TELL_RE.sub("<TOOL>", text)


def labels_for(cell: str) -> dict:
    """Stable-random arm->label (A/B/C), seeded by the cell id."""
    ranked = sorted(ARMS, key=lambda a: hashlib.md5(f"{cell}:{a}".encode()).hexdigest())
    return {arm: chr(ord("A") + i) for i, arm in enumerate(ranked)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rung")
    ap.add_argument("repo")
    ap.add_argument("--root", default=repo_root_from_script())
    ap.add_argument("--outdir")
    args = ap.parse_args()

    root, rung, repo = args.root, args.rung, args.repo
    cell = f"{rung}-{repo}"
    outdir = args.outdir or os.path.join(
        "/tmp", "claude-judge", os.path.basename(root.rstrip("/")), cell
    )
    os.makedirs(outdir, exist_ok=True)

    prompt_p = os.path.join(root, "experiment", "prompts", repo, f"{rung}.txt")
    ref_p = os.path.join(root, "experiment", "prompts", repo, f"{rung}.reference.md")
    for p in (prompt_p, ref_p):
        if not os.path.isfile(p):
            print(f"ERROR: missing {p}", file=sys.stderr)
            return 2

    raws = {a: os.path.join(root, "evidence", "nav3", rung, "raw",
                            f"{repo}-{rung}.claude.{a}.jsonl") for a in ARMS}
    missing = [a for a, p in raws.items() if not os.path.isfile(p)]
    if missing:
        print(f"ERROR: {cell} not fully harvested — missing raw for: {', '.join(missing)}",
              file=sys.stderr)
        return 3

    lab = labels_for(cell)              # arm -> label
    by_label = {lab[a]: a for a in ARMS}  # label -> arm
    answers = {a: extract_answer(raws[a]) for a in ARMS}
    empty = [a for a, t in answers.items() if not t]
    if empty:
        print(f"ERROR: empty/unreadable answer for: {', '.join(empty)}", file=sys.stderr)
        return 4

    prompt = open(prompt_p).read().strip()
    ref = open(ref_p).read().strip()

    # ---- blind packet (judge reads this) ----
    parts = [
        f"# BLIND judging packet — cell {cell}",
        "",
        "You are grading three anonymized answers (A, B, C) to the same navigation",
        "task against the reference key. You do NOT know which tool produced which",
        "answer, and you must not guess. Score each on grounding and completeness.",
        "",
        "## The task (prompt the arms were given)",
        "",
        prompt,
        "",
        "## Reference answer key",
        "",
        ref,
        "",
        "## Answers to grade",
    ]
    for label in sorted(by_label):
        parts += ["", f"### Answer {label}", "", scrub(answers[by_label[label]]).strip()]
    packet_path = os.path.join(outdir, f"{cell}.packet.md")
    with open(packet_path, "w") as fh:
        fh.write("\n".join(parts) + "\n")

    # ---- mapping + metrics (orchestrator only) ----
    mapping = {
        "cell": cell, "rung": rung, "repo": repo,
        "label_to_arm": by_label,
        "pinned_source": f"experiment/repos/{repo}",
        "metrics": {a: metrics(root, raws[a]) for a in ARMS},
    }
    mapping_path = os.path.join(outdir, f"{cell}.mapping.json")
    with open(mapping_path, "w") as fh:
        json.dump(mapping, fh, indent=2)

    print(json.dumps({
        "cell": cell,
        "packet": packet_path,
        "mapping": mapping_path,
        "labels": by_label,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
