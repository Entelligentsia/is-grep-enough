# transcript: I want to trace what happens to a single entry dependency from the moment the build's make phase hands it to the compilation until it has become a fully buil...


💬 Let me trace this systematically through the source, using grove for structure and grep for the hook/method connections.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)

💬 I'll fan out parallel lookups across the key stages — EntryPlugin, Compilation's entry/module methods, NormalModuleFactory, and NormalModule.
  ▸ mcp__grove__outline({"file":"lib/EntryPlugin.js"})
  ▸ mcp__grove__outline({"file":"lib/Compilation.js","kind":"method","detail":0})
  ▸ mcp__grove__outline({"file":"lib/NormalModuleFactory.js","kind":"method","detail":0})

💬 Now I'll read the key methods in parallel across the full pipeline.
  ▸ mcp__grove__source({"file":"lib/EntryPlugin.js","name":"apply"})
  ▸ mcp__grove__source({"file":"lib/EntryPlugin.js","name":"createDependency"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"addEntry"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"_addEntryItem"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"addModuleTree"})

💬 Now I'll read the core pipeline in parallel — factorize, build, and processDependencies.
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"handleModuleCreation"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"_factorizeModule"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"_handleModuleBuildAndDependencies"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"_buildModule"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"_processModuleDependencies"})

💬 Now I need NormalModuleFactory.create (resolution) and NormalModule.build (loaders + parsing).
  ▸ mcp__grove__source({"file":"lib/NormalModuleFactory.js","name":"create"})
  ▸ mcp__grove__outline({"file":"lib/NormalModule.js","kind":"method","detail":0})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"_addModule"})
  ▸ mcp__grove__source({"file":"lib/Compilation.js","name":"factorizeModule"})

💬 Now I need NormalModule's build and _doBuild, plus the NMF factorize hook tap that drives resolution.
  ▸ mcp__grove__source({"file":"lib/NormalModule.js","name":"build"})
  ▸ mcp__grove__source({"file":"lib/NormalModule.js","name":"_doBuild"})
  ▸ Bash(grep -n "hooks\.factorize\|hooks\.resolve\b\|hooks\.afterResolve\|hooks\.createModule\|\.tap\|\.tapAsync" lib/NormalModuleFactory.js | head -60)
  ▸ Bash(grep -n "factorizeQueue\|buildQueue\|processDependenciesQueue\|AsyncQueue\b" lib/Compilation.js | head -30)

💬 Now let me read the NMF factorize→resolve→afterResolve→createModule chain and the queue parent relationships.
  ▸ mcp__grove__source({"file":"lib/NormalModuleFactory.js","name":"resolveResource"})
  ▸ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Let me read the core of the NMF resolve hook tap where loaders and resource are actually resolved.
  ▸ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)

💬 I have everything I need. Here's the end-to-end trace.  ---  ## Entry dependency → built module: the full pipeline  ### Stage 0: Plugin registration (before ...

──────── RESULT (success, 151764ms, 27 turns) ────────
I have everything I need. Here's the end-to-end trace.

---

## Entry dependency → built module: the full pipeline

### Stage 0: Plugin registration (before make)

**`EntryPlugin.apply`** (`lib/EntryPlugin.js:33`) runs during compiler setup. It does two things in sequence:

1. On `compiler.hooks.compilation`, it calls `compilation.dependencyFactories.set(EntryDependency, normalModuleFactory)`. This registers `NormalModuleFactory` as the factory for `EntryDependency` instances — the lookup that drives everything downstream.

2. On `compiler.hooks.make` (the trigger for the build phase), it calls `EntryPlugin.createDependency(entry, options)` → `new EntryDependency(entry)` with `dep.loc.name` set to the entry name, then hands it to `compilation.addEntry(context, dep, options, callback)`.

---

### Stage 1: Entry registration → addModuleTree

**`addEntry`** (`Compilation.js:2645`) just normalises the options shape and calls **`_addEntryItem`** (`Compilation.js:2682`).

`_addEntryItem` upserts an `EntryData` record (`{ dependencies, includeDependencies, options }`) into `compilation.entries` keyed by the entry name, pushes the `EntryDependency` into `entryData.dependencies`, fires `hooks.addEntry`, then calls **`addModuleTree`** (`Compilation.js:2591`).

`addModuleTree` reads `compilation.dependencyFactories.get(dependency.constructor)` — the `NormalModuleFactory` registered in Stage 0 — and calls **`handleModuleCreation`** with `{ factory, dependencies: [dep], originModule: null, context }`.

---

