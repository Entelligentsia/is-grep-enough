# transcript: I'm planning a change that touches several stages of a build, so I need to understand the whole journey of one build run from the moment the compiler is told...


💬 I'll trace the full build lifecycle using grove's structural tools. Let me load them and start mapping the flow in parallel.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)

💬 Now let me pull the Compiler outline and the key run/compile methods in parallel.
  ▸ mcp__grove__outline({"file":"lib/Compiler.js","detail":0})
  ▸ mcp__grove__outline({"file":"lib/Compilation.js","detail":0,"kind":"method"})

💬 Good, grove is live. Let me pull all the load-bearing method bodies in parallel across both files.
  ▸ mcp__grove__source({"file":"lib/Compiler.js","name":"run"})
  ▸ mcp__grove__source({"file":"lib/Compiler.js","name":"compile"})
  ▸ mcp__grove__source({"file":"lib/Compiler.js","name":"newCompilation"})

💬 Now let me pull the Compilation's key phase methods in parallel.
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"finish"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"seal"})
  ▸ mcp__grove__source({"file":"lib/Compiler.js","name":"emitAssets"})

💬 Let me get the remaining key pieces: the `make` hook's primary tapper (EntryPlugin), `handleModuleCreation`, and `createHash`.
  ▸ mcp__grove__source({"file":"lib/EntryPlugin.js","name":"apply"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"handleModuleCreation"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"createHash"})

💬 Now I have everything I need. Here is the complete lifecycle walk-through, grounded in the actual code.  ---  ## The webpack build lifecycle, end to end  ###...

──────── RESULT (success, 149239ms, 13 turns) ────────
Now I have everything I need. Here is the complete lifecycle walk-through, grounded in the actual code.

---

## The webpack build lifecycle, end to end

### 1. `Compiler.run()` — pre-flight (`lib/Compiler.js:539`)

`run()` guards against a concurrent build (`this.running`), then if the compiler is currently idle it first drains the cache's idle state (`cache.endIdle()`). The real work starts inside a local `run()` closure that fires three sequential async hooks:

```
hooks.beforeRun   → hooks.run   → readRecords()   → compile()
```

- **`beforeRun`** — e.g. `NodeEnvironmentPlugin` purges the input filesystem cache here so the next build reads fresh files.
- **`run`** — a last-chance hook before compilation. Less commonly tapped.
- **`readRecords()`** — loads the persisted records file (`records.json`) which carries stable module/chunk IDs from a previous build. Needed for deterministic IDs across builds.
- Then `this.compile(onCompiled)` is called.

---

### 2. `Compiler.compile()` — create compilation and drive the build (`lib/Compiler.js:1403`)

```
newCompilationParams()
  → hooks.beforeCompile
  → hooks.compile
  → newCompilation(params)     ← thisCompilation + compilation hooks
  → hooks.make                 ← module graph built here
  → hooks.finishMake
  → compilation.finish()
  → compilation.seal()
  → hooks.afterCompile
  → onCompiled callback
```

**`newCompilationParams()`** (`lib/Compiler.js:1390`) creates the two factories that the make phase needs: `NormalModuleFactory` and `ContextModuleFactory`. Both are surfaced on the `params` object passed to all compile-phase hooks.

**`newCompilation(params)`** (`lib/Compiler.js:1361`) calls `createCompilation()` then fires:
- `hooks.thisCompilation` — tapped by plugins that must run before child compiler inheritance (they use this to avoid their state leaking into child compilations).
- `hooks.compilation` — the general "compilation created" broadcast; every feature plugin registers its dependency factories and taps compilation hooks here.

---

### 3. `hooks.make` — building the module graph

`hooks.make` is the make phase. The primary tapper is **`EntryPlugin`** (`lib/EntryPlugin.js:33`):

```js
compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
    compilation.addEntry(context, dep, options, callback);
});
```

`addEntry` → `_addEntryItem` → `addModuleTree` → `addModuleChain` → **`handleModuleCreation`** (`lib/Compilation.js:2298`).

**`handleModuleCreation`** is the recursive kernel of the make phase. For each new dependency it:

1. **`factorizeModule`** — calls the appropriate factory (e.g. `NormalModuleFactory`) to resolve the request path and create a `Module` object, without yet running any loaders.
2. **`addModule`** — deduplicates: if an identical module (same identifier) already exists, returns the existing one; otherwise registers the new module in the compilation and the module graph.
3. Wires the dependency → module edge in the module graph (`moduleGraph.setResolvedModule`).
4. Calls **`_handleModuleBuildAndDependencies`** which:
   - **`buildModule`** (`lib/Compilation.js:1660`) — runs the loader pipeline on the source file, then parses the output (via acorn for JS) to discover the module's own dependencies.
   - **`processModuleDependencies`** (`lib/Compilation.js:1745`) — for every discovered child dependency, recurses back into `handleModuleCreation`.

