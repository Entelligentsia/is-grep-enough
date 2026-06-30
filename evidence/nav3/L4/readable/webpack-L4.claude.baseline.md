# transcript: I'm studying how webpack turns the finished module graph into the set of output chunks during sealing — including how synchronous module dependencies are kep...


💬 I'll spawn a thorough exploration agent to map out the chunk graph construction pipeline across the relevant files.

  ▸ Agent(Deep exploration of webpack chunk graph construction from module graph)  ⟶ subagent:
      ↳ Read(/home/bench/repos/webpack)
      ↳ Bash(find /home/bench/repos/webpack/lib -name "*.js" -type f | grep -E "(Compilation|ChunkGraph|ModuleGraph|AsyncDependenciesBlock|DependenciesBlock)" | head -20)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
      ↳ Read(/home/bench/repos/webpack/lib/ChunkGraph.js)
      ↳ Read(/home/bench/repos/webpack/lib/ModuleGraph.js)
      ↳ Read(/home/bench/repos/webpack/lib/AsyncDependenciesBlock.js)
      ↳ Read(/home/bench/repos/webpack/lib/DependenciesBlock.js)
      ↳ Bash(grep -n "seal()" /home/bench/repos/webpack/lib/Compilation.js | head -5)
      ↳ Bash(grep -n "ImportDependency" /home/bench/repos/webpack/lib/dependencies -r | head -20)
      ↳ Bash(grep -n "^\s*seal(" /home/bench/repos/webpack/lib/Compilation.js)
      ↳ Read(/home/bench/repos/webpack/lib/Compilation.js)
      ↳ ⟹ returned to parent


💬 Let me spot-check a few key line numbers before presenting this.
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)
  ▸ Read(/home/bench/repos/webpack/lib/buildChunkGraph.js)

💬 All key line numbers verified. Here's the complete picture:  ---  ## How webpack builds the chunk graph from the module graph  The work happens in `lib/Compi...

──────── RESULT (success, 191587ms, 12 turns) ────────
All key line numbers verified. Here's the complete picture:

---

## How webpack builds the chunk graph from the module graph

The work happens in `lib/Compilation.js`'s `seal()` method (~line 3473), which calls into `lib/buildChunkGraph.js`. Everything below is verified against the actual source.

---

### Phase 0 — `seal()` seeds the initial state (`Compilation.js:3509–3656`)

Before calling `buildChunkGraph`, `seal()` iterates `this.entries` and for each named entry:

1. Creates a `Chunk` via `this.addChunk(name)`.
2. Creates an `Entrypoint` (a `ChunkGroup` subclass) and links it to the chunk.
3. Calls `chunkGraph.connectChunkAndEntryModule(chunk, module, entrypoint)` for every entry module — this writes into both the `ChunkGraphModule.chunks` set and the chunk's `entryModules` map.
4. Assigns traversal depths via `assignDepths(entryModules)`.

The result is a `chunkGraphInit` map (`Entrypoint → Module[]`) that becomes the seed for `buildChunkGraph`.

---

### Phase 1 — `visitModules()` (`buildChunkGraph.js:294–1331`)

This is the main BFS-like traversal. It runs inside a loop (`line 1233`) and is the only place modules are assigned to chunks.

#### Data structures

| Name | Type | Purpose |
|------|------|---------|
| `ordinalByModule` | `Map<Module, number>` | Assigns each module a unique integer ordinal (lazily, line 322) |
| `maskByChunk` | `Map<Chunk, bigint>` | A BigInt bitmask: bit *N* is set when module with ordinal *N* is in this chunk |
| `chunkGroupInfoMap` | `Map<ChunkGroup, ChunkGroupInfo>` | One `ChunkGroupInfo` per chunk group (see below) |
| `blockConnections` | `Map<AsyncDependenciesBlock, BlockChunkGroupConnection[]>` | Recorded async edges, wired up in Phase 2 |
| `allCreatedChunkGroups` | `Set<ChunkGroup>` | Every dynamically-created chunk group; cleaned up in Phase 3 |
| `queue` / `queueDelayed` | `QueueItem[]` | Sync-first BFS queue; `queueDelayed` holds async blocks until the sync queue drains (line 1266) |

#### `ChunkGroupInfo` (`buildChunkGraph.js:39–57`)

Every chunk group has one of these during construction:

```
minAvailableModules       bigint — intersection of all modules available from
                                   every parent chunk group (bit N = module N is
                                   definitely available everywhere above us)
availableModulesToBeMerged bigint[] — pending incoming availability updates
resultingAvailableModules  bigint — minAvailableModules | this group's own modules
skippedItems               Set<Module> — modules omitted because they are in
                                         minAvailableModules; revisited if that
                                         set shrinks
children / availableSources / availableChildren
                           Sets<ChunkGroupInfo> — the parent-child graph of
                                                  ChunkGroupInfos for propagation
```

