# L2 report — "definition + all call sites" across 10 repos

**Rung:** L2 (def + every reference/call site) · **Date:** 2026-06-23 ·
**Agent:** Claude, `--model sonnet` · **grove:** fixed, post-[#31](https://github.com/Entelligentsia/grove/issues/31) (`grove:r2`) ·
**Sides:** `baseline` = grove OFF, `grove` = grove ON (grove the only variable).

Evidence: [`evidence/L2.eval.json`](../evidence/L2.eval.json) (metrics),
[`evidence/L2.quality.json`](../evidence/L2.quality.json) (blind quality).
Raw transcripts: `out/opt-<repo>-L2_callsites.claude.{baseline,grove}.jsonl`.

---

## Headline

On "where is `X` defined and list every call site," with the off-by-one bug fixed:

| axis (lower/ better) | winner | tally |
|---|---|---|
| **context tokens** | **grove** | **grove 6/10** (baseline: redis, django, rails, laravel) |
| **wall-clock time** | baseline | **baseline 8/10** |
| **tool calls** | **grove** | **grove 6/10** |
| **answer quality** (blind) | tie | **5–5** |

Grove buys **fewer tool calls, less context, and higher precision** at the cost of
**more time and uneven recall**. Context is summed across all models the agent
system uses (orchestrator + any `Task`/`Explore` subagents), so offloading greps to
a subagent is not free. On the broad-search repos grove's structural results beat
the baseline's subagent churn; where grove loses context (django, laravel) it's
because grove *also* over-delegated and over-read (GI-3).

---

## Method

- **Prompt** (identical both sides): *"Where is `<symbol>` defined, and list every
  place it is referenced or called across the source tree, with file and line."*
- **Symbols** (one iconic per repo): redis `dictAdd`, tokio `Runtime`, hugo `Site`,
  django `QuerySet`, typescript `Scanner`, webpack `Compiler`, bitcoin
  `CMutableTransaction`, spring-boot `SpringApplication`, rails
  `ActiveRecord::Relation`, laravel Eloquent `Model`.
- **Fair baseline:** both sides get the same realistic `claude-md/<repo>.base.md`;
  `grove` additionally carries its `grove init` block. Grove is the only variable.
- **Context** = `input + cache_read + cache_creation` summed across **all models**
  in the result event's `modelUsage` — what the agent *system* ingests, including
  any `Task`/`Explore` subagent (which runs on its own model). The breakdown into
  orchestrator vs subagent context is in the evidence file (`subagent_ctx`,
  `delegated`, `*_subagent_tools`).
- **Quality** = blind judge per repo, A/B unlabeled, **every cited location verified
  against the pinned `grove:r2` source** with `grep -n` / `sed -n`.
- **Run:** `MAXP=4 scripts/run-rung-parallel.sh L2_callsites sonnet <10 repos>`
  (throttled — 20 concurrent containers OOM a 16 GB box).

---

## Metrics (per repo)

`ctx` = context (all models). `sub` = subagent context (the part run inside a
`Task`/`Explore` subagent). `del` = did that side delegate to a subagent.

| Repo | baseline ctx | grove ctx | ctx Δ | ctx win | baseline sub | grove sub | del | baseline→grove time | time win | baseline→grove tools | tool win |
|---|---|---|---|---|---|---|---|---|---|---|---|
| redis | 53,725 | 82,093 | +53% | baseline | 527 | 527 | —/— | 19→41s | baseline | 1→3 | baseline |
| tokio | 539,234 | 128,016 | **−76%** | **grove** | 488,046 | 526 | baseline/— | 126→79s | grove | 23→4 | grove |
| hugo | 513,389 | 185,590 | **−64%** | **grove** | 437,096 | 43,093 | baseline/grove | 110→110s | tie | 23→8 | grove |
| django | 269,980 | 275,357 | +2% | baseline | 185,172 | 154,665 | baseline/grove | 86→218s | baseline | 14→15 | baseline |
| typescript | 659,726 | 139,405 | **−79%** | **grove** | 609,454 | 526 | baseline/— | 115→144s | baseline | 34→6 | grove |
| webpack | 422,259 | 162,809 | **−61%** | **grove** | 269,766 | 527 | baseline/— | 118→52s | grove | 23→5 | grove |
| bitcoin | 187,573 | 183,986 | −2% | **grove** | 135,068 | 528 | baseline/— | 138→201s | baseline | 9→6 | grove |
| spring-boot | 776,458 | 196,539 | **−75%** | **grove** | 649,412 | 85,888 | baseline/grove | 107→125s | baseline | 25→12 | grove |
| rails | 79,764 | 185,486 | +133% | baseline | 530 | 64,769 | —/grove | 50→176s | baseline | 3→10 | baseline |
| laravel | 422,842 | 486,001 | +15% | baseline | 367,196 | 305,191 | baseline/grove | 136→226s | baseline | 16→39 | baseline |

**Context:** grove wins 6/10. On the broad-search repos baseline delegates to a haiku
`Explore` subagent whose grep churn (135k–649k per repo) dwarfs grove's top-level
structural results, so grove is 2–5× cheaper there (tokio 539k→128k, typescript
660k→139k, webpack 422k→163k). baseline only wins where it didn't delegate (redis, rails)
or where grove *also* delegated heavily and over-read (django tie, laravel GI-3).

**Tool calls (grove's edge):** grove wins 6/10, sometimes dramatically (typescript
34→6, tokio 23→4) — structural `callers`/`definition` replaces many greps. But it
can also blow up (laravel 16→**39**, a GI-3 over-read). baseline's high counts (tokio 23,
typescript 34) are the subagent's greps — counted, and now their context is counted
too.

