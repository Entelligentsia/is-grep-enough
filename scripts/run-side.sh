#!/usr/bin/env bash
# Run ONE side of one scene, foreground, headless stream-json. Deliberately
# simple: no backgrounding, no nested quoting, stderr NOT swallowed — so a
# failure is visible. Companion to extract-metrics.sh.
#
#   baseline = grove OFF (empty mcp config)
#   grove    = grove ON  (grove mcp config)
# Both sides get steering/<repo>.base.md as the repo CLAUDE.md (fair steering);
# the grove image's CLAUDE.md already carries the baked grove block.
#
# Usage:
#   scripts/run-side.sh <scene-id> <repo> <baseline|grove|lsp> [--model M] [--out DIR]
#     [--prompt FILE] [--baseline IMG] [--grove IMG] [--lsp IMG] [--mcp-config FILE]
#
#   baseline = grove OFF (empty mcp config)        — text search
#   grove    = grove ON  (grove mcp config)        — structural
#   lsp      = LSP bridge (--mcp-config required)   — semantic
# --prompt overrides the default scenes/<scene>.prompt.txt (the experiment passes
# experiment/prompts/<repo>/<rung>.txt so genesis stays out of scenes/).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"

SCENE="${1:?usage: run-side.sh <scene> <repo> <side>}"; shift
REPO="${1:?need repo}"; shift
SIDE="${1:?need side: baseline|grove|lsp}"; shift
[[ "$SIDE" == baseline || "$SIDE" == grove || "$SIDE" == lsp ]] || { echo "side must be baseline|grove|lsp" >&2; exit 2; }

MODEL=""
OUT="$root/out/l4"
BASE_IMG="grove-testbench/base:latest"
GROVE_IMG="grove-testbench/grove:v0.1.11"
LSP_IMG="grove-testbench/lsp:latest"   # official LSP plugins baked in; no per-run plugin dir
PROMPT_OVERRIDE=""
while [[ $# -gt 0 ]]; do case "$1" in
  --model)      MODEL="$2"; shift 2 ;;
  --out)        OUT="$2"; shift 2 ;;
  --prompt)     PROMPT_OVERRIDE="$2"; shift 2 ;;
  --baseline)   BASE_IMG="$2"; shift 2 ;;
  --grove)      GROVE_IMG="$2"; shift 2 ;;
  --lsp)        LSP_IMG="$2"; shift 2 ;;
  *) echo "unknown flag: $1" >&2; exit 2 ;; esac; done

command -v jq  >/dev/null || { echo "jq required" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker required" >&2; exit 1; }
PROMPT_FILE="${PROMPT_OVERRIDE:-$root/scenes/$SCENE.prompt.txt}"
[[ -f "$PROMPT_FILE" ]] || { echo "missing prompt: $PROMPT_FILE" >&2; exit 2; }
CREDS="${CLAUDE_CREDS:-$HOME/.claude/.credentials.json}"
[[ -f "$CREDS" ]] || { echo "missing creds: $CREDS" >&2; exit 1; }
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"   # docker volume mounts require an absolute path

# stage world-readable creds + mcp configs (container user bench=uid1001 can't
# read the host 0600 creds)
CFG="$OUT/.cfg"; mkdir -p "$CFG"
printf '{ "mcpServers": {} }\n' > "$CFG/empty-mcp.json"
printf '{ "mcpServers": { "grove": { "command": "grove", "args": ["serve"] } } }\n' > "$CFG/grove-mcp.json"
install -m 0644 "$CREDS" "$CFG/creds.json"   # copied into a fresh tmpfs .claude at container start

# /home/bench/.claude is a fresh PER-RUN tmpfs (mode 1777), seeded with only the
# creds. Two problems this solves at once:
#   1. The image has no /home/bench/.claude; bind-mounting the bare creds file made
#      docker create that dir owned by ROOT, so bench (uid 1001) couldn't
#      `mkdir .claude/session-env` and EVERY Bash tool call died with EACCES —
#      silently crippling the baseline into Read-only. A writable tmpfs fixes that.
#   2. claude writes config/session state into .claude (.claude.json, backups/,
#      projects/, sessions/). A shared host dir leaked that state across runs/arms,
#      and its container-uid-owned files couldn't be cleaned from the host. A tmpfs
#      is ephemeral: every cell starts from an identical clean .claude, nothing
#      persists to the host, no cross-arm contamination. (Creds copied in below.)

# LSP arm uses Claude Code's NATIVE LSP tool (a deferred built-in, like grove's
# MCP tools), configured by the OFFICIAL claude-plugins-official LSP plugins that
# are baked + enabled in the lsp image and restored into the tmpfs ~/.claude at
# start (LSP_RESTORE below). It does NOT go through MCP, so the lsp arm's MCP
# config is empty (LSP ≠ MCP). baseline/grove get no plugins, so their native LSP
# tool has no server configured and is inert — a clean control.
case "$SIDE" in
  baseline) IMG="$BASE_IMG";  CFGNAME=empty-mcp.json ;;
  grove)    IMG="$GROVE_IMG"; CFGNAME=grove-mcp.json ;;
  lsp)      IMG="$LSP_IMG";   CFGNAME=empty-mcp.json ;;   # official LSP plugins are baked in the image (see LSP_RESTORE below)
