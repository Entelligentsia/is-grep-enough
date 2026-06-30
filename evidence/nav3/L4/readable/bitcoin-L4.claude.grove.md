# transcript: I'm studying how Bitcoin Core takes a newly received block and integrates it into the active chain. I need to understand how the block is first subjected to ...


💬 Let me load the grove tools and map the block processing pipeline systematically.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__map)

💬 Now let me explore the key functions across the pipeline in parallel.
  ▸ mcp__grove__symbols({"dir":"src","name":"ProcessNewBlock"})
  ▸ mcp__grove__symbols({"dir":"src","name":"AcceptBlock"})
  ▸ mcp__grove__symbols({"dir":"src","name":"ActivateBestChain"})
  ▸ mcp__grove__symbols({"dir":"src","name":"ConnectTip"})

💬 Now let me read all four key functions in parallel.
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ProcessNewBlock@4405"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#AcceptBlock@4305"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ActivateBestChain@3330"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ConnectTip@3019"})

💬 Now let me fetch the remaining key stages in parallel — header acceptance, both check functions, `ConnectBlock`, the step function, and `ReceivedBlockTransac...
  ▸ mcp__grove__symbols({"dir":"src","name":"AcceptBlockHeader"})
  ▸ mcp__grove__symbols({"dir":"src","name":"CheckBlock"})
  ▸ mcp__grove__symbols({"dir":"src","name":"ContextualCheckBlock"})
  ▸ mcp__grove__symbols({"dir":"src","name":"ConnectBlock"})
  ▸ mcp__grove__symbols({"dir":"src","name":"ActivateBestChainStep"})
  ▸ mcp__grove__symbols({"dir":"src","name":"ReceivedBlockTransactions"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#AcceptBlockHeader@4193"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#CheckBlock@3925"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ContextualCheckBlock@4136"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ActivateBestChainStep@3198"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ReceivedBlockTransactions@3772"})

💬 Now let me read `ConnectBlock` (the UTXO application engine) and a few supporting pieces.
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#ConnectBlock@2301"})
  ▸ mcp__grove__symbols({"dir":"src","name":"FindMostWorkChain"})
  ▸ mcp__grove__symbols({"dir":"src","name":"UpdateTip"})

💬 Let me grab `FindMostWorkChain` and `UpdateTip` to complete the picture.
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#FindMostWorkChain@3128"})
  ▸ mcp__grove__source({"id":"cpp:src/validation.cpp#UpdateTip@2896"})

💬 I now have the complete picture across every function in the pipeline. Here is a thorough walkthrough of every cooperative stage.  ---  ## Bitcoin Core block...

──────── RESULT (success, 435907ms, 26 turns) ────────
I now have the complete picture across every function in the pipeline. Here is a thorough walkthrough of every cooperative stage.

---

## Bitcoin Core block-processing pipeline

All the real work lives in `src/validation.cpp`. The top-level entry point is called by `net_processing.cpp` when a full block arrives from a peer.

---

### Stage 0 — Entry: `ChainstateManager::ProcessNewBlock` (line 4405)

```
net_processing → ProcessNewBlock(block, force, min_pow_checked, &new_block)
```

This function is the public interface. It holds `cs_main` for only the first half, then releases it before chain activation. Three things happen in sequence:

1. **`CheckBlock`** is called first, still under `cs_main`, *before* `AcceptBlock`. The comment explains why: if `CheckBlock` fails the block is intentionally never stored or marked invalid. This is a CVE-2012-2459 defence — a malleable-but-PoW-valid block could otherwise permanently poison the block index. Because `CheckBlock` writes the `fChecked` flag on `CBlock`, it cannot run concurrently (data race), so the lock must be held across it.

2. If that passes, **`AcceptBlock`** is called (still under `cs_main`). On failure, `signals->BlockChecked` fires and the function returns false.

3. `cs_main` is released. **`ActiveChainstate().ActivateBestChain`** is then called without the lock. If an `assumeutxo` background chainstate exists, its `ActivateBestChain` is called too.

---

### Stage 1 — Context-free checks: `CheckBlock` (line 3925)

```
CheckBlock(block, state, consensusParams, fCheckPOW=true, fCheckMerkleRoot=true)
```

No chain state is consulted here — the checks apply to the block in isolation:

| Check | Detail |
|---|---|
| `block.fChecked` cache | Skip if already validated (set at the end of this function) |
| `CheckBlockHeader` | PoW target & hash, signet block solution if applicable |
| `CheckMerkleRoot` | Merkle tree of txids matches header `hashMerkleRoot` |
| Size limits | `vtx` count × `WITNESS_SCALE_FACTOR ≤ MAX_BLOCK_WEIGHT`; non-witness serialization weight also bounded |
| Coinbase structure | First tx must be coinbase, rest must not be |
| `CheckTransaction` per tx | Duplicate inputs (CVE-2018-17144 fix), basic tx validity |
| Legacy sigop count | Undercount used as a pre-filter; full count happens in `ConnectBlock` |

On success with both PoW and merkle checks enabled, `block.fChecked = true` is set, preventing any future re-checking of the same block object.

---

### Stage 2 — Header acceptance & block index registration: `ChainstateManager::AcceptBlockHeader` (line 4193)

Called from `AcceptBlock`. Runs under `cs_main`.

1. **Duplicate check** — looks up `block.GetHash()` in `m_blockman.m_block_index`. If already present and flagged `BLOCK_FAILED_VALID`, returns invalid immediately.
2. **`CheckBlockHeader`** — validates PoW and basic header fields again (the call in `CheckBlock` is a belt-and-suspenders; this is the canonical one for headers arriving without bodies).
3. **Previous block lookup** — fetches `block.hashPrevBlock` from the block index. Missing or invalid-flagged parent → rejection.
4. **`ContextualCheckBlockHeader`** — checks things that require the previous header: timestamp is within 2 hours ahead of adjusted local time, difficulty matches what `GetNextWorkRequired` computes, version bits.
5. **`min_pow_checked` guard** — blocks the header from being indexed if the full header chain hasn't been PoW-verified to the minimum chain work threshold. This prevents DoS from fabricated low-work chains.
6. **`m_blockman.AddToBlockIndex`** — creates a new `CBlockIndex` entry and sets `m_best_header` if appropriate. The index entry starts as `BLOCK_VALID_TREE`.

---

### Stage 2 continued — DoS filtering & contextual block checks: `ChainstateManager::AcceptBlock` (line 4305)

After `AcceptBlockHeader` succeeds:

**DoS filters (unrequested blocks):**
- `fAlreadyHave` — `BLOCK_HAVE_DATA` already set → skip.
- `pindex->nTx != 0` — previously-processed pruned block → skip.
- `!fHasMoreOrSameWork` — less cumulative work than active tip → skip.
- `fTooFarAhead` — more than `MIN_BLOCKS_TO_KEEP` (288) above active height → skip.
- `nChainWork < MinimumChainWork()` → skip (DoS protection against fake chains).

**Contextual block checks (`ContextualCheckBlock`, line 4136):**

These require the *previous block index entry*:

| Check | Rule |
|---|---|
| `IsFinalTx` per tx | `nLockTime` finality at current height using MTP (BIP113/CSV) or block time |
| Coinbase height (BIP34) | After `DEPLOYMENT_HEIGHTINCB` activation, coinbase scriptSig must start with serialized block height |
| Witness commitment (segwit) | After `DEPLOYMENT_SEGWIT`, a valid witness merkle root commitment must be in a coinbase output prefixed with `0xaa21a9ed`; witness reserved value and segwit merkle tree validated |
| Block weight after witness | `GetBlockWeight(block) ≤ MAX_BLOCK_WEIGHT` — checked *after* the coinbase witness is verified so a bloated coinbase witness can't permanently poison the index |

**Pre-relay signal:**
If the block builds directly on the active tip and we're not in IBD, `signals->NewPoWValidBlock` fires here — *before* disk write — allowing compact block relay to peers without waiting for UTXO validation.

**Disk write — `m_blockman.WriteBlock`:**
Serialises the block into the flat block files (`blk?????.dat`), returns a `FlatFilePos {nFile, nPos}`.

**`ReceivedBlockTransactions` (line 3772):**
Under `cs_main`, updates the `CBlockIndex` with disk location and transaction count:

- Sets `pindex->nTx`, `nFile`, `nDataPos`, raises `nStatus` to `BLOCK_HAVE_DATA | BLOCK_OPT_WITNESS` (if segwit active), raises validity to `BLOCK_VALID_TRANSACTIONS`, marks the index entry dirty.
- If the parent's `m_chain_tx_count` is already known, walks a BFS queue to propagate `m_chain_tx_count` forward through any previously-orphaned descendants that were waiting in `m_blocks_unlinked`. Each block that can now be linked calls `TryAddBlockIndexCandidate`, which inserts it into `setBlockIndexCandidates` (the priority queue ordered by chain work).
- If the parent is not yet linked, the block is stored in `m_blocks_unlinked` for future resolution.

---

### Stage 3 — Chain activation: `Chainstate::ActivateBestChain` (line 3330)

Called without `cs_main`. Acquires `m_chainstate_mutex` (a separate per-chainstate mutex) to allow one caller at a time while releasing `cs_main` periodically.

The outer loop runs until `pindexNewTip == pindexMostWork`:

1. **`LimitValidationInterfaceQueue`** — drains the `ValidationInterface` callback queue so it doesn't fall too far behind during large reorgs or reindexing.

2. Acquires `cs_main` + `MempoolMutex` together.

3. **`FindMostWorkChain`** (line 3128) — pops the highest-work entry from `setBlockIndexCandidates`, then walks backward from it to the active chain to verify every ancestor either has data or is already on the chain. Any block with `BLOCK_FAILED_VALID` or missing `BLOCK_HAVE_DATA` causes the entire candidate chain to be pruned from `setBlockIndexCandidates` and re-inserted into `m_blocks_unlinked` if data is merely missing. Returns the tip index of the best usable chain.

4. **`ActivateBestChainStep`** (line 3198):

   - **Reorg — disconnect phase**: Walks backward from the active tip to the fork point with the new best chain. Calls `DisconnectTip` for each block to remove (puts those transactions back in `disconnectpool`).
   - **Connect phase**: Builds `vpindexToConnect` (up to 32 blocks at a time from the fork point to `index_most_work`), then iterates forward calling **`ConnectTip`** for each.
   - On consensus failure in `ConnectTip`: calls `InvalidChainFound`, sets `fInvalidFound = true`, clears `pindexMostWork` so the outer loop retries `FindMostWorkChain`.
   - On system error: calls `MaybeUpdateMempoolForReorg` to keep the mempool consistent even on abort.
   - After successful connect: calls `PruneBlockIndexCandidates`, then returns if we've made forward progress (releases `cs_main` briefly, letting other threads and the callback queue run).
   - If blocks were disconnected, calls `MaybeUpdateMempoolForReorg` to re-add disconnected transactions to the mempool.

5. **Signals fired (under `cs_main`)** — for each connected block, `signals->BlockConnected` fires (carrying the `CBlockIndex*` and `shared_ptr<CBlock>`). Then, if the active tip actually changed, `signals->UpdatedBlockTip(pindexNewTip, pindexFork, still_in_ibd)` fires, followed by `kernel::GetNotifications().blockTip(...)`.

6. **`signals->ActiveTipChange`** fires after `cs_main` is released.

7. **`FlushStateToDisk(PERIODIC)`** — writes dirty block index entries and the UTXO set to LevelDB on a periodic schedule.

---

### Stage 4 — Applying transactions to the UTXO set: `Chainstate::ConnectBlock` (line 2301)

Called from `ConnectTip`. Operates on a `CCoinsViewCache` (an in-memory overlay on the LevelDB UTXO set).

**Sanity re-check:** `CheckBlock` is called once more. If `fChecked` was set earlier, this is nearly free.

**`assumevalid` decision:** Computes `script_check_reason`. Script verification is *skipped* (but all other checks still run) when the block is an ancestor of the configured `assumevalid` hash, that hash is in the best header chain, the best header has enough chain work, and the block is old enough (> 2 weeks behind the best header). This makes IBD vastly faster without compromising non-script consensus rules.

**BIP30 check:** For each tx output, if a UTXO with the same outpoint already exists in the view, the block is invalid (prevents coinbase duplication — CVE-2012-1909). The check is skipped between BIP34 activation and height 1,983,702 where BIP34 makes such duplicates impossible.

**Per-transaction loop (the UTXO engine):**

For each non-coinbase tx:
1. **`Consensus::CheckTxInputs`** — confirms all inputs exist in the view, computes fee, checks no value overflow.
2. **BIP68 sequence locks** — `SequenceLocks` uses per-input coin heights from the view; can only be done here because it requires UTXO heights.
3. **`GetTransactionSigOpCost`** — full (legacy + P2SH + witness) sigop accounting.
4. **`CheckInputScripts`** — script/signature verification. If a `CCheckQueue` with threads is available and scripts aren't skipped, verification is dispatched to the thread pool (checks are pushed into the queue, not evaluated yet). This is where P2PKH, P2SH, P2WPKH, P2WSH, taproot scripts are evaluated.
5. **`UpdateCoins`** — removes spent UTXOs from the view, adds the new outputs. Also records undo data (`CTxUndo`) for each non-coinbase input so the block can be disconnected later.

After the loop:
- **Coinbase reward check**: `block.vtx[0]->GetValueOut() ≤ nFees + GetBlockSubsidy(height)`.
- **`control->Complete()`**: waits for all script threads to finish and collects any failure.
- **`m_blockman.WriteBlockUndo`**: writes the undo file (`rev?????.dat`) so the block can be disconnected later.
- **`pindex->RaiseValidity(BLOCK_VALID_SCRIPTS)`**: marks the block index entry as fully validated.
- **`view.SetBestBlock(pindex->GetBlockHash())`**: commits the new chain tip into the UTXO cache.
- A USDT **tracepoint** (`validation:block_connected`) fires for external observers.

Back in `ConnectTip`, `view.Flush()` writes the cache down one level (not yet to disk), then `FlushStateToDisk(IF_NEEDED)` writes to LevelDB if thresholds are exceeded. Then:
- **`m_mempool->removeForBlock`** — removes the block's transactions from the mempool (and from `disconnectpool`).
- **`m_chain.SetTip(*pindexNew)`** — officially advances the `CChain`.
- **`UpdateTip`** (line 2896) — increments `mempool.nTransactionsUpdated`, checks for unknown version bits (warning machinery), logs the new tip. Skips everything except the log for background chainstates.
- **`MaybeValidateSnapshot`** — if this chainstate has reached its `assumeutxo` target block, hashes the UTXO set and compares to the snapshot hash. If it matches, the background chainstate is retired and the snapshot chainstate becomes the sole active one.
- The `CBlockIndex*` and block are appended to `connected_blocks`, which is returned to `ActivateBestChain` for the `signals->BlockConnected` dispatch.

---

### How the stages fit together — summary diagram

```
net_processing::ProcessMessage("block")
  └─ ChainstateManager::ProcessNewBlock          [cs_main held throughout]
        │
        ├─ CheckBlock                             ← context-free: PoW, merkle, tx structure
        │
        └─ AcceptBlock
              ├─ AcceptBlockHeader                ← PoW + contextual header checks
              │     └─ AddToBlockIndex            ← creates CBlockIndex (BLOCK_VALID_TREE)
              │
              ├─ CheckBlock (again)               ← belt-and-suspenders under AcceptBlock
              ├─ ContextualCheckBlock             ← finality, BIP34 height, segwit commitment
              │
              ├─ signals->NewPoWValidBlock        ← compact-block relay (before UTXO check)
              │
              ├─ m_blockman.WriteBlock            ← block → blk?????.dat
              └─ ReceivedBlockTransactions        ← index: BLOCK_HAVE_DATA, propagate chain_tx_count,
                                                     TryAddBlockIndexCandidate → setBlockIndexCandidates

     [cs_main released]

  └─ Chainstate::ActivateBestChain               [m_chainstate_mutex; cs_main acquired/released in loop]
        │
        ├─ FindMostWorkChain                      ← pick highest-work fully-linked candidate
        │
        └─ ActivateBestChainStep
              ├─ DisconnectTip × N               ← reorg: disconnect old tip blocks, fill disconnectpool
              │
              └─ ConnectTip × M                  ← for each block to connect:
                    ├─ ReadBlock (if not cached)
                    ├─ ConnectBlock               ← THE UTXO ENGINE:
                    │     ├─ CheckBlock (cheap, fChecked=true)
                    │     ├─ assumevalid decision
                    │     ├─ BIP30 duplicate-coinbase check
                    │     ├─ per-tx loop:
                    │     │    CheckTxInputs, SequenceLocks, sigop cost,
                    │     │    CheckInputScripts (async to CCheckQueue)
                    │     │    UpdateCoins (spend inputs, add outputs, build undo)
                    │     ├─ coinbase subsidy check
                    │     ├─ control->Complete() (join script threads)
                    │     ├─ WriteBlockUndo       → rev?????.dat
                    │     ├─ RaiseValidity(BLOCK_VALID_SCRIPTS)
                    │     └─ view.SetBestBlock    (UTXO cache → new tip)
                    │
                    ├─ view.Flush()               ← cache → LevelDB overlay
                    ├─ FlushStateToDisk(IF_NEEDED)
                    ├─ mempool.removeForBlock
                    ├─ m_chain.SetTip             ← CChain pointer advanced
                    └─ UpdateTip                  ← log, version-bit warnings, mempool counter

              [still under cs_main]
              signals->BlockConnected            ← per connected block
              signals->UpdatedBlockTip           ← new tip vs fork point
              kernel::GetNotifications().blockTip

              [cs_main released]
              signals->ActiveTipChange
              FlushStateToDisk(PERIODIC)
