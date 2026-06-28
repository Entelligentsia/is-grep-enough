# code-analyzer-testbench :: lsp  (fat, all-languages semantic arm)
# ---------------------------------------------------------------------------
# The lsp arm: base + every LSP server/toolchain + every OFFICIAL Claude Code
# LSP plugin + per-repo warm artifacts. The agent gets SEMANTIC navigation via
# Claude Code's native `LSP` tool (NOT MCP). One fat image for all 10 repos —
# no per-repo images. Creds are injected at runtime; this image is secret-free.
#
# How the native LSP tool is configured: the OFFICIAL plugins from the
# `claude-plugins-official` marketplace. Each is a thin wrapper that maps a
# file-extension to a server `command` on PATH — it does NOT ship the server, so
# we install every server + toolchain ourselves (like a developer would), plus
# the per-repo prework that makes the server resolve correctly.
#
# Runtime shadowing: run-side.sh mounts a fresh tmpfs over ~/.claude, which would
# hide a baked ~/.claude/plugins. So the plugins + settings are baked into a
# STASH at /opt/lsp-claude and run-side.sh restores them into the tmpfs at
# container start (next to where it copies creds). This mirrors a real user's
# ~/.claude exactly.
#
# Build (from repo root):  containers/build/build-lsp.sh
# ---------------------------------------------------------------------------
FROM grove-testbench/base:latest
USER root

# =========================================================================
# 1. LSP SERVERS + their language runtimes (the plugins do NOT ship these)
# =========================================================================

# clangd — C / C++ (redis, bitcoin). Build tools (make/cmake/bear) are in base;
# only the per-repo build EXECUTION (the compile DB) is the warm cost below.
RUN apt-get update && apt-get install -y --no-install-recommends clangd \
    && rm -rf /var/lib/apt/lists/*

# node servers — TS/JS (typescript, webpack), Python (django), PHP (laravel).
# node + npm are in base.
RUN npm install -g typescript-language-server typescript pyright intelephense

# gopls — Go (hugo). Install straight to /usr/local/bin so the bare `gopls`
# command the plugin invokes resolves on every shell.
RUN GOBIN=/usr/local/bin /usr/local/go/bin/go install golang.org/x/tools/gopls@latest

# rust-analyzer — Rust (tokio). rustup lives system-wide in base; expose the
# component binary on PATH.
RUN rustup component add rust-analyzer \
    && ln -sf "$(rustup which rust-analyzer)" /usr/local/bin/rust-analyzer

# ruby-lsp — Ruby (rails). Ruby + gem are in base.
RUN gem install --no-document ruby-lsp \
    && ln -sf "$(ruby -e 'print Gem.bindir')/ruby-lsp" /usr/local/bin/ruby-lsp 2>/dev/null || true

# jdtls — Java (spring-boot). jdtls >= 1.31 needs Java 21 to RUN (base ships 17);
# the analysed project's own Java level is independent. A bundled JDK 21 launches
# the server; a transparent proxy forces invisible-project mode (no Gradle import
# of the 451-module composite build) and injects addToSourcePath per opened file.
ADD https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jdk_x64_linux_hotspot_21.0.11_10.tar.gz /tmp/jdk21.tar.gz
RUN mkdir -p /opt/jdk-21 && tar -xzf /tmp/jdk21.tar.gz -C /opt/jdk-21 --strip-components=1 \
    && rm /tmp/jdk21.tar.gz && /opt/jdk-21/bin/java -version
ADD https://download.eclipse.org/jdtls/milestones/1.60.0/jdt-language-server-1.60.0-202606262232.tar.gz /tmp/jdtls.tar.gz
RUN mkdir -p /opt/jdtls && tar -xzf /tmp/jdtls.tar.gz -C /opt/jdtls && rm /tmp/jdtls.tar.gz
# our jdtls shim: launches jdtls under JDK 21 via the invisible-project proxy.
# Named `jdtls` and placed on PATH so the official jdtls-lsp plugin's bare
# `jdtls` command transparently gets JDK 21 + the proxy.
COPY experiment/lsp/jdtls-noimport.py /usr/local/bin/jdtls-noimport.py
COPY experiment/lsp/jdtls-launch.sh   /usr/local/bin/jdtls
RUN chmod +x /usr/local/bin/jdtls /usr/local/bin/jdtls-noimport.py

# =========================================================================
# 2. PER-REPO WARM ARTIFACTS (the setup_s cost; baked so servers resolve cold)
# =========================================================================
# clangd needs a real compile DB + a populated index. Transplant the warmed
# artifacts from the existing per-repo images (redis = a 46-min `bear -- make`;
# bitcoin = `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS`). Regenerable via those
# commands if the source images are gone (see docs/LSP_SETUP.md).
COPY --from=grove-testbench/lsp:redis --chown=bench:bench \
     /home/bench/repos/redis/compile_commands.json /home/bench/repos/redis/compile_commands.json
COPY --from=grove-testbench/lsp:redis --chown=bench:bench \
     /home/bench/repos/redis/.cache /home/bench/repos/redis/.cache
COPY --from=grove-testbench/lsp:bitcoin --chown=bench:bench \
     /home/bench/repos/bitcoin/compile_commands.json /home/bench/repos/bitcoin/compile_commands.json
COPY --from=grove-testbench/lsp:bitcoin --chown=bench:bench \
     /home/bench/repos/bitcoin/.cache /home/bench/repos/bitcoin/.cache
# gopls (hugo): base creates GOPATH root-owned and hugo pins `go 1.26.0`, so cold
# gopls fails ("no active workspace views" — toolchain auto-download + modcache
# write both denied). Transplant the warmed, bench-owned GOPATH (go1.26 toolchain
# + hugo's full module graph from `go mod download all`, ~2.8G) so gopls loads.
COPY --from=grove-testbench/lsp:hugo --chown=bench:bench /home/bench/go /home/bench/go
# typescript self-configures; django/laravel resolve cold (no warm baked).
# webpack/tokio/rails: warmed per-repo via /lsp-setup.

# =========================================================================
# 3. OFFICIAL LSP PLUGINS — install + enable at build time, stash for runtime
# =========================================================================
RUN mkdir -p /opt/lsp-claude && chown bench:bench /opt/lsp-claude
USER bench
ENV HOME=/home/bench
RUN claude plugin marketplace add anthropics/claude-plugins-official \
 && for p in clangd-lsp typescript-lsp pyright-lsp php-lsp ruby-lsp gopls-lsp rust-analyzer-lsp jdtls-lsp; do \
        echo ">> installing $p" && claude plugin install "$p@claude-plugins-official" --scope user || exit 1; \
    done \
 && claude plugin list \
 # stash plugins + enabledPlugins OUTSIDE ~/.claude (runtime tmpfs would shadow them) \
 && cp -a /home/bench/.claude/plugins /opt/lsp-claude/plugins \
 && cp -a /home/bench/.claude/settings.json /opt/lsp-claude/settings.json

CMD ["bash"]
