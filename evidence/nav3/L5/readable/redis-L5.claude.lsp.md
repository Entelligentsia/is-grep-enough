# transcript: I'm planning a change to how a write performed on a primary becomes visible on its replicas, so I need to understand the full journey of a write command's ef...


💬 I'll trace this end-to-end using the LSP. Let me load it and start from the key symbols simultaneously.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(call)
  ▸ LSP(propagate)
  ▸ LSP(replicationFeedReplicas)

💬 Good. Let me now look at the key functions in parallel — `call()` and the propagation chain in `server.c`, plus the replication feed side.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ LSP(replicationFeed)

💬 Good. Now I'll read `call()`, `postExecutionUnitOperations()`, and `replicationFeedSlaves()` in parallel.
  ▸ LSP(processCommand)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/replication.c)

💬 Now let me read `call()` itself and `feedReplicationBuffer()`.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ LSP(feedReplicationBuffer)

💬 Let me continue reading `call()` for the propagation decision logic, and read `feedReplicationBuffer()` in parallel.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/replication.c)

💬 Good, I have a solid picture now. Let me get two more pieces: `replBufWriterBegin`/`Append` to complete the buffer mechanics, and `afterCommand`/`exitExecuti...
  ▸ LSP(replBufWriterBegin)
  ▸ LSP(afterCommand)
  ▸ LSP(exitExecutionUnit)
  ▸ Read(/home/bench/repos/redis/src/replication.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Let me get one final piece — `prepareReplicasToWrite` — to understand how replica clients are wired up to actually send the bytes.
  ▸ LSP(prepareReplicasToWrite)
  ▸ Read(/home/bench/repos/redis/src/replication.c)

💬 I have everything I need. Here's the complete flow:  ---  ## Stage 1 — Command execution and write detection (`call()`, server.c:3949)  Before the command ha...

──────── RESULT (success, 127022ms, 22 turns) ────────
I have everything I need. Here's the complete flow:

---

## Stage 1 — Command execution and write detection (`call()`, server.c:3949)

Before the command handler runs, `call()` snapshots the global dirty counter:

```c
dirty = server.dirty;  // line 3978
```

`server.dirty` is a monotonically-increasing integer that every write path increments (via `dbAdd`, `dbOverwrite`, `dbDelete`, etc.). It is the single source of truth for "did the dataset change."

The handler is then invoked synchronously:

```c
c->cmd->proc(c);  // line 4015  e.g. setCommand, lpushCommand, …
```

After it returns (line 4032):

```c
dirty = server.dirty - dirty;
if (dirty < 0) dirty = 0;
```

This difference is the **write-detection signal**. A non-zero `dirty` means the command mutated state. Commands can also bypass this by calling `forceCommandPropagation()` (sets `CLIENT_FORCE_REPL`/`CLIENT_FORCE_AOF` on the client), and can opt out with `preventCommandPropagation()` (sets `CLIENT_PREVENT_PROP`).

---

## Stage 2 — Queueing as a pending operation (`alsoPropagate()`, server.c:3732)

Once the write-detection result is known, `call()` builds a flags word (lines 4127–4153) and calls `alsoPropagate()`:

```c
if (dirty) propagate_flags |= (PROPAGATE_AOF | PROPAGATE_REPL);
if (c->flags & CLIENT_FORCE_REPL) propagate_flags |= PROPAGATE_REPL;
// … strip flags if CLIENT_PREVENT_REPL_PROP etc. …
if (propagate_flags != PROPAGATE_NONE)
    alsoPropagate(c->db->id, c->argv, c->argc, propagate_flags);
```

`alsoPropagate()` does **not** propagate immediately. It copies the argv (incrementing refcounts so the objects survive) and appends a `redisOp` entry to the `server.also_propagate` array. This is intentional: nested calls (MULTI/EXEC, Lua, module `RM_Call`) all accumulate operations in the same queue, so the outermost frame can decide how to flush them as an atomic unit.

---

## Stage 3 — Flushing the queue (`propagatePendingCommands()`, server.c:3811)

At the end of `call()`, `afterCommand(c)` is called (line 4189), which chains:

```
afterCommand(c)
  → postExecutionUnitOperations()   [server.c:3867]
      → propagatePendingCommands()  [server.c:3811]  (only when execution_nesting == 0)