```

---

### Key design decisions worth noting

- **Two-phase locking**: `cs_main` is held for `AcceptBlock` but deliberately *not* held across `ActivateBestChain`. The chainstate mutex `m_chainstate_mutex` prevents concurrent activation while still letting `cs_main` be released between steps so the P2P and RPC threads don't starve.

- **`setBlockIndexCandidates` vs the active chain**: Activation is entirely pull-based. `AcceptBlock` does not connect anything; it only populates the priority queue. `ActivateBestChain` decides what to connect, supporting arbitrarily deep reorgs.

- **`assumevalid` scoping**: Script validation is bypassed *only inside `ConnectBlock`*. All structural checks (`CheckBlock`, `ContextualCheckBlock`, `CheckTxInputs`, `SequenceLocks`, sigop limits) run regardless. A node configured with `assumevalid` still fully validates every consensus rule except signatures for historical blocks.

- **Signals are fired under `cs_main` for ordering**: `BlockConnected` and `UpdatedBlockTip` are enqueued while `cs_main` is held so that subscribers (wallet, indexes, ZMQ) always see blocks in the exact order they were connected, even across reorgs.

- **Block index dirtiness**: `ReceivedBlockTransactions` and `ConnectBlock` both call `m_dirty_blockindex.insert(pindex)`. The actual LevelDB write is deferred to the next `FlushStateToDisk` call, batching many index updates into a single write transaction.
