# transcript: I'm planning a change to how a transaction submitted to the node reaches its peers, so I need to understand the full journey of a locally submitted transacti...


💬 I'll explore the four stages in parallel using grove — loading tools first, then fanning out across the RPC, mempool, and peer announcement layers.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)

💬 Now let me fan out across all four stages in parallel.
  ▸ mcp__grove__symbols({"dir":"src/rpc","name":"sendrawtransaction","nameContains":true})
  ▸ mcp__grove__symbols({"dir":"src","name":"AcceptToMemoryPool","nameContains":true})
  ▸ mcp__grove__symbols({"dir":"src","name":"RelayTransaction","nameContains":true})
  ▸ mcp__grove__symbols({"dir":"src","name":"SendMessages","nameContains":true})
  ▸ mcp__grove__source({"id":"cpp:src/rpc/mempool.cpp#sendrawtransaction@47"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#AcceptToMemoryPool@1781"})
  ▸ mcp__grove__symbols({"dir":"src","name":"BroadcastTransaction","nameContains":true})
  ▸ mcp__grove__symbols({"dir":"src/net_processing.cpp","nameContains":true,"name":"TransactionAddedToMempool"})

💬 Good. Now let me read `BroadcastTransaction`, the `MemPoolAccept` checks, and find the signal that bridges mempool acceptance to peer notification.
  ▸ mcp__grove__source({"id":"cpp:src/node/transaction.cpp#BroadcastTransaction@32"})
  ▸ mcp__grove__symbols({"dir":"src","name":"AcceptSingleTransactionAndCleanup","nameContains":true})
  ▸ mcp__grove__symbols({"dir":"src","name":"TransactionAddedToMempool","nameContains":true})

💬 Now let me read the core mempool acceptance logic, find the peer manager's broadcast methods, and look at SendMessages for the inventory flush.
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#AcceptSingleTransactionAndCleanup@591"})
  ▸ mcp__grove__symbols({"dir":"src","name":"InitiateTxBroadcastToAll","nameContains":true})
  ▸ mcp__grove__source({"id":"cpp:src/net_processing.cpp#SendMessages@5792"})

💬 Now let me read `InitiateTxBroadcastToAll` and the mempool acceptance chain functions.
  ▸ mcp__grove__source({"id":"cpp:src/net_processing.cpp#InitiateTxBroadcastToAll@2272"})
  ▸ mcp__grove__symbols({"dir":"src/validation.cpp","name":"PreChecks","nameContains":true})
  ▸ mcp__grove__symbols({"dir":"src/validation.cpp","name":"ProcessTransaction","nameContains":true})

💬 Let me read the key validation functions now.
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ProcessTransaction@4455"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#PreChecks@786"})

💬 Let me read `AcceptSingleTransactionAndCleanup` body directly since grove returned only the signature, and also look at how the validation signal fires.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ mcp__grove__source({"id":"cpp:src/validationinterface.cpp#TransactionAddedToMempool@200"})

💬 Let me find and read `AcceptSingleTransactionInternal` to see how all the checks chain and when the signal fires.
  ▸ mcp__grove__symbols({"dir":"src/validation.cpp","name":"AcceptSingleTransactionInternal","nameContains":true})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#AcceptSingleTransactionInternal@1323"})

💬 Let me check what calls `SendMessages` and how it's driven periodically.
  ▸ mcp__grove__callers({"dir":"src","name":"SendMessages"})

💬 Let me check the `net.cpp` call site to understand the driving loop.
  ▸ Read(/home/bench/repos/bitcoin/src/net.cpp)

💬 I now have everything I need. Here is the complete walkthrough.  ---  ## The journey of a locally submitted transaction, end-to-end  ### Stage 1 — RPC (`src/...

──────── RESULT (success, 375085ms, 27 turns) ────────
I now have everything I need. Here is the complete walkthrough.

---

## The journey of a locally submitted transaction, end-to-end