```

The nesting guard (`server.execution_nesting`, managed by `enterExecutionUnit`/`exitExecutionUnit`) ensures propagation only fires at the **outermost** level — recursive calls (e.g. a module calling `RM_Call` inside a timer callback) do not flush prematurely.

`propagatePendingCommands()` (server.c:3811):

1. If more than one op accumulated, wraps them in `MULTI`/`EXEC` (so the replica applies them atomically).
2. Iterates `server.also_propagate.ops[]` and calls `propagateNow()` for each.
3. Frees the array.

`propagateNow()` (server.c:3704) is the split point between the two sinks:

```c
if (server.aof_state != AOF_OFF && target & PROPAGATE_AOF)
    feedAppendOnlyFile(dbid, argv, argc);
if (target & PROPAGATE_REPL)
    replicationFeedSlaves(server.slaves, dbid, argv, argc);
```

---

## Stage 4 — Encoding into the shared replication buffer (`replicationFeedSlaves()`, replication.c:631)

`replicationFeedSlaves()` first applies two guards:

- Returns immediately if `server.masterhost != NULL` (this node is itself a replica; it proxies via `replicationFeedStreamFromMasterStream()` instead, preserving the identical byte stream).
- Returns if the incoming client is a `CLIENT_MASTER` (data arrived from upstream, not from a local write).

Then it does two things:

**SELECT injection** (lines 672–699): if the DB being written differs from `server.slaveseldb`, it serialises a `SELECT <dbid>` command and sends it first via `feedReplicationBuffer()`. This keeps replicas in sync with the primary's current database without requiring every command to carry a DB identifier.

**RESP encoding** (lines 702–724): it opens a `replBufWriter`, then writes a RESP inline array directly into the global buffer:

```c
replBufWriterBegin(&wr);
replBufWriterAppendBulkLen(&wr, '*', argc);   // *N\r\n
for (j = 0; j < argc; j++) {
    replBufWriterAppendBulkLen(&wr, '$', objlen);  // $len\r\n
    replBufWriterAppend(&wr, argv[j]->ptr, objlen);
    replBufWriterAppend(&wr, "\r\n", 2);
}
replBufWriterEnd(&wr);
```

---

## Stage 5 — The shared buffer and per-replica delivery

The global replication buffer (`server.repl_buffer_blocks`) is a linked list of `replBufBlock` nodes allocated with `zmalloc`. Every replica shares the same underlying memory — there is no per-replica copy.

`replBufWriterBegin()` (replication.c:466) records the **current tail position** at the start of the write. `replBufWriterEnd()` (replication.c:565) commits it:

1. Advances `server.master_repl_offset += wr->total_len` — this is the replication offset that replicas track for partial resync.
2. Advances `server.repl_backlog->histlen`.
3. For each replica client, if `slave->ref_repl_buf_node == NULL` (it hasn't been pointed at any data yet this round), sets it to `wr->start_node` and increments that block's refcount. This is how a replica gets associated with the start of fresh data.
4. Triggers `closeClientOnOutputBufferLimitReached()` if new blocks pushed the replica over its output buffer limit.

Before all of this, `prepareReplicasToWrite()` (replication.c:363) is called at the top of `replicationFeedSlaves`. It calls `prepareClientToWrite(slave)` for each eligible replica, which installs a **writable event** on the replica's socket fd in the event loop. On the next event loop iteration the write handler fires, reads from `slave->ref_repl_buf_node` starting at `slave->ref_block_pos`, and drains bytes to the socket until blocked. When a block is fully consumed by all replicas (refcount drops to zero) it is freed; `incrementalTrimReplicationBacklog()` handles trimming from the head.

---

## How the stages connect — summary

```
c->cmd->proc(c)               ← command handler runs, server.dirty increments
  └─ server.dirty delta > 0
        └─ alsoPropagate()    ← copies argv, appends to server.also_propagate[]
              (deferred)

call() returns
  └─ afterCommand()
        └─ postExecutionUnitOperations()  [only at nesting depth 0]
              └─ propagatePendingCommands()
                    └─ propagateNow()     [per queued op; wraps >1 ops in MULTI/EXEC]
                          ├─ feedAppendOnlyFile()         → AOF
                          └─ replicationFeedSlaves()      → replication
                                └─ replBufWriter*()
                                      ├─ RESP-encodes command into repl_buffer_blocks
                                      ├─ advances master_repl_offset
                                      └─ sets slave->ref_repl_buf_node per replica

next event loop iteration
  └─ write handler per replica socket
        └─ reads from ref_repl_buf_node, sends to network
```

The key design point: `alsoPropagate()` intentionally defers so that nested execution units accumulate under a single MULTI/EXEC wrapper, and the actual byte-writing into the shared buffer happens only once per outermost command completion. The shared buffer with per-replica reference nodes means the RESP-encoded bytes are produced once regardless of how many replicas are connected.
