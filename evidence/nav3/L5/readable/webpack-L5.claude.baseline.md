# transcript: I'm planning a change that touches several stages of a build, so I need to understand the whole journey of one build run from the moment the compiler is told...


  ▸ Agent(Webpack build lifecycle deep dive)  ⟶ subagent:
      ↳ Read(/home/bench/repos/webpack/lib/Compiler.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Bash(find /home/bench/repos/webpack/lib -type f -name "*.js" | head -20)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)
      ↳ Read(/home/bench/repos/webpack/lib/NormalModule.js)
      ↳ Bash(grep -n "^\s*finish\|^\s*seal\|^\s*addEntry\|^\s*createChunkAssets\|^\s*summarizeDependencies" /home/bench/repos/webpack/lib/Compilation.js | head -30)
      ↳ Bash(grep -n "\.hooks\." /home/bench/repos/webpack/lib/Compilation.js | head -50)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/NormalModule.js)
      ↳ Bash(grep -n "^\s*build\s*(" /home/bench/repos/webpack/lib/NormalModule.js | head -5)
      ↳ Bash(grep -n "^\s*create\s*(" /home/bench/repos/webpack/lib/NormalModuleFactory.js | head -5)
      ↳ Read(/home/bench/repos/webpack/lib/NormalModule.js)
      ↳ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Bash(grep -n "^\s*constructor\|^\s*this\.hooks = " /home/bench/repos/webpack/lib/Compilation.js | head -20)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Bash(grep -n "renderManifest\|beforeModuleAssets\|beforeChunkAssets\|contentHash\|beforeHash" /home/bench/repos/webpack/lib/Compilation.js | head -20)
      ↳ Bash(grep -n "getRenderManifest" /home/bench/repos/webpack/lib/Compilation.js | head -10)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)
      ↳ Bash(grep -n "hooks\." /home/bench/repos/webpack/lib/NormalModuleFactory.js | head -30)
      ↳ Bash(grep -n "createHash\|processRuntimeRequirements" /home/bench/repos/webpack/lib/Compilation.js | head -20)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Bash(grep -n "addModuleTree" /home/bench/repos/webpack/lib/Compilation.js | head -5)
      ↳ ⟹ returned to parent


💬 Here's the complete lifecycle, organized by phase with exact source references:  ---  ## Phase 1 — Compiler.run() and pre-compilation hooks  `Compiler.run()`...

──────── RESULT (success, 171726ms, 2 turns) ────────
Here's the complete lifecycle, organized by phase with exact source references:

---

## Phase 1 — Compiler.run() and pre-compilation hooks

`Compiler.run()` (`lib/Compiler.js:539`) sets `this.running = true`, then fires these hooks in sequence:

1. `beforeRun` (AsyncSeriesHook) — used by things like the cache to warm up before anything else starts
2. `run` (AsyncSeriesHook) — last chance before compilation begins
3. `readRecords()` — loads the records JSON from disk if `recordsInputPath` is set; this feeds the `reviveModules`/`reviveChunks` hooks later so IDs are stable across builds

Then it hands off to `compile()`.

---

## Phase 2 — Creating the Compilation

`Compiler.compile()` (`lib/Compiler.js:1403`) does this:

1. Calls `newCompilationParams()` — instantiates a fresh `NormalModuleFactory` and `ContextModuleFactory`
2. `beforeCompile` (AsyncSeriesHook<CompilationParams>) — receives the factory pair before the compilation object exists
3. `compile` (SyncHook<CompilationParams>) — fired synchronously right after
4. `newCompilation(params)` fires two hooks back-to-back:
   - `thisCompilation` — plugins that need to reset state per build tap here (e.g. they install hooks on the new `Compilation` object itself)
   - `compilation` — the wider plugin ecosystem taps here to register their `Compilation`-level hooks