Entry chunk groups start with `minAvailableModules = ZERO_BIGINT` (line 495 / 600) — they assume nothing is pre-loaded. Async chunk groups created by `import()` start with `minAvailableModules = undefined` (line 705) — it will be computed by merging from their parents.

#### The inner loop (line 1233)

```
while (queue.length || queueConnect.size):
  processQueue()                     // connect modules, walk dependencies
  processChunkGroupsForCombining()   // entrypoints with multiple parents: OR sources
  processConnectQueue()              // compute resultingAvailable for parents, push to children
  processChunkGroupsForMerging()     // AND incoming masks; if changed, re-queue children
  processOutdatedChunkGroupInfo()    // shrunk mask → re-admit skipped modules

  if queue empty: swap in queueDelayed   // async blocks run after all sync are done
```

#### `processBlock()` — the core assignment decision (line 791)

For each module-like dependency in the current block (read from the precomputed `blockModulesMap` triplet array `[module, activeState, connections, ...]`):

1. **Already in chunk?** `chunkGraph.isModuleInChunk(refModule, chunk)` → skip (line 805).
2. **Conditionally active?** (`activeState !== true`) → add to `skippedModuleConnections`; if `false` skip entirely (line 815–821).
3. **Already in a parent chunk?** Check `isOrdinalSetInMask(minAvailableModules, getModuleOrdinal(refModule))` (line 824) → add to `skippedItems`, skip now but save for re-examination.
4. **Otherwise** → push `ADD_AND_ENTER_MODULE` onto the queue (line 832).

When `ADD_AND_ENTER_MODULE` is dequeued in `processQueue()` (line 948), it calls `chunkGraph.connectChunkAndModule(chunk, refModule)`, which does the actual bidirectional write:
```js
cgm.chunks.add(chunk)    // ChunkGraphModule side
cgc.modules.add(module)  // ChunkGraphChunk side
```
…and also updates `maskByChunk` so the ordinal bit is set for this chunk.

After handling the module list, `processBlock()` iterates `block.blocks` (the nested `AsyncDependenciesBlock` list) and calls `iteratorBlock(b)` for each (line 872).

#### `iteratorBlock()` — async split points (line 564)

When the parser encounters `import('./foo')` it produces an `AsyncDependenciesBlock` (in `lib/AsyncDependenciesBlock.js`) that wraps the `ImportDependency`. `iteratorBlock` handles these:

**Case A — `entryOptions` present (worker-like entry, line 578):** Creates a new `Entrypoint` via `compilation.addAsyncEntrypoint()`. Sets `minAvailableModules = ZERO_BIGINT` — this async entry is self-contained, nothing is assumed pre-loaded. Queues `PROCESS_ENTRY_BLOCK` immediately.

**Case B — chunk loading disabled (line 678):** Falls through into the current chunk group — no split occurs.

**Case C — normal `import()` (line 689):** Creates a new `ChunkGroup` via `compilation.addChunkInGroup()`. Sets `minAvailableModules = undefined`. Adds to `allCreatedChunkGroups`. Records a `BlockChunkGroupConnection` in `blockConnections`. Does **not** queue for processing yet — deferred until the parent's `resultingAvailableModules` is computed.

In all cases the block→chunkGroupInfo mapping is cached in `blockChunkGroups` so repeated references to the same async block reuse the same chunk group (line 568/744).

#### How availability propagates

After `processQueue()`, `processConnectQueue()` (line 1033) runs for all newly connected async children. For each parent→child edge:

1. Calls `calculateResultingAvailableModules(parent)` = `parent.minAvailableModules | maskByChunk[parentChunk]` (line 1046).
2. Pushes that bigint onto `child.availableModulesToBeMerged`.

Then `processChunkGroupsForMerging()` (line 1068) **ANDs** all pending bitmasks together (`&=`, line 1083). The AND is the key: a module bit is set in `minAvailableModules` only if it appears in **every** parent's resulting set — i.e., it is guaranteed to be loaded regardless of which parent loads this async chunk. If the merged result changed, the child is added to `outdatedChunkGroupInfo`.

`processOutdatedChunkGroupInfo()` (line 1149) then revisits that child: for every module in `skippedItems`, if its ordinal bit is **not** set in the new (smaller) `minAvailableModules`, it re-queues `ADD_AND_ENTER_MODULE` so the module actually lands in the async chunk.

Entrypoints with multiple parent sources use `processChunkGroupsForCombining()` (line 1120), which **ORs** the parents' `resultingAvailableModules` instead of ANDing — because the entrypoint must be prepared to run from any of them.

