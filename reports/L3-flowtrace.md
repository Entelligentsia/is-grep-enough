# L3 report — "trace the flow, dispatch → terminal effect" across 10 repos

**Rung:** L3 (flow trace — follow one request/command from entry point to its
terminal effect, every function in order, with file:line) · **Date:** 2026-06-26 ·
**Agent:** Claude, `--model sonnet` · **grove:** `v0.1.8` ·
**Sides:** `baseline` = grove OFF, `grove` = grove ON (grove the only variable).

Evidence: [`evidence/L3.eval.json`](../evidence/L3.eval.json) (aggregate metrics),
[`evidence/L3/`](../evidence/L3) (20 raw stream-json transcripts + 20 rendered
`.md` + 10 per-repo `*.metrics.json`).
Raw transcripts: `out/l3/opt-<repo>-L3_flow.claude.{baseline,grove}.jsonl`.

---

## Headline

On "trace how `<X>` flows from `<entry point>` to `<terminal effect>`, every
function in order":

| axis (lower / better) | winner | tally |
|---|---|---|
| **context tokens** | **grove** | **grove 5/7 completed** (baseline: django, laravel) |
| **runaway containment** | **grove** | **3/10 baselines self-destructed** past the 1.5 MB transcript cutoff; **0 grove** |
| **reads** | **grove** | grove 0–6 reads on 9/10; baseline 6–222 |
| **answer grounding** (sampled, verified vs source) | **grove** | **16/16 entry-point cites line-accurate**, no fabrication observed |

