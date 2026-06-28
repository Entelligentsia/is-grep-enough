# L5 report — "walk the whole cross-cutting architecture" across 10 repos

**Rung:** L5 (cross-cutting architecture — trace one concern that spans *multiple*
subsystems end-to-end, every function/type in order, with file:line, plus one
unified architecture diagram) · **Date:** 2026-06-27 ·
**Agent:** Claude, `--model sonnet` · **grove:** `v0.1.8` ·
**Sides:** `baseline` = grove OFF, `grove` = grove ON (grove the only variable).

Evidence: [`evidence/L5.eval.json`](../evidence/L5.eval.json) (aggregate metrics),
[`evidence/L5/`](../evidence/L5) (20 raw stream-json transcripts + 20 rendered
`.md` + 10 per-repo `*.metrics.json`).
Raw transcripts: `out/l5/opt-<repo>-L5_arch.claude.{baseline,grove}.jsonl`.

---

## Headline

On "give a complete architectural walkthrough of `<cross-cutting concern>`: every
subsystem it touches, every function/type in order with file:line, and one
unified architecture diagram":

| axis (lower / better) | winner | tally |
|---|---|---|
| **context tokens** | **grove** | **grove 6/6 completed** — baseline wins **0** |
| **runaway containment** | **grove** | **4/10 baselines self-destructed** past the 1.5 MB cutoff; **0 grove** |
| **reads** | **grove** | grove 0 reads on 9/10 (typescript 53); baseline 24–310 |
| **answer grounding** (sampled, verified vs source) | **grove** | **13/13 entry-point cites line-exact** across all 10 repos, no fabrication |

L5 is the cleanest result of the whole ladder: **the baseline never wins.** On a
concern that spans the entire architecture it either loses on context by **33–93%**
(6 completed races) or **fails to converge at all** (4 DNFs). This is the first
rung with **zero** baseline wins — and it *reverses* L4: the three subsystems
baseline won at L4 on compactness (tokio +88%, bitcoin +45%, typescript +40%) all
flip — tokio to a −75% grove win, bitcoin and typescript to baseline **DNFs**.
Once the question is architectural, the read-whole-files strategy detonates.

---

## Method

- **Prompt** (identical both sides, one per repo): *"Give a complete architectural
  walkthrough of `<concern>` — every subsystem it touches, every function/type in
  order with file:line, and one unified architecture diagram."* Each concern is
  deliberately **cross-cutting** (spans multiple subsystems), mirroring redis's
  original L5 (master→replica replication):
  - **redis** replication pipeline · **tokio** task scheduling architecture ·
    **django** HTTP request/response lifecycle · **webpack** compile→emit ·
    **typescript** compiler pipeline (scanner→emit) · **bitcoin** block validation
    & connection · **spring-boot** startup lifecycle · **rails** request lifecycle ·
    **laravel** HTTP request lifecycle · **hugo** full site build.
  - Prompts: [`scenes/opt-<repo>-L5_arch.prompt.txt`](../scenes). Each names a few
    cross-cutting anchor symbols (verified present in the pinned source pre-run).
- **Fair baseline:** both sides get the same realistic `claude-md/<repo>.base.md`;
  `grove` additionally carries its `grove init` block. Grove is the only variable.
- **Context** = `input + cache_read + cache_creation` summed across **all models**
  (orchestrator + subagents). **Every baseline this rung ran `delegated:true`**;
  **no grove side delegated**.
- **Careful serial protocol:** **one side at a time to completion** (baseline,
  then grove, then the next repo), in a fixed lean→heavy order, so a runaway could
  never starve a sibling and the 16 GB box never OOM'd.
- **Runaway guard:** [`scripts/l5-watchdog.sh`](../scripts/l5-watchdog.sh) polls
  every running side's transcript at 60 s and `docker kill`s any that crosses
  **1,500,000 bytes**. A killed side has no `result` event — reported as a **DNF
  (runaway)**, not a loss *or* a win.

