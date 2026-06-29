# transcript: I want to trace what happens to a single entry dependency from the moment the build's make phase hands it to the compilation until it has become a fully buil...


💬 I'll load the LSP tool first, then trace through the code systematically.
  ▸ ToolSearch(select:LSP)

💬 Let me trace this in order, starting from how `make` hands off the entry, through resolution, building, and graph wiring.
  ▸ LSP(addEntry)
  ▸ LSP(EntryPlugin)
  ▸ LSP(addModuleTree)
  ▸ LSP(handleModuleCreation)
  ▸ Bash(find /home/bench/repos/webpack/lib -name "EntryPlugin.js" | head -3)
  ▸ LSP(factorizeModule)
  ▸ Read(/home/bench/repos/webpack/lib/EntryPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Now let me read `_factorizeModule` and `buildModule`/`_buildModule`:
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ LSP(buildModule)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ LSP(processModuleDependencies)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Now let me look at `NormalModuleFactory.create` and `NormalModule.build`:
  ▸ LSP(NormalModuleFactory create)
  ▸ LSP(addModule)

💬 Now let me read `_addModule` and `NormalModuleFactory.create`:
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)

💬 Now let me see how `factorize` hook works inside NormalModuleFactory (where actual resolve happens):
  ▸ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)

💬 Now let me look at `NormalModule.build` to see the loader-running and parse steps:
  ▸ LSP(NormalModule build)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)

💬 Let me read the `runLoaders` call and what follows in `_doBuild`, plus the parse step after `_doBuild`:
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)

💬 I now have everything I need to give you the complete, end-to-end trace. Here it is in order.  ---  ## End-to-end: entry dependency → fully wired module with...

──────── RESULT (success, 187509ms, 29 turns) ────────
I now have everything I need to give you the complete, end-to-end trace. Here it is in order.

---

## End-to-end: entry dependency → fully wired module with queued dependencies

### 1. `compiler.hooks.make` fires → entry dependency handed to compilation

`EntryPlugin.js:47` taps `compiler.hooks.make` asynchronously. When the compiler enters the make phase it fires every registered tap. `EntryPlugin`'s tap calls:

```
compilation.addEntry(context, dep, options, callback)
```

where `dep` is an `EntryDependency` instance that was created at plugin construction time (`EntryPlugin.js:45`). `EntryDependency` is just a `ModuleDependency` whose `request` field is the entry path string.

---

### 2. Entry registered in the compilation (`addEntry` → `_addEntryItem`)

`Compilation.js:2645–2652` — `addEntry` normalizes the options argument and immediately delegates to `_addEntryItem`.

`_addEntryItem` (`Compilation.js:2682`):
- Creates or finds the named `EntryData` record in `this.entries` (a `Map<string, EntryData>`). Each record holds arrays `dependencies` and `includeDependencies` plus merged options.
- Pushes the entry dep into `entryData.dependencies`.
- Fires `this.hooks.addEntry` (plugins that want to observe entries tap here).
- Calls **`this.addModuleTree`**, passing `{ context, dependency: entry, contextInfo }`.

---

### 3. Factory lookup and handoff (`addModuleTree`)

`Compilation.js:2591` — `addModuleTree`:
- Reads `dependency.constructor` (`EntryDependency`).
- Looks it up in `this.dependencyFactories` — a `Map` populated during the `compilation` hook by `EntryPlugin` itself (`EntryPlugin.js:37`): `EntryDependency → NormalModuleFactory`.
- Calls **`handleModuleCreation({ factory: normalModuleFactory, dependencies: [dep], originModule: null, context })`**.

`originModule: null` is the signal that this is a root module with no issuer.

---

### 4. Factorization queued (`handleModuleCreation` → `factorizeModule` → `_factorizeModule`)

`handleModuleCreation` (`Compilation.js:2298`) immediately calls `this.factorizeModule(...)` which enqueues the work on `this.factorizeQueue` (a bounded `AsyncQueue`). When a slot is free, `_factorizeModule` runs (`Compilation.js:2171`):

```js
factory.create({
    contextInfo: { issuer: "", issuerLayer: null, compiler: ... },
    resolveOptions: undefined,
    context,
    dependencies: [entryDep]
}, callback)
```

---

### 5. Resolution inside `NormalModuleFactory.create`

`NormalModuleFactory.js:1011` — `create`:
1. Pulls `request = dependency.request` from the first dependency (the entry path string).
2. Builds a `resolveData` object (`{contextInfo, context, request, dependencies, fileDependencies, missingDependencies, contextDependencies, createData: {}, cacheable: true}`).
3. Fires **`hooks.beforeResolve`** (async bail). Returning `false` short-circuits to an ignored/empty result.
4. Fires **`hooks.factorize`** (async bail). The default handler registered at stage 100 (`NormalModuleFactory.js:469`) fires **`hooks.resolve`**.

