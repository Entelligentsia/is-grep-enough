# Generator brief — author one repo's experiment resources

This is the instruction set handed to a generator subagent by `/exp-prep`. It is
repo-parametric: the skill substitutes `{{REPO}}`, `{{LANG}}`, `{{SHA}}`,
`{{REPO_PATH}}`, `{{OUT_DIR}}`, `{{ANCHOR_DIR}}`. The binding spec is
`experiment/PROMPT_GENESIS.md` — read it first; this brief is the operational form.

---

You are authoring evaluation prompts for an experiment comparing three
code-navigation regimes for coding agents — text search (grep), structural
(tree-sitter/grove), semantic (LSP) — across a task-complexity ladder. This is
OFFLINE PROMPT GENESIS for ONE repo: **{{REPO}}** ({{LANG}}). The experiment
runtime must never see this process; you produce only the final prompt text plus
offline rationale + answer keys.

## Read the spec first
Read `experiment/PROMPT_GENESIS.md` in full — it is binding. Calibrate against the
already-approved anchor set at `{{ANCHOR_DIR}}` (read its `L*.txt` and
`L*.reference.md`) so your levels match its traversal depth.

## Source
Pinned `{{REPO}}` source (byte-identical to the images) at `{{REPO_PATH}}`
(SHA {{SHA}}). Explore with ONLY standard tools — Read, Grep, Glob, Bash
(cat/sed/ls/find). Do NOT use grove or any LSP/MCP tool: prompts must emerge from
generic exploration, not a structural or semantic lens.

## What each prompt MUST be
A **sub-question an agent forms mid-task** — the code understanding it needs to
progress on a larger, unstated goal. An information NEED in goal terms.
- NOT a tool operation ("list callers", "grep for", "go to definition", "the type
  signature", "every occurrence of the string").
- NOT a full task ("fix this bug", "add a feature", "refactor X").

## Tool-neutrality (hard — every prompt)
Fair only if grep-only, grove-only, AND LSP-only agents could EACH plausibly reach
the answer (cost may differ — that's the experiment — feasibility may not). Ban
"primitive isomorphism": a prompt answerable by exactly one tool primitive. Every
prompt is grounded in real entities verified to exist at the lines you cite, and
has a checkable answer derivable from code alone (no runtime, no opinion).

## Leveling — by traversal & synthesis scope only (not tool, not phrasing)
- L1 local — one definition/declaration site; 0 hops; one concrete fact.
- L2 neighborhood — a symbol + its direct relations; 1 hop; gather & read several sites.
- L3 path — a directed chain across files; multi-hop, one path; a sequence in order.
- L4 subsystem — a bounded cooperating cluster (one feature) and how its parts relate.
- L5 cross-cutting — a concern threading multiple subsystems; whole-system.
Each level strictly exceeds the one below in the same repo; calibrate to the anchor.

## Output (write all of these)
Into `{{OUT_DIR}}` (= `experiment/prompts/{{REPO}}/`):
- `L1.txt … L5.txt` — prompt text ONLY, runtime-ready, one per file, ending in a
  newline, no headers/labels/level markers/tool hints (the runtime sees only this).
- `L1.reference.md … L5.reference.md` — the judge's answer key per level:
  **required spine** (must-hit elements, each with a verified `file:line`),
  **acceptable extras**, **common misses / wrong turns**, **completeness scale**,
  **model answer**. Tool-agnostic (code truth, not navigation path).
- `RATIONALE.md` — design provenance per level: the prompt, the larger task it
  slices, why-this-level (traversal scope + how it exceeds the level below),
  neutrality check. One-line pointer to each reference key (don't duplicate the
  answer; cites live in the keys).

## Verify before finishing
Open and re-confirm EVERY `file:line` you cite against `{{REPO_PATH}}`. Do not
carry a cite from memory. If an entity is weak, pick a better one and re-verify.

Return a concise summary: the 5 prompts (one line each), required-spine element
count per level, and any calibration concerns for the reviewer.
