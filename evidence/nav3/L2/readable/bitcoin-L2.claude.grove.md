# bitcoin · L2 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **bitcoin** (cpp) @ `6d8e15dff`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | bitcoin (cpp) · L2 |
| pinned source | `6d8e15dff015d3df8e87de63e650a5aee32ff12f` |
| status | completed |
| engagement | `grove_tools = 6` (gate: > 0 → ✓ used its capability) |
| turns | 15 |
| wall clock | 192 s |
| context (peak) | 279,679 tokens |
| cost (billed) | $0.3084 |
| &nbsp;&nbsp;↳ token split | in 15 · out 5,937 · cache-create 23,631 · cache-read 256,033 |
| tool calls | 14 (Read×7, mcp__grove__source×2, mcp__grove__callers×2, ToolSearch×1, mcp__grove__symbols×1, mcp__grove__outline×1) |
| evidence | `evidence/nav3/L2/raw/bitcoin-L2.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To predict whether a transaction fails the stateless sanity checks before any chain context is consulted — and to know where that check is actually invoked during normal operation — I need to understand the routine that performs the context-free validity check on a transaction, together with the validation paths that call into it. Help me see where that check is applied during block checking and during mempool acceptance, and what each caller does when the check reports the transaction invalid.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll use grove to locate the stateless check function and then trace its callers through block validation and mempool acceptance.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__symbols,mcp__grove__callers,mcp__grove__source,mcp__grove__outline)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(CheckTransaction)`
&nbsp;&nbsp;▸ `mcp__grove__source(cpp:src/consensus/tx_check.cpp#CheckTransaction@11)`
&nbsp;&nbsp;▸ `mcp__grove__callers(CheckTransaction)`

💬 The two production call sites are `validation.cpp:802` (mempool path) and `validation.cpp:3968` (inside `CheckBlock`). Let me read both in context.

&nbsp;&nbsp;▸ `mcp__grove__outline(src/validation.cpp)`

💬 Now let me read the two call sites and their surrounding context in parallel.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 Good. Now let me read the `PreChecks` header and the function that calls it, plus where `CheckBlock` feeds into block acceptance.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `mcp__grove__source(AcceptSingleTransactionInternal)`
&nbsp;&nbsp;▸ `mcp__grove__callers(CheckBlock)`

💬 Let me now read the three production `CheckBlock` call sites — `ConnectBlock`, `AcceptBlock`, and `ProcessNewBlock`.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 Now let me look at `AcceptSingleTransactionInternal` to see how it handles a `PreChecks` failure, and also check `AcceptMultipleTransactionsInternal` for package paths.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 I have everything I need. Here is the complete picture.

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


## Final answer

_Result event — success, 192 s, 15 turns._

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

