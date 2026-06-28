# nav-3way judgement report — LOCKED FORMAT

Every nav-3way judgement report follows this structure. Do not vary the section
order, the scoreboard columns, or the two scoring-axis definitions — consistency
across batches is what makes the reports comparable. New observations go in
**Findings**; new columns require updating this spec first.

## Files

- **`reports/nav3-judgement.md`** — the single canonical report. Covers **every
  completed (rung,repo) cell** across all three arms. Regenerated (not appended)
  whenever cells are added or re-run, so it always reflects current evidence.
- **`reports/nav3-<scope>-judgement.md`** — optional deep-dives (e.g. a steering
  A/B on one cell). Same section order; may add a focused comparison table. These
  supplement, never replace, the canonical report.

## Required sections, in order

1. **Title + Scope** — `# nav-3way — Judgement of <cells>`. One paragraph: which
   cells, the three arms (baseline = bash/text, grove = structural MCP, lsp = native
   LSP), and `n=1 per arm-cell (descriptive, not statistical)`.
2. **Method** — the two axes (verbatim definitions below), blind grading against the
   offline reference key, every sampled cite re-verified against pinned source.
3. **Provenance** — a bullet list, REQUIRED every report: model; base image; **grove
   version per grove cell**; lsp servers; `repo_pins` SHA source; where evidence +
   judge records live. State any mixed provenance explicitly (e.g. "grove rows are
   v0.1.11; baseline/lsp are original runs").
4. **Scoreboard** — the locked table (schema below). All cells, grouped by cell.
5. **Per-cell judgement** — one short block per cell; per-arm one-liners citing the
   spine pieces hit and which cites resolved exact vs loose (with the corrected line).
6. **Findings** — cross-cell observations. Free-form; this is where analysis lives.
7. **Caveats** — the standing caveats below, plus any batch-specific ones.
8. **Footer** — `Evidence: evidence/nav3/...` and `Judge records: experiment/state.json → judge.*`.

## Locked scoreboard schema

Exactly these columns, in this order:

```
| cell | arm | ctx (tok) | wall_s | turns | tool calls | capability calls | bash | read | compl | grnd |
```

- **cell** — `<rung>-<repo>`, shown once per group (blank on the arm rows beneath).
- **arm** — `baseline` | `grove` | `lsp`.
- **ctx (tok)** — `context` from the state ledger (thousands-comma formatted).
- **wall_s** — `run_wall_s` from the state ledger (harness wall seconds).
- **turns** — `num_turns` from `side-metrics.sh`. (Note: parallel tool fans can make
  `turns` ≪ `tool calls`; `tool calls` is the honest effort measure — see L5-redis.)
- **tool calls** — `tool_calls` from `side-metrics.sh`.
- **capability calls** — the arm's own capability: grove→`grove_tools`,
  lsp→`lsp_tools`, baseline→`–`. This is the engagement-gate signal.
- **bash** / **read** — `bash_calls` / `reads` from `side-metrics.sh`.
- **compl** / **grnd** — `completeness` / `grounding` from `judge.<cell>.scores.<arm>`,
  2-decimal.

All metric columns come from `experiment/side-metrics.sh <evidence.jsonl>` over the
**current** harvested evidence; scores from the state ledger's `judge` block. Never
hand-transcribe — regenerate from source.

## Scoring axes (verbatim — do not reword)

- **completeness** (0–1) — fraction of the reference key's required-spine elements the
  answer correctly hits. Use the key's Full / Partial / Miss scale; Full = 1.00.
- **grounding** (0–1) — fraction of the answer's `file:line` citations that resolve
  **exactly** in the pinned source. Loose / off-by-several / wrong lines penalized
  proportionally. Cite *accuracy*, not cite *density* — an answer with few but exact
  cites scores high; note line-number-light answers in the verdict, don't dock grnd.

Grading is **blind** (arm label ignored) and **independent** (one judge per arm-cell,
e.g. a subagent given key + transcript + pinned source). Cites are re-verified against
`experiment/repos/<repo>`, never taken from the answer or the key.

## Standing caveats (include every report)

- **n=1 per arm-cell** — directional, not statistical.
- **Engagement gate ≠ completeness** — the run gate only checks the arm used its
  capability + no harness error; completeness/grounding come from judging.
- **Byte-watchdog is byte-based** (1.5 MB jsonl), so it does not catch token blow-ups
  whose jsonl stays small (see L5-redis baseline: 1.58 M tokens, ~270 KB jsonl).
- State the **grove version per grove cell** when batches mix versions.
