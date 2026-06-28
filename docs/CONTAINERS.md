# Container architecture — three stable arm images

The nav-3way experiment runs three arms (**baseline**, **grove**, **lsp**) over
10 pinned repos. Each arm is **one stable Docker image that contains all 10
repos** and everything that arm needs — *not* a per-repo image. There is exactly
one variable between the three: the **navigation capability** layered on the
shared substrate. Toolchains, repos, and the harness are identical across all
three.

This supersedes the old per-repo `lsp:<repo>` images and the retired MCP→LSP
bridge (`isaacphi/mcp-language-server`). The lsp arm now uses **Claude Code's
native `LSP` tool, configured by the official LSP plugins** from the
`claude-plugins-official` marketplace — see [LSP_SETUP.md](LSP_SETUP.md) for the
per-language setup runbook.

## The three images

All three build `FROM grove-testbench/base:latest`. **No image contains
credentials** — `~/.claude/.credentials.json` is injected at runtime into a
per-run tmpfs `.claude` by `run-side.sh`. That keeps the images publishable and
secret-free.

| Image | = | Adds | Capability the agent gets |
|---|---|---|---|
| `grove-testbench/base:latest` | `node:22-bookworm` | all 10 repos @ pinned SHAs; every language toolchain + build tool (gcc/g++/make/cmake/bear, Go, Rust, JDK, Ruby, PHP, python); git/jq/ripgrep; node + Claude Code CLI; per-repo base `CLAUDE.md` | bash + coreutils text search (this *is* the baseline arm) |
| `grove-testbench/grove:latest` | base | the `grove` binary (0.1.11); grammars pre-fetched; `grove init --as mcp` per repo (writes `.mcp.json` + grove steering `CLAUDE.md` + `grove.lock`) | structural nav via grove MCP/CLI |
| `grove-testbench/lsp:latest` | base | every LSP **server** + its language toolchain; every official LSP **plugin** installed + enabled; per-repo LSP **warm/prework** (compile DBs, indexes, workspaces); lsp steering baked into every repo `CLAUDE.md` | semantic nav via Claude Code's native `LSP` tool |

`base` already clones all 10 repos and installs all toolchains
(`Dockerfile.base`), so it is the substrate for the other two. The authed
`baseline:latest` image from the old `build-base.sh` flow is **not used** in this
model — creds are runtime-injected, so arms build straight `FROM base`.

## The lsp arm — the only complex one

The lsp arm gives the agent **semantic** navigation: the language server's own
go-to-definition / find-references / hover, resolved through the compiler's type
model. Three layers stack to make that work, and getting each repo's server to
**resolve line-exact before the agent runs** is the experiment's headline cost
axis (`setup_s`, observed spread ≈0.6 s → 46 min).

### Layer 1 — the native `LSP` tool + official plugin (the thin wrapper)

Claude Code has a first-class, built-in **`LSP` tool** (goToDefinition /
references / hover / workspaceSymbol / documentSymbol). It is configured per
language by a **plugin** that ships a `.lsp.json` (or inline `lspServers` in
`plugin.json`) mapping file extensions → a server `command` that must be on
`PATH`. We use the **official** plugins from the `claude-plugins-official`
marketplace — one per language:

| Repo | Lang | LSP server | Official plugin | Server install (we do this) | Runtime to run server |
|---|---|---|---|---|---|
| redis | C | clangd | `clangd-lsp` | `apt install clangd` | — |
| bitcoin | C++ | clangd | `clangd-lsp` | `apt install clangd` | — |
| django | Python | Pyright | `pyright-lsp` | `npm i -g pyright` | node |
| webpack | JS | typescript-language-server | `typescript-lsp` | `npm i -g typescript-language-server typescript` | node |
| typescript | TS | typescript-language-server | `typescript-lsp` | `npm i -g typescript-language-server typescript` | node |
| laravel | PHP | Intelephense | `php-lsp` | `npm i -g intelephense` | node |
| rails | Ruby | Ruby LSP | `ruby-lsp` | `gem install ruby-lsp` | Ruby ≥ 3.0 |
| hugo | Go | gopls | `gopls-lsp` | `go install golang.org/x/tools/gopls@latest` | Go |
| tokio | Rust | rust-analyzer | `rust-analyzer-lsp` | `rustup component add rust-analyzer` | Rust + rustup |
| spring-boot | Java | Eclipse JDT.LS (jdtls) | `jdtls-lsp` | install jdtls + `jdtls` launcher on PATH | **JDK 21** (jdtls ≥ 1.31 needs 21; base ships 17) |