---

## Metrics (per repo)

`ctx` = context (all models). `reads` = `Read` tool calls. `gtools` = grove
structural calls. All baselines delegated; no grove side did. **Bold** = winner.

| Repo | cross-cutting concern | baseline ctx | grove ctx | ctx Δ | base reads | grove reads / gtools | ctx win |
|---|---|---|---|---|---|---|---|
| laravel | HTTP request lifecycle | 708,128 | **470,973** | **−33%** | 24 | **0** / 42 | **grove** |
| redis | replication pipeline | 3,765,186 | **516,053** | **−86%** | 80 | **0** / 40 | **grove** |
| django | request/response lifecycle | 4,601,484 | **322,554** | **−93%** | 130 | **0** / 38 | **grove** |
| rails | request lifecycle | 4,373,282 | **720,272** | **−84%** | 141 | **0** / 67 | **grove** |
| webpack | compile→emit lifecycle | 2,246,909 | **457,680** | **−80%** | 60 | **0** / 27 | **grove** |
| tokio | scheduling architecture | 2,859,933 | **724,363** | **−75%** | 73 | **0** / 29 | **grove** |
| spring-boot † | startup lifecycle | *killed* | 642,976 | — | 310→kill | **0** / 61 | grove-only |
| bitcoin † | block validation & connection | *killed* | 276,997 | — | 91→kill | **0** / 26 | grove-only |
| typescript † | compiler pipeline | *killed* | 4,344,775 | — | 176→kill | 53 / 47 | grove-only |
| hugo † | full site build | *killed* | 1,417,364 | — | 252→kill | **0** / 64 | grove-only |

† **Baseline self-destructed** at the 1.5 MB transcript cutoff (spring-boot 310
reads, bitcoin 91, typescript 176, hugo 252 before kill) — a runaway, not a win.

**Context:** grove wins all 6 completed races by 33–93%. The win scales with how
much architecture the concern spans: django (−93%), redis (−86%), rails (−84%) are
whole-request / whole-pipeline traces the baseline can only follow by reading
80–141 whole files (context 3.8–4.6 M), while grove's structural calls keep it at
0.32–0.72 M with **zero** reads. Even tokio — a baseline win at L4 — inverts to
−75% once the question is the whole scheduling architecture rather than the
compact reactor.

**Runaway containment is the headline.** 4/10 baselines failed to converge (the
most of any rung: L3 had 3, L4 had 1); **0 grove** sides did. On the broadest
concerns (the full compiler, full site build, full startup, full block
connection) the baseline doesn't just cost more — it never finishes. grove
answered all four in 0 reads (typescript 53).

---

## Quality (sampled, verified vs pinned source)

Four baselines produced no answer (killed), so this is **not** a blind A/B.
Instead each grove answer was read for grounding and a **sample of 13
entry-point/waypoint cites across all 10 repos** was verified line-exact against
the pinned source inside `grove-testbench/base`:

| check | result |
|---|---|
| cites sampled (≥1 per repo, all 10) | **13** |
| line-exact against pinned source | **13 / 13** |
| fabricated functions / files observed | **0** |

Verified line-exact (selection): laravel `Kernel::handle` `Kernel.php:137`; redis
`_writeToClientSlave` `networking.c:2734`; django `BaseHandler.get_response`
`base.py:138`; rails `AbstractController::Base#process` `base.rb:146`; spring-boot
`getAutoConfigurationEntry` `AutoConfigurationImportSelector.java:142`; webpack
`addModule` `Compilation.js:1585` and `class ChunkGraph` `ChunkGraph.js:281`;
tokio `Handle::schedule` `handle.rs:110`; bitcoin `AddCoins` `coins.cpp:121`;
typescript `bindSourceFile` `binder.ts:502`; hugo `processFiles`
`hugo_sites_build.go:1346` and `processFull` `:1274`, `fromLoadConfigResult`
`config/allconfig/allconfig.go:1065`.