### Stage 1 — RPC (`src/rpc/mempool.cpp:47`, `sendrawtransaction`)

The entry point is the `sendrawtransaction` RPC. It:

1. Decodes the hex string into a `CMutableTransaction` via `DecodeHexTx`, then wraps it in a `CTransactionRef`.
2. Validates the `maxburnamount` limit on each output (OP_RETURN / unspendable scripts).
3. Computes `max_raw_tx_fee` from `maxfeerate × virtual_size`.
4. Checks whether `-privatebroadcast` is enabled and which of Tor/I2P is reachable, then picks a broadcast mode: `TxBroadcast::MEMPOOL_AND_BROADCAST_TO_ALL` (the normal case) or `TxBroadcast::NO_MEMPOOL_PRIVATE_BROADCAST`.
5. Calls `BroadcastTransaction(node, tx, err_string, max_raw_tx_fee, method, /*wait_callback=*/true)`.

---

### Stage 2 — `BroadcastTransaction` (`src/node/transaction.cpp:32`)

This function is the bridge between the RPC layer and the rest of the node. Under `cs_main`:

1. **UTXO-set check**: if any output of this txid already exists in `CoinsTip()`, the tx is already confirmed — return `ALREADY_IN_UTXO_SET` immediately.
2. **Already-in-mempool check**: if `mempool->get(txid)` succeeds, skip submission but capture the mempool's wtxid for re-announcement.
3. **Test-accept run**: if `max_tx_fee > 0` or private-broadcast mode is set, calls `chainman->ProcessTransaction(tx, test_accept=true)` for a dry run. On failure or fee overage, returns an error without touching the mempool.
4. **Real submission**: for `MEMPOOL_AND_BROADCAST_TO_ALL`, calls `chainman->ProcessTransaction(tx, test_accept=false)`. On failure, returns the error.
5. **Unbroadcast tracking**: calls `mempool->AddUnbroadcastTx(txid)` so the rebroadcast logic knows this tx has never been seen by any peer yet.
6. **Sync callbacks** (`wait_callback=true`): calls `validation_signals->SyncWithValidationInterfaceQueue()`, blocking until all validation-interface subscribers (wallet, ZMQ, fee estimator, etc.) have processed the `TransactionAddedToMempool` notification. This prevents RPC callers from seeing stale wallet state.
7. **Peer announcement**: calls `peerman->InitiateTxBroadcastToAll(txid, wtxid)` (shown below).

---

### Stage 3 — Mempool acceptance (`src/validation.cpp`)

`ProcessTransaction` (`src/validation.cpp:4455`) acquires `cs_main`, calls `AcceptToMemoryPool`, which hands off to `MemPoolAccept::AcceptSingleTransactionAndCleanup` → `AcceptSingleTransactionInternal` (`src/validation.cpp:1323`). Checks run in this strict order, cheapest first:

**`PreChecks`** (`src/validation.cpp:786`) — policy-level, fast:
- `CheckTransaction`: basic sanity (no empty vin/vout, output values in range, no duplicate inputs).
- Not a coinbase (coinbases are only valid inside a block).
- `IsStandardTx`: output script types, data carrier size, no bare multisig if disabled.
- Minimum non-witness size ≥ 65 bytes (CVE-2017-12842 mitigation).
- `CheckFinalTxAtTip`: nLockTime must be satisfied for the next block.
- Exact-duplicate check: already in mempool by wtxid or txid → `TX_CONFLICT`.
- **Input conflict detection**: for each input, `m_pool.GetConflictTx()` — if a conflict exists and replacement is disallowed → reject; otherwise, records conflicting txids in `ws.m_conflicts` to trigger RBF checks.
- **Input existence**: all inputs must be present in the coins cache (UTXO set + mempool view); missing inputs → `TX_MISSING_INPUTS`.
- BIP68 sequence-lock check against the next block.
- `CheckTxInputs`: input amounts, overflow, fee calculation (sets `ws.m_base_fees`).
- `ValidateInputsStandardness`: script-type standardness per input.
- `IsWitnessStandard`: witness structure standardness.
- SigOps cost ≤ `MAX_STANDARD_TX_SIGOPS_COST`.
- `PreCheckEphemeralTx`: zero-fee requirement for dust-output ("ephemeral") transactions.
- **Mempool min-feerate check**: modified fee / vsize must exceed the dynamic mempool floor.
- **TRUC (v3) checks** via `SingleTRUCChecks`: topology and cluster constraints for v3 transactions, with optional sibling-eviction.

