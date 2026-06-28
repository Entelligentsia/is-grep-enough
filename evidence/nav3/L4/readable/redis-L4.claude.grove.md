# transcript: I'm studying how Redis produces a point-in-time snapshot of the dataset to disk without blocking the server from serving clients. I need to understand how th...


💬 I'll use grove to map out the RDB subsystem structurally, then trace the key call chains.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__map)

💬 Let me get the skeleton of `rdb.c` and look up the key background-save symbols in parallel.
  ▸ mcp__grove__outline({"file":"src/rdb.c","detail":0})
  ▸ mcp__grove__symbols({"dir":"src","name":"rdbSaveBackground"})

💬 Now let me read the core functions in parallel — the launcher, the child's work, and the completion handlers.
  ▸ mcp__grove__source({"id":"c:src/rdb.c#rdbSaveBackground@2070"})
  ▸ mcp__grove__source({"file":"src/rdb.c","name":"backgroundSaveDoneHandler"})
  ▸ mcp__grove__source({"file":"src/rdb.c","name":"rdbSaveInternal"})

💬 Now let me read `rdbSave` (the wrapper that manages the temp file rename), `backgroundSaveDoneHandlerDisk`, and how `serverCron` calls the completion handler.
  ▸ mcp__grove__source({"file":"src/rdb.c","name":"rdbSave"})
  ▸ mcp__grove__source({"file":"src/rdb.c","name":"backgroundSaveDoneHandlerDisk"})
  ▸ mcp__grove__symbols({"dir":"src","name":"checkChildrenDone"})

💬 Now let me read `checkChildrenDone` and `rdbSaveRio` to see the event loop's reaping logic and what the child actually writes.
  ▸ mcp__grove__source({"id":"c:src/server.c#checkChildrenDone@1416"})
  ▸ mcp__grove__source({"file":"src/rdb.c","name":"rdbSaveRio"})

💬 Let me check how `serverCron` drives the reaping loop, and how `redisFork` sets up the parent-child communication pipe.
  ▸ mcp__grove__callers({"name":"checkChildrenDone","dir":"src"})
  ▸ mcp__grove__source({"file":"src/server.c","name":"redisFork"})

💬 Now let me look at the child→parent communication channel (`sendChildCowInfo` / `receiveChildInfo`) and `rdbSaveDb` to see the CoW-aware memory dismissal.
  ▸ mcp__grove__symbols({"dir":"src","name":"sendChildCowInfo"})
  ▸ mcp__grove__symbols({"dir":"src","name":"receiveChildInfo"})
  ▸ mcp__grove__source({"file":"src/rdb.c","name":"startSaving"})

💬 Let me read the actual implementations of `sendChildCowInfo` and `receiveChildInfo`, plus `openChildInfoPipe`.
  ▸ mcp__grove__source({"id":"c:src/server.c#sendChildCowInfo@7525"})
  ▸ mcp__grove__source({"id":"c:src/childinfo.c#receiveChildInfo@150"})
  ▸ mcp__grove__symbols({"dir":"src","name":"openChildInfoPipe"})
  ▸ mcp__grove__source({"id":"c:src/childinfo.c#openChildInfoPipe@25"})
  ▸ mcp__grove__symbols({"dir":"src","name":"sendChildInfoGeneric"})
  ▸ mcp__grove__source({"id":"c:src/childinfo.c#sendChildInfoGeneric@49"})

💬 I now have a complete picture. Here is how all the pieces fit together.  ---  ## Redis BGSAVE: how the cooperating pieces fit  ### 1. Triggering the save  `B...

──────── RESULT (success, 116975ms, 23 turns) ────────
I now have a complete picture. Here is how all the pieces fit together.

---

## Redis BGSAVE: how the cooperating pieces fit

### 1. Triggering the save

`BGSAVE` arrives at `bgsaveCommand` (`src/rdb.c:4833`), which calls `rdbSaveBackground` (`src/rdb.c:2070`). That function is also called from `serverCron` when periodic-save thresholds are met.

---

### 2. The fork — what each side keeps

`rdbSaveBackground` calls `redisFork(CHILD_TYPE_RDB)` (`src/server.c:7428`). Before the actual `fork()` call, `redisFork` does two important things:

- **Opens the info pipe** (`openChildInfoPipe`, `src/childinfo.c:25`): creates `server.child_info_pipe[0]` (read end, kept by parent) and `[1]` (write end, kept by child) as a non-blocking pipe. This is the only explicit communication channel between the two processes.
- **Quiesces module threads** via `REDISMODULE_EVENT_FORK_CHILD_PRE` so no background thread holds the allocator lock at fork time.

After `fork()` returns:

**Parent side** records `server.child_pid`, `server.child_type = CHILD_TYPE_RDB`, and `server.dirty_before_bgsave` (a snapshot of the dirty counter), then returns immediately to the event loop. The server keeps accepting and executing client commands as if nothing happened.

**Child side** closes the pipe's read end, renames its process to `redis-rdb-bgsave`, sets CPU affinity, and calls `rdbSave`.

Because of the OS's **copy-on-write** semantics, both processes start with the same physical memory pages. The child holds a frozen logical snapshot of the dataset at the instant of fork. Pages that the parent subsequently modifies are duplicated by the kernel on demand; the child never sees those changes.

---

### 3. What the child writes

`rdbSave` (`src/rdb.c:2027`) names a temp file `temp-<child-pid>.rdb` and delegates to `rdbSaveInternal` → `rdbSaveRio` (`src/rdb.c:1880`).