### Stage 2: Factorization — request → NormalModule instance

`handleModuleCreation` (`Compilation.js:2298`) calls **`factorizeModule`** (`Compilation.js:2271`), which is just `this.factorizeQueue.add(options, callback)`. The work is done by **`_factorizeModule`** (`Compilation.js:2171`) when the queue processes the item.

`_factorizeModule` calls **`factory.create(data, callback)`** — i.e., `NormalModuleFactory.create` (`NormalModuleFactory.js:1011`).

Inside `NormalModuleFactory.create`:

1. **`hooks.beforeResolve`** fires. Plugins can short-circuit here (returning `false` produces a null/ignored module).

2. **`hooks.factorize`** fires. The built-in stage-100 tap (`NormalModuleFactory.js:469`) is the workhorse. It immediately calls **`hooks.resolve`**.

3. The stage-100 **`hooks.resolve`** tap (`NormalModuleFactory.js:546`) does all resolution work:
   - Parses the raw request string: splits on `!` to extract inline loaders (`elements`), strips `!`/`-!`/`!!` prefixes that control pre/auto/post suppression, isolates `unresolvedResource`.
   - Resolves loaders and resource in **parallel** via `needCalls(2, continueCallback)`:
     - Each inline loader is resolved by the loader resolver (`resolveRequestArray`).
     - The resource path is resolved by the normal resolver (`resolveResource` → `resolver.resolve(contextInfo, context, unresolvedResource, resolveContext, ...)`), turning the bare specifier into an absolute filesystem path plus resolve metadata.
   - Once both sides return, runs **`ruleSet.exec()`** against the resolved resource to match `module.rules`, collecting pre/normal/post loaders from config.
   - Assembles `resolveData.createData`: the final merged loader list (`useLoadersPre + elements + useLoaders`), `userRequest`, resource data, and `settings.type`.

4. **`hooks.afterResolve`** fires (plugins can inspect/mutate `createData`).

5. **`hooks.createModule`** fires. If nothing intercepts it, the tap falls through to `hooks.createModuleClass.for(type).call(createData)` and then as a last resort **`new NormalModule(createData)`** (`NormalModuleFactory.js:528`). The new instance holds the resolved `request`, `resource`, `loaders` list, `parser`, and `generator`.

6. **`hooks.module`** fires for final decoration.

`factory.create` returns a `ModuleFactoryResult` carrying the new `NormalModule` plus the file/context/missing dependency sets collected during resolution.

---

### Stage 3: Deduplication — addModule

Back in `handleModuleCreation`'s callback, the factory result's file/context/missing dependencies are merged into `compilation.fileDependencies` etc. Then it calls **`addModule`** → `addModuleQueue.add(module, callback)` → **`_addModule`** (`Compilation.js:1596`).

`_addModule` checks `this._modules.get(module.identifier())` — if an identical module already exists (same resolved path + loaders + query) it returns the existing one immediately, discarding the newly constructed instance. Otherwise it checks the **persistent module cache** (`this._modulesCache.get(identifier, ...)`) — a cache hit calls `cacheModule.updateCacheModule(module)` to refresh the cached instance's mutable fields and returns it. For a true cache miss it simply registers:

```js
this._modules.set(identifier, module);
this.modules.add(module);
```

The returned module (which may or may not be the object that just came out of the factory) is the canonical instance going forward.

---

### Stage 4: Module graph wiring

Still inside `handleModuleCreation`'s callback, after `addModule` returns:

```js
moduleGraph.setResolvedModule(
    connectOrigin ? originModule : null,  // null for entry
    dependency,                           // the EntryDependency
    module                                // canonical NormalModule
);
```

This creates the `dependency → module` edge in the `ModuleGraph`. For an entry, `originModule` is `null`, so the dependency hangs off the graph root.

```js
moduleGraph.setIssuerIfUnset(module, null);
```

Sets the issuer (first importer) to `null` for an entry module.

Then **`_handleModuleBuildAndDependencies`** is called.

---

### Stage 5: Building — loaders + parser

**`_handleModuleBuildAndDependencies`** (`Compilation.js:2449`) calls **`buildModule`** → `buildQueue.add(module, callback)` → **`_buildModule`** (`Compilation.js:1670`).

`_buildModule`:
1. Calls `module.needBuild(...)` which checks the stored filesystem snapshot against current mtimes. For a new module this always returns `true`.
2. Fires `hooks.buildModule`, adds the module to `this.builtModules`.
3. Calls **`module.build(options, compilation, resolver, fs, callback)`**.

