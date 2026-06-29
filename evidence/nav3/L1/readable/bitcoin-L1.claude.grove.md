# transcript: I'm reasoning about Bitcoin's UTXO model and how a single unspent output is represented in memory while it sits in the coins cache. I need to understand the ...


💬 Let me load the grove tools and look at the `Coin` structure directly.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__outline)
  ▸ mcp__grove__symbols({"dir":"src","name":"Coin","kind":"struct"})
  ▸ mcp__grove__outline({"file":"src/coins.h"})
  ▸ Read(/home/bench/repos/bitcoin/src/coins.h)

💬 Now let me also pull the `CTxOut` definition and the `CCoinsCacheEntry` flags.
  ▸ mcp__grove__source({"file":"src/primitives/transaction.h","name":"CTxOut"})
  ▸ Read(/home/bench/repos/bitcoin/src/coins.h)
  ▸ mcp__grove__symbols({"dir":"src/primitives","name":"CTxOut"})
  ▸ mcp__grove__source({"file":"src/primitives/transaction.h","name":"IsNull"})
  ▸ Bash(grep -n "struct CTxOut\|class CTxOut\|nValue\|scriptPubKey\|IsNull" /home/bench/repos/bitcoin/src/primitives/transaction.h | head -30)

💬 I have everything needed. Here's the full picture:  ---  ## `Coin` — the in-memory UTXO entry (`src/coins.h:34`)  ```cpp class Coin { public:     CTxOut   ou...

──────── RESULT (success, 92071ms, 10 turns) ────────
I have everything needed. Here's the full picture:

---

## `Coin` — the in-memory UTXO entry (`src/coins.h:34`)

```cpp
class Coin {
public:
    CTxOut   out;           // the output itself
    bool     fCoinBase : 1; // was the creating tx a coinbase?
    uint32_t nHeight   : 31; // block height of the creating tx
    ...
};
```

### 1. The output itself — `CTxOut out`

`CTxOut` (`src/primitives/transaction.h:139`) carries exactly two things:

| Field | Type | Meaning |
|---|---|---|
| `nValue` | `CAmount` (int64_t) | satoshi value of this output |
| `scriptPubKey` | `CScript` | the locking script |

That's the full economic content of the UTXO.

### 2. Height and coinbase — packed bit-fields

The two metadata fields live in the same 32 bits using C++ bit-fields:

- `fCoinBase : 1` — one bit, records whether the transaction that created this output was a generation (coinbase) transaction
- `nHeight : 31` — thirty-one bits, the block height at which that transaction was confirmed

Together they let the validation engine apply the coinbase maturity rule (100-block lock on spending coinbase outputs) without touching the chain or the output itself.

### 3. Spent vs. unspent — `IsSpent()` (`coins.h:83`)

There is **no separate boolean**. The coin signals its own spent state by nulling out the embedded `CTxOut`:

```cpp
bool IsSpent() const { return out.IsNull(); }
// CTxOut::IsNull() ↓
bool IsNull() const  { return (nValue == -1); }
```

`Clear()` sets `out.SetNull()` (which sets `nValue = -1` and clears the script), zeroes `fCoinBase`, and zeroes `nHeight`. A `Coin` with `out.IsNull()` means either the coin never existed or it has been spent. The coins cache uses this as the tombstone: a `CCoinsCacheEntry` holding a spent `Coin` and marked `DIRTY` tells the parent layer to delete this entry.

### 4. On-disk packing — height and coinbase in one VARINT (`coins.h:64`)

When serialized to the database, the two fields are merged into a single variable-length integer:

```cpp
// Serialize:
uint32_t code = (uint32_t{nHeight} << 1) | uint32_t{fCoinBase};
::Serialize(s, VARINT(code));
::Serialize(s, Using<TxOutCompression>(out));

// Unserialize:
uint32_t code = 0;
::Unserialize(s, VARINT(code));
nHeight   = code >> 1;     // upper 31 bits
fCoinBase = code & 1;      // LSB
```

The coinbase flag rides in **bit 0** and the height is packed into **bits [31:1]**. VARINT encoding means typical heights (well under 2^28) cost only 4 bytes on disk. The output is then stored with `TxOutCompression`, which compresses the value and script together.

The serialized comment in the header (`coins.h:31`) captures this exactly:
```
// VARINT((height << 1) | (coinbase ? 1 : 0))
// the non-spent CTxOut (via TxOutCompression)
```

### 5. The cache wrapper — `CCoinsCacheEntry` (`coins.h:109`)

In the live coins cache, each `Coin` is held inside a `CCoinsCacheEntry`:

```cpp
struct CCoinsCacheEntry {
    Coin coin;           // the actual data
    uint8_t m_flags;    // DIRTY (bit 0) | FRESH (bit 1)
    CoinsCachePair *m_prev, *m_next;  // doubly-linked list of flagged entries
};
```

- **`DIRTY`** — the entry differs from what the parent cache (or DB) holds; must be flushed on the next `Flush()`.
- **`FRESH`** — the parent has no record of this coin at all (or considers it spent). If a `FRESH` coin is later spent within the same cache, the entry can be dropped entirely without telling the parent — no tombstone needed.

The `m_prev`/`m_next` pointers keep all flagged entries threaded into a linked list anchored at a sentinel, so flushing can walk only dirty/fresh entries without scanning the entire map.
