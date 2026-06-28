# Bitcoin prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/bitcoin` (SHA 6d8e15dff015d3df8e87de63e650a5aee32ff12f, C++).
All `file:line` cites verified against that tree. Levels calibrated against the approved redis
anchor at `experiment/prompts/redis` (read its `L*.txt` + `L*.reference.md`).

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm reasoning about Bitcoin's UTXO model and how a single unspent output is
represented in memory while it sits in the coins cache. I need to understand the structure that
holds one UTXO: what it carries of the output itself, how it records the height and coinbase
origin of the transaction that created it, how it tells whether the coin still exists versus has
been spent, and how that height and coinbase flag are packed together when the coin is
persisted. Walk me through the makeup of that structure."

**Larger task it slices from:** changing UTXO-set serialization/encoding, or reasoning about
per-UTXO memory overhead / maturity — needs a clear mental model of the `Coin` record first.

**Why this level:** The answer lives at one definition site — `class Coin` in `coins.h:34-88` —
and is one concrete fact (the shape of one entity). To answer well the agent must integrate
several adjacent members (`out` the payload, the `fCoinBase:1`/`nHeight:31` provenance bitfields,
`IsCoinBase()`/`IsSpent()`) and the on-disk packing `(nHeight<<1)|fCoinBase` into one VARINT, but
it never leaves that one class — 0 call hops. It is not primitive-isomorphic: it asks for the
*role* of each field and how spentness (`out.IsNull()`) is distinguished from provenance
(`fCoinBase`/`nHeight`), which requires reading and synthesizing the declaration, not a single
"jump to definition." Exceeds nothing below (floor).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `class Coin`, `coins.h:34`; spine:
`out` `:38`, `fCoinBase:1` `:41`/`IsCoinBase()` `:59`, `nHeight:31` `:44`, `IsSpent()` via
`out.IsNull()` `:83-84`, VARINT packing `(nHeight<<1)|fCoinBase` `:66-67`).

**Neutrality check:** text — grep `class Coin` / `A UTXO entry` lands on the struct;
structural — the class declaration is one node; semantic — go-to-def on `Coin`. All three reach
the same single site; differences are only in cost, not feasibility. Not isomorphic because the
*understanding* (spentness-vs-provenance, the bitfield packing) must be read off the fields, not
produced by the locate primitive itself.

---

## L2 — neighborhood (symbol + its direct callers, 1 hop)

**Prompt:** "To predict whether a transaction fails the stateless sanity checks before any chain
context is consulted — and to know where that check is actually invoked during normal operation —
I need to understand the routine that performs the context-free validity check on a transaction,
together with the validation paths that call into it. Help me see where that check is applied
during block checking and during mempool acceptance, and what each caller does when the check
reports the transaction invalid."

**Larger task it slices from:** changing the context-free check surface (e.g. adding a new
stateless tx rule) or gating which validation paths run it — must first know the central routine
and the paths that depend on it.

**Why this level:** One focal symbol — `CheckTransaction` (`consensus/tx_check.cpp:11`) — plus
its direct production callers, exactly one hop out: `MemPoolAccept::PreChecks`
(`validation.cpp:786`, calling at `:802`) and `CheckBlock` (`validation.cpp:3925`, calling at
`:3968`). Synthesis required: the callers consume the same bool+`TxValidationState` contract but
map a failure to *different units of rejection* (one dropped loose tx vs a rejected whole
block), so "what each caller does" cannot be read from the definition alone. Exceeds L1 because
it is no longer one site/one fact — it fans out to callers across two subsystems (mempool vs
block validation) and relates them to one definition. It stops short of L3 because there is no
ordered chain to walk — it is a star (one symbol, its neighbors), not a path.

**Ground-truth answer sketch:** see `L2.reference.md` (focal `CheckTransaction`
`consensus/tx_check.cpp:11`, `TX_CONSENSUS`/`TxValidationState` contract; callers
`MemPoolAccept::PreChecks` `validation.cpp:802` → loose-tx reject, `CheckBlock`
`validation.cpp:3968` → `BLOCK_CONSENSUS` block reject).

