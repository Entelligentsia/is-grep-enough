# transcript: I want to trace what happens to a single client request from the moment its bytes arrive on the socket until the matching command handler actually runs. I'm ...


💬 I'll read the key files to trace this precisely.
  ▸ Bash(grep -n "readQueryFromClient\|processInputBuffer\|processCommand\|lookupCommand\|call(" /home/bench/repos/redis/src/networking.c | head -60)
  ▸ Bash(grep -n "readQueryFromClient\|processInputBuffer\|processCommand\|lookupCommand\|call(" /home/bench/repos/redis/src/server.c | head -60)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/networking.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Now I have the full picture. Here is the end-to-end walkthrough.  ---  ## From socket bytes to command handler: the full path  ### 1. Event loop fires `readQ...

──────── RESULT (success, 64612ms, 11 turns) ────────
Now I have the full picture. Here is the end-to-end walkthrough.

---

## From socket bytes to command handler: the full path

### 1. Event loop fires `readQueryFromClient` — `networking.c:3830`

The connection layer calls `connSetReadHandler(conn, readQueryFromClient)` when a client is accepted (`networking.c:133`). Whenever the kernel signals the socket is readable, the event loop invokes `readQueryFromClient(connection *conn)`.

It resolves the `client *` from the connection's private data, then decides how much to read. For normal requests it reads `PROTO_IOBUF_LEN` (16 KB) at a time; for a large in-flight bulk argument it trims `readlen` to exactly the bytes still needed for that argument, to keep the SDS string zero-copy-able later.

The actual read is one call:

```c
nread = connRead(c->conn, c->querybuf+qblen, readlen);   // networking.c:3915
```

Bytes land in `c->querybuf`, an SDS string. After updating stats and enforcing `client_max_querybuf_len`, it calls `processInputBuffer(c)`.

---

### 2. Parse loop: `processInputBuffer` — `networking.c:3626`

This is the protocol-parsing driver. It loops while `c->querybuf` has unconsumed bytes (`c->qb_pos` tracks the read cursor). On each iteration it does two things: **parse** and **dispatch**.

**Detect protocol** (`networking.c:3676–3681`): If the first unread byte is `*`, this is RESP (multi-bulk); otherwise it's the old inline format.

**Parse into a `pendingCommand`**: depending on the protocol, it calls either `processInlineBuffer` or `processMultibulkBuffer`, passing a freshly allocated `pendingCommand` struct.

`processMultibulkBuffer` (`networking.c:3214`) reads the RESP framing:
- The `*<count>\r\n` header sets `c->multibulklen`.
- Each `$<len>\r\n<data>\r\n` bulk string is parsed; for small arguments a new `robj` is created and stored in `pcmd->argv[]`; for big arguments (`>= PROTO_MBULK_BIG_ARG`) an `robj` that directly wraps the SDS slice in the query buffer is used to avoid copying.
- Returns `C_ERR` (incomplete frame) or `C_OK` (full command parsed).

When the command is fully parsed, `preprocessCommand` is called (`networking.c:3720`) — this resolves the slot for cluster routing and does a speculative `lookupCommand` for prefetching purposes.

The finished `pendingCommand` is placed on `c->pending_cmds`.

---

### 3. Promote pending command to client fields — `networking.c:3737–3748`

The head of `c->pending_cmds` is popped (but not freed yet) and its fields are copied onto the `client` struct directly:

```c
c->argc = curcmd->argc;
c->argv = curcmd->argv;
c->lookedcmd = curcmd->cmd;   // result of the speculative lookup above
// …
```

---

### 4. Hand off: `processCommandAndResetClient` — `networking.c:3491`

If we're on the main thread, control goes directly to `processCommandAndResetClient`. (If we're on an I/O thread, `CLIENT_IO_PENDING_COMMAND` is set and the client is enqueued for the main thread to pick up — same function is called there via `processPendingCommandAndInputBuffer`.)

```c
server.current_client = c;
if (processCommand(c) == C_OK)
    commandProcessed(c);
```

---

### 5. Validate and resolve the command: `processCommand` — `server.c:4412`

This is the gating function. In order:

1. **Module command filters** (`moduleCallCommandFilters`) may rewrite `c->argv`.
2. **Command lookup** (`server.c:4447–4455`): checks `c->lookedcmd` (the speculative result from step 2); re-runs `lookupCommand(c->argv, c->argc)` if the argv was mutated by filters or the cache is stale.
3. `lookupCommand` calls `lookupCommandLogic(server.commands, argv, argc, 0)` (`server.c:3593`), which does a plain `dictFetchValue` on `server.commands` (a `dict` keyed by command-name SDS). For subcommands (e.g. `CONFIG SET`) it then does a second lookup in `base_cmd->subcommands_dict`.
4. `c->cmd = c->lastcmd = c->realcmd = cmd` (`server.c:4472`).
5. **Validation gauntlet**: arity check, auth, cluster slot, maxmemory/eviction, loading state, replication role, pause state — each can `rejectCommand` and return `C_OK` early.
6. **MULTI/EXEC**: if `CLIENT_MULTI` is set and this isn't `EXEC`/`DISCARD`/`MULTI`/`WATCH`, the command is queued with `queueMultiCommand` and `QUEUED` is replied; no execution yet.
7. **Normal path** (`server.c:4787–4788`):
   ```c
   call(c, CMD_CALL_FULL);
   ```

---

### 6. Execute: `call` — `server.c:3949`

`call` is the final executor. It sets `server.executing_client`, arms timing, then invokes the handler through the function pointer stored on the command struct:

```c
c->cmd->proc(c);    // server.c:4015
```

That `proc` pointer is whatever was registered in `redisCommandTable` in `server.c` — e.g. `setCommand`, `getCommand`, `hsetCommand`. The handler runs, writes its reply to `c`'s output buffer via `addReply*`, and returns. `call` then records latency, updates slow-log/monitor, handles propagation to AOF and replicas, and returns to `processCommand`.

---

### Summary of the call chain

```
event loop
  → readQueryFromClient          (networking.c:3830)   read bytes into c->querybuf
    → processInputBuffer         (networking.c:3626)   parse RESP frames in a loop
      → processMultibulkBuffer   (networking.c:3214)   build pendingCommand / argv
      → preprocessCommand        (server.c:4362)       speculative lookup + slot
      → processCommandAndResetClient (networking.c:3491)
        → processCommand         (server.c:4412)       auth/arity/cluster gates
          → lookupCommandLogic   (server.c:3593)       dictFetchValue → redisCommand*
          → call                 (server.c:3949)
            → c->cmd->proc(c)                          the actual handler
```

Key data structures involved: `client.querybuf` (SDS input buffer), `client.pending_cmds` (parsed-but-not-yet-executed queue), `pendingCommand.argv` (array of `robj*` arguments), `redisCommand.proc` (function pointer to the handler), and `server.commands` (the `dict` that maps name → `redisCommand`).
