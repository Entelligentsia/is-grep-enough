# transcript: I'm studying how webpack turns the finished module graph into the set of output chunks during sealing — including how synchronous module dependencies are kep...


💬 I'll use grove to map out the sealing pipeline and chunk graph construction. Let me load the grove tools and explore the key structures in parallel.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__map,mcp__grove__source,mcp__grove__callers)

💬 Now let me pull outlines of the core files in parallel — `Compilation.js`, `ChunkGraph.js`, `ModuleGraph.js`, and the optimize directory map.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/Compilation.js","detail":0,"kind":"method"})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/ChunkGraph.js","detail":0,"kind":"method"})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/ModuleGraph.js","detail":0,"kind":"method"})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/ChunkGroup.js","detail":0})

💬 Let me find the chunk graph builder and then read the `seal` method and the key algorithms in parallel.
  ▸ Bash(find /home/bench/repos/webpack/lib -name "*chunk*" -o -name "*Chunk*" | sort)
  ▸ mcp__grove__source({"file":"/home/bench/repos/webpack/lib/Compilation.js","name":"seal"})

💬 Now let me read the full `buildChunkGraph.js` — this is the heart of it — and the `Chunk.js` class in parallel.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/buildChunkGraph.js","detail":1})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/webpack/lib/Chunk.js","detail":0})

💬 Now let me read the key functions in `buildChunkGraph.js` — the main entry point and the core algorithms.
  ▸ mcp__grove__source({"id":"javascript:lib/buildChunkGraph.js#buildChunkGraph@1425"})
  ▸ mcp__grove__source({"id":"javascript:lib/buildChunkGraph.js#visitModules@294"})

💬 Let me also read `extractBlockModules`, `connectChunkGroups`, and `areModulesAvailable` to complete the picture.
  ▸ mcp__grove__source({"id":"javascript:lib/buildChunkGraph.js#extractBlockModules@115"})
  ▸ mcp__grove__source({"id":"javascript:lib/buildChunkGraph.js#connectChunkGroups@1340"})
  ▸ mcp__grove__source({"id":"javascript:lib/buildChunkGraph.js#getActiveStateOfConnections@94"})

💬 Now I have everything I need. Here is the complete picture of how webpack builds the chunk graph from the module graph during sealing.  ---  ## How webpack b...

──────── RESULT (success, 193414ms, 15 turns) ────────
Now I have everything I need. Here is the complete picture of how webpack builds the chunk graph from the module graph during sealing.

---

## How webpack builds the chunk graph during sealing

### The two graphs and what connects them

**ModuleGraph** (`lib/ModuleGraph.js`) is built during the make phase. It is a graph of `ModuleGraphConnection` objects — each one links a `Dependency` to the `Module` it resolved to and carries an `activeState` (always-on, always-off, or runtime-conditional). Modules own their dependencies in two kinds of containers: synchronous `DependenciesBlock` (the module itself is one) and `AsyncDependenciesBlock` sub-objects (one per `import()` call). The async block is the crucial bridge: it lives in the module graph as part of a module's dependency tree, but it is what causes the chunk graph to grow a new branch.

**ChunkGraph** (`lib/ChunkGraph.js`) is built during sealing. Its two fundamental records are `ChunkGraphModule` (which chunks contain a given module) and `ChunkGraphChunk` (which modules are in a given chunk, which are its entry modules, which are its runtime modules). The primary write operations are:
- `connectChunkAndModule(chunk, module)` — puts a module into a chunk
- `connectChunkAndEntryModule(chunk, module, entrypoint)` — same, but marks it as an entry
- `connectBlockAndChunkGroup(block, chunkGroup)` — links an `AsyncDependenciesBlock` to the `ChunkGroup` created for it; this is how async split points are represented in the chunk graph

**ChunkGroup** (`lib/ChunkGroup.js`) is the parent-child tree layered on top of chunks. An `Entrypoint` (a `ChunkGroup` subclass) is the root. Each async import that actually needs a new chunk produces a child `ChunkGroup` with its own `Chunk`. The group tree answers the question "what is guaranteed to already be loaded when this chunk runs?", which drives the available-modules deduplication.

---

### Phase 0 — `seal()` initialises entrypoints (`Compilation.js:3473`)

Before calling `buildChunkGraph`, `seal()` iterates `this.entries` and for each one:

1. Calls `this.addChunk(name)` — allocates the initial `Chunk` object.
2. Creates `new Entrypoint(options)`, sets its runtime chunk and entrypoint chunk to the new chunk, pushes the chunk into the entrypoint, and adds the group to `this.chunkGroups` and `this.namedChunkGroups`.
3. For each entry dependency (`this.globalEntry.dependencies` plus the per-entry deps), resolves the module from `this.moduleGraph.getModule(dep)` and calls `this.chunkGraph.connectChunkAndEntryModule(chunk, module, entrypoint)`.
4. Accumulates `chunkGraphInit: Map<Entrypoint, Module[]>` — the list of modules that each entrypoint should seed.
5. Handles `dependOn` (inter-entry dependency) and `runtime` (shared runtime chunk) options by wiring chunk group parent/child relationships and allocating a separate runtime chunk where needed.

Then it calls `buildChunkGraph(this, chunkGraphInit)`.

---

### Phase 1 — `visitModules`: the traversal (`lib/buildChunkGraph.js:294`)

`buildChunkGraph` has three named parts. The first and largest is `visitModules`.

#### ChunkGroupInfo

Each `ChunkGroup` being processed gets a `ChunkGroupInfo` companion:

```js
{
  chunkGroup,
  runtime,                      // which runtime(s) use this group
  minAvailableModules,          // bigint bitmask — modules guaranteed available from ALL parents
  availableModulesToBeMerged,   // pending bitmasks from parents, to be AND-merged
  skippedItems,                 // modules deferred because they're in minAvailableModules
  skippedModuleConnections,     // conditional connections deferred pending runtime resolution
  resultingAvailableModules,    // minAvailableModules | all modules in this group's chunks
  children,                     // child ChunkGroupInfos (async splits)
  availableSources/availableChildren,  // for dependOn combining
  initialized, circular, depModule, ...
}
```

For top-level entrypoints `minAvailableModules` starts at `0n` (nothing is pre-loaded). For a `dependOn` entry or a child async group it starts undefined until parent information propagates in.

#### Module ordinals and bigint bitmasks

Instead of `Set<Module>`, available-module tracking uses `bigint` bitmasks for O(1) bitwise intersection. Each module is assigned a unique integer ordinal lazily (first time it appears in traversal), and a bit at that position represents "this module is present". `maskByChunk: Map<Chunk, bigint>` holds the bitmask for each chunk's current module set. Ordinals are cleared after `visitModules` — they are local to the build.

#### `extractBlockModules` — preprocessing a module's connections

Before the queue processes a module, `extractBlockModules` (`line 115`) does a one-time scan of that module's outgoing `ModuleGraphConnection`s. It partitions them by their owning `DependenciesBlock` (using `moduleGraph.getParentBlock(dep)` and `getParentBlockIndex(dep)` to find the slot in the block's dependency array) and produces a flat tuple array per block:

```
[module, activeState, connection, module, activeState, connection, ...]
```

Multiple connections to the same target module within one block are merged: states are OR-combined via `addConnectionStates`, and the connections are collected into an array for later conditional-state re-evaluation. The result is cached in `blockModulesMap` keyed by `(runtime, block)`, with a memcache shortcut for persistent caching.

#### The action queue and what each action does

Queue items carry `{action, block, module, chunk, chunkGroup, chunkGroupInfo}`. The action codes form a chain:

| Action | What happens |
|---|---|
| `ADD_AND_ENTER_ENTRY_MODULE` | `connectChunkAndEntryModule`, then fall through |
| `ADD_AND_ENTER_MODULE` | `connectChunkAndModule(chunk, module)`, set bit in `maskByChunk`, then fall through |
| `ENTER_MODULE` | Record pre-order index on both `chunkGroup` and `moduleGraph`; push a `LEAVE_MODULE` item back onto the queue; fall through |
| `PROCESS_BLOCK` | Run `processBlock(block)` |
| `PROCESS_ENTRY_BLOCK` | Run `processEntryBlock(block)` |
| `LEAVE_MODULE` | Record post-order index |

The fallthrough means `ADD_AND_ENTER_MODULE` → `ENTER_MODULE` → `PROCESS_BLOCK` is one logical operation executed on a single dequeue.

#### `processBlock` — visiting synchronous dependencies

For each module (or block within a module), `processBlock` (`line 791`) checks every entry in the precomputed tuple array:

- **Already in chunk** (`chunkGraph.isModuleInChunk`) → skip; already done.
- **`activeState === false`** → skip; dead code (tree shaken or conditionally inactive for this runtime).
- **`activeState !== true`** (conditional connection) → defer into `skippedModuleConnections`; will be reconsidered when runtime is settled.
- **`isOrdinalSetInMask(minAvailableModules, ordinal)`** → defer into `skippedItems`; this module is guaranteed to be loaded by a parent chunk, so it would be redundant to include it here. It will be promoted back to the queue if the available-modules calculation is later revised downward.
- **Otherwise** → push `ADD_AND_ENTER_MODULE` into the queue.

