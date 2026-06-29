# webpack · L2 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **webpack** (javascript) @ `ff19f174a`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | webpack (javascript) · L2 |
| pinned source | `ff19f174abd5e3dbbfd91a355034b0b15b2a1b01` |
| status | completed |
| engagement | `grove_tools = 14` (gate: > 0 → ✓ used its capability) |
| turns | 16 |
| wall clock | 142 s |
| context (peak) | 296,379 tokens |
| cost (billed) | $0.4250 |
| &nbsp;&nbsp;↳ token split | in 15 · out 7,541 · cache-create 38,988 · cache-read 257,376 |
| tool calls | 15 (mcp__grove__source×10, mcp__grove__symbols×2, mcp__grove__callers×2, ToolSearch×1) |
| evidence | `evidence/nav3/L2/raw/webpack-L2.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To understand how a build's entry points get seeded into a compilation — as opposed to how modules reached later are discovered — I need to see the routine that an entry dependency is handed to when the build's make phase starts, together with the different places across the codebase that feed entries into it (static entries, dynamic/runtime-computed entries, DLL entries, module-federation container entries, and the like) and what each one is actually handing in. Help me see who calls into that routine and what each caller provides.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll use grove to map the entry-seeding routine and its callers across the codebase.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__symbols,mcp__grove__callers,mcp__grove__map,mcp__grove__outline,mcp__grove__source)`

💬 Let me find `addEntry` in Compilation.js and then look at all its callers.

&nbsp;&nbsp;▸ `mcp__grove__symbols(addEntry)`
&nbsp;&nbsp;▸ `mcp__grove__callers(addEntry)`

