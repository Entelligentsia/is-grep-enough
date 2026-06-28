---
name: lsp-setup
description: Make one repo's lsp arm ready — confirm its official LSP plugin + server are baked in the lsp image, cold-test line-exact resolution, bake a warm snapshot ONLY if cold fails, then record setup[lsp/<repo>] readiness + setup_s through the validated state CLI. Use when wiring a repo's semantic (lsp) arm. Argument is a single repo name from repos.manifest, or "status".
---

# /lsp-setup — make one repo's lsp arm ready

One invocation takes a repo's lsp arm from unwired to `setup[lsp/<repo>].ready`,
following **cold-first, bake-only-where-cold-fails** (see
[`docs/LSP_SETUP.md`](../../../docs/LSP_SETUP.md)). The validated CLI
`experiment/statectl/statectl` is the ONLY writer of `state.json` — never
Edit/Write/jq it. Genesis reference keys are read here for the verify anchor but
are NEVER shown to a running arm.

`$ARGUMENTS`:
- `status` → print `statectl status` setup lines for lsp and stop.
- `<repo>` → wire that repo. If already `ready`, re-verify (idempotent).

Resolve `<repo>` → server + official plugin from the table in `docs/LSP_SETUP.md`
(redis/bitcoin→clangd, django→pyright, typescript/webpack→tsserver,
laravel→intelephense, rails→ruby-lsp, hugo→gopls, tokio→rust-analyzer,
spring-boot→jdtls).

## Lifecycle (do in order; on a gate failure, block and stop)

### 1. Preflight — server + plugin are baked
- `docker image inspect grove-testbench/lsp:latest` succeeds. Else block "lsp image missing".
- Server on PATH + plugin enabled in the image:
  ```
  docker run --rm grove-testbench/lsp:latest bash -lc \
    'command -v <server> && python3 -c "import json;print(\"<lang>-lsp@claude-plugins-official\" in json.load(open(\"/opt/lsp-claude/settings.json\"))[\"enabledPlugins\"])"'
  ```
  Either missing → the image needs a rebuild: add the server (Layer 1) and/or
  `claude plugin install <lang>-lsp@claude-plugins-official --scope user` (Layer 3)
  to `containers/Dockerfile.lsp`, `containers/build/build-lsp.sh`, re-promote. Then continue.

### 2. Cold test — does it resolve line-exact without a baked warm?
- Pick a verify anchor: a symbol with a known definition `file:line` from the
  repo's reference key (`experiment/prompts/<repo>/L1.reference.md`), or an obvious
  cross-file symbol you can confirm in pinned source.
- Run the **agent flow** in `lsp:latest` (mirror `run-side.sh`: tmpfs `~/.claude`,
  restore `/opt/lsp-claude`, inject `steering/lsp-steering.md`, `claude -p` a
  prompt that anchors a position and asks for `goToDefinition`). Time it.
  - jdtls/java: verify via the agent flow, NOT `jdtls-probe.py` alone (the probe
    launches raw jdtls and skips the plugin/shim path).
- **Gate:** the answer must resolve the anchor **line-exact** and the run must be
  error-free. Record the wall seconds as the cold-resolve cost.

### 3. Decision — bake only if cold fails
- **Cold resolves, wall acceptable** (≈≤ 60 s) → **no bake.** `setup_s≈0`; the
  cold cost is paid per run. (tsserver ~0.6 s, jdtls ~26 s land here.)
- **Cold fails or is unacceptably slow/wrong** → **warm + bake:**
  1. Do the developer prework in a named container (clangd: `bear -- make` /
     `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` → `compile_commands.json` at repo
     root + let it background-index; toolchain servers: resolve the module graph).
  2. `docker commit <container> grove-testbench/lsp:<repo>` (the warm-source image).
  3. Add a `COPY --from=grove-testbench/lsp:<repo>` of the warm artifacts (e.g.
     `compile_commands.json` + `.cache/clangd`) to `containers/Dockerfile.lsp`,
     rebuild + re-promote `lsp:latest`.
  4. Re-run step 2 against the rebuilt image; the anchor must now resolve line-exact.
  - Clock `setup_s` = cold-server → line-exact bake time (clangd: redis ~46 min,
    bitcoin ~148 s).

### 4. Record (validated state)
```
statectl setup-set lsp/<repo> ready=true setup_s=<n> \
  index_log="<server>; cold|baked; verified <symbol>@<use> -> <def> line-exact in <wall>s"
```
Only then does `statectl next` consider that repo's lsp cells runnable.

### 5. Report
Print: `<repo>` lsp → server, cold-vs-baked, `setup_s`, the verified anchor, and
`statectl status` setup line. Note any honest limitation (e.g. jdtls cross-module
refs into dependency jars don't resolve — intra-module spine doesn't need them).

## Notes
- **Cold-first is the policy AND a finding — and the split tracks compilation.**
  Cold-resolve (no bake): tsserver, jdtls (via proxy), **pyright** (django ~17 s),
  **intelephense** (laravel ~30 s). Need a build/index warm: **clangd** (C/C++
  compile DB), **gopls** (Go toolchain + workspace), **rust-analyzer** (cargo
  index). ruby-lsp (rails) is slow/TBD. Do not bake reflexively — cold-test, record.
- The official plugins are baked once in `lsp:latest` (all 8 enabled); this skill
  is about the per-repo **server readiness**, not plugin install.
- creds at `~/.claude/.credentials.json`; the verify run injects them like `run-side.sh`.
