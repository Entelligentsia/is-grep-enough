# redis · L2 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **redis** (c) @ `d2d3390d0`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | redis (c) · L2 |
| pinned source | `d2d3390d0c4d01ab7bfb46054ad0d5003d63c11b` |
| status | completed |
| engagement | `grove_tools = 18` (gate: > 0 → ✓ used its capability) |
| turns | 21 |
| wall clock | 108 s |
| context (peak) | 296,295 tokens |
| cost (billed) | $0.2801 |
| &nbsp;&nbsp;↳ token split | in 18 · out 5,672 · cache-create 18,489 · cache-read 277,788 |
| tool calls | 20 (mcp__grove__source×15, mcp__grove__symbols×2, ToolSearch×1, mcp__grove__callers×1, Read×1) |
| evidence | `evidence/nav3/L2/raw/redis-L2.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To predict when a key that is already past its TTL actually gets removed during ordinary request handling — as opposed to by the background expiry sweep — I need to understand the routine that performs the on-access "is this key expired, and should it be deleted now" check, together with the command-handling places that call into it. Help me see where that check fires during normal keyspace access and what the various callers do with its outcome.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me load the grove tools and start with the expiry subsystem.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__outline)`
&nbsp;&nbsp;▸ `mcp__grove__source(expireIfNeeded)`
&nbsp;&nbsp;▸ `mcp__grove__callers(expireIfNeeded)`

💬 `expireIfNeeded` is defined in `src/db.c`. Let me pull its source alongside `lookupKey`, which is its primary on-access caller.

&nbsp;&nbsp;▸ `mcp__grove__source(expireIfNeeded)`
&nbsp;&nbsp;▸ `mcp__grove__source(lookupKey)`

💬 There are two `expireIfNeeded` symbols — let me read both, and also grab the flag constants at lines 36–48.

&nbsp;&nbsp;▸ `mcp__grove__source(c:src/db.c#expireIfNeeded@50)`
&nbsp;&nbsp;▸ `mcp__grove__source(c:src/db.c#expireIfNeeded@2935)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/redis/src/db.c)`

💬 Now let me pull the three other `db.c` callers to see how each handles the result.

&nbsp;&nbsp;▸ `mcp__grove__source(dbRandomKey)`
&nbsp;&nbsp;▸ `mcp__grove__source(delGenericCommand)`
&nbsp;&nbsp;▸ `mcp__grove__source(scanCallback)`

💬 Good picture forming. Now let me check the `lookupKeyRead`/`lookupKeyWrite` wrappers that commands actually call, and `keyIsExpired` to complete the chain.

&nbsp;&nbsp;▸ `mcp__grove__source(lookupKeyReadWithFlags)`
&nbsp;&nbsp;▸ `mcp__grove__source(lookupKeyWriteWithFlags)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(keyIsExpired)`
&nbsp;&nbsp;▸ `mcp__grove__source(c:src/db.c#keyIsExpired@2877)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(deleteExpiredKeyAndPropagate)`
&nbsp;&nbsp;▸ `mcp__grove__source(c:src/db.c#deleteExpiredKeyAndPropagate@2826)`
&nbsp;&nbsp;▸ `mcp__grove__source(lookupKeyRead)`
&nbsp;&nbsp;▸ `mcp__grove__source(lookupKeyWrite)`

💬 One more — `deleteKeyAndPropagate` to see what the actual deletion does.

&nbsp;&nbsp;▸ `mcp__grove__source(deleteKeyAndPropagate)`

💬 Now I have the complete picture. Here's how the on-access expiry check works end to end.

---

## The lazy-expiry chain during request handling

### 1. The gateway: `lookupKey` (`src/db.c:279`)

Every command that accesses the keyspace goes through one of two thin wrappers:

```
lookupKeyRead(db, key)          →  lookupKey(db, key, LOOKUP_NONE, NULL)
lookupKeyWrite(db, key)         →  lookupKey(db, key, LOOKUP_WRITE, NULL)
lookupKeyReadWithFlags(...)     →  lookupKey(db, key, flags, NULL)
lookupKeyWriteWithFlags(...)    →  lookupKey(db, key, flags|LOOKUP_WRITE, NULL)
```

`lookupKey` itself does a raw hash-table probe (`dbFindByLink`), then translates `LOOKUP_*` flags into `EXPIRE_*` flags before calling `expireIfNeeded`:

| `LOOKUP_*` flag | becomes | `EXPIRE_*` flag |
|---|---|---|
| `LOOKUP_WRITE` (and not a read-only replica) | → | `EXPIRE_FORCE_DELETE_EXPIRED` |
| `LOOKUP_NOEXPIRE` | → | `EXPIRE_AVOID_DELETE_EXPIRED` |
| `LOOKUP_ACCESS_EXPIRED` | → | `EXPIRE_ALLOW_ACCESS_EXPIRED` |
| `LOOKUP_ACCESS_TRIMMED` | → | `EXPIRE_ALLOW_ACCESS_TRIMMED` |

