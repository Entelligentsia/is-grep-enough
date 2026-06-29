# transcript: I'm planning a change to how a write performed on a primary becomes visible on its replicas, so I need to understand the full journey of a write command's ef...

  ▸ ToolSearch(select:LSP)

💬 I'll trace the full replication journey by hitting the key function symbols in order. Let me look up the core players in parallel.
  ▸ LSP(propagate)
  ▸ LSP(replicationFeedSlaves)
  ▸ LSP(call)

💬 Good. Now let me read `call` in server.c and look up the propagation functions simultaneously.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ LSP(propagate)
  ▸ LSP(alsoPropagate)

💬 Now let me read the rest of `call()` to see the dirty-detection and propagation trigger, plus the key propagation functions.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Now let me read the rest of `propagatePendingCommands` and `replicationFeedSlaves`.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/replication.c)

💬 Now let me look at `exitExecutionUnit` (the flush trigger), `feedReplicationBuffer`, and `processCommand`'s call to `call()`.
  ▸ LSP(exitExecutionUnit)
  ▸ LSP(feedReplicationBuffer)
  ▸ LSP(prepareReplicasToWrite)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/replication.c)
  ▸ Read(/home/bench/repos/redis/src/replication.c)

💬 Let me look at the `replBufWriter` internals and how replicas read from the shared buffer to their socket.
  ▸ LSP(replBufWriterBegin)
  ▸ LSP(writeToReplicas)
  ▸ Read(/home/bench/repos/redis/src/replication.c)

💬 Now let me look at how replica clients drain the shared buffer to their socket.
  ▸ LSP(writeReplicaOutputBuffer)
  ▸ LSP(canFeedReplicaReplBuffer)
  ▸ Read(/home/bench/repos/redis/src/replication.c)
  ▸ LSP(sendReplyToClient)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ LSP(writeToClient)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)

💬 Let me check where `postExecutionUnitOperations` is called from to confirm the flush trigger.
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/redis/src/server.c","line":3867,"character":6})
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/redis/src/server.c","line":4271,"character":6})
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 I now have the full picture. Here is the complete journey:  ---  ## Stage 1 — Command execution and dirty detection  **`call()` — `server.c:3949`**  Just bef...

──────── RESULT (success, 171928ms, 33 turns) ────────
I now have the full picture. Here is the complete journey:

---

## Stage 1 — Command execution and dirty detection

**`call()` — `server.c:3949`**

Just before invoking `c->cmd->proc(c)` at line 4015, `call()` snapshots the current value of `server.dirty` (line 3978). Every write operation inside a command handler increments that counter (via `dbAdd`, `dbOverwrite`, `dbDelete`, etc.). When the handler returns, `call()` computes the delta at line 4032:

```c
dirty = server.dirty - dirty;
if (dirty < 0) dirty = 0;
```

A non-zero delta is the signal that the command actually mutated data.

---

## Stage 2 — Queuing the modification for propagation

**Still inside `call()` — lines 4118–4153**

Immediately after the handler returns, `call()` determines `propagate_flags`:

- If `dirty > 0`, sets `PROPAGATE_AOF | PROPAGATE_REPL` (line 4131).
- `CLIENT_FORCE_REPL` / `CLIENT_FORCE_AOF` on the client can add replication even when dirty is 0 (e.g., `EXPIREAT` after a timeout resolution).
- `CLIENT_PREVENT_REPL_PROP` / `CLIENT_PREVENT_AOF_PROP` can suppress specific channels.

If anything needs to be propagated, it calls:

```c
alsoPropagate(c->db->id, c->argv, c->argc, propagate_flags);  // line 4153
```

**`alsoPropagate()` — `server.c:3732`**

Makes a copy of the `argv` array, increments the ref count on each `robj`, and appends an entry (`redisOp`) to `server.also_propagate` (a `redisOpArray`). This is purely accumulation — nothing is sent yet.

---

## Stage 3 — Flushing once the outermost command finishes

**`afterCommand()` — `server.c:4271`, called at line 4189**

After `call()` returns up to `processCommand()`, the call chain is:

```
processCommand → call → (handler) → afterCommand → postExecutionUnitOperations → propagatePendingCommands
```

**`postExecutionUnitOperations()` — `server.c:3867`**

Guards on `server.execution_nesting == 0`. Nested invocations (scripts, MULTI/EXEC frames, module `RM_Call`) just accumulate more ops into `server.also_propagate` and return — only the outermost exit fires propagation. Then it calls `propagatePendingCommands()`.

**`propagatePendingCommands()` — `server.c:3811`**

Drains `server.also_propagate`:

