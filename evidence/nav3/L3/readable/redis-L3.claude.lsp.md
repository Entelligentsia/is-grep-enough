# transcript: I want to trace what happens to a single client request from the moment its bytes arrive on the socket until the matching command handler actually runs. I'm ...


💬 I'll trace this end-to-end using the LSP tool to navigate the call chain precisely. Let me load LSP and start from the socket read.
  ▸ ToolSearch(select:LSP)

💬 Let me find all the key functions in one sweep.
  ▸ LSP(readQueryFromClient)
  ▸ LSP(processInputBuffer)
  ▸ LSP(processCommand)
  ▸ LSP(lookupCommand)

💬 Now let me find `readQueryFromClient` and `call`, and read the key code sections in parallel.
  ▸ LSP(readQueryFromClient)
  ▸ LSP(call)

💬 Now let me read all the key functions in parallel.
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Good. Now let me read `call`, `lookupCommandLogic`, the tail of `processInputBuffer`, and the tail of `readQueryFromClient` in parallel.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)

💬 One more read to see where `readQueryFromClient` calls `processInputBuffer` and where `processCommand` calls `call`.
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ LSP(processMultibulkBuffer)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Need to find the `call(c, ...)` invocation in `processCommand`.
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 I now have all the pieces. Here's the complete, line-exact walkthrough.  ---  ## From socket bytes to command handler — the full sequence  ### 1. `readQueryF...

──────── RESULT (success, 130526ms, 22 turns) ────────
I now have all the pieces. Here's the complete, line-exact walkthrough.

---

## From socket bytes to command handler — the full sequence

### 1. `readQueryFromClient` — networking.c:3830

This is the event-loop read callback registered on the client's connection. When the fd becomes readable the event loop fires it.

**Buffer setup (3849–3914):** `readlen` defaults to `PROTO_IOBUF_LEN` (16 KB). For large bulk arguments already in progress it shrinks to exactly the bytes remaining for that argument, so the querybuf ends precisely at the argument boundary. The buffer itself is `c->querybuf`, an SDS string. To save allocations, most normal clients share a thread-local reusable querybuf (`thread_reusable_qb`); a client only gets its own private one when it owns a big argument or when the shared buffer is already in use.

**The read (3915):**
```c
nread = connRead(c->conn, c->querybuf+qblen, readlen);
```
`connRead` is a thin abstraction over `read(2)`. On success, `sdsIncrLen` advances the SDS length, and stats + `lastinteraction` are updated.

**Limit check (3955–3966):** If `sdslen(c->querybuf)` exceeds `server.client_max_querybuf_len` the client is freed immediately.

**Hand off (3971):**
```c
if (processInputBuffer(c) == C_ERR)
    c = NULL;
```

---

### 2. `processInputBuffer` — networking.c:3626

This is the parsing-plus-dispatch loop. It runs as long as `c->qb_pos < sdslen(c->querybuf)` (unconsumed bytes) or `c->pending_cmds.ready_len > 0` (already-parsed commands waiting to execute).

**Protocol detection (3676–3682):** On the very first byte of each new command:
```c
if (c->querybuf[c->qb_pos] == '*')
    c->reqtype = PROTO_REQ_MULTIBULK;   // RESP wire format
else
    c->reqtype = PROTO_REQ_INLINE;       // telnet-style
```

**Inner parse loop (3672–3723):** Up to `server.lookahead` commands are parsed ahead into `pendingCommand` structs before execution begins. For each:
- Inline → `processInlineBuffer(c, pcmd)`
- Multibulk → `processMultibulkBuffer(c, pcmd)`  (see §3 below)

On success the `pendingCommand` is appended to `c->pending_cmds` and `preprocessCommand` is called (slot computation for cluster, etc.).

**Execution path (3737–3793):** The head `pendingCommand` is dequeued and its `argc`/`argv` are installed into the flat `client` fields:
```c
c->argc = curcmd->argc;
c->argv = curcmd->argv;
c->lookedcmd = curcmd->cmd;   // may already be resolved
```
If running on an **I/O thread** (not the main thread), it sets `CLIENT_IO_PENDING_COMMAND` and enqueues the client back to the main thread — commands are never executed from I/O threads. On the **main thread**:
```c
if (processCommandAndResetClient(c) == C_ERR) return C_ERR;
```

---

### 3. `processMultibulkBuffer` — networking.c:3214

Parses the RESP multi-bulk wire format (`*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n`):

1. Reads `*N\r\n` — stores the count in `c->multibulklen`, allocates `pcmd->argv` if needed.
2. For each of the N arguments reads `$N\r\n` (the byte-length prefix into `c->bulklen`), then verifies the full bulk payload plus `\r\n` trailer is present.
3. Creates a Redis string object (`robj`) directly from the querybuf position via `createStringObject` — for large arguments (`>= PROTO_MBULK_BIG_ARG`) an `embstr`/`raw` object is created to avoid a copy; for small ones an embedded object is made.
4. Decrements `c->multibulklen`; when it hits 0 the full command is in `pcmd->argv[0..argc-1]` and the function returns `C_OK`.

