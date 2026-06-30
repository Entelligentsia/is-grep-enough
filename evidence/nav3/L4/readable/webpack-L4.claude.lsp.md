# transcript: I'm studying how webpack turns the finished module graph into the set of output chunks during sealing — including how synchronous module dependencies are kep...


💬 I'll explore webpack's chunk graph construction systematically using the LSP tool to trace the sealing phase from module graph to chunk graph.
  ▸ ToolSearch(select:LSP)

💬 Let me now explore the key files systematically in parallel — starting with the seal method, chunk graph builder, and key data structures.
  ▸ LSP(buildChunkGraph)
  ▸ LSP(seal)
  ▸ LSP(AsyncDependenciesBlock)
  ▸ LSP({"operation":"goToDefinition","filePath":"/home/bench/repos/webpack/lib/Compilation.js","line":41,"character":10})
  ▸ LSP(ChunkGroup)
  ▸ Read(/home/bench/repos/webpack/lib/AsyncDependenciesBlock.js)

💬 Now let me read the core files in parallel — the full `buildChunkGraph.js`, the `seal` method, and the key data structures.
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/ChunkGroup.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/Entrypoint.js)

💬 Now let me read the queue processing and async block handling — the heart of the algorithm.
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)

💬 Now let me read the queue processing loop and the merging/available modules computation.
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)

💬 Now let me look at how dynamic imports create `AsyncDependenciesBlock` and at `addChunkInGroup`.
  ▸ LSP(addChunkInGroup)
  ▸ Read(/home/bench/repos/webpack/lib/dependencies/ImportParserPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/Compilation.js)
  ▸ Read(/home/bench/repos/webpack/lib/dependencies/ImportParserPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/dependencies/ImportParserPlugin.js)
  ▸ Read(/home/bench/repos/webpack/lib/DependenciesBlock.js)
  ▸ Read(/home/bench/repos/webpack/lib/dependencies/ImportParserPlugin.js)

💬 I now have a complete picture of the entire mechanism. Let me write the full explanation.  ---  ## How webpack builds the chunk graph from the module graph d...

──────── RESULT (success, 197929ms, 25 turns) ────────
I now have a complete picture of the entire mechanism. Let me write the full explanation.

---

## How webpack builds the chunk graph from the module graph during sealing

The process runs in `Compilation.seal()` → `buildChunkGraph()` and is driven by a BFS-style queue with bigint bitmasks for available-module tracking. Here is how every piece fits together.

---

### 1. The data model that bridges the two graphs

**`DependenciesBlock`** (`lib/DependenciesBlock.js`) is the structural base:

```
dependencies[]   ← synchronous edges (Dependency instances → other modules)
blocks[]         ← async boundaries (AsyncDependenciesBlock instances)
parent           ← back-pointer for nested blocks
```

Both `Module` and `AsyncDependenciesBlock` extend it. The distinction is the semantic one: modules are graph nodes; async blocks are the demarcation lines that force a chunk split.

**`AsyncDependenciesBlock`** (`lib/AsyncDependenciesBlock.js`) is created by `ImportParserPlugin` for every `import()` expression that resolves to a static string (`lib/dependencies/ImportParserPlugin.js:551-569`):

```js
const depBlock = new AsyncDependenciesBlock(
    { ...groupOptions, name: chunkName },   // carries webpackChunkName, prefetch, etc.
    expr.loc,
    param.string                            // the specifier
);
const dep = new ImportDependency(...);
depBlock.addDependency(dep);
parser.state.current.addBlock(depBlock);   // attaches to the owning module
```

The module graph therefore already embeds every async boundary as a `blocks[]` child of the module that wrote `import()`. `buildChunkGraph` reads this shape to decide what becomes a new chunk.

**`ChunkGroup`** (`lib/ChunkGroup.js`) groups chunks that must be loaded together. It carries parent/child relationships among chunk groups (forming the async-dependency tree), the `AsyncDependenciesBlock`s that originated each group, and pre/post-order traversal indices. **`Entrypoint`** (`lib/Entrypoint.js`) is a `ChunkGroup` subclass used for entry points; it additionally tracks which chunk holds the webpack bootstrap runtime.

