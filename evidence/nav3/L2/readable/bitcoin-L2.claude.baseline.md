# bitcoin · L2 · baseline — readable transcript

> baseline — text search (bash + coreutils), over **bitcoin** (cpp) @ `6d8e15dff`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `baseline` — text search (bash + coreutils) |
| repo · rung | bitcoin (cpp) · L2 |
| pinned source | `6d8e15dff015d3df8e87de63e650a5aee32ff12f` |
| status | completed |
| engagement | `bash_calls = 6` (gate: > 0 → ✓ used its capability) |
| turns | 17 |
| wall clock | 72 s |
| context (peak) | 305,286 tokens |
| cost (billed) | $0.2678 |
| &nbsp;&nbsp;↳ token split | in 12 · out 3,307 · cache-create 22,096 · cache-read 283,178 |
| tool calls | 16 (Read×10, Bash×6) |
| evidence | `evidence/nav3/L2/raw/bitcoin-L2.claude.baseline.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To predict whether a transaction fails the stateless sanity checks before any chain context is consulted — and to know where that check is actually invoked during normal operation — I need to understand the routine that performs the context-free validity check on a transaction, together with the validation paths that call into it. Help me see where that check is applied during block checking and during mempool acceptance, and what each caller does when the check reports the transaction invalid.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll locate the stateless check routine and trace its call sites in both block validation and mempool acceptance paths.

&nbsp;&nbsp;▸ `Bash(grep -rn "CheckTransaction" /home/bench/repos/bitcoin/src/ --include="*.cpp" --include="*.h" | grep -v "\.pyc" | sort)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/bitcoin/src/consensus/ -name "*.cpp" -o -name "*.h" | sort)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/consensus/tx_check.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/consensus/tx_check.h)`

💬 Now let me read both call sites in `validation.cpp`:

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 Now let me find the function that contains the block-checking call site and the `PreChecks` function name:

&nbsp;&nbsp;▸ `Bash(grep -n "CheckBlock\|bool CheckBlock" /home/bench/repos/bitcoin/src/validation.cpp | head -20)`
&nbsp;&nbsp;▸ `Bash(grep -n "PreChecks\|bool.*PreChecks\|MemPoolAccept::PreChecks" /home/bench/repos/bitcoin/src/validation.cpp | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Bash(grep -n "bool.*ConnectBlock\|ConnectBlock(" /home/bench/repos/bitcoin/src/validation.cpp | head -10)`
&nbsp;&nbsp;▸ `Bash(grep -n "AcceptBlock\b\|AcceptBlock(" /home/bench/repos/bitcoin/src/validation.cpp | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 Now I have everything needed for a complete answer. Let me also quickly check what `TxValidationResult::TX_CONSENSUS` means in terms of banning behavior:

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/consensus/validation.h)`

💬 Here is the complete picture.

---

## The stateless check: `CheckTransaction`

**`src/consensus/tx_check.cpp:11`** — `bool CheckTransaction(const CTransaction& tx, TxValidationState& state)`

This is the one function that performs all context-free validity checks — no UTXO set, no chain tip, no mempool. It enforces:

| Check | Reject reason |
|---|---|
| At least one input | `bad-txns-vin-empty` |
| At least one output | `bad-txns-vout-empty` |
| Non-witness serialized size × 4 ≤ `MAX_BLOCK_WEIGHT` | `bad-txns-oversize` |
| No output value negative | `bad-txns-vout-negative` |
| No single output > `MAX_MONEY` (21M BTC) | `bad-txns-vout-toolarge` |
| Sum of outputs in `MoneyRange` (CVE-2010-5139) | `bad-txns-txouttotal-toolarge` |
| No duplicate `COutPoint` among inputs (CVE-2018-17144) | `bad-txns-inputs-duplicate` |
| Coinbase scriptSig length 2–100 bytes | `bad-cb-length` |
| Non-coinbase inputs have non-null prevouts | `bad-txns-prevout-null` |

All failures write `TxValidationResult::TX_CONSENSUS` into the state and return `false`. The function never looks at the chain or mempool.

---

## Call site 1 — mempool acceptance (`MemPoolAccept::PreChecks`)

**`src/validation.cpp:786`** — `bool MemPoolAccept::PreChecks(ATMPArgs& args, Workspace& ws)`

`CheckTransaction` is the **first thing** `PreChecks` does (line 802):

```cpp
if (!CheckTransaction(tx, state)) {
    return false; // state filled in by CheckTransaction
}
```

`PreChecks` returns `false` immediately; the result code in `state` is `TX_CONSENSUS`.

`PreChecks` is called in two places:

- **Single-tx path** — `AcceptSingleTransactionInternal` (`validation.cpp:1331`):
  ```cpp
  if (!PreChecks(args, ws)) {
      if (ws.m_state.GetResult() == TxValidationResult::TX_RECONSIDERABLE) { ... }
      return MempoolAcceptResult::Failure(ws.m_state);
  }
  ```
  A `TX_CONSENSUS` result is not `TX_RECONSIDERABLE`, so it goes straight to `MempoolAcceptResult::Failure`, which packages the `TxValidationState` into the returned result object. The transaction is never added to the mempool. The caller (ultimately the P2P layer or RPC) receives that failure result and can use the reject reason string (`bad-txns-*`) to decide whether to penalise the peer.

- **Package path** — `AcceptPackageTransactions` (`validation.cpp:1453–1459`):
  ```cpp
  if (!PreChecks(args, ws)) {
      package_state.Invalid(PackageValidationResult::PCKG_TX, "transaction failed");
      results.emplace(ws.m_ptx->GetWitnessHash(), MempoolAcceptResult::Failure(ws.m_state));
      return PackageMempoolAcceptResult(package_state, std::move(results));
  }
  ```
  Early-exit: the failing tx's result is stored in the per-wtxid map, the package state is set to `PCKG_TX`, and the entire package is aborted (remaining transactions stay unprocessed).

---

## Call site 2 — block validation (`CheckBlock`)

**`src/validation.cpp:3925`** — `bool CheckBlock(const CBlock& block, BlockValidationState& state, ...)`

`CheckTransaction` is called in a loop over every transaction in the block (line 3966–3974):

```cpp
for (const auto& tx : block.vtx) {
    TxValidationState tx_state;
    if (!CheckTransaction(*tx, tx_state)) {
        assert(tx_state.GetResult() == TxValidationResult::TX_CONSENSUS);
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS, tx_state.GetRejectReason(),
                             strprintf("Transaction check failed (tx hash %s) %s", ...));
    }
}
```

The assert documents the invariant: `CheckTransaction` can only produce `TX_CONSENSUS` failures. The failure is translated into a `BlockValidationResult::BLOCK_CONSENSUS` on the block's `BlockValidationState`, and `CheckBlock` returns `false`.

`CheckBlock` itself is invoked in two contexts:

- **`ChainstateManager::AcceptBlock`** (`validation.cpp:4357`) — when a new block arrives from the network or RPC. If `CheckBlock` fails, `InvalidBlockFound(pindex, state)` is called to mark the block's index entry as permanently invalid, and `false` is returned to the caller (`ProcessNewBlock`).

- **`Chainstate::ConnectBlock`** (`validation.cpp:2326`) — when activating a block onto the chain tip (including re-checking on software upgrades). If `CheckBlock` fails with `BLOCK_MUTATED`, it is treated as a fatal hardware error. Any other consensus failure causes `ConnectBlock` to return `false`, which cascades up through `ActivateBestChainStep` to invalidate the chain.

---

## Summary of the failure propagation

```
CheckTransaction (TX_CONSENSUS)
│
├── via PreChecks (mempool path)
│   ├── Single tx → MempoolAcceptResult::Failure  → tx rejected, not added
│   └── Package  → PackageMempoolAcceptResult with PCKG_TX, early exit
│
└── via CheckBlock (block path)
    ├── AcceptBlock → InvalidBlockFound(pindex) → block marked permanently invalid
    └── ConnectBlock → chain activation aborted