**Neutrality check:** text — grep `CheckTransaction` yields the def plus the two production call
sites directly (and several test sites to filter); structural — the function node plus its
reference set; semantic — find-refs on the symbol. Each reaches the same neighborhood; cost
differs (grep returns raw hits to be read; structural/semantic give the reference set),
feasibility does not. Not isomorphic: a single find-refs lists call sites but does not tell you
*what each caller does with the result* (loose-tx vs block rejection) — that needs reading and
integrating each site. (Neighborhood is tighter than redis L2's four callers — two production
callers across two subsystems — but the 1-hop traversal scope and result-mapping synthesis match
the bar; flagged for the reviewer.)

---

## L3 — path (directed chain across files, multi-hop, one path)

**Prompt:** "I want to trace what happens to a single message arriving from a peer from the
moment its bytes are read off the socket until the per-message-type handler actually runs. I'm
interested in how the raw bytes are read and fed into the transport, how a complete message is
parsed out, how the message is pulled and handed to the processing layer, how its type is matched
to a handler, and how control finally reaches that handler's logic. Walk me through that
sequence in order, end to end."

**Larger task it slices from:** adding cross-cutting per-message instrumentation, changing
message framing/transport, or altering dispatch — needs the precise read→parse→pull→dispatch→
handler spine.

**Why this level:** A single directed chain threaded through `net.cpp` and `net_processing.cpp`,
multiple hops, followed in order: socket-thread read (`ThreadSocketHandler`→`SocketHandler`→
`SocketHandlerConnected`→`Recv`+`ReceiveMsgBytes`) → transport absorb (`ReceivedBytes`) →
message parse (`GetReceivedMessage`→`CNetMessage`) → cross-thread handoff (`ThreadMessageHandler`
→`ProcessMessages`→`PollMessage`) → per-message dispatch (`ProcessMessage`) → type match
(`NetMsgType::TX`/`VERSION`) → handler body. Entry ambiguity is real: the read handler is buried
in a per-node loop inside `SocketHandlerConnected` (`net.cpp:2147`), and dispatch happens on a
*separate* thread from the read, so the agent must identify the cross-thread handoff rather than
assume one function calls the next. Exceeds L2 because it is an ordered multi-file traversal (a
path), not a one-hop star; stays below L4 because it is one linear path, not a cluster of
interrelating paths forming a subsystem.

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `ThreadSocketHandler`
`net.cpp:2264`→`SocketHandler` `:2118`→`SocketHandlerConnected` `:2147`/`Recv` `:2206`/
`ReceiveMsgBytes` `:2210`(def `:668`)→`ReceivedBytes` `:677`→`GetReceivedMessage` `:685`→
`ThreadMessageHandler` `:3193`→`ProcessMessages` `net_processing.cpp:5141`/`PollMessage` `:5179`→
`ProcessMessage` `:5201`(def `:3603`)→`NetMsgType::TX` branch `:4460`/`vRecv >> TX_WITH_WITNESS`
`:4473`).

**Neutrality check:** text — grep the function names and follow the calls between them across the
two files; structural — call-graph edges from the socket handler down to the per-type branch;
semantic — go-to-def chained call by call. All three can walk the chain; grep must read each body
to find the next callee and the cross-thread handoff (higher cost), structural/semantic surface
callees directly. Feasible for all. Not isomorphic: no single primitive yields a *7-hop ordered
path with a cross-thread handoff*; the agent must decide the order, the right branch, and the
thread boundary at each step.

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm studying how Bitcoin Core takes a newly received block and integrates it into
the active chain. I need to understand how the block is first subjected to context-free and then
contextual checks, how it is recorded to disk and the block index, how the activation step
decides which tip to advance to and applies the block's transactions to the UTXO set, and how
the tip change is finalized and signaled once connection succeeds. Show me how these cooperating
stages fit together."

