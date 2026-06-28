#!/usr/bin/env bash
# Clone every repo in the manifest at its pinned SHA (shallow, fetch-by-sha).
# Runs INSIDE the image build. Args: <manifest> <dest-dir>
set -euo pipefail

manifest="${1:?usage: clone-repos.sh <manifest> <dest-dir>}"
dest="${2:?usage: clone-repos.sh <manifest> <dest-dir>}"
mkdir -p "$dest"

while read -r name lang url sha _rest; do
  # skip comments and blank lines
  [[ -z "${name:-}" || "${name:0:1}" == "#" ]] && continue
  d="$dest/$name"
  echo ">> $name ($lang) @ ${sha:0:12}"
  git init -q "$d"
  git -C "$d" remote add origin "$url"
  # GitHub serves arbitrary reachable commits, so depth-1 fetch-by-sha works.
  git -C "$d" fetch -q --depth 1 origin "$sha"
  git -C "$d" checkout -q FETCH_HEAD
  # Drop history to shrink the image; the pin is recorded in repos.manifest.
  # Re-stamp the SHA so it's discoverable inside the container.
  echo "$sha" > "$d/.grove-pin"
  rm -rf "$d/.git"
done < "$manifest"

echo "All repos cloned into $dest"