The `LOOKUP_WRITE` → `EXPIRE_FORCE_DELETE_EXPIRED` translation is the most important one. It means write commands unconditionally delete expired keys, while read commands on a replica can choose not to.

If `expireIfNeeded` returns anything other than `KEY_VALID`, `lookupKey` sets `val = NULL` and returns a miss (increments `stat_keyspace_misses`, fires a `keymiss` keyspace notification). If the key is still alive, LRU/LFU is updated and `stat_keyspace_hits` is incremented.

---

### 2. The decision function: `expireIfNeeded` (`src/db.c:2935`)

Returns a `keyStatus` enum (defined at `src/db.c:43`):

```c
KEY_VALID   // key is alive; caller may use it
KEY_EXPIRED // logically expired, but NOT deleted this call
KEY_DELETED // was expired and was deleted right now
KEY_TRIMMED // in a cluster slot being trimmed
```

Its decision tree, in order:

**a. Cluster slot trimming** — if the key's slot is being trimmed, return `KEY_VALID` or `KEY_TRIMMED` based on `EXPIRE_ALLOW_ACCESS_TRIMMED` and cluster ownership. No expiry processing.

**b. Actually expired?** — calls `keyIsExpired(db, key_name, kv)` (`src/db.c:2877`):
```c
mstime_t when = getExpire(db, key, kv);
if (when < 0) return 0;                     // no TTL at all
return commandTimeSnapshot() > when;         // virtual clock, fixed per command
```
`commandTimeSnapshot()` returns a time that is frozen for the entire duration of the current command, so two lookups of the same key within one command always agree. If `EXPIRE_ALLOW_ACCESS_EXPIRED` is set, or the key is not yet expired, return `KEY_VALID` immediately.

**c. Replica / cluster-import guard** — if `server.masterhost != NULL` (we are a replica):
- The current client is a `CLIENT_MASTER` (we're replaying commands from the primary) → return `KEY_VALID` (don't expire; the primary controls the timeline).
- Otherwise, if `EXPIRE_FORCE_DELETE_EXPIRED` is not set → return `KEY_EXPIRED` without deleting. Replicas shadow-expire without removing, waiting for the primary's synthesized `DEL`.

**d. Configuration gate** — `confAllowsExpireDel()` can be false in certain states (e.g. loading). If it returns false and the caller didn't force-delete, return `KEY_EXPIRED`.

**e. `EXPIRE_AVOID_DELETE_EXPIRED`** — caller explicitly asked not to delete (e.g. `LOOKUP_NOEXPIRE`). Return `KEY_EXPIRED`.

**f. Pause gate** — if expiry actions are paused (`isPausedActionsWithUpdate(PAUSE_ACTION_EXPIRE)`), return `KEY_EXPIRED`. The pause is typically used during a failover; the new primary will send a DEL.

**g. Delete** — none of the above fired, so the key is deleted now via `deleteExpiredKeyAndPropagate(db, key)`, which calls `deleteKeyAndPropagate` (`src/db.c:2775`):
1. `dbGenericDelete` — removes from the hash table; respects `lazyfree-lazy-expire` (sync vs async free).
2. `notifyKeyspaceEvent(NOTIFY_EXPIRED, "expired", ...)` — fires the `expired` keyspace event.
3. `keyModified(...)` — triggers client-side caching (CSC) invalidation messages.
4. `propagateDeletion(...)` — writes a `DEL` to the AOF and forwards to replicas.
5. `server.stat_expiredkeys++`

Returns `KEY_DELETED`.

---

### 3. The other callers

**`dbRandomKey` (`src/db.c:808`)** — serves the `RANDOMKEY` command. Loops picking random entries; calls `expireIfNeeded(db, keyobj, kv, 0)` (no flags — no force-delete). If the result is not `KEY_VALID`, discards the candidate and loops. Safety valve: if the entire DB is volatile and we're on a replica (where `expireIfNeeded` never deletes), it gives up after 100 tries and returns a key that may be logically expired to avoid an infinite loop.

**`delGenericCommand` (`src/db.c:1415`)** — serves `DEL` / `UNLINK`. For each argument, calls `expireIfNeeded(c->db, c->argv[j], NULL, 0)` with no flags before attempting the explicit deletion. If the result is `KEY_DELETED` (the key was already expired and got cleaned up as a side effect of this call), it skips the `dbSyncDelete`/`dbAsyncDelete` and does not count that key in the returned deletion count. This prevents double-counting.