**The plugin is a thin wrapper.** It tells the `LSP` tool *how to connect* to a
server; it does **not** ship the server. Per the official docs: *"You must
install the language server binary separately."* So **we** install each server
binary + its toolchain into the lsp image, and we do whatever per-repo prework a
developer would do so the server resolves correctly (Layer 3).

### Layer 2 — install + enable the plugins at build time (headless-safe)

The run is headless (`claude -p … --dangerously-skip-permissions`, no TTY, `--rm`
tmpfs home). In print mode the trust dialog is skipped, so project-scope
`extraKnownMarketplaces` never processes — you **cannot** rely on an interactive
`/plugin install` at run time. Instead bake it at **image-build time** with the
non-interactive CLI:

```bash
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install clangd-lsp@claude-plugins-official   --scope user
claude plugin install pyright-lsp@claude-plugins-official  --scope user
# … one per language we wire …
```

- `--scope user` writes the `enabledPlugins` entry into `~/.claude/settings.json`
  (persists across updates) and copies the plugin into the local plugin cache
  (`~/.claude/plugins/cache`). Both are on disk in the image, so the headless run
  loads them automatically — no marketplace processing needed at run time.
- Smoke-test in the built image that the server actually **starts** under
  `--dangerously-skip-permissions` (the docs note *"LSP servers start only after
  you trust the workspace"* — confirm the skip-permissions path trusts it).
- `Executable not found in $PATH` in the `/plugin` Errors tab ⇒ the server binary
  (Layer 1) is missing; install it.

### Layer 3 — per-repo developer prework (where `setup_s` is spent)

The server only answers correctly once the repo is set up the way a developer
would set it up. This is per-repo and per-language, and it is **the cost** the
experiment measures. Where a server needs non-default launch flags or a wrapper,
we put a **shim script with the server's name earlier on `PATH`** (the plugin's
`command` is the bare binary name, so the shim is transparent):

| Server | Prework (developer-style) | Shim on PATH? |
|---|---|---|
| clangd | generate the **real** `compile_commands.json` (`bear -- make` for redis, `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` for bitcoin) at the repo root; let clangd background-index; bake `.cache/clangd/`. clangd auto-discovers the DB from the workspace root. | optional (`--background-index`) |
| typescript-language-server | repo must have a `tsconfig`/`jsconfig` so tsserver runs in project (not inferred) mode. typescript self-configures (solution tsconfigs); webpack needs a `jsconfig.json` added. | no |
| pyright | scope the workspace to the package dir; pyright re-indexes per run (no persistent cache) — the per-repo concern is cold readiness, not warm. | no |
| intelephense | indexes the workspace on open; bake its index if persistent. | no |
| gopls / rust-analyzer / ruby-lsp | resolve the module graph (`go mod`, `cargo metadata`, bundle) so cross-file works. | as needed |
| jdtls (spring-boot) | 451-module Gradle build won't import — run jdtls in **invisible-project** mode (disable gradle/maven import; inject `java.project.addToSourcePath` per opened file) via the `jdtls-noimport.py` proxy, launched under **JDK 21**. The `jdtls` shim does both. | **yes** (`jdtls` → JDK21 + `jdtls-noimport.py`) |

### Layer-4 gate — verify line-exact, then record

Before a repo's lsp cells may run, **prove** the server resolves a known symbol
**line-exact**, driving the server directly with the per-language probe
(`experiment/lsp/{jdtls,ts,pyright}-probe.py`, parameterized by env). No warm, no
run. Then record into the validated state ledger:

```bash
statectl setup-set lsp/<repo> ready=true setup_s=<n> \
  image=grove-testbench/lsp:latest \
  index_log="<server>; <what dominated>; verified <symbol>@<use> -> <def> line-exact"
```

