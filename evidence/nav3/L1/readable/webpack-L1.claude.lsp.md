# transcript: I'm reasoning about how webpack represents a single module while it's being compiled — the in-memory object that stands for one module as a node in the modul...


💬 Let me load the LSP tool and start from the base class, then walk up through `NormalModule`.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(Module)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/webpack/lib/Module.js","line":1,"character":1})
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/webpack/lib/NormalModule.js","line":1,"character":1})

💬 Good. Now let me read the constructors and key type annotations to see the actual fields.
  ▸ Read(/home/bench/repos/webpack/lib/Module.js)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)

💬 Now let me look at `DependenciesBlock`, the `buildInfo`/`buildMeta` type shapes, and `ModuleGraphConnection`.
  ▸ LSP(DependenciesBlock)
  ▸ LSP(ModuleGraphConnection)
  ▸ Read(/home/bench/repos/webpack/lib/DependenciesBlock.js)
  ▸ Read(/home/bench/repos/webpack/lib/ModuleGraphConnection.js)

💬 Now let me look at the `ModuleGraph` internals (where connections actually live) and the `KnownBuildInfo`/`KnownBuildMeta` type shapes from `NormalModule.js`.
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)
  ▸ Read(/home/bench/repos/webpack/lib/Module.js)
  ▸ Read(/home/bench/repos/webpack/lib/ModuleGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/ModuleGraph.js)

💬 I now have everything needed to give you a precise walk-through. Here's how the object is structured, layer by layer.  ---  ## The class hierarchy  ``` Depen...

──────── RESULT (success, 109204ms, 15 turns) ────────
I now have everything needed to give you a precise walk-through. Here's how the object is structured, layer by layer.

---

## The class hierarchy

```
DependenciesBlock   (lib/DependenciesBlock.js)
  └─ Module         (lib/Module.js)
       └─ NormalModule  (lib/NormalModule.js)   ← a file-backed module
```

`NormalModule` is the workhorse for all JS/CSS/asset/WASM source files. Other subclasses (`ContextModule`, `ExternalModule`, `DelegatedModule`, container modules) follow the same pattern.

---

## Layer 1 — DependenciesBlock: where edges live

```js
// DependenciesBlock.js:28-34
this.dependencies = [];   // Dependency[]
this.blocks = [];         // AsyncDependenciesBlock[]
this.parent = undefined;  // DependenciesBlock | undefined
```

`dependencies` is the array of **edge descriptors**. Each entry is a `Dependency` subclass (`HarmonyImportDependency`, `CommonJsRequireDependency`, etc.) — one per `import`/`require` statement in the source. The dependency object records the syntactic information about the reference (what was requested, where in the source, what was imported from it), but not yet which `Module` it resolves to — that linkage lives in `ModuleGraph` (see below).

`blocks` holds `AsyncDependenciesBlock` entries, one per dynamic `import()` call. Each block is itself a `DependenciesBlock` with its own `dependencies` array, forming the async code-split boundary. The tree of blocks/dependencies is the raw shape of the module's graph edges.

---

## Layer 2 — Module: identity and build results

### What identifies the kind of module

```js
// Module.js:254
this.type = type;   // ModuleTypes, e.g. "javascript/auto", "javascript/esm", "json", "asset/resource", "webassembly/sync"
```

`type` is the string that tells everything downstream — parser selection, generator selection, codegen strategy — what kind of content this module carries. It is set at construction time by `NormalModuleFactory` based on the resolved resource and the `module.rules` match.

### Other identity fields

```js
this.context = context;     // directory the module lives in (used as the base for relative requires)
this.layer = layer;         // optional layer name for module federation layering
this.debugId = debugId++;   // monotonic integer, unique across this process lifetime
this.resolveOptions = ...;  // custom resolver options, from the factory
this.factoryMeta = undefined; // { sideEffectFree? } — a hint from the factory, before build
```

### What the build step deposits

After `module.build()` completes, two plain objects appear:

**`buildMeta`** (`lib/Module.js:168`, `KnownBuildMeta`):
```
exportsType:   "default" | "namespace" | "flagged" | "dynamic"
defaultObject: false | "redirect" | "redirect-warn"
async:         boolean
sideEffectFree: boolean
```
This is semantic metadata the parser extracted — what kind of exports the module has, whether it's async (top-level await), whether it's provably side-effect-free. Tree-shaking and interop codegen read from this.

