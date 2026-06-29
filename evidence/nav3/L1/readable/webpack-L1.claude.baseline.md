# transcript: I'm reasoning about how webpack represents a single module while it's being compiled — the in-memory object that stands for one module as a node in the modul...


💬 Let me read the core module files to give you an accurate picture.
  ▸ Read(/home/bench/repos/webpack/lib/Module.js)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)

💬 Now let me read the `NormalModule` constructor and `DependenciesBlock` to see how dependencies are stored.
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)
  ▸ Read(/home/bench/repos/webpack/lib/DependenciesBlock.js)

💬 Now let me find the `NormalModule` constructor and `ModuleGraph`'s per-module data structure.
  ▸ Bash(grep -n "constructor(" /home/bench/repos/webpack/lib/NormalModule.js | head -5)
  ▸ Bash(grep -n "class ModuleGraphModule\|this\.outgoingConnections\|this\.incomingConnections\|this\.exports\|this\.issuer\|this\.preOrderIndex\|this\.postOrderInde...)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)
  ▸ Read(/home/bench/repos/webpack/lib/ModuleGraph.js)

💬 Let me quickly check the `NormalModuleBuildInfo` typedef and `ModuleGraphConnection` to complete the picture.
  ▸ Bash(grep -n "KnownNormalModuleBuildInfo\|NormalModuleBuildInfo" /home/bench/repos/webpack/lib/NormalModule.js | head -15)
  ▸ Bash(grep -n "class ModuleGraphConnection\|this\.originModule\|this\.dependency\|this\.module\b\|this\.active\|this\.conditional\|this\.weak" /home/bench/repos/we...)
  ▸ Read(/home/bench/repos/webpack/lib/NormalModule.js)

💬 Now I have everything I need for a complete picture. Here's how it fits together:  ---  ## The in-memory module object  ### Class hierarchy  ``` Dependencies...

──────── RESULT (success, 77962ms, 12 turns) ────────
Now I have everything I need for a complete picture. Here's how it fits together:

---

## The in-memory module object

### Class hierarchy

```
DependenciesBlock
  └── Module
        └── NormalModule   ← what you get for a normal source file
```

### `DependenciesBlock` — the dependency container (`lib/DependenciesBlock.js:27`)

The root of the hierarchy is just a container for two arrays:

- `dependencies: Dependency[]` — every synchronous edge this block produces: `import` statements, `require()` calls, export declarations, etc. These are *syntax-level* objects (e.g. `HarmonyImportDependency`); they carry the request string and source location but are not yet resolved to a module.
- `blocks: AsyncDependenciesBlock[]` — dynamic `import()` calls, each of which is itself a `DependenciesBlock` (recursively), marking an async split point.

### `Module` — type identity and build results (`lib/Module.js:243`)

`Module extends DependenciesBlock` and adds the fields that are true of every kind of module:

**Identity**
- `type: string` — this is the kind discriminant. Values come from `lib/ModuleTypeConstants.js`: `"javascript/auto"`, `"javascript/esm"`, `"javascript/dynamic"`, `"asset/resource"`, `"webassembly/sync"`, `"css/mini-extract"`, etc. `NormalModule.identifier()` prefixes the request with the type when the type isn't `javascript/auto`.
- `context: string | null` — the directory from which relative imports resolve.
- `layer: string | null` — optional build layer (for module federation / layer experiments).

**From the factory (before build)**
- `resolveOptions` — per-module resolver overrides.
- `factoryMeta` — e.g. `{ sideEffectFree: true }` when `sideEffects: false` comes from `package.json`.

**From the build step (populated after `build()` runs)**
- `buildMeta: BuildMeta` — high-level semantic facts the rest of the pipeline reads: `exportsType` (`"namespace"`, `"default"`, `"flagged"`, `"dynamic"`), `async`, `sideEffectFree`.
- `buildInfo: BuildInfo` — lower-level build artifacts: `strict`, `moduleArgument`, `exportsArgument`, any assets emitted by loaders (`assets`, `assetsInfo`), `topLevelDeclarations`.
- `_warnings / _errors` — diagnostics collected during build.
- `presentationalDependencies` — `Dependency` objects that affect display/stats but add no graph edge.
- `codeGenerationDependencies` — dependencies whose *code-generation result* (not just presence) this module needs at codegen time.

### `NormalModule` — the concrete case (`lib/NormalModule.js:768`)

For a regular source file, `NormalModule extends Module` and adds:

**From the factory**
- `request` — the full internal key, e.g. `"/abs/path/to/loader.js!/abs/path/to/file.js"`.
- `userRequest` — the human-visible request without internal loaders.
- `rawRequest` — the literal string that appeared in the source (`"./foo"`).
- `resource` — the resolved filesystem path of the file itself.
- `loaders: {loader, options}[]` — the loader chain to run.
- `parser` — the `Parser` instance for this type (e.g. `JavascriptParser`).
- `generator` — the `Generator` instance for this type; `codeGeneration()` delegates to it.

**From the build step**
- `_source: Source | null` — the `webpack-sources` `Source` object (the post-loader, pre-codegen content). This is what the parser consumed and what gets handed to the generator.
- `buildInfo` — same `BuildInfo` bag as `Module`, but narrowed to `NormalModuleBuildInfo`, which adds: `fileDependencies`, `contextDependencies`, `missingDependencies` (for watching), `snapshot` (for cache invalidation), `parsed` (whether parsing completed), `hash`.

### `ModuleGraph` — where the graph topology actually lives

The module object itself does *not* store its resolved neighbours. That data lives in a separate `ModuleGraph` which holds a `Map<Module, ModuleGraphModule>` (`lib/ModuleGraph.js:96`). Each `ModuleGraphModule` holds:

- `incomingConnections: SortableSet<ModuleGraphConnection>` — who imports this module.
- `outgoingConnections: SortableSet<ModuleGraphConnection> | undefined` — what this module imports (resolved).
- `exports: ExportsInfo` — the tree of what this module is known to export, used by tree-shaking.
- `issuer: Module | null` — the first module that caused this one to be added to the graph.
- `preOrderIndex / postOrderIndex / depth` — traversal metadata.

Each edge is a `ModuleGraphConnection` (`lib/ModuleGraphConnection.js:55`):
- `originModule` — the importer.
- `module` — the importee.
- `dependency` — the specific `Dependency` object (from the importer's `.dependencies` array) that created this edge. This is the link between the syntax-level array and the resolved graph.
- `weak`, `conditional` — flags for optional/conditional connections (e.g. `require.weak`, runtime-gated imports).

### Putting it together

When `Compilation` builds a module, the sequence is:

1. `NormalModuleFactory` creates a `NormalModule`, setting `type`, `request`, `resource`, `loaders`, `parser`, `generator`.
2. `compilation.buildModule()` calls `module.build()`: runs loaders → produces `_source` → calls `parser.parse()` → parser calls `module.addDependency()` (filling `dependencies[]`) and `module.addBlock()` (filling `blocks[]`).
3. After build, `buildMeta` and `buildInfo` are populated.
4. `Compilation` then calls `moduleGraph.setResolvedModule(originModule, dependency, resolvedModule)` for each dependency, which creates or updates `ModuleGraphConnection` objects — wiring the syntax-level `dependencies[]` items to actual `Module` nodes in the graph.

So the `Dependency` objects on `.dependencies[]` are the *parse evidence* (what the source said), and the `ModuleGraphConnection` objects hanging off the `ModuleGraph` are the *resolved edges* (which compiled module that actually points to).
