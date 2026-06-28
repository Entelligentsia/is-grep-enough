# L4 report — "map the whole subsystem, end-to-end" across 10 repos

**Rung:** L4 (subsystem end-to-end — map an entire subsystem: every entry point,
the functions/types it flows through, the key data structures, and how the parts
fit into one unified call graph) · **Date:** 2026-06-27 ·
**Agent:** Claude, `--model sonnet` · **grove:** `v0.1.8` ·
**Sides:** `baseline` = grove OFF, `grove` = grove ON (grove the only variable).

Evidence: [`evidence/L4.eval.json`](../evidence/L4.eval.json) (aggregate metrics),
[`evidence/L4/`](../evidence/L4) (20 raw stream-json transcripts + 20 rendered
`.md` + 10 per-repo `*.metrics.json`).
Raw transcripts: `out/l4/opt-<repo>-L4_subsystem.claude.{baseline,grove}.jsonl`.

---

## Headline

On "give the complete end-to-end picture of `<subsystem>`: every entry point, the
functions and types it flows through, the key data structures, and one unified
call graph":

| axis (lower / better) | winner | tally |
|---|---|---|
| **context tokens** | **grove** | **grove 6/9 completed** (baseline: tokio, bitcoin, typescript) |
| **runaway containment** | **grove** | **1/10 baselines self-destructed** (hugo) past the 1.5 MB cutoff; **0 grove** |
| **answer grounding** (sampled, verified vs source) | **grove** | **15/15 entry-point cites line-exact** across all 10 repos, no fabrication observed |

L4 is the first rung that produces a **genuine split**, and the split is
informative. grove wins big — 36–86% less context — on **sprawling** subsystems
whose answer touches many files (django ORM, redis expiration, rails routing,
webpack build, spring-boot auto-config, laravel container). The baseline wins on
**compact, well-named** subsystems it can map in a single focused subagent pass
(tokio I/O driver, bitcoin mempool, typescript binder), where grove's many
granular structural fetches cost more than a few whole-file reads. This is a
*different* baseline-win mechanism than L3's thin-prompt losses — and notably,
the two repos grove **lost** at L3 (django, laravel) both **flipped to grove
wins** at L4 once the task got broad.

---

## Method

- **Prompt** (identical both sides, one per repo): *"Give the complete end-to-end
  picture of `<subsystem>` as a subsystem: every entry point, the functions/types
  it flows through, the key data structures, and a single unified call graph."*
  The 10 subsystems mirror redis's original L4 (the full key-expiration system —
  set-TTL + lazy + active cron):
  - **redis** key expiration · **tokio** I/O driver (reactor) · **django** ORM
    query execution · **webpack** module build · **typescript** binder ·
    **bitcoin** mempool acceptance · **spring-boot** auto-configuration ·
    **rails** Action Dispatch routing · **laravel** service container ·
    **hugo** content render pipeline.
  - Prompts: [`scenes/opt-<repo>-L4_subsystem.prompt.txt`](../scenes). Each names
    the subsystem's anchor symbols (verified present in the pinned source before
    the run) so both sides target the same bounded subsystem rather than "explain
    the whole repo."
- **Fair baseline:** both sides get the same realistic `claude-md/<repo>.base.md`;
  `grove` additionally carries its `grove init` block. Grove is the only variable.
- **Context** = `input + cache_read + cache_creation` summed across **all models**
  the agent system uses (orchestrator + any `Task`/`Explore` subagent). **Every
  baseline this rung ran `delegated:true`** (it fanned the subsystem map out to
  subagents); **no grove side delegated**.
- **Careful serial protocol:** unlike L3's throttled parallelism, L4 ran **one
  side at a time to completion** (baseline, then grove, then the next repo), in a
  fixed lean→heavy order, so a runaway could never starve a sibling and the box
  never OOM'd.
- **Runaway guard:** [`scripts/l4-watchdog.sh`](../scripts/l4-watchdog.sh) polls
  every running side's transcript at 60 s and `docker kill`s any that crosses
  **1,500,000 bytes**. A killed side has no `result` event, so its context is
  unmeasurable — reported as a **DNF (runaway)**, not a loss *or* a win.

