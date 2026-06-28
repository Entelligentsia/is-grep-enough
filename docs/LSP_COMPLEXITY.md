# LSP arm — per-language setup, cost & complexity (publishing data)

The **empirical record** of what it took to make each language's LSP server
actually resolve, line-exact, inside the experiment harness. This is the lsp
arm's defining result and a primary input to the synthesis: the other two arms
(baseline = text, grove = one uniform `grove serve`) have ~zero per-repo setup;
the lsp arm's cost is **large, uneven, and concentrated by language**.

This is the *results* doc. The *how-to* is [LSP_SETUP.md](LSP_SETUP.md); the
*architecture* is [CONTAINERS.md](CONTAINERS.md). Canonical machine-readable
values live in `experiment/state.json` → `setup[lsp/<repo>]`.

## How to read it (methodology)

- **`setup_s` (bake)** = the one-time, per-repo warm cost baked into the image
  (compile-DB build, module download, index). It does **not** count the one-time
  *image build* (installing a server/toolchain), which is shared across repos.
  Cold-resolving servers have `setup_s = 0`.
- **Cold-resolve wall** = wall time of a single agent-flow run (`claude -p`) that
  resolves the verify anchor line-exact via the LSP tool. **n=1, includes agent
  overhead** (the agent greps/reads to anchor a position before calling the LSP),
  so it is an *as-deployed* figure, not pure server latency.
- **Verify gate.** A language counts as ready only when the **LSP server itself
  resolves** the anchor (an answer the agent reached by *reading files* does not
  count — observed with cold gopls/rust-analyzer). Verified via the agent flow on
  the official plugin path; for jdtls specifically, never via the standalone probe.
- **n=1 throughout** — descriptive, not statistical. Single-run variance is real.

## Headline finding

**LSP setup cost tracks compilation.** Servers for *dynamically typed* languages
(Python/pyright, PHP/intelephense, JS-TS/tsserver) — and Java/jdtls via the
invisible-project trick — resolve **cold**, no bake. Servers for *compiled,
whole-program* languages (C/C++/clangd, Go/gopls, Rust/rust-analyzer) need a
**build/index warm** before they answer cross-file, and that warm is where the
cost concentrates: from `0` to **46 minutes**, plus a **+7 GB** image.

## Master scorecard

| repo | lang | server (version) | official plugin | extra runtime | cold-resolves? | `setup_s` bake | resolve wall (n=1) | complexity |
|---|---|---|---|---|:--:|--:|--:|---|
| typescript | TS | typescript-language-server 5.3.0 | `typescript-lsp` | node | ✅ | 0 | ~1 s | **low** — repo self-configures |
| django | Python | pyright (npm) | `pyright-lsp` | node | ✅ | 0 | ~17 s | **low** |
| laravel | PHP | intelephense (npm) | `php-lsp` | node | ✅ | 0 | ~30 s | **low** |
| spring-boot | Java | jdtls 1.60.0 (JDK 21) | `jdtls-lsp` | **JDK 21** | ✅¹ | 0 | ~26 s | **high** — proxy-in-shim + JDK layer |
| bitcoin | C++ | clangd 14.0.6 | `clangd-lsp` | — | ❌ | **148** | — | **med-high** — cmake compile DB |
| redis | C | clangd 14.0.6 | `clangd-lsp` | — | ❌ | **2749** | ~60 s | **high** — real `bear -- make` build |
| hugo | Go | gopls 0.22.0 (go 1.26) | `gopls-lsp` | **Go 1.26** | ❌ | **~300** | ~21 s | **high** — toolchain pin + root GOPATH |
| tokio | Rust | rust-analyzer 1.96.0 | `rust-analyzer-lsp` | Rust 1.96 | ❌ | **~300** | ~45 s³ | **very high** — chown caches + cargo warm; per-run index wait |
| webpack | JS | typescript-language-server 5.3.0 | `typescript-lsp` | node | ✅ | 0 | ~14 s | **low** — ships root `tsconfig.json` (same as typescript) |
| rails | Ruby | ruby-lsp 0.26.9 | `ruby-lsp` | **Ruby ≥ 3.3.1** | ❌ | *unresolved* | — | **highest** — Ruby-version pin + pre-release bundle won't resolve |

¹ jdtls resolves *intra-module* cold via the proxy; cross-module (dependency-jar)
refs do not — by design, the spine is intra-module.
³ tokio's resolve wall includes a per-run rust-analyzer index wait (it keeps no
persistent index); a first query may report "not finished indexing" and resolve on
retry.

**Image cost:** `base` 5.61 GB → `lsp:latest` **13.9 GB** (+8.3 GB for all servers +
toolchains + 8 plugins + baked warm). The compiled-language warms dominate: hugo's
GOPATH +3.7 GB, tokio's cargo+toolchain+target +1.3 GB.

## Per-language record

### typescript — typescript-language-server · `setup_s = 0` (cold)
- **Steps:** server `npm i -g typescript-language-server typescript`; plugin
  `typescript-lsp`. No per-repo prework.
