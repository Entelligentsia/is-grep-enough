# transcript: To predict when a key that is already past its TTL actually gets removed during ordinary request handling — as opposed to by the background expiry sweep — I ...


💬 Let me load the LSP tool and start with a symbol lookup for the on-access expiry check.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(expireIfNeeded)

💬 The index may still be warming. Let me read `expire.c` to anchor a position for `expireIfNeeded`, then use LSP operations from there.
  ▸ Bash(grep -n "expireIfNeeded" /home/bench/repos/redis/src/expire.c | head -30)
  ▸ Bash(grep -rn "expireIfNeeded" /home/bench/repos/redis/src/ | head -40)

💬 The function is defined at `db.c:2935`. Let me read the definition and its key callers.
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)

💬 Good. Now let me read the context around each of the four call sites.
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)

💬 Now let me find the public wrappers (`lookupKeyRead`, `lookupKeyWrite`) that commands actually call, and the `keyIsExpired` function.
  ▸ Bash(grep -n "^kvobj \*lookupKey\|^void lookupKey\|^robj \*lookupKey" /home/bench/repos/redis/src/db.c | head -20)
  ▸ Bash(grep -n "keyIsExpired" /home/bench/repos/redis/src/db.c | head -20)
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)

💬 Let me also quickly check `deleteExpiredKeyAndPropagate` to complete the deletion side.
  ▸ Bash(grep -n "deleteExpiredKeyAndPropagate" /home/bench/repos/redis/src/db.c | head -10)
  ▸ Read(/home/bench/repos/redis/src/db.c)

💬 Now I have the complete picture. Here is a precise walkthrough of the entire mechanism.  ---  ## The on-access expiry check  ### The two-layer design  **`key...

──────── RESULT (success, 117275ms, 17 turns) ────────
Now I have the complete picture. Here is a precise walkthrough of the entire mechanism.

---

## The on-access expiry check

### The two-layer design

**`keyIsExpired()` — pure predicate (`db.c:2877`)**

```c
int keyIsExpired(redisDb *db, sds key, kvobj *kv) {
    if (server.loading || server.allow_access_expired) return 0;
    mstime_t when = getExpire(db, key, kv);
    if (when < 0) return 0;
    return commandTimeSnapshot() > when;
}
```

It only answers yes/no. It does nothing else. `commandTimeSnapshot()` returns a frozen-at-command-start time so that all lookups within one command see a consistent "now".

---

**`expireIfNeeded()` — policy layer (`db.c:2935`)**

This is the function that decides *whether and how* to act on the answer from `keyIsExpired()`. It returns one of four values defined at `db.c:42–48`:

| Return | Meaning |
|---|---|
| `KEY_VALID` | Not expired (or access allowed to it anyway) |
| `KEY_EXPIRED` | Logically expired but **not deleted** (replica, paused, guarded) |
| `KEY_DELETED` | Expired and **deleted right now** |
| `KEY_TRIMMED` | In a cluster slot trim job — treat as missing |

The decision tree inside `expireIfNeeded()` (lines 2935–3003):

1. **Cluster-slot trim check** (lines 2942–2950) — if the key's slot is being migrated away and `EXPIRE_ALLOW_ACCESS_TRIMMED` is not set, return `KEY_TRIMMED` immediately, no expiry involved.
2. **Not expired / access flag** (lines 2952–2954) — if `keyIsExpired()` is false, or if `EXPIRE_ALLOW_ACCESS_EXPIRED` is set, return `KEY_VALID`.
3. **Replica guard** (lines 2974–2977) — on a replica, return `KEY_EXPIRED` without deleting, *unless* `EXPIRE_FORCE_DELETE_EXPIRED` is set (writable-replica write commands) or the current client is the master replication stream (keys never expire during replayed commands).
4. **Config guard** (lines 2981–2982) — `confAllowsExpireDel()` blocks deletion inside nested commands that touch arbitrary keys in cluster replication mode (avoids cross-slot DEL propagation).
5. **Explicit avoid flag** (lines 2986–2987) — `EXPIRE_AVOID_DELETE_EXPIRED` suppresses deletion even on a master, returning `KEY_EXPIRED`.
6. **Pause guard** (line 2992) — if `PAUSE_ACTION_EXPIRE` is active, return `KEY_EXPIRED`.
7. **Delete** (lines 2994–3003) — calls `deleteExpiredKeyAndPropagate()` → `deleteKeyAndPropagate()` → `alsoPropagate()`, which queues a `DEL`/`UNLINK` into both the AOF and the replication stream. Returns `KEY_DELETED`.

