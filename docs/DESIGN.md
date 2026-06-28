# Experiment: navigation 3-way (text vs structural vs semantic)

**Status:** design — pre-build. Red-line this before we script.
**Supersedes:** the baseline-vs-grove runs for L2–L5 (invalidated by the Bash
EACCES harness bug, fixed in `fix/harness-bash-eacces`). L1 is re-run too for a
fully uniform same-harness matrix.

## Purpose (north star)

The deliverable is a **detailed, authoritative blog post** answering one question:
*what kind of code-introspection / code-insight tooling works best for coding
agents, and why?* Three regimes compete — text search, structural (tree-sitter),
semantic (LSP) — across a ladder of task complexity, weighed on context, time,
and operational complexity.

"Authoritative" is scoped to *what this experiment reveals* — a faithful,
mechanism-grounded characterization of a single fair pass across the ladder — not
a statistically-replicated scientific claim. **n=1 per cell** (resources fix this);
we report what we observe, explain why, and flag single-run variance honestly
rather than dressing it as significance. The bar is that a skeptical reader —
including one who knows grove's author ran the study — accepts that the method is
fair and the stated conclusions follow from the evidence shown. The thesis we
expect is a **curve, not a verdict**: which tool wins depends on task type and
complexity, and we say *which, where, and why* — bounded to this run.

## What "authoritative" demands

- **Fair harness.** Identical conditions; the only difference is the added
  capability. (The Bash fix is exactly this; the engagement gate enforces it.)
- **Pre-registered, frozen prompts.** Defined upfront, committed, unchanged once
  running. No tuning a prompt to flatter an arm.
- **Neutral framing, honest losses.** Where grove (or any arm) loses is reported
  as prominently as where it wins — the L1/L2 thin-prompt regime and the L4
  compact-subsystem over-read are *features* of the story, not omissions. The
  conclusion is "tool X fits task-type Y," never "grove wins."
- **Mechanism, not just magnitude — the "why".** For each rung we characterize
  *how* each arm changes agent behavior: where context goes, tool-call structure,
  read patterns, failure modes. A per-rung mechanism synthesis is a first-class
  deliverable; "why" is half the question.
- **Honest about n=1.** One run per cell — no replication, no significance claims,
  no population-level generalization. Single-run variance (we saw it in the
  baseline runaways) is flagged as a caveat, not papered over. Authority is
  *descriptive*: a faithful account of this pass, with mechanism to explain it.
- **Blind quality judging.** "Works best" requires the answers be *correct*, not
  just cheap. Answer grounding/completeness is judged with arm identity hidden, so
  correctness isn't graded with a thumb on the scale.

**Guiding principle:** *we don't spend tokens to save tokens.* Rigor (verify every
arm engaged as designed, no harness errors, clean evidence, blind-judged quality)
beats frugality.

## The three arms

All arms have the full bash toolkit underneath; the differentiator is the *added*
capability.

| Arm | Capability | Image | MCP |
|---|---|---|---|
| `baseline` | bash + coreutils (grep, sed, ls, find, awk…) | `grove-testbench/base` | none |
| `grove` | + grove MCP **and** CLI (tree-sitter, structural) | `grove-testbench/grove:v0.1.10` | grove |
| `lsp` | + LSP via an MCP→LSP bridge (semantic, per-language) | `grove-testbench/lsp` | one bridge/repo |

## Metrics (all weighed in the final write-up)

1. **Context cost** — `input + cache_read + cache_creation`, summed across all
   models, per side. (existing)
2. **Time cost** — `run_wall_s` (existing `duration_s`) **+ `setup_s`**, a
   one-time per-(arm,repo) cost: image build, and for LSP the server indexing
   (clangd `compile_commands.json`, rust-analyzer cargo index, jdtls import).
   Reported separately, then combined. Setup is real and gets clocked, not hidden.
3. **Complexity** — a per-arm scorecard so it's weighable, not vibes:
   `setup_steps · wiring_loc · index_wall_s_per_repo · manual_interventions ·
   claude_md_steering_lines · friction_notes`. baseline≈0; grove = install+serve;
   lsp = the expensive one (10 servers, 3 needing builds).
4. **Answer quality** — cost is meaningless if the answer is wrong. Per side:
   grounding (cites resolve line-exact vs source) and completeness (did it find
   what the prompt asked for), **blind-judged** with the arm identity stripped.
   This is what lets us say a tool "works best" rather than merely "costs least."

## The matrix

5 rungs × 3 arms × 10 repos = **150 per-side tasks**. Each is one `/runarm` unit:
run → verify → harvest, independently.

- Rungs: `L1_symbol · L2_callsites · L3_flow · L4_subsystem · L5_arch`
- Repos: `bitcoin django hugo laravel rails redis spring-boot tokio typescript webpack`
- Task id: `<rung>-<arm>-<repo>` e.g. `L3-lsp-redis`, `L1-baseline-tokio`.

**Prompts are defined upfront and committed.** 49/50 exist; redis L1 to author.
No prompt changes once running. (CLAUDE.md steering may be added per arm if the
spike shows a tool isn't used naturally — that's steering, not the task.)

## Pacing (Pro/Max, 5-hr windows)

Per-side granularity is deliberate: `/runarm next` runs **one side**, verifies,
harvests, and updates state — so a window can hold as many or as few as resources
allow, and state survives across windows. A broken LSP repo is isolated to its
own task, not a whole batch.

**Planned order (de-risk first, climb after):**
1. **Spike** — `L1-lsp-<one light repo>` (django/pyright or hugo/gopls). Gate: does
   the model reach for LSP tools *naturally*, are cites line-exact, is steering
   needed? Nothing else runs until this passes.
