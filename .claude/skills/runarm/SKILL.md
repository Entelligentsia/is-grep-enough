---
name: runarm
description: Orchestrate one navigation-3way experiment cell end-to-end — preflight, run the arm in its container, verify the engagement+error gate, harvest evidence, and record metrics through the validated state CLI. Argument is a cell-id (<rung>-<arm>-<repo>, e.g. L1-grove-redis), or "next" (next runnable pending in planned order), or "status". Drives one cell to a terminal state (harvested or blocked) in one invocation.
---

# /runarm — managed driver for one experiment cell

One invocation takes a cell from `pending` to `harvested` (or `blocked`) with no
manual steps in between. The validated CLI `experiment/statectl/statectl` is the
ONLY writer of `state.json` — never Edit/Write/jq it.

`$ARGUMENTS`:
- `status` → print `statectl status` and stop.
- `next` → `id=$(statectl next)`; if empty, report "nothing runnable" and stop.
- `<cell-id>` → that cell. If it is already `harvested`/`running`, `statectl reset <id>` first (explicit re-run).

Parse `<rung>-<arm>-<repo>` (repo may contain `-`, e.g. spring-boot): first token
rung, second arm, rest repo. Read the arm's config from `experiment/spine.json`
(`image`, `mcp`, `needs_index`).

## Lifecycle (do in order; on any gate failure, block and stop)

### 1. Preflight
- Prompt exists: `experiment/prompts/<repo>/<rung>.txt`. Else `statectl block <id> "no prompt (repo not prepped)"`.
- Image present: `docker image inspect <arm.image>` succeeds. Else block "image missing: <image>".
- If `arm.needs_index` (lsp): require `statectl status` to show `setup[<arm>/<repo>].ready` (the per-repo warm + line-exact verify recorded by `/lsp-setup`). Not ready → block "lsp not warmed/verified for <repo>". (Servers that resolve cold are marked ready by `/lsp-setup` with `setup_s≈0`; only C/C++ needs a baked clang index.)
- No stale race containers for this repo; creds at `~/.claude/.credentials.json`.

### 2. Run
- `statectl set-status <id> running`.
- Scene label `<repo>-<rung>`, staging dir `out/exp` (gitignored).
- Invoke, capturing wall time:
  ```
  scripts/run-side.sh <repo>-<rung> <repo> <arm> --model sonnet --out out/exp \
    --prompt experiment/prompts/<repo>/<rung>.txt \
    [--grove <arm.image>   # arm=grove ]
    [--lsp <arm.image>     # arm=lsp; official LSP plugins are baked into the image ]
  ```
  baseline needs no image flag (default base). Record wall seconds.
- **Runaway guard:** rungs L3/L4/L5 must run under the 1.5 MB watchdog (`spine.watchdog`).
  L1/L2 are small and run without. (Generic watchdog is wired before the first L3 cell.)

### 3. Verify gate — from `experiment/side-metrics.sh out/exp/<repo>-<rung>.claude.<arm>.jsonl`
Block (with reason) and stop if any fail; do NOT harvest:
- `has_result == true` — else "DNF / no result event". (`has_result` now requires
  `is_error == false`; a mid-response API failure lands a result event with
  `is_error == true` and a misleading `subtype:"success"` — that is a DNF, not a pass.)
- `is_error == false` — else "DNF: API/harness error in result (e.g. Connection closed mid-response)".
- `eacces == 0` — else "harness error: Bash EACCES (session-env)". (The bug that invalidated L2–L5.)
- **Engagement** — the arm used its capability:
  - baseline → `bash_calls > 0` (used shell search, not degenerate Read-only)
  - grove → `grove_tools > 0`
  - lsp → `lsp_tools > 0` (the lsp arm uses Claude Code's NATIVE LSP tool,
    `name=="LSP"` in the transcript, counted as `lsp_tools`. `mcp_nongrove_tools`
    is legacy/bridge-era only and is always 0 on current lsp runs — do NOT gate on it.)
  else "no engagement: <arm> did not use its capability".

### 4. Harvest (only after the gate passes)
- `mkdir -p evidence/nav3/<rung>/{raw,readable}`
- raw: copy `out/exp/<repo>-<rung>.claude.<arm>.jsonl` → `evidence/nav3/<rung>/raw/`
- **subagents (if any):** if `out/exp/<repo>-<rung>.claude.<arm>.subagents/` exists and is
  non-empty, copy it to `evidence/nav3/<rung>/raw/subagents/<repo>-<rung>.<arm>/`. These are
  each Task/Agent subagent's OWN tool-by-tool session (`agent-*.jsonl` + `.meta.json`) — they
  are NOT in the parent stream-json (which carries only the subagent's returned result), and
  the `.claude` tmpfs is destroyed on `--rm`, so this is the only copy. `run-side.sh` prints
  the count in its OK/WARN line; harvest whatever it captured.
- readable: `scripts/extract-transcript.sh <raw> "$(cat experiment/prompts/<repo>/<rung>.txt)" > evidence/nav3/<rung>/readable/<repo>-<rung>.claude.<arm>.md`
- metrics (from side-metrics JSON):
  ```
  statectl record <id> context=<context_tokens> run_wall_s=<duration_s> engaged=true \
    evidence="evidence/nav3/<rung>/raw/<repo>-<rung>.claude.<arm>.jsonl"
  statectl set-status <id> harvested
  ```

### 5. Report
Print: `<id>` result line (context, run_wall_s, turns, tool_calls, the engagement counts), and `statectl status --repo <repo>`. If a (rung,repo) now has all three arms `harvested`, note that it is ready for judging (judging is a separate step).

## Notes
- **MCP route first** when testing a fresh (rung,repo): run the `grove` arm before
  `baseline`, to exercise the MCP plumbing under the fixed harness early.
- **LSP** stays `blocked`/unrunnable until `/lsp-setup <repo>` has warmed (where
  needed) + line-exact-verified its server and set `setup[lsp/<repo>].ready` — by
  design. The official LSP plugins are baked into `lsp:latest`; readiness is about
  the per-repo server resolving, not a plugin/bridge config path.
- Genesis artifacts (`experiment/prompts/<repo>/*`, reference keys) are NEVER shown
  to a running arm; only `<rung>.txt` is passed as the prompt.