**Larger task it slices from:** changing block acceptance behavior (e.g. new contextual rule,
snapshot/assumeutxo wiring, altering post-connection signaling) — needs the whole
accept-and-activate subsystem and how its stages coordinate.

**Why this level:** A cohesive feature cluster within `validation.cpp`, with several
interrelating stages rather than one line: (a) context-free check + accept entry
(`ProcessNewBlock`→`CheckBlock`+`AcceptBlock`), (b) contextual check + disk/index
(`AcceptBlock`→`CheckBlock`+`ContextualCheckBlock`+`WriteBlock`), (c) activate-and-connect-UTXO
(`ActivateBestChain`→`ActivateBestChainStep`→`ConnectTip`→`ConnectBlock`), (d) finalize-tip-and-
signal (`UpdateTip`→`ActiveTipChange`). The agent must understand how these cooperate — the
context-free vs contextual distinction, the disk/index recording that makes a block a candidate
tip, the activation loop that connects it to the UTXO set, and the finalize/signal that publishes
the new tip — not just trace one call. Exceeds L3 because it is a bounded module with multiple
cooperating stages (not a single ordered chain); stays below L5 because it is one feature/area
(block acceptance), not a concern threaded across multiple subsystems.

**Ground-truth answer sketch:** see `L4.reference.md` (four stages: `ProcessNewBlock`
`validation.cpp:4405`→`CheckBlock` `:4426`+`AcceptBlock` `:4429`; `AcceptBlock` `:4305`→
`CheckBlock`+`ContextualCheckBlock` `:4357-4358`+`WriteBlock` `:4376-4380`;
`ActivateBestChain` `:3330`→`ActivateBestChainStep` `:3198`/`:3393`→`ConnectTip` `:3019`/`:3243`→
`ConnectBlock` `:2301`/`:3051`; `UpdateTip` `:2896`/`:3094`→`ActiveTipChange` `:3449`/`:3700`).

**Neutrality check:** text — grep `ProcessNewBlock`/`AcceptBlock`/`ActivateBestChain`/
`ConnectBlock`/`UpdateTip` and stitch the subsystem; structural — the call cluster around
`ProcessNewBlock` plus the activation-loop edges; semantic — refs/defs across the file. All
feasible; none is uniquely advantaged because the "context-free vs contextual" and "record vs
activate vs finalize" decomposition is a *reading* task, not something any single primitive
returns. Not isomorphic: spans multiple functions/stages and a state handoff (block index →
activation → tip); no single primitive returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to how a transaction submitted to the node reaches its peers,
so I need to understand the full journey of a locally submitted transaction from the RPC that
receives it to the bytes announcing it going out to peers. Starting from the RPC accepting the
raw transaction, then how it is submitted to mempool acceptance and the checks that must pass for
it to enter the mempool, then how acceptance triggers a per-peer announcement that is queued
rather than sent immediately, and finally how that queued announcement is flushed as inventory
messages to peers — walk me through that whole flow and how the stages connect."

**Larger task it slices from:** modifying tx-relay semantics (e.g. how/when locally submitted txs
are announced, new relay filtering, privacy changes to the announcement queue) — requires the
end-to-end submit→accept→queue→flush spine across subsystems.

**Why this level:** A concern that threads three subsystems — the RPC/broadcast entry
(`rpc/mempool.cpp`, `node/transaction.cpp`), mempool acceptance (`validation.cpp`:
`ProcessTransaction`/`AcceptToMemoryPool`/`MemPoolAccept`), and P2P relay (`net_processing.cpp`:
`PeerManagerImpl`). It is whole-system: the agent integrates "accept the raw tx" (RPC), "pass
consensus+policy checks to enter the mempool" (`CheckTransaction`/`IsStandardTx`/
`CheckInputScripts`), and "queue per-peer then flush as INV" (`InitiateTxBroadcastToAll` →
`m_tx_inventory_to_send` → `SendMessages`). Entry ambiguity is high: the RPC does not send to
peers directly; acceptance triggers a *queued* per-peer announcement that is only flushed later
by the message-handler thread, so the agent must discover the queue-then-flush indirection
rather than find a direct "RPC → peers" call. Exceeds L4 because it crosses subsystem boundaries
(RPC ↔ validation/mempool ↔ P2P relay) instead of staying inside one feature module.

