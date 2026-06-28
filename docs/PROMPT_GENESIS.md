# Prompt genesis — leveling rubric & generation spec

**Walled off from runtime.** Prompts are authored here, offline, against the
pinned host clones (`experiment/repos/`, byte-identical to the images). The
experiment runtime never sees this process, the rationale docs, or the clones —
it only consumes the final prompt text. This file is the spec every generator
follows so the 50 prompts are consistent and fair.

## What a prompt IS

Each prompt is a **sub-question an agent forms mid-task** — the piece of code
understanding it needs to make progress on a larger, unstated goal. It is the
question the model would *decide to ask its tools*, lifted out of the surrounding
work.

- **Not** a tool operation. ✗ "list all callers of X", "grep for Y", "go to the
  definition of Z", "give the type signature", "every occurrence of the string".
- **Not** a full engineering task. ✗ "fix this bug", "add this feature",
  "refactor X".
- **Yes** an information need, in goal terms. ✓ "To change how retries back off, I
  need to understand where the backoff interval gets computed and what consumes
  it — walk me through that." The agent chooses how to find out.

## Tool-neutrality (hard constraints — every prompt)

A prompt is fair only if **text search, structural (tree-sitter), and semantic
(LSP) approaches could each plausibly get there**. Enforce:

1. **State the need, not the operation.** Describe what to *understand*, never how
   to look. No tool, search verb, or tool-shaped output named.
2. **No primitive isomorphism.** The prompt must not be answerable by exactly one
   tool primitive (that's the old mistake — "where defined" = one `definition`
   call). It should require *deciding* what to look at and *integrating* findings.
3. **Neutrality self-check** (record in rationale): would a grep-only agent, a
   grove-only agent, and an LSP-only agent each have a credible path? If only one
   does, the prompt is biased — rewrite. (We *expect* them to differ in cost; we
   forbid them differing in feasibility.)
4. **Grounded.** Built on real entities of the pinned source, verified to exist at
   the cited lines.
5. **Checkable answer.** A correct answer is derivable from the code alone (no
   runtime, no opinion) so it can be blind-judged later.
6. **Natural.** Reads like something a competent agent would actually ask itself.

## Leveling — by traversal & synthesis scope (NOT by tool, NOT by phrasing)

The level is **how much of the codebase must be traversed and integrated** to
answer — nothing else. Each level strictly exceeds the one below *in the same
repo*.

| L | name | scope | hops | what it demands |
|---|---|---|---|---|
| **L1** | local | one definition/declaration site | 0 | one concrete fact about one entity (its shape, location, what it is) |
| **L2** | neighborhood | a symbol + its direct relations | 1 | gather + read a symbol's callers / callees / implementors / uses |
| **L3** | path | a directed chain through several functions across files | multi, one path | follow a sequence in order, end to end |
| **L4** | subsystem | a bounded cluster of cooperating components | multi, one area | how a feature's parts interrelate; several paths, one cohesive module |
| **L5** | cross-cutting | a concern threading multiple subsystems | whole-system | integrate across modules; an end-to-end behavior across the architecture |

**Cross-repo calibration:** an L3 in redis must demand comparable traversal depth
to an L3 in django. The entities differ per repo; the scope bar is constant. The
rationale doc justifies each cell against this bar.

## Generator mechanics

- **One generator agent per repo.** Reads only the standard Claude Code tools
  (Read / Grep / Glob / Bash) over `experiment/repos/<repo>` — deliberately **not**
  grove or LSP, so prompts emerge from generic exploration and can't be
  structurally or semantically shaped. Neutrality is enforced by the rules above
  plus a review pass, not by the generator's own lens.
- The agent explores deeply, picks repo-appropriate entities per level, writes the
  five prompts + the rationale doc, and verifies every cited entity exists.
- **Pilot first** (one repo) → review against this rubric → adjust → fan out to the
  other nine.
- **Calibration pass** after generation: cross-repo level consistency + neutrality
  re-check, independent of the generators.

## Output layout (per repo)

```
experiment/prompts/<repo>/L1.txt … L5.txt          # runtime-ready prompt text (runtime sees ONLY this)
experiment/prompts/<repo>/L1.reference.md … L5.…   # the judge's answer key (offline)
experiment/prompts/<repo>/RATIONALE.md             # design provenance (offline)
```

`RATIONALE.md`, per level, records design provenance only:
- the prompt;
- the plausible larger task it is a slice of;
- **why this level** — traversal scope (sites / hops / clusters), entry ambiguity,
  synthesis required, and how it exceeds the level below;
- **neutrality check** — why text, structural, and semantic each have a path.

## Reference key (`L{n}.reference.md`) — for the judge

A **separate, gradeable answer key** the blind judge loads for exactly one cell.
Not prose-matching — a checklist of code truth so scoring is uniform across the
three arms. Per level:

- **Required spine** — the must-hit elements, each with a verified `file:line`
  (e.g. the ordered call chain, the struct's load-bearing fields, the cluster's
  components). This is what a correct answer must contain.
- **Acceptable extras** — correct-but-optional (e.g. redis L3's iothread layer,
  L5's AOF sink). Credit if present; never required.
- **Common misses / wrong turns** — so the judge scores consistently.
- **Completeness scale** — what counts as full vs partial.
- **Model answer** — a short canonical answer for reference.

Every `file:line` in the key is opened and verified against the pinned source
before it ships. The key is *correctness*-verified at genesis; it does not have to
be perfectly *complete*.

### The judge may revise the key (audited)

The key is a best-effort starting point, not frozen scripture. If, during judging,
the judge finds the key inadequate — missing a required step that an arm correctly
surfaced, or carrying an error — it has the autonomy to **rework the key**, under
four guardrails that keep it fair:

1. **Source-grounded** — any addition/correction is verified against the pinned
   code (the judge fixes ground truth, never invents to fit an answer).
2. **Logged** — the revision is appended to the key file with reason + cite (an
   audit trail; the key is living-but-recorded, never silently mutated).
3. **Applied to all arms in the cell** — if the key changes, every arm for that
   cell is scored against the *final* key, so judging order can't matter.
4. **Blind** — the judge does not know which arm produced which answer, so a
   revision is content-driven, not arm-favoring.

This replaces an expensive independent cold-solver: completeness is repaired where
it actually surfaces (under a real answer), cheaply and on the record.

## Open (red-line before generating)

- The L1–L5 scope definitions — right boundaries?
- Generator on standard tools only (no grove/LSP) — agreed?
- Output layout + rationale fields.
- Pilot repo choice (proposed: redis — small, C, well-understood, known cites).
