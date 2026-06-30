# transcript: I'm studying how Bitcoin Core takes a newly received block and integrates it into the active chain. I need to understand how the block is first subjected to ...


💬 I'll trace through the block integration pipeline using the LSP tool to find and follow each stage precisely.
  ▸ ToolSearch(select:LSP)

💬 Let me look up the key symbols in the pipeline simultaneously.
  ▸ LSP(ProcessNewBlock)
  ▸ LSP(ActivateBestChain)
  ▸ LSP(ConnectTip)
  ▸ LSP(ProcessNewBlock)
  ▸ LSP(AcceptBlock)
  ▸ LSP(CheckBlock)

💬 Now I have all the key positions. Let me read all the critical sections in parallel.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me read the contextual check, ConnectTip, and the two ActivateBestChain functions in parallel.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me look at `ConnectBlock` and the tail of `ActivateBestChain`, plus `ReceivedBlockTransactions`.
  ▸ LSP(ConnectBlock)
  ▸ LSP(ReceivedBlockTransactions)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now let me read the core UTXO-application section of `ConnectBlock`.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 Now I have everything I need to give a complete picture. Let me also quickly check `AcceptBlockHeader` and `UpdateTip` for completeness.
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)
  ▸ LSP(UpdateTip)
  ▸ Read(/home/bench/repos/bitcoin/src/validation.cpp)

💬 I now have all the pieces. Here is a precise walkthrough of the entire pipeline, with file locations for every stage.  ---  ## Block Integration Pipeline in ...

──────── RESULT (success, 150620ms, 25 turns) ────────
I now have all the pieces. Here is a precise walkthrough of the entire pipeline, with file locations for every stage.

---

## Block Integration Pipeline in Bitcoin Core

All code lives in `src/validation.cpp` unless noted. The central types are `ChainstateManager` (owns all chainstates and the block index), `Chainstate` (one per active/background chain, owns the UTXO view), and `CBlockIndex` (one node in the block-tree, kept permanently in `m_block_index`).

---

### Stage 1 — Context-Free Checks: `CheckBlock` (line 3925)

`ProcessNewBlock` (line 4405) is the single entry point called by the P2P layer and the RPC. It acquires `cs_main` and immediately runs `CheckBlock`. This function is deliberately context-free: it does not look at the UTXO set or the active chain at all.

What it checks:
- **Header validity** – delegates to `CheckBlockHeader` (line 3835), which calls `CheckProofOfWork`. PoW is the only thing checked here; the target-vs-nBits comparison happens later.
- **Merkle root** – recomputes and compares.
- **Block weight / size limits** – raw weight and stripped weight must be within `MAX_BLOCK_WEIGHT`.
- **Coinbase structure** – first tx must be coinbase, no others may be.
- **Per-transaction context-free validity** – calls `CheckTransaction` on each tx (duplicate inputs, value ranges, script sizes, etc.).
- **Legacy sigop count** – a fast undercount used as an early-exit gate.
- **`fChecked` short-circuit** – if the block has already been fully checked (e.g., we built it ourselves), the entire function returns immediately.

The security comment at line 4418 explains why `ProcessNewBlock` skips calling `AcceptBlock` on `CheckBlock` failure: a bug in `CheckBlock` (like CVE-2012-2459, where a block with duplicate transactions would fail) must never cause a valid-but-mutated block to be permanently marked invalid, because that could be weaponised to ban a legitimate chain tip.

---

### Stage 2 — Header Registration and Contextual Checks: `AcceptBlockHeader` + `ContextualCheckBlockHeader` + `ContextualCheckBlock` (lines 4193, 4087, 4136)

`ProcessNewBlock` on success immediately calls `AcceptBlock` (line 4305), which starts with `AcceptBlockHeader`.

