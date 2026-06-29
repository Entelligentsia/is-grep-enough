# webpack · L3 · baseline — readable transcript

> baseline — text search (bash + coreutils), over **webpack** (javascript) @ `ff19f174a`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `baseline` — text search (bash + coreutils) |
| repo · rung | webpack (javascript) · L3 |
| pinned source | `ff19f174abd5e3dbbfd91a355034b0b15b2a1b01` |
| status | completed |
| engagement | `bash_calls = 10` (gate: > 0 → ✓ used its capability) |
| turns | 17 |
| wall clock | 197 s |
| context (peak) | 323,592 tokens |
| cost (billed) | $0.6773 |
| &nbsp;&nbsp;↳ token split | in 2,711 · out 7,524 · cache-create 27,802 · cache-read 293,079 |
| tool calls | 42 (Read×30, Bash×10, Agent×2) |
| evidence | `evidence/nav3/L3/raw/webpack-L3.claude.baseline.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens to a single entry dependency from the moment the build's make phase hands it to the compilation until it has become a fully built module wired into the module graph with its own outgoing dependencies queued for the same treatment. I'm interested in how the entry becomes a module request, how that request is resolved and turned into a module instance, how that module then gets built (loaders run and source parsed), and how the module graph is updated and the new module's dependencies are scheduled. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll trace this end-to-end through the source. Let me explore the key files in parallel.

▸ `Agent(Trace entry dependency through webpack compilation)`  ⟶ subagent:
    ↳ `Read(/home/bench/repos/webpack)`
    ↳ `Bash(find /home/bench/repos/webpack -name "Compiler.js" -o -name "EntryPlugin.js" -o -name "Compilation.js" -o -name "NormalModuleFactory.js" -o -name "NormalModule.js" -o -name "ModuleGraph.js" | grep -v node_modules | head -20)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compiler.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/EntryPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/NormalModule.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/ModuleGraph.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/NormalModule.js)`
    ↳ `Bash(grep -n "^\s*build(" /home/bench/repos/webpack/lib/NormalModule.js | head -5)`
    ↳ ⟹ returned to parent

▸ `Agent(Read Compilation.js addEntry through buildModule)`  ⟶ subagent:
    ↳ `Bash(find /home/bench/repos/webpack -name "Compilation.js" -o -name "EntryPlugin.js" | head -20)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Bash(grep -n "^\s*addEntry\|^\s*_addEntryItem\|^\s*addModuleTree\|^\s*handleModuleCreation\|^\s*factorizeModule\|^\s*addModule\|^\s*buildModule\|^\s*processModuleDependencies\|^\s*_handleModuleBuildAndDependencies" /home/bench/repos/webpack/lib/Compilation.js | head -40)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Bash(grep -n "_factorizeModule" /home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/EntryPlugin.js)`
    ↳ ⟹ returned to parent


💬 Good raw data. Let me verify the NormalModuleFactory and ModuleGraph details directly.

&nbsp;&nbsp;▸ `Bash(grep -n "setResolvedModule\|setIssuerIfUnset\|addModuleGraphModule\|addDependency" /home/bench/repos/webpack/lib/ModuleGraph.js | head -40)`
&nbsp;&nbsp;▸ `Bash(grep -n "setResolvedModule\|setIssuerIfUnset\|moduleGraph\." /home/bench/repos/webpack/lib/Compilation.js | head -40)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/ModuleGraph.js)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
&nbsp;&nbsp;▸ `Bash(grep -n "hooks.resolve\|hooks.factorize\|hooks.beforeResolve\|hooks.afterResolve\|hooks.createModule\|hooks.module\b\|resolveResource\|resolveRequestArray" /home/bench/repos/webpack/lib/NormalModuleFactory.js | head -50)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/NormalModuleFactory.js)`
&nbsp;&nbsp;▸ `Bash(grep -n "doBuild\|_doBuild\|runLoaders\|parser\.parse\|handleParseResult\|handleBuildDone\|processResult\|createSource" /home/bench/repos/webpack/lib/NormalModule.js | head -50)`
&nbsp;&nbsp;▸ `Bash(grep -n "processModuleDependencies\|_processModuleDependencies\|processDependency\|processDependencyForResolving\|onDependenciesSorted\|handleModuleCreation" /home/bench/repos/webpack/lib/Compilation.js | head -40)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/NormalModule.js)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/NormalModule.js)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/NormalModule.js)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/webpack/lib/Compilation.js)`

