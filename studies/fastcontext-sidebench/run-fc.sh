#!/usr/bin/env bash
# FastContext side-bench — delegation-only fastcontext arm on the HOST.
#
# For each (repo,rung): cd into the pinned clone and run Claude Code (sonnet, to
# match the grove arm) with ONLY the fastcontext `explore` MCP tool allowed
# (bash/grove/read/grep/glob denied by the whitelist). All structural navigation
# happens inside the local qwen3.5:4b that fastcontext drives — off Claude's books.
#
# Captures per cell: outer Claude stream-json, wall time, and every inner FC
# timing sidecar produced during the run.
#
# Usage: run-fc.sh [<repo> <rung>]   (no args = all 6 cells)
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TB_ROOT="$(cd "$here/../.." && pwd)"
# Vendored MCP (studies/fastcontext-sidebench/vendor/fastcontext) so the inner
# explorer's prompts (system.md, grove_steering.md) can be fine-tuned in-repo.
# Override with FC_MCP_CFG=/path to A/B a different config.
VENDOR="$here/vendor/fastcontext"
MCP_CFG="${FC_MCP_CFG:-$here/fc-vendored-mcp.json}"
# TRAJ = where the chosen MCP server writes its sidecars (next to its mcp_server.py).
# Overridable so a coercive baseline via the UPSTREAM config harvests from upstream's dir.
TRAJ="${FC_TRAJ:-$VENDOR/.fastcontext-mcp}"
OUT="$here/out"; mkdir -p "$OUT"

command -v claude >/dev/null || { echo "claude CLI required" >&2; exit 1; }
[[ -f "$MCP_CFG" ]] || { echo "missing mcp config: $MCP_CFG" >&2; exit 1; }

# Delegation steering — fair analogue of the grove arm's CLAUDE.md capability
# block. A truthful statement of the environment (no built-in tools exist here),
# NOT an answer hint. Without it, well-known repos (tokio) get answered from the
# model's parametric memory with zero explore calls — contaminating the arm.
SYS_STEER='You are running in a restricted environment with NO direct filesystem, shell, or search tools. Your ONLY way to inspect this repository is the explore tool (mcp__fastcontext__explore), which delegates to a code-navigation agent and returns file:line citations. You MUST call explore to answer any question about the code; never answer code-location questions from prior knowledge or memory. Base your final answer solely on the citations explore returns.'

run_cell() {
  local repo="$1" rung="$2"
  # Use the experiment's already-pinned repos (same SHAs as repos.manifest); no
  # separate clone under the study dir.
  local clone="$TB_ROOT/experiment/repos/$repo"
  local prompt_file="$TB_ROOT/experiment/prompts/$repo/$rung.txt"
  local cell="$rung-fastcontext-$repo"
  [[ -d "$clone/.git" ]] || { echo "MISS clone: $clone" >&2; return 1; }
  [[ -f "$prompt_file" ]] || { echo "MISS prompt: $prompt_file" >&2; return 1; }
  local prompt; prompt="$(cat "$prompt_file")"

  echo "=== $cell ===" >&2
  # Warm the model into VRAM BEFORE timing so the first cell of a batch doesn't
  # eat a ~45s Ollama cold-start load in its wall/inner-timing. keep_alive holds
  # it resident across the back-to-back cells (default evict is 5m; cells can run
  # longer, so pin it). No-op cost once loaded.
  # -m/--max-time so a transiently-wedged ollama slot can't block the run forever
  # (a skipped warmup just means the first real call pays the load; not fatal).
  curl -s -m 30 http://127.0.0.1:11434/api/generate \
    -d '{"model":"qwen3.5:4b","prompt":"ok","stream":false,"keep_alive":"30m"}' >/dev/null 2>&1 || true
  mkdir -p "$TRAJ"; rm -f "$TRAJ"/*.jsonl "$TRAJ"/*.timing.json 2>/dev/null

  # Delegation-only enforcement: --allowedTools/--disallowedTools are only
  # PERMISSION rules and the host ~/.claude settings pre-allow Bash/Read/etc., so
  # Claude bypassed explore and searched directly. `--tools ""` instead DISABLES
  # every built-in tool (they no longer exist for the session); with
  # --strict-mcp-config the ONLY surviving tool is mcp__fastcontext__explore, so
  # Claude must delegate. --allowedTools grants that one tool auto-permission
  # (no prompt in headless -p). No built-in Task/Agent => no Haiku-subagent leak.
  local s e
  s=$(date +%s.%N)
  ( cd "$clone" && timeout 900 claude -p "$prompt" \
      --model sonnet \
      --tools "" \
      --allowedTools "mcp__fastcontext__explore" \
      --append-system-prompt "$SYS_STEER" \
      --mcp-config "$MCP_CFG" --strict-mcp-config \
      --output-format stream-json --verbose \
      > "$OUT/$cell.outer.jsonl" 2> "$OUT/$cell.err" )
  e=$(date +%s.%N)
  echo "$e - $s" | bc > "$OUT/$cell.walltime"

  # harvest every inner sidecar produced during this cell (one per explore call).
  # clear this cell's OLD sidecars first, else a re-run with fewer calls leaves
  # stale inner{N}.json behind and inflates aggregates.
  rm -f "$OUT/$cell".inner*.json
  local k=0 side
  for side in $(ls -tr "$TRAJ"/*.timing.json 2>/dev/null); do
    k=$((k+1)); cp "$side" "$OUT/$cell.inner$k.json"
  done
  local lines; lines=$(wc -l < "$OUT/$cell.outer.jsonl" 2>/dev/null || echo 0)
  local ok="WARN(no result)"; grep -q '"type":"result"' "$OUT/$cell.outer.jsonl" 2>/dev/null && ok="OK"
  printf '    -> %s  outer=%s lines, inner_explore_calls=%s, wall=%.0fs\n' \
    "$ok" "$lines" "$k" "$(echo "$e - $s" | bc)" >&2
}

if [[ $# -eq 2 ]]; then
  run_cell "$1" "$2"
else
  for repo in redis django tokio; do
    for rung in L3 L4; do run_cell "$repo" "$rung"; done
  done
fi
echo "DONE" >&2
