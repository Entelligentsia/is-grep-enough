#!/usr/bin/env python3
"""Generate the 'context per arm across complexity rungs' hero chart as an SVG,
straight from the nav-3way ledger (experiment/state.json). This is the final
result graphic used in grove's README + landing page: same answer, fewer tokens.

Usage:  python3 scripts/make-context-curve-svg.py <out.svg>
Reproducible: pure function of state.json (no dates/random).
"""
import json, sys
from statistics import mean

ROOT = "/home/boni/src/grove-engineering/code-analyzer-testbench"
OUT = sys.argv[1] if len(sys.argv) > 1 else "out/context-curve.svg"

s = json.load(open(f"{ROOT}/experiment/state.json"))
sides, judge = s["sides"], s["judge"]
ARMS = ["baseline", "grove", "lsp"]
RUNGS = ["L1", "L2", "L3", "L4", "L5"]
COLOR = {"baseline": "#0072b2", "grove": "#e69f00", "lsp": "#009e73"}
LABEL = {"baseline": "baseline · text", "grove": "grove · structural", "lsp": "lsp · semantic"}

# mean context (k tokens) per arm per rung, over judged cells
ctx = {a: {} for a in ARMS}
for a in ARMS:
    for r in RUNGS:
        vals = [sides[f"{r}-{a}-{repo}"]["context"]
                for c in judge if c.startswith(r + "-")
                for repo in [c.split("-", 1)[1]]
                if sides.get(f"{r}-{a}-{repo}", {}).get("context")]
        ctx[a][r] = mean(vals) / 1000 if vals else 0
overall = {a: mean([sides[f"{c.split('-',1)[0]}-{a}-{c.split('-',1)[1]}"]["context"] for c in judge]) / 1000 for a in ARMS}
grnd = {a: mean([judge[c]["scores"][a]["grounding"] for c in judge]) for a in ARMS}
cmpl = {a: mean([judge[c]["scores"][a]["completeness"] for c in judge]) for a in ARMS}

# ---- geometry ----
W, H = 760, 412
L, R, T, B = 64, 150, 92, 94          # margins (R wide for end labels)
PW, PH = W - L - R, H - T - B          # plot area
YMAX = 1600                            # k tokens
ink, faint, rule, paper = "#1a1a1a", "#857f76", "#e3e1dc", "#fbfaf7"

def x(i): return L + PW * i / (len(RUNGS) - 1)
def y(v): return T + PH * (1 - v / YMAX)

p = []
p.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">')
p.append(f'<rect width="{W}" height="{H}" fill="{paper}"/>')
# title + subtitle
p.append(f'<text x="{L}" y="34" font-size="21" font-weight="700" fill="{ink}">Same answer, far fewer tokens</text>')
p.append(f'<text x="{L}" y="56" font-size="13" fill="{faint}">Mean context per task by navigation arm, across five rungs of task complexity</text>')
# y gridlines + labels
for gv in range(0, YMAX + 1, 400):
    gy = y(gv)
    p.append(f'<line x1="{L}" y1="{gy:.1f}" x2="{L+PW}" y2="{gy:.1f}" stroke="{rule}" stroke-width="1"/>')
    lab = "0" if gv == 0 else f"{gv/1000:.1f}M".replace(".0M", "M")
    p.append(f'<text x="{L-8}" y="{gy+4:.1f}" font-size="11" text-anchor="end" fill="{faint}" font-family="ui-monospace,monospace">{lab}</text>')
# x labels
for i, r in enumerate(RUNGS):
    p.append(f'<text x="{x(i):.1f}" y="{T+PH+22:.0f}" font-size="12" text-anchor="middle" fill="{ink}" font-weight="600">{r}</text>')
p.append(f'<text x="{L}" y="{T+PH+40:.0f}" font-size="10.5" fill="{faint}">locate symbol</text>')
p.append(f'<text x="{L+PW}" y="{T+PH+40:.0f}" font-size="10.5" text-anchor="end" fill="{faint}">architecture / binding-spine →</text>')
# lines (draw baseline last so its peak reads on top? draw all, dots on top)
for a in ARMS:
    pts = " ".join(f"{x(i):.1f},{y(ctx[a][r]):.1f}" for i, r in enumerate(RUNGS))
    p.append(f'<polyline points="{pts}" fill="none" stroke="{COLOR[a]}" stroke-width="2.4"/>')
for a in ARMS:
    for i, r in enumerate(RUNGS):
        p.append(f'<circle cx="{x(i):.1f}" cy="{y(ctx[a][r]):.1f}" r="3.4" fill="{COLOR[a]}" stroke="{paper}" stroke-width="1.2"/>')
    # end label at right
    ey = y(ctx[a]["L5"])
    p.append(f'<text x="{L+PW+10}" y="{ey+4:.1f}" font-size="12" fill="{COLOR[a]}" font-weight="600">{LABEL[a].split(" · ")[0]}</text>')
    p.append(f'<text x="{L+PW+10}" y="{ey+19:.1f}" font-size="10" fill="{faint}" font-family="ui-monospace,monospace">{ctx[a]["L5"]:.0f}k</text>')
# 2.8x callout at L5 between grove and baseline
bx, b5, g5 = x(4), y(ctx["baseline"]["L5"]), y(ctx["grove"]["L5"])
p.append(f'<line x1="{bx-26:.1f}" y1="{b5:.1f}" x2="{bx-26:.1f}" y2="{g5:.1f}" stroke="{faint}" stroke-width="1" stroke-dasharray="2,2"/>')
p.append(f'<text x="{bx-32:.1f}" y="{(b5+g5)/2+4:.1f}" font-size="11.5" text-anchor="end" fill="{ink}" font-weight="700">2.8× leaner</text>')
# caption / provenance (two lines so nothing clips)
cap1 = f"Answer quality is a near-tie — grounding ~{mean(grnd.values()):.2f} · completeness ~{mean(cmpl.values()):.2f} (blind-judged)."
cap2 = (f"Overall: grove {overall['grove']:.0f}k · lsp {overall['lsp']:.0f}k · baseline {overall['baseline']:.0f}k"
        f"   ·   is-grep-enough · n=1 per cell")
p.append(f'<text x="{L}" y="{H-32}" font-size="11" fill="{ink}">{cap1}</text>')
p.append(f'<text x="{L}" y="{H-13}" font-size="10" fill="{faint}" font-family="ui-monospace,monospace">{cap2}</text>')
p.append("</svg>")

open(OUT, "w").write("\n".join(p) + "\n")
print(f"wrote {OUT}")
print("context(k):", {a: {r: round(ctx[a][r]) for r in RUNGS} for a in ARMS})