**`scanCallback` (`src/db.c:1702`)** — called per entry during `SCAN` iteration over the keyspace. Calls `expireIfNeeded(data->db, NULL, kv, 0)` with no flags. Any result other than `KEY_VALID` causes an early `return` — the key is silently filtered out of the `SCAN` output. This means `SCAN` lazily expires (and on a primary, deletes) keys as it walks the dict, so expired keys are never returned to the client.

---

### Summary of outcomes by call site

| Call site | Flags passed | On master, expired key | On replica, expired key |
|---|---|---|---|
| `lookupKeyRead` | `LOOKUP_NONE` | Deleted → `NULL` returned | `KEY_EXPIRED`, not deleted → `NULL` returned |
| `lookupKeyWrite` | `LOOKUP_WRITE` → `EXPIRE_FORCE_DELETE_EXPIRED` | Deleted → `NULL` returned | Also deleted (writable replica) or `KEY_EXPIRED` (read-only replica) |
| `RANDOMKEY` (`dbRandomKey`) | `0` | Deleted, loop continues | `KEY_EXPIRED`, loop continues (with 100-try escape hatch) |
| `DEL`/`UNLINK` (`delGenericCommand`) | `0` | Deleted as side-effect, not counted again | `KEY_EXPIRED`, falls through to explicit delete path |
| `SCAN` (`scanCallback`) | `0` | Deleted, key filtered from output | `KEY_EXPIRED`, key filtered from output |

The key design principle: **`KEY_EXPIRED` means "treat as missing but don't touch storage"** — used wherever the server cannot or should not be the one to remove the key (replicas deferring to the primary, paused expiry, `LOOKUP_NOEXPIRE`). **`KEY_DELETED` means "storage was already cleaned up this call"** — used to avoid double-work in callers like `delGenericCommand`.


## Final answer

_Result event — success, 108 s, 21 turns._

Now I have the complete picture. Here's how the on-access expiry check works end to end.

---

## The lazy-expiry chain during request handling

### 1. The gateway: `lookupKey` (`src/db.c:279`)

Every command that accesses the keyspace goes through one of two thin wrappers:

```
lookupKeyRead(db, key)          →  lookupKey(db, key, LOOKUP_NONE, NULL)
lookupKeyWrite(db, key)         →  lookupKey(db, key, LOOKUP_WRITE, NULL)
lookupKeyReadWithFlags(...)     →  lookupKey(db, key, flags, NULL)
lookupKeyWriteWithFlags(...)    →  lookupKey(db, key, flags|LOOKUP_WRITE, NULL)
```

`lookupKey` itself does a raw hash-table probe (`dbFindByLink`), then translates `LOOKUP_*` flags into `EXPIRE_*` flags before calling `expireIfNeeded`:

| `LOOKUP_*` flag | becomes | `EXPIRE_*` flag |
|---|---|---|
| `LOOKUP_WRITE` (and not a read-only replica) | → | `EXPIRE_FORCE_DELETE_EXPIRED` |
| `LOOKUP_NOEXPIRE` | → | `EXPIRE_AVOID_DELETE_EXPIRED` |
| `LOOKUP_ACCESS_EXPIRED` | → | `EXPIRE_ALLOW_ACCESS_EXPIRED` |
| `LOOKUP_ACCESS_TRIMMED` | → | `EXPIRE_ALLOW_ACCESS_TRIMMED` |

The `LOOKUP_WRITE` → `EXPIRE_FORCE_DELETE_EXPIRED` translation is the most important one. It means write commands unconditionally delete expired keys, while read commands on a replica can choose not to.

If `expireIfNeeded` returns anything other than `KEY_VALID`, `lookupKey` sets `val = NULL` and returns a miss (increments `stat_keyspace_misses`, fires a `keymiss` keyspace notification). If the key is still alive, LRU/LFU is updated and `stat_keyspace_hits` is incremented.

---

### 2. The decision function: `expireIfNeeded` (`src/db.c:2935`)

Returns a `keyStatus` enum (defined at `src/db.c:43`):

```c
KEY_VALID   // key is alive; caller may use it
KEY_EXPIRED // logically expired, but NOT deleted this call
KEY_DELETED // was expired and was deleted right now
KEY_TRIMMED // in a cluster slot being trimmed
```

Its decision tree, in order:

**a. Cluster slot trimming** — if the key's slot is being trimmed, return `KEY_VALID` or `KEY_TRIMMED` based on `EXPIRE_ALLOW_ACCESS_TRIMMED` and cluster ownership. No expiry processing.

**b. Actually expired?** — calls `keyIsExpired(db, key_name, kv)` (`src/db.c:2877`):
```c
mstime_t when = getExpire(db, key, kv);
if (when < 0) return 0;                     // no TTL at all
return commandTimeSnapshot() > when;         // virtual clock, fixed per command
```
`commandTimeSnapshot()` returns a time that is frozen for the entire duration of the current command, so two lookups of the same key within one command always agree. If `EXPIRE_ALLOW_ACCESS_EXPIRED` is set, or the key is not yet expired, return `KEY_VALID` immediately.