The entire make phase is driven by four async queues (`factorizeQueue`, `buildQueue`, `addModuleQueue`, `processDependenciesQueue`) that keep as many operations in-flight as the concurrency limit allows. When all queues drain, `hooks.finishMake` fires.

---

### 4. `compilation.finish()` — post-make module finalization (`lib/Compilation.js:3171`)

Before seal can begin, three things happen here:

1. **`_computeAffectedModules`** — compares module hashes against the previous build to mark which modules actually changed (drives incremental cache skipping).
2. **`hooks.finishModules`** (async) — plugins like `FlagDependencyExportsPlugin` do their static-analysis pass over the complete module graph here (export tracing, tree-shaking marks).
3. **Error/warning collection** — iterates every module, calls `reportDependencyErrorsAndWarnings`, and pushes any module-level errors/warnings into `compilation.errors`/`compilation.warnings`. The module graph is briefly frozen during this pass.

---

### 5. `compilation.seal()` — graph → chunks → assets (`lib/Compilation.js:3473`)

Seal is the longest phase. It has a clear internal order.

#### 5a. Chunk graph construction

After `hooks.seal` and a `hooks.optimizeDependencies` sync-loop (e.g. `SideEffectsFlagPlugin` removes unused re-exports), the seal code iterates `this.entries` and creates one `Chunk` and one `Entrypoint` (a `ChunkGroup`) per entry. Entry modules are connected to their chunks in the `ChunkGraph`. Then:

```js
buildChunkGraph(this, chunkGraphInit)
```

`buildChunkGraph` (`lib/buildChunkGraph.js`) propagates modules from each entry point outward through all dependency edges, assigning every reachable module to the correct chunk(s) — the first and only place the `ChunkGraph` is fully populated. After `hooks.afterChunks`, the chunk graph is stable and the rest of seal only reads from it.

#### 5b. Optimization passes

```
hooks.optimizeModules (sync loop)
hooks.optimizeChunks (sync loop)   ← SplitChunksPlugin runs here
hooks.optimizeTree (async)
hooks.optimizeChunkModules (async)
```

`SplitChunksPlugin` taps `optimizeChunks` and may create new split chunks and move modules between them. Because the loop repeats until no plugin returns `true`, multiple passes are possible when plugins interact.

#### 5c. ID assignment

```
hooks.moduleIds   → hooks.optimizeModuleIds
hooks.chunkIds    → hooks.optimizeChunkIds
assignRuntimeIds()
```

ID-assigning plugins (`DeterministicModuleIdsPlugin`, `NamedChunkIdsPlugin`, etc.) run here and permanently assign the stable integer/string IDs that appear in the output. Records (`reviveModules`/`reviveChunks`) let previous-build IDs survive a rebuild.

#### 5d. Code generation (first pass)

```
createModuleHashes()
codeGeneration()           ← async
processRuntimeRequirements()
```

**`createModuleHashes()`** (`lib/Compilation.js:4693`) computes a short hash per (module × runtime) pair. These hashes serve as cache keys so code generation can be skipped for unchanged modules.

**`codeGeneration()`** (`lib/Compilation.js:3911`) dispatches a `module.codeGeneration({ dependencyTemplates, runtimeTemplate, moduleGraph, chunkGraph, runtime })` call for every (module × runtime) combination that needs it. Results go into `this.codeGenerationResults`.

**`processRuntimeRequirements()`** (`lib/Compilation.js:4159`) inspects every module's `codeGenerationResults.runtimeRequirements` and inserts the appropriate `RuntimeModule` instances (e.g. `PublicPathRuntimeModule`, `RuntimeIdRuntimeModule`, chunk-loading code) into each runtime chunk.

#### 5e. Hashing (`createHash()`, `lib/Compilation.js:4797`)

Chunks are hashed in four ordered passes to guarantee all hash dependencies flow in one direction — async chunks first, then non-entry initial chunks, then runtime chunks (topologically sorted by inter-chunk references), then entry chunks:

```
async chunks → initial chunks → runtime chunks → entry chunks
```

For each chunk, `processChunk()`:
1. Computes hashes for any runtime-specific modules not yet hashed.
2. Runs `chunk.updateHash(chunkHash, chunkGraph)` — mixes in chunk structure, module content hashes, etc.
3. Fires `hooks.chunkHash` so plugins can contribute additional hash material.
4. Assigns `chunk.hash` and `chunk.renderedHash`.

