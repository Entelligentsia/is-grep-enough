# code-analyzer-testbench

**Which code-introspection tooling serves a coding agent best — and why?**
A fair, mechanism-grounded comparison of three navigation regimes across a ladder
of task complexity, over 10 large real-world codebases.

📊 **Live results dashboard → <https://entelligentsia.github.io/is-grep-enough/>**

| Regime | Capability the agent gets | How |
|---|---|---|
| **baseline** | text search | bash + coreutils + ripgrep |
| **grove** | structural | tree-sitter via the [grove](https://github.com/Entelligentsia/grove) MCP server |
| **lsp** | semantic | Claude Code's native `LSP` tool + official language plugins |

The answer is a **curve, not a verdict**: which regime wins depends on *task type
and complexity*, and the experiment pins down **which, where, and why** — bounded
to what one fair pass reveals (n=1 per cell, reported honestly). Jump to
[**Findings**](#findings) for the result, or read on for how it's kept fair.

## The matrix

**3 arms × 5 complexity rungs × 10 repos = 150 cells.** Each cell is one agent
run, fully isolated in a container, on a frozen prompt.

- **Rungs** climb task complexity: `L1` locate-a-symbol → `L2` call-sites →
  `L3` flow-trace → `L4` subsystem-map → `L5` architecture/binding-spine.
- **Repos** (pinned to exact SHAs in [`repos.manifest`](repos.manifest)): redis (C),
  bitcoin (C++), django (Python), typescript (TS), webpack (JS), laravel (PHP),
  rails (Ruby), hugo (Go), tokio (Rust), spring-boot (Java).
- **Measured per cell:** context tokens, wall time, turns, tool-call counts, and a
  blind **answer-quality** grade (completeness + grounding) against a pre-registered
  reference key — plus, for the lsp arm, the per-repo **`setup_s`** (the cost of
  warming a language server enough to answer correctly).

## Findings

The grid is complete: **150 / 150 cells harvested, all 50 (rung, repo) trios
blind-judged.** Explore every cell — coverage, metrics, and the raw transcript
behind each number — in the [live dashboard](https://entelligentsia.github.io/is-grep-enough/).
The headline, in three parts.

**On answer quality, the three arms tie.** Grep is enough to be *correct*: across
the 50 judged tasks, mean grounding is ~0.97 and completeness ~0.99 for every arm.
All three reach the right answer almost everywhere — quality is not where they
separate.

**They separate on how much context they push through the model, and the gap
widens with task complexity.** Structural navigation (grove) reaches the same
answer on the fewest tokens — ~395k on average, against ~567k for lsp and ~780k
for baseline (grep + read, which fans out and re-reads). At the easy rungs every
arm is light; by the hardest rung (`L5`) baseline pushes ~1.5M tokens of context
against grove's ~534k — **2.8× as many** — while grove stays tightest on quality.
This is *token throughput*, not the billed bill: most of baseline's volume is
cheap cache reads, so in dollars the arms are far closer. The lean-context win
matters most for context-window pressure, latency, and any setting without
aggressive prompt caching.

**The lsp arm's real cost is operational, and it tracks compilation.**
Dynamically-typed languages (Python, PHP, JS/TS) — and Java via an
invisible-project trick — resolve **cold**; compiled languages (C/C++, Go, Rust)
need a build/index warm spanning **0 → 46 min** plus a multi-GB image. Semantic
precision is real, but bought with a large, uneven, per-language setup cost the
other two arms never pay. The per-language record — exact steps, costs, failure
modes — is in [`docs/LSP_COMPLEXITY.md`](docs/LSP_COMPLEXITY.md).

So the thesis held: **a curve, not a verdict.** Grep suffices for shallow lookups;
structural tools pay off — in tokens first — as code gets harder to navigate; and
semantic precision is available, but front-loads a per-language toll. All of it is
checkable: blind judgements in [`reports/`](reports), raw + readable transcripts in
[`evidence/nav3/`](evidence/nav3).

## What makes it fair

- **Identical substrate.** All three arms run on one frozen base image (all 10
  repos + every toolchain); the *only* difference is the navigation capability
  layered on top. See [`docs/CONTAINERS.md`](docs/CONTAINERS.md).
- **Pre-registered, walled-off prompts.** Prompts + reference keys are generated
  offline ([`docs/PROMPT_GENESIS.md`](docs/PROMPT_GENESIS.md)) and **never shown to
  a running arm** — only the bare prompt is.
- **Engagement gate.** A run only counts if the arm actually used its capability
  (baseline ran a shell search, grove called a grove tool, lsp called the LSP tool)
  and produced a clean, error-free result. No degenerate Read-only passes.
- **Blind judging.** Each answer is graded against its key with arm identity
  hidden, and every sampled `file:line` citation is re-verified against pinned
  source ([`/judge-arm`](.claude/skills/judge-arm), [`reports/`](reports)).
- **One writer of truth.** The cell ledger (`experiment/state.json`) is only ever
  written through the validated `statectl` CLI — never hand-edited.

## Reproduce

```bash
# 1. build the three arm images (creds are injected at runtime, never baked)
containers/build/build-base.sh                              # base: 10 repos + all toolchains
GROVE_BIN=../grove/target/release/grove containers/build/build-grove.sh
containers/build/build-lsp.sh                               # servers + official LSP plugins + warm

# 2. run one cell end-to-end (preflight -> run -> gate -> harvest -> record)
/runarm L4-grove-redis        # or:  /runarm next

# 3. judge a completed (rung,repo) once all three arms are harvested
/judge-arm L4-redis

# 4. view the results — metric tables in-terminal, or rebuild the dashboard feed
/report-metrics L4
node site/build.mjs --sha "$(git rev-parse --short HEAD)" --at "$(date -u +%FT%TZ)"
```

## Layout

```
docs/         design + methodology (DESIGN, CONTAINERS, LSP_SETUP, PROMPT_GENESIS)
experiment/   the engine: statectl (validated ledger CLI) + state.json + spine.json
              + prompts/ (frozen prompts + reference keys) + side-metrics + lsp probes
containers/   Dockerfile.{base,grove,lsp} + build/
steering/     per-repo agent steering baked into images (base + lsp)
scripts/      run-side.sh (one isolated arm run) + clone-repos + extract-transcript
.claude/      skills: runarm, judge-arm, exp-prep, lsp-setup, report-metrics
evidence/     harvested raw + readable transcripts (the definitive run data)
reports/      blind judgements + draft findings
site/         self-contained results dashboard (build.mjs feed + static viewer)
```

## Caveats

n=1 per cell — descriptive, not statistical. Single-run variance is reported, not
hidden. "Authoritative" means *faithful to what this fair pass shows*, not a
replicated scientific claim. The study's author also authors grove; the method is
built to let a skeptical reader verify fairness from the evidence shown.
