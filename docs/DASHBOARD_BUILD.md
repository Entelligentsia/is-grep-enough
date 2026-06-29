# is-grep-enough dashboard — build ledger

**Single source of truth for the multi-session dashboard build.** This file *is*
the checkpoint: checked boxes are done, the first unchecked box in phase order is
the next task. Build contract is [`DASHBOARD_SPEC.md`](DASHBOARD_SPEC.md); this
file tracks *progress against it*.

Resume with **`/dashboard`** (next task) or `/dashboard status` (report only).
See [Resume protocol](#resume-protocol) and [Engagement protocol](#engagement-protocol).

- **Live:** https://entelligentsia.github.io/is-grep-enough/
- **Build locally:** `node site/build.mjs --sha "$(git rev-parse --short HEAD)" --at "<iso>"` then `python3 -m http.server -d site 8099`
- **Checkpoint:** `P3 / T3.3` — **P1 + P2 complete; T3.1–T3.2 done** *(update this line each session to the next unchecked task)*

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
- [x] **T0.4 Transcript viewer — header context strip.** Modal header shows
  model · turns · wall · cost · peak ctx · engagement signal, framing the trail (§7).
- [x] **T0.5 Coverage grid — DNF/blocked rendering.** Status by shape/fill:
  filled=harvested, empty=pending, grey-hatch=blocked, arm-bordered-hatch=DNF;
  tooltip shows status + flags + `dnf_reason`. Attempt count is *not* in the
  ledger schema (sides carry no attempts field) so it is not fabricated.
- [x] **T0.6 Coverage grid — judged-overlay toggle.** Checkbox overlays an ink
  tick on each segment whose arm has a blind judge score (§5.2).
- [x] **T0.7 Cell detail — prompt verbatim + engagement table.** Bare prompt
  shown inline with genesis-wall marker (`build.mjs` adds `cell.prompt` from
  `prompts/<repo>/<rung>.txt`); per-arm tool-usage table (bash/grove/lsp/read/
  mcp/total) with the gate signal pass/fail; cheapest-on-each-axis marked
  "lowest" factually (§6).

## Phase 1 — Dashboard (metrics, filters, honesty)

- [x] **T1.1 Metric small-multiples.** Five families (context, turns, wall,
  cache, cost) as rows of small charts per rung, arms as series — not one tabbed
  chart (§5.3). Replaced the tabbed `#chart` + `#metric-tabs` with `#metrics-grid`:
  one `Plot` figure per family, faceted by rung (`fx`), arms on `x`, one dot per
  repo + a per-rung-per-arm median tick, y from zero (`~s` ticks). Removed metric
  tab state/wiring. Partial rungs render with fewer dots (L4=2, L5=5); single-rung
  filter narrows the facet row.
- [x] **T1.2 Context growth sparkline.** Per-arm context-growth sparkline drilled
  in the cell detail (`renderSparkline`), lazy-fetched from `series/<cell>.json`
  (TX.1): Plot area+line+dots, x=turn y=ctx, axis from zero, in arm-identity
  color. Provenance line points at the **raw file** ("build-derived, not the
  ledger scalar"), honoring §3.1 — and visibly so (e.g. baseline L2-redis shows
  19 series turns vs the ledger's 14 `num_turns`, which the curve is honest about).
- [x] **T1.3 Honest aggregation.** Each small-multiple now layers a min–max
  whisker (`Plot.ruleX` groupX min/max) behind the raw per-repo dots and the
  median tick, so no aggregate shows as a lone mark. Per-rung `n` is printed on
  each facet header (`Plot.axisFx` top, `L2 · n=10`, `L4 · n=2`) so partial rungs
  self-report a smaller n; caption restates whisker/tick/n + the n=1 caveat (§5.3).
- [x] **T1.4 Arm-visibility toggle** in the global filter bar (§4). Three arm
  checkboxes (swatch-labelled) in `.filters`; `state.arms` + `visibleArms()` gate
  every view: coverage marks render only visible segments, metric small-multiples
  filter rows and set `x`/`color` domains to the shown arms (y-axis rescales), and
  the cell-detail columns drop hidden arms (grid reflows to the visible count).
  All-off shows an explicit "no arms selected" note.
- [x] **T1.5 DNF / incomplete toggle** (default: shown, flagged) (§5.3). Global
  `#t-incomplete` checkbox (default checked). Off → coverage holds incomplete/DNF
  cells as faint dotted placeholders (`.seg.omitted`) so only completed runs read
  (64 omitted / 86 shown today), and the metrics drop harvested-but-DNF points.
  On (default) → shown flagged; any harvested-DNF metric point renders as a hollow
  ✕ ring (never a clean dot) with the count called out in the caption. No
  harvested-DNF data exists yet, so the ring path is forward-looking; the coverage
  collapse is verified against the 64 real incomplete cells.
- [x] **T1.6 URL-encoded filter state.** rung·repo·arm·cell (+ judged/incomplete
  toggles) encoded in `?query` (§4). `applyURL`+`syncControls` read the link on
  load and reflect it into every control; `syncURL` (replaceState, non-default
  keys only) keeps the URL current on each change; `popstate` restores on
  back/forward. Validated: deep-link `?rung=L3&repo=redis&arms=baseline,grove&
  cell=L3-redis&incomplete=0` restores filters, arm checkboxes, the locked cell
  detail, and the toggles. Changing rung clears a now-invalid locked cell.

## Phase 2 — Compare view

- [x] **T2.1 Side-by-side arms.** Three columns for a locked cell: aligned metric
  strip + three transcripts in parallel (§8). The cell detail already supplies the
  aligned metric strip (per-arm columns); this adds a `renderCompareTranscripts`
  strip below it — a lazy "compare N transcripts side by side" toggle that builds
  one scrollable pane per visible arm with a readable trail, marked-rendered and
  cite-linked. Synchronized scroll is offered (proportional, reentrancy-guarded)
  but **off by default** per §8 (trails diverge in length). Verified headless
  (Playwright/Chrome) on L1-redis (3 panes, 11/1/10 cites) and L5-spring-boot;
  sync control present + unchecked by default; no data 404s.
- [x] **T2.2 Spine-coverage strip.** Per-arm Full/Partial/Miss against the
  reference key's required spine; if not machine-parseable, render judge per-arm
  verdicts side by side — never fabricate (§8, §13.5). The reference key's element
  list is **not** in the feed and stays judge-only (genesis wall), so a per-element
  checklist would be fabrication — taken off the table per §13.5 #5. Instead
  `renderSpineStrip` renders the spec's endorsed fallback: the blind judge's own
  per-arm coverage word (Full/Partial/Miss), parsed from the leading token of the
  verdict prose (`COVERAGE_RE`), aligned side by side with completeness/grounding.
  All 84 arm-verdicts parse cleanly (83 Full, 1 Partial). Glyphs (●/◐/○) encode
  coverage, never a good/bad hue (truthbound: no verdict coloring). Verified
  headless: L1-redis all ● Full; L5-bitcoin baseline ◐ Partial vs grove/lsp ●
  Full; unjudged L4-spring-boot shows no strip; no page errors.
- [x] **T2.3 Free cell-vs-cell compare** (e.g. grove L2 vs L3 redis) (§8). New
  "Free compare" section: two `#fc-a`/`#fc-b` pickers over all harvested cells with
  a readable trail. `renderFreeCompare` draws an aligned metric strip (context/
  turns/wall/cost + judge coverage word) with the lower value on each cost-axis
  marked "lower" factually (never "winner"), then the two trails in parallel panes
  (reuses `buildPanes` with a cell-id label; sync-scroll off by default). State is
  URL-encoded (`fca`/`fcb`, T1.6 parity) so a comparison is shareable. Verified
  headless on the canonical grove L2-vs-L3-redis (L3 costs more context/wall/$ for
  the same Full coverage — the scaling story §8 wants), a cross-arm baseline-vs-lsp
  pair, the same-cell guard, and URL restore; no page errors.

## Phase 3 — Polish & trust toolkit

- [x] **T3.1 `STYLE.md` tokens** (palette, type scale, spacing, chart defaults)
  to prevent drift to template defaults (§9). `site/STYLE.md` codifies the shipped
  system **descriptively** — every value is the one actually in `style.css`
  (`:root`, light + dark) and `app.mjs` (Plot defaults), with a "change both in the
  same commit" rule. Covers palette (Okabe–Ito arm triad, color = arm identity
  only), type (one sans + one mono, tabular figures, the full size table), spacing/
  layout (1060px column, ~70–74ch measure, hairlines-not-boxes), Plot chart
  defaults (zero-baseline `~s`, dot/median-tick/min–max-whisker vocabulary, DNF
  hollow-ring), motion, and a11y invariants. Verified truthful: all 17 light+dark
  hex tokens grep-match `style.css`, and the 6 cited chart defaults grep-match
  `app.mjs` (no drift).
- [x] **T3.2 Dark mode** — truly neutral grey, not black (§9). An in-page
  `#theme-switch` (auto / light / dark) now drives it, persisted in localStorage;
  "auto" leaves the attribute off so `prefers-color-scheme` rules, while an
  explicit `:root[data-theme=…]` always wins over the media query so the toggle can
  override the OS. Dark paper is `#1b1a17` (warm neutral grey, not black). Fixed two
  dark-mode warts: chart frame stroke and dot halo were hardcoded light hues
  (`#e3e1dc` / `white`) — now read `cssVar("--rule")` / `cssVar("--paper")` so they
  track theme (a theme change re-renders, re-reading the vars). Verified headless:
  default=light tokens, dark click → paper `#1b1a17` + frame stroke `#34322d`
  (recolored, not the old light value), persists across reload (dark button still
  pressed), light click forces light; no page errors.
- [ ] **T3.3 Methodology & provenance page** — genesis wall, blind judging,
  pricing table, data-sources panel (§10).
- [ ] **T3.4 Reproduce-it box** — exact commands to rebuild the feed (§10.8).
- [ ] **T3.5 Cite-link verification** — confirm cited lines resolve at the SHA.
- [ ] **T3.6 Accessibility + no-JS fallback + reduced-motion** pass (§11).

## Cross-cutting (do when it unblocks a task above)

- [x] **TX.1 Feed schema to §3.3 (series split).** `build.mjs` now writes each
  cell's per-turn context-growth curve to `site/data/series/<cell>.json`
  (`{turn,ctx,in,cache_read,cache_create,out}`; no `cum_cost` — per-turn cost is
  not billed, §13) and the cell carries only a `series_local` pointer +
  `series_turns` count. Trimmed inline `series` out of `cells.json`: 400 KB →
  233 KB. (Transcripts are already separate files — `data/transcripts/*.md`,
  rendered by the working viewer — so the "parsed transcripts/<cell>.json" half
  is deferred: it's an optimization that unblocks no pending task.)
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