---

### The four call sites

#### 1. `lookupKey()` — `db.c:279–334` — the main path

Every key access by every command flows here. The `flags` argument to `lookupKey()` are translated into `expire_flags` before the call at lines 292–301:

```
LOOKUP_WRITE          → EXPIRE_FORCE_DELETE_EXPIRED  (if not a read-only replica)
LOOKUP_NOEXPIRE       → EXPIRE_AVOID_DELETE_EXPIRED
LOOKUP_ACCESS_EXPIRED → EXPIRE_ALLOW_ACCESS_EXPIRED
LOOKUP_ACCESS_TRIMMED → EXPIRE_ALLOW_ACCESS_TRIMMED
```

On a **master**, both read and write commands reach step 7 and delete. The difference `EXPIRE_FORCE_DELETE_EXPIRED` makes is specifically for **writable replicas**: a read command on a writable replica gets `KEY_EXPIRED` (no deletion); a write command forces deletion anyway (`db.c:295`).

When `expireIfNeeded()` returns anything other than `KEY_VALID`, `lookupKey()` returns `NULL` (lines 302–306), so the command sees a cache miss exactly as if the key were absent. After that, if the key was actually valid, LRU/LFU is updated and keyspace hit stats are incremented (lines 309–333); otherwise a keyspace-miss event fires.

The wrappers (`db.c:356–394`) are thin:

```
lookupKeyRead()          → lookupKey(db, key, LOOKUP_NONE,  NULL)
lookupKeyWrite()         → lookupKey(db, key, LOOKUP_WRITE, NULL)
lookupKeyReadOrReply()   → lookupKeyRead + addReply on NULL
lookupKeyWriteOrReply()  → lookupKeyWrite + addReply on NULL
```

Nearly every `t_*.c` command implementation calls one of these four.

---

#### 2. `dbRandomKey()` — `db.c:808–841` — the `RANDOMKEY` command

Loops sampling dictionary entries. At line 834 it calls `expireIfNeeded()` with `flags=0`; an expired key causes `continue`, picking another. There is a safety valve (lines 823–832): if the DB is all-volatile and this is a replica or expiry is paused (the loop can't converge), after 100 tries it returns the key anyway rather than spinning forever.

---

#### 3. `delGenericCommand()` — `db.c:1415–1431` — `DEL` and `UNLINK`

Before the explicit deletion, line 1419 calls `expireIfNeeded()` with `flags=0`. If it returns `KEY_DELETED`, the key has just been reaped by expiry; the loop `continue`s, skipping the explicit `dbSyncDelete`/`dbAsyncDelete` and not counting the key in the reply. This means: if you `DEL` an already-TTL-expired key, it counts as 0 deleted keys (the key was already gone from the caller's perspective).

---

#### 4. SCAN callback — `db.c:1702` — `SCAN` iteration

When iterating the top-level keyspace (i.e., not iterating inside a hash/set/etc.), the scan visitor callback calls `expireIfNeeded()` with `flags=0` at line 1702. A return value other than `KEY_VALID` causes an immediate `return`, suppressing the key from the scan result. No special treatment: the key is deleted on a master, silently omitted on a replica.

---

### Summary of what the caller sees

| Context | On master | On read-only replica |
|---|---|---|
| Read command (`lookupKeyRead`) | Key deleted → returns `NULL` (miss) | Returns `NULL` (miss, no deletion) |
| Write command (`lookupKeyWrite`) | Key deleted → returns `NULL` (miss) | Key deleted (forced) → returns `NULL` |
| `RANDOMKEY` | Key deleted, another sampled | Key skipped (no deletion), another sampled |
| `DEL`/`UNLINK` on expired key | Expiry deletes it; counts as 0 | Not deleted; explicit DEL may still run |
| `SCAN` | Key deleted, omitted from results | Key omitted (no deletion) |

The deletion itself (`deleteExpiredKeyAndPropagate`) always calls `alsoPropagate()`, so the removal travels to AOF and replicas as a synthesized `DEL`/`UNLINK` command, independent of the command that triggered the lookup.