**`ChunkGraph`** (`lib/ChunkGraph.js`) is the authoritative registry for which modules belong to which chunks and which `AsyncDependenciesBlock` maps to which `ChunkGroup`.

---

### 2. Sealing sets up entrypoints and calls `buildChunkGraph`

`Compilation.seal()` (`lib/Compilation.js:3473`) iterates `this.entries`. For each entry it:

1. Creates a `Chunk` via `this.addChunk(name)` (`Compilation.js:3512`).
2. Creates an `Entrypoint` (a `ChunkGroup`), wires the chunk as both its runtime chunk and its entrypoint chunk, registers it in `this.namedChunkGroups` and `this.entrypoints` (`Compilation.js:3516–3527`).
3. For each dependency of the entry, resolves the module via `moduleGraph.getModule(dep)` and calls `chunkGraph.connectChunkAndEntryModule(chunk, module, entrypoint)` — establishing the initial module-to-chunk connection (`Compilation.js:3541`).
4. Accumulates a `chunkGraphInit: Map<Entrypoint, Module[]>` that records which modules seed each entrypoint.

After processing `dependOn`/`runtime` cross-entry relationships (which set up parent-child edges between entrypoints), the seal method calls:

```js
buildChunkGraph(this, chunkGraphInit);   // Compilation.js:3656
```

Everything that follows is inside `lib/buildChunkGraph.js`.

---

### 3. `buildChunkGraph`: three phases

#### Phase 1 — `visitModules`: BFS traversal building the chunk graph

`visitModules` allocates per-chunk-group state objects of type `ChunkGroupInfo` (defined at `buildChunkGraph.js:37-57`):

```
chunkGroup            ← the ChunkGroup object
runtime               ← which runtimes include this group (bitfield/string)
minAvailableModules   ← bigint bitmask: modules guaranteed present in all parents
availableModulesToBeMerged  ← pending updates to minAvailableModules
resultingAvailableModules   ← minAvailableModules | (all modules in this group's chunks)
skippedItems          ← modules deferred because they were in minAvailableModules
children              ← child ChunkGroupInfos spawned by async blocks inside this group
```

For root entrypoints (no `dependOn` parents), `minAvailableModules` starts at `0n` — nothing is pre-available. For child entrypoints that `dependOn` another entry, it starts `undefined` (unknown until the parent is processed).

Each module in the `chunkGraphInit` map becomes an `ADD_AND_ENTER_MODULE` item in the main queue. The queue is processed as a **stack** (pop from the end) to get depth-first order. Async blocks go onto a separate **`queueDelayed`** stack and only become live when the main queue drains — ensuring all synchronous modules are wired before any async chunk is traversed.

**`processQueue`** (`buildChunkGraph.js:922`) handles five action types:

| Action | What happens |
|--------|-------------|
| `ADD_AND_ENTER_ENTRY_MODULE` | `chunkGraph.connectChunkAndEntryModule(chunk, module, chunkGroup)`, then falls through |
| `ADD_AND_ENTER_MODULE` | if not already in chunk: `chunkGraph.connectChunkAndModule(chunk, module)` + update `maskByChunk[chunk]` bitmask, then fall through |
| `ENTER_MODULE` | assign pre-order index; re-push self as `LEAVE_MODULE`; fall through |
| `PROCESS_BLOCK` | call `processBlock(block)` |
| `LEAVE_MODULE` | assign post-order index |

**`processBlock(block)`** (`buildChunkGraph.js:791`) is the synchronous traversal step. It calls `getBlockModules(block, runtime)` to obtain an array of `(refModule, activeState, connections[])` triples, then for each:

- If the module is already in the current chunk: skip immediately.
- If `activeState === false` (dead for this runtime): record in `skippedModuleConnections`, skip.
- If `isOrdinalSetInMask(minAvailableModules, ordinalOf(refModule))` is true: **record in `skippedItems` and skip** — the module is already guaranteed present in all parent chunks, so it must not be duplicated.
- Otherwise: push an `ADD_AND_ENTER_MODULE` item. The module will be connected to the current chunk on the next iteration.

