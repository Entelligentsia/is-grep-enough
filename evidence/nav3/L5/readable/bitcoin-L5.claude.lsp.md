# transcript: I'm planning a change to how a transaction submitted to the node reaches its peers, so I need to understand the full journey of a locally submitted transacti...


💬 I'll trace this end-to-end using the LSP tool, starting from the RPC layer and following every handoff. Let me load the LSP schema and begin.
  ▸ ToolSearch(select:LSP)

💬 Let me find the `sendrawtransaction` RPC entry point first.
  ▸ LSP(sendrawtransaction)
  ▸ LSP(sendrawtransaction)

💬 LSP index isn't warm yet. Let me fall back to locating the relevant files directly.
  ▸ Bash(grep -n "sendrawtransaction" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp | head -20)
  ▸ Bash(ls /home/bench/repos/bitcoin/src/rpc/)
  ▸ Bash(grep -n "sendrawtransaction\|BroadcastTransaction\|ProcessNewTransaction\|ATMP\|AcceptToMemoryPool\|submitpackage\|broadcasttransaction" /home/bench/repos/bi...)
  ▸ Bash(grep -n "sendrawtransaction\|BroadcastTransaction\|RegisterRPC\|RPCHelpMan" /home/bench/repos/bitcoin/src/rpc/rawtransaction.cpp | head -40)
  ▸ Bash(grep -rn "\"sendrawtransaction\"" /home/bench/repos/bitcoin/src/ | head -10)

💬 Good — it's in `src/rpc/mempool.cpp`. Let me read that handler and then trace forward.
  ▸ Read(/home/bench/repos/bitcoin/src/rpc/mempool.cpp)

💬 Now let me find `BroadcastTransaction` and the `TxBroadcast` enum.
  ▸ Bash(grep -rn "BroadcastTransaction\|TxBroadcast" /home/bench/repos/bitcoin/src/node/ | head -20)
  ▸ Read(/home/bench/repos/bitcoin/src/node/transaction.cpp)