**c. Replica / cluster-import guard** — if `server.masterhost != NULL` (we are a replica):
- The current client is a `CLIENT_MASTER` (we're replaying commands from the primary) → return `KEY_VALID` (don't expire; the primary controls the timeline).
- Otherwise, if `EXPIRE_FORCE_DELETE_EXPIRED` is not set → return `KEY_EXPIRED` without deleting. Replicas shadow-expire without removing, waiting for the primary's synthesized `DEL`.

**d. Configuration gate** — `confAllowsExpireDel()` can be false in certain states (e.g. loading). If it returns false and the caller didn't force-delete, return `KEY_EXPIRED`.

**e. `EXPIRE_AVOID_DELETE_EXPIRED`** — caller explicitly asked not to delete (e.g. `LOOKUP_NOEXPIRE`). Return `KEY_EXPIRED`.

**f. Pause gate** — if expiry actions are paused (`isPausedActionsWithUpdate(PAUSE_ACTION_EXPIRE)`), return `KEY_EXPIRED`. The pause is typically used during a failover; the new primary will send a DEL.

**g. Delete** — none of the above fired, so the key is deleted now via `deleteExpiredKeyAndPropagate(db, key)`, which calls `deleteKeyAndPropagate` (`src/db.c:2775`):
1. `dbGenericDelete` — removes from the hash table; respects `lazyfree-lazy-expire` (sync vs async free).
2. `notifyKeyspaceEvent(NOTIFY_EXPIRED, "expired", ...)` — fires the `expired` keyspace event.
3. `keyModified(...)` — triggers client-side caching (CSC) invalidation messages.
4. `propagateDeletion(...)` — writes a `DEL` to the AOF and forwards to replicas.
5. `server.stat_expiredkeys++`

Returns `KEY_DELETED`.

---

### 3. The other callers

**`dbRandomKey` (`src/db.c:808`)** — serves the `RANDOMKEY` command. Loops picking random entries; calls `expireIfNeeded(db, keyobj, kv, 0)` (no flags — no force-delete). If the result is not `KEY_VALID`, discards the candidate and loops. Safety valve: if the entire DB is volatile and we're on a replica (where `expireIfNeeded` never deletes), it gives up after 100 tries and returns a key that may be logically expired to avoid an infinite loop.

**`delGenericCommand` (`src/db.c:1415`)** — serves `DEL` / `UNLINK`. For each argument, calls `expireIfNeeded(c->db, c->argv[j], NULL, 0)` with no flags before attempting the explicit deletion. If the result is `KEY_DELETED` (the key was already expired and got cleaned up as a side effect of this call), it skips the `dbSyncDelete`/`dbAsyncDelete` and does not count that key in the returned deletion count. This prevents double-counting.

**`scanCallback` (`src/db.c:1702`)** — called per entry during `SCAN` iteration over the keyspace. Calls `expireIfNeeded(data->db, NULL, kv, 0)` with no flags. Any result other than `KEY_VALID` causes an early `return` — the key is silently filtered out of the `SCAN` output. This means `SCAN` lazily expires (and on a primary, deletes) keys as it walks the dict, so expired keys are never returned to the client.

---

### Summary of outcomes by call site

| Call site | Flags passed | On master, expired key | On replica, expired key |
|---|---|---|---|
| `lookupKeyRead` | `LOOKUP_NONE` | Deleted → `NULL` returned | `KEY_EXPIRED`, not deleted → `NULL` returned |
| `lookupKeyWrite` | `LOOKUP_WRITE` → `EXPIRE_FORCE_DELETE_EXPIRED` | Deleted → `NULL` returned | Also deleted (writable replica) or `KEY_EXPIRED` (read-only replica) |
| `RANDOMKEY` (`dbRandomKey`) | `0` | Deleted, loop continues | `KEY_EXPIRED`, loop continues (with 100-try escape hatch) |
| `DEL`/`UNLINK` (`delGenericCommand`) | `0` | Deleted as side-effect, not counted again | `KEY_EXPIRED`, falls through to explicit delete path |
| `SCAN` (`scanCallback`) | `0` | Deleted, key filtered from output | `KEY_EXPIRED`, key filtered from output |

The key design principle: **`KEY_EXPIRED` means "treat as missing but don't touch storage"** — used wherever the server cannot or should not be the one to remove the key (replicas deferring to the primary, paused expiry, `LOOKUP_NOEXPIRE`). **`KEY_DELETED` means "storage was already cleaned up this call"** — used to avoid double-work in callers like `delGenericCommand`.