After processing module connections, `processBlock` iterates `block.blocks` and calls **`iteratorBlock(b)`** for each `AsyncDependenciesBlock`.

---

**`iteratorBlock(b)`** (`buildChunkGraph.js:564`) is the async-boundary handler. It looks up `blockChunkGroups.get(b)` to see if a chunk group already exists for this block. If not, it branches:

- **No async chunks allowed** (`!chunkGroupInfo.asyncChunks || !chunkGroupInfo.chunkLoading`): the block's contents are just queued into the *current* chunk group — no split.
- **`entryOptions` present** (e.g. webpack `/* webpackEntryOptions */` for workers): creates an async `Entrypoint` via `compilation.addAsyncEntrypoint()`. This entrypoint gets its own `runtime` and `minAvailableModules: 0n` (it starts fresh). A `PROCESS_ENTRY_BLOCK` item goes to `queueDelayed`.
- **Normal async split** (the common `import()` case): calls `compilation.addChunkInGroup(b.groupOptions, module, loc, request)` (`Compilation.js:4355`), which creates a new `ChunkGroup` + `Chunk`. If the block carried a `webpackChunkName` and a group of that name already exists, the existing group is reused and the origin is simply appended. The new group's `ChunkGroupInfo` is created with `minAvailableModules: undefined` (not yet known) and goes into `allCreatedChunkGroups`.

In all cases the function records a `BlockChunkGroupConnection` entry in `blockConnections` — this is the raw edge from "origin chunk group" to "async chunk group" that Phase 2 will formalize. It also adds a `[target ChunkGroupInfo, PROCESS_BLOCK item]` entry to `queueConnect`, so that when the origin's available modules are known they can be propagated.

---

After `processQueue` drains, the outer loop runs three auxiliary passes:

**`processConnectQueue()`** (`buildChunkGraph.js:1033`):

For every `(originChunkGroupInfo, targets)` entry recorded by `iteratorBlock`:
1. Marks each target as a child of origin in `chunkGroupInfo.children`.
2. Computes `resultingAvailableModules = originChunkGroupInfo.minAvailableModules | (union of maskByChunk for every chunk in origin's group)`. This is everything the async chunk can count on being pre-loaded by the time it runs.
3. Pushes that bitmask into `target.availableModulesToBeMerged`.
4. Adds `[target, PROCESS_BLOCK]` to `chunkGroupsForMerging`.
5. Merges runtimes and marks any changed targets as outdated.

**`processChunkGroupsForMerging()`** (`buildChunkGraph.js:1068`):

For each pending async chunk group:

```js
// intersection across all parent contributions
minAvailableModules &= eachContribution;   // buildChunkGraph.js:1083
```

The **AND / intersection** is the correctness invariant: a module is only safe to omit from an async chunk if *every possible load path* to that chunk already carries it. If the async chunk has multiple parents, each parent's `resultingAvailableModules` goes through the AND gate; only modules present in all parents are safe to skip.