```

The key design detail: `CheckTransaction` always emits `TX_CONSENSUS`, never a policy code. This is checked by the `assert` in `CheckBlock` and means that any failure here is treated as a hard consensus violation — not something that can be retried with different fee rates or package topology.


## Final answer

_Result event — success, 72 s, 17 turns._

Here is the complete picture.

---

## The stateless check: `CheckTransaction`

**`src/consensus/tx_check.cpp:11`** — `bool CheckTransaction(const CTransaction& tx, TxValidationState& state)`

This is the one function that performs all context-free validity checks — no UTXO set, no chain tip, no mempool. It enforces:

| Check | Reject reason |
|---|---|
| At least one input | `bad-txns-vin-empty` |
| At least one output | `bad-txns-vout-empty` |
| Non-witness serialized size × 4 ≤ `MAX_BLOCK_WEIGHT` | `bad-txns-oversize` |
| No output value negative | `bad-txns-vout-negative` |
| No single output > `MAX_MONEY` (21M BTC) | `bad-txns-vout-toolarge` |
| Sum of outputs in `MoneyRange` (CVE-2010-5139) | `bad-txns-txouttotal-toolarge` |
| No duplicate `COutPoint` among inputs (CVE-2018-17144) | `bad-txns-inputs-duplicate` |
| Coinbase scriptSig length 2–100 bytes | `bad-cb-length` |
| Non-coinbase inputs have non-null prevouts | `bad-txns-prevout-null` |

All failures write `TxValidationResult::TX_CONSENSUS` into the state and return `false`. The function never looks at the chain or mempool.

---

## Call site 1 — mempool acceptance (`MemPoolAccept::PreChecks`)

**`src/validation.cpp:786`** — `bool MemPoolAccept::PreChecks(ATMPArgs& args, Workspace& ws)`

`CheckTransaction` is the **first thing** `PreChecks` does (line 802):

```cpp
if (!CheckTransaction(tx, state)) {
    return false; // state filled in by CheckTransaction
}
```

`PreChecks` returns `false` immediately; the result code in `state` is `TX_CONSENSUS`.

`PreChecks` is called in two places:

- **Single-tx path** — `AcceptSingleTransactionInternal` (`validation.cpp:1331`):
  ```cpp
  if (!PreChecks(args, ws)) {
      if (ws.m_state.GetResult() == TxValidationResult::TX_RECONSIDERABLE) { ... }
      return MempoolAcceptResult::Failure(ws.m_state);
  }
  ```
  A `TX_CONSENSUS` result is not `TX_RECONSIDERABLE`, so it goes straight to `MempoolAcceptResult::Failure`, which packages the `TxValidationState` into the returned result object. The transaction is never added to the mempool. The caller (ultimately the P2P layer or RPC) receives that failure result and can use the reject reason string (`bad-txns-*`) to decide whether to penalise the peer.

- **Package path** — `AcceptPackageTransactions` (`validation.cpp:1453–1459`):
  ```cpp
  if (!PreChecks(args, ws)) {
      package_state.Invalid(PackageValidationResult::PCKG_TX, "transaction failed");
      results.emplace(ws.m_ptx->GetWitnessHash(), MempoolAcceptResult::Failure(ws.m_state));
      return PackageMempoolAcceptResult(package_state, std::move(results));
  }
  ```
  Early-exit: the failing tx's result is stored in the per-wtxid map, the package state is set to `PCKG_TX`, and the entire package is aborted (remaining transactions stay unprocessed).

---

## Call site 2 — block validation (`CheckBlock`)

**`src/validation.cpp:3925`** — `bool CheckBlock(const CBlock& block, BlockValidationState& state, ...)`

`CheckTransaction` is called in a loop over every transaction in the block (line 3966–3974):

```cpp
for (const auto& tx : block.vtx) {
    TxValidationState tx_state;
    if (!CheckTransaction(*tx, tx_state)) {
        assert(tx_state.GetResult() == TxValidationResult::TX_CONSENSUS);
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS, tx_state.GetRejectReason(),
                             strprintf("Transaction check failed (tx hash %s) %s", ...));
    }
}
```

The assert documents the invariant: `CheckTransaction` can only produce `TX_CONSENSUS` failures. The failure is translated into a `BlockValidationResult::BLOCK_CONSENSUS` on the block's `BlockValidationState`, and `CheckBlock` returns `false`.

`CheckBlock` itself is invoked in two contexts:

- **`ChainstateManager::AcceptBlock`** (`validation.cpp:4357`) — when a new block arrives from the network or RPC. If `CheckBlock` fails, `InvalidBlockFound(pindex, state)` is called to mark the block's index entry as permanently invalid, and `false` is returned to the caller (`ProcessNewBlock`).

- **`Chainstate::ConnectBlock`** (`validation.cpp:2326`) — when activating a block onto the chain tip (including re-checking on software upgrades). If `CheckBlock` fails with `BLOCK_MUTATED`, it is treated as a fatal hardware error. Any other consensus failure causes `ConnectBlock` to return `false`, which cascades up through `ActivateBestChainStep` to invalidate the chain.

---

## Summary of the failure propagation

```
CheckTransaction (TX_CONSENSUS)
│
├── via PreChecks (mempool path)
│   ├── Single tx → MempoolAcceptResult::Failure  → tx rejected, not added
│   └── Package  → PackageMempoolAcceptResult with PCKG_TX, early exit
│
└── via CheckBlock (block path)
    ├── AcceptBlock → InvalidBlockFound(pindex) → block marked permanently invalid
    └── ConnectBlock → chain activation aborted
```

The key design detail: `CheckTransaction` always emits `TX_CONSENSUS`, never a policy code. This is checked by the `assert` in `CheckBlock` and means that any failure here is treated as a hard consensus violation — not something that can be retried with different fee rates or package topology.