2. **L1 full** (30 sides) — cheapest rung; exercises all 10 LSP wirings once on the
   easiest task = full shakedown.
3. **L2 → L3 → L4 → L5**, each arm×repo. Within a rung: baseline → grove → lsp.

## `/runarm` — the orchestrator (end-to-end, managed)

`/runarm` is not a launcher that leaves you to harvest by hand — it **owns a
task's whole lifecycle** and drives it to a terminal state in one invocation.
Harvesting is already script-driven (`extract-metrics.sh`, `extract-transcript.sh`);
the orchestrator just sequences it. Think managed pipeline / state machine over a
committed task list, not a fire-and-forget run.

State: `experiment/state.json` — ordered task list, each task
`{id, rung, arm, repo, prompt, image, status, evidence, run_wall_s, setup_s,
context, engaged, verified, blocked_reason, notes}`. Status is the machine:
`pending → running → verifying → harvesting → harvested`, with `blocked` as the
off-ramp at any gate.

Commands:
- `/runarm status` — board: counts by status, next pending id, blocked items,
  running tally of results so far.
- `/runarm next [N]` — drive the next N pending tasks (default 1) end-to-end, in
  planned order. Stops early if a task blocks (so a systemic failure halts the
  line instead of poisoning the batch).
- `/runarm <id>` — drive one specific task (re-run allowed; resets it first).

**Managed lifecycle per task** (the orchestrator runs all of this; no manual step
in between):

1. **resolve** — select task (next pending, or by id); load its spec.
2. **preflight** — image present; clean container state; creds staged. For `lsp`,
   ensure the repo's bridge wiring + index are ready — build/verify if not, and
   clock it into `setup_s`.
3. **run** — `status=running`; launch the side via `run-side.sh` under the 1.5 MB
   watchdog; poll to completion or DNF; record `run_wall_s`.
4. **verify** — `status=verifying`; the gate (below). Fail → `status=blocked` +
   `blocked_reason`; stop. No harvest.
5. **harvest** — `status=harvesting`; `extract-metrics.sh` + `extract-transcript.sh`
   → `evidence/<rung>/{raw,readable}/` + metrics; record `context`, `engaged`.
6. **commit state** — `status=harvested`; write `state.json`; print one-line
   result + running tally. (Evidence files staged in the working tree; git commit
   stays a human step.)

**Verification gate** (step 4) — the direct lesson from the bash miss:

1. **Completed** — has a `result` event (not a 1.5 MB DNF).
2. **No harness error** — 0 `EACCES session-env`, no systemic tool failure.
3. **Engagement** — the arm used its capability:
   - baseline: used Bash `grep`/`find` (not degenerate Read-only).
   - grove: ≥1 `mcp__grove__*` call.
   - lsp: ≥1 LSP MCP call.
4. **(lsp) accuracy seed** — the seed symbol resolves line-exact.

## LSP infrastructure (its own prompt-driven task, gated)

One MCP→LSP bridge process per repo, configured with that language's server,
baked into `grove-testbench/lsp`. Per-repo wiring ends with a **cheap verification
run** (known symbol → go-to-def + find-refs → assert line-exact) before any rung
uses it.

| Repo | Lang | Server | Index need |
|---|---|---|---|
| django | Python | pyright | none |
| webpack, typescript | JS/TS | typescript-language-server | none |
| laravel | PHP | intelephense | none |
| rails | Ruby | ruby-lsp | light |
| hugo | Go | gopls | go modules |
| tokio | Rust | rust-analyzer | cargo index (heavy) |
| redis, bitcoin | C/C++ | clangd | compile_commands.json (build) |
| spring-boot | Java | jdtls | gradle/maven import (heavy) |

Bridge choice + heavy-index strategy: validated in the spike, then replicated.
Indexing wall-time per repo is captured as `setup_s` and feeds Time + Complexity.

## Evidence layout (extends to 3 arms)

Per rung, unchanged structure, now three sides:
`evidence/<rung>/raw/opt-<repo>-<rung>.claude.<arm>.jsonl` (+ readable, metrics).
Aggregate `evidence/<rung>.eval.json` carries `baseline / grove / lsp` per repo
plus the time + complexity columns.

## Build order

0. Author redis L1 prompt → prompt set complete & committed.
1. Write `experiment/state.json` (150 tasks, planned order) + the `/runarm` skill.
2. LSP spike (one light repo) — validate bridge wiring + natural usage.
3. Stand up + verify all 10 LSP wirings (`grove-testbench/lsp`).
4. Execute via `/runarm next`, paced across windows.

## Deliverable map (experiment → blog)

The end artifacts must compose into the post:
- **Headline answer** — the tool-vs-task-complexity curve across all 3 axes (+quality).
- **Per-rung sections** — numbers + the mechanism synthesis ("why this won here").
- **Three-axis tradeoff** — context vs time(incl. setup) vs complexity, per arm.
- **Failure-mode catalogue** — where each tool breaks, honestly.
- **Recommendation matrix** — "for task-type / complexity X, use Y."

## Open red-lines (mark up before build)

- **Blind judging mechanism** — anonymized-transcript judge pass as part of
  `/runarm` harvest, or a separate post-rung judging task?
- Verification gate items — enough? too strict?
- Planned order — L1-first shakedown vs something else.
- `setup_s` amortization — per-session re-index vs one-time baked index.
- Complexity scorecard fields.

Resolved:
- **n=1 per cell, fixed** (resources). Authority is descriptive — faithful to what
  this single pass reveals — not statistical. No replication, no variance bands.
- `/runarm` is the end-to-end orchestrator; harvest is automatic (script-driven),
  not a separate confirm step. `/runarm next` halts the line on a `blocked` task
  rather than continuing.
