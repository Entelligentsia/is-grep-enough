# transcript: To predict when a key that is already past its TTL actually gets removed during ordinary request handling — as opposed to by the background expiry sweep — I ...


💬 Let me look at the expiry check and its callers directly.
  ▸ Bash(grep -n "expireIfNeeded" /home/bench/repos/redis/src/expire.c | head -60)
  ▸ Bash(grep -rn "expireIfNeeded" /home/bench/repos/redis/src/ --include="*.c" | grep -v "expire.c")
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)

💬 Now let me read the four call sites in db.c:
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)

💬 Now let me look at `keyIsExpired` and `deleteExpiredKeyAndPropagate`:
  ▸ Bash(grep -n "keyIsExpired\|deleteExpiredKeyAndPropagate\|confAllowsExpireDel" /home/bench/repos/redis/src/db.c | head -30)
  ▸ Bash(grep -n "LOOKUP_WRITE\|LOOKUP_NOEXPIRE\|LOOKUP_NOTOUCH\|lookupKeyRead\|lookupKeyWrite\b" /home/bench/repos/redis/src/db.c | head -30)
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)
  ▸ Read(/home/bench/repos/redis/src/db.c)

💬 I now have everything needed. Here's the full picture:  ---  ## The lazy-expiry path in Redis  ### The core check: `expireIfNeeded` (`db.c:2935`)  This is th...

──────── RESULT (success, 67977ms, 14 turns) ────────
I now have everything needed. Here's the full picture:

---

## The lazy-expiry path in Redis

### The core check: `expireIfNeeded` (`db.c:2935`)

This is the single function responsible for on-access expiry. It is `static` and only called from within `db.c`. It takes a `flags` bitmask and returns one of four `keyStatus` values:

```
KEY_VALID   — key is live (or no expiry set)
KEY_EXPIRED — past TTL but NOT deleted (replica, paused, or config-blocked)
KEY_DELETED — was expired and just deleted
KEY_TRIMMED — belongs to a slot being trimmed away (cluster)
```

**Decision tree inside the function** (`db.c:2935–3003`):

1. **Cluster trim check** (`2942`): if the key's slot is in a trim job, returns `KEY_TRIMMED` (or `KEY_VALID` if access-to-trimmed is allowed).
2. **`keyIsExpired` check** (`2952`): calls `keyIsExpired()` which compares `commandTimeSnapshot()` against the stored TTL. If the key is not expired, returns `KEY_VALID` immediately.
3. **Replica guard** (`2974`): if this server has a `masterhost` (i.e., is a replica) and `EXPIRE_FORCE_DELETE_EXPIRED` is not set, returns `KEY_EXPIRED` — replicas wait for the master's DEL to maintain consistency.
4. **Config guard** (`2981`): `confAllowsExpireDel()` blocks deletion inside nested commands that touch arbitrary keys (e.g., SCAN/RANDOMKEY inside MULTI or scripts) to avoid cross-slot issues in cluster replication.
5. **Pause guard** (`2992`): if `PAUSE_ACTION_EXPIRE` is active (failover in progress), returns `KEY_EXPIRED`.
6. **Delete** (`2995`): calls `deleteExpiredKeyAndPropagate()`, which removes the key from the keyspace, emits an `expired` keyspace notification, and queues a `DEL`/`UNLINK` into AOF and replicas via `alsoPropagate`. Returns `KEY_DELETED`.

---

### Call site 1 — `lookupKey` (`db.c:279`, the primary path)

Every read and write command funnels through this function. The `flags` argument controls how expiry is handled:

| `LOOKUP_*` flag | translates to `EXPIRE_*` | effect |
|---|---|---|
| `LOOKUP_WRITE` (+ not a read-only replica) | `EXPIRE_FORCE_DELETE_EXPIRED` | overrides the replica guard — write commands delete even on writable replicas |
| `LOOKUP_NOEXPIRE` | `EXPIRE_AVOID_DELETE_EXPIRED` | check TTL but don't delete (returns `KEY_EXPIRED`, key stays) |
| `LOOKUP_ACCESS_EXPIRED` | `EXPIRE_ALLOW_ACCESS_EXPIRED` | skip the TTL check entirely (used internally for access to expired data) |

If `expireIfNeeded` returns anything other than `KEY_VALID`, `lookupKey` sets `val = NULL` and returns it as a miss (`db.c:302–306`). The LRU/LFU timestamp update and keyspace hit counter are only touched for `KEY_VALID` keys.

The public API above `lookupKey`:
- `lookupKeyRead` / `lookupKeyReadWithFlags` — no `LOOKUP_WRITE`, so deletion happens only when the master side's guards allow it.
- `lookupKeyWrite` / `lookupKeyWriteWithFlags` / `lookupKeyWriteWithLink` — adds `LOOKUP_WRITE`, forcing deletion even on writable replicas (`db.c:366–381`).

---

### Call site 2 — `dbRandomKey` (`db.c:834`, RANDOMKEY command)

Loops picking random dict entries. On each iteration it calls `expireIfNeeded(db, keyobj, kv, 0)` with no flags. If the result is not `KEY_VALID` it drops the candidate and loops again (`db.c:834–836`). There is an escape hatch at line 823: if the entire DB is volatile and the server is a replica or expiry is paused, it gives up after 100 tries and returns a potentially-expired key to avoid an infinite loop.

---

### Call site 3 — `delGenericCommand` (`db.c:1419`, DEL / UNLINK)

Before calling `dbSyncDelete`/`dbAsyncDelete`, it pre-checks each key with `expireIfNeeded(..., 0)`. If the result is `KEY_DELETED` it `continue`s — the deletion already happened inside `expireIfNeeded`, so the explicit DEL is skipped and the key is not counted in the reply (`db.c:1419–1420`). Keys that are expired-but-not-deleted (`KEY_EXPIRED`) fall through to the normal delete path.

---

### Call site 4 — SCAN callback (`db.c:1702`)

The scan iterator callback calls `expireIfNeeded(data->db, NULL, kv, 0)` using the `kvobj` directly (avoids allocating a temporary `robj`). If the result is not `KEY_VALID`, the key is silently omitted from the SCAN reply (`db.c:1702–1703`).

---

### Summary: when does the deletion actually happen?

A key past its TTL is deleted during ordinary request handling **only** when all of the following are true at the moment of access:

1. `keyIsExpired()` returns true (wall clock past TTL).
2. `EXPIRE_FORCE_DELETE_EXPIRED` is set **or** this is not a replica.
3. `confAllowsExpireDel()` is true (not a nested arbitrary-key command in cluster-replication mode).
4. `PAUSE_ACTION_EXPIRE` is not active.
5. `EXPIRE_AVOID_DELETE_EXPIRED` is not set (i.e., the caller isn't opting out of deletion).

Otherwise the key stays in the dict, `expireIfNeeded` returns `KEY_EXPIRED`, and the caller treats it as a miss — the deletion is deferred to the active expiry sweep in `expire.c` or to a later access.
