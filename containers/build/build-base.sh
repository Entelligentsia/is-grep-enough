#!/usr/bin/env bash
# Build the publishable base image (no secrets, no grove).
# Run from anywhere; resolves the repo root from this script's location.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"

TAG="${1:-grove-testbench/base:latest}"

echo ">> building $TAG from $root"
docker build \
  -f "$root/containers/Dockerfile.base" \
  -t "$TAG" \
  "$root"

cat <<EOF

base built: $TAG   (secret-free; all 10 repos + every toolchain)

Next — build the two capability images FROM this base (creds are injected at
runtime by run-side.sh, so no authenticated image is baked):
  grove:  GROVE_BIN=../grove/target/release/grove containers/build/build-grove.sh
  lsp:    containers/build/build-lsp.sh        # servers + official LSP plugins + per-repo warm

Then run a cell:  /runarm <rung>-<arm>-<repo>   (or scripts/run-side.sh directly)
EOF
