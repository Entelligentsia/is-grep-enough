#!/usr/bin/env bash
# Orchestrate the L4/L5 merit-vs-coercive comparison, autonomously.
#   merit-fc     : vendored (merit) prompts — default config
#   coercive-fc  : UPSTREAM /home/boni/src/fastcontext (untouched MANDATORY grove
#                  steering) via FC_MCP_CFG + FC_TRAJ override
# Empty/broken output (answer < 200 chars) is a failed MEASUREMENT (not a gating
# decision) — retried up to 3 attempts to get a gradeable answer.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UP=/home/boni/src/fastcontext
MERIT_DIR="$here/out/_meritL45"; COERCE_DIR="$here/out/_coerciveL5"
mkdir -p "$MERIT_DIR" "$COERCE_DIR"

run_and_archive() {  # variant repo rung archive_dir  [extra env already exported]
  local variant="$1" repo="$2" rung="$3" dst="$4"
  local cell="$rung-fastcontext-$repo"
  local try ans ex
  # idempotent resume: skip a cell already archived with a valid fc-engaged answer
  if [[ -f "$dst/$cell.outer.jsonl" ]]; then
    local pa pe
    pa=$(jq -r 'select(.type=="result")|.result|length' "$dst/$cell.outer.jsonl" 2>/dev/null || echo 0)
    pe=$(jq -rc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name' "$dst/$cell.outer.jsonl" 2>/dev/null | grep -c explore)
    if [[ "${pa:-0}" -ge 200 && "${pe:-0}" -ge 1 ]]; then
      echo "[$variant] $cell: already archived (chars=$pa explore=$pe) — skip" >&2; return
    fi
  fi
  for try in 1 2 3 4; do
    ./run-fc.sh "$repo" "$rung" >/dev/null 2>&1
    ans=$(jq -r 'select(.type=="result")|.result|length' "out/$cell.outer.jsonl" 2>/dev/null || echo 0)
    ex=$(jq -rc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name' "out/$cell.outer.jsonl" 2>/dev/null | grep -c explore)
    # need a real fc-engaged answer to compare like-for-like: retry outer refusals
    # (explore==0) and broken/empty output (<200 chars). Not a judgment gate.
    [[ "${ans:-0}" -ge 200 && "${ex:-0}" -ge 1 ]] && break
    echo "  [$variant $cell] attempt $try: chars=$ans explore=$ex — retrying" >&2
  done
  cp "out/$cell.outer.jsonl" "$dst/$cell.outer.jsonl"
  local k=0 s
  for s in $(ls -v "out/$cell".inner*.json 2>/dev/null); do k=$((k+1)); cp "$s" "$dst/$cell.inner$k.json"; done
  echo "[$variant] $cell: chars=$ans explore=$(jq -rc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name' "out/$cell.outer.jsonl" 2>/dev/null | grep -c explore) wall=$(printf '%.0f' "$(cat out/$cell.walltime)")s" >&2
}

echo "===== MERIT-FC: L4 (django,tokio; redis already done) + L5 (all) =====" >&2
cp out/L4-fastcontext-redis.outer.jsonl "$MERIT_DIR/" 2>/dev/null   # redis-L4 merit done earlier
for s in out/L4-fastcontext-redis.inner*.json; do cp "$s" "$MERIT_DIR/$(basename "$s")" 2>/dev/null; done
for repo in django tokio; do run_and_archive merit "$repo" L4 "$MERIT_DIR"; done
for repo in redis django tokio; do run_and_archive merit "$repo" L5 "$MERIT_DIR"; done

echo "===== COERCIVE-FC (upstream prompts): L5 (all) =====" >&2
export FC_MCP_CFG="$UP/fc-grove-qwen35-mcp.json"
export FC_TRAJ="$UP/.fastcontext-mcp"
for repo in redis django tokio; do run_and_archive coercive "$repo" L5 "$COERCE_DIR"; done
unset FC_MCP_CFG FC_TRAJ

echo "ALL L45 COMPARE RUNS DONE" >&2
