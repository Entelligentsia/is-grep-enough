# transcript: I'm trying to reason about Redis's per-value memory footprint and how a stored value is tagged and tracked while it lives in the keyspace. I need to understa...


💬 Let me load the LSP tool and look up the core value container.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(redisObject)

💬 LSP index is still warming. Let me read the definition directly from `server.h` where `redisObject` is canonically defined.
  ▸ Bash(grep -n "redisObject\|OBJ_TYPE\|OBJ_ENCODING\|LRU_BITS\|robj" /home/bench/repos/redis/src/server.h | head -80)

💬 The struct definition itself wasn't in those results. Let me find it precisely.
  ▸ Bash(grep -n "struct redisObject {" /home/bench/repos/redis/src/server.h)
  ▸ Bash(grep -n "OBJ_TYPE_STRING\|OBJ_TYPE_LIST\|OBJ_TYPE_SET\|OBJ_TYPE_ZSET\|OBJ_TYPE_HASH\|OBJ_ENCODING_RAW\|OBJ_ENCODING_INT\|OBJ_ENCODING_EMBSTR\|OBJ_ENCODING_SK...)

💬 The struct definition isn't in server.h by that name. Let me check object.c and the kvobj/robj typedef.
  ▸ Bash(grep -n "typedef.*robj\|typedef.*redisObject\|struct redisObject\|struct kvobj\|typedef.*kvobj" /home/bench/repos/redis/src/server.h | head -30)
  ▸ Bash(grep -rn "struct redisObject\|typedef.*robj\|typedef.*kvobj" /home/bench/repos/redis/src/ | head -30)

💬 The definition lives in `src/object.h`. Let me read the full struct and the surrounding encoding constants.
  ▸ Read(/home/bench/repos/redis/src/object.h)

💬 That's everything I need. Here is the complete picture.  ---  ## The container: `struct redisObject` (`robj` / `kvobj`)  Defined at `src/object.h:100–112`. E...

──────── RESULT (success, 67890ms, 9 turns) ────────
That's everything I need. Here is the complete picture.

---

## The container: `struct redisObject` (`robj` / `kvobj`)

Defined at `src/object.h:100–112`. Every value in the keyspace is, at minimum, this 16-byte struct (two machine words, tightly packed with bitfields):

```c
struct redisObject {
    unsigned type     : 4;           // logical data type
    unsigned encoding : 4;           // concrete representation
    unsigned refcount : 23;          // lifetime management
    unsigned iskvobj  : 1;           // role flag
    unsigned metabits : 8;           // which metadata slots are live (kvobj only)
    unsigned lru      : 24;          // eviction / access-frequency data
    void *ptr;                       // payload pointer
};
```

### Field-by-field breakdown

**`type` (4 bits)** — the *logical* data type as the client sees it: `OBJ_STRING`, `OBJ_LIST`, `OBJ_SET`, `OBJ_ZSET`, `OBJ_HASH`, `OBJ_STREAM`, `OBJ_MODULE`, etc. (`server.h:856–884`). This is what `TYPE mykey` returns. It never changes for the lifetime of the value.

**`encoding` (4 bits)** — the *concrete* in-memory representation for that type (`object.h:75–88`). This is the field that distinguishes logical from physical:

| Encoding | Value | Used for |
|---|---|---|
| `OBJ_ENCODING_RAW` | 0 | Heap-allocated SDS string |
| `OBJ_ENCODING_INT` | 1 | Integer stored directly in `ptr` (cast to `long`) |
| `OBJ_ENCODING_HT` | 2 | Hash table (`dict`) |
| `OBJ_ENCODING_INTSET` | 6 | Compact integer-only set |
| `OBJ_ENCODING_SKIPLIST` | 7 | Sorted set skip list + hash table |
| `OBJ_ENCODING_EMBSTR` | 8 | String ≤44 bytes, SDS header + chars fused into the robj allocation |
| `OBJ_ENCODING_QUICKLIST` | 9 | List of listpack nodes |
| `OBJ_ENCODING_LISTPACK` | 11 | Compact sequential listpack (small hashes, sets, zsets) |
| `OBJ_ENCODING_LISTPACK_EX` | 12 | Listpack extended with per-element metadata |
| `OBJ_ENCODING_SLICED_ARRAY` | 13 | Sliced array |

Redis promotes/demotes between encodings transparently (e.g., a small hash starts as `LISTPACK`, is converted to `HT` once it exceeds the size threshold). `tryObjectEncoding()` drives that.

**`refcount` (23 bits)** — reference count for shared-object lifetime. `incrRefCount` / `decrRefCount` (`object.h:129–130`). Two sentinels: `OBJ_SHARED_REFCOUNT` (max value, `(1<<23)-1`) marks permanently shared objects (the 0–9999 integer pool, common reply strings) that are never freed; `OBJ_STATIC_REFCOUNT` marks stack-allocated objects.

**`iskvobj` (1 bit)** — role flag that marks whether this `robj` is actually a `kvobj` (the keyspace entry form, described below). The two typedefs (`robj` and `kvobj`) alias the same struct; this bit is the runtime discriminant.

**`metabits` (8 bits) — kvobj only** — a bitmap of which optional metadata slots (up to 8 classes, 8 bytes each) are physically present in the allocation *before* the struct. Class 0 is expiration time. The memory layout places metadata blocks at negative offsets from the kvobj pointer, in reverse class order (see the diagram at `object.h:38–65`).

**`lru` (24 bits)** — dual-purpose eviction field. With `maxmemory-policy` set to an LRU variant, it holds the timestamp of the last access, sampled from the global LRU clock at 1-second resolution (`LRU_CLOCK_RESOLUTION 1000` ms, `object.h:92`). With LFU, the same 24 bits are split: the low 8 bits are an access-frequency counter, and the high 16 bits are the last-decrement timestamp. The field max is `LRU_CLOCK_MAX = (1<<24)-1`.

**`ptr`** — points to the actual payload: an `sds` for strings, a `dict *` for hash tables, a `quicklist *` for lists, a `zskiplist` + `dict` pair for sorted sets, etc. For `OBJ_ENCODING_INT`, the pointer slot itself holds the integer value (cast via `(void*)(long)n`), avoiding a separate allocation.

---

### The `kvobj` extension

When a value lives in the main keyspace dict, it is wrapped as a `kvobj` (`iskvobj=1`). The allocation is a single contiguous block:

```
[ metadata blocks (8 bytes each, reverse order) ][ redisObject ][ key-hdr-size byte ][ SDS key ][ optional embedded SDS value ]
                                                  ^-- kvobjCreate() returns this pointer
```

The key string is embedded *inline* after the struct rather than being a separate allocation. For small string values, the value SDS can also be embedded inline after the key, making the entire key+value a single `zmalloc` block. `kvobjGetKey(kv)` recovers the inline key pointer; `kvobjGetExpire(kv)` reads the expiry from the class-0 metadata block at `kv - 8` bytes.

---

### Summary of the two-level type system

The `type` + `encoding` pair is the core of the design. `type` answers "what is this semantically?" (visible to commands and clients), while `encoding` answers "how is it physically stored right now?" (an internal optimization detail). Commands dispatch on `type`; memory-layout decisions and encoding promotions are driven entirely by `encoding`. Every other field in the struct exists for lifecycle (`refcount`), eviction (`lru`), and the new embedded-key scheme (`iskvobj`, `metabits`).