Then `processBlock` iterates `block.blocks` (the `AsyncDependenciesBlock` children) and calls `iteratorBlock` on each one.

#### `iteratorBlock` — async split points

`iteratorBlock` (`line 564`) is where new chunk groups are born. When a module contains `import("./foo")`, the parser created an `AsyncDependenciesBlock`. `iteratorBlock` handles it:

**If `asyncChunks=false` or `chunkLoading=false`** (e.g., the entrypoint was configured not to code-split): push a `PROCESS_BLOCK` into the *current* group's queue — the async boundary is dissolved and the module goes into the parent chunk.

**Normal async case**:
1. Look up by chunk name in `namedChunkGroups` (deduplication: multiple `import("./foo")` in the same build sharing a chunk name all map to the same group).
2. If new: call `compilation.addChunkInGroup(b.groupOptions || b.chunkName, ...)` which allocates a new `ChunkGroup` and a new `Chunk`. Initialize a `ChunkGroupInfo` with `minAvailableModules: undefined` (not yet known — must wait for all parents to be processed). Set `maskByChunk` for the new chunk to `0n`.
3. Record the `(originChunkGroupInfo, newChunkGroup)` edge in `blockConnections`.
4. Add a `(newCgi, PROCESS_BLOCK_item)` pair to `queueConnect[currentChunkGroupInfo]` — this defers the traversal of the async block's modules until the available-module information from the parent is known.

**If `entryOptions` present** (`import(/* webpackEntryOptions: {runtime: "foo"} */ ...)`): creates a full `Entrypoint` via `compilation.addAsyncEntrypoint` with `minAvailableModules: ZERO_BIGINT` (starts clean, no parent available-modules inheritance).

#### The outer iteration loop

```
while (queue.length || queueConnect.size) {
  processQueue();                      // drain sync queue

  processChunkGroupsForCombining();    // dependOn: combine parent availables

  if (queueConnect.size > 0) {
    processConnectQueue();             // propagate resultingAvailable to children
    processChunkGroupsForMerging();    // AND-merge incoming available masks
  }

  processOutdatedChunkGroupInfo();     // re-enqueue skipped items/connections

  if (queue.length === 0) {
    swap(queue, queueDelayed);         // promote async blocks after all sync done
  }
}
```

The `queueDelayed` swap is important: async blocks are only promoted to the main queue once the main queue empties. This ensures global pre/post-order indices are assigned in a deterministic order (all synchronous modules of an entrypoint first, then async sub-graphs).

---

### Available-module propagation in detail

This is the mechanism that prevents duplicating modules across async chunks.

**`processConnectQueue()`** (`line 1033`): For each parent `ChunkGroupInfo` that has deferred children in `queueConnect`:
1. Computes `resultingAvailableModules = minAvailableModules | OR(maskByChunk[chunk] for chunk in group)`. This is the set of all modules this group provides: what was already available when it started, plus everything it added.
2. Pushes `resultingAvailableModules` into each child's `availableModulesToBeMerged`.
3. Merges runtime identifiers upward.
4. Adds child to `chunkGroupsForMerging`.

**`processChunkGroupsForMerging()`** (`line 1068`): For each child with pending `availableModulesToBeMerged`:
- Computes `minAvailableModules = AND of all pending masks`. The AND (intersection) is essential: a module is only guaranteed available if *every possible path* to this chunk has already loaded it. If there are two parents and only one of them contains a module, that module is not safely skippable.
- If `minAvailableModules` changed, marks `outdatedChunkGroupInfo`.
- If the block needs traversal (first time or changed availables), pushes `PROCESS_BLOCK` into `queueDelayed`.

**`processOutdatedChunkGroupInfo()`** (`line 1149`): For each group whose `minAvailableModules` changed:
1. Re-examines `skippedItems`: if a module was deferred because its bit was set in `minAvailableModules`, but `minAvailableModules` has now shrunk (bit cleared), the module is no longer guaranteed available from all parents, so it is promoted back into the queue as `ADD_AND_ENTER_MODULE`.
2. Re-examines `skippedModuleConnections`: evaluates each conditional connection against the settled runtime; if now active, re-queues the module.
3. Propagates the update to children (adds them to `queueConnect`) and to `dependOn` parents (adds them to `chunkGroupsForCombining`).

**`processChunkGroupsForCombining()`** (`line 1120`): For `dependOn` entries whose `minAvailableModules` is the *union* (OR) of all parent entries' `resultingAvailableModules` — because a `dependOn` entry can assume the *union* of its declared parents is loaded (not just the intersection), so it gets the benefit of all of them.

