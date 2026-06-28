# transcript: I'm trying to reason about Redis's per-value memory footprint and how a stored value is tagged and tracked while it lives in the keyspace. I need to understa...


💬 Let me pull up the core object struct using grove.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source)
  ▸ mcp__grove__symbols({"dir":"src","name":"robj","kind":"struct"})
  ▸ mcp__grove__symbols({"dir":"src","name":"redisObject","kind":"struct"})
  ▸ mcp__grove__source({"id":"c:src/object.h#redisObject@100"})

💬 Good. Now let me pull the type and encoding constants, and the LRU_BITS definition to round out the picture.
  ▸ Bash(grep -n "OBJ_ENCODING\|OBJ_TYPE\|LRU_BITS\|OBJ_REFCOUNT_BITS\|METABITS\|META_" src/object.h | head -80)
  ▸ Bash(grep -n "OBJ_TYPE\|OBJ_ENCODING" src/server.h | head -60)
  ▸ Bash(grep -n "^#define OBJ_TYPE" src/server.h | head -20)
  ▸ Bash(grep -n "META_BIT\|KVOBJ_META\|metabits" src/object.h src/server.h | head -40)
  ▸ Read(/home/bench/repos/redis/src/object.h)
  ▸ Bash(grep -n "^#define OBJ_TYPE\|OBJ_TYPE_STRING\|OBJ_TYPE_LIST\|OBJ_TYPE_SET\|OBJ_TYPE_ZSET\|OBJ_TYPE_HASH\|OBJ_TYPE_STREAM\|OBJ_TYPE_MODULE\|OBJ_TYPE_KEYSPE" sr...)
  ▸ Bash(grep -n "OBJ_STRING\|OBJ_LIST\|OBJ_SET\|OBJ_ZSET\|OBJ_HASH\|OBJ_STREAM\|OBJ_MODULE" src/server.h | grep "^src/server.h:[0-9]*:#define" | head -20)
  ▸ Bash(grep -rn "#define OBJ_STRING\|#define OBJ_LIST\|#define OBJ_SET\|#define OBJ_ZSET\|#define OBJ_HASH\|#define OBJ_STREAM\|#define OBJ_MODULE" src/)

💬 I have everything needed. Here's the full picture:  ---  ## `struct redisObject` — the universal value container  Every value in the keyspace is wrapped in a...

──────── RESULT (success, 82388ms, 13 turns) ────────
I have everything needed. Here's the full picture:

---

## `struct redisObject` — the universal value container

Every value in the keyspace is wrapped in a `struct redisObject` (typedef'd as `robj`), defined in `src/object.h:100`. The entire header struct is **16 bytes**: 8 bytes of bit-packed fields and an 8-byte pointer.

```c
struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    unsigned refcount : OBJ_REFCOUNT_BITS;  /* 23 bits */
    unsigned iskvobj : 1;
    unsigned metabits : 8;
    unsigned lru : LRU_BITS;                /* 24 bits */
    void *ptr;
};
```

---

### `type` (4 bits) — the logical data type

This is what `TYPE key` returns to the client. It never changes for the lifetime of a key.

| Constant | Value | Meaning |
|---|---|---|
| `OBJ_STRING` | 0 | String |
| `OBJ_LIST` | 1 | List |
| `OBJ_SET` | 2 | Set |
| `OBJ_ZSET` | 3 | Sorted set |
| `OBJ_HASH` | 4 | Hash |
| `OBJ_MODULE` | 5 | Module type |
| `OBJ_STREAM` | 6 | Stream |

---

### `encoding` (4 bits) — the concrete representation

This is the field that distinguishes *what* a value is from *how it is currently stored in memory*. Redis silently converts between encodings as a value grows or shrinks to trade off memory vs. speed.

| Constant | Value | Used for |
|---|---|---|
| `OBJ_ENCODING_RAW` | 0 | Heap-allocated SDS string |
| `OBJ_ENCODING_INT` | 1 | Integer stored directly in `ptr` (no allocation) |
| `OBJ_ENCODING_HT` | 2 | Hash table (`dict`) |
| `OBJ_ENCODING_INTSET` | 6 | Compact integer-only set |
| `OBJ_ENCODING_SKIPLIST` | 7 | Skiplist (zset) |
| `OBJ_ENCODING_EMBSTR` | 8 | Short string embedded in the `robj` allocation itself |
| `OBJ_ENCODING_QUICKLIST` | 9 | Linked list of listpacks (list) |
| `OBJ_ENCODING_STREAM` | 10 | Radix tree of listpacks (stream) |
| `OBJ_ENCODING_LISTPACK` | 11 | Compact contiguous listpack |
| `OBJ_ENCODING_LISTPACK_EX` | 12 | Listpack with per-element TTL metadata |
| `OBJ_ENCODING_SLICED_ARRAY` | 13 | Sliced array |

Encodings 3–5 (`ZIPMAP`, `LINKEDLIST`, `ZIPLIST`) are retired and no longer created.

---

### `refcount` (23 bits) — lifetime management

Tracks how many places own a reference to this object. When it reaches zero the object is freed via `zfree`. Two sentinel values bypass normal lifecycle:

- `OBJ_SHARED_REFCOUNT` (`2²³ − 1`): immortal shared objects (pre-allocated small integers 0–9999, common reply strings). They are never freed.
- `OBJ_STATIC_REFCOUNT` (`2²³ − 2`): stack-allocated objects that must never be heap-freed.

---

### `iskvobj` (1 bit) — kvobj flag

Marks that this `robj` is serving as the base of a **kvobj** — a key-value object that has the key string (and optionally a small value) embedded inline in the same allocation, immediately after the struct. The `metabits` and `lru` fields are only meaningful when this bit is set.

---

### `metabits` (8 bits) — embedded metadata bitmap

A bitmap of up to 8 metadata classes attached to this kvobj. Each set bit means one 8-byte metadata word is stored *before* the struct in memory (in reverse class order). **Class 0** is reserved for the expiration timestamp. This is how per-key TTL is stored in this codebase — not as a separate side-table entry, but as a word prepended to the kvobj allocation itself:

```
[ expiry: 8 bytes ][ robj: 16 bytes ][ key-hdr: 1 byte ][ sds key ][ sds value? ]
                    ^
                    kvobjCreate() returns pointer here
```

---

### `lru` (24 bits) — eviction/recency tracking

Dual-purpose field, controlled by which eviction policy is active:

- **LRU mode**: stores the object's last-access time as a 24-bit tick relative to the global `lru_clock`. The clock wraps at `LRU_CLOCK_MAX` (`2²⁴ − 1`). The eviction machinery picks the key whose tick is furthest behind the current clock value.
- **LFU mode**: the upper 16 bits hold the last-access minute (for decay) and the lower 8 bits hold a logarithmic frequency counter. Both decay over time so rarely-touched keys lose their counter and become eviction candidates.

---

### `ptr` (8 bytes) — the payload

Points to the actual data structure selected by `encoding`: an SDS string, a `dict`, a `quicklist`, an `intset`, a `zskiplist`, a `stream` radix tree, etc. For `OBJ_ENCODING_INT`, the integer value is stored directly *in* the pointer cast to `(void *)`, skipping any heap allocation entirely.

---

**In summary**: `type` is the stable logical identity visible to clients; `encoding` is the mutable implementation detail that Redis tunes for memory/speed; `refcount` governs lifetime; `lru`/`metabits` serve the eviction and TTL machinery (relevant on kvobj instances); and `ptr` is the route to the actual data.
