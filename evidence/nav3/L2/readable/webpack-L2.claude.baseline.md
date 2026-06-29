# webpack · L2 · baseline — readable transcript

> baseline — text search (bash + coreutils), over **webpack** (javascript) @ `ff19f174a`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `baseline` — text search (bash + coreutils) |
| repo · rung | webpack (javascript) · L2 |
| pinned source | `ff19f174abd5e3dbbfd91a355034b0b15b2a1b01` |
| status | completed |
| engagement | `bash_calls = 15` (gate: > 0 → ✓ used its capability) |
| turns | 2 |
| wall clock | 162 s |
| context (peak) | 52,287 tokens |
| cost (billed) | $0.2892 |
| &nbsp;&nbsp;↳ token split | in 4 · out 2,923 · cache-create 13,062 · cache-read 39,221 |
| tool calls | 38 (Read×22, Bash×15, Agent×1) |
| evidence | `evidence/nav3/L2/raw/webpack-L2.claude.baseline.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To understand how a build's entry points get seeded into a compilation — as opposed to how modules reached later are discovered — I need to see the routine that an entry dependency is handed to when the build's make phase starts, together with the different places across the codebase that feed entries into it (static entries, dynamic/runtime-computed entries, DLL entries, module-federation container entries, and the like) and what each one is actually handing in. Help me see who calls into that routine and what each caller provides.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll explore the entry-seeding pathway using an Explore agent since this spans multiple files with hook indirection.

▸ `Agent(Trace webpack entry-seeding into compilation)`  ⟶ subagent:
    ↳ `Bash(find /home/bench/repos/webpack -type f -name "*.js" | grep -E "(Compilation|Entry|Container|Dll)" | head -20)`
    ↳ `Bash(grep -n "addEntry\|addModuleTree" /home/bench/repos/webpack/lib/Compilation.js | head -20)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Bash(grep -r "\.addEntry\|compilation\.addEntry\|_compilation\.addEntry" /home/bench/repos/webpack/lib --include="*.js" -n)`
    ↳ `Read(/home/bench/repos/webpack/lib/EntryPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/SingleEntryPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/DynamicEntryPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/dll/DllEntryPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/container/ContainerPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/html/HtmlModulesPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/container/HoistContainerReferencesPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/EntryOptionPlugin.js)`
    ↳ `Bash(grep -n "hooks.entryOption" /home/bench/repos/webpack/lib/Compiler.js)`
    ↳ `Bash(grep -n "entryOption" /home/bench/repos/webpack/lib/Compiler.js)`
    ↳ `Bash(grep -r "hooks\.entryOption\.call\|\.entryOption\.call" /home/bench/repos/webpack/lib --include="*.js" -n)`
    ↳ `Read(/home/bench/repos/webpack/lib/WebpackOptionsApply.js)`
    ↳ `Bash(grep -n "handleModuleCreation" /home/bench/repos/webpack/lib/Compilation.js | head -5)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Bash(grep -r "\.addInclude\|compilation\.addInclude" /home/bench/repos/webpack/lib --include="*.js" -n)`
    ↳ `Read(/home/bench/repos/webpack/lib/sharing/ProvideSharedPlugin.js)`
    ↳ `Bash(grep -n "hooks\.make" /home/bench/repos/webpack/lib/Compiler.js | head -10)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compiler.js)`
    ↳ `Bash(grep -r "RuntimePlugin\|runtime.*addEntry\|FlagEntryExportAsUsedPlugin" /home/bench/repos/webpack/lib --include="*.js" -l)`
    ↳ `Read(/home/bench/repos/webpack/lib/RuntimePlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/FlagEntryExportAsUsedPlugin.js)`
    ↳ `Bash(grep -n "addFederationRuntimeDependency\|FederationRuntimeDependency" /home/bench/repos/webpack/lib/container/*.js)`
    ↳ `Bash(grep -r "FederationRuntime\|addFederationRuntimeDependency" /home/bench/repos/webpack/lib --include="*.js" -n | head -20)`
    ↳ `Bash(grep -r "make.*tap\|make.*tapAsync\|make.*tapPromise" /home/bench/repos/webpack/lib --include="*.js" -l | head -15)`
    ↳ `Read(/home/bench/repos/webpack/lib/PrefetchPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/AutomaticPrefetchPlugin.js)`
    ↳ `Bash(grep -n "addModuleChain" /home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/Compilation.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/container/ModuleFederationPlugin.js)`
    ↳ `Read(/home/bench/repos/webpack/lib/html/HtmlModulesPlugin.js)`
    ↳ `Bash(grep -n "processDependencies\|factorizeQueue" /home/bench/repos/webpack/lib/Compilation.js | head -20)`
    ↳ ⟹ returned to parent


💬 Here's the full map of how webpack seeds entries into a compilation:

---

## Central Routine: `_addEntryItem` — `Compilation.js:2682`

```javascript
_addEntryItem(context, entry, target, options, callback)
```

`target` is either `"dependencies"` or `"includeDependencies"`. The public methods `addEntry()` and `addInclude()` are thin wrappers that forward to this with the appropriate target string.

**What it does internally (in order):**

1. Creates or fetches an `EntryData` record in `this.entries` (a `Map<name, EntryData>`) and pushes the dependency into `entryData[target]`.
2. Fires `this.hooks.addEntry.call(entry, options)` synchronously.
3. Calls `this.addModuleTree({ context, dependency, contextInfo }, callback)`, which looks up the dependency's factory and calls `handleModuleCreation()` — that factorizes the module, registers it in the compilation, and queues its own dependencies for recursive processing.

---

## Callers and What Each One Provides

### 1. `EntryPlugin` — `lib/EntryPlugin.js:47`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

The standard path for every entry in `webpack.config.js entry:`. `WebpackOptionsApply` fires `hooks.entryOption`, which `EntryOptionPlugin` handles by constructing one `EntryPlugin` per entry. At make time each plugin calls:

```javascript
compilation.addEntry(context, dep, options, callback)
// dep = new EntryDependency(request)   ← the entry path string
// options = { name, filename, runtime, layer, dependOn, library, … }
```

Dependency type: **`EntryDependency`** (a `ModuleDependency` subclass whose factory is `NormalModuleFactory`).

---

### 2. `DynamicEntryPlugin` — `lib/DynamicEntryPlugin.js:51`
**Hook tapped:** `compiler.hooks.make` (tapPromise)

Used when `entry` is a function in the config. During make it resolves `this.entry()` (the function call), then iterates the resolved object and calls `compilation.addEntry(...)` for each result — same dep type (`EntryDependency`) as the static path. The difference is the resolution happens fresh on every build (useful for watch mode).

---

### 3. `DllEntryPlugin` — `lib/dll/DllEntryPlugin.js:53`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

Used by `DllPlugin`. Packages all DLL entries into a **single** `DllEntryDependency` that wraps an array of `EntryDependency` objects (one per entry string, each with `loc.index` for ordering):

```javascript
compilation.addEntry(
    this.context,
    new DllEntryDependency(
        this.entries.map((e, idx) => {
            const dep = new EntryDependency(e);
            dep.loc = { name: this.options.name, index: idx };
            return dep;
        }),
        this.options.name
    ),
    this.options,
    callback
)
```

Dependency type: **`DllEntryDependency`** — its factory is `DllModuleFactory`, which creates a `DllModule` rather than a `NormalModule`.

---

### 4. `ContainerPlugin` — `lib/container/ContainerPlugin.js:80`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

Module Federation's container side. Constructs a `ContainerEntryDependency` describing every exposed module and the share scope, then adds it as an entry:

```javascript
const dep = new ContainerEntryDependency(name, exposes, shareScope);
dep.loc = { name: this.options.name };
compilation.addEntry(compilation.options.context, dep, { name, filename, runtime, library }, callback);
```

After `addEntry` returns it also fires `hooks.addContainerEntryDependency.call(dep)` for downstream tracking.

Dependency type: **`ContainerEntryDependency`** — resolved by `ContainerEntryModuleFactory`, which produces a synthetic `ContainerEntryModule` (not backed by a real file).

---

### 5. `HtmlModulesPlugin` — `lib/html/HtmlModulesPlugin.js:204`
**Hook tapped:** `compiler.hooks.finishMake` (tapAsync) — *after* the main make is done

Scans modules of type `"html"` that were built during make, extracts `buildInfo.htmlEntryScripts` (scripts/links parsed from the HTML AST), and calls `compilation.addEntry` for each one with a synthetic name like `"main-module-preload-0"`. Groups (`script`, `script-module`, `modulepreload`, `stylesheet`) are chained via `dependOn`.

Dependency type: **`EntryDependency`** (via `EntryPlugin.createDependency`), same factory path as static entries.

---

### 6. `ProvideSharedPlugin` — `lib/sharing/ProvideSharedPlugin.js:205`
**Hook tapped:** `compiler.hooks.finishMake` (tapPromise) — *after* make

Module Federation's shared-provider side. Uses **`addInclude`** rather than `addEntry` (so these go into `entryData.includeDependencies`, not `entryData.dependencies`):

```javascript
compilation.addInclude(
    compiler.context,
    new ProvideSharedDependency(shareScope, shareKey, version, resource, eager),
    { name: undefined },
    callback
)
```

Dependency type: **`ProvideSharedDependency`** — factory creates a `ConsumeSharedModule`/`ProvideSharedModule`. Because `name` is `undefined`, it is filed under the `undefined` entry slot rather than a named chunk.

---

### 7. `PrefetchPlugin` / `AutomaticPrefetchPlugin` — `lib/PrefetchPlugin.js:45`, `lib/AutomaticPrefetchPlugin.js:51`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

Both bypass `addEntry` entirely and call `compilation.addModuleChain()` directly (which forwards to `addModuleTree`). This means the modules are built and traversed but are **not recorded in `compilation.entries`** — they don't appear as entry points in the output. `AutomaticPrefetchPlugin` takes its list from the previous compilation's `NormalModule` instances so it can pre-warm the factory cache.

---

## The Chain After `_addEntryItem`

```
_addEntryItem
  └─ addModuleTree({ context, dependency, contextInfo })
       └─ lookup dependency.constructor in dependencyFactories Map
            └─ handleModuleCreation({ factory, dependencies: [dep], originModule: null, … })
                 ├─ factorizeModule()  →  factory.create()  →  NormalModule / DllModule / ContainerEntryModule / …
                 ├─ addModule()        →  registered in compilation.modules
                 └─ processModuleDependencies()  →  enqueues module's own deps
                      └─ (recursive) handleModuleCreation for each transitive dep
```

---

## Summary Table

| Caller | Hook | Dep type | What's handed in |
|---|---|---|---|
| `EntryPlugin` | `make` | `EntryDependency` | One entry path from config, with full `EntryOptions` |
| `DynamicEntryPlugin` | `make` | `EntryDependency` | Same, but entry list resolved by calling a user function at build time |
| `DllEntryPlugin` | `make` | `DllEntryDependency` | Array of `EntryDependency` objects wrapped in one DLL dep |
| `ContainerPlugin` | `make` | `ContainerEntryDependency` | Exposed-modules list + share scope; no real file |
| `HtmlModulesPlugin` | `finishMake` | `EntryDependency` | Scripts/links extracted from HTML AST; synthetic names |
| `ProvideSharedPlugin` | `finishMake` | `ProvideSharedDependency` | Share scope + resource path; filed under `addInclude`, `name: undefined` |
| `PrefetchPlugin` | `make` | `PrefetchDependency` | Skips `addEntry`; calls `addModuleChain` directly — never an entry |
| `AutomaticPrefetchPlugin` | `make` | `PrefetchDependency` | Same skip, seeded from previous compilation's module list |


## Final answer

_Result event — success, 162 s, 2 turns._

Here's the full map of how webpack seeds entries into a compilation:

---

## Central Routine: `_addEntryItem` — `Compilation.js:2682`

```javascript
_addEntryItem(context, entry, target, options, callback)
```

`target` is either `"dependencies"` or `"includeDependencies"`. The public methods `addEntry()` and `addInclude()` are thin wrappers that forward to this with the appropriate target string.

**What it does internally (in order):**

1. Creates or fetches an `EntryData` record in `this.entries` (a `Map<name, EntryData>`) and pushes the dependency into `entryData[target]`.
2. Fires `this.hooks.addEntry.call(entry, options)` synchronously.
3. Calls `this.addModuleTree({ context, dependency, contextInfo }, callback)`, which looks up the dependency's factory and calls `handleModuleCreation()` — that factorizes the module, registers it in the compilation, and queues its own dependencies for recursive processing.

---

## Callers and What Each One Provides

### 1. `EntryPlugin` — `lib/EntryPlugin.js:47`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

The standard path for every entry in `webpack.config.js entry:`. `WebpackOptionsApply` fires `hooks.entryOption`, which `EntryOptionPlugin` handles by constructing one `EntryPlugin` per entry. At make time each plugin calls:

```javascript
compilation.addEntry(context, dep, options, callback)
// dep = new EntryDependency(request)   ← the entry path string
// options = { name, filename, runtime, layer, dependOn, library, … }
```

Dependency type: **`EntryDependency`** (a `ModuleDependency` subclass whose factory is `NormalModuleFactory`).

---

### 2. `DynamicEntryPlugin` — `lib/DynamicEntryPlugin.js:51`
**Hook tapped:** `compiler.hooks.make` (tapPromise)

Used when `entry` is a function in the config. During make it resolves `this.entry()` (the function call), then iterates the resolved object and calls `compilation.addEntry(...)` for each result — same dep type (`EntryDependency`) as the static path. The difference is the resolution happens fresh on every build (useful for watch mode).

---

### 3. `DllEntryPlugin` — `lib/dll/DllEntryPlugin.js:53`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

Used by `DllPlugin`. Packages all DLL entries into a **single** `DllEntryDependency` that wraps an array of `EntryDependency` objects (one per entry string, each with `loc.index` for ordering):

```javascript
compilation.addEntry(
    this.context,
    new DllEntryDependency(
        this.entries.map((e, idx) => {
            const dep = new EntryDependency(e);
            dep.loc = { name: this.options.name, index: idx };
            return dep;
        }),
        this.options.name
    ),
    this.options,
    callback
)
```

Dependency type: **`DllEntryDependency`** — its factory is `DllModuleFactory`, which creates a `DllModule` rather than a `NormalModule`.

---

### 4. `ContainerPlugin` — `lib/container/ContainerPlugin.js:80`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

Module Federation's container side. Constructs a `ContainerEntryDependency` describing every exposed module and the share scope, then adds it as an entry:

```javascript
const dep = new ContainerEntryDependency(name, exposes, shareScope);
dep.loc = { name: this.options.name };
compilation.addEntry(compilation.options.context, dep, { name, filename, runtime, library }, callback);
```

After `addEntry` returns it also fires `hooks.addContainerEntryDependency.call(dep)` for downstream tracking.

Dependency type: **`ContainerEntryDependency`** — resolved by `ContainerEntryModuleFactory`, which produces a synthetic `ContainerEntryModule` (not backed by a real file).

---

### 5. `HtmlModulesPlugin` — `lib/html/HtmlModulesPlugin.js:204`
**Hook tapped:** `compiler.hooks.finishMake` (tapAsync) — *after* the main make is done

Scans modules of type `"html"` that were built during make, extracts `buildInfo.htmlEntryScripts` (scripts/links parsed from the HTML AST), and calls `compilation.addEntry` for each one with a synthetic name like `"main-module-preload-0"`. Groups (`script`, `script-module`, `modulepreload`, `stylesheet`) are chained via `dependOn`.

Dependency type: **`EntryDependency`** (via `EntryPlugin.createDependency`), same factory path as static entries.

---

### 6. `ProvideSharedPlugin` — `lib/sharing/ProvideSharedPlugin.js:205`
**Hook tapped:** `compiler.hooks.finishMake` (tapPromise) — *after* make

Module Federation's shared-provider side. Uses **`addInclude`** rather than `addEntry` (so these go into `entryData.includeDependencies`, not `entryData.dependencies`):

```javascript
compilation.addInclude(
    compiler.context,
    new ProvideSharedDependency(shareScope, shareKey, version, resource, eager),
    { name: undefined },
    callback
)
```

Dependency type: **`ProvideSharedDependency`** — factory creates a `ConsumeSharedModule`/`ProvideSharedModule`. Because `name` is `undefined`, it is filed under the `undefined` entry slot rather than a named chunk.

---

### 7. `PrefetchPlugin` / `AutomaticPrefetchPlugin` — `lib/PrefetchPlugin.js:45`, `lib/AutomaticPrefetchPlugin.js:51`
**Hook tapped:** `compiler.hooks.make` (tapAsync)

Both bypass `addEntry` entirely and call `compilation.addModuleChain()` directly (which forwards to `addModuleTree`). This means the modules are built and traversed but are **not recorded in `compilation.entries`** — they don't appear as entry points in the output. `AutomaticPrefetchPlugin` takes its list from the previous compilation's `NormalModule` instances so it can pre-warm the factory cache.

---

## The Chain After `_addEntryItem`

```
_addEntryItem
  └─ addModuleTree({ context, dependency, contextInfo })
       └─ lookup dependency.constructor in dependencyFactories Map
            └─ handleModuleCreation({ factory, dependencies: [dep], originModule: null, … })
                 ├─ factorizeModule()  →  factory.create()  →  NormalModule / DllModule / ContainerEntryModule / …
                 ├─ addModule()        →  registered in compilation.modules
                 └─ processModuleDependencies()  →  enqueues module's own deps
                      └─ (recursive) handleModuleCreation for each transitive dep
```

---

## Summary Table

| Caller | Hook | Dep type | What's handed in |
|---|---|---|---|
| `EntryPlugin` | `make` | `EntryDependency` | One entry path from config, with full `EntryOptions` |
| `DynamicEntryPlugin` | `make` | `EntryDependency` | Same, but entry list resolved by calling a user function at build time |
| `DllEntryPlugin` | `make` | `DllEntryDependency` | Array of `EntryDependency` objects wrapped in one DLL dep |
| `ContainerPlugin` | `make` | `ContainerEntryDependency` | Exposed-modules list + share scope; no real file |
| `HtmlModulesPlugin` | `finishMake` | `EntryDependency` | Scripts/links extracted from HTML AST; synthetic names |
| `ProvideSharedPlugin` | `finishMake` | `ProvideSharedDependency` | Share scope + resource path; filed under `addInclude`, `name: undefined` |
| `PrefetchPlugin` | `make` | `PrefetchDependency` | Skips `addEntry`; calls `addModuleChain` directly — never an entry |
| `AutomaticPrefetchPlugin` | `make` | `PrefetchDependency` | Same skip, seeded from previous compilation's module list |

