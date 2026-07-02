#!/usr/bin/env bash
# Extract fastcontext-arm metrics per cell and print a TSV row.
# Outer (metered sonnet) metrics via the SAME extractor the experiment uses;
# inner (free local qwen) metrics from the FC timing sidecars.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TB_ROOT="$(cd "$here/../.." && pwd)"
OUT="$here/out"
SM="$TB_ROOT/experiment/side-metrics.sh"

printf 'cell\touter_ctx\touter_turns\texplore_calls\touter_wall_s\tinner_calls\tinner_wall_s\tinner_grove\tinner_tools\tinner_gen_tok\thas_result\n'
for repo in redis django tokio; do for rung in L1 L2 L3 L4; do
  cell="$rung-fastcontext-$repo"
  f="$OUT/$cell.outer.jsonl"
  [[ -f "$f" ]] || { printf '%s\t(not run)\n' "$cell"; continue; }
  m=$(bash "$SM" "$f" 2>/dev/null)
  octx=$(jq -r '.context_tokens' <<<"$m"); oturns=$(jq -r '.num_turns' <<<"$m")
  ocalls=$(jq -r '.mcp_nongrove_tools' <<<"$m"); hres=$(jq -r '.has_result' <<<"$m")
  owall=$(printf '%.0f' "$(cat "$OUT/$cell.walltime" 2>/dev/null || echo 0)")
  # inner: aggregate across all sidecars for this cell
  icalls=0; iwall=0; igrove=0; itools=0; igen=0
  for s in "$OUT/$cell".inner*.json; do
    [[ -f "$s" ]] || continue
    icalls=$((icalls+1))
    iwall=$(echo "$iwall + $(jq -r '.wall_ms' "$s")/1000" | bc -l)
    igrove=$((igrove + $(jq '[.turns[].tools[]? | select(.name=="Grove")] | length' "$s") ))
    itools=$((itools + $(jq '[.turns[].tools[]?] | length' "$s") ))
    igen=$((igen + $(jq '[.turns[].usage.completion_tokens] | add // 0' "$s") ))
  done
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%.0f\t%s\t%s\t%s\t%s\n' \
    "$cell" "$octx" "$oturns" "$ocalls" "$owall" "$icalls" "$iwall" "$igrove" "$itools" "$igen" "$hres"
done; done
