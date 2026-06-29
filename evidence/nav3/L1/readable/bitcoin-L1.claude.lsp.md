# transcript: I'm reasoning about Bitcoin's UTXO model and how a single unspent output is represented in memory while it sits in the coins cache. I need to understand the ...

  ▸ ToolSearch(select:LSP)
  ▸ LSP(Coin)
  ▸ LSP(Coin)

💬 The LSP index isn't ready yet, so let me read the source directly.
  ▸ Read(/home/bench/repos/bitcoin/src/coins.h)

💬 Now let me also look at `CTxOut` to complete the picture.
  ▸ LSP(CTxOut)
  ▸ Read(/home/bench/repos/bitcoin/src/primitives/transaction.h)

💬 Good. Now I have everything needed to give a thorough walkthrough.  ---  ## The `Coin` struct — a single UTXO in the coins cache  The canonical type is `clas...

──────── RESULT (success, 76246ms, 7 turns) ────────
Good. Now I have everything needed to give a thorough walkthrough.

---

## The `Coin` struct — a single UTXO in the coins cache

The canonical type is `class Coin` defined at `src/coins.h:34–90`. Here is every field and how they fit together.

---

### The output itself — `CTxOut out` (line 38)

```cpp
CTxOut out;
```

`CTxOut` (defined at `src/primitives/transaction.h:139`) carries exactly two things:

| field | type | meaning |
|---|---|---|
| `nValue` | `CAmount` (int64_t, satoshis) | how much bitcoin is locked in this output |
| `scriptPubKey` | `CScript` (byte vector) | the locking script — P2PKH, P2WPKH, P2TR, etc. |

These are the raw on-chain fields that a spending transaction must satisfy.

---

### Spent vs unspent — `out.IsNull()` (line 83–85)

```cpp
bool IsSpent() const {
    return out.IsNull();
}
```

There is no explicit boolean "is this spent." Instead, `CTxOut::SetNull()` sets `nValue = -1` and clears the script. A `Coin` whose `out` is null has either never existed or has been spent. This is how the cache encodes a "tombstone": the `Coin` object stays in the map but its `out` is nulled, telling the cache hierarchy that the UTXO was consumed and the parent layer needs to know.

---

### Height and coinbase origin — two bitfields packed into 32 bits (lines 41–44)

```cpp
bool fCoinBase : 1;
uint32_t nHeight : 31;
```

Both fields live in a single 32-bit word at the language level:

- **`nHeight`** — the block height at which the creating transaction was confirmed. A 31-bit unsigned integer, giving a maximum representable height of 2,147,483,647 — far beyond any foreseeable chain.
- **`fCoinBase`** — a 1-bit flag that is true when the creating transaction is a coinbase (the first transaction in a block, which mints new coins). This matters for consensus: coinbase outputs have a 100-block maturity rule before they can be spent.

Neither of these is part of `CTxOut` on the wire; they are inferred from the block that contained the transaction and stored alongside the output so the node does not have to look up the block again at spend time.

---

### How height and coinbase are packed on disk (lines 64–77)

When a `Coin` is serialized to LevelDB, the two metadata fields are packed into one VARINT:

```cpp
void Serialize(Stream &s) const {
    uint32_t code{(uint32_t{nHeight} << 1) | uint32_t{fCoinBase}};
    ::Serialize(s, VARINT(code));
    ::Serialize(s, Using<TxOutCompression>(out));
}

void Unserialize(Stream &s) {
    uint32_t code = 0;
    ::Unserialize(s, VARINT(code));
    nHeight = code >> 1;
    fCoinBase = code & 1;
    ::Unserialize(s, Using<TxOutCompression>(out));
}
```

The encoding is documented in the class comment at line 31:

```
VARINT((height << 1) | (coinbase ? 1 : 0))
```

- Bit 0 of the VARINT is the coinbase flag.
- Bits 1–31 are the height (right-shifted back out on read).

This is followed by the `CTxOut` serialized through `TxOutCompression`, which compresses common script patterns and the value to save disk space. The result is that each UTXO on disk is very compact: typically one VARINT for the code, one VARINT for the compressed value, and the script.

---

### How `Coin` sits in the cache — `CCoinsCacheEntry` (lines 109–209)

The in-memory coins cache (`CCoinsViewCache`) holds entries as:

```cpp
using CCoinsMap = std::unordered_map<COutPoint, CCoinsCacheEntry, ...>;
```

`CCoinsCacheEntry` wraps the `Coin` with cache bookkeeping:

| member | purpose |
|---|---|
| `Coin coin` | the actual UTXO data |
| `m_flags` (DIRTY / FRESH) | whether the entry differs from the parent layer |
| `m_prev` / `m_next` | intrusive doubly-linked list of all flagged entries |

**DIRTY** means the entry may differ from what the parent cache holds; it must be written down on flush. **FRESH** means the parent either has no record of this outpoint or considers it already spent, so if this coin is later spent in the same cache, the entry can be dropped entirely without writing a tombstone to the parent.

The linked list of flagged entries lets `Flush()` / `Sync()` iterate only modified coins rather than scanning the whole map — an important performance property given the cache can hold millions of UTXOs.

---

### Summary diagram

```
CCoinsMap (unordered_map keyed by COutPoint)
  └── CCoinsCacheEntry
        ├── Coin coin
        │     ├── CTxOut out
        │     │     ├── nValue       (int64_t satoshis, or -1 if spent/null)
        │     │     └── scriptPubKey (locking script)
        │     ├── fCoinBase : 1      (1 = coinbase tx)
        │     └── nHeight   : 31     (block height of creating tx)
        ├── m_flags (DIRTY | FRESH)
        └── m_prev / m_next  (flagged-entry linked list)

On disk (LevelDB):
  key:   COutPoint (txid + vout index)
  value: VARINT(nHeight<<1 | fCoinBase) || TxOutCompression(out)
```

The single most important design choice is that `IsSpent()` is purely `out.IsNull()`: there is no separate boolean, so a spent coin and a never-loaded coin look identical at the `Coin` level — the cache distinguishes them through the DIRTY/FRESH flags on the surrounding `CCoinsCacheEntry`.
