# code-analyzer-testbench

**Which code-introspection tooling serves a coding agent best — and why?**
A fair, mechanism-grounded comparison of three navigation regimes across a ladder
of task complexity, over 10 large real-world codebases.

| Regime | Capability the agent gets | How |
|---|---|---|
| **baseline** | text search | bash + coreutils + ripgrep |
| **grove** | structural | tree-sitter via the [grove](https://github.com/Entelligentsia/grove) MCP server |
| **lsp** | semantic | Claude Code's native `LSP` tool + official language plugins |

The thesis we expect is a **curve, not a verdict**: which regime wins depends on
*task type and complexity*, and the experiment says **which, where, and why** —
bounded to what one fair pass reveals (n=1 per cell, reported honestly).

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

## Status & early signal

In progress. **26 arm-cells harvested** across `L1`, `L4`, `L5` (redis, django,
bitcoin, typescript, spring-boot); judgements in
[`reports/nav3-judgement.md`](reports/nav3-judgement.md); raw + readable
transcripts in [`evidence/nav3/`](evidence/nav3).

The sharpest finding so far is on the lsp arm's **operational cost**, and it
**tracks compilation**: dynamically-typed languages (Python, PHP, JS/TS) — and
Java via an invisible-project trick — resolve **cold**, while compiled languages
(C/C++, Go, Rust) need a build/index warm spanning **0 → 46 min** plus a +7 GB
image. Semantic precision is real, but bought with a large, uneven, per-language
setup cost the other two arms don't pay. The full per-language record — exact
steps, costs, and failure modes — is the publishing data in
[`docs/LSP_COMPLEXITY.md`](docs/LSP_COMPLEXITY.md).

> The lsp arm is being standardized onto the **official Claude Code LSP plugins**
> (`clangd-lsp`, `jdtls-lsp`, …); see [`docs/LSP_SETUP.md`](docs/LSP_SETUP.md).

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
```

## Layout

```
docs/         design + methodology (DESIGN, CONTAINERS, LSP_SETUP, PROMPT_GENESIS)
experiment/   the engine: statectl (validated ledger CLI) + state.json + spine.json
              + prompts/ (frozen prompts + reference keys) + side-metrics + lsp probes
containers/   Dockerfile.{base,grove,lsp} + build/
steering/     per-repo agent steering baked into images (base + lsp)
scripts/      run-side.sh (one isolated arm run) + clone-repos + extract-transcript
.claude/      skills: runarm, judge-arm, exp-prep, lsp-setup
evidence/     harvested raw + readable transcripts (the definitive run data)
reports/      blind judgements + draft findings
```

## Caveats

n=1 per cell — descriptive, not statistical. Single-run variance is reported, not
hidden. "Authoritative" means *faithful to what this fair pass shows*, not a
replicated scientific claim. The study's author also authors grove; the method is
built to let a skeptical reader verify fairness from the evidence shown.
