# Judging rubric — nav-3way answer quality

This is the grading contract for the blind judge and the recorded `JudgeRecord`.
Two scored axes per arm (both 0–1) plus a prose `verdict`. Cost/process is NOT
graded here — it is measured separately (context, time, complexity) and only
mentioned in the verdict *after un-blinding*.

## The two axes

### `completeness` (0–1) — required-spine coverage
Did the answer hit every element of the reference key's **Required spine**? The
key defines the gradeable core ("must hit all N pieces") and a **Completeness
scale** (Full / Partial / Miss). Score:

- **1.0 = Full** — all required spine elements present and correct, including any
  distinction the prompt explicitly asks for (e.g. type-vs-encoding, the
  queue-then-flush indirection). Credit "acceptable extras" but never require them.
- **~0.6–0.9 = Partial** — names the entity and most pieces but blurs a required
  distinction or omits one required element. Use the key's Partial definition.
- **≤0.5 = Miss** — wrong entity, or only locates code without explaining the
  roles the prompt asked for.

Grade against the key's *meaning*, not its wording — an answer that reaches a
required element by a different valid path (e.g. cites a call-site where the key
cites a definition) is still complete.

### `grounding` (0–1) — do the cites resolve, line-exact
Sample the answer's **load-bearing** citations (the ones the spine rests on, not
every incidental line) and verify each against the **pinned source** at
`experiment/repos/<repo>` using grove tools. Score by cite *accuracy*, not cite
*density* — a correct line-light answer is not penalized for citing fewer lines.

- **1.0** — every sampled cite resolves exactly; no wrong turns.
- **~0.9–0.98** — cites resolve but a few are loose (off by a line or two, or a
  range slightly wide) — note which.
- **~0.8** — a structural wrong turn (routes the flow through the wrong
  function) or unsupported cites, even if the conclusion is right.
- **lower** — multiple cites don't resolve / fabricated locations.

A line-light-but-accurate answer (names classes/methods, few file:line cites, all
claims correct) keeps high grounding — accuracy, not density.

## `verdict` (prose, per arm)
One paragraph. Lead with the completeness tier (Full/Partial/Miss), then the
spine elements covered with their key cites, then grounding notes (which cites
were exact, which loose), then — added **after un-blinding** — the cost/process
note (turns, context, which capability counts, any re-run/DNF caveat). Keep the
factual register of the existing records.

## Cell-level `verdict` (prose, optional but expected)
A synthesis across the three arms: what they agreed on, where quality separated
them (usually it doesn't at completeness — it separates on grounding tightness
and on COST), and the headline of the cell. State that it was blind-judged
(anonymized A/B/C, mapping withheld). Name the cost differentiator explicitly —
the experiment's thesis is a curve ("tool X fits task-type Y"), never "grove wins".

## `key_revisions[]` (only when the key is wrong)
If grounding verification shows the *reference key itself* is stale or wrong
(e.g. the pinned repo was restructured, or a key line number is off), do NOT
silently grade around it — record the correction:

```json
{ "level": "<rung>", "reason": "<what was wrong and how you confirmed>",
  "cite": "<the corrected path/anchor>", "ts": "<YYYY-MM-DD>" }
```

This keeps the key honest for later cells. An arm is never docked for being right
where the key was wrong.

## The `JudgeRecord` JSON (what `statectl judge-set` validates)
`.strict()` — unknown keys are rejected. Shape:

```json
{
  "scores": {
    "baseline": { "grounding": 0.0-1.0, "completeness": 0.0-1.0, "verdict": "…" },
    "grove":    { "grounding": 0.0-1.0, "completeness": 0.0-1.0, "verdict": "…" },
    "lsp":      { "grounding": 0.0-1.0, "completeness": 0.0-1.0, "verdict": "…" }
  },
  "key_revisions": [ { "level": "…", "reason": "…", "cite": "…", "ts": "…" } ],
  "verdict": "cell-level synthesis"
}
```

- `scores` keyed by arm name (`baseline`/`grove`/`lsp`) — un-blinded.
- `key_revisions` optional (omit or `[]` if none).
- `ts` is stamped by the CLI — do NOT include it.
- Write with: `experiment/statectl/statectl judge-set <rung>-<repo> --json '<json>'`.
  `statectl` is the ONLY writer of `state.json` — never Edit/Write/jq it.

## Worked example (abbreviated, from L4-redis)
All three Full (completeness 1.0); the differentiator was cost, not quality.
- `baseline`: grounding 0.98 — "All four spine pieces … every sampled cite
  resolves exact … cheapest arm (310k/19 turns) via targeted grep+Read."
- `grove`: grounding 0.98 — "All four pieces … pure-structural navigation … 359k."
- `lsp`: grounding 0.97 — "All four pieces … one fewer childinfo-helper line …
  566k/29 turns, grep-anchored native LSP."
- cell verdict: "Cleanest-grounded cell measured (0.97–0.98 near-tie). The
  differentiator is COST and it inverts L5: on this bounded 3-file subsystem
  baseline's targeted grep was both fully correct and cheapest. Blind-judged."
