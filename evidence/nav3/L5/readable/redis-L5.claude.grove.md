# transcript: I'm planning a change to how a write performed on a primary becomes visible on its replicas, so I need to understand the full journey of a write command's ef...


💬 I'll trace this end-to-end using grove for the structural lookups. Let me load the tools and start with the key functions.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__outline,mcp__grove__definition)

💬 Let me pull the key functions in parallel — `call` (command dispatch), `propagate`/`propagateNow`, and the replication feed path.
  ▸ mcp__grove__source({"file":"src/server.c","name":"call"})
  ▸ mcp__grove__symbols({"dir":"src","name":"propagate","kind":"function"})
  ▸ mcp__grove__symbols({"dir":"src","name":"replicationFeedSlaves","kind":"function"})

💬 Good — `call` is clear. Now let me get `alsoPropagate`, `propagatePendingCommands`, `afterCommand`, and `replicationFeedSlaves` all at once.
  ▸ mcp__grove__source({"file":"src/server.c","name":"alsoPropagate"})
  ▸ mcp__grove__source({"file":"src/server.c","name":"propagatePendingCommands"})
  ▸ mcp__grove__source({"file":"src/server.c","name":"afterCommand"})
  ▸ mcp__grove__source({"file":"src/replication.c","name":"replicationFeedSlaves"})

💬 Now I need `postExecutionUnitOperations` (the bridge from `afterCommand` into propagation), `propagateNow`, `feedReplicationBuffer`, and `prepareReplicasToWr...
  ▸ mcp__grove__source({"file":"src/server.c","name":"postExecutionUnitOperations"})
  ▸ mcp__grove__source({"file":"src/server.c","name":"propagateNow"})
  ▸ mcp__grove__source({"file":"src/replication.c","name":"feedReplicationBuffer"})
  ▸ mcp__grove__source({"file":"src/replication.c","name":"prepareReplicasToWrite"})

💬 Good. Now I need the `replBufWriter` machinery — how bytes go into the backlog and onto replica output buffers — and `shouldPropagate`.
  ▸ mcp__grove__source({"file":"src/replication.c","name":"replBufWriterBegin"})
  ▸ mcp__grove__source({"file":"src/replication.c","name":"replBufWriterAppend"})
  ▸ mcp__grove__source({"file":"src/replication.c","name":"replBufWriterEnd"})
  ▸ mcp__grove__source({"file":"src/server.c","name":"shouldPropagate"})

💬 One more lookup — how the event loop drains the shared buffer to replica sockets.
  ▸ mcp__grove__symbols({"dir":"src","name":"writeToReplica","kind":"function"})
  ▸ mcp__grove__source({"file":"src/replication.c","name":"canFeedReplicaReplBuffer"})
  ▸ mcp__grove__symbols({"dir":"src","name":"sendReplyToReplica","kind":"function"})
  ▸ Bash(grep -n "ref_repl_buf_node\|ref_block_pos" /home/bench/repos/redis/src/networking.c | head -40)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)

💬 Now I have the complete picture. Here is the full walkthrough.  ---  ## The complete write-to-replica flow  ### Stage 1 — Command runs; dirty counter detects...

──────── RESULT (success, 187602ms, 24 turns) ────────
Now I have the complete picture. Here is the full walkthrough.

---

## The complete write-to-replica flow

### Stage 1 — Command runs; dirty counter detects the modification

`call()` (`src/server.c:3949`) is the nerve center. Right before dispatching:

```c
dirty = server.dirty;
```

Then `c->cmd->proc(c)` fires — the actual command handler (e.g. `setCommand`). Inside, mutations go through `dbAdd`/`dbOverwrite`/`dbDelete`, which bump `server.dirty`. Some commands also set `CLIENT_FORCE_REPL` on the client to force propagation even without a dirty-count change (e.g. certain expire commands).

After the handler returns:

```c
dirty = server.dirty - dirty;   // how many keys changed
```

The propagation decision is then built:

```c
if (dirty) propagate_flags |= (PROPAGATE_AOF|PROPAGATE_REPL);
if (c->flags & CLIENT_FORCE_REPL) propagate_flags |= PROPAGATE_REPL;
// ...subtract flags for CLIENT_PREVENT_REPL_PROP etc.
```

If anything survives, `call()` calls:

```c
alsoPropagate(c->db->id, c->argv, c->argc, propagate_flags);
```

---

### Stage 2 — Queuing: the command lands in `server.also_propagate`

`alsoPropagate()` (`src/server.c:3732`) does two things:

1. Calls `shouldPropagate()` (`src/server.c:3673`) — a guard that returns 0 if replication is disabled, the server is loading, there are no slaves and no backlog, or this is itself a replica (`server.masterhost != NULL`).
2. Makes a refcounted copy of `argv` and appends it to `server.also_propagate`, a `redisOpArray` — a simple growable array of `{dbid, argv, argc, target}` tuples.

Nothing is written to any socket or buffer yet. The queue absorbs every operation that `call()` or recursive sub-calls produce within a single execution unit.

---

### Stage 3 — Flush: pending commands drain at end-of-execution-unit

Still inside `call()`, at the very bottom, after stats and monitoring:

```c
afterCommand(c);
```

`afterCommand()` (`src/server.c:4271`) calls `postExecutionUnitOperations()`, which guards on nesting depth:

```c
if (server.execution_nesting) return;   // skip if inside MULTI, RM_Call, etc.
propagatePendingCommands();
```

`propagatePendingCommands()` (`src/server.c:3811`) drains the queue:

- If there is more than one op (e.g. a command that emitted multiple side effects), the whole batch is wrapped in `MULTI`/`EXEC` so replicas apply it atomically.
- Each op is dispatched via `propagateNow(rop->dbid, rop->argv, rop->argc, rop->target)`.
- The queue is then freed.

---

### Stage 4 — Dispatch: AOF fork and replica fork

`propagateNow()` (`src/server.c:3704`) is the split point:

```c
if (server.aof_state != AOF_OFF && target & PROPAGATE_AOF)
    feedAppendOnlyFile(dbid, argv, argc);