**`AcceptBlockHeader` (line 4193):**
- Deduplicates against `m_block_index`; returns `true` immediately if already known.
- Calls `CheckBlockHeader` again (belt-and-suspenders for headers arriving standalone via `ProcessNewBlockHeaders`).
- Looks up `hashPrevBlock` in `m_block_index`; fails with `BLOCK_MISSING_PREV` if the parent is unknown.
- Calls `ContextualCheckBlockHeader` (line 4087), which is where chain-context enters:
  - **Difficulty target** – `nBits` must equal `GetNextWorkRequired(pindexPrev)`.
  - **Timestamp** – must be greater than MTP (Median Time Past) of the previous 11 blocks, less than `now + 2h`, and (on networks with BIP94) the first block of each difficulty window must not go too far backwards.
  - **Version rejection** – outdated `nVersion` values are rejected after their respective soft-fork activations (BIP34/66/65).
- Creates a new `CBlockIndex` via `m_blockman.AddToBlockIndex` and inserts it into `m_block_index`. The block's work is recorded here.

Back in `AcceptBlock`, after the header is accepted, several DoS guards decide whether to continue processing the body (lines 4325–4352): if the block was not explicitly requested by the node, it is skipped if it has less work than the current tip, is too far ahead, or has less total chain-work than `MinimumChainWork`.

Then `AcceptBlock` calls `CheckBlock` and **`ContextualCheckBlock`** a second time (line 4357). `ContextualCheckBlock` uses `pindexPrev`:
- **Lock-time finality (BIP68/BIP113)** – after CSV activation, `nLockTimeCutoff` is MTP rather than block timestamp; all transactions must be final against it.
- **Coinbase height (BIP34)** – the coinbase `scriptSig` must push the block height.
- **Witness commitment** – `CheckWitnessMalleation` verifies that the coinbase's witness commitment covers the witness merkle root (SegWit).
- **Block weight with witnesses** – the true post-SegWit weight limit enforced here (rather than in `CheckBlock`, where the witness hash is not yet verified).

---

### Stage 3 — Writing to Disk and the Block Index: `ReceivedBlockTransactions` (line 3772)

Still inside `AcceptBlock`, if both checks pass:

1. **Write to block file** – `m_blockman.WriteBlock` serialises the full `CBlock` into the flat block files (`blk*.dat`) and returns a `FlatFilePos` (file number + byte offset). If a pre-known position is passed (compact block reconstruction), `UpdateBlockInfo` is called instead.
2. **Update the index** – `ReceivedBlockTransactions` (line 3772):
   - Sets `nTx`, `nFile`, `nDataPos` on the `CBlockIndex`.
   - Sets `BLOCK_HAVE_DATA` and raises validity to `BLOCK_VALID_TRANSACTIONS`.
   - Propagates `m_chain_tx_count` (cumulative transaction count used for IBD progress): if the parent already has its count known, it walks a BFS queue of all previously-received children that were waiting for this parent, sets their counts, and calls `TryAddBlockIndexCandidate` on each one — making them eligible for chain selection.
   - If the parent's count is not yet known (out-of-order arrival), the child is stored in `m_blocks_unlinked` to be processed when the parent arrives.

`AcceptBlock` closes by calling `FlushStateToDisk(NONE)`, which may prune old block files if pruning is enabled, but does not force a full database flush.

---

### Stage 4 — Chain Selection: `ActivateBestChain` + `ActivateBestChainStep` + `FindMostWorkChain` (lines 3330, 3198, 3128)

`ProcessNewBlock` releases `cs_main` and then calls `ActiveChainstate().ActivateBestChain(state, block)` (line 4440). It also calls it on the optional background chainstate used during assumeutxo snapshot validation.

**`ActivateBestChain` (line 3330)** holds a per-chainstate `m_chainstate_mutex` rather than `cs_main` for most of its duration, so the rest of the node stays responsive. It runs a loop:

1. Acquires `cs_main` + `MempoolMutex` together.
2. Calls **`FindMostWorkChain` (line 3128)** to identify the best candidate tip: walks `setBlockIndexCandidates` (a `std::set` ordered by `nChainWork`) backwards from the highest-work entry, skipping any that have invalid ancestors. Returns `nullptr` if nothing beats the current tip.
3. If the candidate equals the current tip, the loop exits.
4. Calls **`ActivateBestChainStep` (line 3198)** with the chosen candidate.