Inside the stage-100 **`hooks.resolve`** handler (`NormalModuleFactory.js:546`):
- Parses the request string: strips `!!`/`-!`/`!` prefixes, splits on `!` to find inline loaders, isolates the bare resource path.
- Calls `resolver.resolve(contextInfo, context, unresolvedResource, resolveContext, ...)` — this is `enhanced-resolve` walking the file system to produce an absolute path, plus query/fragment.
- In parallel, resolves all configured loaders (from ruleset match + inline). Each loader path is itself resolved by the loader resolver.
- `continueCallback` is called when both resource and loaders are resolved. It assembles the **`createData`** object: `{ resource, resourceData, loaders, request, userRequest, rawRequest, type, layer, parser, generator, ... }`.

After `hooks.resolve`:
5. Fires **`hooks.afterResolve`** (plugins can inspect/modify `resolveData` after path resolution).
6. Fires **`hooks.createModule`** (async bail). Plugins can return a custom `Module` subclass.
7. If nothing returned, falls back to `new NormalModule(createData)` (`NormalModuleFactory.js:528`).
8. Fires **`hooks.module`** (sync waterfall — can wrap or replace the module object).
9. Returns `{ module, fileDependencies, missingDependencies, contextDependencies, cacheable }` to `_factorizeModule`'s callback.

---

### 6. Module added to compilation (`handleModuleCreation` continued)

Back in `handleModuleCreation`'s factorize callback (`Compilation.js:2326`):
- `applyFactoryResultDependencies()` — copies the factory's `fileDependencies`/`contextDependencies`/`missingDependencies` into the compilation's global sets (used for watch invalidation).
- Calls **`this.addModule(newModule, callback)`** → enqueued on `addModuleQueue` → `_addModule` (`Compilation.js:1596`):
  - Computes `module.identifier()` (the unique string key, e.g. the absolute path).
  - Checks `this._modules.get(identifier)`: if already present, returns the existing module immediately (deduplication).
  - Otherwise hits `this._modulesCache.get(identifier)` (persistent disk cache). If a cached build is found, `cacheModule.updateCacheModule(module)` merges fresh factory data into the cached instance.
  - Registers: `this._modules.set(identifier, module)` and `this.modules.add(module)`.

**Module graph wiring** (back in `handleModuleCreation`, `Compilation.js:2403`):
```js
moduleGraph.setResolvedModule(
    null,          // originModule (null = no parent)
    entryDep,      // the dependency object
    module         // the resolved module
);
moduleGraph.setIssuerIfUnset(module, null);  // marks it as a root
```

`setResolvedModule` creates a `ModuleGraphConnection` in the graph — it's the authoritative link between a dependency object and the module it resolved to. `setIssuerIfUnset` records that this module has no issuer (it's an entry).

---

### 7. Build queued (`_handleModuleBuildAndDependencies` → `buildModule` → `_buildModule`)

`handleModuleCreation` calls `_handleModuleBuildAndDependencies` (`Compilation.js:2449`), which calls `this.buildModule(module, ...)` → enqueued on `this.buildQueue` → `_buildModule` runs (`Compilation.js:1670`):

1. Calls **`module.needBuild({ compilation, fileSystemInfo, valueCacheVersions }, callback)`** — checks the filesystem snapshot from the previous build. If unchanged, fires `hooks.stillValidModule` and returns without rebuilding.
2. If a build is needed:
   - Fires `this.hooks.buildModule`.
   - Adds the module to `this.builtModules`.
   - Calls **`module.build(options, compilation, resolver, fs, callback)`**.

---

### 8. Loader pipeline (`NormalModule.build` → `_doBuild` → `runLoaders`)

`NormalModule.build` (`NormalModule.js:1779`):
- Resets all build state: clears source, AST, error, dependencies, blocks, `buildMeta`, `buildInfo`.
- Calls `_doBuild(options, compilation, resolver, fs, hooks, callback)` (`NormalModule.js:1468`):
  - Creates the **loader context** (`_createLoaderContext`) — the `this` object exposed to loaders, containing `emitFile`, `addDependency`, `async`, `loaderIndex`, etc.
  - Fires `hooks.beforeLoaders`.
  - Calls **`runLoaders`** (from `loader-runner` npm package):
    - Reads the resource file via `hooks.readResource.for(scheme).callAsync(loaderContext, ...)`.
    - Runs loaders in **pitch phase** (left-to-right), then **normal phase** (right-to-left). Each loader receives the source from the previous and returns a transformed string/Buffer (possibly plus a source map).
    - File/context/missing dependencies accumulated by loaders via `addDependency`/`addContextDependency` land in `buildInfo.fileDependencies` etc.
  - `processResult` callback: stores final output as `this._source` (a `RawSource` or `SourceMapSource`); captures `extraInfo.webpackAST` as a pre-parsed AST if a loader provided one.

