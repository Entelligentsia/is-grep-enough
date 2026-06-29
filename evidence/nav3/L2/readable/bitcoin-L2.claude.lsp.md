# bitcoin · L2 · lsp — readable transcript

> lsp — semantic (native Claude Code LSP tool), over **bitcoin** (cpp) @ `6d8e15dff`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `lsp` — semantic (native Claude Code LSP tool) |
| repo · rung | bitcoin (cpp) · L2 |
| pinned source | `6d8e15dff015d3df8e87de63e650a5aee32ff12f` |
| status | completed |
| engagement | `lsp_tools = 7` (gate: > 0 → ✓ used its capability) |
| turns | 28 |
| wall clock | 132 s |
| context (peak) | 549,227 tokens |
| cost (billed) | $0.4521 |
| &nbsp;&nbsp;↳ token split | in 20 · out 7,279 · cache-create 31,122 · cache-read 518,085 |
| tool calls | 27 (Read×17, LSP×7, Bash×2, ToolSearch×1) |
| evidence | `evidence/nav3/L2/raw/bitcoin-L2.claude.lsp.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To predict whether a transaction fails the stateless sanity checks before any chain context is consulted — and to know where that check is actually invoked during normal operation — I need to understand the routine that performs the context-free validity check on a transaction, together with the validation paths that call into it. Help me see where that check is applied during block checking and during mempool acceptance, and what each caller does when the check reports the transaction invalid.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll load the LSP tool and start with a workspace symbol lookup for the stateless transaction check.

&nbsp;&nbsp;▸ `ToolSearch(select:LSP)`
&nbsp;&nbsp;▸ `LSP(CheckTransaction)`
&nbsp;&nbsp;▸ `LSP(CheckTransaction)`

💬 The LSP index isn't ready yet. Let me read the source directly and then use LSP for position-based lookups once I have line anchors.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/consensus/tx_check.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/consensus/tx_check.h)`

💬 Good. Now let me find all call sites of `CheckTransaction` using LSP references.

&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/bitcoin/src/consensus/tx_check.cpp","line":11,"character":6})`

💬 Only one call site found via LSP. Let me read it in context, and also check for any indirect callers through a grep fallback.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Bash(grep -rn "CheckTransaction" /home/bench/repos/bitcoin/src/ --include="*.cpp" --include="*.h")`

💬 Two production call sites in `validation.cpp` (lines 802 and 3968). Let me read both in context, plus the surrounding functions.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 I need to find the name of the function surrounding line 3968. Let me look a bit earlier in that file to find the function declaration, and also look at the `packages.cpp` call site.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/policy/packages.cpp)`

💬 Now let me find the call chain for `CheckBlock` and `MemPoolAccept::PreChecks` to understand how they fit into the overall pipeline.

&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/bitcoin/src/validation.cpp","line":3925,"character":6})`
&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/bitcoin/src/validation.cpp","line":786,"character":22})`

💬 Let me read the key call sites for `CheckBlock` and `PreChecks` to trace the full pipeline.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 Let me look at the function name enclosing the `ConnectBlock` call at line 2326, and also get the `AcceptSingleTransactionInternal` call chain to understand the entry point.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/bitcoin/src/validation.cpp","line":1323,"character":24})`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 Let me check what calls `AcceptSingleTransactionInternal` (line 1438 call site) to complete the entry-point picture.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 Let me find the top-level `AcceptToMemoryPool` entry point.

&nbsp;&nbsp;▸ `LSP(AcceptToMemoryPool)`
&nbsp;&nbsp;▸ `Bash(grep -n "AcceptToMemoryPool\|AcceptSingleTransactionInternal" /home/bench/repos/bitcoin/src/validation.cpp | head -30)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/validation.cpp)`

💬 I have the full picture. Here's the complete analysis:

---

## The stateless check: `CheckTransaction()`

**`src/consensus/tx_check.cpp:11`**, declared in `src/consensus/tx_check.h:18`.

This is explicitly documented as "context-independent" — it consults no chain state, UTXO set, or mempool. It enforces exactly six structural rules, all tagged `TxValidationResult::TX_CONSENSUS`:

| Check | Reject reason |
|---|---|
| `vin` non-empty | `bad-txns-vin-empty` |
| `vout` non-empty | `bad-txns-vout-empty` |
| Non-witness serialized size × WITNESS_SCALE_FACTOR ≤ MAX_BLOCK_WEIGHT | `bad-txns-oversize` |
| Every output value in `[0, MAX_MONEY]`, total also in range | `bad-txns-vout-negative/toolarge/txouttotal-toolarge` |
| No duplicate `COutPoint` in inputs (`std::set` dedup; see CVE-2018-17144) | `bad-txns-inputs-duplicate` |
| Coinbase scriptSig 2–100 bytes; non-coinbase inputs have non-null prevout | `bad-cb-length` / `bad-txns-prevout-null` |

Because every failure sets `TX_CONSENSUS`, any rejection is treated as a hard consensus violation rather than a policy one.

---

## Mempool acceptance path

### `MemPoolAccept::PreChecks()` — `validation.cpp:786`

`CheckTransaction` is the **very first statement** in `PreChecks` (`validation.cpp:802`):

```cpp
if (!CheckTransaction(tx, state)) {
    return false; // state filled in by CheckTransaction
}
```

If it fails, `PreChecks` returns immediately. The caller receives a populated `TxValidationState` with the reject reason; no further policy checks (standardness, feerate, RBF, script checks) run at all.

### Single-transaction entry point

`PreChecks` is called at `validation.cpp:1331` from `AcceptSingleTransactionInternal()`. On `PreChecks` failure:

```cpp
if (!PreChecks(args, ws)) {
    if (ws.m_state.GetResult() == TxValidationResult::TX_RECONSIDERABLE) { ... fee failure ... }
    return MempoolAcceptResult::Failure(ws.m_state);   // ← wraps the TX_CONSENSUS state
}
```

That `Failure` result propagates up through `AcceptSingleTransactionAndCleanup()` (`validation.cpp:591`) → `AcceptToMemoryPool()` (`validation.cpp:1792`). On any non-`VALID` result, `AcceptToMemoryPool` uncaches every coin it had fetched (to prevent memory-DoS from floods of invalid transactions) and fires the `mempool.rejected` tracepoint.

### Package entry point

`PreChecks` is called per-transaction in `AcceptMultipleTransactionsInternal()` (`validation.cpp:1454`). On failure it immediately elevates to `PackageValidationResult::PCKG_TX`, records `MempoolAcceptResult::Failure(ws.m_state)` for the offending transaction, and returns early — the rest of the package is abandoned.

---

## Block validation path

### `CheckBlock()` — `validation.cpp:3925`

`CheckBlock` is the context-free block checker. After verifying the header, Merkle root, and block-level size limits, it iterates every transaction (`validation.cpp:3966–3974`):

```cpp
for (const auto& tx : block.vtx) {
    TxValidationState tx_state;
    if (!CheckTransaction(*tx, tx_state)) {
        assert(tx_state.GetResult() == TxValidationResult::TX_CONSENSUS);
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS,
                             tx_state.GetRejectReason(), ...);
    }
}
```

The `assert` is a safety invariant: since `CheckTransaction` only ever returns `TX_CONSENSUS` failures, anything else would indicate a coding error. The per-transaction `TxValidationState` is translated into a block-level `BLOCK_CONSENSUS` result, and `CheckBlock` returns false. The comment at `validation.cpp:3947–3951` notes that witness data is not consulted here — witness malleability is deferred to `ContextualCheckBlock`.

### Where `CheckBlock` failures land

`CheckBlock` is called from three production sites, with notably different responses:

**1. `ChainstateManager::ProcessNewBlock()` — `validation.cpp:4423`**
The entry point for P2P-received blocks. If `CheckBlock` fails here, `AcceptBlock` is **skipped entirely** and the block is **not marked invalid** in the block index. The code comment (`validation.cpp:4418–4422`) explains this deliberately: caching a failure would be dangerous if there are unknown forms of block malleability that cause `CheckBlock` to reject a valid block (cf. CVE-2012-2459). The `BlockChecked` signal is emitted with the failure state so peers can be penalized via `net_processing`.

**2. `ChainstateManager::AcceptBlock()` — `validation.cpp:4357`**
Called by `ProcessNewBlock` on success of the outer check. Here `CheckBlock` + `ContextualCheckBlock` are run together:

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