---

### Phase 2 — `connectChunkGroups()` (`buildChunkGraph.js:1340–1397`)

After all modules are placed, the recorded `blockConnections` edges are wired into the actual chunk graph:

For each `(AsyncDependenciesBlock, [BlockChunkGroupConnection, ...])` edge:

- Check `areModulesAvailable(childChunkGroup, parent.resultingAvailableModules)` (line 1354). This does a bitwise `(chunkMask & available) === chunkMask` for each chunk in the child group. If **all** modules of the child are already available in the parent, and the block has no nested sub-blocks (line 1373), the edge is **elided** — no runtime loader needed.
- Otherwise: `chunkGraph.connectBlockAndChunkGroup(block, chunkGroup)` (line 1389) writes the `AsyncDependenciesBlock → ChunkGroup` mapping into `_blockChunkGroups` (used later during code generation to emit the correct `import()` runtime stub).
- `originChunkGroupInfo.chunkGroup.addChild(chunkGroup)` / `chunkGroup.addParent(...)` (lines 1392–1393) establish the parent-child relationship visible in the final chunk graph.

---

### Phase 3 — `cleanupUnconnectedGroups()` (`buildChunkGraph.js:1404–1417`)

Any `ChunkGroup` in `allCreatedChunkGroups` that has no parents (e.g., was created for an `import()` whose block was later found to be dead code or made unnecessary) is removed: chunks are deleted from `compilation.chunks` and disconnected from the `ChunkGraph`.

---

### The data model (`ChunkGraph.js:281–2085`)

```
ChunkGraph
  _modules: WeakMap<Module, ChunkGraphModule>
    .chunks: SortableSet<Chunk>           ← which chunks contain this module
    .entryInChunks: Map                   ← entry module mapping
    .id / .hashes / .runtimeRequirements  ← codegen metadata

  _chunks: WeakMap<Chunk, ChunkGraphChunk>
    .modules: SortableSet<Module>         ← which modules are in this chunk
    .entryModules: Map<Module, Entrypoint>
    .runtimeModules: SortableSet

  _blockChunkGroups: WeakMap<AsyncDependenciesBlock, ChunkGroup>
                                          ← written by connectBlockAndChunkGroup,
                                            read by codegen to emit import() stubs
```

`ModuleGraph` is read-only by this point (frozen at seal line ~3507). `buildChunkGraph` reads it only through `moduleGraph.getModule(dep)` and `moduleGraph.getOutgoingConnections(module)` (via `extractBlockModules`); it never writes to it.

---

### Key file/line reference

| What | File | Lines |
|------|------|-------|
| `seal()`, entry seeding | `lib/Compilation.js` | 3473, 3509–3577, 3656 |
| `buildChunkGraph()` — three-phase orchestrator | `lib/buildChunkGraph.js` | 1425–1482 |
| `visitModules()` — BFS traversal | `lib/buildChunkGraph.js` | 294–1331 |
| Ordinal assignment | `lib/buildChunkGraph.js` | 322–329 |
| `processBlock()` — sync assignment, mask check | `lib/buildChunkGraph.js` | 791–879 |
| `iteratorBlock()` — `import()` → new chunk group | `lib/buildChunkGraph.js` | 564–784 |
| Main iteration loop | `lib/buildChunkGraph.js` | 1233–1271 |
| `processConnectQueue()` — propagate availability | `lib/buildChunkGraph.js` | 1033–1066 |
| `processChunkGroupsForMerging()` — AND masks | `lib/buildChunkGraph.js` | 1068–1118 |
| `processOutdatedChunkGroupInfo()` — re-admit skipped | `lib/buildChunkGraph.js` | 1149–1229 |
| `connectChunkGroups()` — wire block→chunkGroup | `lib/buildChunkGraph.js` | 1340–1397 |
| `cleanupUnconnectedGroups()` | `lib/buildChunkGraph.js` | 1404–1417 |
| `ChunkGraph` data model | `lib/ChunkGraph.js` | 226–302, 392–397, 1503–1506 |
| `AsyncDependenciesBlock` | `lib/AsyncDependenciesBlock.js` | 21–132 |
| `ChunkGroupInfo` typedef | `lib/buildChunkGraph.js` | 39–57 |

---

The central insight tying it all together: **the bigint bitmask is the availability contract**. Each bit represents one module. `minAvailableModules` for a chunk group is the intersection (AND) of what every path from every parent guarantees is already loaded. `processBlock` skips any module whose bit is set — so async chunks only include the delta beyond what parents provide. When a new parent is connected and the intersection shrinks, `processOutdatedChunkGroupInfo` re-admits previously skipped modules so nothing is missing.
