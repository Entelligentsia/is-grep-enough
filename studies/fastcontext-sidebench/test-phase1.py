"""Fast Phase-1-only tester: does the candidate Phase-1 system prompt reliably make
the local 4B produce a FOCUS/PLAN artifact and STOP (deliberately end recon),
rather than grove-looping until the turn cap?

Runs recon-only (Grove restricted to structure verbs), no full explore.
Usage: test-phase1.py <phase1_prompt_file> [kmax] [trials]
"""
import asyncio
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("FC_MODEL", "qwen3.5:4b")
os.environ.setdefault("FC_BASE_URL", "http://127.0.0.1:11434/v1/")
os.environ.setdefault("GROVE_BIN", "/home/boni/.nvm/versions/node/v24.3.0/bin/grove")
os.environ["FC_ENABLE_GROVE"] = "1"

sys.path.insert(0, str(Path(__file__).parent / "vendor/fastcontext/src"))
from fastcontext.agent.llm import LLM, Message
from fastcontext.agent.tool.grove import GroveTool
from fastcontext.agent.tool.tool import ToolSet

TB = Path(__file__).resolve().parents[2]
RECON_VERBS = {"map", "symbols", "outline", "definition"}
# plan-artifact detection: any of these markers in a turn's text = the model produced a focus block
MARKERS = ["</plan>", "</focus>", "</sketch>", "PLAN_READY", "PLAN COMPLETE", "FOCUS AREA", "## Plan", "## Focus"]

QUERIES = {
    "tokio": (TB / "experiment/repos/tokio", (TB / "experiment/prompts/tokio/L5.txt").read_text().strip()),
    "django": (TB / "experiment/repos/django", (TB / "experiment/prompts/django/L4.txt").read_text().strip()),
}


PLAN_SCHEMA = {
    "type": "function",
    "function": {
        "name": "submit_plan",
        "description": ("Record your focus area and unlock the execution tools "
                        "(Read, Grep, Glob, Grove source/callers). Call this after 1-2 "
                        "Grove structure calls, once you know where the answer lives."),
        "parameters": {"type": "object", "properties": {
            "focus_files": {"type": "string", "description": "2-5 files/dirs to investigate"},
            "focus_symbols": {"type": "string", "description": "key functions/types (with grove ids if known)"},
            "steps": {"type": "string", "description": "ordered sub-goals: what to find + which tool for each"},
        }, "required": ["focus_files", "steps"]},
    },
}


def gverb(a):
    try:
        return (json.loads(a or "{}").get("command") or "").strip().split()[0]
    except Exception:
        return ""


async def run_recon(sys_prompt, workdir, query, kmax):
    llm = LLM(model=os.environ["FC_MODEL"], api_key=None, base_url=os.environ["FC_BASE_URL"],
              max_tokens=1024, temperature=0)
    ts = ToolSet([GroveTool()], work_dir=str(workdir))
    grove_plus_plan = ts.schema_list() + [PLAN_SCHEMA]
    plan_only = [PLAN_SCHEMA]
    force_at = int(os.getenv("FORCE_AT", "2"))  # after this many grove-recon turns, only submit_plan is offered
    msgs = [Message(role="system", content=sys_prompt), Message(role="user", content=query)]
    trace = []
    grove_turns = 0
    for turn in range(1, kmax + 1):
        # once the recon budget is spent, drop Grove so submit_plan is the ONLY tool -> forced plan
        schemas = plan_only if grove_turns >= force_at else grove_plus_plan
        try:
            step = await asyncio.wait_for(llm.acall(msgs, schemas), timeout=90)
        except Exception as e:
            trace.append(f"t{turn}: ERROR {str(e)[:60]}")
            return {"emit_turn": None, "stopped": False, "trace": trace, "plan": ""}
        msgs.append(step)
        content = step.content or ""
        names = [c.name for c in (step.tool_calls or [])]
        verbs = [c.name if c.name != "Grove" else gverb(c.arguments) for c in (step.tool_calls or [])]
        planned = any(n == "submit_plan" for n in names) or any(m.lower() in content.lower() for m in MARKERS)
        trace.append(f"t{turn}: calls={verbs or '-'}")
        if planned:
            pc = next((c for c in (step.tool_calls or []) if c.name == "submit_plan"), None)
            plan = pc.arguments if pc else content
            return {"emit_turn": turn, "stopped": True, "trace": trace, "plan": plan}
        allowed = {s["function"]["name"] for s in schemas}
        used_grove = False
        for c in (step.tool_calls or []):
            if c.name not in allowed:
                # model ignored the offered schema (4B hallucinates closed tools) — reject
                obs = ("<system-reminder>Grove is now CLOSED. Your only tool is submit_plan. "
                       "Call submit_plan now with focus_files/focus_symbols/steps from what you found.</system-reminder>")
            elif c.name == "Grove" and gverb(c.arguments) not in RECON_VERBS:
                obs = "<system-reminder>recon: only map/symbols/outline/definition (or submit_plan)</system-reminder>"
            else:
                res = await ts._single_tool_call(c.name, c.arguments, c.id)
                obs = res.output
                used_grove = True
            msgs.append(Message(role="tool", content=obs, tool_call_id=c.id))
        if used_grove:
            grove_turns += 1
    return {"emit_turn": None, "stopped": False, "trace": trace, "plan": (msgs[-1].content or "")}


async def main():
    pf = sys.argv[1]
    kmax = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    trials = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    sys_prompt = Path(pf).read_text()
    print(f"### Phase-1 prompt: {pf}  (kmax={kmax}, trials={trials})\n")
    ok = 0
    total = 0
    for name, (wd, q) in QUERIES.items():
        for tr in range(1, trials + 1):
            total += 1
            r = await run_recon(sys_prompt, wd, q, kmax)
            good = r["emit_turn"] is not None
            ok += 1 if good else 0
            tag = f"emit@t{r['emit_turn']} stopped={r['stopped']}" if good else "NO PLAN (hit cap)"
            print(f"[{name} trial{tr}] {tag}")
            for ln in r["trace"]:
                print("   ", ln)
    print(f"\n=== PLAN EMITTED {ok}/{total} runs ===")
    # show one plan sample
    r = await run_recon(sys_prompt, *QUERIES["tokio"], kmax)
    print("\n--- sample focus artifact (tokio) ---\n" + (r["plan"][:1200] if r["plan"] else "(none)"))


asyncio.run(main())