---

### 9. Parser run — dependencies discovered (`NormalModule.build` continued)

Back in `NormalModule.build` after `_doBuild` returns (`NormalModule.js:1820`):

- Fires `hooks.beforeParse`.
- Checks `module.noParse` config — if matched, sets `buildInfo.parsed = false` and skips parsing.
- Calls **`this.parser.parse(this._ast || source, { current: this, module: this, compilation, options })`**:
  - For `javascript/auto`/`javascript/esm`/`javascript/dynamic` types this is `JavascriptParser`.
  - `JavascriptParser` walks the AST and fires granular hooks (`importDeclaration`, `callExpression`, `expressionMemberChain`, etc.).
  - Plugins/parser-plugin handlers respond to those hooks by pushing `Dependency` instances into `module.dependencies` (e.g. `HarmonyImportDependency` for `import`, `CommonJsDependency` for `require`) and `AsyncDependenciesBlock` into `module.blocks` (for `import()`).
- `handleParseResult` sorts `module.dependencies` by source location, calls `_initBuildHash`, stores `_lastSuccessfulBuildMeta`.
- `handleBuildDone` creates a **filesystem snapshot** (`fileSystemInfo.createSnapshot`) capturing the set of files that were read, then calls the build callback.

Back in `_buildModule`: stores the finished module in `_modulesCache` (persistent cache write), fires `hooks.succeedModule`.

---

### 10. Dependencies scheduled (`processModuleDependencies`)

Back in `_handleModuleBuildAndDependencies` after build (`Compilation.js:2500`): calls **`this.processModuleDependencies(module, ...)`** → `processDependenciesQueue` → `_processModuleDependencies` (`Compilation.js:1780`):

- Walks the module's `dependencies` and `blocks` (BFS/queue over `DependenciesBlock`).
- For each dependency:
  - **`moduleGraph.setParents(dep, currentBlock, module, index)`** — writes the dependency's parent block and position into the module graph. This is what allows later graph queries to know which module contains a dependency and where.
  - Calls `processDependencyForResolving(dep)` which:
    - Calls `dep.getResourceIdentifier()` to get the canonical key (e.g. the resolved request string). Deps that return `null` (e.g. pure side-effect deps) are skipped.
    - Looks up the factory: `dependencyFactories.get(dep.constructor)`.
    - Groups deps by `(factory, category + resourceIdent)` into `sortedDependencies` — multiple import sites for the same module share one entry so the module is only factorized once.

Once sorting is complete (`onDependenciesSorted`):
- Calls **`this.handleModuleCreation(item, ...)`** for each group in `sortedDependencies`.

**This re-enters the cycle at step 4** for each outgoing dependency of the entry module. Each one will be factorized, resolved, added to `_modules`, graph-wired, built with its own loader pipeline, parsed for its own dependencies, and its dependencies will be scheduled — recursively until the whole reachable graph is built.

---

## Quick reference: key files and line numbers

| Step | Location |
|---|---|
| Entry dep created, `make` fired | `lib/EntryPlugin.js:45–51` |
| Entry registered in `compilation.entries` | `lib/Compilation.js:2682` (`_addEntryItem`) |
| Factory lookup, `handleModuleCreation` | `lib/Compilation.js:2591` (`addModuleTree`) |
| Factorize queue enqueue | `lib/Compilation.js:2271` (`factorizeModule`) |
| `factory.create` called | `lib/Compilation.js:2186` (`_factorizeModule`) |
| Request parsing, `enhanced-resolve` resolution | `lib/NormalModuleFactory.js:546` (stage-100 `resolve` tap) |
| `NormalModule` instantiated | `lib/NormalModuleFactory.js:528` |
| `_addModule`, dedup, `_modules` registration | `lib/Compilation.js:1596` |
| `moduleGraph.setResolvedModule` | `lib/Compilation.js:2404` |
| `moduleGraph.setIssuerIfUnset` | `lib/Compilation.js:2412` |
| Build queue enqueue | `lib/Compilation.js:1660` (`buildModule`) |
| `module.needBuild` check | `lib/Compilation.js:1678` |
| Loader pipeline (`runLoaders`) | `lib/NormalModule.js:1567` |
| Parser invoked | `lib/NormalModule.js:1975` |
| `setParents` on each dep | `lib/Compilation.js:1869` |
| Groups sorted, `handleModuleCreation` per dep | `lib/Compilation.js:1829` (`onDependenciesSorted`) |