💬 I now have everything verified. Here is the end-to-end trace.

---

## Entry dependency to fully-built module: the complete sequence

### 1. The make phase fires — `Compiler.js:1415`

`Compiler.compile()` calls:

```js
this.hooks.make.callAsync(compilation, callback)
```

`hooks.make` is an `AsyncParallelHook`. Every plugin that tapped it gets called concurrently. For an entry point, the relevant tap is the one `EntryPlugin` registered when the compiler was set up.

---

### 2. EntryPlugin responds — `lib/EntryPlugin.js:47`

`EntryPlugin.apply()` does two things in two separate hook taps:

**On `compiler.hooks.compilation`** (lines 34–44): it registers `EntryDependency` in `compilation.dependencyFactories`, mapping `EntryDependency → NormalModuleFactory`. This is what lets the compilation later look up which factory to use for an entry dep.

**On `compiler.hooks.make`** (lines 47–51): it calls into the compilation:

```js
compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
    compilation.addEntry(context, dep, options, callback);
});
```

`dep` is an `EntryDependency` instance wrapping the entry request string (e.g. `"./src/index.js"`). `options` carries the entry name, layer, etc.

---

### 3. Entry item is registered — `Compilation.js:2645` → `2682`

**`addEntry`** (line 2645) normalises the options argument (name string vs object) and immediately delegates:

```js
this._addEntryItem(context, entry, "dependencies", options, callback);
```

**`_addEntryItem`** (line 2682) creates or updates an `EntryData` record in `this.entries` (a `Map` keyed by entry name), pushes the `EntryDependency` into the entry's `dependencies` array, fires the `hooks.addEntry` sync hook to let plugins observe it, then hands off to `addModuleTree`.

---

### 4. Module tree rooted here — `Compilation.js:2591`

**`addModuleTree`** does exactly one thing: look up the factory for the entry dependency:

```js
const moduleFactory = this.dependencyFactories.get(
    /** @type {DepConstructor} */ (dependency.constructor)
);
```

Because `EntryPlugin` registered `EntryDependency → NormalModuleFactory`, this returns the `NormalModuleFactory`. Then:

```js
this.handleModuleCreation(
    { factory: moduleFactory, dependencies: [dependency],
      originModule: null, contextInfo, context },
    callback
);
```

`originModule: null` is the signal that this is a root entry — it has no parent.

---

### 5. Three queues, one per stage — `Compilation.js:2298`

**`handleModuleCreation`** (line 2298) is the central coordinator. It does *not* call everything inline — webpack runs three separate async queues (`factorizeQueue`, `addModuleQueue`, `buildQueue`, `processDependenciesQueue`) with controlled parallelism. `handleModuleCreation` kicks off the first:

```js
this.factorizeModule({ factory, dependencies, factoryResult: true,
                       originModule, contextInfo, context, currentProfile }, callback);
```

`factorizeModule` (line 2271) just enqueues on `this.factorizeQueue`; the processor is `_factorizeModule`.

---

### 6. Factory creates the module — `Compilation.js:2171` → `NormalModuleFactory`

**`_factorizeModule`** (line 2171) calls `factory.create()` passing a context object:

```js
factory.create({
    contextInfo: { issuer: originModule?.nameForCondition(), issuerLayer, compiler },
    resolveOptions: originModule?.resolveOptions,
    context,
    dependencies
}, callback);
```

