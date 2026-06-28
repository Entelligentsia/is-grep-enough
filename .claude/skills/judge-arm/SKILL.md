---
name: judge-arm
description: Blind-judge answer quality for harvested nav-3way experiment cells and record scores via statectl. This is the JUDGE step that /runarm deliberately leaves out — run it once a (rung,repo) cell has all three arms harvested. Use whenever the user wants to judge, score, grade, or blind-judge the experiment: a single cell (e.g. "judge L4-redis"), a whole rung ("judge L4", all repos), a whole repo ("judge redis", all rungs), or everything judgeable so far ("judge all" / "judge next"). Grades grounding + completeness per arm against the reference key with arm identity hidden, may revise a stale key, and writes the JudgeRecord. Argument is a cell-id (<rung>-<repo>), a rung (L1–L5), a repo name, "all", "next", or "status".
---

# /judge-arm — blind answer-quality judge for nav-3way cells

`/runarm` drives a cell to `harvested` and stops; quality judging is its own step
(see `experiment/DESIGN.md` metric #4). This skill performs that step: for each
fully-harvested `(rung,repo)` cell it grades the three arms' answers **blind**
(arm identity hidden) on `grounding` + `completeness` against the reference key,
then records a validated `JudgeRecord`.

The validated CLI `experiment/statectl/statectl` is the ONLY writer of
`state.json` — never Edit/Write/jq it. Run all commands from the testbench repo
root (`grove-testbench/`).

## Argument grammar (`$ARGUMENTS`)
A cell is the atomic judge unit: one `(rung,repo)` with all three arms graded
together (the blind A/B/C comparison needs the trio).

- `status` → list cells that are judge-ready (all 3 arms `harvested`) vs already
  judged, then stop. (Compute from `state.json`; see Selection below.)
- `<rung>-<repo>` (e.g. `L4-redis`) → judge that one cell.
- `<rung>` (e.g. `L4`) → every judge-ready cell at that rung, across repos.
- `<repo>` (e.g. `redis`) → every judge-ready cell for that repo, across rungs.
- `all` → every judge-ready, not-yet-judged cell.
- `next` → the first judge-ready, not-yet-judged cell in planned order
  (`spine.json` order: rung-major, then repo). Judge one and stop.

For multi-cell scopes, judge cells **one at a time**, fully (pack → blind-judge →
verify → un-blind → record → report), before moving to the next. Skip cells that
are already judged unless the user says re-judge; note skips. On a per-cell gate
failure, report it and continue to the next cell.

## Selection (which cells are judge-ready)
A cell is judge-ready iff all of `<rung>-baseline-<repo>`, `<rung>-grove-<repo>`,
`<rung>-lsp-<repo>` are `harvested` in `state.json.sides`. A cell is already
judged iff `<rung>-<repo>` exists in `state.json.judge`. Read `state.json`
directly to compute the worklist (this is ledger data, not code navigation).

## Per-cell procedure (do in order)

### 1. Preflight
- Confirm the cell is judge-ready (all 3 arms `harvested`). Else report "not
  judge-ready: missing <arms>" and stop (or skip, in a batch).
- If `<rung>-<repo>` is already in `state.json.judge`, ask before overwriting
  unless the user explicitly said re-judge.

### 2. Build the blind packet
```
python3 .claude/skills/judge-arm/scripts/judge-pack.py <rung> <repo>
```
This extracts each arm's final answer from
`evidence/nav3/<rung>/raw/<repo>-<rung>.claude.<arm>.jsonl`, scrubs identity
tells (grove/lsp/clangd/tool names → `<TOOL>`), assigns stable-random **A/B/C**
labels (not source order), and writes two files (paths printed as JSON):
- `…/<cell>.packet.md` — prompt + reference key + the three answers as A/B/C.
  This is the ONLY thing the blind judge sees.
- `…/<cell>.mapping.json` — `label_to_arm` + per-arm process metrics
  (context, turns, capability counts). **Orchestrator-only — never pass to the
  blind judge.** You hold this back and use it in step 4.

Do not read the mapping before judging if you intend to grade inline — to keep
the blind honest, prefer the subagent path below.

### 3. Blind-judge (subagent, identity hidden)
Spawn a judge subagent. Give it the **packet contents** and the pinned-source
path `experiment/repos/<repo>`, and the rubric
(`.claude/skills/judge-arm/references/rubric.md`). Do NOT give it the mapping,
the arms' names, or the raw transcripts. Instruct it to:
- grade each of A/B/C on `completeness` (required-spine coverage; Full/Partial/
  Miss per the key) and `grounding` (sample each answer's load-bearing cites and
  verify them line-exact against `experiment/repos/<repo>` **via grove tools** —
  this project's INVARIANT routes navigation through grove: `mcp__grove__symbols`/
  `definition`/`source`, `read` only as a fallback);
- return a strict JSON object: `{ "A": {grounding, completeness, verdict}, "B":
  {…}, "C": {…}, "key_revisions": [...] }`, verdicts in the register of
  `references/rubric.md`'s worked example. `key_revisions` only if grounding
  shows the *reference key itself* is stale/wrong (cite the correction); else `[]`.

For a more rigorous pass (user asks to be thorough), spawn 2–3 independent blind
judges on the same packet and reconcile divergent scores before recording; note
the panel in the cell verdict.

### 4. Un-blind and record
Read `<cell>.mapping.json`. Map the judge's A/B/C scores back to
`baseline`/`grove`/`lsp`. For each arm, fold the process/cost note from the
metrics into its verdict (turns, context, capability counts, any re-run/DNF
caveat) — this is the only place cost enters; quality was graded without it.
Write the cell-level synthesis verdict (what they agreed on, where quality vs
cost separated them, "blind-judged (anonymized A/B/C, mapping withheld)"). Keep
the thesis a curve — name the differentiator, never declare "grove wins".

Assemble the `JudgeRecord` JSON (schema + full shape in
`references/rubric.md`) and write it:
```
experiment/statectl/statectl judge-set <rung>-<repo> --json '<json>'
```
`statectl` validates with zod (`.strict()`) and stamps `ts` — don't include `ts`,
and don't add keys outside the schema. If it rejects the JSON, fix the shape and
re-run; never hand-edit `state.json`.

### 5. Report
Print the per-arm `grounding`/`completeness` line, the cell verdict, and any
`key_revisions`. In a batch, accumulate a one-line-per-cell summary at the end.

## Notes
- **Blind integrity is the point.** The whole reason for A/B/C + scrubbing is that
  "works best" must mean *correct*, not just cheap (`DESIGN.md`). If you grade
  inline, still read only the packet first and pull the mapping afterward.
- **Grounding goes through grove.** Verifying cites against `experiment/repos/<repo>`
  is a code-navigation task and obeys this repo's grove INVARIANT — use grove
  tools to resolve symbols/lines, not `grep`/whole-file `read`.
- **Honest n=1.** One run per arm; never invent replication or significance.
  Flag single-run variance (e.g. a baseline runaway) as a caveat, not a result.
- **Key revisions are first-class.** A stale key (restructured repo, wrong line)
  gets recorded in `key_revisions`, not silently worked around. See the
  `L5-spring-boot` precedent in `state.json`.
- Genesis artifacts (reference keys, rationales) are judging inputs — they are
  never shown to a *running arm*, but they ARE the judge's ground truth here.