**`ReplacementChecks`** (if any conflicts exist, i.e., RBF path):
- Enforces BIP125 rules: opt-in signalling, new tx must pay more fees, absolute fee increase, no new unconfirmed parents, conflict set size limit.

**Cluster size limit**: `m_subpackage.m_changeset->CheckMemPoolPolicyLimits()` — ensures the resulting cluster stays within the cluster-mempool size cap.

**`PolicyScriptChecks`**: runs all scripts with policy-level flags (stricter than consensus; e.g., `SCRIPT_VERIFY_CLEANSTACK`, `DISCOURAGE_UPGRADABLE_*`).

**`ConsensusScriptChecks`**: re-runs scripts with consensus flags and caches the results in the script validation cache.

**`FinalizeSubpackage`**: applies the changeset to the live mempool; any replaced transactions are evicted.

**Signal fires**: immediately after applying the changeset, `AcceptSingleTransactionInternal` calls:
```cpp
m_pool.m_opts.signals->TransactionAddedToMempool(tx_info, m_pool.GetAndIncrementSequence());
```
`ValidationSignals::TransactionAddedToMempool` (`src/validationinterface.cpp:200`) enqueues an async event that fans out to every registered `CValidationInterface` subscriber (wallet, ZMQ notifier, fee estimator, etc.) on the validation-interface background thread.

`ProcessTransaction` also runs `mempool->check()` as a sanity assertion before returning to `BroadcastTransaction`.

---

### Stage 4 — Per-peer announcement queue (`src/net_processing.cpp:2272`, `InitiateTxBroadcastToAll`)

Back in `BroadcastTransaction`, after `ProcessTransaction` returns `VALID` and `SyncWithValidationInterfaceQueue` returns, `peerman->InitiateTxBroadcastToAll(txid, wtxid)` is called.