**`ActivateBestChainStep`** handles reorgs and forward progress:

- **Disconnect phase** – if the candidate does not descend from the current tip, `m_chain.FindFork` finds the fork point. All blocks from the current tip down to (but not including) the fork are disconnected via `DisconnectTip`, which reverses their UTXO changes using the stored undo data and returns transactions to the mempool's `disconnectpool`.
- **Connect phase** – builds `vpindexToConnect` (up to 32 entries at a time to avoid holding the lock for too long) from the fork point up to the candidate. Each is passed to `ConnectTip` in ascending height order.
- If `ConnectTip` returns an invalid-block result, `InvalidChainFound` marks the whole chain as failed and `fInvalidFound = true` causes `FindMostWorkChain` to be re-run from scratch on the next iteration.
- After at least one `ConnectTip` succeeds and gives us more work than before, `fContinue = false` breaks the inner loop, returning to `ActivateBestChain` so that `cs_main` can be released.

After each step, `ActivateBestChain` fires **`BlockConnected`** signals (still under `cs_main`) for every block that was connected in the step (line 3405–3408), then fires **`UpdatedBlockTip`** and **`blockTip`** kernel notification (lines 3431–3444) to notify external listeners (wallet rescan, ZMQ, etc.) of the new tip. `ActiveTipChange` is fired after releasing `cs_main` (line 3449).

---

### Stage 5 — Applying Transactions to the UTXO Set: `ConnectTip` → `ConnectBlock` (lines 3019, 2301)

**`ConnectTip` (line 3019):**
- Reads the full `CBlock` from disk if not already in memory (the just-processed block is passed as the shared_ptr, so it is usually in memory).
- Calls `ConnectBlock` with a dedicated `CCoinsViewCache` (`m_connect_block_view`), which caches the UTXO mutations for this single block. The cache uses a `CreateResetGuard` so it is wiped on failure.
- On success, calls `view.Flush()` to push the mutations into the underlying `CCoinsViewDB`.
- Calls `FlushStateToDisk(IF_NEEDED)` to periodically persist the UTXO database.
- Removes all block transactions from the mempool and the disconnectpool (`removeForBlock`).
- Calls `m_chain.SetTip(*pindexNew)` — this is the single line that advances the in-memory active chain.
- Calls `UpdateIBDStatus` (may latch `m_cached_is_ibd` to false).
- Calls `UpdateTip` (line 2896), which logs the "new best=" line, bumps mempool's transaction-updated counter, and checks for unknown version-bit activations via `m_versionbitscache`.

**`ConnectBlock` (line 2301)** is the UTXO engine itself, and the most critical function in the codebase:

1. **Re-runs `CheckBlock`** (belt-and-suspenders) with PoW/merkle optional depending on `fJustCheck`.
2. **Determines `assumevalid` status** (lines 2352–2388): if this block is an ancestor of the configured `AssumedValidBlock` and the best header has enough chain work, `script_check_reason` is set to `nullptr`, disabling script execution. This is the major IBD speed optimisation.
3. **BIP30 check** – for any block where BIP34 doesn't already prevent duplicates, verifies no output in this block has a UTXO already in `view`.
4. **Per-transaction loop** (lines 2529–2606):
   - `Consensus::CheckTxInputs` – fetches each input's coin from `view`, verifies amounts, accumulates fees.
   - `SequenceLocks` – enforces BIP68 relative timelocks using coin heights fetched from `view`.
   - `GetTransactionSigOpCost` – accumulates the true sigop cost (including P2SH and witness sigops, unlike `CheckBlock`'s count).
   - `CheckInputScripts` – runs the script interpreter against `flags` (the soft-fork-aware script flags from `GetBlockScriptFlags`). When a `CCheckQueueControl` thread pool is active (the normal case for non-IBD blocks), checks are dispatched to background threads.
   - `UpdateCoins` – spends the input UTXOs and creates the output UTXOs in `view`. Spent coins go into `blockundo.vtxundo` for later disconnect.
5. **Coinbase value check** – `block.vtx[0]->GetValueOut() <= nFees + GetBlockSubsidy(height)`.
6. **Parallel script completion** – `control->Complete()` waits for all background script-check threads.
7. **Write undo data** – `m_blockman.WriteBlockUndo(blockundo)` serialises the undo records to `rev*.dat` files.
8. **Mark validity** – raises the index entry to `BLOCK_VALID_SCRIPTS`.
9. **`view.SetBestBlock(pindex->GetBlockHash())`** – records which block the UTXO view now reflects.

---

### Summary: How the Stages Fit Together

```
ProcessNewBlock (ChainstateManager, line 4405)
│
├─ [cs_main held]
│   ├─ CheckBlock()          ← context-free: PoW, merkle, size, tx structure, legacy sigops
│   └─ AcceptBlock()
│       ├─ AcceptBlockHeader()
│       │   ├─ CheckBlockHeader()
│       │   ├─ ContextualCheckBlockHeader()  ← difficulty, MTP, version bans
│       │   └─ m_blockman.AddToBlockIndex()  ← CBlockIndex created
│       ├─ [DoS guards]
│       ├─ CheckBlock() + ContextualCheckBlock()  ← lock-time, BIP34 height, witness commitment
│       ├─ m_blockman.WriteBlock()           ← body serialised to blk*.dat
│       └─ ReceivedBlockTransactions()       ← nTx, nFile, nDataPos, m_chain_tx_count,
│                                              TryAddBlockIndexCandidate (enters setBlockIndexCandidates)
│
├─ NotifyHeaderTip()
│
└─ ActiveChainstate().ActivateBestChain()    ← [m_chainstate_mutex, NOT cs_main yet]
    └─ loop {
        ├─ [cs_main + MempoolMutex]
        ├─ FindMostWorkChain()               ← pick highest-work valid candidate from setBlockIndexCandidates
        └─ ActivateBestChainStep()
            ├─ DisconnectTip() × N           ← reorg: reverse UTXOs, return txs to disconnectpool
            └─ ConnectTip() × M              ← for each block on path to new tip:
                └─ ConnectBlock()
                    ├─ assumevalid check     ← skip scripts if deep ancestor of trusted hash
                    ├─ BIP30 duplicate check
                    ├─ per-tx loop:
                    │   ├─ CheckTxInputs()   ← spend UTXOs from view, accumulate fees
                    │   ├─ SequenceLocks()   ← BIP68 relative timelocks
                    │   ├─ GetTransactionSigOpCost()
                    │   ├─ CheckInputScripts() → CCheckQueue threads
                    │   └─ UpdateCoins()     ← consume inputs, create outputs in CCoinsViewCache
                    ├─ coinbase value check
                    ├─ control->Complete()   ← join script-check threads
                    ├─ WriteBlockUndo()      ← rev*.dat
                    └─ view.SetBestBlock()
                [back in ConnectTip]
                ├─ view.Flush()             ← push UTXO mutations to CCoinsViewDB
                ├─ FlushStateToDisk(IF_NEEDED)
                ├─ mempool.removeForBlock()
                ├─ m_chain.SetTip()         ◄── tip pointer advances HERE
                └─ UpdateTip()              ← log "new best=", versionbits check

        [signals fired under cs_main]
        ├─ BlockConnected()       → wallet rescans, ZMQ, indexes
        ├─ UpdatedBlockTip()      → UI, RPC
        └─ blockTip() kernel notification

        [after cs_main released]
        └─ ActiveTipChange()
    }
```

The key architectural invariant is that **the UTXO set and the tip pointer always move together atomically under `cs_main`**. The separation of `AcceptBlock` (disk write + index) from `ActivateBestChain` (UTXO application + tip advance) means a block can be on disk but not on the active chain — exactly the state needed for reorg handling and IBD pre-fetching.
