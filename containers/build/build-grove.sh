#!/usr/bin/env bash
# Build grove = base + grove. Stages the host `grove` binary into the build context.
# Builds FROM the secret-free base image; creds are injected at runtime by run-side.sh.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
DB_IMAGE="${1:-grove-testbench/base:latest}"
TAG="${2:-grove-testbench/grove:latest}"

# Prefer an explicit binary (e.g. the freshly-built fixed one for R2):
#   GROVE_BIN=../grove/target/release/grove scripts/build-grove.sh
grove_bin="${GROVE_BIN:-$(command -v grove || true)}"
[[ -n "$grove_bin" && -x "$grove_bin" ]] || { echo "grove binary not found (set GROVE_BIN=path or put grove on PATH)" >&2; exit 1; }
echo ">> grove version: $("$grove_bin" --version 2>/dev/null || echo '(no --version)')"

ctx="$root/.grovectx"; mkdir -p "$ctx"
cp "$grove_bin" "$ctx/grove"
cp "$root/containers/Dockerfile.grove" "$ctx/Dockerfile.grove"

echo ">> building $TAG from $DB_IMAGE (grove: $grove_bin)"
docker build --build-arg "DB_IMAGE=$DB_IMAGE" -f "$ctx/Dockerfile.grove" -t "$TAG" "$ctx"
rm -rf "$ctx"

echo
echo "grove built: $TAG"
echo "run a cell:  /runarm <rung>-<arm>-<repo>"