5. `make` (AsyncParallelHook<Compilation>) — this is where `EntryPlugin` and similar plugins call `compilation.addEntry()` to populate the module graph. Everything from here until `finishMake` runs the module-building queues.
6. `finishMake` (AsyncSeriesHook<Compilation>) — after all entries and their discovered dependencies have been built
7. `compilation.finish()` — collects module errors/warnings, fires `finishModules`
8. `compilation.seal()` — the big one (details below)
9. `afterCompile` (AsyncSeriesHook<Compilation>) — the fully sealed compilation is available here

---

## Phase 3 — The make phase: building the module graph

The `make` hook triggers `EntryPlugin`, which calls `compilation.addEntry()` (`lib/Compilation.js:2645`). From there:

**addEntry → addModuleTree → NormalModuleFactory.create()**

`NormalModuleFactory` (`lib/NormalModuleFactory.js:1011`) resolves and creates modules through its own hook chain:
1. `beforeResolve` (AsyncSeriesBailHook) — can short-circuit
2. `factorize` (AsyncSeriesHook) — contains `resolve` (resolves file path) → `afterResolve` → `createModule` (produces the `NormalModule` instance)

Once a `NormalModule` exists, `NormalModule.build()` (`lib/NormalModule.js:1779`) runs:
1. Clears prior build state, initializes `buildMeta`/`buildInfo`
2. `_doBuild()` — runs the loader chain via `loader-runner`, yielding transformed source
3. Parser runs over the transformed source, producing AST and extracting all `Dependency` objects (imports, requires, etc.)

Those dependencies are queued up via four internal async queues on `Compilation`:
- `factorizeQueue` — factory requests (module discovery)
- `addModuleQueue` — deduplication against existing modules
- `buildQueue` — actual builds
- `processDependenciesQueue` — recursion into a module's discovered deps

This runs until all queues drain, at which point `finishMake` fires.

---

## Phase 4 — seal(): optimization → chunks → code → hashes → assets

`compilation.seal()` (`lib/Compilation.js:3473`) is the longest method in the codebase. Here is its hook sequence:

**Dependency optimization:**
1. `seal` (SyncHook)
2. `optimizeDependencies` in a while-loop (SyncBailHook) — returns truthy to re-run; used for tree-shaking analysis
3. `afterOptimizeDependencies`

**Chunk graph construction:**
4. `beforeChunks`
5. For each entry, a chunk and `Entrypoint` are created; modules are connected to chunks via `ChunkGraph`; `buildChunkGraph()` (`~Compilation.js:3656`) fills in the rest of the chunk-to-module relationships
6. `afterChunks` — the chunk graph is now frozen and queryable

**Optimization passes:**
7. `optimize`
8. `optimizeModules` while-loop → `afterOptimizeModules` — module-level DCE and deduplication
9. `optimizeChunks` while-loop → `afterOptimizeChunks` — `SplitChunksPlugin` taps here
10. `optimizeTree` (AsyncSeriesHook) → `afterOptimizeTree`
11. `optimizeChunkModules` (AsyncSeriesBailHook) → `afterOptimizeChunkModules` — concatenation (`ModuleConcatenationPlugin`) taps here

**ID assignment:**
12. `reviveModules` (restores IDs from records) → `beforeModuleIds` → `moduleIds` → `optimizeModuleIds` → `afterOptimizeModuleIds`
13. Same sequence for chunks: `reviveChunks` → `beforeChunkIds` → `chunkIds` → `optimizeChunkIds` → `afterOptimizeChunkIds`
14. `assignRuntimeIds()`

**Code generation:**
15. `optimizeCodeGeneration`
16. `beforeModuleHash` → `createModuleHashes()` (hashes each module per runtime, stored in `ChunkGraph`) → `afterModuleHash`
17. `beforeCodeGeneration` → `codeGeneration()` (generates JS for each module per runtime, stored in `CodeGenerationResults`) → `afterCodeGeneration`

**Runtime requirements:** determines which runtime helpers each chunk/module needs:
18. `beforeRuntimeRequirements` → per-module `additionalModuleRuntimeRequirements` + `runtimeRequirementInModule` (HookMap) → per-chunk `additionalChunkRuntimeRequirements` + `runtimeRequirementInChunk` → per-tree `additionalTreeRuntimeRequirements` + `runtimeRequirementInTree` → `afterRuntimeRequirements`