esac
CREPO="/home/bench/repos/$REPO"
OUTFILE="$OUT/$SCENE.claude.$SIDE.jsonl"

# Subagent transcripts are NOT in the stream-json: claude writes each Task/Agent
# subagent's own session to ~/.claude/projects/**/subagents/agent-*.jsonl, and the
# parent stream carries only the subagent's RETURNED result (no isSidechain steps).
# The .claude tmpfs is destroyed on --rm, so we copy those files out, from INSIDE
# the container (they are bench-owned), into a host dir the harvest step files into
# evidence/. mode 0777 so the container user can write; harmless when no subagent runs.
SADIR="$OUT/$SCENE.claude.$SIDE.subagents"
mkdir -p "$SADIR"; chmod 0777 "$SADIR"   # cleared inside the container (bench-owned files)

# fair tool steering: the two TOOLED arms are symmetric — each gets base.md plus a
# steering block that points the agent at its navigation capability (grove's block
# is baked into the image's repo CLAUDE.md by `grove init`; lsp's is the host-side
# steering/lsp-steering.md, uniform across repos since the lsp tool interface is).
# baseline gets base.md ALONE (vanilla: text search only, by design). No base file
# -> leave repo CLAUDE.md as-is (lsp still gets its steering block).
BASEMD="$root/steering/$REPO.base.md"
LSPSTEER="$root/steering/lsp-steering.md"
INJECT=":"
[[ -f "$BASEMD" ]] && cp "$BASEMD" "$CFG/base.md"
case "$SIDE" in
  grove)
    [[ -f "$BASEMD" ]] && INJECT="cat /cfg/base.md $CREPO/CLAUDE.md > /tmp/cm 2>/dev/null && cp /tmp/cm $CREPO/CLAUDE.md" ;;
  lsp)
    [[ -f "$LSPSTEER" ]] || { echo "lsp arm needs steering/lsp-steering.md (parallel to grove steering)" >&2; exit 2; }
    cp "$LSPSTEER" "$CFG/lsp-steer.md"
    if [[ -f "$BASEMD" ]]; then
      INJECT="cat /cfg/base.md /cfg/lsp-steer.md > /tmp/cm && cp /tmp/cm $CREPO/CLAUDE.md"
    else
      INJECT="cp /cfg/lsp-steer.md $CREPO/CLAUDE.md"
    fi ;;
  baseline)
    [[ -f "$BASEMD" ]] && INJECT="cp /cfg/base.md $CREPO/CLAUDE.md" ;;
esac

MODEL_ARG=(); [[ -n "$MODEL" ]] && MODEL_ARG=(--model "$MODEL")

echo "=== $SCENE / arm=$SIDE — $IMG ==="
echo "    prompt: $PROMPT_FILE"
echo "    repo dir: $CREPO   out: $OUTFILE"