This **does** mark the block index entry as invalid via `InvalidBlockFound`, and the block is written to disk and `ReceivedBlockTransactions` is called only if both pass.

**3. `Chainstate::ConnectBlock()` — `validation.cpp:2326`**
Re-checks the block just before applying UTXO changes, as a safety net against previously-accepted bad blocks (e.g. admitted by an older software version). If `CheckBlock` returns a `BLOCK_MUTATED` result here specifically, it escalates to `FatalError` — the assumption being that data corruption or hardware failure caused a block that passed earlier to fail now. Any other `CheckBlock` failure simply returns false and logs.

---

## Summary call graph

```
P2P block arrives
└── ProcessNewBlock()                        [validation.cpp:4405]
    ├── CheckBlock()                         [4423] — fail → block NOT marked invalid; BlockChecked signal
    └── AcceptBlock()                        [4426]
        ├── CheckBlock() + ContextualCheckBlock()  [4357] — fail → InvalidBlockFound()
        └── (store to disk, ReceivedBlockTransactions)
            └── ActivateBestChain()
                └── ConnectBlock()           [2301]
                    └── CheckBlock()         [2326] — fail → FatalError if BLOCK_MUTATED; else return false
                        └── CheckTransaction() per tx  [3968] → BLOCK_CONSENSUS on any failure

Transaction arrives (RPC/P2P)
└── AcceptToMemoryPool()                     [validation.cpp:1781]
    └── MemPoolAccept::AcceptSingleTransactionAndCleanup()  [591]
        └── AcceptSingleTransactionInternal()               [1323]
            └── PreChecks()                                 [786]
                └── CheckTransaction()  [802] — fail → PreChecks returns false → Failure(state)
                    (coins fetched during the attempt are uncached; mempool.rejected tracepoint fires)
```


## Final answer

_Result event — success, 132 s, 28 turns._

I have the full picture. Here's the complete analysis:

---

## The stateless check: `CheckTransaction()`

**`src/consensus/tx_check.cpp:11`**, declared in `src/consensus/tx_check.h:18`.

This is explicitly documented as "context-independent" — it consults no chain state, UTXO set, or mempool. It enforces exactly six structural rules, all tagged `TxValidationResult::TX_CONSENSUS`:

| Check | Reject reason |
|---|---|
| `vin` non-empty | `bad-txns-vin-empty` |
| `vout` non-empty | `bad-txns-vout-empty` |
| Non-witness serialized size × WITNESS_SCALE_FACTOR ≤ MAX_BLOCK_WEIGHT | `bad-txns-oversize` |
| Every output value in `[0, MAX_MONEY]`, total also in range | `bad-txns-vout-negative/toolarge/txouttotal-toolarge` |
| No duplicate `COutPoint` in inputs (`std::set` dedup; see CVE-2018-17144) | `bad-txns-inputs-duplicate` |
| Coinbase scriptSig 2–100 bytes; non-coinbase inputs have non-null prevout | `bad-cb-length` / `bad-txns-prevout-null` |

Because every failure sets `TX_CONSENSUS`, any rejection is treated as a hard consensus violation rather than a policy one.

---

## Mempool acceptance path

### `MemPoolAccept::PreChecks()` — `validation.cpp:786`

`CheckTransaction` is the **very first statement** in `PreChecks` (`validation.cpp:802`):

```cpp
if (!CheckTransaction(tx, state)) {
    return false; // state filled in by CheckTransaction
}
```

If it fails, `PreChecks` returns immediately. The caller receives a populated `TxValidationState` with the reject reason; no further policy checks (standardness, feerate, RBF, script checks) run at all.

### Single-transaction entry point

`PreChecks` is called at `validation.cpp:1331` from `AcceptSingleTransactionInternal()`. On `PreChecks` failure:

```cpp
if (!PreChecks(args, ws)) {
    if (ws.m_state.GetResult() == TxValidationResult::TX_RECONSIDERABLE) { ... fee failure ... }
    return MempoolAcceptResult::Failure(ws.m_state);   // ← wraps the TX_CONSENSUS state
}
```