Inside **`NormalModuleFactory.create()`** (line 1011), a `resolveData` object is assembled from the dependency's `.request` string plus the context info. Then the resolution pipeline runs through three async hooks in series:

**`hooks.beforeResolve`** (line 1054) — plugins can redirect or ignore requests here (e.g. `IgnorePlugin`).

**`hooks.factorize`** (line 1090) — the factory's own tap at stage 100 (line 469) runs this sub-pipeline:

> **`hooks.resolve`** (line 475) — the factory's own tap at stage 100 (line 546) does the real resolution work:
>
> - `loaderResolver = this.getResolver("loader")` (line 565) — a resolver configured for finding loader packages.
> - The request string is split into inline loaders, match-resource part, and the resource path.
> - Pre-, normal, and post-loaders come from `options.module.rules` matches; each list is resolved to absolute paths via **`this.resolveRequestArray()`** (lines 852–887), which calls `loaderResolver.resolve()` for each loader name.
> - The resource path is resolved via **`this.resolveResource()`** (line 926), which calls `normalResolver.resolve()` to turn `"./src/index.js"` into an absolute filesystem path with any query/fragment preserved.
> - The resolved loaders and resource are assembled into `resolveData.createData`, which includes `loaders`, `resource`, `request` (the full `!loader!resource` string), `parser`, `generator`, `type`, and `resolveOptions`.
>
> **`hooks.afterResolve`** (line 493) — plugins can inspect or modify the resolved data.
>
> **`hooks.createModule`** (line 512) — plugins can return a custom module; if none do, the factory falls through to `new NormalModule(createData)` (line 528).
>
> **`hooks.module`** (line 533) — a `SyncWaterfallHook` that lets plugins wrap or replace the module instance.

The factory's `create` callback receives a `ModuleFactoryResult` containing the new `NormalModule` instance.

---

### 7. Module is deduplicated and registered — `Compilation.js:2362`

Back in `handleModuleCreation`'s callback (line 2362):

```js
this.addModule(newModule, (err, _module) => { ... });
```

**`addModule`** enqueues on `addModuleQueue`; the processor is **`_addModule`** (line 1596). It checks `this._modules` (a `Map<identifier → Module>`) for an existing module with the same identifier. If it finds one, it returns that cached instance — this is how two different entry points importing the same file share one module. If the module is new, it's also checked against the persistent cache (`this._modulesCache`); if a previously-built version is found, `updateCacheModule()` merges it. Either way the module ends up in `this._modules` and `this.modules`.

---

### 8. Module is wired into the module graph — `Compilation.js:2388`

Still inside `handleModuleCreation`'s `addModule` callback, before `_handleModuleBuildAndDependencies` is called:

```js
moduleGraph.setResolvedModule(
    connectOrigin ? originModule : null,
    dependency,
    module
);
```

**`ModuleGraph.setResolvedModule`** (line 259) constructs a **`ModuleGraphConnection`** object:

```js
const connection = new ModuleGraphConnection(
    originModule,   // null for the entry
    dependency,     // the EntryDependency
    module,         // the NormalModule
    undefined,
    dependency.weak,
    dependency.getCondition(this)
);
```

It adds this connection to `module`'s `incomingConnections` set. Because `originModule` is `null` for an entry, the connection is also stored in `this._dependencyMap` (keyed by the dependency instance itself) rather than in an origin module's `outgoingConnections`.

```js
moduleGraph.setIssuerIfUnset(module, originModule !== undefined ? originModule : null);
```

This records the issuer (parent module) in the `ModuleGraphModule` for `module` — `null` for an entry, the importing module for everything else.

---

### 9. Module is built — `Compilation.js:2500` → `NormalModule.js`

**`_handleModuleBuildAndDependencies`** (line 2449) first checks for build-during-build cycles (relevant only when a plugin triggers module creation from inside a build hook), then calls:

```js
this.buildModule(module, callback);
```

