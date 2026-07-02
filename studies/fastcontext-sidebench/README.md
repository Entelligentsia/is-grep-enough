# FastContext delegation side-bench

**Question:** what happens to the metered agent's cost if we replace *Claude Code
driving grove directly* (the `grove` arm) with *Claude Code delegating all
exploration to a local free model* — the FastContext `explore` MCP tool backed by
**qwen3.5:4b** (Ollama) driving grove internally?

Not part of the main `navigation-3way` ledger. Host-run, delegation-only.

## Headline: three arms on L4/L5 × {redis, django, tokio}

Baseline = the main 150-cell study's **text-search arm** (Claude + bash, no
structural tool). Merit-fc / Coerce-fc = local-delegation to qwen3.5:4b with the
merit (grep-natural) vs coercive (grove-forced) inner prompts. `ctx` = Claude
context tokens (the metered cost); the fc arms additionally spend *free local*
qwen compute that never touches Claude's context.

| arm | Claude ctx | vs baseline | wall | grounding | completeness |
|---|---|---|---|---|---|
| **Baseline** (text) | 6,966,989 | 1× | 875s | **0.97** | **1.00** |
| **Merit-fc** (grep) | 387,526 | **18.0× cheaper** | 1,357s | 0.93 | 0.86 |
| **Coerce-fc** (grove) | 356,748 | **19.5× cheaper** | 974s | 0.94 | 0.93 |

Per-cell (each arm: **ctx / wall / grounding / completeness**):

| cell | Baseline (text) | Merit-fc (grep) | Coerce-fc (grove) |
|---|---|---|---|
| L4-redis  | 309,894 / 113s / 0.98 / 1.0 | 45,214 / 154s / 0.93 / 1.0 | 77,177 / 179s / 0.90 / 1.0 |
| L4-django | 88,828 / 73s / 0.98 / 1.0 | 58,821 / 124s / 0.92 / 0.67 | 44,924 / 116s / 0.95 / 1.0 |
| L4-tokio  | 406,490 / 145s / 0.95 / 1.0 | 62,094 / 257s / 0.92 / 0.86 | 46,461 / 121s / 0.92 / 0.86 |
| L5-redis  | 1,578,920 / 191s / 0.98 / 1.0 | 64,444 / 221s / 0.95 / 0.88 | 46,036 / 141s / 0.97 / 1.0 |
| L5-django | 182,567 / 110s / 0.98 / 1.0 | 59,252 / 95s / 0.95 / 1.0 | 45,188 / 100s / 0.96 / 1.0 |
| L5-tokio  | 4,400,290 / 243s / 0.95 / 1.0 | 97,701 / 506s / 0.93 / 0.75 | 96,962 / 317s / 0.93 / 0.75 |

*Baseline G/C are the main study's blind-panel scores. Merit/coerce G/C are
in-study judgments: completeness = mechanical spine-coverage vs the reference key;
grounding = citation resolution against pinned source (redis exact; django/tokio
against canonical paths). Merit used **0 grove calls on all 6 cells** (pure
grep+read); coerce used grove 68 times total.*

**Takeaways.** (1) Local delegation cuts Claude's metered context **~18–20×** vs the
text baseline for ≤7% quality and a modest wall premium — the baseline bleeds
1.6M–4.4M tokens on the hard L5 cells brute-reading source. (2) Among the fc arms,
**forcing the structural tool (coerce) dominates letting the 4B choose (merit)** on
context (−8.6%), wall (−28%), and completeness (0.93 vs 0.86) at equal grounding —
merit's grep-only exploration skips spine pieces and iterates more. (3) Merit's
deficit is completeness, not grounding. (4) Both fc arms bottom out at L5-tokio
(0.75) — the local 4B misses the I/O-readiness/timer-poll spine pieces the baseline
reaches only by brute force.

## Plan-first explorer (`FC_PLAN_FIRST=1`)

A two-phase local agent that reconnoiters structure with grove *first*, commits to a
focus, then executes freely — the pattern that produced the best answers in the
study. Enforced by the harness, not prompt pleading.

- **Phase 1 (recon):** the model gets Grove (structure verbs: map/symbols/outline/
  definition) **+** a `submit_plan` tool. After `FC_RECON_TURNS` (default 2) grove
  turns, Grove **closes** (enforced at schema *and* execution, since the 4B
  hallucinates closed tools), leaving `submit_plan` the only option → it commits a
  focus (files/symbols/steps). *Prompt-only cannot do this: with tools in scope a 4B
  never emits a free-text plan — v1/v2 prompts scored 0/4, the submit_plan tool 4/4.*
