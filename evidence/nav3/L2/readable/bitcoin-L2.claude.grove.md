# transcript: To predict whether a transaction fails the stateless sanity checks before any chain context is consulted — and to know where that check is actually invoked d...


💬 I'll use grove to locate the stateless check function and then trace its callers through block validation and mempool acceptance.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__callers,mcp__grove__source,mcp__grove__outline)
  ▸ mcp__grove__symbols({"dir":"src","name":"CheckTransaction"})
  ▸ mcp__grove__source({"id":"cpp:src/consensus/tx_check.cpp#CheckTransaction@11"})
  ▸ mcp__grove__callers({"dir":"src","name":"CheckTransaction"})

💬 The two production call sites are `validation.cpp:802` (mempool path) and `validation.cpp:3968` (inside `CheckBlock`). Let me read both in context.
  ▸ mcp__grove__outline({"file":"src/validation.cpp","kind":"function","detail":0})

💬 Now let me read the two call sites and their surrounding context in parallel.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Good. Now let me read the `PreChecks` header and the function that calls it, plus where `CheckBlock` feeds into block acceptance.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ mcp__grove__source({"file":"src/validation.cpp","name":"AcceptSingleTransactionInternal"})
  ▸ mcp__grove__callers({"dir":"src","name":"CheckBlock"})

💬 Let me now read the three production `CheckBlock` call sites — `ConnectBlock`, `AcceptBlock`, and `ProcessNewBlock`.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me look at `AcceptSingleTransactionInternal` to see how it handles a `PreChecks` failure, and also check `AcceptMultipleTransactionsInternal` for pac...
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 I have everything I need. Here is the complete picture.  ---  ## The stateless check: `CheckTransaction`  **`src/consensus/tx_check.cpp:11`** — `bool CheckTr...

──────── RESULT (success, 191677ms, 15 turns) ────────
I have everything I need. Here is the complete picture.

---

## The stateless check: `CheckTransaction`

**`src/consensus/tx_check.cpp:11`** — `bool CheckTransaction(const CTransaction& tx, TxValidationState& state)`

This is the sole context-free sanity gate. It consults no chain state, no UTXO set, and no mempool — only the transaction's own fields:

| Check | Reject reason |
|---|---|
| `tx.vin` non-empty | `bad-txns-vin-empty` |
| `tx.vout` non-empty | `bad-txns-vout-empty` |
| Non-witness serialized size ≤ `MAX_BLOCK_WEIGHT / WITNESS_SCALE_FACTOR` | `bad-txns-oversize` |
| Each output value ≥ 0 and ≤ `MAX_MONEY`; running total in range (CVE-2010-5139) | `bad-txns-vout-negative` / `bad-txns-vout-toolarge` / `bad-txns-txouttotal-toolarge` |
| No duplicate `COutPoint` among inputs (CVE-2018-17144) | `bad-txns-inputs-duplicate` |
| Coinbase scriptSig length 2–100 bytes | `bad-cb-length` |
| Non-coinbase: no null prevouts | `bad-txns-prevout-null` |

Every failure path sets `TxValidationResult::TX_CONSENSUS` — the check is purely consensus-critical, never policy.

---

## Mempool acceptance path

**Call site:** `MemPoolAccept::PreChecks` (`validation.cpp:802`) — the very first statement of the function, before any policy or coin-availability checks.

```cpp
// validation.cpp:802
if (!CheckTransaction(tx, state)) {
    return false; // state filled in by CheckTransaction
}
```

**`PreChecks` is called by** `MemPoolAccept::AcceptSingleTransactionInternal` (`validation.cpp:1331`):

```cpp
if (!PreChecks(args, ws)) {
    if (ws.m_state.GetResult() == TxValidationResult::TX_RECONSIDERABLE) {
        return MempoolAcceptResult::FeeFailure(...);
    }
    return MempoolAcceptResult::Failure(ws.m_state);
}
```

Because `CheckTransaction` always sets `TX_CONSENSUS` (never `TX_RECONSIDERABLE`), a failure here returns **`MempoolAcceptResult::Failure`** immediately — the transaction is rejected outright. No script checks, no fee checks, no coin lookups are attempted. Package acceptance goes through the same `PreChecks` call for each transaction individually via `AcceptMultipleTransactionsInternal`.

---

## Block-checking path

**Call site:** `CheckBlock` (`validation.cpp:3966–3975`) — iterates every transaction in the block:

```cpp
for (const auto& tx : block.vtx) {
    TxValidationState tx_state;
    if (!CheckTransaction(*tx, tx_state)) {
        assert(tx_state.GetResult() == TxValidationResult::TX_CONSENSUS);
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS,
                             tx_state.GetRejectReason(),
                             strprintf("Transaction check failed (tx hash %s) %s",
                                       tx->GetHash().ToString(),
                                       tx_state.GetDebugMessage()));
    }
}
```

The `assert` documents that this check can only ever produce a consensus failure. The per-transaction `TxValidationState` is then promoted into the block's `BlockValidationState` with `BLOCK_CONSENSUS`.

`CheckBlock` itself is called in three production places, each handling failure differently:

### 1. `ProcessNewBlock` (`validation.cpp:4423`)

```cpp
bool ret = CheckBlock(*block, state, GetConsensus());
if (ret) {
    ret = AcceptBlock(block, state, &pindex, ...);
}
if (!ret) {
    if (m_options.signals) m_options.signals->BlockChecked(block, state);
    LogError(...);
    return false;
}
```

This is the **entry point for blocks received from the network**. `CheckBlock` runs first, *before* `AcceptBlock`. If it fails, `AcceptBlock` is **never called** — the block is neither written to disk nor added to the block index, and therefore **never permanently marked invalid**. The `BlockChecked` signal fires (informing net\_processing to penalize the peer), and `ProcessNewBlock` returns `false`. This design is intentional protection against malleability attacks (see CVE-2012-2459): a block that fails a cheap structural check cannot cause a permanently-invalid marking that would prevent the node from accepting the correct version of that block.

### 2. `AcceptBlock` (`validation.cpp:4357`)

```cpp
if (!CheckBlock(block, state, params.GetConsensus()) ||
    !ContextualCheckBlock(block, state, *this, pindex->pprev)) {
    if (Assume(state.IsInvalid())) {
        ActiveChainstate().InvalidBlockFound(pindex, state);
    }
    LogError(...);
    return false;
}
```

Under normal operation, when reached from `ProcessNewBlock`, `CheckBlock` has already set `block.fChecked = true` on success, so this call returns immediately (the `fChecked` fast-path at line 3929). `AcceptBlock`'s own `CheckBlock` call is therefore a defense-in-depth guard. If it *did* fail here (hardware corruption, a bug), the consequence is **different from `ProcessNewBlock`**: `InvalidBlockFound` is called, permanently marking `pindex` as invalid in the block index. The block is not stored.

### 3. `Chainstate::ConnectBlock` (`validation.cpp:2326`)

```cpp
if (!CheckBlock(block, state, params.GetConsensus(), !fJustCheck, !fJustCheck)) {
    if (state.GetResult() == BlockValidationResult::BLOCK_MUTATED) {
        return FatalError(..., _("Corrupt block found indicating potential hardware failure."));
    }
    LogError(...);
    return false;
}
```

Called when a block is being connected to the active chain. Again, `fChecked` normally short-circuits this. The `BLOCK_MUTATED` branch exists specifically for hardware-fault detection: if a block that previously passed all checks now fails because its bytes changed on disk, the node treats this as a fatal hardware error and shuts down. Any other failure just returns `false`, rolling back the `ConnectBlock` call and preventing chain advancement.

---

## Summary of the flow

```
New block from network
  └─ ProcessNewBlock
       ├─ CheckBlock ──(fail)──► BlockChecked signal + return false
       │     └─ CheckTransaction per tx
       └─ AcceptBlock
            ├─ CheckBlock (no-op: fChecked=true) ──(fail)──► InvalidBlockFound + return false
            └─ [store to disk, index]
                  └─ ActivateBestChain → ConnectBlock
                       └─ CheckBlock (no-op: fChecked=true)
                            └─ if BLOCK_MUTATED → FatalError

New mempool tx
  └─ AcceptToMemoryPool → AcceptSingleTransaction → AcceptSingleTransactionInternal
       └─ PreChecks
            └─ CheckTransaction ──(fail)──► MempoolAcceptResult::Failure (TX_CONSENSUS)
```

The key asymmetry: a `CheckTransaction` failure during block processing never permanently invalidates the block index (because `ProcessNewBlock` gates `AcceptBlock` on it), while the same failure in `PreChecks` simply drops the transaction from mempool consideration with no further consequences.
