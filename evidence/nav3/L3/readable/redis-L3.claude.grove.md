# transcript: I want to trace what happens to a single client request from the moment its bytes arrive on the socket until the matching command handler actually runs. I'm ...


💬 Let me load the grove tools and then trace the full path systematically.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition)

💬 Now let me look at the key functions in parallel — the socket reader, the parser, the dispatcher, and the command table.
  ▸ mcp__grove__source({"file":"src/networking.c","name":"readQueryFromClient"})
  ▸ mcp__grove__source({"file":"src/networking.c","name":"processInputBuffer"})
  ▸ mcp__grove__source({"file":"src/server.c","name":"processCommand"})

💬 Now let me get the `call` function and `processMultibulkBuffer` to complete the picture.
  ▸ mcp__grove__source({"file":"src/server.c","name":"call"})
  ▸ mcp__grove__source({"file":"src/networking.c","name":"processMultibulkBuffer"})
  ▸ mcp__grove__symbols({"dir":"src","name":"lookupCommand","kind":"function"})

💬 Let me get the `lookupCommand` implementation and `preprocessCommand` to see where the early lookup happens.
  ▸ mcp__grove__source({"id":"c:src/server.c#lookupCommand@3609"})
  ▸ mcp__grove__source({"file":"src/networking.c","name":"preprocessCommand"})
  ▸ mcp__grove__symbols({"dir":"src","name":"preprocessCommand"})
  ▸ mcp__grove__source({"file":"src/server.c","name":"lookupCommandLogic"})
  ▸ mcp__grove__source({"id":"c:src/server.c#preprocessCommand@4362"})

💬 Now let me grab `processCommandAndResetClient` which bridges the parsing loop and the dispatcher.
  ▸ mcp__grove__source({"file":"src/server.c","name":"processCommandAndResetClient"})
  ▸ mcp__grove__symbols({"dir":"src","name":"processCommandAndResetClient"})
  ▸ mcp__grove__source({"id":"c:src/networking.c#processCommandAndResetClient@3491"})

💬 Here is the complete path, in order, with precise source locations.  ---  ## 1. Bytes arrive: `readQueryFromClient` (`networking.c:3830`)  The event loop (in...

──────── RESULT (success, 112972ms, 16 turns) ────────
Here is the complete path, in order, with precise source locations.

---

## 1. Bytes arrive: `readQueryFromClient` (`networking.c:3830`)

The event loop (in `ae.c`) fires a read event, which lands in `readQueryFromClient(connection *conn)`. This function:

- Resolves the `client *c` from the connection's private data.
- Decides how many bytes to ask for (`readlen`, normally `PROTO_IOBUF_LEN` = 16 KB, shrunk for large in-progress arguments to avoid over-reading).
- Acquires a buffer. The common case is a **thread-local reusable query buffer** (`thread_reusable_qb`) shared across clients; a client only gets its own private `c->querybuf` for big args or concurrent nested calls.
- Calls `connRead(c->conn, c->querybuf+qblen, readlen)` — a single `read(2)` syscall. On error or EOF, the client is freed.
- Updates `c->querybuf`'s length with `sdsIncrLen`, updates stats, enforces `client_max_querybuf_len`.
- Falls through to `processInputBuffer(c)`.

---

## 2. The parsing loop: `processInputBuffer` (`networking.c:3626`)

This function loops while `c->qb_pos < sdslen(c->querybuf)` or there are pre-parsed pending commands. It respects early-exit conditions (blocked client, `CLIENT_CLOSE_AFTER_REPLY`, etc.) and a `lookahead` limit (default 1 for unauthenticated clients).

**Inner parse sub-loop — detecting protocol type:**

```c
if (c->querybuf[c->qb_pos] == '*') {
    c->reqtype = PROTO_REQ_MULTIBULK;   // RESP
} else {
    c->reqtype = PROTO_REQ_INLINE;       // legacy telnet-style
}
```

For RESP (the universal case in modern Redis), it calls `processMultibulkBuffer(c, pcmd)`.

---

## 3. RESP parsing: `processMultibulkBuffer` (`networking.c:3214`)

This walks the raw bytes at `c->querybuf + c->qb_pos` and materialises a complete command into a `pendingCommand *pcmd`:

1. **Count line** — reads `*N\r\n`, converts `N` to `c->multibulklen`, allocates `pcmd->argv[]` (`robj **`).
2. **Argument loop** — for each of the `N` arguments:
   - Reads `$len\r\n`, stores `len` in `c->bulklen`.
   - Waits until `len+2` bytes are available in the buffer (returns `C_OK` with `PENDING_CMD_FLAG_INCOMPLETE` if not yet — the function is re-entered on the next read event).
   - For **big arguments** (≥ `PROTO_MBULK_BIG_ARG` = 32 KB) that exactly fill the querybuf, it *takes ownership* of the SDS directly (`createObject(OBJ_STRING, c->querybuf)`) and allocates a fresh querybuf for future reads — zero copy.
   - Otherwise creates a string object copying `len` bytes: `createStringObject(c->querybuf+c->qb_pos, c->bulklen)`.
   - Appends the `robj *` to `pcmd->argv`, decrements `c->multibulklen`, advances `c->qb_pos`.
3. Returns `C_OK` with `multibulklen == 0` when all arguments are collected. `pcmd->argc` now equals the number of arguments; `pcmd->argv[0]->ptr` is the command name string.

---

## 4. Pre-execution lookup: `preprocessCommand` (`server.c:4362`)