- **Phase 2 (execute):** all real tools (Grove source/callers, Read, Grep, Glob); the
  model executes the plan to answer the original question.
- **Recon once per session:** the first explore call's plan is cached (module global,
  keyed by repo dir); every later call in the same server process skips recon and gets
  the plan injected as a standing hint, running straight in execute.

### Four-arm comparison — L4 + L5 × {redis, django, tokio}

All three delegation arms (merit / coerce / plan-first, recon-once) vs the metered
text baseline, over the 6 hardest cells. `ctx` = Claude (sonnet) context tokens
(input+cache-read+cache-create over all models); `wall` = end-to-end seconds;
`comp` = reference-spine pieces hit; `ground` = fraction of cited file:line that a
blind grader verified against pinned source.

Per-cell (**ctx / wall / comp / ground**):

| cell | baseline (text) | merit-fc (4B, grep-natural) | coerce-fc (4B, grove-forced) | plan-first (4B, recon-once) |
|---|---|---|---|---|
| L4-redis  | 309,894 / 111s / 4·4 / 1.00 | 45,214 / 153s / 4·4 / 0.93 | 78,657 / 169s / 4·4 / 0.83 | 63,090 / 202s / 4·4 / 1.00 |
| L4-django |  88,828 /  71s / 4·4 / 1.00 | 58,821 / 123s / 4·4 / 0.90 | 30,751 /  94s / 3·4 / 1.00 | 43,935 / 106s / 3·4 / 0.92 |
| L4-tokio  | 406,490 / 143s / 5·5 / 0.86 | 62,094 / 256s / 5·5 / 1.00 | 80,047 / 219s / 5·5 / 0.92 | 60,881 / 183s / 5·5 / 0.96 |
| L5-redis  | 1,578,920 / 190s / 6·6 / 0.97 | 64,444 / 219s / 6·6 / 1.00 | 46,036 / 140s / 6·6 / 1.00 | 97,106 / 251s / 6·6 / 1.00 |
| L5-django | 182,567 / 109s / 6·6 / 1.00 | 59,252 /  93s / 6·6 / 0.90 | 45,188 /  99s / 6·6 / 0.86 | 58,323 / 132s / 5·6 / 0.90 |
| L5-tokio  | 4,400,290 / 243s / 6·6 / 0.82 | 97,701 / 505s / 6·6 / 0.93 | 96,962 / 315s / 6·6 / 0.96 | 113,143 / 539s / 6·6 / 0.92 |

Aggregates (mean over the 6 cells; ctx also as median because baseline is
heavy-tailed — L5-tokio alone is 4.4M):

| arm | mean ctx | median ctx | vs baseline (mean · median) | mean wall | completeness | grounding |
|---|---|---|---|---|---|---|
| baseline (text) | 1,161,165 | 358,192 | — | 144s | 100.0% | 0.94 |
| merit-fc (grep) |    64,588 |  60,673 | **−94.4% · −83.1%** (18.0× · 5.9×) | 225s | 100.0% | 0.94 |
| coerce-fc (grove) |  62,940 |  62,346 | **−94.6% · −82.6%** (18.4× · 5.7×) | 173s |  95.8% | 0.93 |
| plan-first (recon-once) | 72,746 | 61,986 | **−93.7% · −82.7%** (16.0× · 5.8×) | 236s |  93.1% | 0.95 |

Reading it:
- **All three delegation arms cut metered Claude context by ~83% (median) to ~94%
  (mean) at grounding parity (0.93–0.95 vs baseline 0.94).** The mean gap is inflated
  by two baseline blowups (redis-L5 1.6M, tokio-L5 4.4M) where sonnet's own text
  search churned; the median (~5.8×) is the honest typical saving.
- **coerce (grove-forced) is the cost/quality sweet spot** on this slice: lowest mean
  wall (173s), full grounding on 3/6 cells, and it never lost a spine piece except the
  one it shared with plan-first (django-L4, 3/4).
