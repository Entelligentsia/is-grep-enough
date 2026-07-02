#!/usr/bin/env bash
# Fill the coerce arm's L4 gap (upstream MANDATORY-grove config) so the four-arm
# table has a complete L4 row. Same retry-on-broken-measurement logic.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="$here/out/_coerciveL5"; mkdir -p "$DST"
export FC_MCP_CFG="/home/boni/src/fastcontext/fc-grove-qwen35-mcp.json"
export FC_TRAJ="/home/boni/src/fastcontext/.fastcontext-mcp"
for repo in redis django tokio; do
  cell="L4-fastcontext-$repo"
  for try in 1 2 3 4; do
    ./run-fc.sh "$repo" L4 >/dev/null 2>&1
    ans=$(jq -r 'select(.type=="result")|.result|length' "out/$cell.outer.jsonl" 2>/dev/null||echo 0)
    ex=$(jq -rc 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")|.name' "out/$cell.outer.jsonl" 2>/dev/null|grep -c explore)
    [[ "${ans:-0}" -ge 200 && "${ex:-0}" -ge 1 ]] && break
    echo "  [coerce-L4 $cell] attempt $try: chars=$ans explore=$ex — retrying" >&2
  done
  cp "out/$cell.outer.jsonl" "$DST/$cell.outer.jsonl"
  k=0; for s in $(ls -v "out/$cell".inner*.json 2>/dev/null); do k=$((k+1)); cp "$s" "$DST/$cell.inner$k.json"; done
  echo "[coerce-L4] $cell: chars=$ans explore=$ex wall=$(printf '%.0f' "$(cat out/$cell.walltime)")s" >&2
done
echo "COERCE-L4 DONE" >&2
