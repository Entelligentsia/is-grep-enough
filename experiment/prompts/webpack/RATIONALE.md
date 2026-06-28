# RATIONALE.md — webpack prompt genesis

Pinned source: `experiment/repos/webpack` (SHA ff19f174abd5e3dbbfd91a355034b0b15b2a1b01),
language javascript. Calibrated against the approved anchor
`experiment/prompts/redis`. Generator used only standard tools (Read/Grep/Glob/Bash)
over the pinned clone — no grove/LSP — so prompts emerge from generic exploration.
Every cite below is re-verified against the pinned source in the per-level
reference keys (see those files for the full spines and model answers).

## Level map (strictly increasing traversal/synthesis scope)

| L | Entity family | Traversal scope | Why it exceeds the level below |
|---|---|---|---|
| L1 | the `Module` class (one module node) | 0 hops; one definition site (`lib/Module.js`) + its base (`lib/DependenciesBlock.js`) | — (base) |
| L2 | `Compilation.addEntry` + its plugin callers | 1 hop; gather callers across 5 plugin files | adds a symbol *plus its relations* across files vs. one definition |
| L3 | one entry dependency → built, graph-wired module | multi-hop ordered chain across `EntryPlugin` → `Compilation` → `NormalModuleFactory` → `NormalModule` | adds an *ordered, end-to-end* path vs. a neighborhood |
| L4 | the chunk-graph subsystem (seal + `buildChunkGraph` + `ChunkGraph`/`Entrypoint`/`AsyncDependenciesBlock`) | multi-hop, one cohesive area; several paths | adds a *bounded cluster of cooperating components* vs. one path |
| L5 | one whole build run (`run` → `compile` → `make` → `finish` → `seal` → `emit`) | whole-system; threads Compiler + Compilation + factories + chunk graph + codegen + emit | adds a *cross-cutting, end-to-end* behavior across subsystems vs. one subsystem |

---

## L1 — the in-memory module node

**Prompt:** see `L1.txt`. The plausible larger task it slices: anything that
reasons about a module's identity, build output, or graph edges (e.g. "why does
this module's hash change / why is it in two chunks / what does it export") — the
agent first needs to know the shape of a module object.

**Why this level:** 0 hops, one concrete fact-cluster about one entity. The node is
`class Module extends DependenciesBlock` (`lib/Module.js:243`); its `type`
(`Module.js:254`) names the module kind, `buildMeta`/`buildInfo`
(`Module.js:285`/`287`) carry the build's output, and the graph edges
(`dependencies`/`blocks`/`parent`) live on the base `DependenciesBlock`
(`DependenciesBlock.js:48`/`50`/`52`). Exceeds nothing (it is the base); L2 adds
relations across files.

**Neutrality check:** grep can find `class Module` and the field assignments
directly; tree-sitter (grove) gets the class + base-class fields structurally; LSP
gets the class hierarchy and field declarations. All three can locate the single
definition and its base. Feasible for all; cost differs. ✓

**Cite pointer:** full spine in `L1.reference.md`.

## L2 — `addEntry` and the plugins that feed it

**Prompt:** see `L2.txt`. Larger task sliced: "wire up / debug the entry
configuration" — the agent needs to know the one funnel entries go through and the
different entry-producing plugins.

**Why this level:** 1 hop, neighborhood — one symbol (`Compilation.addEntry`,
`lib/Compilation.js:2645`) plus its direct callers across files: `EntryPlugin`
(`lib/EntryPlugin.js:48`), `DynamicEntryPlugin` (`lib/DynamicEntryPlugin.js:74`),
`DllEntryPlugin` (`lib/dll/DllEntryPlugin.js:54`), `ContainerPlugin`
(`lib/container/ContainerPlugin.js:89`), `HtmlModulesPlugin`
(`lib/html/HtmlModulesPlugin.js:246`). Exceeds L1 by requiring gathering + reading
several sites and contrasting what each caller hands in. Stays below L3 by *not*
asking for the downstream ordered chain (that is L3).

**Neutrality check:** grep finds `addEntry(` callers tree-wide; tree-sitter finds
call sites of the method semantically; LSP "find references" on `addEntry` returns
the callers. All three have a credible path to the caller set. ✓

**Cite pointer:** full spine in `L2.reference.md`.

## L3 — one entry dependency → built, graph-wired module

**Prompt:** see `L3.txt`. Larger task sliced: "diagnose why a particular module
isn't being built / is built twice / has the wrong source" — the agent must trace
the make-phase build path end to end.

**Why this level:** multi-hop, one ordered path across files: `EntryPlugin` make tap
(`lib/EntryPlugin.js:47`) → `addEntry` (`Compilation.js:2645`) → `addModuleTree`
(`Compilation.js:2591`) → `handleModuleCreation` (`Compilation.js:2298`) →
`factorizeModule`/`_factorizeModule` (`Compilation.js:2315`/`2171`) →
`NormalModuleFactory.create` (`lib/NormalModuleFactory.js:1011`) → `new NormalModule`
(`NormalModuleFactory.js:528`) → `addModule` + `moduleGraph.setResolvedModule`
(`Compilation.js:2362`/`2380`) → `buildModule`/`_buildModule`/`NormalModule.build`
(`Compilation.js:1660`/`1670`/`lib/NormalModule.js:1779`) → `runLoaders` + `parser.parse`
(`lib/NormalModule.js:1567`/`1975`) → `processModuleDependencies` re-entering
`handleModuleCreation` (`Compilation.js:1745`/`1832`). Exceeds L2 (a neighborhood) by
demanding the *order* and *end-to-end* sequence; stays below L4 by following one
path, not a cluster.