Only then does `statectl next` consider that repo's lsp cells runnable
(`sideReady` checks `setup[lsp/<repo>].ready`). **`setup_s` is the
cold-server→line-exact time** and is itself experiment data.

## Validated implementation notes (what the build actually does)

These are the mechanics proven end-to-end (clangd, tsserver, jdtls all resolve
line-exact through the real run flow):

- **Runtime stash-restore.** `run-side.sh` mounts a fresh tmpfs over `~/.claude`
  per run, which would shadow a baked `~/.claude/plugins`. So the build copies the
  installed plugins + `settings.json` to a stash **outside** `~/.claude`
  (`/opt/lsp-claude`), and the lsp arm's startup restores it into the tmpfs
  (`LSP_RESTORE` in run-side.sh), beside the creds copy. This is exactly a real
  user's `~/.claude` — ecologically valid.
- **Build gotchas.** In a `docker build` `RUN` after `USER bench`, `$HOME` is *not*
  set from `/etc/passwd` — set `ENV HOME=/home/bench` or `claude` writes to the
  wrong home and the plugin install fails. The stash dir must be created as root
  (`mkdir /opt/lsp-claude && chown bench`) before `USER bench`.
- **jdtls: the proxy must live INSIDE the `jdtls` shim.** The official `jdtls-lsp`
  plugin invokes the bare `jdtls` command, so the shim (`/usr/local/bin/jdtls`)
  itself wraps `jdtls-noimport.py` (gradle/maven import off + `addToSourcePath` per
  opened file) under JDK 21. Wired this way, jdtls resolves intra-module **cold in
  ~26 s, no baked `-data`** (`BindHandler` → `BindHandler.java:31` line-exact). The
  old hand-rolled setup put the proxy in a `.lsp.json` command; under official
  plugins it has to be the shim, or the agent gets raw jdtls attempting the doomed
  451-module Gradle import.
- **Warm policy — cold-first, set up only where cold fails.** Some servers resolve
  cold (tsserver ~0.6 s; jdtls ~26 s via the proxy); others do not. Observed so far:
  **clangd (C/C++)** needs a baked `compile_commands.json` build + index; **gopls
  (Go)** fails cold with *"no active workspace views"* and needs workspace/module
  setup. So we do *not* uniformly "warm + commit" every repo: `/lsp-setup` tests
  each server cold and only does the prework/bake when cold actually fails,
  recording `setup_s` either way (and the engagement gate must see the LSP **resolve**,
  not just be called — gopls "resolved" via the agent's file-reads, which does NOT
  count). *That the setup cost is large and uneven across servers is the finding* —
  warming everything blindly would have hidden it. Baked warm (clangd `.cache` +
  compile DB) is transplanted via `COPY --from` the per-repo warm-source images.

## Building & maintaining the images

Driven by the `/lsp-setup` skill (per-repo warm/verify/record) and the build
scripts. Structure the lsp Dockerfile so **each repo's warm is its own cached
`RUN` layer** — re-baking spring-boot must not re-run redis's 46-minute build.

- **base:** `scripts/build-base.sh` (rebuild only when the toolchain/repo set
  changes — frozen otherwise).
- **grove:** `GROVE_BIN=… scripts/build-grove.sh grove-testbench/base:latest`
  (builds `FROM base`, not the authed `baseline`).
- **lsp:** `Dockerfile.lsp` = base + all servers/toolchains + `claude plugin
  install` per language + per-repo warm layers + lsp steering. Rebuild a single
  repo's layer when its prework changes; re-verify + re-record before trusting.

## Runtime (unchanged contract)

`run-side.sh <scene> <repo> <arm>` picks the arm image (`base`/`grove`/`lsp`),
mounts creds into a tmpfs `.claude`, injects the arm's steering (or relies on the
baked `CLAUDE.md`), and runs `claude -p`. The lsp arm passes the native plugin
(no `--mcp-config`; LSP ≠ MCP). `/runarm` orchestrates one cell end-to-end on top
of this.
