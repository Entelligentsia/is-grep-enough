# transcript: I'm studying how Redis produces a point-in-time snapshot of the dataset to disk without blocking the server from serving clients. I need to understand how th...


💬 I'll trace the full background-save pipeline using the LSP tool, starting from the launch function and following the chain.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(rdbSaveBackground)
  ▸ LSP(backgroundSaveDoneHandler)

💬 LSP is still indexing for some symbols. Let me anchor using the known location of `backgroundSaveDoneHandler` and read around the key functions.
  ▸ LSP(rdbSaveBackground)
  ▸ LSP(checkChildrenDone)
  ▸ Bash(grep -n "rdbSaveBackground\b" /home/bench/repos/redis/src/rdb.c | head -20)

💬 Good. Now let me read all four key pieces in parallel.
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)

💬 Now let me look at `serverCron` calling `checkChildrenDone`, the `redisFork` COW setup, the progress-reporting pipe (`sendChildCowInfo`/`receiveChildInfo`), ...
  ▸ LSP(sendChildCowInfo)
  ▸ LSP(receiveChildInfo)
  ▸ LSP(redisFork)
  ▸ LSP(rdbSave)
  ▸ Bash(grep -n "checkChildrenDone" /home/bench/repos/redis/src/server.c | head -10)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/childinfo.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Now let me look at the progress-reporting mechanism (the child info pipe) and `rdbSaveInternal`.
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/childinfo.c)

💬 Now let me read `rdbSaveRio` to see the structure of what the child writes, and also look at how `serverCron` triggers `saveparams` auto-saves.
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 I now have the complete picture. Here is how all four pieces fit together.  ---  ## Redis BGSAVE: How the cooperating pieces fit together  ### 1. Launching t...

──────── RESULT (success, 129186ms, 24 turns) ────────
I now have the complete picture. Here is how all four pieces fit together.

---

## Redis BGSAVE: How the cooperating pieces fit together

### 1. Launching the background save

The trigger lives in `serverCron` (`server.c:1699`). Every pass of the cron loop, when no child is already running, it walks `server.saveparams` — the list of `save <seconds> <changes>` thresholds from redis.conf. If `server.dirty >= sp->changes` and enough time has elapsed since the last successful save, it calls:

```
rdbSaveBackground(SLAVE_REQ_NONE, server.rdb_filename, rsiptr, RDBFLAGS_NONE)
    src/rdb.c:2070
```

`rdbSaveBackground` first guards against a double fork with `hasActiveChildProcess()`, snapshots `server.dirty_before_bgsave = server.dirty` (needed later to adjust the dirty counter), then calls `redisFork(CHILD_TYPE_RDB)` (`server.c:7428`).

`redisFork` does several things before the actual `fork()`:
- Fires `REDISMODULE_SUBEVENT_FORK_CHILD_PRE` so multi-threaded modules can reach a fork-safe point (a background thread holding the allocator lock at `fork()` time would deadlock the child).
- Calls `openChildInfoPipe()` which creates a non-blocking Unix pipe (`server.child_info_pipe[0]` read end / `[1]` write end) — the progress channel used throughout the save.

After `fork()` returns, the **parent** records `server.child_pid`, `server.child_type = CHILD_TYPE_RDB`, resets all the COW stats, snapshots `dbTotalServerKeyCount()` as the denominator for progress, and returns to the event loop without blocking. `server.rdb_child_type = RDB_CHILD_TYPE_DISK` is set back in `rdbSaveBackground`.

---

### 2. The division of work: Copy-on-Write

The key mechanism is the OS's copy-on-write fork semantics. At `fork()` time both parent and child share all memory pages. The child sees a **frozen point-in-time snapshot** of the dataset for free — no explicit copying is needed.

The parent continues serving clients. When it modifies a memory page (a write to any key), the OS transparently copies that page for the parent. The child's view stays frozen at the fork instant. This is why BGSAVE doesn't block clients: clients are served by the parent, writes are absorbed by COW page faults, and the child walks the original data undisturbed.

**Child's work** (`rdb.c:2082-2089`):
1. Renames itself to `redis-rdb-bgsave` (visible in `ps`).
2. Calls `rdbSave()` → `rdbSaveInternal()` → `rdbSaveRio()` writing to a temp file `temp-{pid}.rdb`.
3. `rdbSaveRio` (`rdb.c:1880`) writes the file in a single sequential pass:
   - 9-byte magic header `REDIS{version}`
   - Aux fields (server version, replication id, etc.)
   - Lua functions
   - All databases in order via `rdbSaveDb()`, which iterates every key-value pair writing type byte, optional expiry, and the encoded value
   - After each DB is written, calls `dismissKvstoreBucketsMemory()` to `MADV_DONTNEED` the hash-table bucket arrays — the child will never touch them again, and this gives those pages back to the OS, **reducing the amount of COW pressure on the parent**
   - EOF opcode + CRC64 checksum
