# code-analyzer-testbench — guide for Claude

This repo runs the **navigation-3way** experiment: a fair comparison of three
code-navigation regimes — **baseline** (text), **grove** (structural), **lsp**
(semantic) — across 5 complexity rungs × 10 pinned repos. Read
[`README.md`](README.md) for the what/why and [`docs/DESIGN.md`](docs/DESIGN.md)
for the full design. The container architecture is in
[`docs/CONTAINERS.md`](docs/CONTAINERS.md).

## Hard invariants — do not violate

1. **`statectl` is the ONLY writer of `experiment/state.json`.** Never Edit/Write/
   `jq` the ledger. Go through `experiment/statectl/statectl`
   (`register|status|next|reset|block|set-status|record|setup-set|judge-set`).
   It is zod-validated; a hand-edit will desync the schema and is a steering
   violation.

2. **Genesis artifacts are walled off from running arms.** A running arm sees only
   `experiment/prompts/<repo>/<rung>.txt` (the bare prompt). The reference keys
   (`*.reference.md`), rationale, and pinned source under `experiment/repos/` are
   **never** shown to an arm being measured. Judging reads them; running never does.

3. **Fairness is the product.** The three arms differ in exactly one thing: the
   navigation capability. Same base image, same prompt, same harness. The
   engagement gate (in `/runarm`) enforces that an arm used its capability and
   produced an error-free result, or the run is a DNF — not a pass.

4. **Reproducibility.** Repos are pinned to exact SHAs (`repos.manifest`); images
   are frozen; prompts are committed and unchanged once a cell runs. Credentials
   are injected at runtime, never baked into an image.

## Where things live

| Path | What |
|---|---|
| `experiment/statectl/` | the validated ledger CLI (`npx tsx cli.ts`; run `npm install` here once) |
| `experiment/state.json` · `spine.json` | the cell ledger + the experiment definition |
| `experiment/prompts/<repo>/` | frozen prompts + reference keys (keys are walled off) |
| `experiment/side-metrics.sh` | the per-run metric extractor (engagement gate inputs) |
| `experiment/lsp/` | LSP probes + server shims (jdtls proxy/launcher) |
| `containers/` | `Dockerfile.{base,grove,lsp}` + `build/` scripts |
| `steering/` | per-repo base + lsp steering, baked into images / injected by `run-side.sh` |
| `scripts/run-side.sh` | run one isolated arm in its container |
| `evidence/nav3/<rung>/` | harvested raw + readable transcripts |
| `reports/` | blind judgements + draft findings |

## Skills (drive the experiment — prefer these over manual steps)

- **`/runarm <cell-id>`** — take one cell (`<rung>-<arm>-<repo>`) from `pending` to
  `harvested` (or `blocked`): preflight → run → gate → harvest → record.
- **`/judge-arm <rung>-<repo>`** — blind-grade a cell's three arms once all are
  harvested; writes the judge record.
- **`/exp-prep <repo>`** — onboard a repo: clone pinned source, generate the 5
  leveled prompts + reference keys offline, register its 15 cells.
- **`/lsp-setup <repo>`** — install + warm + verify a repo's LSP server and record
  its readiness (`setup[lsp/<repo>]`). lsp cells are unrunnable until ready.

## Conventions

- **Commits:** Conventional-commit style (`feat(experiment): …`). **No
  `Co-Authored-By` / agent attribution** — author is the logged-in user only.
  Branch before committing to `master`. Files end with a newline.
- **Code navigation:** grove's structural tools are the preferred way to answer
  where-is / who-calls / what's-in questions over this codebase. They are available
  when `grove serve` is wired as an MCP server (`.mcp.json`); fall back to
  `rg`/`read` otherwise. Don't grep a whole file when an outline will do.
- **Temp files:** use a scratch dir, never commit run outputs (`out/` is ignored).