**`buildModule`** enqueues on `buildQueue`; the processor is **`_buildModule`** (line 1670). It first asks `module.needBuild()` whether a rebuild is actually necessary (checking the filesystem snapshot from the last build). Assuming the module is new or invalidated:

```js
this.hooks.buildModule.call(module);   // plugins observe build start
module.build(this.options, this,
    this.resolverFactory.get("normal", module.resolveOptions),
    this.inputFileSystem,
    callback);
```

Inside **`NormalModule.build()`** (line 1779), build metadata is reset, then **`_doBuild()`** is called (line 1820).

**`_doBuild()`** (line 1468):
- Builds a `loaderContext` object — this is the `this` that loaders see, with `loaderIndex`, `loaders`, `resourcePath`, `query`, `async()`, `emitFile()`, etc.
- Calls **`runLoaders()`** (from the `loader-runner` package, line 1567), passing the resource path and the ordered loader list. `runLoaders` executes the chain: resource is read from the filesystem (or a custom scheme handler), then passed right-to-left through `pitch` calls and left-to-right through the main loader functions. Each loader transforms `source → source`.
- When `runLoaders` completes, `processResult` (line 1482) is called: it fires `hooks.processResult` (a `SyncWaterfallHook`, line 1497) so plugins can post-process, then calls **`this.createSource()`** (line 1526) to wrap the output string/buffer in a webpack `Source` object (`RawSource`, `OriginalSource`, or `SourceMapSource` depending on whether a source map was emitted). This is stored in `this._source`.

Back in `build()` after `_doBuild()` completes (line 1820):
- `hooks.beforeParse.call(this)` (line 1954) — plugins can mutate the module before parsing.
- `module.noParse` is checked (line 1964); if matched, parsing is skipped.
- **`this.parser.parse(this._ast || source, { source, current: this, module: this, compilation, options, ... })`** (line 1975) runs. For JS modules this is the `JavascriptParser`, which walks the AST. Every time it encounters an `import`, `require()`, `export`, `import()`, etc., it calls `module.addDependency()` or `module.addBlock()` (for async splits), appending typed `Dependency` subclass instances to `this.dependencies` (and blocks to `this.blocks`). These dependency objects carry the raw request string and source location but are not yet resolved.
- On success, **`handleParseResult()`** (line 1843) sorts `this.dependencies` by source location, calls `this._initBuildHash()` to compute a hash of the build output, then calls `handleBuildDone()`.
- **`handleBuildDone()`** (line 1858) fires `hooks.beforeSnapshot`, then asks `compilation.fileSystemInfo` to take a filesystem snapshot of the module's `fileDependencies` / `contextDependencies` / `missingDependencies`. This snapshot is stored in `buildInfo.snapshot` and will be checked on future builds to determine if `needBuild()` returns true. Then `callback()` is called to signal the build is complete.

Back in `_buildModule`, after `module.build()` returns: the module is stored in the persistent module cache and `hooks.succeedModule` fires.

---

### 10. Dependencies are scheduled — `Compilation.js:2561` → `2832`

Back in `_handleModuleBuildAndDependencies` after `buildModule` returns (line 2561):

```js
this.processModuleDependencies(module, callback);
```

**`processModuleDependencies`** enqueues on `processDependenciesQueue`; the processor is **`_processModuleDependencies`** (line 1780).

This method walks `module.dependencies` (and recursively `module.blocks[*].dependencies` for async chunks) and for each dependency:

1. **`moduleGraph.setParents(dep, block, module, index)`** (line 1763/1869) — records which block and source position this dependency belongs to in the graph.
2. **`processDependency(dep, index)`** (line 1868) — looks up the factory for `dep.constructor` in `this.dependencyFactories`. If a factory exists, it groups the dependency under `(factory, contextPath)` to batch requests that resolve from the same directory against the same factory. The `unsafe cache` is also consulted here: if a previous run already resolved this exact request, the result can be replayed without calling the factory again.
3. After all dependencies are grouped (the `inProgressSorting` counter reaches zero), **`onDependenciesSorted()`** (line 1818) fires. It iterates the `sortedDependencies` array and for each group calls:

```js
this.handleModuleCreation(item, callback);
```

Where `item` is `{ factory, dependencies, context, originModule: module }`. This is the recursive re-entry into **step 5** — but now `originModule` is the just-built module rather than `null`, so the graph connections created in **step 8** will link the child back to its parent.

The `processDependenciesQueue` temporarily increases its parallelism ceiling (`increaseParallelism()` at line 1827) so that the fan-out of dependency resolution for a single module's children can proceed concurrently, then restores it when all children complete (`decreaseParallelism()` at line 1857).

---

### The shape of the cycle

```
make hook fires
  └─ EntryPlugin → compilation.addEntry
       └─ _addEntryItem (register in entries map)
            └─ addModuleTree (look up factory)
                 └─ handleModuleCreation
                      ├─ factorizeModule (queue) → _factorizeModule
                      │    └─ NormalModuleFactory.create
                      │         ├─ hooks.beforeResolve
                      │         └─ hooks.factorize
                      │              └─ hooks.resolve
                      │                   ├─ resolveRequestArray → loader paths
                      │                   └─ resolveResource → resource path
                      │              └─ hooks.afterResolve
                      │              └─ hooks.createModule → new NormalModule
                      │              └─ hooks.module
                      ├─ addModule (queue) → _addModule (dedup/cache)
                      ├─ moduleGraph.setResolvedModule → ModuleGraphConnection
                      ├─ moduleGraph.setIssuerIfUnset
                      └─ _handleModuleBuildAndDependencies
                           └─ buildModule (queue) → _buildModule
                                └─ NormalModule.build
                                     └─ _doBuild → runLoaders → this._source
                                     └─ parser.parse → module.addDependency(...)
                                     └─ handleParseResult → sort deps, hash, snapshot
                           └─ processModuleDependencies (queue)
                                └─ _processModuleDependencies
                                     └─ for each dep: handleModuleCreation(...)  ← recurse
```

Every discovered dependency re-enters `handleModuleCreation` with the just-built module as its `originModule`, which is how the graph grows outward from the entry until no new modules are found.


## Final answer

_Result event — success, 197 s, 17 turns._

I now have everything verified. Here is the end-to-end trace.

---

## Entry dependency to fully-built module: the complete sequence

### 1. The make phase fires — `Compiler.js:1415`

`Compiler.compile()` calls:

```js
this.hooks.make.callAsync(compilation, callback)
```

`hooks.make` is an `AsyncParallelHook`. Every plugin that tapped it gets called concurrently. For an entry point, the relevant tap is the one `EntryPlugin` registered when the compiler was set up.

---

### 2. EntryPlugin responds — `lib/EntryPlugin.js:47`

`EntryPlugin.apply()` does two things in two separate hook taps:

**On `compiler.hooks.compilation`** (lines 34–44): it registers `EntryDependency` in `compilation.dependencyFactories`, mapping `EntryDependency → NormalModuleFactory`. This is what lets the compilation later look up which factory to use for an entry dep.

**On `compiler.hooks.make`** (lines 47–51): it calls into the compilation:

```js
compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
    compilation.addEntry(context, dep, options, callback);
});
```

`dep` is an `EntryDependency` instance wrapping the entry request string (e.g. `"./src/index.js"`). `options` carries the entry name, layer, etc.

---

### 3. Entry item is registered — `Compilation.js:2645` → `2682`

**`addEntry`** (line 2645) normalises the options argument (name string vs object) and immediately delegates:

```js
this._addEntryItem(context, entry, "dependencies", options, callback);
```

**`_addEntryItem`** (line 2682) creates or updates an `EntryData` record in `this.entries` (a `Map` keyed by entry name), pushes the `EntryDependency` into the entry's `dependencies` array, fires the `hooks.addEntry` sync hook to let plugins observe it, then hands off to `addModuleTree`.