---

## Metrics (per repo)

`ctx` = context (all models). `reads` = `Read` tool calls. `gtools` = grove
structural calls. All baselines delegated; no grove side did. **Bold** = winner.

| Repo | subsystem | baseline ctx | grove ctx | ctx Δ | base reads | grove reads / gtools | base→grove time | ctx win |
|---|---|---|---|---|---|---|---|---|
| laravel | service container | 396,552 | **252,399** | **−36%** | 16 | **0** / 22 | 274→242s | **grove** |
| django | ORM query exec | 2,839,421 | **391,322** | **−86%** | 68 | **0** / 41 | 326→212s | **grove** |
| spring-boot | auto-configuration | 1,868,359 | **716,252** | **−62%** | 53 | **0** / 52 | 445→274s | **grove** |
| redis | key expiration | 1,973,702 | **365,475** | **−81%** | 41 | **0** / 38 | 356→191s | **grove** |
| rails | Action Dispatch routing | 2,290,324 | **450,865** | **−80%** | 52 | **0** / 37 | 357→251s | **grove** |
| webpack | module build | 2,549,777 | **612,882** | **−76%** | 61 | 2 / 29 | 377→214s | **grove** |
| tokio | I/O driver (reactor) | **423,449** | 797,313 | +88% | 18 | 4 / 44 | 227→234s | baseline |
| bitcoin | mempool acceptance | **462,927** | 669,338 | +45% | 11 | 2 / 55 | 266→584s | baseline |
| typescript | binder | **1,482,241** | 2,070,466 | +40% | 34 | 22 / 17 | 249→341s | baseline |
| hugo † | content render pipeline | *killed* | 2,584,054 | — | 293→kill | 0 / 96 | —→404s | grove-only |

† **Baseline self-destructed** at the 1.5 MB transcript cutoff (293 `Read` calls
before kill) — a runaway, not a baseline win.

**Context:** grove wins 6/9 completed races, by 36–86%. The win scales with how
much source the subsystem map forces open: django (−86%), redis (−81%), rails
(−80%), webpack (−76%) are subsystems whose answer is spread across many files,
so the baseline's delegated subagents read 40–68 files and context balloons to
1.9–2.8 M, while grove's `outline`/`symbols`/`source`/`callers` calls keep it at
0.37–0.61 M with **zero** `Read`s. The three baseline wins (tokio +88%, bitcoin
+45%, typescript +40%) are compact subsystems a single subagent maps in 11–34
reads; there grove's 17–55 granular structural fetches — each a round-trip that
re-pays steering and tool-schema tax — cost *more* than a few whole-file reads.