- **plan-first buys the best grounding (0.95)** — the recon pass anchors cites — but
  pays for it: highest mean wall (236s) and it dropped a spine piece on L5-django
  (5/6), where the cached plan under-scoped the execute phase. Its cost premium over
  coerce is execute-phase depth × outer explore-call count, not recon (recon runs 1×).
- **merit matches baseline completeness (100%) and grounding (0.94)** but is the
  slowest-scaling on hard cells (tokio-L5 505s) because grep-only exploration iterates.

Recon-once (vs the earlier recon-every-call prototype) cut plan-first cost **−27%
ctx / −35% wall** on tokio-L4 by dropping redundant recon passes — verified here:
across all 6 cells recon ran in exactly the first inner call and 0× after (e.g.
L5-tokio: 1 recon of 14 explore calls).

Tuning artifacts: `test-phase1.py` (fast recon-only tester), `phase1/{v1,v2,v3}.txt`,
`fc-planfirst-mcp.json`. Run the arm with `FC_MCP_CFG=fc-planfirst-mcp.json`
(`run-planfirst-L45.sh`).

## Method

- **Arm:** `claude -p <prompt> --model sonnet --tools "" --allowedTools mcp__fastcontext__explore
  --mcp-config fc-grove-qwen35-mcp.json --strict-mcp-config --append-system-prompt <steer>`.
  `--tools ""` disables every built-in tool so the ONLY capability is `explore`
  → Claude must delegate. (`--allowedTools` alone is not a strict whitelist: the
  host `~/.claude` settings pre-allow Bash/Read, so Claude bypassed `explore`.)
- **Inner explorer:** qwen3.5:4b, thinking off, grove enabled, `FC_MAX_TOKENS=1024`.
- **Fairness:** same 6 tool-neutral prompts and same pinned SHAs as the grove arm;
  outer model = sonnet (matches grove arm). Steering is a truthful "no built-in
  tools exist" statement — the analogue of the grove arm's CLAUDE.md capability block.
- **Slice:** redis, django, tokio × L3, L4 (6 cells). Grove-arm baselines +
  blind-judge grounding come from the main ledger (`experiment/state.json`).
- Scripts: `run-fc.sh` (runner), `extract-fc.sh` (metrics). Raw in `out/`.

### Vendored MCP (for prompt fine-tuning)

The FastContext MCP is vendored at `vendor/fastcontext/` (copied from
`/home/boni/src/fastcontext`) so the inner explorer's prompts can be tuned in-repo
without touching upstream. `run-fc.sh` points at `fc-vendored-mcp.json` →
`vendor/fastcontext/mcp_server.py` by default; `uv` builds it into a local `.venv`
on first run. Sidecars land in `vendor/fastcontext/.fastcontext-mcp/` (both
gitignored, along with `out/`).

Prompts to edit (the exact strings the inner qwen3.5:4b receives — base + grove
steering appended when `FC_ENABLE_GROVE=1`):
- `vendor/fastcontext/src/fastcontext/agent/system.md`
- `vendor/fastcontext/src/fastcontext/agent/grove_steering.md`
- `vendor/fastcontext/src/fastcontext/agent/tool/{grove,grep,read,glob}.md` (tool descriptions)

Edit → re-run a cell (`./run-fc.sh <repo> <rung>`) → re-extract. To A/B two prompt
variants, copy the config and run with `FC_MCP_CFG=/path/to/other.json ./run-fc.sh …`.
Tuning target from the gradient study: stop the inner 4B ignoring grove / looping on
Grep (redis-L2's 13-call thrash, tokio-L4's 0 grove calls).

## Headline result — metered (sonnet) context tokens

| cell | grove ctx | fc ctx | reduction | grove turns | fc turns | grove wall | fc wall |
|---|---|---|---|---|---|---|---|
| redis-L3  | 410,390 | 61,036 | −85.1% | 16 | 4 | 113s | 128s |
| redis-L4  | 359,299 | 77,177 | −78.5% | 23 | 6 | 119s | 179s |
| django-L3 | 337,011 | 61,000 | −81.9% | 17 | 5 | 115s |  96s |
| django-L4 | 194,987 | 44,924 | −77.0% | 19 | 4 |  92s | 116s |
| tokio-L3  | 665,971 | 77,324 | −88.4% | 25 | 9 | 128s | 204s |
| tokio-L4  | 378,952 | 46,461 | −87.7% | 32 | 3 | 231s | 121s |
| **total** | **2,346,610** | **367,922** | **−84.3%** | | | 798s | 844s |