**`NormalModule.build`** (`NormalModule.js:1779`):
- Clears all previous build state: `_source`, `_ast`, `error`, `buildMeta`, `buildInfo`, and the existing `dependencies`/`blocks` arrays.
- Initialises fresh `buildInfo` with empty file/context/missing dependency sets.
- Calls **`_doBuild`** (`NormalModule.js:1468`).

**`_doBuild`** creates a `loaderContext` (the object loaders see as `this`), then calls **`runLoaders`** from `loader-runner`:
- `processResource` reads the file via `hooks.readResource.for(scheme).callAsync(loaderContext, ...)` — for the `file:` scheme the built-in handler reads from the input filesystem.
- Loaders in `this.loaders` run right-to-left in normal phase (each transforms the source), left-to-right in pitch phase (each can short-circuit). Each loader gets the full `loaderContext` giving it access to `this.addDependency`, `this.emitFile`, etc.
- `loader-runner` returns `{ result: [source, sourceMap?, extraInfo?], fileDependencies, contextDependencies, missingDependencies, cacheable }`.

`processResult` converts the raw string/Buffer into a webpack `Source` object stored as `this._source`, and stashes any `webpackAST` in `this._ast` (allowing loaders that already parsed the AST to pass it through).

Back in `build`'s callback from `_doBuild`:
- Fires `hooks.beforeParse`.
- Checks `noParse` rules — if matched, skips parsing and calls `handleBuildDone`.
- Calls **`this.parser.parse(this._ast || source, state)`** — the JavaScript parser (built on acorn) walks the AST, firing hook after hook for every `import`, `require`, `export`, dynamic `import()`, `module.exports`, `new URL(...)`, etc. Each of these hook handlers pushes a `Dependency` subclass instance into `module.dependencies` (or an async `Block` into `module.blocks`).
- `handleParseResult` sorts `module.dependencies` by source location, calls `_initBuildHash`.
- `handleBuildDone` converts the accumulated `fileDependencies`/`contextDependencies`/`missingDependencies` into a **filesystem snapshot** (`compilation.fileSystemInfo.createSnapshot`), stored in `buildInfo.snapshot` for future cache invalidation, and clears the raw sets.

After `module.build` completes, `_buildModule` stores the finished module into `this._modulesCache.store(identifier, ...)` (writing it to the persistent cache), fires `hooks.succeedModule`, and calls the build callback.

---

### Stage 6: Scheduling outgoing dependencies

Back in **`_handleModuleBuildAndDependencies`**: build is done, so it calls **`processModuleDependencies`** → `processDependenciesQueue.add(module, callback)` → **`_processModuleDependencies`** (`Compilation.js:1780`).

`_processModuleDependencies` walks `module.dependencies` (and recurses into `module.blocks`) in a tight synchronous loop:

For each dependency `dep`:
- Calls `moduleGraph.setParents(dep, currentBlock, module, index)` — this writes the `dep → (parentBlock, parentModule)` back-pointer into the module graph.
- Checks the unsafe in-memory cache for an already-resolved module (fast path).
- Falls through to `processDependencyForResolving(dep)`: reads `dep.getResourceIdentifier()` and `dep.category`, looks up the matching factory from `compilation.dependencyFactories`, then groups the dependency by `(factory, resourceIdent)` into a `sortedDependencies` list. Multiple dependencies pointing at the same resource are batched into a single `{ factory, dependencies: [...], originModule: module }` item so the resource is only resolved once.

Once sorting is complete (`onDependenciesSorted`), `processDependenciesQueue.increaseParallelism()` is called (preventing the queue from throttling this nested work), then for each `item` in `sortedDependencies`:

```js
this.handleModuleCreation(item, callback)
```

This re-enters **Stage 2** for each of the module's dependencies — factorize → add → build → process — with `originModule` now set to the current module. The cycle continues until no module produces new unresolved dependencies.

---

### The queue hierarchy

The four `AsyncQueue` instances (`Compilation.js:1214–1238`) form a parent chain that shares the parallelism budget:

```
processDependenciesQueue  (parallelism: 100)   ← root
  └─ addModuleQueue       (dedup key: module.identifier())
       └─ factorizeQueue
            └─ buildQueue
```

A child queue borrows a slot from its parent while it is actively processing an item, so the overall concurrency is bounded by `options.parallelism` (default 100). The dedup behaviour in `addModuleQueue` (keyed by `module.identifier()`) means that even if two concurrent dependency chains resolve to the same file, only one build runs; the second waiter gets the same result.
