# transcript: I'm planning a change to how a transaction submitted to the node reaches its peers, so I need to understand the full journey of a locally submitted transacti...


💬 I'll spawn an Explore agent to trace this end-to-end flow through the codebase.

  ▸ Agent(Trace transaction submission flow from RPC to peer announcement)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/bitcoin -type f -name "rawtransaction.cpp" -o -name "validation.cpp" -o -name "txmempool.cpp" -o -name "net_processing.cpp" | head -20)
      ↳ Read(/home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp)
      ↳ Bash(grep -n "sendrawtransaction" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp | head -20)
      ↳ Bash(grep -n "RPCCmd.*sendrawtransaction\|static UniValue sendrawtransaction\|RPCHelpMan.*sendrawtransaction" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp)
      ↳ Bash(grep -n "void.*sendrawtransaction\|UniValue sendrawtransaction" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp)
      ↳ Bash(wc -l /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp)
      ↳ Bash(grep -n "sendrawtransaction\|broadcast" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp | grep -i "function\|return\|help")
      ↳ Read(/home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp)
      ↳ Bash(grep -n "static RPCMethod\|RPCHelpMan.*raw" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp | head -40)
      ↳ Bash(find /home/bench/repos/bitcoin -type f -name "*.cpp" -path "*/rpc/*" | xargs grep -l "sendrawtransaction" 2>/dev/null)
      ↳ Bash(grep -n "sendrawtransaction" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp)
      ↳ Bash(grep -n "sendrawtransaction" /home/bench/repos/bitcoin/src/rpc/mempool.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/rpc/mempool.cpp)
      ↳ Bash(grep -r "BroadcastTransaction" /home/bench/repos/bitcoin/src --include="*.h" --include="*.cpp" | grep -E "^[^:]*:.*TransactionError.*BroadcastTransaction")
      ↳ Read(/home/bench/repos/bitcoin/src/node/transaction.cpp)
      ↳ Bash(grep -n "ProcessTransaction" /home/bench/repos/bitcoin/src/validation.h | head -20)
      ↳ Bash(grep -n "MempoolAcceptResult.*ProcessTransaction\|AcceptToMemoryPool" /home/bench/repos/bitcoin/src/validation.cpp | head -20)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Bash(grep -n "class MemPoolAccept\|TransactionAddedToMempool\|m_tx_inventory_to_send\|setInventoryTxToSend" /home/bench/repos/bitcoin/src/txmempool.cpp | head -30)
      ↳ Bash(grep -rn "TransactionAddedToMempool" /home/bench/repos/bitcoin/src --include="*.cpp" --include="*.h" | head -20)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Bash(grep -n "AcceptSingleTransactionAndCleanup\|class MemPoolAccept" /home/bench/repos/bitcoin/src/validation.cpp | head -20)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Bash(grep -n "m_pool.addUnchecked\|m_pool.AddTx\|AddToMempool\|m_pool.Add(" /home/bench/repos/bitcoin/src/validation.cpp | head -20)
      ↳ Bash(grep -n "Finalize(" /home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Bash(grep -n "ChangeSet\|poolAddUnchecked\|mempool entry" /home/bench/repos/bitcoin/src/validation.cpp | grep -i "add\|unchecked" | head -30)
      ↳ Bash(grep -n "ChangeSet::TxHandle\|ChangeSet()" /home/bench/repos/bitcoin/src/validation.cpp | head -20)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Bash(grep -n "m_tx_handle\s*=" /home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Bash(grep -n "changeset.*Commit\|Commit()" /home/bench/repos/bitcoin/src/validation.cpp | head -20)
      ↳ Bash(grep -n "NotifyTransactionAddedToMempool" /home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ Bash(grep -n "TransactionAddedToMempool\|m_tx_inventory_to_send\|setInventoryTxToSend" /home/bench/repos/bitcoin/src/net_processing.cpp | head -30)
      ↳ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Bash(grep -n "InitiateTxBroadcastToAll" /home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Bash(grep -n "SendMessages\|send.*inv" /home/bench/repos/bitcoin/src/net_processing.cpp | grep -i "sendmessages\|void.*send" | head -30)
      ↳ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Bash(grep -n "MSG_WTX\|MSG_TX" /home/bench/repos/bitcoin/src/protocol.h | head -20)
      ↳ Bash(grep -n "CheckFeeRate\|CheckInputScripts\|PreChecks\|ReplacementChecks" /home/bench/repos/bitcoin/src/validation.cpp | head -30)
      ↳ Bash(grep -n "AddUnbroadcastTx\|m_unbroadcast_txids" /home/bench/repos/bitcoin/src/txmempool.cpp | head -30)
      ↳ Bash(grep -n "AddUnbroadcastTx" /home/bench/repos/bitcoin/src/txmempool.h)
      ↳ Read(/home/bench/repos/bitcoin/src/txmempool.h)
      ↳ Read(/home/bench/repos/bitcoin/src/node/transaction.h)
      ↳ Bash(grep -n "class PeerManager\|virtual void InitiateTxBroadcastToAll\|virtual void InitiateTxBroadcastPrivate" /home/bench/repos/bitcoin/src/net_processing.h | ...)
      ↳ Bash(grep -n "struct TxRelay" /home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
      ↳ Read(/home/bench/repos/bitcoin/src/validation.cpp)
      ↳ ⟹ returned to parent


💬 Here is the full journey, grounded in the actual source:  ---  ## Stage 1 — RPC entry point  **`src/rpc/mempool.cpp` — `sendrawtransaction` lambda**  The RPC...

──────── RESULT (success, 252019ms, 2 turns) ────────
Here is the full journey, grounded in the actual source:

---

## Stage 1 — RPC entry point

**`src/rpc/mempool.cpp` — `sendrawtransaction` lambda**

The RPC decodes the hex string with `DecodeHexTx`, wraps it in a `CTransactionRef`, applies the `maxburnamount` and `maxfeerate` parameter checks, then calls into:

```
node/transaction.cpp — BroadcastTransaction(node, tx, max_raw_tx_fee, ...)
```

The `broadcast_method` defaults to `MEMPOOL_AND_BROADCAST_TO_ALL`. `wait_callback=true` means the RPC blocks until the validation-interface callback has fired before returning the txid to the caller.

---

## Stage 2 — Mempool acceptance and validation

**`src/node/transaction.cpp` — `BroadcastTransaction()`**

This function does a quick pre-check (UTXO-set duplicate, already-in-mempool duplicate, optional `test_accept` dry-run for the fee ceiling) and then calls:

```
ChainstateManager::ProcessTransaction(tx, test_accept=false)   [validation.cpp:4455]
  → AcceptToMemoryPool(active_chainstate, tx, ...)             [validation.cpp:1781]
    → MemPoolAccept::AcceptSingleTransactionAndCleanup()       [validation.cpp:591]
      → AcceptSingleTransactionInternal()                      [validation.cpp:1323]
```

Inside `AcceptSingleTransactionInternal` the checks run roughly in this order:

| Check | Function | What it gates |
|---|---|---|
| Consensus sanity | `CheckTransaction()` | Structural validity |
| Policy standardness | `IsStandardTx()` | Non-standard output types, etc. |
| Minimum size | inline | 65-byte floor |
| Finality / locktime | `CheckFinalTxAtTip()` | nLockTime, nSequence |
| Mempool duplicates | inline | txid and wtxid |
| RBF conflict detection | inline | Populates `ws.m_conflicts` |
| Input existence | `HaveCoin()` loop | All inputs in UTXO/mempool |
| BIP 68 sequence locks | `CheckSequenceLocksAtTip()` | Relative timelocks |
| Input amounts / sigs | `Consensus::CheckTxInputs()` | Value conservation, script sigs |
| Script standardness | `ValidateInputsStandardness()` | Non-standard scripts |
| Script execution | `CheckInputScripts()` | Cryptographic signature verification |
| RBF rules | `ReplacementChecks()` | BIP 125 fee-bump rules |
| Mempool policy limits | `CheckMemPoolPolicyLimits()` | Cluster/ancestor/descendant caps |

The entry is staged via a `ChangeSet` and committed. Immediately after commit, at around **`validation.cpp:1318`**, the signal fires:

```cpp
m_pool.m_opts.signals->TransactionAddedToMempool(tx_info, m_pool.GetAndIncrementSequence())
```

The result type is `MempoolAcceptResult`, which carries the result type (`VALID`/`INVALID`), a `TxValidationState` with rejection reason, effective feerate, and vsize. This is what `BroadcastTransaction` inspects before continuing.

---

## Stage 3 — Signal dispatch into net_processing

**`src/validationinterface.cpp` — `ValidationSignals::TransactionAddedToMempool()`**

The signal system iterates every registered `CValidationInterface` subscriber and calls their `TransactionAddedToMempool` override.

The bridge implementation lives in **`src/node/interfaces.cpp`** (the `ChainImpl` class). It reaches into the `PeerManager` and calls:

```
PeerManagerImpl::InitiateTxBroadcastToAll(txid, wtxid)   [net_processing.cpp:2272]
```

Back in `BroadcastTransaction`, after the signal has returned (because `wait_callback=true`), the tx is also added to `m_unbroadcast_txids` via `mempool->AddUnbroadcastTx(txid)`. That set drives periodic rebroadcast but is separate from the initial P2P announcement happening right now.

**`src/net_processing.cpp:2272` — `InitiateTxBroadcastToAll()`**

This loops over every connected peer. For each peer it:

1. Gets the peer's `TxRelay*` struct (null means the peer opted out of tx relay entirely — skip).
2. Acquires `tx_relay->m_tx_inventory_mutex`.
3. **Handshake gate** (line 2287): skips the peer if `m_next_inv_send_time == 0s` — this protects against leaking the transaction origin during version negotiation.
4. **Known-inventory filter** (line 2290): checks `m_tx_inventory_known_filter` (a rolling Bloom filter, 50 K entries, FP ≈ 1 in 1 M) — skips if the peer already knows this tx.
5. Picks the right hash: `wtxid` if `peer.m_wtxid_relay` (BIP 339), else `txid`.
6. Inserts into **`tx_relay->m_tx_inventory_to_send`** — a `std::set<Wtxid>` that is the per-peer announcement queue.

---

## Stage 4 — Flushing the queue as INV messages

**`src/net_processing.cpp:5792` — `PeerManagerImpl::SendMessages(CNode& node)`**

This is a periodic ticker called for each connected node. The relevant section (around line 6062):

**Timing gate:** only proceeds if `m_next_inv_send_time < current_time`.
- Outbound peers: next time is drawn from an exponential distribution centered on `OUTBOUND_INVENTORY_BROADCAST_INTERVAL` (~0.5 s average) — the jitter prevents timing correlation across peers.
- Inbound peers: `NextInvToInbounds()` with `INBOUND_INVENTORY_BROADCAST_INTERVAL`, also jittered.

**Relay flag** (line 6074): if the peer set `fRelay=false` in the version handshake, the entire `m_tx_inventory_to_send` queue is cleared — no announcements at all.

**Building the INV** (lines 6112–6172):

1. Snapshots `m_tx_inventory_to_send` into a local `vInvTx`.
2. Heapifies it by `CompareInvMempoolOrder` (mempool entry sequence) to produce a topologically-stable, fee-consistent ordering — a privacy measure that prevents inferring transaction assembly timing from announcement order.
3. Iterates up to `broadcast_max` entries (= `INVENTORY_BROADCAST_TARGET + scale factor`, capped at `INVENTORY_BROADCAST_MAX`). For each:
   - **Mempool check**: fetches the tx from the mempool; skips if it was evicted since queuing.
   - **Known-filter recheck** (line 6148): drops if already announced.
   - **Fee filter (BIP 133)** (line 6152): reads `m_fee_filter_received` from the peer; skips if `tx.fee < filterrate.GetFee(tx.vsize)` — the peer won't accept it anyway.
   - **Bloom filter (BIP 37)** (line 6155): if the peer has installed a Bloom filter (`m_bloom_filter`), calls `IsRelevantAndUpdate`; skips if not relevant to the peer's wallet.
   - Constructs `CInv{MSG_WTX, wtxid}` or `CInv{MSG_TX, txid}` depending on `m_wtxid_relay`.
   - Appends to `vInv`; flushes immediately if `vInv.size() == MAX_INV_SZ`.
4. Any remaining items in `vInv` are sent in a final `MakeAndPushMessage(node, NetMsgType::INV, vInv)`.

---

## Connection map

```
sendrawtransaction (rpc/mempool.cpp)
  └─ BroadcastTransaction (node/transaction.cpp)
       ├─ [test_accept dry-run if maxfeerate set]
       └─ ChainstateManager::ProcessTransaction
            └─ AcceptToMemoryPool → MemPoolAccept::AcceptSingleTransactionInternal
                 ├─ [all validation checks]
                 └─ signals->TransactionAddedToMempool()  ← commit boundary
                      └─ ChainImpl::TransactionAddedToMempool (node/interfaces.cpp)
                           └─ PeerManagerImpl::InitiateTxBroadcastToAll (net_processing.cpp:2272)
                                └─ per-peer: insert into tx_relay->m_tx_inventory_to_send
  └─ mempool->AddUnbroadcastTx(txid)   ← periodic rebroadcast, separate path

[periodic ticker per peer]
PeerManagerImpl::SendMessages (net_processing.cpp:5792)
  └─ drain m_tx_inventory_to_send → apply filters → MakeAndPushMessage INV
```

The key insertion point for your change is probably `InitiateTxBroadcastToAll` (controls which peers get queued at all and with what hash) and/or the filter block inside `SendMessages` (controls what gets sent at flush time). The per-peer `TxRelay` struct is the shared state between those two points.