- **Why cold works:** the repo ships solution-style tsconfigs
  (`src/tsconfig.json` project-refs + `src/*/tsconfig.json`), so tsserver loads
  each opened file via its owning project. Cheapest cell.
- **Verified:** `createSourceFile → src/compiler/parser.ts` line-exact.

### django — pyright · `setup_s = 0` (cold)
- **Steps:** `npm i -g pyright`; plugin `pyright-lsp`. No prework.
- **Note:** pyright keeps no persistent index (re-scans per run); historically a
  cold whole-repo query could be slow, but the workspaceSymbol path resolved in
  ~17 s here. **Verified:** `ResolverMatch → django/urls/resolvers.py:34`.

### laravel — intelephense · `setup_s = 0` (cold)
- **Steps:** `npm i -g intelephense`; plugin `php-lsp`. No prework.
- **Note:** indexes the workspace on open; resolved in ~30 s.
  **Verified:** `Illuminate\Http\Request → src/Illuminate/Http/Request.php`.

### spring-boot — jdtls 1.60 / JDK 21 · `setup_s = 0` (cold via proxy) · **complexity high**
- **Toolchain:** jdtls ≥ 1.31 needs **Java 21** to run; base ships 17. A bundled
  Adoptium JDK 21 launches the server (one-time image cost).
- **The hard part:** spring-boot is a **451-module composite Gradle build** — a
  real jdtls Gradle import is impractical/fragile. Run **invisible-project** mode:
  disable gradle/maven import + inject `java.project.addToSourcePath` per opened
  file (proxy `jdtls-noimport.py`).
- **The non-obvious failure:** the proxy **must live inside the `jdtls` shim** —
  the official `jdtls-lsp` plugin invokes the bare `jdtls` command, so a separate
  `.lsp.json` wrapper (the old hand-rolled approach) doesn't apply. A raw-jdtls
  shim attempts the 451-module import and **never resolves** (this was behind the
  ~24-min hangs).
- **Verified:** `BindHandler (Binder.java:73) → BindHandler.java:31:18` line-exact,
  ~26 s, no gradle. **Limitation:** cross-module refs into dependency jars don't
  resolve (no gradle classpath); intra-module spine doesn't need them.

### bitcoin — clangd · `setup_s = 148` (baked)
- **Steps:** `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` (wallet/gui/zmq/usdt/
  multiprocess/tests/bench/fuzz OFF; deps libboost-dev + libevent-dev) →
  `compile_commands.json` (237 TUs) at repo root; clangd `--background-index` →
  `.cache/clangd` (1655 shards, 13 MB). Baked via `COPY --from lsp:bitcoin`.
- **Cost:** 148 s — *configure only*, no full `make`. **Verified:**
  `BroadcastTransaction → node/transaction.cpp` line-exact.

### redis — clangd · `setup_s = 2749` (baked) · **the most expensive cell**
- **Steps:** a guessed compile DB makes clangd log *"Failed to compile … index may
  be incomplete"* on nearly every file → useless index. Fix: the **real build** —
  `bear -- make` — to capture true flags + generated headers →
  `compile_commands.json` (10 755 lines) + `.cache/clangd` (9.5 MB). Baked via
  `COPY --from lsp:redis`.
- **Cost:** **2749 s ≈ 46 min**, dominated by the actual build. clangd
  auto-discovers the DB from the workspace root. **Verified:**
  `dictAdd → src/dict.c:493`, `robj → src/object.h` line-exact (official clangd-lsp).

### hugo — gopls 0.22.0 / go 1.26 · `setup_s ≈ 300` (baked) · **complexity high**
- **The failure:** cold gopls returns *"no active workspace views"* and the agent
  falls back to **reading files** (which does **not** count). Two root causes:
  (1) base creates `GOPATH=/home/bench/go` **root-owned** → modcache writes
  denied; (2) hugo's `go.mod` pins **`go 1.26.0`** (base has 1.23.4) → Go tries to
  auto-download the 1.26 toolchain and fails on the same permission wall.
