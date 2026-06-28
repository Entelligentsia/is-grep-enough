# LSP arm — per-language setup runbook

How to wire one repo's **lsp** arm: install its language server, register the
official Claude Code LSP plugin, do the developer-style prework so the server
resolves correctly, **verify line-exact**, and record readiness. For the
big-picture architecture (three arm images, runtime cred injection) see
[CONTAINERS.md](CONTAINERS.md); this doc is the operational recipe per server.

## The model (read once)

The lsp arm gives the agent **semantic** navigation through Claude Code's
first-class **`LSP` tool** (goToDefinition / references / hover / workspaceSymbol).
Three things must line up:

1. **The official plugin** (thin wrapper). From the `claude-plugins-official`
   marketplace — one per language. It only tells the `LSP` tool *how to connect*
   to a server (a `.lsp.json` mapping file-extensions → a `command` on `PATH`). It
   **does not ship the server.** *"You must install the language server binary
   separately."*
2. **The server + toolchain** — we install these into the lsp image, like a
   developer would.
3. **Per-repo prework** — we set the repo up so the server answers correctly
   (compile DB, project config, workspace). This is where `setup_s` is spent and is
   the experiment's headline cost axis.

Where a server needs non-default launch (extra flags, a proxy, a specific JDK), we
put a **shim script with the server's name earlier on `PATH`** — the plugin's
`command` is the bare binary name, so the shim is transparent.

## Repo → server → plugin → install

| Repo | Lang | Server | Official plugin | Install the server (we do this) | Extra runtime |
|---|---|---|---|---|---|
| redis | C | clangd | `clangd-lsp` | `apt install clangd` | — |
| bitcoin | C++ | clangd | `clangd-lsp` | `apt install clangd` | — |
| django | Python | Pyright | `pyright-lsp` | `npm i -g pyright` | node |
| typescript | TS | typescript-language-server | `typescript-lsp` | `npm i -g typescript-language-server typescript` | node |
| webpack | JS | typescript-language-server | `typescript-lsp` | (same) | node |
| laravel | PHP | Intelephense | `php-lsp` | `npm i -g intelephense` | node |
| rails | Ruby | Ruby LSP | `ruby-lsp` | `gem install ruby-lsp` | Ruby ≥ 3.0 |
| hugo | Go | gopls | `gopls-lsp` | `go install golang.org/x/tools/gopls@latest` | Go |
| tokio | Rust | rust-analyzer | `rust-analyzer-lsp` | `rustup component add rust-analyzer` | Rust + rustup |
| spring-boot | Java | Eclipse JDT.LS | `jdtls-lsp` | jdtls + `jdtls` launcher on PATH | **JDK 21** |

## Install + enable the plugin (headless-safe, at build time)

The run is headless (`claude -p … --dangerously-skip-permissions`, no TTY). In
print mode the trust dialog is skipped, so project `extraKnownMarketplaces` never
processes — you cannot rely on an interactive `/plugin install` at run time. Bake
it at **image build** with the non-interactive CLI:

```bash
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install <lang>-lsp@claude-plugins-official --scope user
```

`--scope user` writes the `enabledPlugins` entry into `~/.claude/settings.json`
and copies the plugin into `~/.claude/plugins/cache` — both on disk in the image,
so the headless run loads them with no marketplace step. **Smoke-test** in the
built image that the server actually starts under `--dangerously-skip-permissions`
(*"LSP servers start only after you trust the workspace"* — confirm skip-perms
trusts it). `Executable not found in $PATH` in the `/plugin` Errors tab ⇒ the
server binary isn't installed.

## Per-server prework recipes (the four container-setup types)

### clangd (C / C++) — needs a real compile DB

A guessed `compile_flags.txt` makes clangd log *"Failed to compile … index may be
incomplete"* on nearly every file → a useless index. Run the **real build** to
capture the true compile DB, place it at the repo root (clangd auto-discovers it
from the workspace), let it background-index, and bake `.cache/clangd/`.