If `minAvailableModules` changed (or this is a new block that hasn't been walked yet), the `PROCESS_BLOCK` item goes back to `queueDelayed`. This re-traversal with the now-known `minAvailableModules` will correctly skip or include modules based on the intersection.

**`processOutdatedChunkGroupInfo()`** (`buildChunkGraph.js:1149`):

When `minAvailableModules` *shrinks* for a chunk group (because an additional parent's contribution narrowed the intersection), previously-skipped modules may need to be re-added:

```js
for (const module of info.skippedItems) {
    if (!isOrdinalSetInMask(minAvailableModules, getModuleOrdinal(module))) {
        // No longer guaranteed available — add to chunk
        queue.push({ action: ADD_AND_ENTER_MODULE, ... });
        info.skippedItems.delete(module);
    }
}
```

It also re-triggers child chunk groups for re-merging and re-triggers `dependOn` entrypoints for combining (via `chunkGroupsForCombining`).

The outer `while (queue.length || queueConnect.size)` loop repeats until all queues drain and no more modules are found to add anywhere. Then `queueDelayed` is swapped in as the new `queue`, processing async chunks.

---

#### Phase 2 — `connectChunkGroups`: formalizing parent-child edges

`connectChunkGroups` (`buildChunkGraph.js:1340`) iterates the `blockConnections` map. For each `AsyncDependenciesBlock → connections[]` edge:

```js
// Optimization: if all modules the async chunk would contain
// are already in the origin's resultingAvailableModules,
// AND there are no nested async blocks, skip the connection entirely.
if (
    !blocksWithNestedBlocks.has(block) &&
    connections.every(({ chunkGroup, originChunkGroupInfo }) =>
        areModulesAvailable(chunkGroup, originChunkGroupInfo.resultingAvailableModules)
    )
) continue;
```

`areModulesAvailable` uses the `maskByChunk` bitmasks: `(chunkMask & availableModules) === chunkMask`. If the async chunk ended up empty (every module was already available), the runtime link is never created and the lazy `import()` resolves at no extra network cost.

For connections that survive the check:

```js
chunkGraph.connectBlockAndChunkGroup(block, chunkGroup);       // block → chunk group
originChunkGroupInfo.chunkGroup.addChild(chunkGroup);          // parent → child
chunkGroup.addParent(originChunkGroupInfo.chunkGroup);         // child → parent
```

These are the edges that the runtime reads when generating `__webpack_require__.e` calls.

**Cleanup** (`buildChunkGraph.js:1404`): any chunk group with no parents after Phase 2 is removed along with its chunk — it was created speculatively but turned out unreachable.

---

### 4. After `buildChunkGraph`

Back in `seal()`, runtime IDs are propagated from chunk groups to their chunks (`buildChunkGraph.js:1471–1475`). Then the optimization hooks run:

- `optimizeChunks` — `SplitChunksPlugin` taps here to split/merge chunks further
- `optimizeChunkModules` — minifiers tap here
- Module IDs, chunk IDs, and runtime IDs are assigned
- Code generation proceeds with the finalized chunk graph

---

### 5. How the pieces tie together — a mental model

```
Module graph (built during make phase)
│
│  Each Module has:
│    dependencies[] → synchronous edges (same chunk)
│    blocks[]       → AsyncDependenciesBlock (chunk split boundary)
│
▼
seal() creates one Entrypoint + Chunk per entry
    │
    └─► buildChunkGraph(chunkGraphInit)
            │
            ├─ visitModules  ──────────────────────────────────────────────┐
            │   ┌─────────────────────────────────────┐                   │
            │   │ queue (sync, depth-first)            │                   │
            │   │  ADD_AND_ENTER_MODULE                │                   │
            │   │    → connectChunkAndModule           │  queueDelayed     │
            │   │    → update maskByChunk bitmask      │  (async blocks)   │
            │   │  PROCESS_BLOCK                       │                   │
            │   │    → sync deps: add to queue         │◄──────────────────┘
            │   │      (skipped if bit in              │  swapped in after
            │   │       minAvailableModules)            │  sync queue drains
            │   │    → async blocks → iteratorBlock    │
            │   │        → addChunkInGroup             │
            │   │        → record in queueConnect      │
            │   └─────────────────────────────────────┘
            │        ↓ when queue empty
            │   processConnectQueue
            │     → resultingAvailableModules = min | ownChunkMask
            │     → push to availableModulesToBeMerged of child
            │        ↓
            │   processChunkGroupsForMerging
            │     → minAvailableModules = AND across all parents
            │     → if changed → re-walk block, re-queue skippedItems
            │        ↓
            │   processOutdatedChunkGroupInfo
            │     → reconsider skipped modules, re-trigger children
            │
            └─ connectChunkGroups
                 → skip edge if async chunk is fully covered by parent
                 → otherwise: chunkGraph.connectBlockAndChunkGroup
                              parent.addChild / child.addParent
```

**The invariant that keeps async chunks minimal**: `processBlock` skips any module whose bit is already set in `minAvailableModules`. `minAvailableModules` is the AND-intersection of every path that can lead to this async chunk — so a module appears in an async chunk only if at least one parent path cannot guarantee it was already loaded. Named chunk deduplication (`namedChunkGroups` map) and the intersection across multiple parents both fall out naturally from this single rule.
