# transcript: I'm planning a change to how a write performed on a primary becomes visible on its replicas, so I need to understand the full journey of a write command's ef...


💬 I'll spawn an agent to trace this end-to-end through the codebase.

  ▸ Agent(Trace write replication flow in Redis)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/redis -type f -name "*.c" | grep -E "(server|replication|networking)" | head -20)
      ↳ Bash(grep -n "^void call(" /home/bench/repos/redis/src/server.c | head -5)
      ↳ Bash(grep -n "propagate\|replicationFeedSlaves\|propagatePendingCommands\|also_propagate" /home/bench/repos/redis/src/server.c | head -30)
      ↳ Bash(grep -n "CMD_WRITE\|dirty\|PROPAGATE_" /home/bench/repos/redis/src/server.c | grep -E "(dirty|CMD_WRITE|PROPAGATE_)" | head -40)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Bash(grep -n "postExecutionUnitOperations\|processCommand" /home/bench/repos/redis/src/server.c | head -40)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Bash(grep -n "^    call(" /home/bench/repos/redis/src/server.c)
      ↳ Bash(grep -n "call(c," /home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Bash(grep -n "postExecutionUnitOperations" /home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Bash(grep -n "void replicationFeedSlaves" /home/bench/repos/redis/src/replication.c)
      ↳ Read(/home/bench/repos/redis/src/replication.c)
      ↳ Bash(grep -n "void feedReplicationBuffer\|replBufWriterBegin\|replBufWriterEnd\|replBufWriterAppend" /home/bench/repos/redis/src/replication.c | head -20)
      ↳ Read(/home/bench/repos/redis/src/replication.c)
      ↳ Read(/home/bench/repos/redis/src/replication.c)
      ↳ Bash(grep -n "void prepareReplicasToWrite\|canFeedReplicaReplBuffer" /home/bench/repos/redis/src/replication.c)
      ↳ Bash(grep -n "prepareReplicasToWrite" /home/bench/repos/redis/src/replication.c)
      ↳ Read(/home/bench/repos/redis/src/replication.c)
      ↳ Bash(grep -n "also_propagate\|redisOpArray" /home/bench/repos/redis/src/server.h)
      ↳ Read(/home/bench/repos/redis/src/server.h)
      ↳ Bash(grep -n "typedef struct redisOp" /home/bench/repos/redis/src/server.h)
      ↳ Read(/home/bench/repos/redis/src/server.h)
      ↳ Bash(grep -n "^int redisOpArrayAppend\|^void redisOpArrayFree" /home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Bash(grep -n "clientHasPendingReplies\|prepareClientToWrite" /home/bench/repos/redis/src/networking.c | head -20)
      ↳ Read(/home/bench/repos/redis/src/networking.c)
      ↳ Bash(grep -n "iothread_do_write\|writeToClient\|sendReplyToClient" /home/bench/repos/redis/src/networking.c | head -20)
      ↳ Read(/home/bench/repos/redis/src/networking.c)
      ↳ Bash(grep -n "ref_repl_buf_node\|ref_block_pos" /home/bench/repos/redis/src/replication.c | head -30)
      ↳ Bash(grep -n "^int shouldPropagate\|^static int shouldPropagate" /home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Bash(find /home/bench/repos/redis/src -name "t_string.c" -o -name "t_*.c" | head -5)
      ↳ Bash(grep -n "void setCommand\|server.dirty" /home/bench/repos/redis/src/t_string.c | head -40)
      ↳ Read(/home/bench/repos/redis/src/t_string.c)
      ↳ Bash(grep -n "^void setGenericCommand" /home/bench/repos/redis/src/t_string.c)
      ↳ Read(/home/bench/repos/redis/src/t_string.c)
      ↳ Bash(grep -n "CMD_CALL_FULL\|CMD_CALL_PROPAGATE" /home/bench/repos/redis/src/server.h)
      ↳ Bash(grep -n "void enterExecutionUnit\|void exitExecutionUnit" /home/bench/repos/redis/src/server.c)
      ↳ Read(/home/bench/repos/redis/src/server.c)
      ↳ Bash(grep -n "struct client" /home/bench/repos/redis/src/server.h | grep "ref_repl_buf_node\|ref_block_pos" | head -5)
      ↳ Bash(grep -n "ref_repl_buf_node\|ref_block_pos" /home/bench/repos/redis/src/server.h | head -10)
      ↳ Bash(grep -n "void createReplicationBacklog\|typedef struct replBacklog" /home/bench/repos/redis/src/replication.c | head -5)
      ↳ Read(/home/bench/repos/redis/src/replication.c)
      ↳ ⟹ returned to parent


💬 Here's the full journey, stage by stage, with exact file and line references:  ---  ## Stage 1 — Detecting a write happened (`call()` in `server.c`)  The com...

──────── RESULT (success, 189721ms, 2 turns) ────────
Here's the full journey, stage by stage, with exact file and line references:

---

## Stage 1 — Detecting a write happened (`call()` in `server.c`)

The command handler (e.g. `setGenericCommand` at `t_string.c:190`) increments `server.dirty++` after modifying the dataset. Inside `call()`, a snapshot of `dirty` is taken **before** the command runs (`server.c:3978`), and the delta is computed after (`server.c:4032–4033`). A non-zero delta causes `propagate_flags` to be set to `PROPAGATE_AOF|PROPAGATE_REPL`. Client flags like `CLIENT_FORCE_REPL` or `CLIENT_PREVENT_REPL_PROP` can override this. The key block is `server.c:4127–4154`.

---

## Stage 2 — Queuing the operation

With propagation flags set, `call()` calls `alsoPropagate()` (`server.c:3732`), which deep-copies the `argv` array (incrementing refcounts) and appends it to `server.also_propagate`, a `redisOpArray` living in the global server struct. Each entry (`redisOp`, `server.h:1802`) stores `argv`, `argc`, `dbid`, and the `target` bitmask. The array starts at capacity 16 and doubles. The queue is **not flushed inside `call()`** — that's intentional for atomicity.

---

## Stage 3 — Flushing after the command finishes

After `call()` returns to `processCommand()`, `afterCommand(c)` is invoked (`server.c:4189`), which calls `postExecutionUnitOperations()` (`server.c:3867`). That calls `propagatePendingCommands()` (`server.c:3811`), which iterates `server.also_propagate`. If more than one operation accumulated, it wraps them in `MULTI`/`EXEC`. For each entry it calls `propagateNow()` (`server.c:3704`), which dispatches to `feedAppendOnlyFile()` for AOF and `replicationFeedSlaves()` for replicas. After flushing, `redisOpArrayFree()` releases the queued argv arrays.

---

## Stage 4 — Encoding to bytes and feeding the stream

`replicationFeedSlaves()` (`replication.c:631`) does the actual serialization:

1. **Early exits**: returns immediately if we're a replica ourselves, or if there are no slaves and no backlog.
2. **SELECT injection**: if the target `dbid` differs from `server.slaveseldb`, a `SELECT` command is prepended first.
3. **RESP encoding via `replBufWriter`**: a lightweight writer (`replBufWriterBegin/Append/End`) writes directly into a linked list of `replBufBlock` chunks (`server.repl_buffer_blocks`). It writes `*argc\r\n`, then for each argument `$len\r\n<data>\r\n`. New `replBufBlock`s are allocated from `zmalloc` as needed (`replBufWriterAllocBlock`, `replication.c:484`), sized between `PROTO_REPLY_CHUNK_BYTES` and `repl_backlog_size/16`.
4. **`replBufWriterEnd()`** (`replication.c:565`) advances `server.master_repl_offset` by the total bytes written, then for each replica sets `slave->ref_repl_buf_node` and `slave->ref_block_pos` to point to the start of the new data, and increments the block's `refcount`. The backlog (`server.repl_backlog`) similarly takes a reference. No per-replica copy is made — all replicas reference the same blocks.

---

## Stage 4b — Sending bytes to replica sockets

`replicationFeedSlaves()` also calls `prepareReplicasToWrite()`, which calls `prepareClientToWrite()` → `putClientInPendingWriteQueue()` (`networking.c:275`) to register each replica for writing in the event loop. When the loop fires, `sendReplyToClient()` → `writeToClient()` → `_writeToClientSlave()` (`networking.c:2734`) reads from the block the replica is pointing at (`slave->ref_repl_buf_node`) at `slave->ref_block_pos` and calls `connWrite()` for the actual socket write. When a block is fully consumed, `refcount` is decremented and the pointer advances to the next block; `incrementalTrimReplicationBacklog()` then prunes any blocks with `refcount == 0`.

---

## How the stages connect (call chain summary)

```
setCommand → setGenericCommand → server.dirty++
                                        ↓
call() snapshots dirty, runs cmd, computes delta
  → alsoPropagate() → redisOpArrayAppend(&server.also_propagate)
  → afterCommand()
       → postExecutionUnitOperations()
            → propagatePendingCommands()
                 → propagateNow() for each op
                      → replicationFeedSlaves()
                           → replBufWriterBegin/Append/End
                                → bytes land in server.repl_buffer_blocks
                                → slave->ref_repl_buf_node/ref_block_pos set
                      → putClientInPendingWriteQueue(slave)
                                        ↓
                             event loop fires
                      → _writeToClientSlave() → connWrite() → socket
```

The deliberate deferred-flush design (queue in `call()`, flush in `afterCommand()`) ensures that a command whose handler calls `alsoPropagate()` multiple times (or triggers nested `call()`s) still emits a single atomic `MULTI/EXEC`-wrapped batch to replicas.
