# transcript: To understand how a build's entry points get seeded into a compilation — as opposed to how modules reached later are discovered — I need to see the routine t...


💬 I'll load the LSP tool and start from the symbol name for webpack's entry-seeding routine.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(addEntry)

💬 The core routine is `_addEntryItem` at line 2682. Let me read that method and find all its callers in parallel.
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/webpack/lib/Compilation.js","line":2682,"character":2})
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/webpack/lib/Compilation.js","line":2645,"character":2})

💬 `addEntry` shows no external callers — entry feeding happens via plugins. Let me find all the plugins that call `addEntry` or `addModuleTree` to seed entries.
  ▸ LSP(EntryPlugin)
  ▸ LSP(DynamicEntryPlugin)
  ▸ LSP(DllEntryPlugin)

💬 Good. Now let me read the key plugin files in parallel to see what each one feeds into `addEntry`.
  ▸ Read(/home/bench/repos/webpack/lib/EntryPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/DynamicEntryPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/dll/DllEntryPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/EntryOptionPlugin.js)

💬 Now let me look at module federation entry seeding, HMR entry, and `addAsyncEntrypoint`.
  ▸ LSP(ContainerPlugin)
  ▸ LSP(addAsyncEntrypoint)
  ▸ LSP(HotModuleReplacementPlugin)
  ▸ Read(/home/bench/repos/webpack/lib/container/ContainerPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Now let me check who calls `addInclude` and whether HMR or lazy compilation feeds entries.
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/webpack/lib/Compilation.js","line":2663,"character":2})
  ▸ LSP(LazyCompilationPlugin)
  ▸ LSP(HtmlModulesPlugin)

💬 Let me look at `LazyCompilationPlugin`'s make hook and `HtmlModulesPlugin`'s entry interception in parallel.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/webpack/lib/hmr/LazyCompilationPlugin.js","line":1,"character":1})
  ▸ Read(/home/bench/repos/webpack/lib/html/HtmlModulesPlugin.js)

💬 Let me read the `HtmlModulesPlugin.apply()` method and check `WorkerPlugin` for entry seeding.
  ▸ Read(/home/bench/repos/webpack/lib/html/HtmlModulesPlugin.js)
  ▸ LSP(WorkerPlugin)

💬 Let me continue reading HtmlModulesPlugin's `finishMake` body and also look at WorkerPlugin.
  ▸ Read(/home/bench/repos/webpack/lib/html/HtmlModulesPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/dependencies/WorkerPlugin.js)

💬 Let me search for all callers of `addEntry` across the codebase since LSP didn't find cross-file references.
  ▸ Bash(grep -rn "\.addEntry\(" /home/bench/repos/webpack/lib/ --include="*.js" | grep -v "//.*addEntry" | grep -v "_addEntryItem")
  ▸ Bash(grep -rn "addEntry(" /home/bench/repos/webpack/lib/ --include="*.js" | grep -v "//.*addEntry" | grep -v "_addEntryItem")

💬 Now I have the complete picture. Let me also check `addInclude` and the `DllEntryDependency` to understand what it wraps.
  ▸ Bash(grep -rn "addInclude(" /home/bench/repos/webpack/lib/ --include="*.js")
  ▸ Read(/home/bench/repos/webpack/lib/dependencies/DllEntryDependency.js)

💬 Let me look at `ProvideSharedPlugin`'s `addInclude` call and the `ContainerEntryDependency`.
  ▸ Read(/home/bench/repos/webpack/lib/sharing/ProvideSharedPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/container/ContainerEntryDependency.js)

💬 Now I have the complete picture. Here is a thorough walkthrough of the whole entry-seeding system.  ---  ## The core routine: `_addEntryItem`  **`lib/Compila...

──────── RESULT (success, 171271ms, 33 turns) ────────
Now I have the complete picture. Here is a thorough walkthrough of the whole entry-seeding system.

---

## The core routine: `_addEntryItem`

**`lib/Compilation.js:2682`**

Every entry point goes through `_addEntryItem(context, entry, target, options, callback)`. It:

1. Looks up or creates an `EntryData` record (keyed by `options.name`) in `compilation.entries`, or in `compilation.globalEntry` when `name` is `undefined`.
2. Pushes `entry` into either `entryData.dependencies` (real entries) or `entryData.includeDependencies` (passive includes).
3. Fires `compilation.hooks.addEntry`.
4. Calls `compilation.addModuleTree({ context, dependency: entry, … })`, which is the actual start of the module-graph walk.

Two public wrappers thin-wrap it:

| Public method | `target` argument | Who calls it |
|---|---|---|
| `addEntry(context, entry, optionsOrName, cb)` @ line 2645 | `"dependencies"` | All 5 callers below |
| `addInclude(context, dep, options, cb)` @ line 2663 | `"includeDependencies"` | `ProvideSharedPlugin` |

---

## Callers and what each one hands in

### 1. `EntryPlugin` — static entries from `config.entry`
**`lib/EntryPlugin.js:47`** — taps `compiler.hooks.make` (tapAsync)

`EntryOptionPlugin.applyEntryOption()` creates one `EntryPlugin` instance per import string in each static entry. During `make` it calls:

```js
compilation.addEntry(context, dep, options, callback)
//   dep = new EntryDependency(entry)   ← a single resolved module path
//   options = full EntryOptions built from EntryOptionPlugin.entryDescriptionToOptions()
//             (name, filename, runtime, layer, dependOn, publicPath, library, …)
```

`EntryDependency` is the simplest possible dependency: just a request string. Its factory is `normalModuleFactory`, so the walk resolves it like any normal module.

---

### 2. `DynamicEntryPlugin` — function-valued `config.entry`
**`lib/DynamicEntryPlugin.js:51`** — taps `compiler.hooks.make` (tapPromise)

When `config.entry` is a function, `EntryOptionPlugin` creates a single `DynamicEntryPlugin` instead of many `EntryPlugin` instances. On each make it:

```js
Promise.resolve(this.entry())   // calls the user's function, awaits the result
  .then(entry => {
    for (const name of Object.keys(entry)) {
      for (const importStr of entry[name].import) {
        compilation.addEntry(
          this.context,
          EntryPlugin.createDependency(importStr, options),   // same EntryDependency
          options,
          callback
        )
      }
    }
  })
```

Structurally identical to `EntryPlugin` — same `EntryDependency`, same `EntryOptions` — but the entry map is re-resolved on every rebuild, which is how watch-mode dynamic entries pick up changes.

---

### 3. `DllEntryPlugin` — DLL bundles
**`lib/dll/DllEntryPlugin.js:53`** — taps `compiler.hooks.make` (tapAsync)

DLL builds are configured with an array of entry strings. This plugin wraps all of them in a single aggregate dependency:

```js
compilation.addEntry(
  this.context,
  new DllEntryDependency(
    this.entries.map((e, idx) => {
      const dep = new EntryDependency(e)
      dep.loc = { name: this.options.name, index: idx }
      return dep
    }),
    this.options.name          // the DLL name
  ),
  this.options,                // { name, filename, … }
  callback
)
```

`DllEntryDependency` (lib/dependencies/DllEntryDependency.js) holds an array of `EntryDependency` objects and a name. Its factory is **`DllModuleFactory`** (not `normalModuleFactory`), which synthesises a `DllModule` that aggregates all those individual modules rather than resolving from disk. The result is a single entry chunk that re-exports everything the DLL should expose.

---

### 4. `ContainerPlugin` — Module Federation containers
**`lib/container/ContainerPlugin.js:80`** — taps `compiler.hooks.make` (tapAsync)

MF container creation produces a single synthetic entry that describes the entire public surface:

```js
const dep = new ContainerEntryDependency(
  this.options.name,   // e.g. "myApp"
  exposes,             // parsed { "Button": { import: ["./src/Button"], name: … }, … }
  shareScope           // usually "default"
)
dep.loc = { name: this.options.name }

compilation.addEntry(
  compilation.options.context,
  dep,
  {
    name:     this.options.name,
    filename: this.options.filename,
    runtime:  this.options.runtime,
    library
  },
  callback
)
```

`ContainerEntryDependency` carries the `exposes` list directly (not a file path). Its factory is **`ContainerEntryModuleFactory`**, which synthesises a `ContainerEntryModule` — the special chunk that exports the `get`/`init` interface webpack's runtime calls to share modules.

---

### 5. `HtmlModulesPlugin` — `<script src>` and `<link>` tags inside HTML entries
**`lib/html/HtmlModulesPlugin.js:204`** — taps `compiler.hooks.finishMake` (tapAsync)

This fires *after* the regular make pass, once HTML modules have been built and `HtmlParser` has collected `buildInfo.htmlEntryScripts`. For every `<script src>`, `<link rel="modulepreload">`, and `<link rel="stylesheet">` it found:

```js
compilation.addEntry(
  context,                                           // the HTML module's directory
  EntryPlugin.createDependency(entry.request, {      // ordinary EntryDependency
    name: entry.entryName                            // synthetic unique name
  }),
  {
    name:     entry.entryName,
    filename: compilation.outputOptions.chunkFilename || "[name].js",
    dependOn: /* for JS scripts, all but the leader chain to [leaderName] */
  },
  callback
)
```

JS script entries in the same HTML page are chained via `dependOn` so they share a runtime (only the first one in each group owns it). Modulepreload and stylesheet entries are independent. Additionally this plugin intercepts `EntryOptionPlugin.getHooks(compiler).entry` during setup: if an entry description has `html: true`, it returns a synthetic `data:text/html,…` request so `EntryPlugin` builds an `HtmlModule` instead of a JS module, which then gets parsed by `HtmlParser` to find the tags.

---

### 6. `ProvideSharedPlugin` — Module Federation shared provides (`addInclude`)
**`lib/sharing/ProvideSharedPlugin.js:209`** — taps `compiler.hooks.finishMake` (tapPromise)

After make, for every shared module that was resolved:

```js
compilation.addInclude(
  compiler.context,
  new ProvideSharedDependency(
    config.shareScope,
    config.shareKey,
    version || false,
    resource,
    config.eager
  ),
  { name: undefined },   // ← goes into globalEntry.includeDependencies
  callback
)
```

`{ name: undefined }` routes to `compilation.globalEntry` rather than a named entry. `includeDependencies` means the module is built and available for runtime sharing but is not assigned its own chunk unless something requests it. The factory is `ProvideSharedModuleFactory`, which creates a `ProvideSharedModule` — a synthetic module that registers the resolved package into the share scope at runtime.

---

## How the wiring is set up

`WebpackOptionsApply.js` installs `EntryOptionPlugin` on the compiler. `EntryOptionPlugin.apply()` taps `compiler.hooks.entryOption` and calls `applyEntryOption()`, which decides:

```
config.entry is function?
  → new DynamicEntryPlugin(context, entry).apply(compiler)
config.entry is object?
  → for each name/desc:
       EntryOptionPlugin.getHooks(compiler).entry.call(context, name, desc)
       ↳ returns a synthetic request? → new EntryPlugin(context, request, options).apply(compiler)
       ↳ returns undefined? → for each import:
                                  new EntryPlugin(context, import, options).apply(compiler)
```

`DllPlugin` installs `DllEntryPlugin` directly. `ModuleFederationPlugin` (or standalone use) installs `ContainerPlugin` directly. `WebpackOptionsApply` installs `HtmlModulesPlugin` and `ProvideSharedPlugin` when the relevant output/sharing options are present.

---

## The two hooks in time

| Hook | Who taps | Why |
|---|---|---|
| `compiler.hooks.make` | `EntryPlugin`, `DynamicEntryPlugin`, `DllEntryPlugin`, `ContainerPlugin` | Start-of-build entries known before any modules are processed |
| `compiler.hooks.finishMake` | `HtmlModulesPlugin`, `ProvideSharedPlugin` | Entries that are *derived* from modules built in the first pass (HTML `<script>` tags; shared module resolution) |

---

## `addAsyncEntrypoint` is distinct

`Compilation.addAsyncEntrypoint` (`lib/Compilation.js:4406`) does not go through `_addEntryItem` at all. It creates an `Entrypoint` object in `compilation.asyncEntrypoints` but does not trigger a module-graph walk — it is called during seal by code that promotes an already-known async chunk (e.g. a `new Worker(new URL(…))` dynamic import) to a named entrypoint for output purposes.