**The metered agent's context drops 77–88% per cell (mean −83.1%, aggregate
−84.3%)** by pushing navigation onto the free local model. Aggregate wall is ~flat (+6%) but high-variance: delegation
is *slower* when the grove arm answered cheaply (redis-L4, tokio-L3) and *faster*
when the grove arm would otherwise flounder over many turns (tokio-L4: 231s/32
turns → 121s/2 explore calls).

## Complexity gradient (L1→L4, warm model)

Extended the slice to the full L1→L4 ladder per repo (redis-L1 re-run warm after a
~45s Ollama cold-start confound; `run-fc.sh` now warms + pins the model).

Mean context reduction by rung (across 3 repos):

| rung | mean reduction | explore calls [redis, django, tokio] |
|---|---|---|
| L1 (easy) | −64.9% | [2, 4, 2] |
| L2        | −57.7% | [**13**, 2, 6] |
| L3        | −85.1% | [3, 4, 8] |
| L4 (hard) | −81.1% | [5, 3, 2] |

Per-repo, reduction% (inner explore calls):

| | redis | django | tokio |
|---|---|---|---|
| L1 | −83.3% (2) | −27.9% (4) | −83.3% (2) |
| L2 | **−26.5% (13)** | −77.1% (2) | −69.5% (6) |
| L3 | −85.1% (3) | −81.9% (4) | −88.4% (8) |
| L4 | −78.5% (5) | −77.0% (3) | −87.7% (2) |

**The delegation win scales with task difficulty.** Hard rungs (L3/L4) reliably
save ~81–85%; easy rungs (L1/L2) average only ~58–65% with wide spread — at low
complexity the direct-grove cost is already lean (django-L1 grove = 102k, the
smallest cell), so offloading buys little and each verbose `explore` return eats
the margin (django-L1: −27.9%). **Thrash erodes/reverses the win at any rung:**
redis-L2 blew up to 13 explore calls → 218k fc context → only −26.5% and 3× wall
(348s vs 108s), the redis-L4 pathology, worse. Exploration effort is
repo-dominated, not rung-monotonic (django cheap everywhere; redis/tokio spike). A
cold-start adds ~45s to the first cell of a batch — warm the model before timing.

## Inner (free/local) cost, off the metered books

| cell | explore calls | inner wall | inner grove calls | inner gen tok |
|---|---|---|---|---|
| redis-L3  | 3 | 107s |  7 | 3,229 |
| redis-L4  | 5 | 145s | 24 | 5,276 |
| django-L3 | 4 |  73s |  9 | 2,331 |
| django-L4 | 3 |  93s |  3 | 3,034 |
| tokio-L3  | 8 | 168s | 44 | 4,122 |
| tokio-L4  | 2 |  83s |  0 | 3,457 |

Inner exploration is 65–85% of outer wall — the latency cost of the trade.

## Quality (spot-verified vs reference keys)

Grounding is **comparable to the grove arm, not degraded**. All 6 answers hit the
full reference spine (completeness ~1.0). Sampled load-bearing cites: redis-L4 was
line-exact on all five anchors (bgsaveCommand rdb.c:4833, rdbSaveBackground 2070,
redisFork server.c:7428, checkChildrenDone 1416, backgroundSaveDoneHandlerDisk
4544); other cells had occasional ±6–11 line offsets landing on the def's
docstring/class header — the same "few lines loose" pattern the blind panel flagged
for grove/lsp (grove-arm grounding on this slice: 0.93–0.98). Line numbers are
grounded in `explore` output (Claude has no file access); prose framing may draw on
the outer model's knowledge.

## Inner explorer tool mix (per cell)

The inner 4B's grove adoption is **stochastic** — it falls back to Grep/Read
unpredictably (study finding: small models resist a non-training-distribution tool):

| cell | Grove | Grep | Read | Glob |
|---|---|---|---|---|
| redis-L3  |  7 | 14 | 11 | — |
| redis-L4  | 24 | 23 |  9 | — |
| django-L3 |  9 |  5 |  5 | 3 |
| django-L4 |  3 | 13 | 14 | — |
| tokio-L3  | **44** |  4 |  9 | 3 |
| tokio-L4  | **0** | 14 | 12 | — |

