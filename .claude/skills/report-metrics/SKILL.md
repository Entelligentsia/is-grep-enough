---
name: report-metrics
description: Render per-cell process+quality metric tables for the navigation-3way experiment, one table per rung, including only (rung,repo) cells where all three arms (baseline/grove/lsp) are harvested. Columns are turns, tool-call split (total/bash/grove/lsp/read/other/sub), wall time, context tokens, and blind judge scores. Tool totals count all tool_use in the parent transcript, which already includes subagent calls inline (parent_tool_use_id); the `sub` column breaks out how many of those were inside subagents without double-counting. Use when the user wants a metrics report, comparison table, or tool-usage breakdown over completed cells. Argument is empty/"all" (every complete rung), one or more rung ids (e.g. "L2 L3"), or "--json".
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
| sub | of Tot, how many calls were made inside subagents (a subset, NOT additive) |
| Wall(s) | `run_wall_s`, rounded |
| Ctx(k) | `context` / 1000, rounded (includes subagent token usage) |
| Grnd / Cmpl | blind judge `grounding` / `completeness` (`—` if not yet judged) |

### Subagents (the Agent tool) — already inline, never double-counted

When an arm calls the `Agent` tool, the subagent's own tool calls are **already in
the parent transcript inline**: each subagent turn is an `assistant` event tagged
with `parent_tool_use_id` (pointing at the spawning `Agent` call). So counting all
assistant `tool_use` blocks (the side-metrics.sh logic) is the COMPLETE total —
parent plus every subagent, at any `spawnDepth`. Tot / bash / grove / lsp / read /
other are already true totals with no extra work.

The `sub` column reports the subset of Tot made inside subagents (the
`parent_tool_use_id` calls); it is a breakdown OF Tot, not an addition to it. The
parent's `Agent` spawn calls themselves carry no `parent_tool_use_id`, so they
count in `other`, not `sub`.

There is also a duplicate extraction of these same events under
`evidence/nav3/<rung>/raw/subagents/<repo>-<rung>.<arm>/agent-*.jsonl` (one file
per spawn). The script deliberately **does not read those** — adding them on top
of the inline events would double-count. Verify reconciliation against
`experiment/side-metrics.sh <parent.jsonl>` (`tool_calls`/`bash_calls`/`reads`).

## Reading the Notes column (tool clarity)

- **`other=Name×N`** — itemizes the `other` bucket so Tot fully reconciles.
  `ToolSearch` is the deferred-tool loader (~1 per run, not navigation work);
  `Agent×N` is N subagent spawns.
- **`incl K subagent call(s)`** — K of this row's Tot were made inside subagents
  (already counted in Tot; this is just the breakdown, equal to the `sub` column).
- **`⚠ no grove tool` / `⚠ no LSP tool`** — a capability arm made zero capability
  calls; flag for an engagement-gate review (it may be a borderline pass).

## Conventions

- Don't edit `state.json`. If a rung shows fewer repos than expected, the missing
  repos simply don't have all three arms harvested yet — report that, don't
  fabricate rows.
- Judge scores are absent until `/judge-arm` has run for that `(rung,repo)`; the
  table shows `—` rather than blocking.
