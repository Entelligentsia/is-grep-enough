# transcript: I'm reasoning about Bitcoin's UTXO model and how a single unspent output is represented in memory while it sits in the coins cache. I need to understand the ...


💬 Let me read the relevant source file directly.
  ▸ Read(/home/bench/repos/bitcoin/src/coins.h)

💬 Let me also check `CTxOut` to complete the picture.
  ▸ Bash(grep -n "class CTxOut\|struct CTxOut\|CAmount\|scriptPubKey\|SetNull\|IsNull" /home/bench/repos/bitcoin/src/primitives/transaction.h | head -40)

💬 Here is the complete anatomy of a UTXO in the coins cache.  ---  ## The `Coin` struct (`src/coins.h:34–90`)  This is the core unit. It holds exactly three th...

──────── RESULT (success, 44559ms, 3 turns) ────────
Here is the complete anatomy of a UTXO in the coins cache.

---

## The `Coin` struct (`src/coins.h:34–90`)

This is the core unit. It holds exactly three things:

```cpp
CTxOut  out;              // the output itself
bool    fCoinBase : 1;    // was the creating tx a coinbase?
uint32_t nHeight  : 31;   // block height of the creating tx
```

### `CTxOut out` (`src/primitives/transaction.h:139–168`)

`CTxOut` carries the two fields that define what the output *is*:

- `CAmount nValue` — satoshi value (an `int64_t`)
- `CScript scriptPubKey` — the locking script

This is exactly what will be handed to the script interpreter when something tries to spend the coin.

### `fCoinBase` and `nHeight` as bit-fields

Both are declared as C++ bit-fields sharing a 32-bit word:

```cpp
bool     fCoinBase : 1;   // 1 bit
uint32_t nHeight   : 31;  // 31 bits
```

Together they take 4 bytes. `nHeight` can represent up to ~2.1 billion blocks, which is far beyond any practical concern.

---

## How "spent" is encoded

There is **no separate boolean** for spentness. The convention is that a spent coin has its `out` field nulled out (`out.SetNull()` clears `nValue` to `-1` and empties `scriptPubKey`). So:

```cpp
bool IsSpent() const { return out.IsNull(); }   // coins.h:83
```

When `SpendCoin()` is called, it clears `out` in place and leaves the `Coin` object (with its nulled `out`) in the cache as a tombstone, still marked DIRTY, so the parent cache layer learns the coin was consumed.

---

## Persistence packing (`Serialize` / `Unserialize`, `coins.h:64–78`)

When written to LevelDB, height and coinbase are packed into a single VARINT:

```cpp
uint32_t code = (uint32_t{nHeight} << 1) | uint32_t{fCoinBase};
::Serialize(s, VARINT(code));
::Serialize(s, Using<TxOutCompression>(out));
```

The coinbase flag occupies bit 0; the height occupies bits 1–31. On read, the inverse:

```cpp
nHeight   = code >> 1;
fCoinBase = code & 1;
```

The `CTxOut` is then serialized with `TxOutCompression`, which uses compact encoding for common script patterns and compressed amounts.

---

## The cache wrapper: `CCoinsCacheEntry` (`coins.h:109–209`)

The cache doesn't store bare `Coin` objects; each is wrapped in a `CCoinsCacheEntry`:

```cpp
struct CCoinsCacheEntry {
    Coin coin;           // the actual data
    uint8_t m_flags;     // DIRTY=1, FRESH=2
    CoinsCachePair* m_prev;
    CoinsCachePair* m_next;
};
```

- **DIRTY** (`1<<0`): this entry differs from what the parent cache holds. If a modified coin is *not* marked DIRTY, it will never be flushed and the change is silently lost — a consensus failure.
- **FRESH** (`1<<1`): the parent cache has no record of this coin (either it was never there, or it was already spent there). A FRESH coin that gets spent can be deleted entirely without telling the parent — it's an optimization that avoids a round-trip write of "coin exists, now coin is gone."

The `m_prev`/`m_next` pointers link all flagged (DIRTY or FRESH) entries into a circular doubly-linked list rooted at a sentinel (`m_sentinel` in `CCoinsViewCache`). This lets `Flush()`/`Sync()` iterate only modified entries rather than scanning the entire map.

---

## The map itself (`coins.h:219–224`)

```cpp
using CCoinsMap = std::unordered_map<
    COutPoint,
    CCoinsCacheEntry,
    SaltedOutpointHasher,
    std::equal_to<COutPoint>,
    PoolAllocator<CoinsCachePair, sizeof(CoinsCachePair) + sizeof(void*) * 4>
>;
```

The key is `COutPoint` (txid + output index). The value is a `CCoinsCacheEntry`. A custom pool allocator is used to reduce per-node heap overhead, which matters at the scale of millions of UTXOs.

---

**Summary of the lifecycle of one entry:** a new coin arrives → `Coin` is constructed with a live `CTxOut`, a height, and a coinbase flag → it's placed in `cacheCoins` as a `CCoinsCacheEntry` marked DIRTY|FRESH → when spent, `out.SetNull()` makes `IsSpent()` true, FRESH drops but DIRTY stays so the deletion propagates → on flush, the entry is written to the parent and then erased from the map.