**`buildInfo`** (`lib/Module.js:180`, `KnownBuildInfo` + `KnownNormalModuleBuildInfo`):
```
cacheable:            boolean       — whether the result can be cached
strict:               boolean       — source is in strict mode
moduleArgument:       string        — the name of the CJS `module` variable in scope
exportsArgument:      string        — the name of the CJS `exports` variable in scope
assets:               Record<string, Source>    — assets emitted by loaders during this build
assetsInfo:           Map<string, AssetInfo>
topLevelDeclarations: Set<string>   — for scope analysis (module concatenation)
isCircular:           boolean       — part of a cycle

parsed:               boolean       — false if NoParse skipped the parse step
hash:                 string        — the build hash
fileDependencies:     Set<string>   — files read (for cache invalidation)
contextDependencies:  Set<string>   — directories read
missingDependencies:  Set<string>   — files that must not exist
buildDependencies:    Set<string>   — loaders and config files (also invalidate build)
valueDependencies:    Map<string, string | Set<string>>  — value-keyed cache versions
snapshot:             Snapshot | null  — filesystem snapshot for incremental build
```

There are also `_warnings` and `_errors` arrays for diagnostics, and `presentationalDependencies` / `codeGenerationDependencies` for deps that are only relevant to output rendering.

---

## Layer 3 — NormalModule: the concrete file-backed module

These fields are set at construction time by `NormalModuleFactory`, before any build happens:

```js
// NormalModule.js:857-886
this.request         // full request string with all loaders, e.g. "babel-loader!./src/index.js"
this.userRequest     // what the author wrote, e.g. "./src/index.js"
this.rawRequest      // the bare specifier before resolution, e.g. "./index"
this.resource        // absolute path to the file, e.g. "/project/src/index.js"
this.resourceResolveData  // raw data from enhanced-resolve (query, fragment, etc.)
this.matchResource   // overridden resource path (loader-injected virtual modules)
this.loaders         // LoaderItem[] — ordered list of loaders with path + options
this.binary          // true for asset/* and webassembly/* types

this.parser          // the Parser instance chosen for this type (e.g. JavascriptParser for ESM)
this.parserOptions
this.generator       // the Generator instance (produces the output source)
this.generatorOptions
```

`identifier()` (`NormalModule.js:955`) returns a canonical string built from `this.request` plus layer/type disambiguation — this is what `ModuleGraph` keys on for deduplication.

---

## The graph edges: how module→module links work

There is a deliberate separation: **the dependency objects (edges) live on the module, but the resolved module they point to does not**. That resolution is kept externally in `ModuleGraph`.

`ModuleGraph` (`lib/ModuleGraph.js:140`) holds:
```js
this._moduleMap    // Map<Module, ModuleGraphModule>  — one entry per module
this._dependencyMap // WeakMap<Dependency, ModuleGraphConnection | null>
```

For each `Module`, `_moduleMap` stores a `ModuleGraphModule` node:
```js
// ModuleGraph.js:97-119
this.incomingConnections  // SortableSet<ModuleGraphConnection> — who imports this module
this.outgoingConnections  // SortableSet<ModuleGraphConnection> | undefined — who this module imports
this.issuer               // Module | null — the first importer (deterministic)
this.exports              // ExportsInfo — full export tracking for tree-shaking
this.preOrderIndex        // number | null — DFS pre-order position
this.postOrderIndex       // number | null — DFS post-order position
this.depth                // number | null
this.profile              // timing measurements
this.async                // boolean
```

Each `ModuleGraphConnection` (`lib/ModuleGraphConnection.js:55`) is the resolved edge:
```js
this.originModule    // Module | null — where the import comes from
this.dependency      // Dependency | null — the Dependency that caused this connection
this.module          // Module — the resolved target
this.resolvedModule  // Module — target after re-export resolution (may differ from .module)
this.weak            // boolean — weak reference (doesn't force inclusion)
this.conditional     // boolean — has a runtime condition (tree-shaking)
this._active         // boolean — whether currently active
this.condition       // GetConditionFn | null | undefined — evaluates active state at runtime
```

So the full picture for one `import` statement is: a `Dependency` object on `module.dependencies`, a `ModuleGraphConnection` keyed by that dependency in `_dependencyMap`, and that connection appearing in both the origin module's `outgoingConnections` and the target module's `incomingConnections` inside `ModuleGraph`.

---

## Summary

| What | Where it lives |
|---|---|
| Module kind | `module.type` on the `Module` itself |
| File identity / loader chain | `NormalModule.request`, `.resource`, `.loaders` |
| Semantic metadata from parse | `module.buildMeta` (exportsType, sideEffectFree, async) |
| FS + cache invalidation data | `module.buildInfo` (fileDependencies, snapshot, hash, …) |
| Syntactic edge descriptors | `module.dependencies[]` and `module.blocks[]` (from `DependenciesBlock`) |
| Resolved module-to-module connections | External in `ModuleGraph._moduleMap` / `_dependencyMap`, as `ModuleGraphModule` + `ModuleGraphConnection` objects |
| Export shape for tree-shaking | `ModuleGraphModule.exports` (`ExportsInfo`) |
