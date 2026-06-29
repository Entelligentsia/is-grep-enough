# is-grep-enough dashboard — build ledger

**Single source of truth for the multi-session dashboard build.** This file *is*
the checkpoint: checked boxes are done, the first unchecked box in phase order is
the next task. Build contract is [`DASHBOARD_SPEC.md`](DASHBOARD_SPEC.md); this
file tracks *progress against it*.

Resume with **`/dashboard`** (next task) or `/dashboard status` (report only).
See [Resume protocol](#resume-protocol) and [Engagement protocol](#engagement-protocol).

- **Live:** https://entelligentsia.github.io/is-grep-enough/
- **Build locally:** `node site/build.mjs --sha "$(git rev-parse --short HEAD)" --at "<iso>"` then `python3 -m http.server -d site 8099`
- **Checkpoint:** `P0 / T0.4` *(update this line each session to the next unchecked task)*

---

## Phase 0 — Evidence browser (finish; highest trust-per-effort)

Plumbing landed in the spike. These close the P0 gaps so every number reaches a
raw byte in ≤3 clicks.

- [x] **T0.1 Transcript viewer — raw stream-json toggle.** Modal flips readable
  ↔ raw `*.jsonl`. `build.mjs` copies raw into `data/raw/` (`evidence.raw_local`);
  raw view is a lazy per-event collapsible list (summary cheap, pretty JSON on
  expand) so large files never build a multi-MB `<pre>` (§7, §11 perf budget).
- [x] **T0.2 Transcript viewer — cite links.** `linkifyCites` walks the rendered
  trail's text nodes and links `path.ext:line[-line2]` to the GitHub blob at the
  cell's pinned SHA (new tab). `build.mjs` derives `gh` (owner/repo) from the
  manifest clone url into `experiment.json`; cell `sha` already present.
- [x] **T0.3 Transcript viewer — subagent sub-trails.** `build.mjs` copies
  `raw/subagents/<repo>-<rung>.<arm>/agent-*.jsonl` into `data/subagents/` and
  surfaces each session's `{agentType, description, turns, tools, file}` on the
  cell. The modal renders them as nested collapsible sub-trails (lazy-parsed
  Claude Code session → reasoning + `▸ tool(args)`), cite-linked. 22 sessions
  across 16 cells (all baseline `Explore` fan-outs).
- [ ] **T0.4 Transcript viewer — header context strip.** Model, turns, wall,
  final cost framing the trail (§7).
- [ ] **T0.5 Coverage grid — DNF/blocked rendering.** Hatch/fill by shape not
  color; tooltip the `dnf_reason`; surface attempt count.
- [ ] **T0.6 Coverage grid — judged-overlay toggle.** Toggle that overlays
  judged? state per cell (§5.2).
- [ ] **T0.7 Cell detail — prompt verbatim + engagement table.** Show the bare
  prompt the arms saw inline (genesis-wall marker), full per-arm tool counts +
  gate signal pass/fail, cheapest-on-each-axis noted factually (§6).

## Phase 1 — Dashboard (metrics, filters, honesty)

- [ ] **T1.1 Metric small-multiples.** Five families (context, turns, wall,
  cache, cost) as rows of small charts per rung, arms as series — not one tabbed
  chart (§5.3).
- [ ] **T1.2 Context growth sparkline.** Per-turn curve from `series` on
  hover/drill; provenance points at raw file, not ledger (§3.1 truthbound note).
- [ ] **T1.3 Honest aggregation.** Min–max whisker / dot spread + printed `n`
  everywhere an aggregate appears; never a lone mean/median (§5.3).
- [ ] **T1.4 Arm-visibility toggle** in the global filter bar (§4).
- [ ] **T1.5 DNF / incomplete toggle** (default: shown, flagged) (§5.3).
- [ ] **T1.6 URL-encoded filter state.** rung·repo·arm·cell encoded in the URL so
  any view is a shareable link (§4) — essential for "look at *this* cell".

## Phase 2 — Compare view

- [ ] **T2.1 Side-by-side arms.** Three columns for a locked cell: aligned metric
  strip + three transcripts in parallel (§8).
- [ ] **T2.2 Spine-coverage strip.** Per-arm Full/Partial/Miss against the
  reference key's required spine; if not machine-parseable, render judge per-arm
  verdicts side by side — never fabricate (§8, §13.5).
- [ ] **T2.3 Free cell-vs-cell compare** (e.g. grove L2 vs L3 redis) (§8).

## Phase 3 — Polish & trust toolkit

- [ ] **T3.1 `STYLE.md` tokens** (palette, type scale, spacing, chart defaults)
  to prevent drift to template defaults (§9).
- [ ] **T3.2 Dark mode** — truly neutral grey, not black (§9).
- [ ] **T3.3 Methodology & provenance page** — genesis wall, blind judging,
  pricing table, data-sources panel (§10).
- [ ] **T3.4 Reproduce-it box** — exact commands to rebuild the feed (§10.8).
- [ ] **T3.5 Cite-link verification** — confirm cited lines resolve at the SHA.
- [ ] **T3.6 Accessibility + no-JS fallback + reduced-motion** pass (§11).

## Cross-cutting (do when it unblocks a task above)

- [ ] **TX.1 Feed schema to §3.3.** Emit `series/<cell>.json` and parsed
  `transcripts/<cell>.json` as separate files; trim `series` out of `cells.json`
  (already 302 KB). Do before T1.2 / T0.3.
- [ ] **TX.2 Harvest wiring.** Confirm `/runarm` harvest calls
  `render-transcript.mjs` so new cells land viewer-ready.

## Done (spike — plumbing)

- [x] Feed synthesizer `site/build.mjs` (partial-safe, deterministic).
- [x] Page shell: provenance header, rung+repo filter, coverage grid, one Plot
  metric chart, cell detail with judge verdicts + key-revisions, transcript modal.
- [x] Standalone transcript renderer `scripts/render-transcript.mjs` (§7.1).
- [x] Pages CI `pages.yml` — **live** at the public URL.

---

## Resume protocol

The `/dashboard` skill runs this. Manually, it is:

1. Read this ledger. The **next task** is the first unchecked `[ ]` in phase
   order (P0 → P1 → P2 → P3); cross-cutting `TX.*` only when a task above needs it.
2. Re-read the cited spec section(s) for that task before coding.
3. Implement per the [Engagement protocol](#engagement-protocol).
4. On success: check the box `[x]`, advance the **Checkpoint** line, commit
   (`feat(dashboard): …`), report what's next. One task per invocation unless told
   to continue.

## Engagement protocol

How each dashboard task is executed — the standing contract for this build:

- **Spec is law.** DASHBOARD_SPEC.md is the contract; this ledger is progress.
  If a task conflicts with the spec, the spec wins — flag the conflict, don't
  silently diverge.
- **Truthbound, always.** Every number links to its artifact; DNFs/partials shown
  flagged not hidden; `n=1` repeated; no verdict coloring; no marketing tone
  (§§1–2). A change that hides a wart is wrong even if prettier.
- **Stack discipline.** Vanilla HTML + ES modules, Observable Plot + `marked`
  from `esm.sh`, no bundler, no framework, no new deps without strong cause (§11).
  Base-path-relative asset paths only (`data/…`, not `/data/…`).
- **Read-only over the ledger.** The dashboard and `build.mjs` never write
  `state.json`; `statectl` is its only writer. The feed is a pure function of
  committed inputs — stamp SHA/timestamp via args, never `Date.now()` in logic.
- **Verify before done.** Run `build.mjs`, serve `site/` locally, confirm the
  feature renders against real evidence (incl. a partial/DNF cell) before
  checking the box. Don't mark done on unrun code.
- **Incremental.** One task → working state → commit. Keep `build.mjs`/page
  loading clean. Files end with a newline. No `Co-Authored-By`.
