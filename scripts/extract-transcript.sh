#!/usr/bin/env bash
# Render a claude stream-json (.jsonl) into a readable transcript:
# the prompt, each assistant text block and tool call in order (tool name +
# a one-line input summary), and the final result. Pure jq; no tokens.
#
# Subagents (Task/Agent): claude interleaves a subagent's own text + tool calls
# into the parent stream as events tagged `parent_tool_use_id` (= the spawning
# Agent tool_use id). We splice those UNDER their spawn, indented, so the flow
# reads cleanly: parent → ⟶ subagent {its steps} ⟹ returned → parent continues.
# (One level of nesting; a sub-subagent shows as a nested Agent line — its own
# grandchildren are not re-spliced. Rare in practice.)
#
# Usage: extract-transcript.sh <in.jsonl> [prompt-fallback] [> out.md]
set -uo pipefail
f="${1:?usage: extract-transcript.sh <in.jsonl> [prompt-fallback]}"
[[ -f "$f" ]] || { echo "no such file: $f" >&2; exit 1; }
PROMPT_FALLBACK="${2:-}"

jq -rs --arg pf "$PROMPT_FALLBACK" '
  def oneline: tostring | gsub("\n";" ") | if length>160 then .[0:157]+"..." else . end;
  def toolargs($i):
    ( $i.pattern // $i.command // $i.file_path // $i.path // $i.query
      // $i.name_path // $i.symbol // $i.description // ($i|oneline) ) // "" ;
  def renderchild:
    if .type=="text" and (.text|length>0) then "      ↳ 💬 " + (.text|oneline)
    elif .type=="tool_use" then "      ↳ " + .name + "(" + (toolargs(.input)|oneline) + ")"
    else empty end ;

  # Bucket every subagent content line under its parent_tool_use_id, in order.
  ( reduce (.[] | select(.type=="assistant" and .parent_tool_use_id != null)) as $e ({};
      ($e.parent_tool_use_id) as $pid
      | reduce ($e.message.content[]? | renderchild) as $line (. ; .[$pid] += [$line]) ) ) as $kids

  | ( [ .[] | select(.type=="user" and (.parent_tool_use_id==null)) | .message.content
        | if type=="string" then . else ([.[]? | select(.type=="text") | .text] | join(" ")) end
        | select(length>0) ] | .[0] ) as $firstprompt
  | "# transcript: " + ((($firstprompt // ($pf | select(length>0))) // "(prompt not in stream)") | oneline) + "\n"
  , ( .[]
      | select(.parent_tool_use_id == null)          # top-level only; subagent steps spliced below
      | if .type=="assistant" then
          ( .message.content[]?
            | if .type=="text" and (.text|length>0) then "\n💬 " + (.text|oneline)
              elif (.type=="tool_use" and (.name=="Agent" or .name=="Task")) then
                "\n  ▸ " + .name + "(" + (toolargs(.input)|oneline) + ")  ⟶ subagent:"
                + ( ($kids[.id] // ["      ↳ (no steps captured in stream)"]) | "\n" + join("\n") )
                + "\n      ↳ ⟹ returned to parent\n"
              elif .type=="tool_use" then "  ▸ " + .name + "(" + (toolargs(.input)|oneline) + ")"
              else empty end )
        elif .type=="result" then
          "\n──────── RESULT ("
          + (.subtype // "?") + ", " + ((.duration_ms//0|tostring)) + "ms, "
          + ((.num_turns//0|tostring)) + " turns) ────────\n"
          + (.result // "(no result text)" )
        else empty end )
' "$f"