**Neutrality check:** grep can follow the call names sequentially; tree-sitter can
walk call edges file to file; LSP go-to-definition / call hierarchy traces it
semantically. Each reaches the chain; the integration (parsing the chain in order)
is the cost the three regimes differ on. ✓

**Cite pointer:** full spine in `L3.reference.md`.

## L4 — module graph → chunk graph (sealing / code-splitting)

**Prompt:** see `L4.txt`. Larger task sliced: "change how code-splitting works /
why is this dynamic import in the wrong chunk" — the agent must understand the
chunk-graph subsystem as a cooperating cluster.

**Why this level:** multi-hop, one bounded subsystem with several cooperating
components: `Compilation.seal` (`Compilation.js:3473`) creating entrypoints/chunks
(`Compilation.js:3512-3541`), `buildChunkGraph` (`lib/buildChunkGraph.js:1425`) with
`visitModules` (`buildChunkGraph.js:294`) and its `processEntryBlock` (`886`) /
`processBlock` (`791`) / `iteratorBlock` (`564`) walkers, the
available-modules tracking `calculateResultingAvailableModules` (`1014`) /
`processConnectQueue` (`1033`), the `AsyncDependenciesBlock` boundary type
(`lib/AsyncDependenciesBlock.js:21`), and `ChunkGraph` (`lib/ChunkGraph.js:281`) +
`Entrypoint` (`lib/Entrypoint.js:22`) as the result structures. Exceeds L3 (one
path) by requiring *how the parts interrelate* (several paths in one cohesive area);
stays below L5 by being bounded to the chunk-graph subsystem, not the whole build.

**Neutrality check:** grep finds the function/type names and their colocation;
tree-sitter gets the class relationships (`Entrypoint extends ChunkGroup`,
`AsyncDependenciesBlock extends DependenciesBlock`, `Module extends
DependenciesBlock`) and call sites; LSP call hierarchy on `buildChunkGraph` /
`seal` shows the cluster. All three can assemble the cluster; integrating *how* the
available-modules tracking drives splits is the synthesis cost. ✓

**Cite pointer:** full spine in `L4.reference.md`.

## L5 — one whole build run, end to end

**Prompt:** see `L5.txt`. Larger task sliced: "instrument / alter behavior that
spans the build lifecycle" — the agent needs the whole pipeline and the handoffs
between the `Compiler` and `Compilation` halves.

**Why this level:** whole-system, cross-cutting. The chain threads multiple
subsystems: `Compiler.run` (`lib/Compiler.js:539`) + run hooks (`651`/`654`) →
`compile` (`1403`) + `newCompilation` (`1361`) → `hooks.make` (`1415`) → the L3
build chain → `Compilation.finish` (`Compilation.js:3171`) + `finishModules`
(`3381`) → `Compilation.seal` (`3473`) → `buildChunkGraph` (`3656`) → optimize / id
assignment → `codeGeneration` (`3748`) → `createHash` (`3763`) →
`createChunkAssets` (`3841`) → `processAssets` (`3799`) → back in `Compiler`:
`emitAssets` (`Compiler.js:746`) + `hooks.emit` (`1089`) → `emitRecords` →
`hooks.done` (`607`/`644`) → `afterDone`. Exceeds L4 (one subsystem) by integrating
*across* subsystems with the Compiler↔Compilation handoffs (`make`, `afterCompile`,
`onCompiled`, `emit`).

**Neutrality check:** grep can trace the top-level method names and hook calls;
tree-sitter can follow `Compiler.run` → `compile` → `seal` calls structurally and
the hook `.callAsync`/`.call` sites; LSP call hierarchy + cross-file go-to-def
threads `Compiler` into `Compilation`. All three can assemble the pipeline; the
sheer integration scope is where they diverge in cost. ✓

**Cite pointer:** full spine in `L5.reference.md`.

## Calibration concerns for the reviewer

- L2 and L3 share `addEntry` (L2 = its callers, L3 = its downstream chain). This
  mirrors the redis anchor where L2 (the expire-check routine) and L3 (the full
  request path) share `expireKey`-ish elements; the *relations* asked differ
  (callers vs. ordered callees), so the levels are distinct and strictly
  increasing.
- L3 and L4 share `seal`/`buildChunkGraph` only at the L4 boundary — L3 stops at
  `processModuleDependencies` (make phase), L4 starts at `Compilation.seal`.
  Non-overlapping.
- L4 and L5 share `seal`; L4 is bounded to the chunk-graph subsystem (stops at
  `hooks.afterChunks`), L5 threads seal as one stage among many and continues to
  emit/done. Distinct scope.
- Spine counts: L1=5, L2=6 (routine + 5 callers), L3=8, L4=6, L5=6. Comparable to
  redis (L1=6, L2≈ routine+callers, L3=6, L4 multi, L5 multi).
- All prompts are tool-neutral (state the information need, no search verb / tool
  name / "list callers"/"go to definition" phrasing, no level label) and grounded
  in verified cites.