💬 Now let me pull the body of `addEntry`/`_addEntryItem` and all five structural callers in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(javascript:lib/Compilation.js#addEntry@2645)`
&nbsp;&nbsp;▸ `mcp__grove__source(_addEntryItem)`
&nbsp;&nbsp;▸ `mcp__grove__source(apply)`
&nbsp;&nbsp;▸ `mcp__grove__source(apply)`
&nbsp;&nbsp;▸ `mcp__grove__source(apply)`
&nbsp;&nbsp;▸ `mcp__grove__source(apply)`
&nbsp;&nbsp;▸ `mcp__grove__source(apply)`

💬 Let me also grab `addInclude` and `createDependency` to complete the picture.

&nbsp;&nbsp;▸ `mcp__grove__symbols(addInclude)`
&nbsp;&nbsp;▸ `mcp__grove__source(createDependency)`
&nbsp;&nbsp;▸ `mcp__grove__source(javascript:lib/Compilation.js#addInclude@2663)`
&nbsp;&nbsp;▸ `mcp__grove__callers(addInclude)`
&nbsp;&nbsp;▸ `mcp__grove__source(apply)`

💬 Now I have the full picture. Here's a thorough walkthrough of the seeding routine and every caller.

---

## The seeding routine: `_addEntryItem`

`Compilation.addEntry` (`lib/Compilation.js:2645`) is the public surface. It normalizes a legacy string-or-object `optionsOrName` argument and always delegates to the private `_addEntryItem`:

```
addEntry(context, entry, optionsOrName, callback)
  └─ _addEntryItem(context, entry, "dependencies", options, callback)
```

There is a second public wrapper, `addInclude` (`lib/Compilation.js:2663`), that calls the same private method with `target = "includeDependencies"` instead of `"dependencies"`. Both wrappers converge on `_addEntryItem`.

**What `_addEntryItem` does** (`lib/Compilation.js:2682`):

1. Looks up `this.entries.get(name)` (a `Map<string, EntryData>`) for named entries, or falls back to `this.globalEntry` when `name` is `undefined`.
2. Creates the `EntryData` record if new: `{ dependencies: [], includeDependencies: [], options: { name, ...options } }`.
3. Pushes the dependency into either `entryData.dependencies` (via `addEntry`) or `entryData.includeDependencies` (via `addInclude`).
4. Merges any new option keys into the existing record, erroring on value conflicts.
5. Fires `this.hooks.addEntry.call(entry, options)` (sync notification for listeners such as `ProgressPlugin` and `RuntimeChunkPlugin`).
6. Calls `this.addModuleTree({ context, dependency: entry, contextInfo })` — this is where module building actually begins. `contextInfo` carries `issuerLayer` when the entry has a `layer` option set.

---

## The callers

### 1. `EntryPlugin` — static config entries (`lib/EntryPlugin.js:33`)

**Hook tapped:** `compiler.hooks.make` (tapAsync)  
**When:** each `make` call (both initial build and every watch rebuild)

`EntryPlugin` is instantiated once per configured entry by `EntryOptionPlugin`. The key detail is that `EntryPlugin.createDependency(request, options)` is called **at plugin construction time**, not inside the `make` hook, so the same `EntryDependency` object is reused across watch rebuilds.

```js
const dep = EntryPlugin.createDependency(entry, options);
// dep = new EntryDependency(request), dep.loc = { name: options.name }

compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
    compilation.addEntry(context, dep, options, err => callback(err));
});
```

`EntryDependency` is resolved by `NormalModuleFactory` → `NormalModule`. The `dep.loc.name` is the entry's named slot in `compilation.entries`.

---

### 2. `DynamicEntryPlugin` — entry-as-function (`lib/DynamicEntryPlugin.js:40`)

**Hook tapped:** `compiler.hooks.make` (tapPromise)  
**When:** each `make` call

Used when `config.entry` is a function. Unlike `EntryPlugin`, the entry function is called **inside** the hook, so the entry map is re-evaluated on every build:

```js
compiler.hooks.make.tapPromise(PLUGIN_NAME, (compilation) =>
    Promise.resolve(this.entry())          // call the entry function now
        .then(entry => {
            for (const name of Object.keys(entry)) {
                const options = EntryOptionPlugin.entryDescriptionToOptions(...);
                for (const request of desc.import) {
                    compilation.addEntry(
                        this.context,
                        EntryPlugin.createDependency(request, options),  // fresh dep each build
                        options,
                        ...
                    );
                }
            }
        })
);
```

Fresh `EntryDependency` objects are created each build; `options` come from full `EntryDescriptionNormalized` → `EntryOptions` normalization.

---

### 3. `DllEntryPlugin` — DLL bundles (`lib/dll/DllEntryPlugin.js:38`)

**Hook tapped:** `compiler.hooks.make` (tapAsync)  
**When:** each `make` call

Makes a **single** `addEntry` call that wraps all DLL entries inside one `DllEntryDependency`:

```js
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
    ...
);
```

The outer `DllEntryDependency` is resolved by `DllModuleFactory` → `DllModule` (a synthetic module that holds all the individual entries as children). The inner `EntryDependency` items are still resolved by `NormalModuleFactory`. The `loc.index` on each child tracks ordering within the DLL.

---

### 4. `ContainerPlugin` — Module Federation container (`lib/container/ContainerPlugin.js:89`)

**Hook tapped:** `compiler.hooks.make` (tapAsync)  
**When:** each `make` call

Adds the container's remotes-exposure surface as a single entry. The dependency type is **not** `EntryDependency` but a custom `ContainerEntryDependency`:

```js
const dep = new ContainerEntryDependency(
    this.options.name,   // container name
    exposes,             // parsed exposes list
    shareScope           // e.g. "default"
);
dep.loc = { name: this.options.name };

compilation.addEntry(
    compilation.options.context,
    dep,
    {
        name: this.options.name,
        filename: this.options.filename,
        runtime: this.options.runtime,
        library                         // e.g. { type: "var", name: "app" }
    },
    (error) => {
        if (error) return callback(error);
        hooks.addContainerEntryDependency.call(dep);  // MF post-hook
        callback();
    }
);
```

`ContainerEntryDependency` is resolved by `ContainerEntryModuleFactory` → `ContainerEntryModule`, which generates the container's `__webpack_init_sharing__` / `__webpack_share_scopes__` runtime. This is the only caller that fires a post-`addEntry` hook (`addContainerEntryDependency`).

---

### 5. `HtmlModulesPlugin` — HTML-parsed entries (`lib/html/HtmlModulesPlugin.js:246`)

**Hook tapped:** `compiler.hooks.finishMake` (tapAsync) — **after** the main make phase  
**When:** each `finishMake` call (after the initial `make` entries are all built)

This is the only caller that uses `finishMake` rather than `make`. It waits for HTML modules to be built, reads the `<script src>`, `<link rel="modulepreload">`, and `<link rel="stylesheet">` tags discovered by `HtmlParser`, and injects them as additional entries:

```js
for (const [groupKind, group] of Object.entries(htmlEntryScripts)) {
    const isChainGroup = groupKind !== "modulepreload" && groupKind !== "stylesheet";
    let leaderName;
    for (const entry of group) {
        const dependOn = isChainGroup && leaderName ? [leaderName] : undefined;
        if (isChainGroup && !leaderName) leaderName = entry.entryName;

        compilation.addEntry(
            context,
            EntryPlugin.createDependency(entry.request, { name: entry.entryName }),
            {
                name: entry.entryName,
                filename: compilation.outputOptions.chunkFilename || "[name].js",
                dependOn      // chains script entries to share a runtime; undefined for preloads/stylesheets
            },
            ...
        );
    }
}
```

Script/`script-module` groups are chained: the first entry in the group becomes the runtime leader; every subsequent entry in the same group gets `dependOn: [leaderName]` so they share that runtime chunk rather than each emitting their own. `modulepreload` and `stylesheet` entries are always independent (no `dependOn`). CSS entries additionally get `chunk.cssFilenameTemplate` stamped in `afterChunks` to route them through the CSS filename template.

---

### 6. `ProvideSharedPlugin` — Module Federation shared modules (`lib/sharing/ProvideSharedPlugin.js:217`)

**Uses `addInclude`, not `addEntry`**  
**Hook tapped:** `compiler.hooks.finishMake` (tapPromise) — after make  
**When:** each `finishMake`

This is the only caller of `addInclude`, which targets `entryData.includeDependencies` rather than `entryData.dependencies`. This distinction matters: `includeDependencies` entries get built and their modules become reachable in the graph, but they do not define a named chunk boundary the way `dependencies` entries do.

During `make`, `ProvideSharedPlugin` watches `normalModuleFactory.hooks.module` and populates a `resolvedProvideMap` with every module that matches a `provides` config key. In `finishMake`, it iterates that map and seeds each resolved resource as a shared module:

```js
compilation.addInclude(
    compiler.context,
    new ProvideSharedDependency(
        config.shareScope,   // e.g. "default"
        config.shareKey,     // e.g. "react"
        version || false,
        resource,            // absolute path, resolved during make
        config.eager
    ),
    { name: undefined },     // → goes into globalEntry.includeDependencies
    ...
);
```

`ProvideSharedDependency` is resolved by `ProvideSharedModuleFactory` → `ProvideSharedModule`. Using `{ name: undefined }` places these into `compilation.globalEntry.includeDependencies`, making them available globally without creating a named entry chunk.

---

## Summary map

| Caller | Hook | Dep type | Factory | `target` | When dep is created |
|---|---|---|---|---|---|
| `EntryPlugin` | `make` (tapAsync) | `EntryDependency` | `NormalModuleFactory` | `dependencies` | At plugin construction — reused across rebuilds |
| `DynamicEntryPlugin` | `make` (tapPromise) | `EntryDependency` (fresh) | `NormalModuleFactory` | `dependencies` | Inside `make` hook — re-evaluated every build |
| `DllEntryPlugin` | `make` (tapAsync) | `DllEntryDependency` wrapping `EntryDependency[]` | `DllModuleFactory` / `NormalModuleFactory` | `dependencies` | Inside `make` hook |
| `ContainerPlugin` | `make` (tapAsync) | `ContainerEntryDependency` | `ContainerEntryModuleFactory` | `dependencies` | Inside `make` hook |
| `HtmlModulesPlugin` | `finishMake` (tapAsync) | `EntryDependency` | `NormalModuleFactory` | `dependencies` | After initial make, per discovered HTML tag |
| `ProvideSharedPlugin` | `finishMake` (tapPromise) | `ProvideSharedDependency` | `ProvideSharedModuleFactory` | `includeDependencies` | After initial make, per seen shared module |

The `finishMake` callers (HTML and shared) can themselves trigger further `finishMake`-style work because `addModuleTree` may discover additional modules, but they do not re-enter `make`. The separation between `dependencies` (named entry chunks) and `includeDependencies` (globally included, no dedicated chunk) is enforced entirely through which `target` string `_addEntryItem` receives.


## Final answer

_Result event — success, 142 s, 16 turns._

Now I have the full picture. Here's a thorough walkthrough of the seeding routine and every caller.

---

## The seeding routine: `_addEntryItem`

`Compilation.addEntry` (`lib/Compilation.js:2645`) is the public surface. It normalizes a legacy string-or-object `optionsOrName` argument and always delegates to the private `_addEntryItem`:

```
addEntry(context, entry, optionsOrName, callback)
  └─ _addEntryItem(context, entry, "dependencies", options, callback)
```

There is a second public wrapper, `addInclude` (`lib/Compilation.js:2663`), that calls the same private method with `target = "includeDependencies"` instead of `"dependencies"`. Both wrappers converge on `_addEntryItem`.

**What `_addEntryItem` does** (`lib/Compilation.js:2682`):

1. Looks up `this.entries.get(name)` (a `Map<string, EntryData>`) for named entries, or falls back to `this.globalEntry` when `name` is `undefined`.
2. Creates the `EntryData` record if new: `{ dependencies: [], includeDependencies: [], options: { name, ...options } }`.
3. Pushes the dependency into either `entryData.dependencies` (via `addEntry`) or `entryData.includeDependencies` (via `addInclude`).
4. Merges any new option keys into the existing record, erroring on value conflicts.
5. Fires `this.hooks.addEntry.call(entry, options)` (sync notification for listeners such as `ProgressPlugin` and `RuntimeChunkPlugin`).
6. Calls `this.addModuleTree({ context, dependency: entry, contextInfo })` — this is where module building actually begins. `contextInfo` carries `issuerLayer` when the entry has a `layer` option set.

---

## The callers

### 1. `EntryPlugin` — static config entries (`lib/EntryPlugin.js:33`)

**Hook tapped:** `compiler.hooks.make` (tapAsync)  
**When:** each `make` call (both initial build and every watch rebuild)

`EntryPlugin` is instantiated once per configured entry by `EntryOptionPlugin`. The key detail is that `EntryPlugin.createDependency(request, options)` is called **at plugin construction time**, not inside the `make` hook, so the same `EntryDependency` object is reused across watch rebuilds.

```js
const dep = EntryPlugin.createDependency(entry, options);
// dep = new EntryDependency(request), dep.loc = { name: options.name }

compiler.hooks.make.tapAsync(PLUGIN_NAME, (compilation, callback) => {
    compilation.addEntry(context, dep, options, err => callback(err));
});
```

`EntryDependency` is resolved by `NormalModuleFactory` → `NormalModule`. The `dep.loc.name` is the entry's named slot in `compilation.entries`.

---

### 2. `DynamicEntryPlugin` — entry-as-function (`lib/DynamicEntryPlugin.js:40`)

**Hook tapped:** `compiler.hooks.make` (tapPromise)  
**When:** each `make` call

Used when `config.entry` is a function. Unlike `EntryPlugin`, the entry function is called **inside** the hook, so the entry map is re-evaluated on every build:

```js
compiler.hooks.make.tapPromise(PLUGIN_NAME, (compilation) =>
    Promise.resolve(this.entry())          // call the entry function now
        .then(entry => {
            for (const name of Object.keys(entry)) {
                const options = EntryOptionPlugin.entryDescriptionToOptions(...);
                for (const request of desc.import) {
                    compilation.addEntry(
                        this.context,
                        EntryPlugin.createDependency(request, options),  // fresh dep each build
                        options,
                        ...
                    );
                }
            }
        })
);
```

Fresh `EntryDependency` objects are created each build; `options` come from full `EntryDescriptionNormalized` → `EntryOptions` normalization.

---

### 3. `DllEntryPlugin` — DLL bundles (`lib/dll/DllEntryPlugin.js:38`)

**Hook tapped:** `compiler.hooks.make` (tapAsync)  
**When:** each `make` call

Makes a **single** `addEntry` call that wraps all DLL entries inside one `DllEntryDependency`:

```js
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
    ...
);
```

The outer `DllEntryDependency` is resolved by `DllModuleFactory` → `DllModule` (a synthetic module that holds all the individual entries as children). The inner `EntryDependency` items are still resolved by `NormalModuleFactory`. The `loc.index` on each child tracks ordering within the DLL.

---

### 4. `ContainerPlugin` — Module Federation container (`lib/container/ContainerPlugin.js:89`)

**Hook tapped:** `compiler.hooks.make` (tapAsync)  
**When:** each `make` call

Adds the container's remotes-exposure surface as a single entry. The dependency type is **not** `EntryDependency` but a custom `ContainerEntryDependency`:

```js
const dep = new ContainerEntryDependency(
    this.options.name,   // container name
    exposes,             // parsed exposes list
    shareScope           // e.g. "default"
);
dep.loc = { name: this.options.name };

compilation.addEntry(
    compilation.options.context,
    dep,
    {
        name: this.options.name,
        filename: this.options.filename,
        runtime: this.options.runtime,
        library                         // e.g. { type: "var", name: "app" }
    },
    (error) => {
        if (error) return callback(error);
        hooks.addContainerEntryDependency.call(dep);  // MF post-hook
        callback();
    }
);
```

`ContainerEntryDependency` is resolved by `ContainerEntryModuleFactory` → `ContainerEntryModule`, which generates the container's `__webpack_init_sharing__` / `__webpack_share_scopes__` runtime. This is the only caller that fires a post-`addEntry` hook (`addContainerEntryDependency`).

---

### 5. `HtmlModulesPlugin` — HTML-parsed entries (`lib/html/HtmlModulesPlugin.js:246`)

**Hook tapped:** `compiler.hooks.finishMake` (tapAsync) — **after** the main make phase  
**When:** each `finishMake` call (after the initial `make` entries are all built)

This is the only caller that uses `finishMake` rather than `make`. It waits for HTML modules to be built, reads the `<script src>`, `<link rel="modulepreload">`, and `<link rel="stylesheet">` tags discovered by `HtmlParser`, and injects them as additional entries:

```js
for (const [groupKind, group] of Object.entries(htmlEntryScripts)) {
    const isChainGroup = groupKind !== "modulepreload" && groupKind !== "stylesheet";
    let leaderName;
    for (const entry of group) {
        const dependOn = isChainGroup && leaderName ? [leaderName] : undefined;
        if (isChainGroup && !leaderName) leaderName = entry.entryName;

        compilation.addEntry(
            context,
            EntryPlugin.createDependency(entry.request, { name: entry.entryName }),
            {
                name: entry.entryName,
                filename: compilation.outputOptions.chunkFilename || "[name].js",
                dependOn      // chains script entries to share a runtime; undefined for preloads/stylesheets
            },
            ...
        );
    }
}
```

Script/`script-module` groups are chained: the first entry in the group becomes the runtime leader; every subsequent entry in the same group gets `dependOn: [leaderName]` so they share that runtime chunk rather than each emitting their own. `modulepreload` and `stylesheet` entries are always independent (no `dependOn`). CSS entries additionally get `chunk.cssFilenameTemplate` stamped in `afterChunks` to route them through the CSS filename template.

---

### 6. `ProvideSharedPlugin` — Module Federation shared modules (`lib/sharing/ProvideSharedPlugin.js:217`)

**Uses `addInclude`, not `addEntry`**  
**Hook tapped:** `compiler.hooks.finishMake` (tapPromise) — after make  
**When:** each `finishMake`

This is the only caller of `addInclude`, which targets `entryData.includeDependencies` rather than `entryData.dependencies`. This distinction matters: `includeDependencies` entries get built and their modules become reachable in the graph, but they do not define a named chunk boundary the way `dependencies` entries do.

During `make`, `ProvideSharedPlugin` watches `normalModuleFactory.hooks.module` and populates a `resolvedProvideMap` with every module that matches a `provides` config key. In `finishMake`, it iterates that map and seeds each resolved resource as a shared module:

```js
compilation.addInclude(
    compiler.context,
    new ProvideSharedDependency(
        config.shareScope,   // e.g. "default"
        config.shareKey,     // e.g. "react"
        version || false,
        resource,            // absolute path, resolved during make
        config.eager
    ),
    { name: undefined },     // → goes into globalEntry.includeDependencies
    ...
);
```

`ProvideSharedDependency` is resolved by `ProvideSharedModuleFactory` → `ProvideSharedModule`. Using `{ name: undefined }` places these into `compilation.globalEntry.includeDependencies`, making them available globally without creating a named entry chunk.

---

## Summary map

| Caller | Hook | Dep type | Factory | `target` | When dep is created |
|---|---|---|---|---|---|
| `EntryPlugin` | `make` (tapAsync) | `EntryDependency` | `NormalModuleFactory` | `dependencies` | At plugin construction — reused across rebuilds |
| `DynamicEntryPlugin` | `make` (tapPromise) | `EntryDependency` (fresh) | `NormalModuleFactory` | `dependencies` | Inside `make` hook — re-evaluated every build |
| `DllEntryPlugin` | `make` (tapAsync) | `DllEntryDependency` wrapping `EntryDependency[]` | `DllModuleFactory` / `NormalModuleFactory` | `dependencies` | Inside `make` hook |
| `ContainerPlugin` | `make` (tapAsync) | `ContainerEntryDependency` | `ContainerEntryModuleFactory` | `dependencies` | Inside `make` hook |
| `HtmlModulesPlugin` | `finishMake` (tapAsync) | `EntryDependency` | `NormalModuleFactory` | `dependencies` | After initial make, per discovered HTML tag |
| `ProvideSharedPlugin` | `finishMake` (tapPromise) | `ProvideSharedDependency` | `ProvideSharedModuleFactory` | `includeDependencies` | After initial make, per seen shared module |

The `finishMake` callers (HTML and shared) can themselves trigger further `finishMake`-style work because `addModuleTree` may discover additional modules, but they do not re-enter `make`. The separation between `dependencies` (named entry chunks) and `includeDependencies` (globally included, no dedicated chunk) is enforced entirely through which `target` string `_addEntryItem` receives.