# Capture step (runs after claude, regardless of its exit, so partial subagent
# transcripts survive a crash): copy every subagent session file out to /sa. Its
# stdout is sent to /dev/null so it never pollutes the stream-json on OUTFILE.
# cp without -p (the source .jsonl is 0600) then chmod a+r, so the host harvest can
# read the bench-owned copies; /sa stays on the host after --rm destroys the tmpfs.
HARVEST_SA="{ rm -rf /sa/* 2>/dev/null; find \$HOME/.claude/projects -path '*/subagents/*' -type f \\( -name '*.jsonl' -o -name '*.meta.json' \\) -exec cp {} /sa/ \\; ; chmod -R a+rX /sa; } >/dev/null 2>&1 || true"

# lsp arm: the official Claude Code LSP plugins are baked into the image, stashed
# at /opt/lsp-claude (the runtime tmpfs ~/.claude would shadow a baked
# ~/.claude/plugins). Restore the stash into the fresh tmpfs at container start,
# next to where creds are copied. Other arms get nothing, so their built-in LSP
# tool stays unconfigured/inert (clean control).
LSP_RESTORE=":"
if [[ "$SIDE" == lsp ]]; then
  LSP_RESTORE='cp -a /opt/lsp-claude/plugins /home/bench/.claude/plugins && cp /opt/lsp-claude/settings.json /home/bench/.claude/settings.json'
  echo "    lsp plugins: restored from baked /opt/lsp-claude stash"
fi

# Runaway guard (generalized from l5-watchdog.sh; mandatory for L3/L4/L5, harmless
# for L1/L2 which never approach the cutoff): run the container NAMED + backgrounded,
# poll the transcript size, and docker-kill it if it blows past WATCHDOG_MAX before a
# result event lands. A killed runaway has no result event -> DNF -> the gate WARNs.
CNAME="navrun-${SCENE}-${SIDE}-$$"
WD_MAX="${WATCHDOG_MAX:-1500000}"; WD_POLL="${WATCHDOG_POLL:-15}"
docker run --rm --name "$CNAME" \
  -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -e COLORTERM=truecolor \
  -e RACE_PROMPT="$(cat "$PROMPT_FILE")" \
  --tmpfs /home/bench/.claude:rw,mode=1777 \
  -v "$CFG:/cfg:ro" \
  -v "$SADIR:/sa" \
  "$IMG" \
  bash -lc "cp /cfg/creds.json /home/bench/.claude/.credentials.json; $LSP_RESTORE; cd $CREPO && $INJECT; claude -p \"\$RACE_PROMPT\" --output-format stream-json --verbose --dangerously-skip-permissions ${MODEL_ARG[*]} --strict-mcp-config --mcp-config /cfg/$CFGNAME; $HARVEST_SA" \
  > "$OUTFILE" &
RUNPID=$!
( while docker ps -q -f "name=^${CNAME}$" | grep -q .; do
    sz=$(stat -c%s "$OUTFILE" 2>/dev/null || echo 0)
    if (( sz > WD_MAX )) && ! grep -q '"type":"result"' "$OUTFILE" 2>/dev/null; then
      echo "    [watchdog] KILL $CNAME — transcript ${sz}B > ${WD_MAX}B (runaway DNF)" >&2
      docker kill "$CNAME" >/dev/null 2>&1; break
    fi
    sleep "$WD_POLL"
  done ) & WDPID=$!
wait "$RUNPID" 2>/dev/null || true
kill "$WDPID" 2>/dev/null || true; wait "$WDPID" 2>/dev/null || true

# report subagent transcripts captured (jsonl only; each has a sibling .meta.json)
n_sa=$(find "$SADIR" -name '*.jsonl' 2>/dev/null | wc -l)
if [[ "$n_sa" -eq 0 ]]; then rmdir "$SADIR" 2>/dev/null || true; fi

if [[ -s "$OUTFILE" ]] && grep -q '"type":"result"' "$OUTFILE"; then
  echo "    -> OK ($(wc -l <"$OUTFILE") events, $(stat -c%s "$OUTFILE") B, $n_sa subagent transcript(s))"
else
  echo "    -> WARN: no result event ($(stat -c%s "$OUTFILE" 2>/dev/null||echo 0) B, $n_sa subagent transcript(s))" >&2
fi