---

### 4. Module tree rooted here — `Compilation.js:2591`

**`addModuleTree`** does exactly one thing: look up the factory for the entry dependency:

```js
const moduleFactory = this.dependencyFactories.get(
    /** @type {DepConstructor} */ (dependency.constructor)
);
```

Because `EntryPlugin` registered `EntryDependency → NormalModuleFactory`, this returns the `NormalModuleFactory`. Then:

```js
this.handleModuleCreation(
    { factory: moduleFactory, dependencies: [dependency],
      originModule: null, contextInfo, context },
    callback
);
```

`originModule: null` is the signal that this is a root entry — it has no parent.

---

### 5. Three queues, one per stage — `Compilation.js:2298`

**`handleModuleCreation`** (line 2298) is the central coordinator. It does *not* call everything inline — webpack runs three separate async queues (`factorizeQueue`, `addModuleQueue`, `buildQueue`, `processDependenciesQueue`) with controlled parallelism. `handleModuleCreation` kicks off the first:

```js
this.factorizeModule({ factory, dependencies, factoryResult: true,
                       originModule, contextInfo, context, currentProfile }, callback);
```

`factorizeModule` (line 2271) just enqueues on `this.factorizeQueue`; the processor is `_factorizeModule`.

---

### 6. Factory creates the module — `Compilation.js:2171` → `NormalModuleFactory`

**`_factorizeModule`** (line 2171) calls `factory.create()` passing a context object:

```js
factory.create({
    contextInfo: { issuer: originModule?.nameForCondition(), issuerLayer, compiler },
    resolveOptions: originModule?.resolveOptions,
    context,
    dependencies
}, callback);
```

Inside **`NormalModuleFactory.create()`** (line 1011), a `resolveData` object is assembled from the dependency's `.request` string plus the context info. Then the resolution pipeline runs through three async hooks in series:

**`hooks.beforeResolve`** (line 1054) — plugins can redirect or ignore requests here (e.g. `IgnorePlugin`).

**`hooks.factorize`** (line 1090) — the factory's own tap at stage 100 (line 469) runs this sub-pipeline:

> **`hooks.resolve`** (line 475) — the factory's own tap at stage 100 (line 546) does the real resolution work:
>
> - `loaderResolver = this.getResolver("loader")` (line 565) — a resolver configured for finding loader packages.
> - The request string is split into inline loaders, match-resource part, and the resource path.
> - Pre-, normal, and post-loaders come from `options.module.rules` matches; each list is resolved to absolute paths via **`this.resolveRequestArray()`** (lines 852–887), which calls `loaderResolver.resolve()` for each loader name.
> - The resource path is resolved via **`this.resolveResource()`** (line 926), which calls `normalResolver.resolve()` to turn `"./src/index.js"` into an absolute filesystem path with any query/fragment preserved.
> - The resolved loaders and resource are assembled into `resolveData.createData`, which includes `loaders`, `resource`, `request` (the full `!loader!resource` string), `parser`, `generator`, `type`, and `resolveOptions`.
>
> **`hooks.afterResolve`** (line 493) — plugins can inspect or modify the resolved data.
>
> **`hooks.createModule`** (line 512) — plugins can return a custom module; if none do, the factory falls through to `new NormalModule(createData)` (line 528).
>
> **`hooks.module`** (line 533) — a `SyncWaterfallHook` that lets plugins wrap or replace the module instance.

The factory's `create` callback receives a `ModuleFactoryResult` containing the new `NormalModule` instance.

---

### 7. Module is deduplicated and registered — `Compilation.js:2362`

Back in `handleModuleCreation`'s callback (line 2362):

```js
this.addModule(newModule, (err, _module) => { ... });
```