After all chunks: `hooks.fullHash` mixes everything into `compilation.fullHash` / `compilation.hash` (the `[fullhash]`/`[hash]` template variable).

**Full-hash modules** (e.g. `GetChunkFilenameRuntimeModule`) need `compilation.hash` to generate their code, so they are deferred: `createHash()` returns a `codeGenerationJobs` list and `_runCodeGenerationJobs()` runs them after the full hash is known.

#### 5f. Asset creation

```
createModuleAssets()    ← asset modules emit their files here
createChunkAssets()     ← JS/CSS output files
hooks.processAssets (staged async)   ← minimizers, etc.
hooks.afterProcessAssets
Object.freeze(this.assets)
summarizeDependencies()
hooks.afterSeal (async)
```

**`createChunkAssets()`** (`lib/Compilation.js:5522`) calls `getRenderManifest()` for each chunk; `JavascriptModulesPlugin` returns manifest entries whose `render()` function produces the final concatenated module source. The result is passed to `compilation.emitAsset()` which registers the filename → `Source` mapping in `compilation.assets`.

**`hooks.processAssets`** is the post-generation asset pipeline (staged with `PROCESS_ASSETS_STAGE_*` constants). `TerserPlugin` minimizes JS here; `SourceMapDevToolPlugin` appends source-map comments; the gzip/brotli size-hints plugin reads sizes.

After `processAssets` the assets map is frozen — any mutation after this point triggers a deprecation warning. `summarizeDependencies()` collects every `fileDependency`/`contextDependency`/`missingDependency` seen during the build so the watcher knows what to watch.

---

### 6. Back in `Compiler.compile()` / `onCompiled`

After `seal()` completes, `hooks.afterCompile` fires and the `compilation` object is handed back to `onCompiled` in `run()`.

---

### 7. `Compiler.emitAssets()` — writing to disk (`lib/Compiler.js:746`)

```
hooks.emit (async)
  → mkdirp(outputPath)
  → asyncLib.forEachLimit(assets, 15, writeEachAsset)
  → hooks.afterEmit (async)
```

**`hooks.emit`** fires first — the last opportunity to add or change assets before anything touches the filesystem. The output path is resolved via `compilation.getPath(this.outputPath, {})`.

For each asset (up to 15 concurrent), the write logic:
1. Checks `_assetEmittingWrittenFiles` — if the exact same `Source` object (by generation counter) was already written to this path, skip the write entirely.
2. If `output.compareBeforeEmit` is set, `stat`s the file and reads it; skips writing if content is byte-identical (preserves mtime for watchers).
3. Otherwise calls `outputFileSystem.writeFile(targetPath, content)`.
4. Marks the file in `compilation.emittedAssets` and fires `hooks.assetEmitted` per file.

After all files are written: `hooks.afterEmit`.

---

### 8. Wrap-up in `Compiler.run()`

```
emitRecords()              ← writes records.json for next build's stable IDs
new Stats(compilation)
hooks.done (async)         ← ProgressPlugin, StatsPlugin signal "build done"
cache.storeBuildDependencies()
finalCallback(null, stats) ← user's callback
hooks.afterDone (sync)
cache.beginIdle()
```

`emitRecords()` persists module/chunk IDs so the next build can revive them. `hooks.done` is where stats are printed and any "build finished" side effects run. `cache.storeBuildDependencies()` writes the full file-dependency set into the persistent cache so future runs know exactly which source files to revalidate.

---

### Connecting the stages — the key invariants

| Stage | What's stable afterward |
|---|---|
| End of `make` / `finishMake` | Every source file is loaded, every module is in `moduleGraph`, all dependency edges are wired |
| End of `finish` | All export/import analysis done, errors/warnings collected |
| `buildChunkGraph` inside `seal` | Every module knows which chunk(s) it belongs to (`chunkGraph`) |
| After optimization hooks | Chunk shape is final — no more splitting/merging |
| After ID hooks | Module and chunk IDs are stable |
| After `codeGeneration` | `codeGenerationResults` populated for all (module × runtime) pairs |
| After `createHash` | `compilation.hash` known; all chunk hashes known; all filenames with `[hash]`/`[chunkhash]` are resolved |
| After `processAssets` | `compilation.assets` is frozen — the complete output file map |
| After `emitAssets` | Files are on disk |

The two graphs (`ModuleGraph` for source-level edges, `ChunkGraph` for module-to-chunk assignment) are the shared data structures that every phase reads. The module graph is built during `make`, frozen-for-reading during `finish`, then read-only for the rest of seal. The chunk graph is created at the start of seal by `buildChunkGraph` and never mutated again after the optimization hooks finish.