**Hashing:**
19. `beforeHash` → `createHash()` (computes the full compilation hash; fires `contentHash` per chunk at `~Compilation.js:5032`) → `afterHash`

**Asset generation:**
20. `beforeModuleAssets` → `createModuleAssets()` (fires `moduleAsset` per module that emits an asset)
21. `shouldGenerateChunkAssets` bail hook — if truthy, proceeds:
22. `beforeChunkAssets` → `createChunkAssets()` (`~Compilation.js:5522`):
    - For each chunk fires `renderManifest` (SyncWaterfallHook) — returns the list of files the chunk needs to emit; `JavascriptModulesPlugin` installs its renderer here
    - For each manifest entry, the renderer runs and produces a `Source`; `emitAsset()` adds it to `compilation.assets`; fires `chunkAsset` per file

**Post-asset processing:**
23. `processAssets` (AsyncSeriesHook) — the main hook for transforming final assets; plugins use `Compilation.PROCESS_ASSETS_STAGE_*` constants to order themselves (e.g. minifiers run at `OPTIMIZE_COMPATIBILITY`, sourcemap writers at `DEV_TOOLING`)
24. `afterProcessAssets`
25. `summarizeDependencies()` — aggregates file/context/missing deps from all modules into the compilation for the watcher
26. `record` (if recording)
27. `needAdditionalSeal` bail — if truthy, `unseal()` and re-run seal from the top
28. `afterSeal` (AsyncSeriesHook) — seal is complete

---

## Phase 5 — Emission

Back in `Compiler`:

1. `shouldEmit` (SyncBailHook<Compilation>) — if a plugin returns `false`, the entire emit phase is skipped and execution goes straight to `done`
2. `emit` (AsyncSeriesHook<Compilation>) — last chance to modify `compilation.assets` before any file is written
3. `Compiler.emitAssets()` (`lib/Compiler.js:746`) iterates `compilation.assets` with parallelism capped at 15:
   - Resolves output path (strips query strings, handles `[contenthash]` substitution)
   - Skips writes if the file content is identical to what's already on disk
   - Writes via `outputFileSystem.writeFile()`
   - `assetEmitted` (AsyncSeriesHook) fires per file after it's written
4. `afterEmit` (AsyncSeriesHook<Compilation>)
5. `emitRecords()` — writes `this.records` JSON to disk if `recordsOutputPath` is configured

---

## Phase 6 — Done

1. `done` (AsyncSeriesHook<Stats>) — receives the final `Stats` object; this is what CLI reporters and callbacks passed to `webpack(config, callback)` receive
2. `cache.storeBuildDependencies()` — persists the build dependency set for the next incremental build
3. `afterDone` (SyncHook<Stats>)

---

## How the stages connect — the key handoffs

| From | To | Mechanism |
|---|---|---|
| `Compiler.run()` | `Compiler.compile()` | direct call after `run` hook drains |
| `compile` hook | new `Compilation` | `newCompilation()` synchronously creates it and fires `thisCompilation`/`compilation` |
| `compilation` hook | `make` hook | plugins tap `compilation` to install handlers, then `make` fires and they call `addEntry` |
| module factory | `buildQueue` | `NormalModuleFactory.create()` resolves and returns a module; it's queued for building |
| `buildQueue` drain | `processDependenciesQueue` | each built module's deps are queued; this recurses until the whole graph is built |
| `finishMake` | `finish()` → `seal()` | sequential `await` calls in `compile()` |
| `seal()` return | `afterCompile` | back in `compile()`, `seal()` resolves and `afterCompile` fires |
| `afterCompile` | `emit` / `emitAssets()` | back in `run()`, `compile()`'s callback proceeds to `shouldEmit` then `emitAssets` |
| `emitAssets()` return | `done` | the `Stats` object is constructed and `done` fires |

The two most important interception points for cross-stage changes are **`processAssets`** (already-generated assets, late in seal) and the **`make`/`compilation` pair** (before the module graph is built). Everything in between is reachable through the seal-phase hooks in the order listed above.