```bash
# redis (Makefile):   ~46 min — dominated by the actual build
cd /home/bench/repos/redis && bear -- make -j"$(nproc)"
# bitcoin (CMake):    ~148 s — configure only, no full make
cd /home/bench/repos/bitcoin && cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON … && cp build/compile_commands.json .
```

Optional shim: `clangd --background-index` (a `clangd` wrapper on PATH) if you
want indexing forced; not required when the DB is at the root.

### Node servers (tsserver / pyright / intelephense) — light or zero prework

Server lives in the image; the per-repo concern is project config + cold
readiness, not a baked index.

- **typescript-language-server:** the repo must have a `tsconfig`/`jsconfig` so
  tsserver runs in *project* (not *inferred*) mode — otherwise `workspace/symbol`
  is empty. `typescript` self-configures (solution tsconfigs); **webpack** needs a
  `jsconfig.json` added at the root.
- **pyright:** no persistent index (re-scans each run); scope the workspace to the
  package dir and confirm cold readiness.
- **intelephense:** indexes the workspace on open.

### jdtls (Java / spring-boot) — invisible-project under JDK 21

jdtls ≥ 1.31 needs **Java 21** to run (base ships 17). spring-boot is a 451-module
composite Gradle build — a real import is impractical and the experiment's spine is
**intra-module**. So run jdtls in **invisible-project** mode: disable gradle/maven
import and inject `java.project.addToSourcePath` for each opened file's source
root. A transparent proxy (`experiment/lsp/jdtls-noimport.py`) does both; the
`jdtls` shim launches it under JDK 21 (`experiment/lsp/jdtls-launch.sh`).

```jsonc
// the official jdtls-lsp plugin's command is `jdtls`; our PATH shim supplies
// JDK 21 + the noimport proxy transparently.
```

Limitation (record it): cross-module refs into dependency jars don't resolve (no
gradle classpath); the spine doesn't need them.

### Toolchain servers (gopls / rust-analyzer / ruby-lsp) — resolve the module graph

Install the toolchain + server, then let the server resolve the project model:
`go mod` (gopls), `cargo metadata` (rust-analyzer), bundle (ruby-lsp). Confirm
cross-file resolution before recording.

## Verify + record (the gate)

Before a repo's lsp cells may run, **prove** a known symbol resolves **line-exact**,
driving the server directly with the per-language probe (parameterized by env):

```bash
# e.g. jdtls invisible-project on spring-boot
WS=/home/bench/repos/spring-boot SEED=.../bind/Binder.java \
  DEF_LINE=72 DEF_COL=18 EXPECT=BindHandler.java EXPECT_LINE=30 \
  python3 experiment/lsp/jdtls-probe.py
# ts-probe.py (tsserver) and pyright-probe.py (pyright) follow the same shape.
```

Then record into the ledger (clock `setup_s` = cold-server → line-exact):

```bash
statectl setup-set lsp/<repo> ready=true setup_s=<n> \
  image=grove-testbench/lsp:latest \
  index_log="<server>; <what dominated>; verified <symbol>@<use> -> <def> line-exact"
```

Only then does `statectl next` consider that repo's lsp cells runnable
(`sideReady` checks `setup[lsp/<repo>].ready`). `setup_s` is itself experiment
data — clock it even though the warm artifacts are baked into the one image.

## Observed cost (why this axis matters)

| repo | server | setup_s | what dominated |
|---|---|--:|---|
| typescript | tsserver | ~1 | none — repo self-configures (cheapest) |
| spring-boot | jdtls | ~9 | JDK21+jdtls image build (one-time); runtime `addToSourcePath` ~5 s |
| bitcoin | clangd | 148 | `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS` (configure only) |
| redis | clangd | 2749 | `bear -- make` (a real build) |

≈0.6 s → 46 min: **three orders of magnitude.** Semantic precision is bought with
a large, uneven, per-language operational cost — the central result of the lsp arm.