**`addModule`** enqueues on `addModuleQueue`; the processor is **`_addModule`** (line 1596). It checks `this._modules` (a `Map<identifier → Module>`) for an existing module with the same identifier. If it finds one, it returns that cached instance — this is how two different entry points importing the same file share one module. If the module is new, it's also checked against the persistent cache (`this._modulesCache`); if a previously-built version is found, `updateCacheModule()` merges it. Either way the module ends up in `this._modules` and `this.modules`.

---

### 8. Module is wired into the module graph — `Compilation.js:2388`

Still inside `handleModuleCreation`'s `addModule` callback, before `_handleModuleBuildAndDependencies` is called:

```js
moduleGraph.setResolvedModule(
    connectOrigin ? originModule : null,
    dependency,
    module
);
```

**`ModuleGraph.setResolvedModule`** (line 259) constructs a **`ModuleGraphConnection`** object:

```js
const connection = new ModuleGraphConnection(
    originModule,   // null for the entry
    dependency,     // the EntryDependency
    module,         // the NormalModule
    undefined,
    dependency.weak,
    dependency.getCondition(this)
);
```

It adds this connection to `module`'s `incomingConnections` set. Because `originModule` is `null` for an entry, the connection is also stored in `this._dependencyMap` (keyed by the dependency instance itself) rather than in an origin module's `outgoingConnections`.

```js
moduleGraph.setIssuerIfUnset(module, originModule !== undefined ? originModule : null);
```

This records the issuer (parent module) in the `ModuleGraphModule` for `module` — `null` for an entry, the importing module for everything else.

---

### 9. Module is built — `Compilation.js:2500` → `NormalModule.js`

**`_handleModuleBuildAndDependencies`** (line 2449) first checks for build-during-build cycles (relevant only when a plugin triggers module creation from inside a build hook), then calls:

```js
this.buildModule(module, callback);
```

**`buildModule`** enqueues on `buildQueue`; the processor is **`_buildModule`** (line 1670). It first asks `module.needBuild()` whether a rebuild is actually necessary (checking the filesystem snapshot from the last build). Assuming the module is new or invalidated:

```js
this.hooks.buildModule.call(module);   // plugins observe build start
module.build(this.options, this,
    this.resolverFactory.get("normal", module.resolveOptions),
    this.inputFileSystem,
    callback);
```

Inside **`NormalModule.build()`** (line 1779), build metadata is reset, then **`_doBuild()`** is called (line 1820).

**`_doBuild()`** (line 1468):
- Builds a `loaderContext` object — this is the `this` that loaders see, with `loaderIndex`, `loaders`, `resourcePath`, `query`, `async()`, `emitFile()`, etc.
- Calls **`runLoaders()`** (from the `loader-runner` package, line 1567), passing the resource path and the ordered loader list. `runLoaders` executes the chain: resource is read from the filesystem (or a custom scheme handler), then passed right-to-left through `pitch` calls and left-to-right through the main loader functions. Each loader transforms `source → source`.
- When `runLoaders` completes, `processResult` (line 1482) is called: it fires `hooks.processResult` (a `SyncWaterfallHook`, line 1497) so plugins can post-process, then calls **`this.createSource()`** (line 1526) to wrap the output string/buffer in a webpack `Source` object (`RawSource`, `OriginalSource`, or `SourceMapSource` depending on whether a source map was emitted). This is stored in `this._source`.

Back in `build()` after `_doBuild()` completes (line 1820):
- `hooks.beforeParse.call(this)` (line 1954) — plugins can mutate the module before parsing.
- `module.noParse` is checked (line 1964); if matched, parsing is skipped.
- **`this.parser.parse(this._ast || source, { source, current: this, module: this, compilation, options, ... })`** (line 1975) runs. For JS modules this is the `JavascriptParser`, which walks the AST. Every time it encounters an `import`, `require()`, `export`, `import()`, etc., it calls `module.addDependency()` or `module.addBlock()` (for async splits), appending typed `Dependency` subclass instances to `this.dependencies` (and blocks to `this.blocks`). These dependency objects carry the raw request string and source location but are not yet resolved.
- On success, **`handleParseResult()`** (line 1843) sorts `this.dependencies` by source location, calls `this._initBuildHash()` to compute a hash of the build output, then calls `handleBuildDone()`.
- **`handleBuildDone()`** (line 1858) fires `hooks.beforeSnapshot`, then asks `compilation.fileSystemInfo` to take a filesystem snapshot of the module's `fileDependencies` / `contextDependencies` / `missingDependencies`. This snapshot is stored in `buildInfo.snapshot` and will be checked on future builds to determine if `needBuild()` returns true. Then `callback()` is called to signal the build is complete.

