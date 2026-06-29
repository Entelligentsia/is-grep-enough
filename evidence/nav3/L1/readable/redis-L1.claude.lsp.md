# transcript: I'm trying to reason about Redis's per-value memory footprint and how a stored value is tagged and tracked while it lives in the keyspace. I need to understa...


💬 Let me load the LSP tool and look up the core container struct.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(redisObject)

💬 The LSP index is still warming. I'll read `server.h` to anchor the struct, then follow up with LSP position-based operations.
  ▸ Bash(grep -n "redisObject\|robj\|OBJ_ENCODING\|OBJ_TYPE\|lru\|refcount" /home/bench/repos/redis/src/server.h | head -80)
  ▸ Bash(grep -n "struct redisObject {" /home/bench/repos/redis/src/server.h)
  ▸ Bash(grep -n "typedef.*robj\|struct redisObject" /home/bench/repos/redis/src/server.h | head -20)
  ▸ Bash(grep -n "typedef.*redisObject\|^typedef.*robj" /home/bench/repos/redis/src/server.h | head -20)
  ▸ Bash(grep -rn "typedef.*robj\b\|^typedef struct.*robj" /home/bench/repos/redis/src/ | head -20)
  ▸ Read(/home/bench/repos/redis/src/object.h)

💬 Now let me check the `OBJ_TYPE_*` constants and how LFU data is packed into the `lru` field.
  ▸ Bash(grep -n "OBJ_TYPE_\|OBJ_SHARED_INTEGERS\|LFU\|lru_clock\b" /home/bench/repos/redis/src/server.h | head -40)
  ▸ Bash(grep -n "^#define OBJ_TYPE_" /home/bench/repos/redis/src/server.h)
  ▸ Bash(grep -n "^#define OBJ_" /home/bench/repos/redis/src/server.h | head -30)

💬 Now let me look at how the `lru` field is split for LFU mode to complete the eviction story.
  ▸ Bash(grep -n "LFU_DECAY_TIME\|LFUDecrAndReturn\|lru >> 8\|lru & 255\|lru &= \|lru =\b" /home/bench/repos/redis/src/evict.c | head -30)

💬 Now I have everything needed for a precise, complete walkthrough. Here is the full picture.  ---  ## `struct redisObject` — the universal value container  Ev...

──────── RESULT (success, 78440ms, 13 turns) ────────
Now I have everything needed for a precise, complete walkthrough. Here is the full picture.

---

## `struct redisObject` — the universal value container

Everything stored in the Redis keyspace is wrapped in a `struct redisObject` (typedef `robj`), defined in `src/object.h:100–112`.

```c
struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    unsigned refcount : OBJ_REFCOUNT_BITS;  /* 23 bits */
    unsigned iskvobj : 1;

    unsigned metabits : 8;
    unsigned lru : LRU_BITS;               /* 24 bits */
    void *ptr;
};
```

The struct fits in 16 bytes (the four bitfields share the first 8 bytes; `ptr` takes the second 8).

---

### `type` — logical data type (4 bits)

This is the user-visible Redis type, independent of how it is stored:

| Value | Constant | Meaning |
|-------|----------|---------|
| 0 | `OBJ_STRING` | string |
| 1 | `OBJ_LIST` | list |
| 2 | `OBJ_SET` | set |
| 3 | `OBJ_ZSET` | sorted set |
| 4 | `OBJ_HASH` | hash |
| 5 | `OBJ_MODULE` | module type |
| 6 | `OBJ_STREAM` | stream |
| 7–8 | `OBJ_ARRAY`, `OBJ_GCRA` | internal types |

`server.h:856–882`. The `TYPE` command reads this field directly.

---

### `encoding` — concrete representation (4 bits)

This is the field that distinguishes *how* the logical type is currently stored in memory. The same logical type can migrate between encodings as the value grows or shrinks:

| Constant | Meaning |
|----------|---------|
| `OBJ_ENCODING_INT` (1) | string stored as a bare `long` cast into `ptr` |
| `OBJ_ENCODING_EMBSTR` (8) | short string embedded in the same allocation as the `robj` |
| `OBJ_ENCODING_RAW` (0) | string as a heap-allocated SDS |
| `OBJ_ENCODING_LISTPACK` (11) | compact byte-packed sequence |
| `OBJ_ENCODING_QUICKLIST` (9) | linked list of listpacks (lists) |
| `OBJ_ENCODING_HT` (2) | hash table (`dict`) |
| `OBJ_ENCODING_INTSET` (6) | sorted array of integers (small sets) |
| `OBJ_ENCODING_SKIPLIST` (7) | skiplist + dict (sorted sets) |
| `OBJ_ENCODING_STREAM` (10) | radix tree of listpacks |

`object.h:75–88`. `tryObjectEncoding` (`object.h:146`) is the function that decides when to convert between them.

**`type` vs `encoding` in one sentence:** `type` is what the user asked for; `encoding` is how Redis chose to store it to save memory or go faster.

---

### `refcount` — lifetime management (23 bits)

Standard reference counting. `incrRefCount`/`decrRefCount` (`object.h:129–130`) manage it; when it hits zero the object is freed. Two sentinel values prevent premature collection:

- **`OBJ_SHARED_REFCOUNT`** (`(1<<23)-1`) — the object is a global singleton (e.g., one of the 10,000 pre-allocated small-integer strings, `OBJ_SHARED_INTEGERS`). It is never freed.
- **`OBJ_STATIC_REFCOUNT`** (`(1<<23)-2`) — the object is stack-allocated; decrRef is a no-op.

`object.h:96–98`.

---

### `lru` — eviction clock data (24 bits)

This field is dual-purpose depending on the `maxmemory-policy` setting (`server.h:687`):

**LRU mode** (default): stores the timestamp of the last access, in seconds, taken from the server's global `lru_clock` (which itself ticks every `LRU_CLOCK_RESOLUTION` = 1000 ms). The 24 bits give a range of ~194 days before wrapping (`LRU_CLOCK_MAX`, `object.h:91`). Eviction candidates are ranked by how stale this timestamp is relative to `lru_clock`.

**LFU mode** (`--maxmemory-policy allkeys-lfu` etc.): the same 24 bits are split into two sub-fields (`evict.c:302–303`):
```c
unsigned long ldt     = o->lru >> 8;   /* upper 16 bits: last-decrement time (minutes) */
unsigned long counter = o->lru & 255;  /* lower  8 bits: logarithmic access frequency */
```
The 8-bit counter is incremented probabilistically on each access (logarithmic so it doesn't saturate quickly) and decayed over time. Eviction picks the object with the *lowest* counter.

---

### `iskvobj` + `metabits` — the `kvobj` extension (1 + 8 bits)

In recent Redis, keyspace entries are not stored as a separate key-SDS + robj-value pair. Instead, `iskvobj = 1` signals that this allocation is a **`kvobj`**: the same 16-byte header but the allocation continues to embed the key (as SDS, immediately after the struct) and optionally the value for small strings. `metabits` is an 8-bit bitmap indicating which metadata blocks (each 8 bytes) are prepended *before* the struct in memory — bit 0 is expiration time. This colocates key, expiry, and value in one allocation, reducing pointer chasing and allocator overhead. `kvobjGetKey`, `kvobjGetExpire`, and `kvobjMetaRef` (`object.h:123–125`) are the accessors.

---

### `ptr` — the payload

For non-embedded, non-integer values, `ptr` points to the actual data structure: an `sds`, a `dict`, a `quicklist`, a `listpack`, a `zskiplist`+`dict` pair, a `stream`, etc., determined by `encoding`. For `OBJ_ENCODING_INT`, no heap object exists — the integer itself is stored as a `(void *)(long)` cast directly into `ptr`.
