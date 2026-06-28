# transcript: I'm planning a change to how a transaction submitted to the node reaches its peers, so I need to understand the full journey of a locally submitted transacti...


💬 I'll trace this end-to-end using the LSP tool. Let me load its schema and start at the RPC entry point.
  ▸ ToolSearch(select:LSP)

💬 Now let me find the `sendrawtransaction` RPC handler and trace the full flow.
  ▸ LSP(sendrawtransaction)
  ▸ LSP(sendrawtransaction)
  ▸ Bash(grep -rn "sendrawtransaction" /home/bench/repos/bitcoin/src/rpc/ --include="*.cpp" -l)

💬 The LSP isn't fully indexed. I'll read the source directly and follow the flow with targeted greps. Let me dig into the key files.
  ▸ Bash(grep -n "sendrawtransaction\|submitpackage\|BroadcastTransaction\|AcceptToMemoryPool\|ATMP\|ProcessNewPackage" /home/bench/repos/bitcoin/src/rpc/rawtransacti...)
  ▸ Bash(grep -n "BroadcastTransaction\|broadcastTransaction\|broadcast_transaction" /home/bench/repos/bitcoin/src/node/transaction.cpp /home/bench/repos/bitcoin/src/...)
  ▸ Bash(grep -n "sendrawtransaction\|BroadcastTransaction\|RPCResult\|RPCArg\|DecodeHexTx\|\"maxfeerate\"\|\"maxburnamount\"\|relay\|submitToMempool\|wait_callback" ...)
  ▸ Bash(grep -n "\"sendrawtransaction\"\|RPCHelpMan.*sendraw\|static RPCHelpMan sendraw" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp)
  ▸ Bash(grep -n "\"sendrawtransaction\"\|RPCHelpMan.*sendraw\|static RPCHelpMan sendraw" /home/bench/repos/bitcoin/src/rpc/mempool.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/rpc/mempool.cpp)

💬 Good. Now let me read `BroadcastTransaction` and the mempool acceptance path.
  ▸ Read(/home/bench/repos/bitcoin/src/node/transaction.cpp)

💬 Now let me trace `ProcessTransaction` in the validation layer.
  ▸ Bash(grep -n "ProcessTransaction\|AcceptToMemoryPool\|ATMP\b" /home/bench/repos/bitcoin/src/validation.h | head -40)
  ▸ Bash(grep -n "^MempoolAcceptResult\|^ProcessTransaction\|MempoolAcceptResult ChainstateManager::ProcessTransaction\|MempoolAcceptResult.*ProcessTransaction" /home...)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me look at the core mempool acceptance checks.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Bash(grep -n "AcceptSingleTransactionAndCleanup\|AcceptSingleTransactionInternal\|PreChecks\|PolicyScriptChecks\|ConsensusScriptChecks\|Finalize\|MemPoolAccept::"...)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me trace the post-acceptance notification and the peer announcement path.
  ▸ Bash(grep -n "TransactionAddedToMempool\|TransactionAddedToMempoolCallback\|MempoolAcceptedTx\|NotifyTransaction" /home/bench/repos/bitcoin/src/validation.cpp | h...)
  ▸ Bash(grep -n "TransactionAddedToMempool\|AddToAnnouncement\|InitiateTxBroadcast" /home/bench/repos/bitcoin/src/net_processing.cpp | head -30)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)

💬 Now let me find how the inventory queue is flushed to peers.
  ▸ Bash(grep -n "m_tx_inventory_to_send\|m_next_inv_send_time\|SendMessages\|MaybeSendAddr\|MaybeSendPing\|MSG_TX\|MSG_WTX\|CInv\|INVENTORY_BROADCAST" /home/bench/re...)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Bash(grep -n "SendMessages\|ThreadMessageHandler\|SocketSendData\|PushMessage\|MakeAndPushMessage" /home/bench/repos/bitcoin/src/net.cpp | head -30)
  ▸ Read(/home/bench/repos/bitcoin/src/net.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/net.cpp)