Back in `_buildModule`, after `module.build()` returns: the module is stored in the persistent module cache and `hooks.succeedModule` fires.

---

### 10. Dependencies are scheduled — `Compilation.js:2561` → `2832`

Back in `_handleModuleBuildAndDependencies` after `buildModule` returns (line 2561):

```js
this.processModuleDependencies(module, callback);
```

**`processModuleDependencies`** enqueues on `processDependenciesQueue`; the processor is **`_processModuleDependencies`** (line 1780).

This method walks `module.dependencies` (and recursively `module.blocks[*].dependencies` for async chunks) and for each dependency:

1. **`moduleGraph.setParents(dep, block, module, index)`** (line 1763/1869) — records which block and source position this dependency belongs to in the graph.
2. **`processDependency(dep, index)`** (line 1868) — looks up the factory for `dep.constructor` in `this.dependencyFactories`. If a factory exists, it groups the dependency under `(factory, contextPath)` to batch requests that resolve from the same directory against the same factory. The `unsafe cache` is also consulted here: if a previous run already resolved this exact request, the result can be replayed without calling the factory again.
3. After all dependencies are grouped (the `inProgressSorting` counter reaches zero), **`onDependenciesSorted()`** (line 1818) fires. It iterates the `sortedDependencies` array and for each group calls:

```js
this.handleModuleCreation(item, callback);
```

Where `item` is `{ factory, dependencies, context, originModule: module }`. This is the recursive re-entry into **step 5** — but now `originModule` is the just-built module rather than `null`, so the graph connections created in **step 8** will link the child back to its parent.

The `processDependenciesQueue` temporarily increases its parallelism ceiling (`increaseParallelism()` at line 1827) so that the fan-out of dependency resolution for a single module's children can proceed concurrently, then restores it when all children complete (`decreaseParallelism()` at line 1857).

---

### The shape of the cycle

```
make hook fires
  └─ EntryPlugin → compilation.addEntry
       └─ _addEntryItem (register in entries map)
            └─ addModuleTree (look up factory)
                 └─ handleModuleCreation
                      ├─ factorizeModule (queue) → _factorizeModule
                      │    └─ NormalModuleFactory.create
                      │         ├─ hooks.beforeResolve
                      │         └─ hooks.factorize
                      │              └─ hooks.resolve
                      │                   ├─ resolveRequestArray → loader paths
                      │                   └─ resolveResource → resource path
                      │              └─ hooks.afterResolve
                      │              └─ hooks.createModule → new NormalModule
                      │              └─ hooks.module
                      ├─ addModule (queue) → _addModule (dedup/cache)
                      ├─ moduleGraph.setResolvedModule → ModuleGraphConnection
                      ├─ moduleGraph.setIssuerIfUnset
                      └─ _handleModuleBuildAndDependencies
                           └─ buildModule (queue) → _buildModule
                                └─ NormalModule.build
                                     └─ _doBuild → runLoaders → this._source
                                     └─ parser.parse → module.addDependency(...)
                                     └─ handleParseResult → sort deps, hash, snapshot
                           └─ processModuleDependencies (queue)
                                └─ _processModuleDependencies
                                     └─ for each dep: handleModuleCreation(...)  ← recurse
```

Every discovered dependency re-enters `handleModuleCreation` with the just-built module as its `originModule`, which is how the graph grows outward from the entry until no new modules are found.