**One cosmetic note, not a defect:** in hugo's compact ASCII diagram grove
abbreviated `hugo_sites_build.go` → `build.go` for one node (`processFiles`) — the
**line number (1346) is exact** and the prose uses the full filename 7×. A
shorthand in the diagram, not a fabrication.

**Caveat — sampled, not exhaustive.** 13 cites verified, not every line; and the
*completeness* of each architecture walkthrough (did grove name every subsystem,
or skip some?) was not exhaustively diffed against ground truth. The verified
claim is **grounding**, not **total recall**.

---

## Grove issues surfaced (→ [GROVE-ISSUES.md](../GROVE-ISSUES.md))

- **typescript grove read-heavy again (53 reads, 47 gtools, 4.34 M ctx):** the
  recurring large-single-file fallback (L3 `parser.ts`, L4 `binder.ts`, here the
  full scanner→checker→emitter span). It was grove's heaviest cell of the entire
  ladder. Worth checking whether coarser `map`/`outline` over the compiler dir
  would cut the read fallback.
- **No new fabrication / off-by-one defects:** all 13 sampled L5 cites were
  line-exact; the hugo `build.go` shorthand is cosmetic (exact line).
- **L4's GI-3 over-read regime did not recur:** at L5 the concerns are broad
  enough that grove's structural approach wins everywhere it completed — the
  small-subsystem over-fetch that cost tokio/bitcoin at L4 is gone.

---

## Net verdict

For "walk the whole cross-cutting architecture," grove (as of `v0.1.8`):

- **uses less context on every completed race** (6/6, 33–93%) — baseline wins
  nothing at this rung;
- **finishes where the baseline can't** — 4/10 baselines ran away past 1.5 MB
  (spring-boot, bitcoin, typescript, hugo) and were killed; 0 grove sides did.
  This containment is the headline L5 finding;
- **reverses L4's compact-subsystem losses** — tokio/bitcoin/typescript, all
  baseline wins at L4, become a grove win + two baseline DNFs once the question is
  architectural;
- **stays read-lean** — 0 reads on 9/10 (typescript 53) vs baseline's 24–310;
- **is line-accurate** — 13/13 sampled cites verified across all 10 repos.

Across the full L1→L5 ladder the pattern is monotone in breadth: grove's edge
grows from "marginal / sometimes-worse on thin prompts" (L1–L2) to "cheaper and
converges where baseline can't" (L3–L4) to "baseline never wins" (L5). The single
open grove issue is the typescript large-single-file read fallback.

---

## Caveats

- **n=1 per cell.** Single runs; variance is large (see the baseline runaways).
  Reproduce before citing.
- **4 baselines have no answer.** spring-boot/bitcoin/typescript/hugo baseline
  context is unmeasurable (killed mid-run); those rows are grove-only and excluded
  from the 6/6 context tally.
- **Quality is sampled, single-reviewer, source-verified — not blind A/B.**
- **grove is not free here.** typescript grove (4.34 M) and hugo grove (1.42 M)
  are large in absolute terms — grove converges on the broadest concerns, but the
  answers themselves are big.

## Reproduce

```bash
# grove v0.1.8 into the grove image, then race + measure all 10, one pair at a time
GROVE_BIN=../grove/target/release/grove \
  scripts/build-grove.sh grove-testbench/base:latest grove-testbench/grove:v0.1.8
# runaway guard alongside (1.5 MB transcript cutoff, 60 s poll):
POLL=60 MAXBYTES=1500000 scripts/l5-watchdog.sh out/l5 &
# serial, lean -> runaway order:
scripts/run-side.sh opt-<repo>-L5_arch <repo> baseline --model sonnet --out out/l5
scripts/run-side.sh opt-<repo>-L5_arch <repo> grove    --model sonnet --out out/l5
scripts/extract-metrics.sh opt-<repo>-L5_arch --out out/l5
# aggregate + transcripts already under evidence/L5/ and evidence/L5.eval.json
```