tokio-L4 reached line-exact citations with **zero grove calls** (pure Grep+Read);
tokio-L3 leaned almost entirely on grove. Answers stayed grounded either way.

## Interleaved transcripts

Full outer(Claude)+inner(qwen3.5:4b) interleaved transcripts per cell in
`transcripts/` (rendered by `render-cell.py` from the harvested `out/*.inner*.json`
sidecars — each sidecar is a complete inner turn log: LLM timing/usage, every
tool call with args + observation, and the final answer):

- [`transcripts/L3-redis.md`](transcripts/L3-redis.md) · [`L4-redis.md`](transcripts/L4-redis.md)
- [`transcripts/L3-django.md`](transcripts/L3-django.md) · [`L4-django.md`](transcripts/L4-django.md)
- [`transcripts/L3-tokio.md`](transcripts/L3-tokio.md) · [`L4-tokio.md`](transcripts/L4-tokio.md)

The redis-L4 transcript captures the orchestrator-resilience pattern: the inner
model's first explore call ignored grove, looped on a fruitless Grep 4× and
returned empty → Claude Code retried `explore` with a refined query and succeeded.

## Cross-check: the baseline arm's latent cloud-delegation

The same prompts on the baseline arm (sonnet + text search) could delegate
exploration to `Task`/`Agent` subagents — which run on **claude-haiku-4-5** (cheap
cloud, not local). Scanning the existing baseline transcripts for the 6 cells: this
happened **organically in exactly 1 of 6** — tokio-L4 (largest/hardest). Elsewhere
the baseline ran pure-sonnet (the ~600 Haiku tokens everywhere else are fixed
harness overhead, not delegation).

tokio-L4 lets all three execution models line up on one prompt:

| execution model | sonnet ctx | delegated to | delegated load | wall | judge grounding |
|---|---|---|---|---|---|
| grove (sonnet drives grove)      | 378,340 | —              | —                    | 231s | 0.97 |
| baseline + Haiku subagent (cloud)|  52,798 | claude-haiku-4-5 | 353,692 tok (metered) | 143s | 0.95 |
| fastcontext (local qwen3.5:4b)   |  46,461 | qwen3.5:4b     | ~free (local)         | 121s | ~0.95 |

The baseline+Haiku subagent: sonnet made 1 `Agent` call + 0 direct exploration (2
turns), the Haiku subagent did 3 Bash + 10 Read (22 turns, all on
claude-haiku-4-5). Both delegation models cut sonnet context ~86–88% at comparable
wall and Full completeness. The difference is the axis, not the magnitude:
**Haiku = cheap-but-metered cloud (faster, more capable than a 4B, leaves the
machine); qwen = free-but-local (private, zero marginal cost, weaker, needs a GPU).**
The Haiku pattern was emergent/rare (1/6), not a controlled arm — sonnet opted in
only when the task meant reading several large files. A fair comparison would force
it. See [[haiku-subagent-leak]]: the same leak that inflates the recorded baseline
"context" (406k = sonnet+Haiku conflated) is what exposes this execution model.

## Two findings that bit during setup

1. **Delegation-only needs `--tools ""`, not `--allowedTools`.** With host settings
   allow-listing built-ins, Claude ignored `explore` and searched directly (and
   spawned an `Agent` subagent — a Haiku-leak contaminant).
2. **The outer model sometimes emits the tool call as text and produces nothing.**
   On some runs (tokio-L3, redis-L1 trials) sonnet renders
   "**Tool: mcp__fastcontext__explore**" as plain text and the turn ends — EMPTY
   output (~90-110 chars, num_turns=1, 0 real tool_use). High run-to-run variance.
   **Do NOT gate on tool engagement** (an earlier draft treated `explore_calls==0`
   as a DNF — that is wrong): whether grove/fc engaged is a process correlate, not a
   pass/fail. Grade the OUTPUT against the reference key — a correct cheap answer
   counts regardless of tool; an empty output is simply quality-zero.
3. **Contamination — outer prior overrides retrieved evidence.** Even when it
   delegated and the inner tool retrieved the correct source, the outer model
   sometimes answered from its parametric prior instead: redis-L1 wrote `int
   refcount` and argued against the pinned `refcount:23` bitfield the inner Read had
   just surfaced (grounding 0.95 → ~0.55). Cheap context can come partly from
   answering off-prior rather than grounding — grade grounding, not just cost.
