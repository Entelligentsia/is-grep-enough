# GI-5 — grove indexes generated declaration files (`.d.ts`), steering answers to the wrong file

## Summary

grove indexes machine-generated declaration artifacts (`*.d.ts`, `types.d.ts`)
as if they were source. `symbols`/`definition`/`callers` then point the agent at
generated decls instead of the real implementation, so on "find all call sites"
the agent answers from the wrong file and drops real call sites — a major recall
loss. Confirmed in **2 repos** (TypeScript, webpack) on the L2 call-sites task.

## Reproduction

- **grove:** `0.1.5` @ `fd949ad` (`../grove/target/release/grove`), grammars from
  the grove-registry, run via `grove serve` as an MCP server to Claude (`sonnet`).
- **TypeScript** — repo `microsoft/TypeScript` @ `8ef3e2f3d43c8c92bda9510c47f7d4d2b3aeca33`
  - prompt: *Where is `Scanner` defined, and list every place it is referenced or
    called across the source tree, with file and line.*
- **webpack** — repo `webpack/webpack` @ `ff19f174abd5e3dbbfd91a355034b0b15b2a1b01`
  - prompt: *Where is `Compiler` defined, and list every place it is referenced or
    called across the source tree, with file and line.*

## Measured impact (L2 call-sites, blind-judged, verified vs pinned source)

| repo | quality winner | what grove (dg) did |
|---|---|---|
| typescript | **baseline** | dg pointed at generated `tests/baselines/reference/api/typescript.d.ts` and a `tests/cases/compiler/*.ts` baseline; missed checker/parser/nodeFactory call sites in real `src/` |
| webpack | **baseline** | dg substituted `declarations/LoaderContext.d.ts` for real `lib/`; silently dropped ~199 typedef references |

Both are grove quality losses directly attributable to this bug.

## Offending behavior (from the transcript)

**TypeScript** — the agent first scoped `symbols`/`callers` to `dir=…/src` (good:
returned real files), then broadened to the whole repo with `refs:true` and grove
handed back generated baselines:

```
mcp__grove__symbols  dir=/home/bench/repos/typescript   name=Scanner refs=true
  -> result paths include:
     tests/baselines/reference/api/typescript.d.ts
     tests/cases/compiler/staticAnonymousTypeNotReferencingTypeParameter.ts
   (alongside the real src/compiler/scanner.ts etc.)
```
The first `callers` call returned **`[]`** (empty), which pushed the agent toward
the broader `symbols refs=true` that pulled in the `.d.ts`.

**webpack** — the very first grove call returned a generated decl, and `definition`
came back empty:

```
mcp__grove__symbols     dir=/home/bench/repos/webpack name=Compiler refs=true
  -> result paths: ["declarations/LoaderContext.d.ts"]   (generated, not lib/)
mcp__grove__definition  name=Compiler dir=/home/bench/repos/webpack
  -> 461 chars, no file paths returned
```

## Proposed fix

1. **Default ignore set for generated artifacts** in indexing: `*.d.ts`
   (especially under `tests/baselines/`, `declarations/`, `dist/`, `types.d.ts`),
   build outputs, vendored copies — akin to a `.gitignore`/build-output filter.
2. **Rank real source above declarations** when both match: prefer `src/`/`lib/`
   over `*.d.ts`/`declarations/` in `symbols`/`definition`/`callers` results.
3. Optionally surface a `generated: true` flag on results that *are* generated so
   the agent/steering can choose to skip them.

## Fix verification (Tier-1, agent-free, zero tokens)

The probe rig (`Dockerfile.probe` + `scripts/run-probes.sh`) asserts grove's raw
output with no agent and no tokens. The fix should make these PASS; on current
grove (0.1.5) they FAIL because grove returns the generated decl.

```bash
scripts/build-probe.sh                                 # once: bake grammars into the probe image
GROVE_BIN=../grove/target/release/grove \
  scripts/run-probes.sh --label gi5 --spec probes/generated-decls.tsv
# expect: PASS 2 · FAIL 0   (current grove: FAIL 2 — the .d.ts paths are returned)
```

Spec (`probes/generated-decls.tsv`):

```
# kind<TAB>sym<TAB>dir<TAB>real-subpath(must include)<TAB>gen-subpath(must exclude)
nodecl  Scanner   /home/bench/repos/typescript  src/compiler/scanner.ts   tests/baselines/reference/api/typescript.d.ts
nodecl  Compiler  /home/bench/repos/webpack     lib/Compiler.js        declarations/LoaderContext.d.ts
```

Each row runs `grove symbols <dir> --name <sym> --refs --json` and asserts the
output **includes** the real source path and **excludes** the generated
declaration. `run-probes.sh` exits non-zero on any FAIL (CI gate before Tier-2
races) and writes `evidence/probes.gi5.json`. The binary under test is
bind-mounted at run time, so iterating on the fix is `cargo build` + the script
— no image rebuild.

## Evidence

- Transcripts: `out/opt-typescript-L2_callsites.claude.dg.jsonl`,
  `out/opt-webpack-L2_callsites.claude.dg.jsonl`
- Blind quality verdicts: `evidence/L2.quality.json`
- Full report: `reports/L2-callsites.md` (GI-5)
