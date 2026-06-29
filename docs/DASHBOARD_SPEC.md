# is-grep-enough — results dashboard specification

Public name / repo: **`is-grep-enough`** (org `Entelligentsia`); Pages URL
`https://entelligentsia.github.io/is-grep-enough/`. The experiment's internal id
stays **`nav-3way`** (wired through `state.json`/`spine.json`/evidence paths and
owned by `statectl`) — `is-grep-enough` is the public/product identity, `nav-3way`
is the experiment id.

A static, GitHub Pages–hosted UX for **exploring and validating** the question:
*when a coding agent explores a large, unfamiliar codebase, is basic text search
enough — or does it need fast-light structural navigation (tree-sitter / grove) or
authoritative semantic navigation (LSP)?* The experiment answers it as a fair
comparison of three navigation regimes — **baseline** (text), **grove**
(structural), **lsp** (semantic) — across a task-complexity ladder (L1–L5) over 10
pinned real-world repos, looking for where on the ladder the added power stops
paying for itself.

This document is the build contract for that UX. It is written to one standard:
a skeptical engineer who has never seen the project should be able to land on the
page, understand what was measured, **check whether the conclusions hold**, and
reach the raw bytes behind any number in ≤3 clicks. The dashboard is an evidence
browser first and a chart gallery second.