`rdbSaveRio` writes a self-contained binary stream:

1. `REDIS<version>` magic header
2. Aux fields (server info, replication offset, etc.)
3. Module auxiliary data
4. Scripting/function definitions
5. For each database: all key-value pairs via `rdbSaveDb` (type opcode, key, expiry if present, encoded value)
6. `RDB_OPCODE_EOF` terminator
7. CRC64 checksum of the entire payload

After each database is written, the child calls `dismissKvstoreBucketsMemory` to release the CoW-dirtied bucket arrays back to the OS, actively shrinking the child's RSS.

`rdbSaveInternal` (`src/rdb.c:1956`) wraps the I/O with incremental `fsync` (every `REDIS_AUTOSYNC_BYTES` bytes if configured), then a final `fflush` + `fsync` + optional `posix_fadvise(DONTNEED)` to reclaim page cache.

Back in `rdbSave`, if everything succeeded:

```c
rename(tmpfile, filename);   // atomic: file is either complete or absent
fsyncFileDir(filename);      // flush the directory entry
```

The rename is the **atomicity guarantee** — a crash between write and rename leaves only the temp file; the previous dump.rdb is never overwritten with a partial file.

---

### 4. Reporting progress and final status

**During the save** the child periodically calls `sendChildInfoGeneric` (`src/childinfo.c:49`), which:
- calls `zmalloc_get_private_dirty(-1)` to measure CoW overhead (throttled — each reading is expensive)
- packs the result into a `child_info_data` struct and `write()`s it down `child_info_pipe[1]`

The parent reads these in `serverCron` (indirectly via the `receiveChildInfo` path) to update stats like `stat_current_cow_bytes`.

**At the end** (after a successful `rdbSave`), the child makes one final call:

```c
sendChildCowInfo(CHILD_INFO_TYPE_RDB_COW_SIZE, "RDB");
```

Then `exitFromChild(0, 0)` — exit code 0 for success, 1 for failure. This exit is the primary completion signal.

---

### 5. How the parent detects completion

`serverCron` (`src/server.c:1695`) calls `checkChildrenDone()` on every timer tick (every 1–100 ms depending on load). `checkChildrenDone` (`src/server.c:1416`) does:

```c
waitpid(-1, &statloc, WNOHANG);   // never blocks
```

When the child has exited, `waitpid` returns its pid. The exit code and signal are extracted from `statloc`. Because `child_type == CHILD_TYPE_RDB`, it calls:

```c
backgroundSaveDoneHandler(exitcode, bysignal);   // dispatch
receiveChildInfo();                               // drain the pipe for final CoW stats
resetChildState();                               // clear child_pid/child_type, close pipe
```

---

### 6. Finalization

`backgroundSaveDoneHandler` (`src/rdb.c:4605`) dispatches to `backgroundSaveDoneHandlerDisk` (`src/rdb.c:4544`), which reconciles server state:

| Outcome | What happens |
|---|---|
| Clean exit (code 0) | `server.dirty -= server.dirty_before_bgsave` — subtracts only the mutations that existed at fork time; changes made after the fork are preserved in the counter. `server.lastsave` updated. `lastbgsave_status = C_OK`. |
| Non-zero exit | `lastbgsave_status = C_ERR`, `stat_rdb_consecutive_failures++`. |
| Killed by signal | Temp file removed by `rdbRemoveTempFile`. SIGUSR1 is whitelisted (used for clean abort) and does not set error status. |

After the type-specific handler, `backgroundSaveDoneHandler` clears `rdb_child_type`, records `rdb_save_time_last`, and calls `updateSlavesWaitingBgsave` — which checks whether any replica was waiting for a `BGSAVE` to complete before receiving a bulk transfer (the first phase of replication sync), and if so, begins streaming the new dump to them.

---

### The full flow in one picture

```
BGSAVE command
     │
     ▼
rdbSaveBackground()
  ├─ openChildInfoPipe()          ← non-blocking pipe between processes
  ├─ fork()
  │    ├─ [parent] records child_pid, dirty_before_bgsave → returns to event loop
  │    └─ [child]  closes pipe read-end
  │
  │  [child runs independently]
  │  rdbSave()
  │    ├─ open temp-<pid>.rdb
  │    ├─ rdbSaveRio()            ← full serialized snapshot of CoW memory
  │    │    └─ rdbSaveDb() x N   ← per-db key/value iteration + CoW page dismissal
  │    ├─ fflush / fsync
  │    ├─ rename(tmp → dump.rdb) ← atomic swap
  │    ├─ fsyncFileDir()
  │    └─ sendChildCowInfo()     ← final CoW stats down the pipe
  │  exitFromChild(0)
  │
  │  [parent, every serverCron tick]
  ▼
checkChildrenDone()
  ├─ waitpid(WNOHANG)            ← non-blocking poll
  ├─ backgroundSaveDoneHandler()
  │    └─ backgroundSaveDoneHandlerDisk()
  │         ├─ dirty -= dirty_before_bgsave
  │         └─ lastsave / lastbgsave_status updated
  ├─ receiveChildInfo()          ← drain pipe, update CoW stats
  ├─ resetChildState()           ← close pipe, clear child_pid
  └─ updateSlavesWaitingBgsave() ← kick off replication bulk transfers
```

The essential design insight: the parent never blocks because the OS CoW mechanism gives the child a free frozen snapshot. The only coordination at runtime is a unidirectional pipe for observability stats. The only synchronization at completion is a `WNOHANG` waitpid poll in the event loop, and the final exit code.