- **Fix / warm:** `chown -R bench:bench /home/bench/go` + `go mod download all`
  (fetches the go 1.26 toolchain + hugo's full module graph, **2.8 GB**). Baked via
  `COPY --from lsp:hugo` (+3.7 GB image).
- **Cost:** ≈300 s (module download wall). **Verified:**
  `media.Type → media/mediaType.go:36` line-exact, ~21 s.

### tokio — rust-analyzer 1.96.0 · `setup_s ≈ 300` (baked) · **complexity very high**
- **The failure:** cold, `workspaceSymbol`/`goToDefinition` return *"has not
  finished indexing"* — rust-analyzer needs a full index of a large crate graph
  (+ proc-macro builds). Same root cause family as gopls: `CARGO_HOME`/`RUSTUP_HOME`
  are **root-owned**, so the agent user can't fetch/build.
- **Fix / warm:** `chown -R bench:bench /usr/local/{cargo,rustup}` + `cargo fetch`
  (deps) + `cargo check` (build proc-macros/metadata — default features compile;
  `--all-features` has 2 errors, irrelevant to RA). Baked the cargo registry +
  rust toolchain + `tokio/target` via `COPY --from lsp:tokio` (**~930 MB →
  +1.3 GB image**).
- **Per-run caveat:** rust-analyzer keeps **no persistent index**, so even warmed it
  re-indexes in-session — a first query may say *"not finished indexing"* and
  resolve on retry. **Verified:** `Header → tokio/src/runtime/task/core.rs:168`
  line-exact, ~45 s. The bench's **worst per-run** LSP latency.

### rails — ruby-lsp 0.26.9 · **status: UNRESOLVED — the hardest case** · **complexity highest**
- **Two compounding blockers:**
  1. **Ruby-version pin.** rails' Gemfile requires **Ruby ≥ 3.3.1** (via `releaser`);
     base ships 3.1.2, so `bundle install` fails version-solving outright. Building
     Ruby 3.3.6 (ruby-build, ~98 s) clears this — but:
  2. **Pre-release bundle.** The repo is pinned to **`8.2.0.alpha`** (a `main`-branch
     commit), so even under Ruby 3.3 `bundle install` **fails to resolve** (~492 s →
     `activesupport 8.2.0.alpha` dep chain). ruby-lsp couples to the bundle and
     **crashes** without it (*"connection got disposed"* on Ruby 3.1; still
     index-stalls under 3.3).
- **Status:** not wired. ruby-lsp source-only resolution under Ruby 3.3 was attempted
  but inconclusive (index stall / bundle coupling). This is the **most operationally
  expensive and fragile** lsp setup of the bench — and a **decision point**: pinning
  rails to a *stable* tag (not `8.2.0.alpha`) would let the bundle resolve. *No
  `ready` recorded — honestly unresolved.*

### webpack — typescript-language-server 5.3.0 · `setup_s = 0` (cold)
- **Same server + plugin as typescript, and same cold behavior.** The pinned
  webpack ships a **root `tsconfig.json`** (608 `.js` + `types.d.ts`, `checkJs`),
  so tsserver project-loads the repo — no inferred-mode degradation. An earlier
  bridge-era note claimed webpack lacked a root config and needed a `jsconfig.json`;
  that is **stale** — the server and outcome are identical to typescript.
- **Verified:** `Module → lib/Module.js:243` line-exact, ~14 s.

## Cross-cutting complexity dimensions (for synthesis)

The per-language pain clusters into recurring, generalizable obstacles:

1. **Toolchain version pin.** The server needs a *specific* language runtime the
   base doesn't have — and it bit **three** of the hard repos: jdtls→**JDK 21**,
   gopls→**go 1.26** (repo-pinned), ruby-lsp/rails→**Ruby ≥ 3.3.1**. Each is a
   bespoke image layer / auto-download / source compile that must be warmed.
2. **Root-owned shared caches.** `GOPATH`/`CARGO_HOME`/`RUSTUP_HOME` are created
   root-owned by the image build; the non-root agent user can't write them → silent
   "no workspace" / "not finished indexing" failures until chowned (gopls, tokio).
3. **The server needs a real build artifact.** clangd needs a true
   `compile_commands.json` (a guess gives a useless index); the build *is* the cost.
4. **Whole-program index vs file-local.** documentSymbol (one file) is cheap
   everywhere; `workspaceSymbol`/cross-file goToDefinition need a whole-workspace
   index — fast for dynamic-language servers, expensive/slow for Go/Rust.
5. **Plugin/launch coupling.** The official plugin invokes a bare command name, so
   any custom launch (jdtls invisible-project proxy, server flags) must be a
   **PATH shim**, not plugin config.
6. **Index persistence varies.** clangd `.cache` and gopls' module graph bake
   cleanly; pyright/tsserver keep nothing (re-scan); rust-analyzer has no good
   persistent index — which decides whether a warm can even be *committed*.

## Status

**9 of 10 wired** (`setup[lsp/<repo>].ready`): typescript, webpack, django, laravel,
spring-boot, bitcoin, redis, hugo, **tokio**. Open: **rails** — blocked by a Ruby
≥ 3.3.1 pin **and** a pre-release (`8.2.0.alpha`) bundle that won't resolve; a
stable rails pin would unblock it. Figures are n=1.

**Canonical artifact.** All 9 are baked, reproducibly, into one image
(`grove-testbench/lsp:latest`, **13.9 GB**) built by `containers/build/build-lsp.sh`
— every server + the 8 official plugins + the baked warm (clang `.cache` for
redis/bitcoin, the go1.26 GOPATH for hugo, the cargo+toolchain+target for tokio,
the jdtls proxy-shim for spring-boot). Verified end-to-end on a clean build: all 9
run error-free and LSP-resolve through the real `run-side.sh` harness (e.g. hugo
gopls → `media/mediaType.go:36`, tokio rust-analyzer → `…/task/core.rs:168`, both
line-exact via LSP, not file-read fallbacks). Warm artifacts are transplanted via
`COPY --from` the per-repo warm-source images (`lsp:{redis,bitcoin,hugo,tokio}`),
retire-able once `lsp:latest` is the source of truth.
