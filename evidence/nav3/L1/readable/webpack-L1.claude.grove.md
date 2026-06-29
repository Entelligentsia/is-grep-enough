# transcript: I'm reasoning about how webpack represents a single module while it's being compiled — the in-memory object that stands for one module as a node in the modul...


💬 Let me use grove to get structural outlines of the key module classes.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source)
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/Module.js","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/NormalModule.js","detail":0})

💬 Now let me read the constructors of both classes, and the `DependenciesBlock` base, in parallel.
  ▸ mcp__grove__source({"file":"/home/bench/repos/webpack/lib/Module.js","name":"Module"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/webpack/lib/NormalModule.js","name":"NormalModule"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/webpack/lib","name":"DependenciesBlock"})

💬 Let me read the `DependenciesBlock` constructor and the `NormalModule` constructor section directly.
  ▸ mcp__grove__source({"file":"/home/bench/repos/webpack/lib/DependenciesBlock.js","name":"DependenciesBlock"})
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)

💬 Now I have the full picture. Here's a precise walkthrough of the module object as it lives in memory during a build.  ---  ## The class hierarchy  ``` Depend...

──────── RESULT (success, 81810ms, 9 turns) ────────
Now I have the full picture. Here's a precise walkthrough of the module object as it lives in memory during a build.

---

## The class hierarchy

```
DependenciesBlock
  └─ Module            (lib/Module.js)
       └─ NormalModule (lib/NormalModule.js)
```

`NormalModule` is what represents an ordinary source file. Other concrete subclasses (`ExternalModule`, `ConcatenatedModule`, `DelegatedModule`, …) follow the same structure but skip most of the loader/parser machinery.

---

## Layer 1 — `DependenciesBlock` (the edge store)

This is the only place the outgoing graph edges live:

```js
this.dependencies = [];  // Dependency[] — synchronous imports/requires/exports
this.blocks      = [];  // AsyncDependenciesBlock[] — dynamic import() calls (code-split points)
this.parent      = undefined;
```

Each `Dependency` in `.dependencies` is one typed edge — a `HarmonyImportDependency`, `CommonJsRequireDependency`, `HarmonyExportSpecifierDependency`, etc. Each has a matching `Template` that knows how to turn it into output bytes. `AsyncDependenciesBlock` is itself a `DependenciesBlock`, so it recurses: a dynamic `import()` becomes a block, and that block carries its own `.dependencies` for what the lazy chunk references.

---

## Layer 2 — `Module` (the build-result bag)

### The kind discriminator: `this.type`

```js
this.type = type;   // e.g. "javascript/auto", "javascript/esm", "asset/resource",
                    //      "css", "webassembly/async", "json", …
```

`type` is a string enum (`ModuleTypes`) set by the factory before the module is even built. It drives which parser, generator, and template the system picks. It's stable for the module's lifetime and doubles as a cache key.

### Factory-supplied fields (set before `build()`)

```js
this.resolveOptions  // per-module resolver overrides
this.factoryMeta     // opaque bag from NormalModuleFactory (e.g. sideEffects flag)
this.useSourceMap
this.useSimpleSourceMap
```

### Build results (populated by `build()` and cleared/reset on rebuild)

```js
this.buildMeta    // export shape: { exportsType, defaultObject, … }
this.buildInfo    // per-build facts: fileDependencies, contextDependencies, assets emitted, hash, …
this._warnings
this._errors
this.presentationalDependencies  // Dependency[] — no graph edge; codegen-only annotations
this.codeGenerationDependencies  // Dependency[] — peer deps whose codegen output this module needs
```

`buildMeta.exportsType` (`"namespace"` / `"flagged"` / `"default"` / `"dynamic"`) is the most load-bearing field here — `getExportsType()` reads it to decide how the importer side wraps the namespace object.

### What's deliberately NOT on the module

