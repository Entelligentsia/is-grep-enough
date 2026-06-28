# GI-3 — Over-read blow-ups / non-convergence (no breadth control)

## Summary

grove-driven navigation expands context and wall-clock far beyond the baseline
instead of converging. The agent fans out `symbols`+`source` across many
candidates with no breadth budget or dedup, fetching many full function bodies
one after another. Present even on **trivial one-symbol lookups** (L1) and worst on
broad questions — the context-savings story inverts exactly where big codebases
need it most. Confirmed across multiple repos and rungs (L1, L2, L5).

## Reproduction

- **grove:** `0.1.5` @ `fd949ad`, `grove serve` MCP to Claude (`sonnet`).
- **redis L5** — `redis/redis` @ `d2d3390d0c4d01ab7bfb46054ad0d5003d63c11b`
  - prompt: *Give an architectural overview of how a write command propagates from
    a master to its replicas in Redis: name every function involved on both the
    master side … and the replica side … and how they connect.*
- **tokio L1** — `tokio-rs/tokio` @ `66e29121b333d1ba5bde803f570e421524d4431e`
  - prompt: *Where is the `spawn` function (the free function that schedules a
    future onto the runtime) defined? Give the exact file and line.*
- **TypeScript L1** — `microsoft/TypeScript` @ `8ef3e2f3d43c8c92bda9510c47f7d4d2b3aeca33`
  - prompt: *Where is the `createScanner` function defined? Give the exact file
    and line.*
- **laravel L2** — `laravel/framework` @ `2107d3d7079993fd2e82777674fae5b65d87997f`
  - prompt: *Where is `the Eloquent Model class` defined, and list every place it
    is referenced or called across the source tree, with file and line.*

## Measured impact

| rung | repo | db ctx | dg ctx | db tools | dg tools | db time | dg time |
|---|---|---|---|---|---|---|---|
| L1 | tokio | 152,635 | **479,097** | 5 | 12 | 18s | 68s |
| L1 | typescript | 73,864 | 129,504 | 2 | 4 | 9s | **322s** |
| L2 | laravel | 422,842 | **486,001** | 16 | **39** | 136s | 227s |
| L5 | redis | 1,541,835 | **631,035** | 47 | 29 | 181s | 183s |

(All context now sums all models incl. subagents; see `extract-metrics.sh`.)

On a **one-symbol** question grove ballooned context 2–3× and ran 10–40× longer
(tokio L1 +215% ctx; typescript L1 322s vs 9s). On the broad L5 architecture prompt
grove's 29 tool calls did not converge — see the offending sequence below.

## Offending behavior (from the transcript)

**redis L5 (dg, top-level tool sequence)** — the agent calls `outline`, `symbols`,
then **17 `source` calls in a row**, interspersed with more `symbols`/`source`,
fetching one full function body after another with no pruning or summary step:

```
ToolSearch, g:outline, g:symbols, g:source ×17, g:symbols, g:symbols,
g:source, g:symbols, g:source, g:callers, g:symbols, g:source
```

**tokio L1 (dg)** — a single-symbol lookup fans out across `symbols`×3, `outline`×2,
and 4× `Read`, never settling: 12 tools / 479k ctx for "where is `spawn` defined?".

**laravel L2 (dg)** — 39 tool calls / 227s; dg delegated to 3 sonnet subagents
*and* over-read at top level (4× `symbols` + 3× `Agent`), so its true context
(486k) exceeded even the baseline's (423k). The over-read is not bounded by the
agent delegating — it over-reads either way.

## Hypothesis

No breadth budget, no dedup, no "good enough" stop condition in grove steering:
the agent treats each new `symbols` hit as a fresh `source` to fetch, so context
grows monotonically with the candidate set. There is also no compact "summarize a
subsystem" affordance, so the only way to gather a broad picture is many full
bodies.

## Proposed fix

1. **Steering breadth control**: guidance that an exhaustive answer does not
   require fetching every body — prefer `outline`/`symbols` to map, then `source`
   only for the few load-bearing symbols; cap consecutive `source` calls.
2. **A compact "subsystem map" affordance**: a grove tool that returns a
   structured outline of a directory/subsystem (defs + call edges, no bodies) so
   broad questions converge on a map instead of N full sources.
3. **Dedup / convergence hint**: when the agent re-issues `symbols` for the same
   name/dir, return cached/prior results with a "already enumerated" note rather
   than re-expanding.
4. Pair with GI-6 (recall): a recall-mode `callers` would replace many `symbols`
   fan-out calls with one structured answer.

## Fix verification

GI-3 is an agent-navigation/steering behavior, not grove's raw output, so there
is **no zero-token Tier-1 probe** (the probe rig asserts CLI output, not
convergence). Verify by re-running the affected rungs and confirming convergence
— tool count and true context drop to/below the baseline. True context is summed
across all models (incl. subagents) per `extract-metrics.sh`.

```bash
GROVE_BIN=../grove/target/release/grove scripts/build-grove.sh
# one-symbol rungs (over-read on trivial lookups):
MAXP=4 scripts/run-rung-parallel.sh L1_symbol sonnet tokio typescript
# broad rungs (non-convergence):
MAXP=4 scripts/run-rung-parallel.sh L2_callsites sonnet laravel
scripts/run-race.sh opt-redis-L5_arch --repo-name redis --model sonnet   # redis ladder rung
scripts/extract-metrics.sh opt-<repo>-<rung>   # per race
```

Success criteria (current grove 0.1.5 → fixed):

| rung | metric | current | target |
|---|---|---|---|
| tokio L1 | tools / ctx | 12 / 479k | <=5 / <=153k |
| typescript L1 | time | 322s | <=30s |
| laravel L2 | tools / ctx | 39 / 486k | <=16 / <=423k |
| redis L5 | tool seq | 17× consecutive `source` | converges (outline map, no fan-out) |

A Tier-1 proxy becomes available once the proposed "subsystem map" affordance
lands: assert `grove outline <dir>` returns a compact structured map (defs +
edges, no bodies) in a single call, which the agent can use instead of N `source`
calls. Add that as a `probes/` spec then.

## Evidence

- Transcripts: `out/opt-redis-L5_arch.claude.dg.jsonl`,
  `out/opt-tokio-L1_symbol.claude.dg.jsonl`, `out/opt-typescript-L1_symbol.claude.dg.jsonl`,
  `out/opt-laravel-L2_callsites.claude.dg.jsonl`
- Metrics: `out/opt-{redis-L5_arch,tokio-L1_symbol,typescript-L1_symbol,laravel-L2_callsites}.claude.metrics.json`
- Aggregates: `evidence/L2.eval.json`, `out/redis.optimize.json`
- Backlog: `GROVE-ISSUES.md` (GI-3)