---

## Quality (blind judges, claims verified vs source)

Blind A=baseline / B=grove. **5–5**, but the *kind* of win differs.

| Repo | quality winner | why |
|---|---|---|
| redis | **grove** | strict superset; found vendored `deps/hiredis` call site + enclosing fn names; both 6/6 precision |
| tokio | **grove** | baseline **fabricated** aggregate counts ("50+", real 18); grove gave verified file:line, better recall |
| hugo | baseline | both 6/6 precision; baseline covered all 4 `Site` def variants + accurate ~497 count; grove undercounted ~3× |
| django | baseline | grove **fabricated** `query.py:304` (PreventQuerySetCloning ≠ QuerySet); undercovered source, buried in tests |
| typescript | baseline | grove pointed at generated `*.d.ts`; missed checker/parser/nodeFactory call sites (GI-5) |
| webpack | baseline | grove substituted `types.d.ts` for real `lib/`; silently dropped ~199 typedef refs (GI-5) |
| bitcoin | **grove** | higher recall (132 vs ~115 files), caught `interfaces/wallet.h` etc.; fewer wrong lines |
| spring-boot | baseline | grove precision-perfect but covered **<25%** of refs (GI-6); baseline broad categorical coverage |
| rails | **grove** | found bare-`Relation` refs baseline missed (subclasses, factory calls, constants) |
| laravel | **grove** | zero fabrications + unique real refs (Facade alias, DB-provider injection); baseline had a fabricated column |

**Pattern:**
- **Grove wins on precision + non-obvious references** — vendored copies,
  subclasses, factory calls, enclosing functions; and it fabricates less.
- **Grove loses on recall / wrong target** — two concrete, fixable defects below.

---

## Grove issues surfaced (→ [GROVE-ISSUES.md](../GROVE-ISSUES.md))

- **GI-3 — over-read / non-convergence:** laravel grove ran 39 tool calls / 226 s vs
  baseline 16 / 136 s, and its context (486k) exceeds baseline (423k) — grove delegated to a
  sonnet subagent (305k) *and* over-read at top level. Present since L1; worst on
  broad asks.
- **GI-5 — references resolve to generated declaration files:** typescript refs
  landed in `tests/baselines/**/*.d.ts`, webpack in `types.d.ts`, instead of real
  source → the agent answers from the wrong file and drops real call sites.
- **GI-6 — `callers` under-covers common symbols:** spring-boot grove covered <25% of
  real references (only grove-tagged cross-refs); hugo/django undercounted ~3×.
  Precision-first, low recall on "every reference" asks.

### Context-cheap ≠ complete (read before citing any context win)

A low context number is good **only if coverage is complete**. Several of grove's
context wins coincide with quality losses: hugo grove undercounted ~3×, typescript/
webpack grove answered from the wrong (`.d.ts`) files, spring-boot grove covered <25%.
In those cases "cheaper" partly means **did less**, not "more efficient." The clean
grove context wins — where grove also won or tied quality — are **tokio, bitcoin** (redis
is a baseline win on both). This is why every rung pairs cost metrics with verified
quality, and why the recall fixes below matter more than the context tally.

---

## Net verdict

For "list all call sites," grove (as of `grove:r2`):
- **uses less context** on 6/10 — the broad-search repos where the baseline's
  subagent churn dwarfs grove's structural results;
- **issues fewer tool calls** (6/10) — its other robust advantage;
- **costs more time** (baseline 8/10);
- **ties on answer quality** (5/5), trading higher precision for lower/uneven recall.

The real blockers to grove winning this rung outright are **GI-5** (stop indexing
generated `.d.ts`) and **GI-6** (recall on `callers`): 4 of grove's 5 quality losses
were recall/target failures, and several of grove's context "wins" are cheap precisely
because recall was low. Fix recall and the context advantage becomes a genuine one.

---

## Caveats

- **n=1 per cell.** Variance is large (e.g. rails baseline 50 s vs grove 176 s; laravel grove
  blow-up). Treat single-cell results as directional; reproduce before citing.
- redis's first batch cell hit a transient 401 (expired baked creds) and was
  re-run single; see [FINDINGS.md](../FINDINGS.md) ops notes (auth + concurrency).

## Reproduce

```bash
# fixed grove into grove image, then race + judge
GROVE_BIN=../grove/target/release/grove scripts/build-grove.sh
MAXP=4 scripts/run-rung-parallel.sh L2_callsites sonnet \
  redis tokio hugo django typescript webpack bitcoin spring-boot rails laravel
# metrics (context + subagent decomposition): out/opt-<repo>-L2_callsites.claude.metrics.json
# aggregate evidence:  scripts/build-eval.sh L2_callsites --out evidence/L2.eval.json \
#   redis tokio hugo django typescript webpack bitcoin spring-boot rails laravel
```
