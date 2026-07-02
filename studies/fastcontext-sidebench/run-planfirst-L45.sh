#!/usr/bin/env bash
# Plan-first (recon-once) FastContext arm over L4/L5 x {redis,django,tokio}.
#   plan-first : vendored explorer + FC_PLAN_FIRST=1 (fc-planfirst-mcp.json).
#                Phase-1 recon runs ONCE per session (per cell), its plan is
#                cached and injected as a hint on every later explore call.
# Same retry-on-broken-measurement logic as run-L45-compare.sh (answer<200 chars
# or explore==0 => failed MEASUREMENT, retried; NOT a judgment gate).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="$here/out/_planfirstL45"; mkdir -p "$DST"
export FC_MCP_CFG="$here/fc-planfirst-mcp.json"
export FC_TRAJ="$here/vendor/fastcontext/.fastcontext-mcp"

run_and_archive() {  # repo rung
  local repo="$1" rung="$2"
  local cell="$rung-fastcontext-$repo"
  local try ans ex
  if [[ -f "$DST/$cell.outer.jsonl" ]]; then
    local pa pe
    pa=$(jq -r 'select(.type=="result")|.result|length' "$DST/$cell.outer.jsonl" 2>/dev/null || echo 0)
    pe=$(jq -rc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name' "$DST/$cell.outer.jsonl" 2>/dev/null | grep -c explore)
    if [[ "${pa:-0}" -ge 200 && "${pe:-0}" -ge 1 ]]; then
      echo "[plan-first] $cell: already archived (chars=$pa explore=$pe) — skip" >&2; return
    fi
  fi
  for try in 1 2 3 4; do
    ./run-fc.sh "$repo" "$rung" >/dev/null 2>&1
    ans=$(jq -r 'select(.type=="result")|.result|length' "out/$cell.outer.jsonl" 2>/dev/null || echo 0)
    ex=$(jq -rc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name' "out/$cell.outer.jsonl" 2>/dev/null | grep -c explore)
    [[ "${ans:-0}" -ge 200 && "${ex:-0}" -ge 1 ]] && break
    echo "  [plan-first $cell] attempt $try: chars=$ans explore=$ex — retrying" >&2
  done
  cp "out/$cell.outer.jsonl" "$DST/$cell.outer.jsonl"
  local k=0 s
  for s in $(ls -v "out/$cell".inner*.json 2>/dev/null); do k=$((k+1)); cp "$s" "$DST/$cell.inner$k.json"; done
  echo "[plan-first] $cell: chars=$ans explore=$ex wall=$(printf '%.0f' "$(cat out/$cell.walltime)")s inner_sidecars=$k" >&2
}

echo "===== PLAN-FIRST (recon-once): L4 + L5 x {redis,django,tokio} =====" >&2
for rung in L4 L5; do
  for repo in redis django tokio; do run_and_archive "$repo" "$rung"; done
done
echo "ALL PLAN-FIRST L45 RUNS DONE" >&2
