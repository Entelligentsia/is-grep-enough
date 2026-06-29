# transcript: I'm planning a change that touches several stages of a build, so I need to understand the whole journey of one build run from the moment the compiler is told...

  ▸ ToolSearch(select:LSP)

💬 I'll trace the full build lifecycle by systematically following the call chain through Compiler.js and Compilation.js. Let me start with the top-level symbol...
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/webpack/lib/Compiler.js","line":1,"character":1})
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/webpack/lib/Compilation.js","line":1,"character":1})

💬 Good. Now let me read the key methods systematically — `run`, `compile`, and `emitAssets` in Compiler, plus `finish` and `seal` in Compilation.
  ▸ Read(/home/bench/repos/webpack/lib/Compiler.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compiler.js)

💬 Now let me find `finish` and `seal` in Compilation.js.
  ▸ LSP(finish)
  ▸ LSP(seal)

💬 Found them. Let me read both `finish` and `seal` in Compilation.js.
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Let me continue reading the rest of `seal` to see the records/assets/modules rendering phase.
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compiler.js)

💬 Now let me read the `finish` method past the profiling section to see what it does with the module graph, and also look at how the `make` hook is tapped by e...
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ LSP(EntryPlugin)
  ▸ Read(/home/bench/repos/webpack/lib/EntryPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Let me also look at `addEntry` and `addModuleTree` to complete the make-phase picture.
  ▸ LSP(addEntry)
  ▸ LSP(codeGeneration)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ LSP(addModuleTree)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Good. Let me also look at `handleModuleCreation` to see the factorize → build → processDependencies queue chain.
  ▸ LSP(handleModuleCreation)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 I now have a complete picture of the entire lifecycle from source to files-on-disk. Here is the full walkthrough.  ---  ## webpack build lifecycle: end-to-en...

──────── RESULT (success, 207007ms, 25 turns) ────────
I now have a complete picture of the entire lifecycle from source to files-on-disk. Here is the full walkthrough.

---

## webpack build lifecycle: end-to-end

### 1. `Compiler.run()` — entry point (`Compiler.js:539`)

The run method is the single public entry point for a one-shot build. It does four things before touching any modules:

1. Guards against concurrent runs (`this.running` flag).
2. Defines `finalCallback` — the cleanup closure that calls `cache.beginIdle()`, fires `hooks.failed` or `hooks.afterDone`, and delivers `(err, stats)` to the caller.
3. If the cache was idle, calls `cache.endIdle()` first (warms the persistent cache layer back up).
4. Fires the `run` closure in sequence:
   - `hooks.beforeRun.callAsync(compiler)` — e.g. the file-system cache layer invalidates stale entries here
   - `hooks.run.callAsync(compiler)` — watch-mode-only hooks tap this
   - `this.readRecords()` — deserializes any persistent chunk/module-ID records from a prior build
   - `this.compile(onCompiled)` — hands off to the compilation

---

### 2. `Compiler.compile()` — bootstrap the compilation (`Compiler.js:1403`)

```
newCompilationParams()
  → hooks.beforeCompile   (async)
  → hooks.compile         (sync)
  → newCompilation()
      → hooks.thisCompilation (sync)
      → hooks.compilation     (sync)
  → hooks.make            (async)
  → hooks.finishMake      (async)
  → compilation.finish()
  → compilation.seal()
  → hooks.afterCompile    (async)
  → callback(null, compilation)
```

`newCompilationParams()` (`Compiler.js:1390`) creates two factories:
- **`NormalModuleFactory`** — resolves file paths, picks loaders, creates `NormalModule` instances
- **`ContextModuleFactory`** — handles `require.context` patterns

`hooks.beforeCompile` lets plugins prepare (e.g. DLL reference plugins validate manifests). `hooks.compile` is a synchronous notification that a new compilation is starting.

`newCompilation()` (`Compiler.js:1361`) instantiates a fresh `Compilation` then fires `hooks.thisCompilation` and `hooks.compilation` so plugins can attach their tap listeners to the compilation's own hooks. `JavascriptModulesPlugin`, `SplitChunksPlugin`, `HarmonyModulesPlugin`, and almost every other core plugin wire themselves up here.

---

### 3. `hooks.make` — building the module graph (make phase)

`hooks.make` is the signal to start adding modules. `EntryPlugin.apply()` (`EntryPlugin.js:47`) taps it:

```js
compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
    compilation.addEntry(context, dep, options, callback);
});
```

`addEntry` → `_addEntryItem` (`Compilation.js:2682`) records the entry in `this.entries` and calls `addModuleTree` (`Compilation.js:2591`), which looks up the factory for the `EntryDependency` type and calls `handleModuleCreation` (`Compilation.js:2298`).

`handleModuleCreation` runs a three-phase pipeline for every module, recursively:

**Phase A — factorize** (`factorizeModule`): Invokes the `NormalModuleFactory`. The factory resolves the file path, picks loaders via rule matching, and constructs a `NormalModule` object. The result includes the file's `fileDependencies` and `contextDependencies` which are added to the compilation's watch sets.

**Phase B — add** (`addModule`): Deduplicates against the module graph. If a module with the same identifier already exists, the existing one is returned and `setResolvedModule` wires the dependency edge to it in the `ModuleGraph`.

**Phase C — build + recurse** (`buildModule` → `_handleModuleBuildAndDependencies`): Runs loaders on the source file, then parses the transformed source (e.g. acorn for JS) to discover dependencies. Each discovered dependency is collected and then `processModuleDependencies` calls `handleModuleCreation` recursively for each one. This expands the module graph breadth-first until no new modules are found.

`AsyncQueue` machinery (`factorizeQueue`, `buildQueue`, `processDependenciesQueue`, `addModuleQueue`) manages concurrency — modules are factorized and built in parallel up to a configured limit.

After all `make` tappers complete, `hooks.finishMake.callAsync(compilation)` fires — `FlagDependencyUsagePlugin` and similar tree-shaking groundwork runs here.

---

### 4. `compilation.finish()` — close out the module graph (`Compilation.js:3171`)

Immediately after `finishMake`, the compiler calls `compilation.finish()` on a `process.nextTick`. It does:

1. **Profile logging** — if `profile: true`, computes parallelism factors and logs timing per module phase.
2. **`_computeAffectedModules(this.modules)`** — marks which modules actually changed (for incremental builds/caches).
3. **`hooks.finishModules.callAsync(modules)`** — plugins finalize module-level analysis. `InferAsyncModulesPlugin` propagates `async` flags; `FlagDependencyUsagePlugin` marks which exports are actually used (the foundation of tree-shaking).
4. **Dependency error/warning collection** — walks every module, calls `reportDependencyErrorsAndWarnings`, and accumulates per-module build errors and warnings into `compilation.errors` / `compilation.warnings`.

---

### 5. `compilation.seal()` — chunks, optimization, codegen, assets (`Compilation.js:3473`)

This is the longest phase. It is entirely synchronous except for a few `callAsync` hooks.

#### 5a. Dependency optimization
- `hooks.seal.call()` — signals seal start; `SideEffectsFlagPlugin` removes dead re-export edges here.
- `while (hooks.optimizeDependencies.call(this.modules))` loop — repeats until stable.

#### 5b. Chunk graph construction
- `hooks.beforeChunks.call()`
- `moduleGraph.freeze("seal")` — the module graph is now immutable.
- For each entry in `this.entries`: creates a `Chunk` and `Entrypoint`, attaches entry modules to the chunk via `chunkGraph.connectChunkAndEntryModule`, builds `chunkGraphInit`.
- `buildChunkGraph(this, chunkGraphInit)` (`buildChunkGraph.js`) — traverses from entry modules, assigns all transitively reachable synchronous modules to chunks, creates split points for dynamic `import()` calls and turns them into additional async chunk groups.
- `hooks.afterChunks.call(this.chunks)`

#### 5c. Optimization passes
- `hooks.optimize.call()`
- `while (hooks.optimizeModules.call(...))` — `ModuleConcatenationPlugin` (scope hoisting) merges eligible ES modules here.
- `while (hooks.optimizeChunks.call(...))` — `SplitChunksPlugin` creates shared chunks; `LimitChunkCountPlugin` merges small chunks.
- `hooks.optimizeTree.callAsync(chunks, modules)` — async tree optimization.
- `hooks.optimizeChunkModules.callAsync(chunks, modules)` — async chunk/module optimization.

#### 5d. ID assignment
- `hooks.reviveModules/reviveChunks` — restore IDs from records (stable IDs across builds).
- `hooks.moduleIds.call()` — `DeterministicModuleIdsPlugin` or `NamedModulesPlugin` assigns stable module IDs.
- `hooks.chunkIds.call()` — same for chunks.
- `this.assignRuntimeIds()` — assigns IDs to runtime chunks.
- `_computeAffectedModulesWithChunkGraph()` — refines the affected-module set now that chunk assignments are known.

#### 5e. Code generation
- `hooks.optimizeCodeGeneration.call()` — final opportunity before codegen.
- `hooks.beforeModuleHash.call()` + `this.createModuleHashes()` — computes a content-based hash for each module (used in `[contenthash]` filenames).
- `hooks.beforeCodeGeneration.call()` + `this.codeGeneration()` (`Compilation.js:3911`) — calls `module.codeGeneration({ dependencyTemplates, runtimeTemplate, moduleGraph, chunkGraph, runtime })` for every module. For `NormalModule` (`NormalModule.js:2053`) this drives the generator (e.g. `JavascriptGenerator`) to produce the final `ConcatSource`. Results are stored in `this.codeGenerationResults`.
- `this.processRuntimeRequirements()` — determines which runtime helpers (e.g. `__webpack_require__`, `__webpack_require__.r`) each chunk needs, installs `RuntimeModule` instances.
- `hooks.beforeHash.call()` + `this.createHash()` — computes the final chunk content hashes. Runtime modules get their own code-gen jobs here (returned as `codeGenerationJobs`).
- `this._runCodeGenerationJobs(codeGenerationJobs)` — runs the remaining runtime-module codegen.

#### 5f. Asset creation
- `this.clearAssets()` — wipes `this.assets`.
- `hooks.beforeModuleAssets.call()` + `this.createModuleAssets()` — modules that are themselves assets (e.g. `asset/resource`) emit their content here.
- `hooks.shouldGenerateChunkAssets` guard + `this.createChunkAssets()` — renders each chunk: calls `JavascriptModulesPlugin.renderChunk` (which uses templates and the previously generated module sources) and stores the resulting `Source` in `this.assets` keyed by filename.
- `hooks.processAssets.callAsync(this.assets)` — the primary plugin extensibility point for post-processing assets (MiniCssExtractPlugin, image optimization, banner injection all happen here, staged via `PROCESS_ASSETS_STAGE_*`).
- `hooks.afterProcessAssets.call()`
- `Object.freeze(this.assets)` — the asset map is locked.
- `this.summarizeDependencies()` — collects file/context/missing dependencies from all modules.
- If recording: `hooks.record.call(this, this.records)` — snapshot IDs.
- `hooks.needAdditionalSeal` — if any plugin requests it, calls `this.unseal()` and re-runs `seal()` from scratch.
- `hooks.afterSeal.callAsync()` — final cleanup; `FileSystemInfo.logStatistics()` here.

---

### 6. Back in `Compiler.compile()`: `hooks.afterCompile` (`Compiler.js:1436`)

Fires with the sealed compilation before returning it to `onCompiled`. Plugins that need the final compilation state (stats plugins, cache-writing plugins) tap this.

---

### 7. `onCompiled` callback (`Compiler.js:576`)

- Checks `hooks.shouldEmit.call(compilation)` — if false (e.g. a stats-only build), skips emission and goes straight to `hooks.done`.
- `process.nextTick()` then `this.emitAssets(compilation)`.

---

### 8. `Compiler.emitAssets()` — write files (`Compiler.js:746`)

- `hooks.emit.callAsync(compilation)` fires first — the last chance for any plugin to add or remove assets from `compilation.assets` before disk writes.
- Resolves `outputPath` from config.
- `asyncLib.forEachLimit(assets, 15, ...)` — writes up to 15 assets concurrently via `this.outputFileSystem`:
  - Strips query/hash query strings from filenames to get the real `targetFile`.
  - Checks `_assetEmittingWrittenFiles` — if the file was already written at the same "generation" (same source object, immutable asset), skips the write.
  - Case-insensitive collision detection (`caseInsensitiveMap`).
  - Reads existing file and compares content; skips write if identical (avoids touching mtimes unnecessarily).
  - `doWrite()` calls `outputFileSystem.writeFile(targetPath, content, callback)`, then fires `hooks.assetEmitted` per file.
- `hooks.afterEmit.callAsync()` — fires once all writes are done.

---

### 9. Additional pass check (`Compiler.js:600`)

`compilation.hooks.needAdditionalPass.call()` — HMR or certain lazy plugins may request another full compile cycle. If so: build `Stats`, fire `hooks.done`, then `hooks.additionalPass`, then call `this.compile(onCompiled)` again from the top.

---

### 10. Wrap-up (`Compiler.js:622–643`)

Normal (non-additional-pass) path:

1. `this.emitRecords()` — writes the records JSON file (persistent chunk/module ID state).
2. `new Stats(compilation)` — wraps the compilation for reporting.
3. `hooks.done.callAsync(stats)` — the "build finished" signal; progress plugins print the summary here.
4. `cache.storeBuildDependencies(compilation.buildDependencies)` — tells the persistent cache which files can invalidate the cache.
5. `finalCallback(null, stats)` — sets `this.idle = true`, calls `cache.beginIdle()`, fires `hooks.afterDone`, and delivers `(null, stats)` to the original caller.

---

### Connection summary

```
Compiler.run()
  └─ hooks.beforeRun / hooks.run / readRecords
  └─ Compiler.compile()
       └─ newCompilationParams()            ← NMF + CMF created
       └─ hooks.beforeCompile / compile
       └─ newCompilation()                  ← plugins wire to compilation hooks
       └─ hooks.make                        ← EntryPlugin.addEntry()
            └─ handleModuleCreation()       ← factorize → add → build → recurse
               (repeated until graph stable)
       └─ hooks.finishMake
       └─ compilation.finish()             ← finishModules, error collection
       └─ compilation.seal()
            ├─ optimizeDependencies loop
            ├─ buildChunkGraph()           ← modules → chunks
            ├─ optimize* hooks             ← SplitChunks, concatenation
            ├─ ID assignment hooks
            ├─ createModuleHashes()
            ├─ codeGeneration()            ← module sources produced
            ├─ processRuntimeRequirements()
            ├─ createHash()                ← chunk hashes / [contenthash]
            ├─ createChunkAssets()         ← chunks rendered to Source objects
            └─ processAssets hook          ← final asset transformations
       └─ hooks.afterCompile
  └─ emitAssets()                          ← outputFileSystem.writeFile × N
       └─ hooks.emit / hooks.afterEmit
  └─ emitRecords()
  └─ hooks.done(stats)
  └─ cache.storeBuildDependencies()
  └─ finalCallback(null, stats)
```

The key seam to know if you're touching multiple stages: **`hooks.make` owns the module graph; `seal()` owns everything that comes from it**. No module is added after `seal()` begins (the graph is frozen at `moduleGraph.freeze("seal")`). No asset is added after `hooks.processAssets` returns (the map is frozen at `Object.freeze(this.assets)`). And no file is written until `hooks.emit` has completed inside `emitAssets`.