💬 Let me check the signal emission path for single-tx acceptance in `FinalizeSubpackage` and also how `AddUnbroadcastTx` is used to retransmit.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Bash(grep -n "TransactionAddedToMempool\|AddUnbroadcastTx\|GetUnbroadcastTxs\|ResendUnbroadcastWalletTransactions" /home/bench/repos/bitcoin/src/net_processing.cp...)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Bash(grep -n "TransactionAddedToMempool" /home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Bash(grep -rn "TransactionAddedToMempool" /home/bench/repos/bitcoin/src/ --include="*.cpp" | grep -v "test\|wallet\|qt" | head -20)

💬 Let me check the `AcceptSingleTransactionAndCleanup` wrapper and how `AddUnbroadcastTx` / unbroadcast tracking works.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Bash(grep -n "AddUnbroadcastTx\|RemoveUnbroadcastTx\|m_unbroadcast_txids\|GetUnbroadcastTxs" /home/bench/repos/bitcoin/src/txmempool.cpp | head -20)
  ▸ Bash(grep -n "AddUnbroadcastTx\|m_unbroadcast_txids" /home/bench/repos/bitcoin/src/txmempool.cpp)
  ▸ Bash(grep -n "AddUnbroadcastTx\|m_unbroadcast_txids" /home/bench/repos/bitcoin/src/txmempool.h | head -20)

💬 Now let me check the `SendMessages` function entry and verify the `m_next_inv_send_time` initialization (how the first trickle fires).
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Bash(grep -n "m_next_inv_send_time\s*=" /home/bench/repos/bitcoin/src/net_processing.cpp | head -20)
  ▸ Bash(grep -n "m_next_inv_send_time\s*=\s*[^0]" /home/bench/repos/bitcoin/src/net_processing.cpp | head -10)
  ▸ Bash(grep -n "m_next_inv_send_time" /home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)

💬 I now have everything I need to map the full path. Here is the complete walkthrough.  ---  ## Full journey of a locally submitted transaction  ### Stage 1 — ...

──────── RESULT (success, 269213ms, 44 turns) ────────
I now have everything I need to map the full path. Here is the complete walkthrough.

---

## Full journey of a locally submitted transaction

### Stage 1 — RPC entry: `sendrawtransaction`
**`src/rpc/mempool.cpp:47`**

The handler does three things before touching the network layer:

1. `DecodeHexTx` deserializes the hex string into a `CMutableTransaction`, then wraps it in a `CTransactionRef`.
2. It validates the `maxburnamount` constraint by scanning `vout` for `IsUnspendable()` outputs.
3. It determines the broadcast method. With `-privatebroadcast` off (the normal case) this is `TxBroadcast::MEMPOOL_AND_BROADCAST_TO_ALL`; with it on and Tor/I2P reachable, it becomes `NO_MEMPOOL_PRIVATE_BROADCAST`.

It then calls `BroadcastTransaction(node, tx, err_string, max_raw_tx_fee, method, /*wait_callback=*/true)`.

---

### Stage 2 — `BroadcastTransaction`: gating, ATMP, and unbroadcast tracking
**`src/node/transaction.cpp:32`**

Everything up through and including mempool insertion happens under `LOCK(cs_main)`:

1. **UTXO check** — scans `CoinsTip()` for any unspent output of this txid. If found, the tx is already confirmed; return `ALREADY_IN_UTXO_SET` immediately.

2. **Mempool duplicate check** — `node.mempool->get(txid)`. If the tx is already in the mempool, ATMP is skipped entirely and the existing mempool entry's wtxid is captured for reannouncement.

3. **Fee preflight** — if `max_tx_fee > 0`, `ProcessTransaction(tx, test_accept=true)` is called first. This runs the full ATMP gauntlet in dry-run mode (no state change). If fees exceed the cap, bail with `MAX_FEE_EXCEEDED`.

4. **Real submission** — `ProcessTransaction(tx, test_accept=false)`. This is the call that actually commits the transaction to the mempool (described in Stage 3).

5. **Unbroadcast registration** — `node.mempool->AddUnbroadcastTx(txid)` inserts the txid into `CTxMemPool::m_unbroadcast_txids`. This set tracks txids that have been submitted locally but whose broadcast hasn't yet been acknowledged by any peer. It enables the retry mechanism described at the end.

After `cs_main` is released:

6. **Callback sync** — `wait_callback=true` causes `node.validation_signals->SyncWithValidationInterfaceQueue()` to block until all `CValidationInterface` subscribers (wallet, ZMQ, fee estimator) have processed the `TransactionAddedToMempool` notification fired inside ATMP. This prevents a race where the caller immediately queries wallet state before notifications have landed.

7. **Peer announcement** — `node.peerman->InitiateTxBroadcastToAll(txid, wtxid)` (Stage 4).

---

### Stage 3 — Mempool acceptance: the check cascade
**`src/validation.cpp`** via `ChainstateManager::ProcessTransaction` → `AcceptToMemoryPool` → `MemPoolAccept::AcceptSingleTransactionAndCleanup`

`AcceptSingleTransactionAndCleanup` takes both `cs_main` (caller holds it) and `m_pool.cs` before delegating to `AcceptSingleTransactionInternal`. The checks run in this order:

#### `PreChecks` (`validation.cpp:786`)
These are cheap structural and policy checks that run before any script execution:

| Check | What it enforces |
|---|---|
| `CheckTransaction` | Basic sanity: no empty vin/vout, no value overflow, no duplicate inputs |
| coinbase guard | Coinbase transactions are block-only |
| `IsStandardTx` | Policy standardness: known script types, OP_RETURN limits, etc. (mainnet only) |
| minimum non-witness size | ≥ 65 bytes — mitigates CVE-2017-12842 |
| `CheckFinalTxAtTip` | nLockTime must permit mining in the next block |
| duplicate check | Exact wtxid or same txid/different witness already in mempool |
| conflict scan | Each `txin.prevout` checked via `m_pool.GetConflictTx()` — any hit sets `m_rbf = true` and records the conflicting txid for RBF handling |
| input existence | Every input must be in the coins cache (UTXO set + mempool view). Missing inputs → `TX_MISSING_INPUTS` |
| BIP68 sequence locks | `CalculateLockPointsAtTip` + `CheckSequenceLocksAtTip` |
| `Consensus::CheckTxInputs` | Sums input values, checks no negative/overflow, enforces coinbase maturity |
| `ValidateInputsStandardness` | Standard input script types |
| `IsWitnessStandard` | No non-standard witness |
| sigops cost | ≤ `MAX_STANDARD_TX_SIGOPS_COST` |
| `CheckFeeRate` | Fee rate ≥ mempool minimum fee rate |
| TRUC / v3 checks | `SingleTRUCChecks` — topology constraints for version-3 transactions; allows sibling eviction |

`PreChecks` also stages the entry into `m_subpackage.m_changeset` via `StageAddition`, which is where the modified fee (after `PrioritiseTransaction` deltas) and vsize are computed.

#### `ReplacementChecks` (`validation.cpp:988`)
Only runs if `m_rbf == true`. Enforces BIP125 rules: the replacement must pay a strictly higher absolute fee than the sum of all replaced transactions, the fee rate must increase, and the conflict set is bounded.

#### Cluster size limit
`m_changeset->CheckMemPoolPolicyLimits()` — ensures the transaction doesn't push any cluster over the size limit.

#### `PolicyScriptChecks` (`validation.cpp:1139`)
`CheckInputScripts(tx, ..., STANDARD_SCRIPT_VERIFY_FLAGS, ...)` — runs the script interpreter against all inputs with policy-level flags. This is where signatures, hash preimages, and witness programs are actually evaluated. Deferred to last to prevent CPU-exhaustion DoS from invalid transactions.

#### `ConsensusScriptChecks` (`validation.cpp:1162`)
`CheckInputsFromMempoolAndCache(tx, ..., currentBlockScriptVerifyFlags, ...)` — re-runs script evaluation with the current block's consensus flags and adds the result to the script cache. This catches edge cases where standard flags are more permissive than consensus flags and ensures the cache entry is accurate for block validation.

If `test_accept=true`, the function returns here without writing anything.

#### `FinalizeSubpackage` (`validation.cpp:1195`)
This is the commit point. `m_subpackage.m_changeset->Apply()` atomically:
- Evicts any RBF-conflicting entries
- Inserts the new entry into the mempool's internal data structures

Immediately after `Apply()`, while still holding both locks, `m_pool.m_opts.signals->TransactionAddedToMempool(tx_info, seq)` fires. This is dispatched asynchronously through the validation signals queue to all `CValidationInterface` subscribers.

---

### Stage 4 — Per-peer announcement queuing
**`src/net_processing.cpp:2272`** — `PeerManagerImpl::InitiateTxBroadcastToAll`

This iterates over every connected peer (via `GetAllPeers()`) and for each:

1. **Block-only connections** — no `TxRelay` struct, skipped entirely.
2. **Handshake guard** — `m_next_inv_send_time == 0s` means the version handshake isn't complete yet. These peers are skipped. This is intentional: queuing announcements before the handshake could leak transaction arrival time to a spy who monitors the timing of announcements relative to connection establishment.
3. **Bloom filter dedup** — the announcement key is `wtxid.ToUint256()` for wtxid-relay peers or `txid.ToUint256()` for legacy peers. If it's already in `m_tx_inventory_known_filter` (a rolling Bloom filter tracking what each peer has been told), the peer is skipped.
4. **Queue insertion** — `tx_relay->m_tx_inventory_to_send.insert(wtxid)` adds the wtxid to a `std::set<Wtxid>` under `m_tx_inventory_mutex`. Nothing is sent yet.

---

### Stage 5 — Trickle flush: inventory messages to the wire
**`src/net.cpp:3193`** — `CConnman::ThreadMessageHandler`

A dedicated message-handling thread runs a continuous loop over all nodes, calling `m_msgproc->SendMessages(*pnode)` for each. `SendMessages` (`src/net_processing.cpp:5792`) handles the actual flush.

In the inventory section (around line 6058):

**Trickle timer check**: `tx_relay->m_next_inv_send_time < current_time`
- For **inbound peers**: `NextInvToInbounds(current_time, INBOUND_INVENTORY_BROADCAST_INTERVAL=5s, node.m_network_key)` — a deterministic value derived from the node's per-run network key, staggering announcements to all inbound peers across a 5-second window to prevent correlated timing.
- For **outbound peers**: `current_time + rand_exp(OUTBOUND_INVENTORY_BROADCAST_INTERVAL=2s)` — exponentially distributed, averaging 2 seconds.
- Peers with `NetPermissionFlags::NoBan` (e.g. whitelisted local peers) bypass the timer entirely.

**When `fSendTrickle = true`**:
1. If the peer sent `-relay=0` (disabled tx relay), the queue is cleared and nothing is sent.
2. The set `m_tx_inventory_to_send` is snapshotted into a vector and heap-sorted by `CompareInvMempoolOrder` — a comparator that orders by fee rate descending, with topological tie-breaking. The sort exists for both efficiency (high-fee txs announced first) and privacy (consistent ordering avoids fingerprinting by relay order).
3. The heap is drained up to `INVENTORY_BROADCAST_TARGET` items (= 14/sec × 5s = 70), hard-capped at `INVENTORY_BROADCAST_MAX` (1000).
4. For each candidate:
   - Dropped if no longer in mempool (evicted by a competing RBF since queuing).
   - Dropped if `m_tx_inventory_known_filter` already contains it.
   - Dropped if `txinfo.fee < filterrate.GetFee(txinfo.vsize)` — below the peer's advertised `feefilter` threshold.
   - Dropped if a BIP37 bloom filter is set and the tx isn't relevant.
   - Otherwise: appended to `vInv` as `CInv{MSG_WTX, wtxid}` (wtxid-relay peer) or `CInv{MSG_TX, txid}` (legacy peer), removed from `m_tx_inventory_to_send`, inserted into `m_tx_inventory_known_filter`.
5. `MakeAndPushMessage(node, NetMsgType::INV, vInv)` serializes the vector and hands it to `CConnman::PushMessage`.

---

### Stage 6 — Bytes to the socket
**`src/net.cpp:4140`** — `CConnman::PushMessage`

The serialized `INV` message is appended to `node.vSendMsg`. If the send queue was empty before this call and the transport layer indicates bytes are ready (always true for V1, conditional during BIP324 V2 handshake), an **optimistic write** calls `SocketSendData(*pnode)` immediately on the calling thread, flushing the message to the TCP socket via `send()`. If the queue wasn't empty, the `ThreadSocketHandler`'s `select()`/`poll()` loop picks up the bytes on its next iteration.

---

### The unbroadcast retry mechanism

The txid inserted into `m_unbroadcast_txids` in Stage 2 is cleared only when a peer responds with a `GETDATA` for the tx (at which point `RemoveUnbroadcastTx` is called). `PeerManagerImpl::ReattemptInitialBroadcast` runs on a scheduler every 10–15 minutes (with random jitter to resist fingerprinting) and calls `InitiateTxBroadcastToAll` again for any txid still in the set. This provides a retry loop for the case where the initial wave of `INV` messages was ignored or the node had no peers at acceptance time.

---

### How the stages connect: a summary

```
sendrawtransaction (rpc/mempool.cpp)
  └─► BroadcastTransaction (node/transaction.cpp)
        ├─[cs_main]─► ChainstateManager::ProcessTransaction
        │                └─► AcceptToMemoryPool
        │                      └─► MemPoolAccept::AcceptSingleTransactionAndCleanup
        │                            ├─► PreChecks          (structural + policy)
        │                            ├─► ReplacementChecks  (BIP125, if RBF)
        │                            ├─► PolicyScriptChecks (script eval, STANDARD flags)
        │                            ├─► ConsensusScriptChecks (script eval, consensus flags → cache)
        │                            └─► FinalizeSubpackage
        │                                  ├─► changeset->Apply()  ← tx enters mempool here
        │                                  └─► signals->TransactionAddedToMempool()
        ├─► mempool->AddUnbroadcastTx(txid)
        ├─► SyncWithValidationInterfaceQueue()   (wait_callback)
        └─► peerman->InitiateTxBroadcastToAll(txid, wtxid)
              └─► for each peer: m_tx_inventory_to_send.insert(wtxid)
                                                          ↑
                                          queued, not yet sent
ThreadMessageHandler (net.cpp) ──────────────────────────┘
  └─► SendMessages (net_processing.cpp) [per peer, continuous loop]
        └─► trickle timer fires
              └─► heap-sort m_tx_inventory_to_send
                    └─► build vInv (MSG_WTX or MSG_TX)
                          └─► MakeAndPushMessage(INV)
                                └─► PushMessage → SocketSendData → send()
```

The key architectural choice is that announcement is **decoupled from acceptance**: the tx enters the mempool and the per-peer wtxid is queued atomically under `m_pool.cs`, but the actual `INV` bytes don't go out until the next trickle interval fires in the message handler thread. This decoupling is what gives the design room for the privacy-preserving random delays and the per-peer fee/bloom filtering.