4. After `rdbSaveRio` returns, `rdbSave` does `fsync`, then an **atomic `rename(tmpfile, filename)`** — the live RDB file is never partially-written from another process's perspective.
5. On success, calls `sendChildCowInfo(CHILD_INFO_TYPE_RDB_COW_SIZE, "RDB")` to push a final progress message.
6. Calls `exitFromChild(0, 0)`.

---

### 3. Progress and completion signalling: the child-info pipe

**While running**, the child calls `sendChildInfoGeneric()` (`childinfo.c:49`) periodically. This function:
- Reads the child's private dirty memory (`zmalloc_get_private_dirty(-1)`) — this is exactly the COW overhead: bytes copied from the original mapping into the child's private pages.
- Throttles this expensive call via an adaptive duty-cycle (`CHILD_COW_DUTY_CYCLE`) so it doesn't slow down saving.
- Writes a fixed-size `child_info_data` struct to `server.child_info_pipe[1]` containing `{keys, cow, cow_updated, progress, information_type}`.

**The parent** polls the pipe in `serverCron` every 1000 ms (`server.c:1694`):
```c
run_with_period(1000) receiveChildInfo();
checkChildrenDone();
```

`receiveChildInfo()` (`childinfo.c:150`) drains all available messages from the pipe and calls `updateChildInfo()` which updates `server.stat_current_cow_bytes`, `stat_current_save_keys_processed`, etc. These feed the `INFO persistence` and `INFO stats` output so operators can watch COW size grow in real time.

**Completion** is signalled purely by the child exiting. `checkChildrenDone()` (`server.c:1416`) calls:
```c
waitpid(-1, &statloc, WNOHANG)
```
`WNOHANG` makes this a non-blocking poll — if the child hasn't exited yet it returns immediately so the event loop isn't stalled. When the child has exited, `WEXITSTATUS(statloc)` gives exit code 0 (success) or 1 (error).

---

### 4. Finalization in the parent

`checkChildrenDone()` sees `server.child_type == CHILD_TYPE_RDB` and calls:
```
backgroundSaveDoneHandler(exitcode, bysignal)   src/rdb.c:4605
```

This dispatches to `backgroundSaveDoneHandlerDisk()` (`rdb.c:4544`) which handles all three outcomes:

| Outcome | What happens |
|---|---|
| Success (exitcode == 0) | `server.dirty -= dirty_before_bgsave` (only count mutations *after* fork), `server.lastsave = now`, `server.lastbgsave_status = C_OK`, reset consecutive-failure counter |
| Error (exitcode != 0) | `server.lastbgsave_status = C_ERR`, increment `stat_rdb_consecutive_failures` |
| Killed by signal | `rdbRemoveTempFile()` deletes the partial file; if the signal was `SIGUSR1` (the deliberate kill signal) it's not counted as an error |

Back in `backgroundSaveDoneHandler`, after the disk-specific handler returns:
- `server.rdb_child_type = RDB_CHILD_TYPE_NONE`
- `server.rdb_save_time_last` is updated
- `updateSlavesWaitingBgsave()` is called — any replicas that were waiting on this RDB (for the initial bulk sync) are now unblocked

Back in `checkChildrenDone()`, after the handler returns:
- `receiveChildInfo()` is called one final time to drain any last pipe message (the child's final COW report)
- `resetChildState()` clears `server.child_pid / child_type`
- `replicationStartPendingFork()` kicks off any replication fork that was queued while this save was running

---

### The full flow at a glance

```
serverCron (every ~1ms)
  └─ saveparams threshold met
       └─ rdbSaveBackground()
            ├─ redisFork()
            │    ├─ openChildInfoPipe()     ← opens progress channel
            │    └─ fork()
            │
            ├─ PARENT: returns to event loop, serves clients
            │    serverCron (every 1s while child alive):
            │      receiveChildInfo()       ← reads COW+progress from pipe
            │      checkChildrenDone()      ← waitpid(WNOHANG)
            │
            └─ CHILD: rdbSave()
                 └─ rdbSaveInternal()
                      └─ rdbSaveRio()       ← walks all keys under COW snapshot
                           sendChildCowInfo()  ← final pipe write
                           exitFromChild(0)    ← triggers waitpid() to fire

checkChildrenDone() sees child exited
  └─ backgroundSaveDoneHandler()
       └─ backgroundSaveDoneHandlerDisk()  ← adjusts dirty, lastsave, status
       └─ updateSlavesWaitingBgsave()      ← unblocks waiting replicas
       └─ receiveChildInfo()               ← drain final pipe message
       └─ resetChildState()
```

The three communication channels are:
1. **COW + fork semantics** — the child reads the dataset; the parent mutates its own pages independently. No explicit synchronization needed.
2. **The child-info pipe** — one-way write-only from child to parent; carries live COW byte count and key progress during the save.
3. **`waitpid`** — the OS mechanism that delivers the exit code when the child terminates; polled non-blocking by `checkChildrenDone` on every cron tick.