Called by `processInputBuffer` immediately after a successful parse, **before** the command is dequeued for execution:

```c
if (isCommandReusable(last_cmd, pcmd->argv[0]))
    pcmd->cmd = last_cmd;            // fast path: same command as last time
else
    pcmd->cmd = lookupCommand(pcmd->argv, pcmd->argc);
```

It also:
- Checks arity against `pcmd->cmd->arity`.
- Calls `extractKeysAndSlot` to compute the cluster slot for pipelining/routing purposes.
- Stores the resolved `redisCommand *` in `pcmd->cmd`.

---

## 5. Command resolution: `lookupCommand` → `lookupCommandLogic` (`server.c:3593/3609`)

```c
struct redisCommand *lookupCommandLogic(dict *commands, robj **argv, int argc, int strict) {
    struct redisCommand *base_cmd = dictFetchValue(commands, argv[0]->ptr);
    int has_subcommands = base_cmd && base_cmd->subcommands_dict;
    if (argc == 1 || !has_subcommands) {
        return base_cmd;
    } else {
        return lookupSubcommand(base_cmd, argv[1]->ptr);   // e.g. CONFIG SET
    }
}
```

`server.commands` is a `dict` (hash table) keyed by command-name strings. `dictFetchValue` is an O(1) lookup. For two-level commands like `CONFIG SET` or `OBJECT ENCODING`, a second lookup is done in `base_cmd->subcommands_dict`. The returned `redisCommand *` points directly into the `redisCommandTable` registered at startup in `server.c`.

---

## 6. Back in `processInputBuffer`: dispatch

After parsing is done, `processInputBuffer` copies the pending command's fields into the live `client` struct:

```c
c->argc = curcmd->argc;
c->argv = curcmd->argv;
c->lookedcmd = curcmd->cmd;   // the already-resolved redisCommand *
```

Then, since we're on the main thread:

```c
processCommandAndResetClient(c)   // networking.c:3491
```

---

## 7. `processCommandAndResetClient` (`networking.c:3491`)

A thin wrapper: sets `server.current_client = c`, calls `processCommand(c)`, then calls `commandProcessed(c)` (which advances the replication offset and cleans up the pending-command slot).

---

## 8. Validation gauntlet: `processCommand` (`server.c:4412`)

This is the main pre-flight checklist, run in strict order:

1. **Module command filters** (`moduleCallCommandFilters`) — modules can rewrite `c->argv`.
2. **Command re-lookup** if module filters may have altered `argv[0]` (falls back on the already-cached `c->lookedcmd` if unchanged).
3. **Existence & arity checks** (`commandCheckExistence`, `commandCheckArity`) — rejects with `-ERR` if unknown or wrong arg count.
4. **Auth** — rejects unless `CMD_NO_AUTH` flag is set.
5. **ACL** (`ACLCheckAllPerm`) — rejects with `-NOPERM`.
6. **Cluster routing** (`getNodeByQuery`) — redirects with `MOVED`/`ASK` if the key belongs to another node.
7. **`evictClients`** — may free the current client if memory is critically tight.
8. **`performEvictions`** — runs maxmemory eviction; rejects `CMD_DENYOOM` commands if OOM remains.
9. **Persistence / replica safety** — rejects writes on disk-error, read-only replica, insufficient replicas, etc.
10. **Pub/Sub restrictions**, **server-paused state**, **busy script** checks.
11. **MULTI queue** — if the client is in a `MULTI` block and this isn't `EXEC`/`DISCARD`/`MULTI`/`WATCH`, the command is queued with `queueMultiCommand` and `+QUEUED` is returned. Execution stops here until `EXEC`.
12. Otherwise: **`call(c, CMD_CALL_FULL)`**.

---

## 9. Execution: `call` (`server.c:3949`)

```c
c->cmd->proc(c);
```

That single line is the actual handler invocation. `c->cmd->proc` is a function pointer in the `redisCommand` struct — for `SET` it is `setCommand`, for `GET` it is `getCommand`, and so on, all registered in `redisCommandTable` in `server.c`.

Around that one call, `call` does:

- Snapshots `server.dirty` before and after to know whether to propagate.
- Measures wall-clock duration (via monotonic hardware clock when available).
- After `proc` returns: updates per-command call/microsecond stats, records slowlog entries, feeds `MONITOR` clients, propagates to AOF and replica streams if the command dirtied data.

---

## Summary chain

```
readQueryFromClient          (networking.c:3830)
  connRead → c->querybuf     syscall: raw bytes land here
  processInputBuffer         (networking.c:3626)
    processMultibulkBuffer   (networking.c:3214)
      → pcmd->argv[]         RESP framing → robj* arguments
    preprocessCommand        (server.c:4362)
      lookupCommandLogic     (server.c:3593)
        dictFetchValue       O(1) hash lookup in server.commands
      → pcmd->cmd            resolved redisCommand*
    processCommandAndResetClient  (networking.c:3491)
      processCommand         (server.c:4412)
        auth / ACL / cluster / OOM / replica checks ...
        call                 (server.c:3949)
          c->cmd->proc(c)    ← setCommand / getCommand / ...
```

One thing worth noting: command resolution happens **twice** by design. `preprocessCommand` resolves it eagerly while parsing (to allow pipelining, slot computation, and arity rejection before the main thread even looks at the command). `processCommand` then re-checks whether module filters rewrote `argv[0]`, re-using the cached pointer (`c->lookedcmd`) in the common case. The actual dispatch via `c->cmd->proc(c)` is exactly one indirect function call in `call`.