💬 Now let me find `ProcessTransaction` (the ATMP path) and `InitiateTxBroadcastToAll`.
  ▸ Bash(grep -n "ProcessTransaction\|AcceptToMemoryPool\|ATMP" /home/bench/repos/bitcoin/src/validation.cpp | head -30)
  ▸ Bash(grep -n "InitiateTxBroadcastToAll\|InitiateTxBroadcastPrivate" /home/bench/repos/bitcoin/src/net_processing.cpp | head -20)
  ▸ Bash(grep -n "ProcessTransaction" /home/bench/repos/bitcoin/src/validation.cpp | head -20)
  ▸ Bash(grep -n "ProcessTransaction" /home/bench/repos/bitcoin/src/validation.h | head -20)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me read the full `AcceptToMemoryPool` function and the key validation stages.
  ▸ Bash(grep -n "^MempoolAcceptResult AcceptToMemoryPool\|^static MempoolAcceptResult AcceptToMemoryPool" /home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Bash(grep -n "^MempoolAcceptResult MemPoolAccept::AcceptSingleTransaction\b" /home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Bash(grep -n "^MempoolAcceptResult MemPoolAccept::" /home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me read `PreChecks` and the two script-check phases:
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me trace the announcement side — `InitiateTxBroadcastToAll` and the peer announcement queue:
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)

💬 Now let me find where the queued inventory is flushed — the send/flush function:
  ▸ Bash(grep -n "m_tx_inventory_to_send\|m_next_inv_send_time\|SendMessages\|MaybeSendInv\|FlushInv\|MSG_TX\|MSG_WTX" /home/bench/repos/bitcoin/src/net_processing.cp...)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)

💬 Let me check the interval constants and where `SendMessages` is called from:
  ▸ Bash(grep -n "INBOUND_INVENTORY_BROADCAST_INTERVAL\|OUTBOUND_INVENTORY_BROADCAST_INTERVAL\|INVENTORY_BROADCAST_TARGET\|INVENTORY_BROADCAST_MAX" /home/bench/repos/...)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Bash(grep -n "SendMessages\|ThreadMessageHandler\|g_msgproc_mutex" /home/bench/repos/bitcoin/src/net.cpp | head -20)
  ▸ Bash(grep -n "SendMessages" /home/bench/repos/bitcoin/src/net.cpp | head -20)
  ▸ Read(/home/bench/repos/bitcoin/src/net.cpp)

💬 Let me check where `m_next_inv_send_time` is first set and how `MakeAndPushMessage` works:
  ▸ Bash(grep -n "m_next_inv_send_time\s*=" /home/bench/repos/bitcoin/src/net_processing.cpp | head -15)
  ▸ Bash(grep -n "MakeAndPushMessage\|PushMessage" /home/bench/repos/bitcoin/src/net_processing.cpp | grep -v "^\s*//" | head -20)
  ▸ Bash(grep -n "m_next_inv_send_time" /home/bench/repos/bitcoin/src/net_processing.cpp | grep -v "^[0-9]*:\s*//")

💬 Let me check the other call sites of `InitiateTxBroadcastToAll` for completeness:
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Bash(grep -n "InitiateTxBroadcastToAll" /home/bench/repos/bitcoin/src/net_processing.cpp)

💬 Let me check the `AddUnbroadcastTx` and `CompareInvMempoolOrder` briefly:
  ▸ Bash(grep -n "AddUnbroadcastTx\|GetUnbroadcastTxs\|RemoveUnbroadcastTx\|m_unbroadcast_txids" /home/bench/repos/bitcoin/src/txmempool.cpp | head -20)
  ▸ Bash(grep -n "CompareInvMempoolOrder" /home/bench/repos/bitcoin/src/net_processing.cpp | head -5)
  ▸ Bash(grep -n "AddUnbroadcastTx" /home/bench/repos/bitcoin/src/txmempool.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/net_processing.cpp)
  ▸ Bash(grep -n "AddUnbroadcastTx\|m_unbroadcast_txids" /home/bench/repos/bitcoin/src/txmempool.cpp | head -20)
  ▸ Bash(grep -rn "AddUnbroadcastTx" /home/bench/repos/bitcoin/src/ | head -10)
  ▸ Read(/home/bench/repos/bitcoin/src/txmempool.h)

💬 I now have everything I need. Here is the complete flow:  ---  ## The journey of a locally submitted transaction  ### Stage 1 — RPC: `sendrawtransaction` (`s...

──────── RESULT (success, 326664ms, 47 turns) ────────
I now have everything I need. Here is the complete flow:

---

## The journey of a locally submitted transaction

### Stage 1 — RPC: `sendrawtransaction` (`src/rpc/mempool.cpp:47`)

The handler decodes the hex string into a `CTransaction`, checks the burn-output limit and computes the max-fee ceiling, then decides which broadcast mode to use:

```cpp
const auto method = private_broadcast_enabled
    ? node::TxBroadcast::NO_MEMPOOL_PRIVATE_BROADCAST
    : node::TxBroadcast::MEMPOOL_AND_BROADCAST_TO_ALL;
BroadcastTransaction(node, tx, err_string, max_raw_tx_fee, method, /*wait_callback=*/true);
```

In normal (non-private) mode the method is `MEMPOOL_AND_BROADCAST_TO_ALL`. `wait_callback=true` means the RPC blocks until the wallet's validation-interface callbacks have processed the tx before returning to the caller.

---

### Stage 2 — `BroadcastTransaction` (`src/node/transaction.cpp:32`)

Everything up to the peer call happens under `cs_main`:

1. **Already-confirmed guard** — scans the UTXO set; if any output of this txid exists in the chainstate, returns `ALREADY_IN_UTXO_SET`.

2. **Already-in-mempool path** — if the txid is already in the mempool, skips ATMP entirely and just picks up the mempool's own wtxid for reannouncement below.

3. **Dry-run fee check** (when `max_tx_fee > 0`) — calls `node.chainman->ProcessTransaction(tx, test_accept=true)`. If the fee exceeds the ceiling the call returns early; this is purely a preflight and nothing is written to the mempool.

4. **Real ATMP submission** (`MEMPOOL_AND_BROADCAST_TO_ALL` path):
   ```cpp
   const MempoolAcceptResult result =
       node.chainman->ProcessTransaction(tx, /*test_accept=*/false);
   ```
   On success:
5. **Unbroadcast tracking** — `node.mempool->AddUnbroadcastTx(txid)`. This registers the tx in the mempool's `m_unbroadcast_txids` set, which drives a retry mechanism explained below.

After `cs_main` is released:

6. **Validation-interface sync** — because `wait_callback=true`, calls `node.validation_signals->SyncWithValidationInterfaceQueue()`, draining the queue so wallet notifications are complete before the RPC returns.

7. **Peer announcement**:
   ```cpp
   node.peerman->InitiateTxBroadcastToAll(txid, wtxid);
   ```

---

### Stage 3 — Mempool acceptance: ATMP (`src/validation.cpp`)

`ChainstateManager::ProcessTransaction` (`:4455`) is a thin wrapper:

```cpp
auto result = AcceptToMemoryPool(active_chainstate, tx, GetTime(),
                                 /*bypass_limits=*/false, test_accept);
active_chainstate.GetMempool()->check(...); // invariant check
return result;
```

`AcceptToMemoryPool` (`:1781`) builds `ATMPArgs::SingleAccept` and delegates to `MemPoolAccept(pool, active_chainstate).AcceptSingleTransactionAndCleanup(tx, args)`, which acquires `m_pool.cs` and calls `AcceptSingleTransactionInternal`.

#### `AcceptSingleTransactionInternal` — the five ordered gates

**PreChecks (`:786`)** — structural, policy, and economic checks (no script execution yet):

| Check | What it tests |
|---|---|
| `CheckTransaction` | No empty input/output vectors, no overflow amounts, no duplicate inputs, valid scriptSig size |
| Coinbase rejection | Only valid inside a block |
| `IsStandardTx` | Output types, `OP_RETURN` size, bare-multisig policy |
| Minimum tx size | ≥ 65 non-witness bytes (CVE-2017-12842 mitigation) |
| `CheckFinalTxAtTip` | `nLockTime` satisfied at the current tip |
| Duplicate detection | Exact wtxid or same-txid-different-witness already in mempool |
| Input conflict scan | Every input checked against mempool via `GetConflictTx`; populates `m_conflicts` (RBF candidates) |
| Input existence | All UTXOs present in the coin cache (backed by mempool + chainstate) |
| BIP68 sequence locks | Relative locktimes pass at the current tip height |
| `Consensus::CheckTxInputs` | Input amounts ≥ output amounts, coinbase maturity |
| `ValidateInputsStandardness` | Non-standard scriptPubKey types |
| `IsWitnessStandard` | Witness stack sizes, witness-program version rules |
| Sigop cost | ≤ `MAX_STANDARD_TX_SIGOPS_COST` (80,000) |
| Mempool minimum feerate | Above `m_pool.GetMinFee()` unless in a package |
| TRUC (BIP-431) checks | Topology and version-3 transaction rules |

At the end of `PreChecks`, if the tx passes, `m_subpackage.m_changeset->StageAddition(...)` tentatively stages the tx in the mempool's internal change set (but does not commit).

**ReplacementChecks** — if `m_rbf` (any input conflicts detected): BIP-125 rules: fee bump, no new unconfirmed ancestors, replaced-tx fee deficit.

**Cluster size limit** — `m_subpackage.m_changeset->CheckMemPoolPolicyLimits()`: the cluster containing this tx must not exceed the cluster-size limit.

**PolicyScriptChecks (`:1139`)** — first script execution pass with `STANDARD_SCRIPT_VERIFY_FLAGS`. Calls `CheckInputScripts`, which runs the script interpreter on every input and populates the signature validation cache. This is deferred to the end to avoid CPU-exhaustion DoS on obviously-invalid txs.

**ConsensusScriptChecks (`:1162`)** — re-runs scripts with the tip's `currentBlockScriptVerifyFlags`. This populates the script cache under the correct consensus flags, catching any edge cases on recent soft-fork activations.

**If not `test_accept`**, calls `FinalizeSubpackage` (`:1195`):
```cpp
m_subpackage.m_changeset->Apply(); // commits to the live mempool
```
Replaced transactions are removed first, then the new tx is committed. Immediately after commit:
```cpp
m_pool.m_opts.signals->TransactionAddedToMempool(tx_info, m_pool.GetAndIncrementSequence());
```
This fires the `CValidationInterface::TransactionAddedToMempool` signal, which is what the wallet (and any other subscribers) use to notice the tx.

After finalizing, `LimitMempoolSize` may evict the lowest-score txs if the pool has grown over its byte limit. If the newly added tx was itself evicted, `AcceptSingleTransactionInternal` returns a `FeeFailure` result.

---

### Stage 4 — Per-peer queueing: `InitiateTxBroadcastToAll` (`src/net_processing.cpp:2272`)

```cpp
void PeerManagerImpl::InitiateTxBroadcastToAll(const Txid& txid, const Wtxid& wtxid)
{
    for (const PeerRef& peer_ref : GetAllPeers()) {
        auto tx_relay = peer.GetTxRelay();
        if (!tx_relay) continue;          // block-relay-only peers skipped

        LOCK(tx_relay->m_tx_inventory_mutex);
        if (tx_relay->m_next_inv_send_time == 0s) continue; // pre-handshake guard

        const uint256& hash{peer.m_wtxid_relay ? wtxid.ToUint256() : txid.ToUint256()};
        if (!tx_relay->m_tx_inventory_known_filter.contains(hash)) {
            tx_relay->m_tx_inventory_to_send.insert(wtxid);
        }
    }
}
```

Key points:

- **Block-only connections** have no `TxRelay` object (`GetTxRelay()` returns nullptr) and are skipped entirely.
- **`m_next_inv_send_time == 0s`** is the sentinel for "handshake not yet complete". It stays zero until `SendMessages` runs successfully for this peer for the first time (which requires `fSuccessfullyConnected`). Skipping such peers prevents a spy from using announcement timing to fingerprint the origin.
- The per-peer Bloom filter **`m_tx_inventory_known_filter`** tracks what the peer already knows (populated when we receive an INV from them, or when we send them an announcement). If the peer already knows the tx, we skip queuing.
- The actual queue is **`m_tx_inventory_to_send`** — a `std::set<Wtxid>` per peer.

#### Reliability: `ReattemptInitialBroadcast` (`src/net_processing.cpp:1636`)

The earlier `AddUnbroadcastTx` call registered the tx in the mempool's `m_unbroadcast_txids`. `ReattemptInitialBroadcast` is scheduled every 10–15 minutes (with jitter to resist P2P fingerprinting). It iterates `GetUnbroadcastTxs()` and calls `InitiateTxBroadcastToAll` again for any tx still in the set — i.e., any tx that hasn't been seen inbound (which would have caused `RemoveUnbroadcastTx`). This provides a best-effort guarantee that the initial broadcast reaches peers even if some were offline or unreachable at submission time.

---

### Stage 5 — Flushing the queue: `SendMessages` (`src/net_processing.cpp:5792`)

`SendMessages` is called for every peer on every iteration of `CConnman::ThreadMessageHandler` (`src/net.cpp:3193`) — a dedicated thread that loops over all nodes, calling `ProcessMessages` then `SendMessages`, sleeping up to 100 ms between iterations when idle.

The tx inventory section of `SendMessages` (around `:6058`):

#### Trickle timer

```cpp
bool fSendTrickle = node.HasPermission(NetPermissionFlags::NoBan);
if (tx_relay->m_next_inv_send_time < current_time) {
    fSendTrickle = true;
    if (node.IsInboundConn()) {
        // deterministic per-peer stagger, ~5s window
        tx_relay->m_next_inv_send_time = NextInvToInbounds(
            current_time, INBOUND_INVENTORY_BROADCAST_INTERVAL, node.m_network_key);
    } else {
        // exponentially distributed, mean ~2s
        tx_relay->m_next_inv_send_time =
            current_time + m_rng.rand_exp_duration(OUTBOUND_INVENTORY_BROADCAST_INTERVAL);
    }
}
```

- **Inbound peers** (`:165` constant: 5 s): the timer is computed from the peer's network key, staggering different inbound peers to different send slots within the 5-second window — this reduces the ability of a spy to correlate announcements across its multiple inbound connections.
- **Outbound peers** (`:169` constant: 2 s mean): exponential random delay, so even if a spy controls outbound targets it cannot predict exactly when announcements will arrive.

`NoBan`-permissioned peers bypass the timer and get immediate delivery.

#### The flush itself

When `fSendTrickle` is true:

1. If `!tx_relay->m_relay_txs` (the peer sent `fRelay=0` during version handshake): the queue is **cleared** without sending.

2. **BIP35 mempool dump** (if `m_send_mempool` was set by a `mempool` message): all current mempool entries are injected into `vInv`.

3. **Normal inventory batch**:
   ```cpp
   // copy all pending wtxids into a vector of iterators
   // heapify by CompareInvMempoolOrder — highest mining score first
   // pop up to broadcast_max entries:
   while (!vInvTx.empty() && nRelayedTransactions < broadcast_max) {
       auto wtxid = *it;
       tx_relay->m_tx_inventory_to_send.erase(it);
       auto txinfo = m_mempool.info(wtxid);
       if (!txinfo.tx) continue;             // evicted from mempool — skip
       // build CInv{MSG_WTX} or CInv{MSG_TX} per peer capability
       if (known_filter.contains(inv.hash)) continue;   // already known
       if (txinfo.fee < filterrate.GetFee(txinfo.vsize)) continue; // fee filter
       if (bloom_filter && !bloom_filter->IsRelevantAndUpdate(*txinfo.tx)) continue;
       vInv.push_back(inv);
       if (vInv.size() == MAX_INV_SZ) { MakeAndPushMessage(..., "inv", vInv); vInv.clear(); }
       known_filter.insert(inv.hash);
   }
   ```
   - `broadcast_max` is `INVENTORY_BROADCAST_TARGET` (35 for the 5-second window at 7 tx/s) normally, scaling up when the queue is very long, capped at `INVENTORY_BROADCAST_MAX = 1000`.
   - The heap ordering (topology-aware mining score) means high-fee, spendable-input txs go first — this is both a propagation optimization and a privacy measure (it prevents trivially inferring submission order).
   - The **`m_tx_inventory_known_filter`** is a rolling Bloom filter; inserting after announcement prevents re-announcing the same tx on the next tick.
   - The **fee filter** (`feefilter` message, stored in `m_fee_filter_received`) lets peers declare a minimum feerate they're willing to hear about; txs below it are silently dropped from the batch.

4. `MakeAndPushMessage(node, NetMsgType::INV, vInv)` serializes the `CInv` vector and hands it to `CConnman::PushMessage`, which places the bytes in the peer's send buffer. `CConnman::ThreadSocketHandler` (a separate thread) drains those buffers onto the actual TCP socket.

---

### How the stages connect

```
sendrawtransaction RPC
  └─ BroadcastTransaction (node/transaction.cpp)
       ├─ [cs_main] ProcessTransaction → AcceptToMemoryPool → MemPoolAccept
       │     ├─ PreChecks          (structural + policy + economic)
       │     ├─ ReplacementChecks  (BIP-125 RBF, if conflicts)
       │     ├─ ClusterSizeLimit
       │     ├─ PolicyScriptChecks (script exec, STANDARD_SCRIPT_VERIFY_FLAGS)
       │     ├─ ConsensusScriptChecks (script exec, block-level flags)
       │     └─ FinalizeSubpackage (changeset.Apply → mempool committed)
       │           └─ signals->TransactionAddedToMempool (wallet notified)
       ├─ mempool.AddUnbroadcastTx (retry-broadcast tracking)
       ├─ [wait] SyncWithValidationInterfaceQueue (wallet callbacks drained)
       └─ peerman->InitiateTxBroadcastToAll
            └─ per peer: m_tx_inventory_to_send.insert(wtxid)
                                  │
                     [ThreadMessageHandler loop, every ~2-5s per peer]
                                  ↓
                 SendMessages → trickle timer fires → fSendTrickle
                   └─ heap-sorted batch from m_tx_inventory_to_send
                        → fee-filter + bloom-filter checks
                        → MakeAndPushMessage(NetMsgType::INV)
                             └─ CConnman::PushMessage → send buffer
                                  └─ ThreadSocketHandler → TCP socket
```

The `m_tx_inventory_to_send` set is the explicit decoupling point: ATMP submission and peer queueing happen synchronously in `BroadcastTransaction`, but the actual `INV` bytes are sent asynchronously when the per-peer trickle timer fires in the message-handler thread. This is what gives Bitcoin's relay layer its randomized, privacy-preserving timing: the node knows about a new tx immediately, but each peer sees the announcement at a slightly different, unpredictably delayed moment.
