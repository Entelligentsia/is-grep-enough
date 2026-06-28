# transcript: I'm studying how Redis produces a point-in-time snapshot of the dataset to disk without blocking the server from serving clients. I need to understand how th...


💬 I'll trace the full BGSAVE flow using the LSP tool, starting from the command entry point and following the chain.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(bgsaveCommand)
  ▸ LSP(rdbSaveBackground)
  ▸ LSP(backgroundSaveDoneHandler)

💬 Let me read the key functions. I'll pull them in parallel.
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)

💬 Now let me find how `serverCron` reaps the child, and where `bgsaveCommand` is defined.
  ▸ LSP(checkChildrenDone)
  ▸ LSP(redisFork)
  ▸ LSP(sendChildCowInfo)
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/redis/src/server.h","line":3778,"character":6})
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Now let me find `checkChildrenDone` implementation and `serverCron` reference to it.
  ▸ LSP(checkChildrenDone)
  ▸ LSP(openChildInfoPipe)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ LSP(sendChildInfoGeneric)

💬 Now let me look at how `serverCron` calls `checkChildrenDone`, and the child-info pipe for CoW reporting.
  ▸ LSP(receiveChildInfo)
  ▸ Bash(grep -n "checkChildrenDone\|hasActiveChildProcess\|receiveChildInfo\|child_info_pipe\|serverCron" /home/bench/repos/redis/src/server.c | head -60)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ LSP(receiveChildInfo sendChildInfoGeneric)

💬 Now let me look at `receiveChildInfo` / `sendChildInfoGeneric` and `bgsaveCommand`.
  ▸ Bash(grep -n "receiveChildInfo\|sendChildInfoGeneric\|child_info_pipe\|childInfo\|CHILD_INFO" /home/bench/repos/redis/src/server.c | head -40)
  ▸ Bash(grep -rn "void receiveChildInfo\|void sendChildInfoGeneric\|bgsaveCommand" /home/bench/repos/redis/src/ | head -20)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/childinfo.c)
  ▸ Read(/home/bench/repos/redis/src/childinfo.c)

💬 Now let me look at what the child actually does in `rdbSave` — the write loop.
  ▸ LSP(rdbSave)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)

💬 Let me look at `rdbSaveInternal` to see the actual data serialization.
  ▸ Read(/home/bench/repos/redis/src/rdb.c)

💬 Now I have everything I need to explain the full system. Here's how the pieces fit together:  ---  ## Redis BGSAVE: end-to-end flow  ### 1. Launching the bac...

──────── RESULT (success, 151323ms, 29 turns) ────────
Now I have everything I need to explain the full system. Here's how the pieces fit together:

---

## Redis BGSAVE: end-to-end flow

### 1. Launching the background save

**`bgsaveCommand` (`rdb.c:4833`)** is the entry point when a client sends `BGSAVE`. It handles three cases:
- RDB child already running → error
- Another child running (AOF, module) → either schedule with `server.rdb_bgsave_scheduled = 1` (if `SCHEDULE` flag given) or error out
- Otherwise → calls `rdbSaveBackground`

**`rdbSaveBackground` (`rdb.c:2070`)**:
```c
server.dirty_before_bgsave = server.dirty;   // snapshot dirty count at fork time
server.lastbgsave_try = time(NULL);
if ((childpid = redisFork(CHILD_TYPE_RDB)) == 0) {
    /* child path */
    rdbSave(req, filename, rsi, rdbflags);
    sendChildCowInfo(CHILD_INFO_TYPE_RDB_COW_SIZE, "RDB");
    exitFromChild(retval == C_OK ? 0 : 1, 0);
} else {
    /* parent records state and returns immediately */
    server.rdb_save_time_start = time(NULL);
    server.rdb_child_type = RDB_CHILD_TYPE_DISK;
}
```

**`redisFork` (`server.c:7428`)** does the real fork work:
- Fires `REDISMODULE_EVENT_FORK_CHILD_PRE` so multi-threaded modules reach a fork-safe state (prevents deadlock from inherited locks)
- Opens the child-info pipe (`server.child_info_pipe[0/1]`) before the fork so both sides inherit it
- Calls `fork()`
- **Child side:** closes the pipe's read end (`[0]`), sets up signal handlers, adjusts OOM score, calls `dismissMemoryInChild()` to advise the OS to drop buffers the child won't use (reduces CoW pressure)
- **Parent side:** records fork latency, fires `FORK_CHILD_BORN`, stores `server.child_pid`

---

### 2. Work division: CoW snapshot

After `fork()`, the OS copies the page table but not the pages — **copy-on-write (CoW)**. The child gets a frozen, consistent point-in-time view of the entire dataset without any locking or pausing of the parent.

As the parent serves clients and mutates data, the OS copies the affected pages on first write (the parent gets a new private copy; the child keeps reading the original). The child's snapshot never changes regardless of what clients do after the fork.