1. If more than one op was queued (and the command doesn't touch arbitrary keys), wraps the whole batch in a `MULTI`…`EXEC` on the wire, so replicas see an atomic unit.
2. Iterates `server.also_propagate.ops`, calling `propagateNow()` for each.
3. Frees the `redisOpArray`.

---

## Stage 4 — Serializing the write into the replication stream

**`propagateNow()` — `server.c:3704`**

Gates on `shouldPropagate()` (checks that AOF is not OFF / that we are a master with replicas or a backlog), then calls:

```c
feedAppendOnlyFile(dbid, argv, argc);          // AOF path
replicationFeedSlaves(server.slaves, dbid, argv, argc);  // replication path
```

**`replicationFeedSlaves()` — `replication.c:631`**

Early exits if this node is itself a replica (`server.masterhost != NULL`) or if the current client is a master proxy — in those cases the incoming stream from the upstream master is forwarded verbatim instead.

If we are the top-level master:

1. **Prepare replica write handlers** (line 669): `prepareReplicasToWrite()` calls `prepareClientToWrite()` on every eligible replica client, which installs a writable event so the event loop will flush their outgoing data.

2. **Database context** (lines 672–698): if `server.slaveseldb != dictid`, serializes a `SELECT <dictid>` command directly via `feedReplicationBuffer()` first.

3. **Serialize the write command in RESP** (lines 702–724) using the `replBufWriter` batching API:
   - `replBufWriterBegin()` — snapshots the tail position of the global `server.repl_buffer_blocks` list.
   - `replBufWriterAppendBulkLen(&wr, '*', argc)` — writes the multi-bulk header.
   - For each argument: `$<len>\r\n` header then the raw bytes via `replBufWriterAppend()`.
   - `replBufWriterEnd()` — finalizes everything.

**`replBufWriterEnd()` — `replication.c:565`**

This is where the commit happens:

- Advances `server.master_repl_offset` by the total bytes written.
- Advances `server.repl_backlog->histlen`.
- Iterates `server.slaves`: for each eligible replica whose `ref_repl_buf_node` is still `NULL` (nothing pending), pins it to `wr.start_node` / `wr.start_pos` and increments that block's `refcount`.
- If new blocks were allocated, calls `incrementalTrimReplicationBacklog()` to drop old blocks no replica or the backlog still references.

**The shared buffer model**

`server.repl_buffer_blocks` is a global linked list of `replBufBlock` chunks. Data is written once. Each connected replica holds a cursor `(ref_repl_buf_node, ref_block_pos)` pointing to where it has read up to. Blocks are ref-counted: the backlog holds one ref, each replica that has not yet consumed past a block holds one ref; a block is freed only when both let go.

---

## Stage 5 — Draining the buffer to each replica's socket

The writable event fires in the event loop:

```
sendReplyToClient()  (networking.c:2888)
  → writeToClient()  (networking.c:2786)
    → _writeToClientSlave()  (networking.c:2734)
```

**`_writeToClientSlave()`** (the main-thread path at line 2757):

```c
replBufBlock *o = listNodeValue(c->ref_repl_buf_node);
// send from c->ref_block_pos up to o->used
*nwritten = connWrite(c->conn, o->buf + c->ref_block_pos, o->used - c->ref_block_pos);
c->ref_block_pos += *nwritten;

// when block exhausted, advance cursor and release the old block
if (next && c->ref_block_pos == o->used) {
    o->refcount--;
    ((replBufBlock *)listNodeValue(next))->refcount++;
    c->ref_repl_buf_node = next;
    c->ref_block_pos = 0;
    incrementalTrimReplicationBacklog(...);
}
```

`writeToClient()` for replicas (line 2794) keeps looping on `_writeToClientSlave` until all pending data is drained, unlike normal clients which are capped at `NET_MAX_WRITES_PER_EVENT`, because stalling a replica indefinitely would grow the buffer without bound.

---

## How the stages connect — the key invariants

| Handoff point | What crosses |
|---|---|
| `call()` → `alsoPropagate()` | A ref-counted copy of `argv` + flags, queued in `server.also_propagate` |
| `propagatePendingCommands()` → `propagateNow()` | One `redisOp` at a time, possibly wrapped in MULTI/EXEC |
| `replicationFeedSlaves()` → `replBufWriterEnd()` | RESP-encoded bytes land in `server.repl_buffer_blocks`; each replica's cursor is advanced to the start of the new data |
| `replBufWriterEnd()` → event loop | Writable handlers installed by `prepareReplicasToWrite()`; replicas drain their cursor position to the socket |

The deferred-queue design (accumulate in `also_propagate`, flush at execution-unit exit) is what lets MULTI/EXEC, scripts, and module calls accumulate multiple writes and emit them as a single MULTI/EXEC block on the replication stream, preserving atomicity as seen by replicas.