**Ground-truth answer sketch:** see `L5.reference.md` (RPC `sendrawtransaction` `rpc/mempool.cpp:47`
→`BroadcastTransaction` `:127`(def `node/transaction.cpp:32`)→`ProcessTransaction`
`validation.cpp:4455`→`AcceptToMemoryPool` `:1781`→`MemPoolAccept::AcceptSingleTransactionInternal`
`:1323` with `CheckTransaction` `:802`/`IsStandardTx` `:812`/`CheckInputScripts` `:1150`;
`InitiateTxBroadcastToAll` `node/transaction.cpp:137`(def `net_processing.cpp:2272`)→
`m_tx_inventory_to_send` `:2291`/`:306`; flush `SendMessages` `net_processing.cpp:5792`→
`m_tx_inventory_to_send` drain `:6113-6114`→`CInv{MSG_WTX/MSG_TX,...}` `:6145-6146`→
`MakeAndPushMessage(node, NetMsgType::INV, vInv)` `:6160`/`:6172`).

**Neutrality check:** text — grep `BroadcastTransaction`/`ProcessTransaction`/`AcceptToMemoryPool`/
`InitiateTxBroadcastToAll`/`m_tx_inventory_to_send`/`SendMessages` and assemble across files;
structural — call edges from `BroadcastTransaction` through `ProcessTransaction` into the relay
functions; semantic — refs/defs chaining the same across `node/transaction.cpp`,
`validation.cpp`, `net_processing.cpp`. All feasible. The deferred per-peer queue-then-flush
indirection (`InitiateTxBroadcastToAll` only queues; `SendMessages` emits) defeats a naive
single-call trace for every regime equally — each must reason about the queue→flush pattern — so
none is uniquely required. Not isomorphic: the flow spans ~7 functions across three subsystems
and a per-peer data-structure handoff (`m_tx_inventory_to_send`), well beyond any one primitive.

---

## Calibration notes for the reviewer

- **L2 neighborhood width:** bitcoin's context-free `CheckTransaction` has two *production*
  callers (mempool `PreChecks`, block `CheckBlock`), tighter than redis L2's four callers of
  `expireIfNeeded`. The 1-hop traversal scope and the result-mapping synthesis (same
  bool+state, different unit of rejection) match the L2 bar; flagged here so the reviewer can
  confirm the calibration is acceptable rather than silently thinner.
- **L3 cross-thread handoff:** unlike redis L3 (single main-thread spine), bitcoin's inbound
  path splits across the socket thread (read/parse-prefill) and the message-handler thread
  (dispatch). The spine accounts for this via `PollMessage`/`ProcessMessages`; judges should
  accept answers that name the two-thread split but should not require the V1/V2 transport
  distinction.
- **L4 vs L3 distinctness:** L3 is the inbound *message* path (one linear chain); L4 is the
  block *acceptance & activation* subsystem (four cooperating stages: check / record /
  connect-UTXO / finalize-tip). No scope collision — different artifacts (a message vs a block)
  and different traversal shape (chain vs cluster).
- **L5 vs L3 distinctness:** L5 is the *outbound* locally-submitted tx journey
  (RPC→mempool→relay-queue→INV flush); L3 is the *inbound* peer message path. Different
  directions and different subsystem sets; the deferred queue-then-flush indirection in L5
  mirrors redis L5's `also_propagate`→`postExec` flush, giving cross-repo calibration on the
  "deferred propagation" pattern.
- Every `file:line` above was opened and confirmed against the pinned SHA.