**Child's write path** (`rdbSave` → `rdbSaveInternal` → `rdbSaveRio`):
- Writes to a temp file `temp-<pid>.rdb` (`rdb.c:2032`)
- `rdbSaveInternal` (`rdb.c:1956`): opens file, initializes a `rio` (Redis I/O abstraction), optionally enables incremental fsync every `REDIS_AUTOSYNC_BYTES` to avoid I/O bursts
- `rdbSaveRio` serializes all databases: aux fields, per-DB select opcodes, then every key-value pair via `rdbSaveKeyValuePair` (which handles expiry, LRU/LFU metadata, and type-specific encoding)
- After `rdbSaveRio` returns: `fflush` → `fsync` → optional page-cache reclaim → `fclose`
- Back in `rdbSave` (`rdb.c:2041`): **atomic rename** `temp-<pid>.rdb` → `dump.rdb`. The production file is never in a partial state — readers either see the old complete file or the new complete file.
- Final fsync of the directory entry

---

### 3. Progress communication: child-info pipe

The child-info pipe (`childinfo.c`) carries `child_info_data` structs unidirectionally from child to parent:

```c
typedef struct {
    size_t keys;           // keys processed
    size_t cow;            // current CoW size (private dirty pages)
    monotime cow_updated;
    double progress;
    childInfoType information_type;
} child_info_data;
```

**Child side — `sendChildInfoGeneric` (`childinfo.c:49`)**: called periodically during save and once at the very end. Measures CoW size via `zmalloc_get_private_dirty(-1)`, which is expensive, so it's throttled: the next measurement is not taken until `cost × CHILD_COW_DUTY_CYCLE` microseconds have elapsed. Writes the struct to `child_info_pipe[1]`.

**Parent side — `receiveChildInfo` (`childinfo.c:150`)**: drains the non-blocking read end (`child_info_pipe[0]`), calling `updateChildInfo` for each complete message. That updates `server.stat_current_cow_bytes`, `server.stat_current_cow_peak`, `server.stat_current_save_keys_processed`, etc. — the numbers surfaced by `INFO persistence`.

`serverCron` calls this with `run_with_period(1000)` (once per second while a child is active).

---

### 4. Completion detection: `waitpid` in `serverCron`

Every `serverCron` tick (`server.c:1692`):

```c
if (hasActiveChildProcess() || ldbPendingChildren()) {
    run_with_period(1000) receiveChildInfo();   // drain pipe periodically
    checkChildrenDone();                        // check for exit, every tick
}
```

**`checkChildrenDone` (`server.c:1416`)**:
```c
pid = waitpid(-1, &statloc, WNOHANG);   // non-blocking
if (pid == server.child_pid) {
    if (server.child_type == CHILD_TYPE_RDB)
        backgroundSaveDoneHandler(exitcode, bysignal);
    if (!bysignal && exitcode == 0) receiveChildInfo();  // drain pipe one last time
    resetChildState();   // clears child_pid, child_type, closes pipe
}
```

`WNOHANG` is the key — the parent never blocks. If the child hasn't exited yet, `waitpid` returns 0 and `serverCron` moves on. The event loop remains fully available for clients.

---

### 5. Finalization

**`backgroundSaveDoneHandler` (`rdb.c:4605`)** dispatches on `server.rdb_child_type`:

**`backgroundSaveDoneHandlerDisk` (`rdb.c:4544`)** — for normal BGSAVE:
- **Success**: `server.dirty -= server.dirty_before_bgsave` — subtracts only the dirty count that existed at fork time. Writes made *after* the fork are left in `server.dirty` so they'll be included in the next save trigger. Sets `server.lastsave`, `server.lastbgsave_status = C_OK`.
- **Non-zero exit**: marks `server.lastbgsave_status = C_ERR`, increments `server.stat_rdb_consecutive_failures`.
- **Killed by signal**: removes the temp file (unless SIGUSR1, which is the "abort cleanly" signal). `bgsave_aborted` flag turns a race-y success into a SIGUSR1 abort.

After the type-specific handler, the dispatcher (`rdb.c:4622`):
```c
server.rdb_child_type = RDB_CHILD_TYPE_NONE;
server.rdb_save_time_last = save_end - server.rdb_save_time_start;
server.bgsave_aborted = 0;
updateSlavesWaitingBgsave(ok ? C_OK : C_ERR, type);  // notify replicas
```

`updateSlavesWaitingBgsave` unblocks replicas that were waiting for the RDB to start their initial sync (replication piggybacking on BGSAVE).

---

### The full sequence in one view

```
Client           Main process (event loop)              Child process
  |                       |                                   |
BGSAVE ─────────────────> bgsaveCommand
                          rdbSaveBackground
                          redisFork ──────────────────────── fork()
                          [parent returns immediately]        |
                          serverCron tick N                   rdbSave
                            receiveChildInfo  <──── CoW info  rdbSaveInternal
                          serverCron tick N+1                 rdbSaveRio
                            receiveChildInfo  <──── CoW info  (serialize all keys)
                          ...                                 fflush/fsync
                          serverCron tick M                   rename temp→dump.rdb
                            waitpid WNOHANG ─────────────── exit(0)
                            backgroundSaveDoneHandler
                              dirty -= dirty_before_bgsave
                              lastsave = now
                              updateSlavesWaitingBgsave
                            resetChildState
```

The design's key invariant: **the main event loop never yields or pauses**. The fork provides an instant, lock-free snapshot; the child-info pipe provides live telemetry without synchronization; and `WNOHANG waitpid` in the cron timer provides zero-cost completion polling.
