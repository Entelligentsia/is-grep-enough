---
name: dashboard
description: Resume the multi-session is-grep-enough dashboard build from the last checkpoint. Reads the persisted task ledger (docs/DASHBOARD_BUILD.md), takes the next unchecked task to a working+committed state per the engagement protocol, then checks it off and advances the checkpoint. Use whenever the user wants to continue, resume, or work on the results dashboard / is-grep-enough site. Argument is empty/"next" (do the next task), "status" (report only), a task id like "T1.3", or "continue" (run several tasks).
---

# /dashboard — resume the is-grep-enough dashboard build

The dashboard is built across many sessions. The persisted ledger
[`docs/DASHBOARD_BUILD.md`](../../../docs/DASHBOARD_BUILD.md) is the checkpoint:
checked boxes are done, the first unchecked box in phase order is next. The build
contract is [`docs/DASHBOARD_SPEC.md`](../../../docs/DASHBOARD_SPEC.md).

`$ARGUMENTS`:
- empty or `next` → do the **next unchecked task** (one task).
- `status` → print the checkpoint, completed/remaining counts per phase, current
  feed coverage (`node site/build.mjs` summary), and the next task. Stop.
- `T<n.m>` (e.g. `T1.3`) → do that specific task.
- `continue` → do tasks in order until blocked or told to stop (still commit
  per task).

## Procedure

1. **Read the ledger** `docs/DASHBOARD_BUILD.md`. Identify the target task (per
   `$ARGUMENTS`). For `status`, report and stop.
2. **Load context.** Re-read the spec section(s) the task cites. Read the files it
   touches (`site/build.mjs`, `site/app.mjs`, `site/index.html`, `site/style.css`,
   `scripts/render-transcript.mjs`). Prefer grove structural tools for
   where-is/who-calls over reading whole files.
3. **Implement** the task, following the **Engagement protocol** section of the
   ledger verbatim (spec-is-law, truthbound, vanilla stack, read-only over the
   ledger, incremental). Honor the hard invariants in `CLAUDE.md` — never write
   `state.json` directly; `statectl` is its only writer.
4. **Verify.** Rebuild the feed
   (`node site/build.mjs --sha "$(git rev-parse --short HEAD)" --at "<iso>"`) and
   serve `site/` locally; confirm the feature renders against real evidence,
   including at least one partial/incomplete cell. Do not proceed on unrun code.
5. **Checkpoint.** Tick the task `[x]` in the ledger, advance the **Checkpoint:**
   line to the next unchecked task, and commit
   (`feat(dashboard): …`; no `Co-Authored-By`; branch first if on `master` per
   project convention).
6. **Report** what was done, the new checkpoint, and the next task. Stop after one
   task unless `$ARGUMENTS` is `continue`.

## Notes

- The 64 pending experiment cells are **not** dashboard tasks — they are data,
  produced by `/runarm` + `/judge-arm`, and the dashboard already renders them
  flagged as they accrue. Don't conflate the two backlogs.
- If the next task is blocked by a cross-cutting `TX.*` item (e.g. T1.2 needs the
  §3.3 feed split TX.1), do the `TX.*` first and note it.