if (target & PROPAGATE_REPL)
    replicationFeedSlaves(server.slaves, dbid, argv, argc);
```

It also calls `shouldPropagate()` one more time as a last-chance guard. After this the AOF and replication paths are independent.

---

### Stage 5 — RESP encoding into the shared replication buffer

`replicationFeedSlaves()` (`src/replication.c:631`) does several things in sequence:

**Guard checks:** returns immediately if `server.masterhost != NULL` (this instance is itself a replica — it proxies the master stream verbatim instead of re-encoding), or if the current client has `CLIENT_MASTER` (passthrough mode). If there are no slaves and no backlog, it just increments `server.master_repl_offset` by 1 for AOF-fsync-coordination purposes and returns.

**Install write handlers:** `prepareReplicasToWrite()` (`src/replication.c:363`) walks `server.slaves` and calls `prepareClientToWrite(slave)` on each one that passes `canFeedReplicaReplBuffer()`. That installs the writable file-event on the slave's connection so the event loop knows to call the write handler next iteration.

**SELECT if needed:** if the DB index changed since last feed, it emits a `SELECT N` command first, also through the buffer path.

**Encode the command as RESP:** using a `replBufWriter`:

```c
replBufWriterBegin(&wr);            // snapshot tail position
replBufWriterAppendBulkLen(&wr, '*', argc);   // *N\r\n
for each arg:
    replBufWriterAppendBulkLen(&wr, '$', len); // $len\r\n
    replBufWriterAppend(&wr, value, len);      // value
    replBufWriterAppend(&wr, "\r\n", 2);
replBufWriterEnd(&wr);              // commit
```

`server.repl_buffer_blocks` is a linked list of `replBufBlock` slabs. `replBufWriterAppend` fills the tail slab; when it's full, `replBufWriterAppendSlow` allocates a new one.

---

### Stage 6 — Replica pointers and backlog accounting

`replBufWriterEnd()` (`src/replication.c:565`) commits the write and updates all consumers:

```c
server.master_repl_offset += wr->total_len;
server.repl_backlog->histlen += wr->total_len;
```

For each eligible slave, if the slave doesn't yet have a position reference into this write:

```c
slave->ref_repl_buf_node = wr->start_node;
slave->ref_block_pos     = wr->start_pos;
((replBufBlock *)listNodeValue(wr->start_node))->refcount++;
```

No data is copied per-replica. Every connected replica holds just a `(listNode*, size_t)` cursor into the single shared slab list. The backlog (`server.repl_backlog`) gets the same treatment — it also holds a cursor. If new blocks were allocated, old ones at the head of the list that no cursor references any more are trimmed by `incrementalTrimReplicationBacklog`.

---

### Stage 7 — Event loop drains bytes to the socket

On the next iteration of the event loop the writable event fires for each slave. `writeToClient()` routes to `_writeToClientSlave()` (`src/networking.c:2734`):

```c
replBufBlock *o = listNodeValue(c->ref_repl_buf_node);
*nwritten = connWrite(c->conn,
                      o->buf + c->ref_block_pos,
                      o->used - c->ref_block_pos);
c->ref_block_pos += *nwritten;

// advance to next block when current one is exhausted
if (next && c->ref_block_pos == o->used) {
    o->refcount--;
    ((replBufBlock *)listNodeValue(next))->refcount++;
    c->ref_repl_buf_node = next;
    c->ref_block_pos = 0;
    incrementalTrimReplicationBacklog(...);
}
```

The IO-thread variant (`c->running_tid != IOTHREAD_MAIN_THREAD_ID`) uses a separate `io_curr_repl_node`/`io_bound_repl_node` pair so the thread only sees bytes that were committed before it was dispatched, avoiding a race with concurrent main-thread appends.

---

## How the stages connect — a summary

```
c->cmd->proc(c)                     ← command handler runs, bumps server.dirty
  └─ call() computes dirty delta
       └─ alsoPropagate()           ← copies argv into server.also_propagate queue
            (no I/O yet)

afterCommand()
  └─ postExecutionUnitOperations()  ← only at nesting==0 (outermost call)
       └─ propagatePendingCommands()← drains the queue, wraps multi-op in MULTI/EXEC
            └─ propagateNow()       ← forks to AOF and/or replication

replicationFeedSlaves()             ← encodes RESP into shared slab list
  ├─ prepareReplicasToWrite()       ← installs writable event on each slave fd
  └─ replBufWriterEnd()             ← advances master_repl_offset,
                                       anchors each slave->ref_repl_buf_node

[next event loop tick]
  └─ _writeToClientSlave()          ← connWrite() from slave's cursor position,
                                       advances cursor block by block
```

The key design choice is that `server.repl_buffer_blocks` is a single shared slab; replicas don't each get their own copy. They hold only a refcounted cursor. The backlog for reconnecting replicas is the same structure. `master_repl_offset` is the monotonically-increasing byte count that ties the backlog window to the PSYNC partial-resync protocol.