L3 is the rung where the **read-the-whole-file** strategy breaks down. Three
baselines (bitcoin, hugo, typescript) never converged — they chased the call
chain by opening file after file until the transcript crossed **1.5 MB** and the
watchdog killed them (133 / 256 / 189 tool calls at kill). Grove answered the
same prompts in **0–29 reads** and never delegated. Where the baseline *did*
finish, grove won context on 5 of 7; its two losses are the known thin-prompt
regime (short, well-signposted chains the baseline greps in <10 reads, where
grove's ~30k steering + tool-schema tax dominates).

---

## Method

- **Prompt** (identical both sides, one per repo): *"Trace how `<X>` is handled,
  from `<entry point>` to `<terminal effect>`. List every function in the call
  chain, in order, with file and line."* The 10 prompts mirror redis's original
  L3 ("trace a SET from dispatch to keyspace write"):
  - **redis** SET: socket read → keyspace write · **tokio** `spawn` → first
    `Future::poll` · **webpack** `handleModuleCreation` → deps populated ·
    **django** `WSGIHandler.__call__` → view call · **typescript** source text →
    `SourceFile` AST · **bitcoin** wire TX → mempool · **spring-boot**
    `SpringApplication.run` → `refresh()` · **rails** Rack `call` → controller
    action · **laravel** `Kernel::handle` → controller method · **hugo** `.md`
    file → rendered HTML.
  - Prompts: [`scenes/opt-<repo>-L3_flow.prompt.txt`](../scenes).
- **Fair baseline:** both sides get the same realistic `claude-md/<repo>.base.md`;
  `grove` additionally carries its `grove init` block. Grove is the only variable.
- **Context** = `input + cache_read + cache_creation` summed across **all models**
  the agent system uses (orchestrator + any `Task`/`Explore` subagent). Every
  baseline this rung ran `delegated:true`; no grove side delegated.
- **Runaway guard:** [`scripts/l3-watchdog.sh`](../scripts/l3-watchdog.sh) polls
  each side's transcript every 8 s and `docker kill`s any still-running side once
  its `.jsonl` crosses **1,500,000 bytes**. A killed side has no `result` event,
  so its context is unmeasurable — it is reported as a **runaway**, not a loss
  *or* a win for either side.
- **Run:** `MAXP=4 scripts/run-l3.sh --all --model sonnet` (throttled — 20
  concurrent containers OOM a 16 GB box), watchdog alongside.

---

## Metrics (per repo)

`ctx` = context (all models). `reads` = `Read` tool calls. `del` = baseline
delegated to a subagent. **Bold** = winner on that axis.

| Repo | baseline ctx | grove ctx | ctx Δ | baseline reads | grove reads | baseline→grove time | baseline→grove turns | ctx win |
|---|---|---|---|---|---|---|---|---|
| redis | 1,163,369 | **490,514** | **−58%** | 20 | **0** | 154→141s | 12→25 | **grove** |
| webpack | 1,544,746 | **237,942** | **−85%** | 43 | **0** | 242→138s | 13→14 | **grove** |
| rails | 993,542 | **347,090** | **−65%** | 34 | **0** | 179→131s | 14→24 | **grove** |
| spring-boot | 331,164 | **195,951** | **−41%** | 15 | **0** | 146→87s | 9→15 | **grove** |
| tokio | 2,153,015 | **1,887,238** | **−12%** | 47 | **6** | 259→273s | 16→63 | **grove** |
| django | **327,990** | 437,898 | +34% | 9 | 0 | 99→78s | 12→17 | baseline |
| laravel | **222,906** | 269,637 | +21% | 6 | 0 | 107→86s | 6→20 | baseline |
| bitcoin † | *killed* | 537,851 | — | 106→kill | 1 | —→380s | —→29 | grove-only |
| hugo † | *killed* | 1,874,769 | — | 222→kill | 0 | —→275s | —→77 | grove-only |
| typescript † | *killed* | 2,152,368 | — | 149→kill | 29 | —→564s | —→51 | grove-only |

† **Baseline self-destructed** at the 1.5 MB transcript cutoff (bitcoin 133 tool
calls, hugo 256, typescript 189 at kill) — a runaway, not a baseline win.

**Context:** grove wins 5/7 completed races, by 12–85%. The win scales with how
much source the trace forces open: webpack (−85%), rails (−65%), redis (−58%) are
deep dispatch chains the baseline can only follow by reading whole files; tokio's
huge async call graph is grove's hardest case yet still −12%. The two baseline
wins (django +34%, laravel +21%) are short, well-signposted chains the baseline
greps in 6–9 reads — grove's fixed steering overhead isn't amortised there. This
is exactly the threshold the README's honesty note predicts.

**Runaway containment is the real L3 result.** 3/10 baselines failed to
converge; 0 grove sides did. On the hardest flow traces the baseline doesn't just
cost more — it doesn't finish. Grove's structural `map`/`callers`/`definition`
calls replace the open-file-and-scan loop, so it stayed at 0–6 reads on 9/10
repos (typescript's 29 is its one read-heavy outlier, still well under the kill
line).

---

## Quality (sampled, verified vs pinned source)

Unlike L1/L2 this rung is **not** a blind A/B — three baselines produced no
answer (killed), so there is no symmetric pair to judge. Instead each grove
answer was read for grounding, and a **sample of 16 entry-point cites across all
10 repos** was verified line-exact against the pinned source inside
`grove-testbench/base`:

| check | result |
|---|---|
| entry-point cites sampled (≥1 per repo) | **16** |
| line-exact against pinned source | **16 / 16** |
| fabricated functions / files observed | **0** |
| answers terminating at the correct terminal effect | **10 / 10** |

Examples verified line-exact: redis `readQueryFromClient` `src/networking.c:3830`,
`processCommand` `src/server.c:4412`, `call` `src/server.c:3949`; tokio `spawn`
`tokio/src/task/spawn.rs:174`; webpack `handleModuleCreation`
`lib/Compilation.js:2298`; django `WSGIHandler.__call__`
`django/core/handlers/wsgi.py:120`; bitcoin `ProcessMessage`
`src/net_processing.cpp:3603` and `ProcessTransaction` `src/validation.cpp:4455`;
spring-boot instance `run` `SpringApplication.java:304`; rails `RouteSet#call`
`route_set.rb:903`; laravel `Kernel::handle` `Kernel.php:137`; typescript
`createSourceFile` `parser.ts:1344`.

**This is a real improvement over the original redis L3** (in the first FINDINGS
run grove *fabricated* a `db->dict` step). On v0.1.8, across 10 languages, grove's
flow traces are line-accurate at the entry points and name the actual
intermediate functions — the structural backbone is sound. The grove answers are
also notably well-shaped for this rung: numbered call chains, per-step file:line,
explicit "← the terminal effect happens here" markers (spring-boot
`refreshContext`, bitcoin `AcceptToMemoryPool`, redis `call`).

**Caveat — sampled, not exhaustive.** 16 cites were verified, not every line of
every trace; and the *completeness* of each chain (did grove name every
intermediate, or skip some?) was not exhaustively diffed against ground truth.
The verified claim is **grounding** (cites are real and line-accurate), not
**total recall**. A full blind judge with every-step verification is the
follow-up if these traces get published.

---

## Grove issues surfaced (→ [GROVE-ISSUES.md](../GROVE-ISSUES.md))

- **GI-2 (thin-prompt overhead), now bounded:** grove loses context only on the
  short chains (django, laravel) where the baseline reads <10 files. This is the
  expected fixed-overhead regime, not a regression — and it shrank vs earlier
  rungs (≤ +34%).
- **typescript grove read-heavy (29 reads):** the one grove side that leaned on
  `Read` rather than structural tools — parser.ts is a 10k-line single file, so
  grove fell back to reading spans. Worth checking whether `map`/`callers` give
  enough of the parser call graph to avoid that.
- **No new fabrication (GI grounding) defects:** the L1/L2-era fabrication and
  off-by-one issues did not reappear on any of the 16 sampled L3 cites.

---

## Net verdict

For "trace the flow end-to-end," grove (as of `v0.1.8`):

- **uses less context on 5/7 completed races** (12–85%), and the win grows with
  the depth of the chain;
- **finishes where the baseline can't** — 3/10 baselines ran away past 1.5 MB and
  were killed; 0 grove sides did. This containment is the headline L3 finding;
- **stays lean** — 0–6 reads on 9/10 repos vs baseline's 6–222;
- **is line-accurate at the entry points** — 16/16 sampled cites verified, no
  fabrication, every trace reaching the correct terminal effect;
- **loses context only on short, well-signposted chains** (django, laravel) where
  its fixed steering tax isn't amortised — the documented thin-prompt regime.

L3 is the first rung where grove's advantage is not just "cheaper" but
"converges at all." The open follow-ups are typescript's read-heavy fallback on
giant single files and a full every-step recall judge before any of these traces
are published.

---

## Caveats

- **n=1 per cell.** Single runs; variance is large (see the baseline runaways).
  Treat single cells as directional; reproduce before citing.
- **3 baselines have no answer.** bitcoin/hugo/typescript baseline context is
  unmeasurable (killed mid-run), so those rows are grove-only and excluded from
  the 5/7 context tally.
- **Quality is sampled, single-reviewer, source-verified — not blind A/B.** See
  the quality caveat above.

## Reproduce

```bash
# grove v0.1.8 into the grove image, then race + measure all 10
GROVE_BIN=../grove/target/release/grove \
  scripts/build-grove.sh grove-testbench/base:latest grove-testbench/grove:v0.1.8
# runaway guard alongside (1.5 MB transcript cutoff):
MAXBYTES=1500000 scripts/l3-watchdog.sh out/l3 &
MAXP=4 scripts/run-l3.sh --all --model sonnet
# metrics: out/l3/opt-<repo>-L3_flow.claude.metrics.json
# aggregate + transcripts already under evidence/L3/ and evidence/L3.eval.json
```
