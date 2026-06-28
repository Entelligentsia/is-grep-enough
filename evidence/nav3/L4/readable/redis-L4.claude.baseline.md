# transcript: I'm studying how Redis produces a point-in-time snapshot of the dataset to disk without blocking the server from serving clients. I need to understand how th...


💬 I'll read the key files concurrently to map out the full flow.
  ▸ Bash(grep -n "bgsave\|rdbSave\|rdbSaveBackground\|backgroundSave\|BGSAVE\|rdb_child\|checkChildrenDone\|rdbSaveDone\|RDB_CHILD\|saveDone\|waitpid\|SIGCHLD\|pipe\|...)
  ▸ Bash(grep -n "bgsave\|rdbSave\|rdbSaveBackground\|backgroundSave\|BGSAVE\|rdb_child\|checkChildrenDone\|rdbSaveDone\|RDB_CHILD\|saveDone\|waitpid\|SIGCHLD\|pipe\|...)
  ▸ Bash(grep -n "rdbSaveBackground\|bgsaveCommand\|openChildInfoPipe\|sendChildInfo\|receiveChildInfo\|child_info_pipe\|CHILD_TYPE_RDB\|fork\b" /home/bench/repos/red...)
  ▸ Bash(grep -n "bgsaveCommand\|rdbSaveBackground\|openChildInfoPipe\|sendChildInfo\|receiveChildInfo\|child_info_pipe\|backgroundSaveDoneHandler\|CHILD_TYPE_RDB\|fo...)

💬 Now let me read the key function bodies directly.
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Bash(grep -n "^void bgsaveCommand\|^int rdbSaveBackground\|^void backgroundSaveDoneHandler\|^void checkChildrenDone\|^int rdisFork\|^int redisFork\|^void openChil...)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)
  ▸ Read(/home/bench/repos/redis/src/childinfo.c)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Bash(grep -n "^int rdbSave\b\|^static int rdbSave\b" /home/bench/repos/redis/src/rdb.c)
  ▸ Bash(grep -n "backgroundSaveDoneHandlerDisk\|rename.*rdb\|server.dirty\b" /home/bench/repos/redis/src/rdb.c | head -40)
  ▸ Read(/home/bench/repos/redis/src/rdb.c)
  ▸ Read(/home/bench/repos/redis/src/server.c)

💬 Now I have the full picture. Here is a precise walkthrough of every cooperating piece.  ---  ## How Redis BGSAVE works end-to-end  ### 1. Launching the save ...

──────── RESULT (success, 111393ms, 19 turns) ────────
Now I have the full picture. Here is a precise walkthrough of every cooperating piece.

---

## How Redis BGSAVE works end-to-end

### 1. Launching the save

**Entry point: `bgsaveCommand`** (`src/rdb.c:4833`)

When a client sends `BGSAVE`, or `serverCron` fires the auto-save trigger (based on `saveparams` thresholds checked at `src/server.c:1699`), the flow is:

```
bgsaveCommand (rdb.c:4833)
  └─ rdbSaveBackground (rdb.c:2070)
       └─ redisFork(CHILD_TYPE_RDB) (server.c:7428)
```

`bgsaveCommand` checks for three cases:
- An RDB child already running → error reply.
- Another child type running (AOF rewrite, module fork) → either error or set `server.rdb_bgsave_scheduled = 1` if `SCHEDULE` was passed.
- No active child → call `rdbSaveBackground`.

---

### 2. Forking — `redisFork` (`src/server.c:7428`)

Before calling `fork(2)`, `redisFork`:

1. Fires `REDISMODULE_EVENT_FORK_CHILD_PRE` so any multi-threaded modules can quiesce their background threads (a thread holding a lock at `fork` time would deadlock the child).
2. Calls **`openChildInfoPipe`** (`src/childinfo.c:25`): creates a non-blocking Unix pipe (`server.child_info_pipe[0]` = read end in parent, `[1]` = write end in child).
3. Calls `fork()`.

After the fork returns:
- **Child** closes the read end of the pipe, sets `server.in_fork_child`, installs signal handlers, and adjusts the OOM score.
- **Parent** records the child PID in `server.child_pid`, sets `server.child_type = CHILD_TYPE_RDB`, notes `server.dirty_before_bgsave = server.dirty`, and returns to the event loop immediately — **no blocking**.

The OS delivers **copy-on-write (CoW)** semantics: both parent and child start sharing the same physical memory pages. The parent continues serving reads and writes; any page it modifies gets its own private copy. The child sees the snapshot as it was at fork time, without holding any lock.

---

### 3. Child: writing the snapshot — `rdbSave` (`src/rdb.c:2027`)

```
rdbSaveBackground (child branch)
  └─ rdbSave (rdb.c:2027)
       └─ rdbSaveInternal → rdbSaveRio (rdb.c:1880)
            └─ rdbSaveDb (per database) → rdbSaveKeyValuePair (per key)
```

Key details inside the child:

- **Temp file**: `rdbSave` writes to `temp-<pid>.rdb`, not the live filename. The final `rename(tmpfile, filename)` at `rdb.c:2041` is atomic at the filesystem level — the old `.rdb` file stays valid until the rename completes.
- **`fsync` of directory**: after the rename, `fsyncFileDir` is called to flush the directory entry to disk.
- **Progress heartbeat**: inside `rdbSaveDb` (`rdb.c:1855`), every 1024 keys the child checks elapsed time; if ≥1 second has passed it calls `sendChildInfo(CHILD_INFO_TYPE_CURRENT_INFO, key_counter, "RDB")`.
- **CoW hints**: after serialising each key, the child calls `dismissObject` (`rdb.c:1850`) — an `madvise(MADV_FREE/DONTNEED)` hint telling the kernel it can reclaim the page. This reduces CoW pressure because the parent no longer needs to copy a page that the child itself has "released".
- **Final CoW report**: on success, `sendChildCowInfo(CHILD_INFO_TYPE_RDB_COW_SIZE, "RDB")` sends the peak CoW measurement to the parent.
- **Exit**: `exitFromChild(0, 0)` — exit code 0 = success, 1 = error.

Note: `rdbSave` also sets `server.dirty = 0` and `server.lastsave`, but these assignments are inside the child's CoW copy and have **no effect on the parent's memory**.

---

### 4. In-flight progress — `child_info_pipe` (`src/childinfo.c`)

The pipe carries `child_info_data` structs:

```c
typedef struct {
    size_t keys;       // keys processed so far
    size_t cow;        // current CoW bytes (from zmalloc_get_private_dirty)
    monotime cow_updated;
    double progress;
    childInfoType information_type;
} child_info_data;
```

**Child side** — `sendChildInfoGeneric` (`childinfo.c:49`):
- Reads CoW size via `zmalloc_get_private_dirty(-1)` (expensive — throttled by `CHILD_COW_DUTY_CYCLE`).
- Writes the fixed-size struct to the write-end of the pipe.
- If `write()` fails (parent died), the child logs and exits.

**Parent side** — `receiveChildInfo` (`childinfo.c:150`):
- Called periodically from `serverCron` (`server.c:1694`) via `run_with_period(1000)` while a child is active.
- Drains the pipe in a loop (handling short reads via a static buffer).
- Calls `updateChildInfo` which updates `server.stat_current_cow_bytes`, `server.stat_current_save_keys_processed`, etc. — these feed `INFO persistence`.

---

### 5. Detecting completion — `checkChildrenDone` (`src/server.c:1416`)

Called every `serverCron` tick (100ms by default) while `hasActiveChildProcess()` is true:

```c
pid = waitpid(-1, &statloc, WNOHANG);  // non-blocking
```

`WNOHANG` means this never blocks the event loop. When the child has exited:

1. Extracts `exitcode` and `bysignal` from `statloc`.
2. If `pid == server.child_pid` and `child_type == CHILD_TYPE_RDB` → calls **`backgroundSaveDoneHandler`**.
3. If exit was clean (`!bysignal && exitcode == 0`) → calls `receiveChildInfo()` one final time to drain any remaining pipe data.
4. Calls `resetChildState()` to clear `server.child_pid`, `server.child_type`, and close the pipe.

---

### 6. Finalising — `backgroundSaveDoneHandler` / `backgroundSaveDoneHandlerDisk` (`src/rdb.c:4605`, `4544`)

On **success** (`exitcode == 0`, no signal):

```c
server.dirty = server.dirty - server.dirty_before_bgsave;
server.lastsave = save_end;
server.lastbgsave_status = C_OK;
server.stat_rdb_consecutive_failures = 0;
```

The dirty counter subtraction is the key insight: `dirty_before_bgsave` was snapshotted just before `fork`. Any writes that arrived *during* the save incremented `server.dirty` in the parent. Subtracting `dirty_before_bgsave` leaves only those post-fork mutations, so the server correctly knows data has changed since the last snapshot.

On **signal termination**: `rdbRemoveTempFile(server.child_pid)` is called to clean up the partial temp file. SIGUSR1 is whitelisted (used by `killRDBChild`) and does not set `lastbgsave_status = C_ERR`.

Finally, `updateSlavesWaitingBgsave` is called (`rdb.c:4628`) — if any replica was waiting for a BGSAVE to begin a full sync, this hands them the freshly written RDB file.

---

### The complete picture

```
CLIENT / serverCron
      │
      ▼
bgsaveCommand  ──►  rdbSaveBackground
                          │
                    redisFork()  ──── openChildInfoPipe()
                     /        \
              PARENT             CHILD (fork'd)
              returns            │
              to event loop      rdbSave()
              |                  │  writes temp-<pid>.rdb
              |                  │  per-key: dismissObject() (CoW hint)
              |                  │  every ~1s: sendChildInfo() ──► pipe
              |                  │
              |  serverCron      rename(tmp, dump.rdb)  [atomic]
              |  receiveChildInfo() ◄── pipe (CoW/progress stats)
              |  checkChildrenDone() → waitpid(WNOHANG)
              |                  │
              |                  exitFromChild(0)
              |                  │
              └──── waitpid returns pid ──────────────────┘
                          │
                    backgroundSaveDoneHandlerDisk()
                      server.dirty -= dirty_before_bgsave
                      server.lastsave = now
                      server.lastbgsave_status = C_OK
                          │
                    receiveChildInfo()  (drain final pipe data)
                    resetChildState()  (close pipe, clear child_pid/type)
                    updateSlavesWaitingBgsave()  (notify replicas)
```

The central design principle is that `fork` + OS copy-on-write makes the snapshot consistent at zero cost to the main thread — the child inherits a frozen view of memory at fork time. The only communication channel the kernel provides back from child to parent is the exit code (success/failure) plus the explicit `child_info_pipe` for richer progress telemetry.