This iterates every connected peer and, for each:
- Skips peers with no `TxRelay` slot (block-relay-only connections never relay txns).
- Skips peers whose version handshake is incomplete (`m_next_inv_send_time == 0`), to avoid leaking timing information to potential spies.
- Uses `wtxid` as the key for wtxid-relay peers, `txid` for legacy peers.
- If the key is **not** in `tx_relay->m_tx_inventory_known_filter` (i.e., this peer doesn't already know about it), inserts the `wtxid` into `tx_relay->m_tx_inventory_to_send` (a `std::set<Wtxid>`).

Nothing is sent yet. The tx is merely staged in each peer's inventory queue.

---

### Stage 5 — Inventory flush as `INV` messages (`src/net.cpp:3219` → `src/net_processing.cpp:5792`, `SendMessages`)

**What drives `SendMessages`**: `CConnman::ThreadMessageHandler` in `src/net.cpp` runs a continuous loop over all connected peers. For each peer it calls `m_msgproc->ProcessMessages()` (inbound) then `m_msgproc->SendMessages()` (outbound). If there is no more work, the thread waits up to 100 ms (`condMsgProc.wait_until`) before looping again.

**Inside `PeerManagerImpl::SendMessages`** for the tx-inventory section (under `tx_relay->m_tx_inventory_mutex`):

1. **Trickle timer**: checks `tx_relay->m_next_inv_send_time` against `current_time`. The timer is randomized differently by connection direction:
   - *Outbound*: `current_time + rand_exp(OUTBOUND_INVENTORY_BROADCAST_INTERVAL)` (~2 s mean, exponential jitter).
   - *Inbound*: `NextInvToInbounds(current_time, INBOUND_INVENTORY_BROADCAST_INTERVAL, node.m_network_key)` — deterministic per-peer jitter derived from the peer's network key, giving each inbound peer a staggered slot.
   - `NoBan`-privileged peers bypass the timer entirely.
   - When the timer fires, sets `fSendTrickle = true` and resets the timer.

2. **If `fSendTrickle`**:
   - If `!tx_relay->m_relay_txs` (peer sent `fRelay=false` in `version`): clear the queue and skip.
   - Copies all iterators from `m_tx_inventory_to_send` into `vInvTx` and heapifies them with `CompareInvMempoolOrder` (topological + fee-rate ordering, for privacy and mining priority).
   - Dequeues up to `broadcast_max` entries (≥ `INVENTORY_BROADCAST_TARGET`, scaled slightly with queue depth):
     - Pops the highest-priority wtxid off the heap.
     - Removes it from `m_tx_inventory_to_send`.
     - Looks up `m_mempool.info(wtxid)` — if the tx is no longer in mempool, skips it.
     - Constructs `CInv{MSG_WTX, wtxid}` or `CInv{MSG_TX, txid}` based on peer capability.
     - Skips if the hash is already in `m_tx_inventory_known_filter`.
     - Skips if the fee falls below the peer's advertised `feefilter` (`m_fee_filter_received`).
     - Skips if the peer has a bloom filter set and the tx doesn't match it.
     - Appends to `vInv`, inserts the key into `m_tx_inventory_known_filter`.
     - Flushes immediately if `vInv.size() == MAX_INV_SZ (50000)`.

3. Any remaining `vInv` is sent: `MakeAndPushMessage(node, NetMsgType::INV, vInv)`, which serializes the inventory vector and places the bytes into the peer's `CNode` send buffer. The socket-writing thread (`CConnman::SocketSendData`) then drains that buffer to the wire.

The remote peer responds with a `GETDATA` for any txids/wtxids it doesn't have, and the node replies with the full `tx` message.

---

### How the stages connect

```
sendrawtransaction (RPC)
  │  decodes hex, checks burn limits, picks broadcast mode
  └─► BroadcastTransaction (node/transaction.cpp)
        │  cs_main: checks UTXO set & mempool, dry-run if needed
        └─► chainman->ProcessTransaction (validation.cpp)
              └─► AcceptToMemoryPool
                    └─► MemPoolAccept::AcceptSingleTransactionInternal
                          PreChecks → ReplacementChecks → ClusterLimit
                          → PolicyScriptChecks → ConsensusScriptChecks
                          → FinalizeSubpackage (changeset applied)
                          → signals->TransactionAddedToMempool ──► async subscribers
        mempool->AddUnbroadcastTx(txid)       (rebroadcast tracking)
        validation_signals->SyncWithValidationInterfaceQueue()
        peerman->InitiateTxBroadcastToAll(txid, wtxid)
              │  for each peer: inserts wtxid into tx_relay->m_tx_inventory_to_send
              │  (nothing sent yet)

CConnman::ThreadMessageHandler  (net.cpp, continuous loop)
  └─► PeerManagerImpl::SendMessages(node)  (per peer, ≤100ms cadence)
        trickle timer fires per peer (outbound ~2s random, inbound keyed jitter)
        → dequeue m_tx_inventory_to_send, heap-sort by feerate+topology
        → filter (mempool presence, known-filter, feefilter, bloom)
        → MakeAndPushMessage(INV) ──► socket send buffer ──► wire bytes
```

Key design choices to be aware of if you are changing this flow: the trickle timer is the privacy/anti-timing mechanism — bypassing it causes timing leaks. `m_tx_inventory_known_filter` is a cuckoo filter that prevents re-announcing to a peer that already knows; it must be updated atomically with the send. The `AddUnbroadcastTx` set feeds a separate rebroadcast scheduler that re-queues the tx if no peer ever requested it via `GETDATA`.
