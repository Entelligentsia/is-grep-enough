# transcript: I'm trying to reason about Redis's per-value memory footprint and how a stored value is tagged and tracked while it lives in the keyspace. I need to understa...


💬 Let me read the core object definition directly.
  ▸ Bash(grep -n "typedef struct redisObject\|} robj\|#define OBJ_\|#define LRU_" /home/bench/repos/redis/src/server.h | head -60)
  ▸ Bash(grep -n "robj\|redisObject" /home/bench/repos/redis/src/server.h | grep -i "struct\|typedef\|lru\|refcount" | head -20)
  ▸ Bash(grep -n "struct redisObject {" /home/bench/repos/redis/src/server.h)
  ▸ Bash(grep -n "redisObject" /home/bench/repos/redis/src/server.h | head -5)
  ▸ Bash(grep -rn "struct redisObject" /home/bench/repos/redis/src/ | head -10)
  ▸ Read(/home/bench/repos/redis/src/object.h)

💬 The full struct is in `src/object.h`. Here is a precise walkthrough.  ---  ## The container: `struct redisObject` (aliased as `robj`)  At `object.h:100–112`,...

──────── RESULT (success, 59343ms, 7 turns) ────────
The full struct is in `src/object.h`. Here is a precise walkthrough.

---

## The container: `struct redisObject` (aliased as `robj`)

At `object.h:100–112`, the struct packs everything into **16 bytes**:

```c
struct redisObject {
    unsigned type     :  4;   // logical data type
    unsigned encoding :  4;   // concrete representation
    unsigned refcount : 23;   // reference-count for lifetime
    unsigned iskvobj  :  1;   // kvobj flag (see below)
    unsigned metabits :  8;   // metadata bitmap (kvobj only)
    unsigned lru      : 24;   // LRU timestamp or LFU counter
    void *ptr;                // payload pointer (8 bytes)
};
```

The 64-bit bitfield plus the 8-byte pointer gives the 16 bytes shown in the memory-layout diagrams at the top of `object.h`.

---

### The two-level type system

**`type` (4 bits)** — the *logical* type the client sees via `TYPE` or `OBJECT ENCODING`. The values are:

| Constant | Value | Meaning |
|---|---|---|
| `OBJ_STRING` | 0 | String |
| `OBJ_LIST` | 1 | List |
| `OBJ_SET` | 2 | Set |
| `OBJ_ZSET` | 3 | Sorted set |
| `OBJ_HASH` | 4 | Hash |
| `OBJ_MODULE` | 5 | Module |
| `OBJ_STREAM` | 6 | Stream |

**`encoding` (4 bits)** — the *concrete* in-memory representation. This is what changes transparently as a collection grows. A few examples of the type→encoding fan-out:

- `OBJ_STRING` → `OBJ_ENCODING_INT` (stored as a `long` directly in `ptr`), `OBJ_ENCODING_EMBSTR` (SDS embedded in the robj allocation), or `OBJ_ENCODING_RAW` (separate SDS heap allocation).
- `OBJ_LIST` → `OBJ_ENCODING_LISTPACK` (small) or `OBJ_ENCODING_QUICKLIST` (large).
- `OBJ_SET` → `OBJ_ENCODING_INTSET`, `OBJ_ENCODING_LISTPACK`, or `OBJ_ENCODING_HT`.
- `OBJ_HASH` → `OBJ_ENCODING_LISTPACK` / `OBJ_ENCODING_LISTPACK_EX` (small) or `OBJ_ENCODING_HT` (large).
- `OBJ_ZSET` → `OBJ_ENCODING_LISTPACK` or `OBJ_ENCODING_SKIPLIST`.

`type` never changes for a given key. `encoding` can be promoted as the value grows.

---

### Lifetime management: `refcount` (23 bits)

This is a plain reference count. `incrRefCount`/`decrRefCount` in `object.h:128–130` manage it; when it hits zero the object is freed. Two sentinel values (`object.h:96–98`) exist:

- `OBJ_SHARED_REFCOUNT` (`(1<<23)-1`) — pinned shared objects, e.g. the pre-allocated integer objects 0–9999 (`OBJ_SHARED_INTEGERS 10000`, `server.h:126`). These are never freed.
- `OBJ_STATIC_REFCOUNT` (`(1<<23)-2`) — stack-allocated objects used transiently inside a command; also never freed.

---

### Eviction and access tracking: `lru` (24 bits)

The `lru` field is dual-purpose depending on the active eviction policy (`object.h:108–110`):

- **LRU mode**: stores a 24-bit timestamp relative to `server.lruclock` (a global 24-bit counter, resolution 1 second, max `LRU_CLOCK_MAX = (1<<24)-1`). The eviction machinery compares this against the current clock to compute idle time.
- **LFU mode**: the field is split — the **least-significant 8 bits** hold a logarithmic access frequency counter, and the **most-significant 16 bits** hold the last-decrement time. The frequency is incremented probabilistically on access and decays over time.

The `lru` field is per-object, updated on each access. `object.h:188–190` exposes `objectSetLRUOrLFU()` to write it.

---

### The `kvobj` variant: key co-location

`iskvobj` (1 bit, `object.h:104`) marks when the `robj` is used as a `kvobj` — a keyspace entry that **co-locates the key string and optional value inline** after the struct rather than using separate allocations. The memory layout from the file header:

```
[metadata blocks] [redisObject 16 bytes] [key-hdr-size 1 byte] [SDS key] [SDS value (small strings)]
                  ^
                  kvobjCreate() returns this pointer
```

`metabits` (8 bits, `object.h:107`) is a bitmap encoding which of up to 8 metadata slots are present. Each occupied slot is an 8-byte block placed *before* the struct in reverse class order. Class 0 is reserved for expiration time (`kvobjSetExpire`, `object.h:122`). `kvobjGetAllocPtr` at `object.h:194–198` recovers the true start of the allocation by counting `__builtin_popcount(metabits)` blocks.

---

### Summary of what each field does

| Field | Bits | Purpose |
|---|---|---|
| `type` | 4 | Logical data type (what `TYPE` returns) |
| `encoding` | 4 | Concrete representation (what `OBJECT ENCODING` returns); changes transparently |
| `refcount` | 23 | Lifetime; shared/static sentinels pin special objects |
| `iskvobj` | 1 | Signals co-located key+value layout |
| `metabits` | 8 | Bitmap of pre-struct metadata blocks (expiry in class 0) |
| `lru` | 24 | LRU clock timestamp or LFU frequency+time; drives eviction |
| `ptr` | 64 | Payload: SDS, dict, quicklist, intset, skiplist, etc. |
