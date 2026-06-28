#!/usr/bin/env bash
# Build the fat lsp image = base + every LSP server/toolchain + every official
# Claude Code LSP plugin + per-repo warm artifacts. Builds FROM the secret-free
# base; creds are injected at runtime by run-side.sh.
#
# Requires (for the COPY --from clang warm transplant): the per-repo warm source
# images grove-testbench/lsp:{redis,bitcoin}. Those can be retired once this fat
# image is built and re-verified — its layers then own the warm artifacts.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
TAG="${1:-grove-testbench/lsp:latest}"

for src in grove-testbench/lsp:redis grove-testbench/lsp:bitcoin; do
  docker image inspect "$src" >/dev/null 2>&1 || {
    echo "missing warm-source image: $src (needed for COPY --from clang artifacts)" >&2; exit 1; }
done

echo ">> building $TAG from $root"
docker build -f "$root/containers/Dockerfile.lsp" -t "$TAG" "$root"

echo
echo "lsp built: $TAG"
echo "smoke-test:  a /lsp-setup verify, or /runarm <rung>-lsp-<repo>"