That `Failure` result propagates up through `AcceptSingleTransactionAndCleanup()` (`validation.cpp:591`) → `AcceptToMemoryPool()` (`validation.cpp:1792`). On any non-`VALID` result, `AcceptToMemoryPool` uncaches every coin it had fetched (to prevent memory-DoS from floods of invalid transactions) and fires the `mempool.rejected` tracepoint.

### Package entry point

`PreChecks` is called per-transaction in `AcceptMultipleTransactionsInternal()` (`validation.cpp:1454`). On failure it immediately elevates to `PackageValidationResult::PCKG_TX`, records `MempoolAcceptResult::Failure(ws.m_state)` for the offending transaction, and returns early — the rest of the package is abandoned.

---

## Block validation path

### `CheckBlock()` — `validation.cpp:3925`

`CheckBlock` is the context-free block checker. After verifying the header, Merkle root, and block-level size limits, it iterates every transaction (`validation.cpp:3966–3974`):

```cpp
for (const auto& tx : block.vtx) {
    TxValidationState tx_state;
    if (!CheckTransaction(*tx, tx_state)) {
        assert(tx_state.GetResult() == TxValidationResult::TX_CONSENSUS);
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS,
                             tx_state.GetRejectReason(), ...);
    }
}
```

The `assert` is a safety invariant: since `CheckTransaction` only ever returns `TX_CONSENSUS` failures, anything else would indicate a coding error. The per-transaction `TxValidationState` is translated into a block-level `BLOCK_CONSENSUS` result, and `CheckBlock` returns false. The comment at `validation.cpp:3947–3951` notes that witness data is not consulted here — witness malleability is deferred to `ContextualCheckBlock`.

### Where `CheckBlock` failures land

`CheckBlock` is called from three production sites, with notably different responses:

**1. `ChainstateManager::ProcessNewBlock()` — `validation.cpp:4423`**
The entry point for P2P-received blocks. If `CheckBlock` fails here, `AcceptBlock` is **skipped entirely** and the block is **not marked invalid** in the block index. The code comment (`validation.cpp:4418–4422`) explains this deliberately: caching a failure would be dangerous if there are unknown forms of block malleability that cause `CheckBlock` to reject a valid block (cf. CVE-2012-2459). The `BlockChecked` signal is emitted with the failure state so peers can be penalized via `net_processing`.

**2. `ChainstateManager::AcceptBlock()` — `validation.cpp:4357`**
Called by `ProcessNewBlock` on success of the outer check. Here `CheckBlock` + `ContextualCheckBlock` are run together:

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

This **does** mark the block index entry as invalid via `InvalidBlockFound`, and the block is written to disk and `ReceivedBlockTransactions` is called only if both pass.

**3. `Chainstate::ConnectBlock()` — `validation.cpp:2326`**
Re-checks the block just before applying UTXO changes, as a safety net against previously-accepted bad blocks (e.g. admitted by an older software version). If `CheckBlock` returns a `BLOCK_MUTATED` result here specifically, it escalates to `FatalError` — the assumption being that data corruption or hardware failure caused a block that passed earlier to fail now. Any other `CheckBlock` failure simply returns false and logs.

---

## Summary call graph

```
P2P block arrives
└── ProcessNewBlock()                        [validation.cpp:4405]
    ├── CheckBlock()                         [4423] — fail → block NOT marked invalid; BlockChecked signal
    └── AcceptBlock()                        [4426]
        ├── CheckBlock() + ContextualCheckBlock()  [4357] — fail → InvalidBlockFound()
        └── (store to disk, ReceivedBlockTransactions)
            └── ActivateBestChain()
                └── ConnectBlock()           [2301]
                    └── CheckBlock()         [2326] — fail → FatalError if BLOCK_MUTATED; else return false
                        └── CheckTransaction() per tx  [3968] → BLOCK_CONSENSUS on any failure

Transaction arrives (RPC/P2P)
└── AcceptToMemoryPool()                     [validation.cpp:1781]
    └── MemPoolAccept::AcceptSingleTransactionAndCleanup()  [591]
        └── AcceptSingleTransactionInternal()               [1323]
            └── PreChecks()                                 [786]
                └── CheckTransaction()  [802] — fail → PreChecks returns false → Failure(state)
                    (coins fetched during the attempt are uncached; mempool.rejected tracepoint fires)
```