`id`, `hash`, `depth`, `issuer`, `usedExports` — everything that's graph-relative — is stored externally in `ModuleGraph` and `ChunkGraph`. The deprecated compat getters on `Module` (lines 301–619) simply call back into those stores. This is the fundamental architectural move webpack made moving from v4 to v5: the module object itself is build-result-only; all graph context lives in the graph objects.

---

## Layer 3 — `NormalModule` (loader + parser + source)

### Identity strings (four views of the same request, set by factory)

```js
this.rawRequest           // "./utils"                          — what the user typed
this.userRequest          // "/abs/path/utils.js"               — after resolve, no inline loaders
this.request              // "babel-loader!/abs/path/utils.js"  — full loader pipeline
this.resource             // "/abs/path/utils.js"               — the file on disk
this.resourceResolveData  // full resolver result (pkg.json, exports map, …)
this.matchResource        // override for rule matching (set by `!=!` inline syntax)
```

`identifier()` (line 955) concatenates `type + "|" + request + …` to produce the unique string key that `ModuleGraph` uses to deduplicate modules.

### Processing pipeline (set by factory, used during `build()`)

```js
this.loaders        // [{loader, options, ident, …}, …] — ordered chain applied by loader-runner
this.parser         // e.g. JavascriptParser — turns source into AST + fires dep hooks
this.parserOptions
this.generator      // turns the parsed module into output Source
this.generatorOptions
this.binary         // true when type matches /^(?:asset|webassembly)\b/
```

### What `build()` leaves behind

```js
this._source       // Source | null  — raw output of loader-runner (a webpack ConcatSource/RawSource/…)
this._sourceSizes  // Map<SourceType, number>  — size cache per output type
this._sourceTypes  // cached result of getSourceTypes()
this.buildInfo     // NormalModuleBuildInfo — richer than the base type;
                   //   adds: assets, assetsInfo, fileDependencies, contextDependencies,
                   //         missingDependencies, buildDependencies, snapshot,
                   //         hash, moduleArgument, exportsArgument, …
this.error         // primary build error (first fatal loader/parse error)
```

`_source` is the transformed source text as a webpack `Source` object (from `webpack-sources`). It is what `originalSource()` returns — the pre-codegen, post-loader bytes. Code generation at a later phase reads `_source` and the `Dependency` templates to emit the final output.

### Rebuild guards

```js
this._forceBuild              // cleared after first successful build
this._lastSuccessfulBuildMeta // snapshot of buildMeta from last good build, for cache comparison
```

`needBuild()` (line 2150) compares the module's snapshot against filesystem timestamps and these fields to decide whether to re-enter `_doBuild`.

### Side-effects memoization

```js
this._sideEffectsStateGraph   // ModuleGraph the cached value was computed for
this._sideEffectsStateValue   // ConnectionState result
this._isEvaluatingSideEffects // cycle guard during the walk
this._addedSideEffectsBailout // WeakSet<ModuleGraph> tracking bailout registrations
```

`getSideEffectsConnectionState()` is called per-connection during tree-shaking; these fields cache the walk result keyed to the current `ModuleGraph` instance so stale values can't leak across compilations.

---

## Summary map

```
NormalModule
 ├─ type                  ← kind discriminator ("javascript/esm", "asset/resource", …)
 ├─ rawRequest / userRequest / request / resource
 │                        ← four views of the resolved path, set by factory
 ├─ loaders / parser / generator
 │                        ← the processing pipeline, set by factory
 ├─ dependencies[]        ← synchronous outgoing edges (from DependenciesBlock)
 ├─ blocks[]              ← async/dynamic import edges → code-split points
 ├─ _source               ← post-loader raw source (webpack Source object)
 ├─ buildMeta             ← export shape (exportsType, etc.)
 ├─ buildInfo             ← file deps, assets, snapshot, hash, …
 └─ _warnings / _errors
```

Graph-relative facts (module id, chunk membership, export usage, depth) live in `ModuleGraph`/`ChunkGraph` and are looked up with the module as a key — they are never stored on the module itself.