**Runaway containment.** Only hugo's content-render pipeline (the broadest
subsystem) blew the baseline past 1.5 MB; the anchored L4 prompts otherwise kept
the baseline converging on 9/10 (vs only 7/10 at L3's open-ended flow traces).
0 grove sides ran away.

---

## Quality (sampled, verified vs pinned source)

This rung is **not** a blind A/B (hugo's baseline produced no answer), so each
grove answer was read for grounding and a **sample of 15 entry-point cites across
all 10 repos** was verified line-exact against the pinned source inside
`grove-testbench/base`:

| check | result |
|---|---|
| entry-point cites sampled (≥1 per repo, all 10) | **15** |
| line-exact against pinned source | **15 / 15** |
| fabricated functions / files observed | **0** |

Verified line-exact (selection): redis `expireGenericCommand` `expire.c:726` and
`setExpire` `db.c:2706`; django `SQLCompiler.compile` `compiler.py:574`; rails
`Dispatcher` `route_set.rb:39`; tokio `Registration` `registration.rs:46`,
`Driver::park` `driver.rs:159`, `ScheduledIo::token` `scheduled_io.rs:187`;
webpack `addEntry` `Compilation.js:2645` and `_addEntryItem` `Compilation.js:2682`;
bitcoin `AcceptToMemoryPool` `validation.cpp:1781` and `class MemPoolAccept`
`validation.cpp:443`; typescript `bindSourceFile` `binder.ts:502`; spring-boot
`filter` `AutoConfigurationImportSelector.java:399`; laravel `addContextualBinding`
`Container.php:474`; hugo `assemblePagesStep1` `content_map_page_assembler.go:1348`.

The grove answers are well-shaped for this rung: per-entry-point call chains,
explicit data-structure notes (redis `db->expires` side-dict, tokio `ScheduledIo`
slab), and a single unified call graph per subsystem. The −1 off-by-one drift
flagged in the original redis L4 (FINDINGS) did **not** reappear on any sampled
cite.

**Caveat — sampled, not exhaustive.** 15 cites were verified, not every line of
every map; and *completeness* of each subsystem map (did grove name every
component, or skip some?) was not exhaustively diffed against ground truth. The
verified claim is **grounding** (cites are real and line-accurate), not **total
recall**.

---

## Grove issues surfaced (→ [GROVE-ISSUES.md](../GROVE-ISSUES.md))

- **GI-3 (over-read) is the L4 loss mechanism:** on compact subsystems (tokio,
  bitcoin) grove issues 44–55 granular structural calls where a single baseline
  subagent reads 11–18 whole files for less total context. Grove's per-call
  steering + tool-schema overhead isn't amortised when the subsystem is small.
  Worth probing whether `map`/`outline` at a coarser grain would let grove answer
  these in far fewer round-trips.
- **typescript binder — read-heavy again (22 reads, only 17 gtools):** the same
  large-single-file fallback seen at L3 on `parser.ts`. grove leaned on `Read`
  spans of `binder.ts` rather than structural tools, and it was grove's worst
  cell (2.07 M, +40%). Recurring signal that grove under-serves very large single
  files.
- **No new fabrication / off-by-one defects:** none of the 15 sampled L4 cites
  showed the fabrication or −1 drift seen in earlier single-repo runs.

---

## Net verdict

For "map the whole subsystem end-to-end," grove (as of `v0.1.8`):

- **uses less context on 6/9 completed races** (36–86%), and the win grows with
  the breadth of the subsystem;
- **loses on 3 compact, well-named subsystems** (tokio, bitcoin, typescript)
  where a single delegated baseline subagent reads a tight file set and grove
  over-fetches — a real GI-3 regime, distinct from L3's thin-prompt losses;
- **finishes where the baseline can't** — hugo's baseline ran away past 1.5 MB
  (293 reads) and was killed; grove answered it in 0 reads / 96 structural calls;
- **stays read-lean** — 0 reads on 7/10 repos vs baseline's 11–293;
- **is line-accurate at the entry points** — 15/15 sampled cites verified across
  all 10 repos, no fabrication.

The L4 story is **breadth-dependent**: grove's structural advantage compounds as
a subsystem sprawls across files, but inverts on subsystems compact enough for a
single subagent to read whole. The open follow-ups are grove's over-read on small
subsystems and its large-single-file (`binder.ts`) read fallback.

---

## Caveats

- **n=1 per cell.** Single runs; the 3 baseline wins all hinge on baseline's
  subagent delegation landing efficiently — high variance. Reproduce before citing.
- **1 baseline has no answer.** hugo baseline context is unmeasurable (killed
  mid-run), so that row is grove-only and excluded from the 6/9 context tally.
- **Quality is sampled, single-reviewer, source-verified — not blind A/B.** See
  the quality caveat above.

## Reproduce

```bash
# grove v0.1.8 into the grove image, then race + measure all 10, one pair at a time
GROVE_BIN=../grove/target/release/grove \
  scripts/build-grove.sh grove-testbench/base:latest grove-testbench/grove:v0.1.8
# runaway guard alongside (1.5 MB transcript cutoff, 60 s poll):
POLL=60 MAXBYTES=1500000 scripts/l4-watchdog.sh out/l4 &
# serial, lean -> runaway order:
scripts/run-side.sh opt-<repo>-L4_subsystem <repo> baseline --model sonnet
scripts/run-side.sh opt-<repo>-L4_subsystem <repo> grove    --model sonnet
scripts/extract-metrics.sh opt-<repo>-L4_subsystem --out out/l4
# aggregate + transcripts already under evidence/L4/ and evidence/L4.eval.json
```
