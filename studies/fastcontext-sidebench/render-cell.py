"""Render an interleaved outer(Claude Code)+inner(FastContext/qwen3.5:4b) transcript
for one side-bench cell. Adapted from fastcontext/render_one.py for THIS study's
delegation-only setup (correct header, repo, steering).

Usage: render-cell.py <repo> <rung>
Reads out/<rung>-fastcontext-<repo>.outer.jsonl + .inner*.json, writes
transcripts/<rung>-<repo>.md.
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TB_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")

repo, rung = sys.argv[1], sys.argv[2]
prefix = f"{rung}-fastcontext-{repo}"
model_label = "Qwen3.5-4B"


def one(s, n=140):
    s = (s or "").replace("\n", " / ").strip()
    return s if len(s) <= n else s[:n] + " ..."


def short_args(name, args):
    try:
        d = json.loads(args)
    except Exception:
        return one(args, 90)
    if name == "Grove":
        return d.get("command", "")
    if name == "Read":
        return d.get("path", "")
    if name == "Grep":
        return f"pattern={d.get('pattern','')} path={d.get('path','.')} mode={d.get('output_mode','')}"
    if name == "Glob":
        return f"pattern={d.get('pattern','')}"
    return one(args, 90)


def render_inner(inner, L):
    for t in inner.get("turns", []):
        u = t.get("usage") or {}
        tok = f"p={u.get('prompt_tokens','?')} c={u.get('completion_tokens','?')}"
        head = f"     |FC  Turn {t['turn']}: LLM {t['llm_ms']:.0f}ms [{tok}]"
        if t.get("error"):
            L.append(head + "  ! LLM error"); continue
        if not t["tools"]:
            c = t.get("content") or ""
            if "<final_answer>" in c:
                L.append(head + "  -> emits <final_answer>")
            elif c.strip():
                L.append(head + f"  -> text: {one(c,80)}")
            else:
                L.append(head + "  -> EMPTY (parser drop)")
        else:
            L.append(head)
            for x in t["tools"]:
                flag = "FAIL" if x["failed"] else "ok"
                L.append(f"     |FC     -> {x['name']}({short_args(x['name'], x['args'])}) {x['ms']:.0f}ms [{flag}]")
                L.append(f"     |FC        obs: {one(x['obs'])}")
    L.append(f"     |FC  => returned to Claude Code (inner wall {inner.get('wall_ms',0)/1000:.1f}s)")


outer = [json.loads(l) for l in open(f"{OUT}/{prefix}.outer.jsonl")]
inners = [json.load(open(f)) for f in sorted(glob.glob(f"{OUT}/{prefix}.inner*.json"),
          key=lambda p: int(p.split("inner")[1].split(".")[0]))]
prompt = open(f"{TB_ROOT}/experiment/prompts/{repo}/{rung}.txt").read().strip()

L = []
w = L.append
w(f"# FastContext × Claude Code — Interleaved Transcript ({repo} {rung}, {model_label})\n")
w(f"Delegation-only side-bench cell. Claude Code (sonnet) has **no built-in tools** "
  f"(`--tools \"\"`); its only capability is the FastContext `explore` MCP tool, which "
  f"delegates to a local **{model_label}** (Ollama) that drives grove inside FastContext. "
  f"All citations therefore come from the inner explorer, not the outer model.\n")
w("## Config\n")
w("| | |")
w("|---|---|")
w(f"| Outer model | **sonnet** (matches the grove arm) |")
w(f"| Inner explorer | **{model_label}** (Ollama, thinking off), grove-enabled, FC_MAX_TOKENS=1024 |")
w("| Inner tools | Read · Glob · Grep · **Grove** (grove CLI) |")
w("| Outer harness | `claude -p --tools \"\" --allowedTools mcp__fastcontext__explore --strict-mcp-config` |")
w(f"| Repo | `experiment/repos/{repo}` (pinned SHA) |")
w(f"| Reference key | `experiment/prompts/{repo}/{rung}.reference.md` (walled off from the run) |")
w(f"\n**Prompt:** {prompt}\n")
w("```text")

fc_idx = 0
for e in outer:
    t = e.get("type")
    if t == "assistant":
        for b in e["message"]["content"]:
            bt = b.get("type")
            if bt == "text" and b.get("text", "").strip():
                w(f"|CC  note: {one(b['text'],150)}")
            elif bt == "tool_use":
                if b["name"] == "ToolSearch":
                    w("|CC  ToolSearch -> load mcp__fastcontext__explore schema")
                elif b["name"] == "mcp__fastcontext__explore":
                    w(f"|CC  -> explore(query={one(b['input'].get('query',''),110)!r})")
                    if fc_idx < len(inners):
                        render_inner(inners[fc_idx], L); fc_idx += 1
    elif t == "user":
        c = e["message"]["content"]
        if isinstance(c, list):
            for b in c:
                if b.get("type") == "tool_result":
                    cc = b.get("content")
                    txt = cc if isinstance(cc, str) else " ".join(x.get("text", "") for x in cc if isinstance(x, dict))
                    if "<final_answer>" in txt:
                        w("|CC  <- tool_result: <final_answer> citations")
                    elif txt.strip():
                        w(f"|CC  <- tool_result: {one(txt,110)}")
                    else:
                        w("|CC  <- tool_result: (empty)")
    elif t == "result":
        w("|CC  => FINAL ANSWER to user (below)")
w("```\n")

final = ""
for e in outer:
    if e.get("type") == "result":
        final = e.get("result") or ""
w("**Claude Code's final answer:**\n")
w("```text")
w(final.strip())
w("```")

os.makedirs(f"{HERE}/transcripts", exist_ok=True)
out_path = f"{HERE}/transcripts/{rung}-{repo}.md"
open(out_path, "w").write("\n".join(L) + "\n")
print("wrote", out_path)
