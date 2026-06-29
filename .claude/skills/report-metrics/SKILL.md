---
name: report-metrics
description: Render per-cell process+quality metric tables for the navigation-3way experiment, one table per rung, including only (rung,repo) cells where all three arms (baseline/grove/lsp) are harvested. Columns are turns, tool-call split (total/bash/grove/lsp/read/other/sub), wall time, context tokens, and blind judge scores. Tool counts fold in subagent transcripts so arms that call the Agent tool report TRUE totals, with the `sub` column showing the folded-in count and Notes verifying transcript completeness. Use when the user wants a metrics report, comparison table, or tool-usage breakdown over completed cells. Argument is empty/"all" (every complete rung), one or more rung ids (e.g. "L2 L3"), or "--json".
---

# /report-metrics — per-cell metric tables for navigation-3way

Read-only reporting over harvested cells. Emits **one markdown table per rung**;
a `(rung,repo)` row appears **only when all three arms are `harvested`** — that
is the unit of comparison. Pure read: the ledger and the transcripts it points
at are read, never written. (`statectl` remains the only writer of `state.json`.)

## Run it

From the repo root:

```bash
python3 .claude/skills/report-metrics/scripts/report-metrics.py            # all rungs
python3 .claude/skills/report-metrics/scripts/report-metrics.py L2 L3      # named rungs
python3 .claude/skills/report-metrics/scripts/report-metrics.py --json L4  # JSON rows
```

Print the script's stdout to the user verbatim — it is already markdown tables.
Do not hand-transcribe or round the numbers.

`$ARGUMENTS`:
- empty / `all` → every rung L1–L5 (only complete ones render).
- one or more rung ids (`L1`..`L5`) → just those.
- `status` → run with no rung args; the script prints only complete rungs, which
  is itself the status of what's reportable.
- pass `--json` through for a machine-readable row array (for a downstream chart).

## Data methodology (how each column is derived)

Source of truth: `experiment/state.json` → `sides["<rung>-<arm>-<repo>"]` gives
`status`, `run_wall_s`, `context`, `evidence` (transcript path); `judge["<rung>-<repo>"].scores[arm]`
gives `grounding` + `completeness`.

Tool-call counts come from the harvested stream-json transcript using the **same
jq shape as `experiment/side-metrics.sh`** (tool_use blocks in `assistant`
events; `num_turns` from the `result` event) so they reconcile with the
engagement gate:

| Column | Source |
|---|---|
| Turns | `result.num_turns` |
| Tot | count of all `tool_use` blocks |
| bash / read | `name=="Bash"` / `name=="Read"` |
| grove | `name` starts with `mcp__grove__` |
| lsp | `name=="LSP"` (Claude Code's native LSP tool) |
| other | Tot − bash − read − grove − lsp |
| sub | of the tool calls above, how many came from subagent transcripts |
| Wall(s) | `run_wall_s`, rounded |
| Ctx(k) | `context` / 1000, rounded (includes subagent token usage) |
| Grnd / Cmpl | blind judge `grounding` / `completeness` (`—` if not yet judged) |

### Subagents (the Agent tool) — folded in, not undercounted

When an arm calls the `Agent` tool it spawns a subagent whose own tool calls live
in a SEPARATE transcript, not the parent. Those transcripts are harvested under
`evidence/nav3/<rung>/raw/subagents/<repo>-<rung>.<arm>/agent-*.jsonl` (one file
per spawn; a `.meta.json` records `agentType`/`toolUseId`). The script globs that
group dir and **adds each subagent's tool calls into the split**, so Tot / bash /
grove / lsp / read / other are true parent+subagent totals. The `sub` column is
how many of those calls came from subagents (0 for arms that spawn none). The
parent's `Agent` spawn calls themselves remain counted in `other`.

Turns stays **parent-only** (`result.num_turns`) — subagent transcripts have no
result event. Subagent tool calls are NOT line-resolved by depth; all spawns for
a cell (any `spawnDepth`) are flattened into that cell's totals.

## Reading the Notes column (tool clarity)

- **`other=Name×N`** — itemizes the `other` bucket so Tot fully reconciles.
  `ToolSearch` is the deferred-tool loader (~1 per run, not navigation work);
  `Agent×N` is N subagent spawns.
- **`+K calls from N subagent(s) folded in`** — confirms the row's split already
  includes K tool calls from N harvested subagent transcripts (N matches the
  parent's `Agent` spawn count, so the totals are complete).
- **`⚠ M/N subagent transcript(s) missing — split still undercounts`** — the arm
  spawned N subagents but only N−M transcripts were harvested; the split is folded
  as far as possible but still understates that row. Re-harvest the cell to fix.
- **`⚠ no grove tool` / `⚠ no LSP tool`** — a capability arm made zero capability
  calls; flag for an engagement-gate review (it may be a borderline pass).

## Conventions

- Don't edit `state.json`. If a rung shows fewer repos than expected, the missing
  repos simply don't have all three arms harvested yet — report that, don't
  fabricate rows.
- Judge scores are absent until `/judge-arm` has run for that `(rung,repo)`; the
  table shows `—` rather than blocking.