Status of this doc: **spec + initial spike landed.** Decisions in [§13](#13-decisions-resolved)
are resolved; a thin end-to-end vertical slice exists under `site/` and
`scripts/render-transcript.mjs` (see [§14 What exists now](#14-what-exists-now-the-spike)).
This is an iterative artifact — the spike proves the channel, the dynamic feed,
and the graphics; the full dashboard is refined as data accrues.

---

## 1. Audience and goals

**Primary audience:** developers evaluating whether structural tooling (grove)
actually helps a coding agent, who distrust benchmarks by default and want to
audit one.

**The UX must let them:**

1. See the current results graphically — context growth, turns, wall-clock,
   cache-token usage, cost — sliced by arm, rung, and repo.
2. Read the per-arm / per-rung / per-repo tool-usage stats (the engagement
   evidence: *did the arm actually use its capability?*).
3. Filter to a single rung or a single repo and have every view respond.
4. Drill all the way down to a transcript and read it as a legible reasoning
   trail (which file it opened, what it concluded, in order).
5. Compare the three arms on the same task side by side.

**The non-obvious goal (the reason this is worth building well):**
**falsifiability.** The experiment's own thesis is "no arm universally wins; the
separation is cost and route, not answer quality" — a claim that is only credible
if a reader can try to break it. Every design decision below serves that:
link-to-evidence everywhere, the engagement gate made visible, blind-judging
provenance exposed, DNFs and key-revisions shown rather than hidden, and an
explicit, repeated **n=1** caveat.

**Anti-goal:** persuasion. The page must never read as marketing for grove. If a
reader finishes feeling *sold* rather than *informed*, the design failed.

---

## 2. Design principles

1. **Truthbound over flattering.** Show DNFs, retries, blocked cells, single-run
   variance, and "the reference key was wrong here" corrections as first-class
   content. A wart visible is trust earned.
2. **Every number is a link.** No statistic appears without a path to the
   artifact it came from (raw `*.jsonl`, readable `*.md`, the `statectl` record,
   the judge packet). Hovering a bar shows its provenance; clicking opens it.
3. **Cost is shown honestly.** Tokens are split into input / output /
   cache-creation / cache-read, because cache-read is ~10× cheaper and dominates
   context-heavy runs — a single "tokens" number would mislead. Dollar cost uses
   the **billed** `total_cost_usd` recorded in each run, not a recomputed
   estimate.
4. **No verdict coloring.** Arms get a fixed, neutral, colorblind-safe palette
   that encodes *identity*, never *quality*. Never red=bad/green=good — the
   experiment explicitly does not crown a winner.
5. **Neutral, document-grade aesthetic.** It should read like a well-typeset
   technical report or a precise internal tool, not a launch page. No hero, no
   gradients, no glassmorphism, no animated counters, no pill-chip soup. See
   [§9](#9-visual-design-language).
6. **Reproducible by construction.** The page is a pure function of committed
   files. The build script is in the repo; "view source" is the whole repo.
7. **Static and dependency-light.** GitHub Pages, no server, no tracking, works
   offline after first load, degrades to readable content with JS disabled where
   feasible.

---

## 3. Data architecture (the truthbound core)

The site is a pure function of three committed inputs. A **deterministic build
step** denormalizes them into a static JSON feed the page fetches. No live
computation, no server, no hidden transforms.

### 3.1 Sources (all already in the repo)

| Source | What it provides | Notes |
|---|---|---|
| `experiment/state.json` | the ledger: `sides[<rung>-<arm>-<repo>]` = `{status, run_wall_s, context, engaged, evidence, ts}`; `judge[<rung>-<repo>]` = `{scores.{arm}.{grounding,completeness,verdict}, key_revisions[], verdict, ts}`; `setup`, `registered_repos` | **Only writer is `statectl`.** The build step is read-only over it. |
| `experiment/spine.json` | the definition: `arms` (capability/image/mcp), `rungs` L1–L5, `repos`, `metrics`, `order_policy`, `model` (sonnet), `watchdog` | The "what the experiment claims to be" — drives labels, ordering, methodology copy. |
| `evidence/nav3/<rung>/raw/*.jsonl` | per-run stream-json: per-message `usage` (cache tokens), and a terminal `result` event with `total_cost_usd`, `duration_ms`, `num_turns`, full `usage` | The rich data. Cost, cache breakdown, and per-turn series live **only** here. |
| `evidence/nav3/<rung>/readable/*.md` | the human transcript: `💬` reasoning, `▸` tool calls, `RESULT` block | Source for the transcript viewer. |
| `evidence/nav3/<rung>/raw/subagents/<cell>.<arm>/` | each Task/Agent subagent's own tool-by-tool session | Surfaced as nested transcripts in cells that fanned out. |

> **Truthbound note to honor in the UI:** the ledger's `context` is a single
> scalar; it is *not* the per-turn growth curve. The growth curve, cost, and
> cache split are derived by the build step from the raw `*.jsonl`. The page must
> not imply the ledger contains what it doesn't — where a metric is build-derived,
> its provenance link points at the raw transcript, not at `state.json`.

### 3.2 Build step

A single committed Node script — `site/build.mjs` — emits `site/data/*.json`.
It must be:

- **Pure & reproducible:** same inputs → byte-identical output (stamp `git`
  SHA + generated-at via an arg, never `Date.now()` inside logic).
- **Reuse, not reinvent:** tool/engagement counts come from the existing
  `experiment/side-metrics.sh` so the dashboard and the run-time engagement gate
  compute identical numbers. Cost/cache/per-turn come from a small raw-jsonl
  reader.
- **Honest about gaps:** a cell with no result event, a DNF, or a missing raw
  file is emitted with an explicit `status`/`incomplete` flag — never silently
  dropped.

### 3.3 Output feed (proposed schema)

```
site/data/
  meta.json        # generated_at, git_sha, statectl schema note, model, pricing table used, caveats[]
  experiment.json  # spine: arms (id,label,capability,color), rungs[], repos[], order
  cells.json       # one row per (rung,arm,repo): status, engaged, metrics{}, tools{}, cost{}, evidence paths
  judge.json       # one row per (rung,repo): scores{arm:{grounding,completeness,verdict}}, key_revisions[], verdict
  series/<cell>.json  # per-turn arrays for growth charts: [{turn, ctx_in, ctx_cache_read, ctx_cache_create, out, cum_cost}]
  transcripts/<cell>.json  # parsed readable trail: [{role:'reason'|'tool'|'result', text|tool|args, ...}] + subagents[]
```

`cells.json` row (illustrative):

```json
{
  "rung": "L2", "arm": "grove", "repo": "redis",
  "status": "harvested", "engaged": true,
  "metrics": { "context_tokens": 296887, "run_wall_s": 108, "num_turns": 21, "tool_calls": 20 },
  "tools": { "grove_tools": 18, "bash_calls": 0, "reads": 1, "lsp_tools": 0, "mcp_nongrove_tools": 0 },
  "cost": { "usd": 0.28, "input": 18, "output": 5672, "cache_create": 18489, "cache_read": 277788 },
  "engagement_signal": { "key": "grove_tools", "value": 18, "passed": true },
  "evidence": { "raw": "evidence/nav3/L2/raw/redis-L2.claude.grove.jsonl",
                "readable": "evidence/nav3/L2/readable/redis-L2.claude.grove.md" }
}
```

A cell that is `blocked`/`pending`/DNF carries the same shape with `status` set
accordingly and a `dnf_reason` string, so the coverage grid renders truthfully.

---

## 4. Information architecture

Five views, one persistent filter bar. Everything is reachable from the
Overview; nothing is more than three clicks from a raw byte.

```
Overview (dashboard)
  ├─ Filter bar (rung · repo · arm) — global, URL-encoded
  ├─ Coverage & integrity grid  →  Cell detail
  ├─ Metric small-multiples      →  Cell detail / Compare
  └─ Headline finding (+ caveats)
Cell detail (one rung×repo, 3 arms)
  ├─ Metric strip + tool/engagement table
  ├─ Judge panel (scores, verdicts, key-revisions)
  └─ → Transcript viewer (per arm)  · → Compare
Compare (arms side by side, locked to a cell or free)
Transcript viewer (readable trail; raw toggle; subagents)
Methodology & provenance (the trust spine)
```

The filter bar (rung, repo, arm-visibility) is **global and URL-encoded** so any
state is a shareable link — essential for "look at *this* cell" in a bug report
or write-up.

---

## 5. Overview / dashboard

The landing page. Three stacked regions, top to bottom: orientation → integrity →
metrics.

### 5.1 Orientation strip

One sentence of what this is, the fixed arm legend (color = identity), and the
live coverage tally read from the feed (e.g. "L2: 30/30 run · 10/10 judged · 0
DNF; L3: 30/30 run · 10/10 judged"). The headline finding appears here as a
**claim with its own caveats inline**, e.g.:

> Across L2–L3, all three arms reached *Full* answer completeness; grounding was a
> near-tie (0.90–1.00). The arms separated on **cost and route**, not
> correctness. *n=1 per cell — read this as a direction, not a measurement.*

### 5.2 Coverage & integrity grid (the trust anchor — render this first)

A dense rung × repo matrix, each cell a 3-segment mark (baseline/grove/lsp)
showing run status: harvested · pending · **DNF/blocked**. This is deliberately
*above* the pretty charts: the first thing a skeptic sees is the honest state of
completeness, including the one cell that needed three attempts.

- Segment encodes status by **shape/fill**, not by good/bad color.
- A DNF segment is visibly marked and tooltips its reason (e.g. "L3-baseline-
  django: degenerate Read-only on attempts 1–2; passed on 3 with 1 shell call").
- A separate toggle overlays **judged?** state.
- Click a cell → Cell detail. Click a row → filter to that repo. Click a column
  header (rung) → filter to that rung.

### 5.3 Metric small-multiples

Five metric families, each a row of small charts (one per rung), arms as the
series within each. **Small-multiples over one busy chart** keeps it legible and
neutral.

| Family | Definition | Provenance |
|---|---|---|
| **Context** | peak context tokens (`context`), plus a per-turn growth sparkline on hover/drill | scalar from ledger; curve from raw `series/<cell>` |
| **Turns** | `num_turns` | ledger / result event |
| **Wall-clock** | `run_wall_s` (= result `duration_ms`) | ledger; note it includes model latency, not pure tool time |
| **Cache tokens** | `cache_read` + `cache_create`, stacked | raw `usage` |
| **Cost** | billed `total_cost_usd`, with input/output/cache breakdown on drill | raw result event |

Rules for honesty (non-negotiable):
- **Axes start at zero**; no truncated baselines. If a range is clipped for
  readability, label it.
- **Direct value labels** beside marks; legends only where unavoidable.
- Aggregations (mean across repos within a rung) always print **n** and show the
  spread (min–max whisker or dots), never a lone mean. With n=10 repos this is
  fine; with the partial rungs it must say so.
- A visible **"show DNFs / incomplete"** toggle; default shows them flagged.

---

## 6. Cell detail (one rung × repo)

The workhorse view: everything known about one task across the three arms.

- **Header:** the rung, repo (+ language, pinned SHA, image tags), and the
  **prompt the arms actually saw** (the bare `prompts/<repo>/<rung>.txt`). A
  clear marker that the reference key was *not* shown to the running arms (genesis
  wall) — the key is available lower down, labeled judge-only.
- **Metric strip:** context / turns / wall / cache / cost for all three arms,
  aligned, with the cheapest-on-each-axis arm noted factually (not crowned).
- **Engagement table:** per arm, the tool counts and the **gate signal** that
  proved it used its capability (`bash_calls>0` / `grove_tools>0` / `lsp_tools>0`)
  with pass/fail. This is the "did they really do it the hard way?" evidence.
- **Judge panel:** per-arm `grounding` + `completeness` (0–1) and the full prose
  verdict; the cell-level synthesis verdict; and any **`key_revisions`** rendered
  prominently as "the reference key was corrected here" with the cite. A short
  note that judging was blind (A/B/C, mapping withheld).
- **Drill links:** "read transcript" per arm → Transcript viewer; "compare" →
  Compare locked to this cell; "raw jsonl" → the file.

---

## 7. Transcript viewer (the reasoning trail)

Renders `readable/<cell>.<arm>.md` as a legible, scannable trail — the thing the
seed brief calls "understand the reasoning trail."

- **Trail layout:** alternating reasoning blocks (`💬`) and tool-call groups
  (`▸ tool(args)`), in order, ending in the `RESULT` block. Tool calls are
  visually distinct from prose; tool name + args are monospace and collapsible.
- **Cite links:** `file:line` references in the answer (e.g. `src/db.c:2935`) are
  detected and linked to the pinned source at that line (GitHub blob URL at the
  cell's SHA, opened in a new tab) so a reader can verify grounding the same way
  the judge did.
- **Raw toggle:** flip from readable to the raw stream-json (pretty-printed,
  virtualized for large files) — full transparency, nothing is a black box.
- **Subagents:** if a run spawned Task subagents, each appears as a nested,
  collapsible sub-trail (from `raw/subagents/...`) — these are the only copy of
  that work and must be reachable.
- **Header context:** model, turn count, wall time, final cost — so the trail is
  framed by what it cost to produce.

Keep it text-forward and fast; no typewriter animation, no chat-bubble skin.

### 7.1 The readable transcript as a standalone artifact (in scope)

The readable `evidence/nav3/<rung>/readable/<cell>.claude.<arm>.md` is not just an
input to the viewer — **it is itself part of the dashboard's artifact trail** and
must read as a complete, self-explaining document on its own (opened raw in a
GitHub blob, in the modal, or printed). The original `extract-transcript.sh`
clamped every text block to 160 chars via an `oneline` helper, so the **prompt was
ellipsised** and the reasoning trail was lossy — not acceptable for an evidence
document. Replaced by `scripts/render-transcript.mjs`, which produces a standalone
document per arm run with:

1. **A metadata header** that frames the run without external lookup: arm (+ its
   capability), repo · rung, pinned SHA, status, the **engagement signal**
   (`bash/grove/lsp = N`, gate pass/fail), turns, wall-clock, peak context, billed
   cost **with the input/output/cache-create/cache-read split**, tool histogram,
   and the evidence path. Every number is recomputed from the run's own
   stream-json, so the document never disagrees with the ledger's gate.
2. **The prompt verbatim** in its own section — full text, never truncated —
   explicitly labeled as the only thing the arm saw (the genesis wall). Sourced
   from `experiment/prompts/<repo>/<rung>.txt` because the stream's first user
   event is a `tool_result`, not the prompt.
3. **The full reasoning trail**: every `💬` reasoning block in full (no clamp),
   each `▸` tool call with a readable argument, in order; Task/Agent subagent steps
   spliced under their spawn (`↳`).
4. **The final answer verbatim**, framed by the result event (subtype, wall,
   turns, `is_error`).

Requirements: deterministic and self-contained (no network; no `state.json`
dependency for the core document); a DNF run renders with its failure stated, not
hidden; rich markdown in the agent's answer (tables, headers, `file:line` cites)
is preserved so it renders correctly. The harvest step in `/runarm` should call
this renderer going forward; existing L2/L3 readables were regenerated with it.

---

## 8. Compare view (arms side by side)

- **Default:** three columns (baseline · grove · lsp) for one locked cell:
  aligned metric strip on top, then the three transcripts scrolling in parallel.
- **Spine coverage strip:** from the reference key's "required spine," a compact
  per-arm checklist of which required elements each answer hit (Full / Partial /
  Miss), so the *quality* comparison is concrete, not just a number. (Derived from
  the judge verdict prose + key; if not machine-extractable, render the judge's
  per-arm verdict side by side instead — never fabricate a checklist.)
- **Free compare (secondary):** pick any two cells (e.g. grove on L2 vs L3 redis)
  to inspect how an arm scales with task complexity.
- Synchronized scroll is optional and off by default (the trails diverge in
  length).

---

## 9. Visual design language

The brief: *simple, neutral, must not look like a default design-system template.*
Concretely:

- **Layout:** a single readable measure (~720–820px content column) with a
  full-width data region for grids/charts. Generous whitespace, hairline rules,
  no boxed "cards" with shadows. Think paper, not dashboard-kit.
- **Type:** one neutral text face (system UI stack, or a single self-hosted
  face such as IBM Plex Sans / Inter) + one monospace (IBM Plex Mono / system
  mono) for code, cites, tool calls, and numbers. Tabular figures for all
  metrics so columns align. That's the entire type system.
- **Color:** near-monochrome canvas (ink on off-white; a dark mode that is truly
  neutral grey, not black). Color appears **only** to encode the three arms, from
  a fixed colorblind-safe, non-traffic-light triad (e.g. Okabe–Ito blue / orange
  / teal — *not* green/red). Status (DNF, pending) uses shape/fill/iconography,
  not hue.
- **Charts:** restrained, axis-honest, directly labeled. Prefer small-multiples,
  dot/strip plots, and sparklines over big animated bars. No chart junk, no 3D,
  no gradients-under-lines.
- **Motion:** functional only (a fade on view change, a chart-draw ≤200ms).
  Nothing decorative; respect `prefers-reduced-motion`.
- **The neutrality test:** if the page were screenshotted into an academic
  appendix, it should look at home there. If it looks like a SaaS landing page,
  it's wrong.

A short, committed `STYLE.md` (tokens: palette, type scale, spacing, chart
defaults) keeps this enforceable and prevents drift back to template defaults.

---

## 10. Trust & transparency features (the validation toolkit)

These are what separate this from a vanity dashboard. They are requirements, not
nice-to-haves.

1. **Provenance footer on every view:** generated-at, git SHA, `statectl` schema
   note, the model (sonnet) and the **pricing table** used for any dollar figure.
   A stale build is self-evident.
2. **Link-to-evidence everywhere:** every metric, score, and verdict carries a
   path to its artifact. A "data sources" panel lists the exact files behind the
   current view.
3. **Engagement gate, visible:** the per-cell proof that each arm used its
   capability (not a degenerate Read-only run). This is *the* fairness claim —
   it must be inspectable, not asserted.
4. **Blind-judging provenance:** a short, honest explanation that answers were
   scrubbed to A/B/C, graded against the reference key with the mapping withheld,
   and only un-blinded to record. Where the packet artifacts exist, link them.
5. **Key-revisions as first-class:** every case where the reference key was wrong
   (rails stale line numbers; typescript `parser.ts:3792` mislabel) is shown as a
   correction with its cite — proof the grader corrected *itself*, not the arms.
6. **n=1, repeated:** single-run variance is stated wherever an aggregate appears.
   No significance language, no error bars implying replication that didn't
   happen.
7. **The genesis wall, explained:** make explicit that running arms saw only the
   bare prompt; reference keys/rationale were judge-only. The dashboard reveals
   keys *post hoc* and labels them as such.
8. **Reproduce-it box:** the exact commands to regenerate the feed from the repo,
   so a reader can rebuild the page from evidence and diff it.

---

## 11. Tech & deployment

- **Hosting:** GitHub Pages project page at `/is-grep-enough/`
  (`entelligentsia.github.io/is-grep-enough/`) — all asset paths must be
  base-path-relative (no leading `/`; the spike already uses `data/…`,
  `style.css`, so it is base-path-agnostic). A committed GitHub Action builds the
  feed and publishes `site/`.
- **Stack (chosen):** vanilla HTML + ES modules, no SPA framework, no bundler —
  `Observable Plot` and `marked` are loaded directly from `esm.sh` at runtime.
  Plot was chosen over hand-rolled SVG/uPlot because interactivity and
  small-multiple ergonomics matter more here than shaving bundle bytes; it stays
  neutral if its defaults are overridden (no chart-junk, axis-honest). Heavy chart
  suites are still avoided — they pull the look toward "dashboard kit."
- **No runtime data fetching beyond static JSON.** Everything in `site/data/` is
  pre-built and cache-friendly.
- **Performance budget:** first view interactive < 1.5s on a cold load; transcript
  raw-json view virtualized so a 2 MB jsonl doesn't jank.
- **Accessibility:** keyboard-navigable, colorblind-safe by construction (color
  never sole encoder), honors reduced-motion, semantic HTML so the no-JS fallback
  still shows the tables.
- **Build hygiene:** feed generation is deterministic and committed; `site/data/`
  may be generated in CI (preferred) or committed (simpler to diff) — see
  decisions.

---

## 12. Phasing

1. **P0 — Evidence browser (highest trust-per-effort):** build step + Coverage
   grid + Cell detail + Transcript viewer. Static tables, minimal charts. This
   alone delivers full drill-to-transcript transparency.
2. **P1 — Dashboard:** metric small-multiples, global filter bar, the five metric
   families with honest aggregation and DNF toggles.
3. **P2 — Compare:** side-by-side arms, spine-coverage strip, free cell-vs-cell.
4. **P3 — Polish:** dark mode, cite-link verification, methodology page, reproduce
   box, perf passes.

Ship P0 first: a reader who can reach every transcript and see the coverage truth
already trusts the project more than one shown only a winner's bar chart.

---

## 13. Decisions resolved

1. **Scope of data shown — ALL harvested cells, partial rungs flagged.** Hiding
   partial work contradicts the transparency goal; the coverage grid and a
   per-cell `flags[]` carry the incompleteness. *(Accepted.)*
2. **Cost source — billed `total_cost_usd` per run, as-is.** No recomputed
   list-price estimate; the dollar figure is what the run actually cost on the
   `sonnet` model. Always shown alongside the input/output/cache token split.
3. **Feed — generated, not committed.** `site/build.mjs` synthesizes
   `site/data/*.json` from current evidence **at any point** (partial OK); the
   Pages Action regenerates it on deploy; `site/data/` is gitignored. The full
   data set will take many core-days to assimilate, after which the feed is a
   fully-static snapshot — but the generator must always be able to re-synthesize
   from whatever evidence exists (e.g. lsp cells outside L2/L3 will need
   re-running before their data is trustworthy; until then they render flagged).
4. **Chart dependency — Observable Plot** (via `esm.sh`, no bundler). Look,
   feel, and interactivity were judged to matter more than minimal bundle size;
   Plot gives faceted small-multiples and tooltips cheaply while staying neutral.
5. **Judge transparency is first-class.** Render the per-arm prose verdicts,
   scores, the cell-level synthesis, and **key revisions** in the cell detail.
   A machine-parsed per-element spine checklist is a later enhancement *only if*
   the key parses reliably — never fabricated.

### Still open / iterative

- **GitHub remote + Pages activation.** This repo currently has **no git
  remote**, so Pages cannot deploy yet. Target remote: `Entelligentsia/is-grep-enough`.
  To activate: create the repo, `git remote add origin
  git@github.com:Entelligentsia/is-grep-enough.git`, push, then Settings → Pages →
  Source → "GitHub Actions". The site and `pages.yml` are committed ready; until
  then the site runs locally (`node site/build.mjs` then
  serve `site/`).
- Spine-coverage checklist parseability (per #5).
- Per-turn cost series (only total cost is recorded per run; per-turn is
  token-derived, not billed).

---

## 14. What exists now (the spike)

A thin, runnable vertical slice proving the three pillars the channel decision
hinged on — **static Pages hosting**, a **dynamically generated feed**, and the
**chosen interactive graphics**:

| Path | Role |
|---|---|
| `scripts/render-transcript.mjs` | the standalone readable-transcript renderer (§7.1); regenerated all L2/L3 readables |
| `site/build.mjs` | feed synthesizer — reads `state.json` + `spine.json` + `evidence/` → `site/data/{meta,experiment,cells,judge}.json` + copied transcripts; partial-safe, deterministic |
| `site/index.html`, `style.css`, `app.mjs` | the page: provenance header, filter bar, coverage grid, an Observable Plot metric chart (context/turns/wall/cache/cost), cell detail with judge verdicts + key-revisions, and a transcript modal |
| `.github/workflows/pages.yml` | builds the feed and deploys `site/` to Pages (dormant until a remote exists) |

Run locally:

```
node site/build.mjs --sha "$(git rev-parse --short HEAD)" --at "<iso-timestamp>"
python3 -m http.server -d site 8099   # then open http://localhost:8099
```

This is intentionally minimal — it validates that the pipeline and graphics work
the way we want before the full data set (many core-days of runs) is assimilated.
Subsequent iterations layer on the metric small-multiples, the compare view, the
methodology page, and the trust-toolkit polish from §§5–10.

---

## Appendix A — metric definitions (precise)

| Metric | Field / derivation | Caveat to surface |
|---|---|---|
| Context (peak) | `sides[cell].context` (= `context_tokens` from `side-metrics.sh`) | a scalar, not the growth curve |
| Context growth | per-message `usage` from raw jsonl, cumulative | build-derived; provenance = raw file |
| Turns | result `num_turns` | a turn ≠ a tool call |
| Wall-clock | `run_wall_s` (= result `duration_ms`) | includes model latency, not pure tool time; single run |
| Tool counts | `side-metrics.sh`: `bash_calls`, `grove_tools`, `lsp_tools`, `mcp_nongrove_tools`, `reads`, `tool_calls` | same source as the engagement gate |
| Cache tokens | raw `usage.cache_read_input_tokens` + `cache_creation_input_tokens` | cache-read ≈ 10× cheaper than fresh input |
| Cost | result `total_cost_usd` (+ input/output/cache split) | billed figure for the `sonnet` model; n=1 |
| Grounding | `judge[cell].scores[arm].grounding` (0–1) | blind-judged, cites verified line-exact vs pinned SHA |
| Completeness | `judge[cell].scores[arm].completeness` (0–1) | graded against required spine; Full/Partial/Miss |
| Engagement | gate signal per arm (`>0`) | the fairness guarantee; DNF if it failed |

## Appendix B — the three arms (fixed identity)

| Arm | Capability | Image | Engagement signal |
|---|---|---|---|
| `baseline` | bash + coreutils (text search) | `grove-testbench/base:latest` | `bash_calls > 0` |
| `grove` | bash + grove MCP/CLI (structural) | `grove-testbench/grove:v0.1.11` | `grove_tools > 0` |
| `lsp` | bash + native Claude Code LSP tool (semantic) | `grove-testbench/lsp:latest` | `lsp_tools > 0` |

Color triad encodes these three identities only; it never encodes quality or
ranking.
