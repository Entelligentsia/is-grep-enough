#!/usr/bin/env bash
# OFFLINE PROMPT-GENESIS PREP — clone every manifest repo at its pinned SHA onto
# the host so prompts can be authored against the exact source the images run.
#
# This is deliberately separate from the experiment runtime: prompt genesis must
# happen here, before any race, and the runtime must have zero visibility into
# it. The clones land in a gitignored dir and are never part of an arm's context.
#
# Byte-identical to /home/bench/repos/<name> in the images: same manifest, same
# fetch-by-sha. .git is KEPT here (host disk is cheap) so we can verify HEAD==sha.
#
# Usage: experiment/clone-source.sh [--repo NAME] [dest-dir]   (default all, experiment/repos)
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
manifest="$root/repos.manifest"
ONLY=""
if [[ "${1:-}" == "--repo" ]]; then ONLY="$2"; shift 2; fi
dest="${1:-$here/repos}"
[[ -f "$manifest" ]] || { echo "missing manifest: $manifest" >&2; exit 1; }
mkdir -p "$dest"

ok=0; fail=0
while read -r name lang url sha _rest; do
  [[ -z "${name:-}" || "${name:0:1}" == "#" ]] && continue
  [[ -n "$ONLY" && "$name" != "$ONLY" ]] && continue
  d="$dest/$name"
  # idempotent: skip if already checked out at the pinned sha
  if [[ -d "$d/.git" ]] && [[ "$(git -C "$d" rev-parse HEAD 2>/dev/null)" == "$sha" ]]; then
    echo ">> $name ($lang) @ ${sha:0:12} — already pinned, skip"; ok=$((ok+1)); continue
  fi
  echo ">> $name ($lang) @ ${sha:0:12} — cloning"
  rm -rf "$d"
  git init -q "$d"
  git -C "$d" remote add origin "$url"
  if git -C "$d" fetch -q --depth 1 origin "$sha" && git -C "$d" checkout -q FETCH_HEAD; then
    got="$(git -C "$d" rev-parse HEAD)"
    if [[ "$got" == "$sha" ]]; then echo "   OK ($got)"; ok=$((ok+1))
    else echo "   SHA MISMATCH: got $got want $sha" >&2; fail=$((fail+1)); fi
  else
    echo "   FETCH FAILED for $name" >&2; fail=$((fail+1))
  fi
done < "$manifest"

echo
echo "=== clone-source: $ok ok, $fail failed -> $dest ==="
[[ "$fail" -eq 0 ]]