---

### Phase 2 — `connectChunkGroups` (`lib/buildChunkGraph.js:1340`)

After all modules are assigned, this phase wires the parent-child edges in the `ChunkGroup` tree and performs a final optimisation.

For each `(AsyncDependenciesBlock, connections[])` in `blockConnections`:

**Skip check**: If the block has no nested async blocks *and* `areModulesAvailable(chunkGroup, originCgi.resultingAvailableModules)` returns true for every connection — meaning every module the child chunk contains is already in the parent's `resultingAvailableModules` bitmask — then the edge is skipped entirely. The child chunk is fully redundant: every module it would supply is already available. This keeps the parent-child tree lean.

`areModulesAvailable` (`line 1354`) checks: `(maskByChunk[chunk] & availableModules) === maskByChunk[chunk]` for each chunk in the group — a pure bitmask subset test.

If the edge is not skipped:
- `chunkGraph.connectBlockAndChunkGroup(block, chunkGroup)` — records the async block → chunk group mapping that codegen will use to emit the `import()` runtime call.
- `parent.addChild(child)` / `child.addParent(parent)` — wires the chunk group tree.

---

### Phase 3 — runtime assignment and cleanup

After `connectChunkGroups`, `buildChunkGraph` propagates runtime identifiers to chunks (`chunk.runtime = mergeRuntime(...)`) and calls `cleanupUnconnectedGroups` to remove any chunk groups that ended up with no parent connection (chunks whose content was entirely available from parents and whose block was skipped).

---

### Post-`buildChunkGraph` passes

Back in `seal()`, `buildChunkGraph` returns and the `optimizeChunks` hook fires. Key plugins:
- **`SplitChunksPlugin`**: finds modules shared across multiple async chunks and extracts them into a new shared chunk, then adjusts `minAvailableModules` relationships.
- **`MergeDuplicateChunksPlugin`**: coalesces chunks with identical module sets.
- **`RemoveEmptyChunksPlugin`**: drops empty chunks.
- **`FlagIncludedChunksPlugin`**: marks chunks fully contained in another chunk, allowing the runtime to skip loading them.

---

### The data-flow summary

```
Compilation.entries
  → seal(): addChunk + new Entrypoint + connectChunkAndEntryModule
  → chunkGraphInit: Map<Entrypoint, Module[]>
  → buildChunkGraph()

buildChunkGraph / visitModules:
  ModuleGraph.getOutgoingConnections()  ← extractBlockModules reads this
    → flat tuple [module, activeState, connection(s)] per block
  
  queue: ADD_AND_ENTER_MODULE
    → connectChunkAndModule(chunk, module)   ← writes ChunkGraph
    → maskByChunk[chunk] |= 1n << ordinal
    → processBlock(module)
      → skip if isModuleInChunk  (already done)
      → skip if activeState===false  (dead)
      → defer if bit in minAvailableModules  → skippedItems
      → else queue ADD_AND_ENTER_MODULE for each dep module
      → for each AsyncDependenciesBlock:
          iteratorBlock()
            → addChunkInGroup() → new Chunk + ChunkGroup
            → queueConnect[parent] += (child, PROCESS_BLOCK)
  
  processConnectQueue():
    resultingAvailable = minAvail | OR(chunk masks)
    → child.availableModulesToBeMerged.push(resultingAvailable)
  
  processChunkGroupsForMerging():
    child.minAvailableModules = AND(availableModulesToBeMerged)
    → if changed: outdatedChunkGroupInfo.add(child)
    → queueDelayed.push(PROCESS_BLOCK for async block)
  
  processOutdatedChunkGroupInfo():
    → re-enqueue skippedItems no longer covered
    → re-enqueue children

  [swap queue ↔ queueDelayed when queue empties]

connectChunkGroups:
  for each (AsyncDependenciesBlock, connections):
    if areModulesAvailable(child, parent.resultingAvailable): skip
    else:
      connectBlockAndChunkGroup(block, chunkGroup)
      parent.addChild(child), child.addParent(parent)
```

The key insight tying it together: **`AsyncDependenciesBlock` is the object that bridges both graphs.** In the module graph it is a block owned by a module, holding its own dependency list. In the chunk graph it is connected to a `ChunkGroup` by `connectBlockAndChunkGroup`. The `minAvailableModules` bitmask is the mechanism that prevents modules from being duplicated: a module bit-tested as already in all parent paths is skipped during `processBlock` and deferred into `skippedItems`, re-examined only if the available-module intersection later shrinks.