`c->qb_pos` advances with each consumed byte so the buffer is always consistent.

---

### 4. `processCommandAndResetClient` — networking.c:3491

A thin wrapper:
```c
server.current_client = c;
if (processCommand(c) == C_OK)
    commandProcessed(c);   // frees pendingCommand, advances reploff, etc.
server.current_client = old_client;
```

---

### 5. `processCommand` — server.c:4412

The gatekeeper. Roughly in order:

**Module filters (4427–4430):**
```c
moduleCallCommandFilters(c);   // modules may rewrite argv here
```

**Command lookup (4445–4472):**
```c
cmd = lookupCommand(c->argv, c->argc);
c->cmd = c->lastcmd = c->realcmd = cmd;
```
(There's a fast path that reuses `c->lastcmd` if the first argument is identical to the previous command — `isCommandReusable`.)

**Existence + arity check (4474–4481):** `commandCheckExistence` / `commandCheckArity` — reject immediately with `-ERR` if wrong.

**Gauntlet of policy checks (4500–4773):** In order:
- `authRequired` — must authenticate first
- `CLIENT_MULTI` mode with `CMD_NO_MULTI` flag
- ACL permissions (`ACLCheckAllPerm`)
- Cluster redirect (`getNodeByQuery` → `clusterRedirectClient`)
- Client eviction (`evictClients`)
- Maxmemory / OOM (`performEvictions`)
- Disk write errors, min-replicas-to-write
- Read-only replica
- Pub/Sub mode restrictions
- `CLIENT_PAUSED`
- Busy script / module (only `CMD_ALLOW_BUSY` commands may pass)

**MULTI/EXEC queuing vs. immediate execution (4776–4791):**
```c
if (c->flags & CLIENT_MULTI && /* not EXEC/DISCARD/MULTI/WATCH/QUIT/RESET */) {
    queueMultiCommand(c, cmd_flags);   // deferred
    addReply(c, shared.queued);
} else {
    call(c, CMD_CALL_FULL);            // execute now
}
```

---

### 6. `lookupCommand` / `lookupCommandLogic` — server.c:3609 / 3593

```c
struct redisCommand *base_cmd = dictFetchValue(commands, argv[0]->ptr);
```
`server.commands` is a `dict` (hash table) populated at startup from `redisCommandTable` in `server.c`. The key is the lowercase command name; the value is a `redisCommand *`.

For commands with subcommands (e.g. `CONFIG SET`):
```c
return lookupSubcommand(base_cmd, argv[1]->ptr);
```
— a second dict lookup on `base_cmd->subcommands_dict`. At most two levels; one O(1) lookup per level.

---

### 7. `call` — server.c:3949

The executor:
```c
server.executing_client = c;
dirty = server.dirty;             // snapshot write counter
call_timer = ustime();            // for slow-log and latency
enterExecutionUnit(1, call_timer);

c->flags |= CLIENT_EXECUTING_COMMAND;
c->cmd->proc(c);                  // <--- the handler runs here
exitExecutionUnit();
```

`c->cmd->proc` is a `void (*)(client *)` function pointer. For `SET` it points to `setCommand` in `t_string.c`; for `GET` to `getCommand`, and so on. The handler reads its arguments from `c->argv[0..c->argc-1]` and writes replies via `addReply*`.

After the handler returns, `call` measures duration (`ustime() - call_timer`), records to `slowlog` if needed, updates command stats (`c->cmd->calls`, `c->cmd->microseconds`), propagates mutations to AOF and replicas, and returns to `processCommand`.

---

### The full chain, summarised

```
event loop
  └─ readQueryFromClient()          networking.c:3830   connRead() → c->querybuf
       └─ processInputBuffer()       networking.c:3626   parse loop
            ├─ processMultibulkBuffer()  3214            RESP → pcmd->argv[]
            └─ processCommandAndResetClient()  3491
                 └─ processCommand()  server.c:4412      lookup + policy checks
                      ├─ lookupCommand()  3609           dict O(1) → redisCommand*
                      └─ call()      server.c:3949
                           └─ c->cmd->proc(c)            e.g. setCommand()
```

The only non-obvious structural point: parsing and execution are decoupled through the `pendingCommand` queue. `processInputBuffer` can parse several commands ahead (up to `server.lookahead`) before executing any of them — that's how pipelining and I/O-thread offloading work. The I/O thread fills `querybuf` and parses it into `pending_cmds`; the main thread drains `pending_cmds` through `processCommand` → `call`.
