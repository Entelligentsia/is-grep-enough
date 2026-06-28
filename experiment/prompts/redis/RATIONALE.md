# Redis prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/redis` (SHA d2d3390d0c4d01ab7bfb46054ad0d5003d63c11b, C).
All file:line cites verified against that tree. This is a recent Redis (8.x-era:
kvobj/ebuckets/kvstore/iothread present), so entities differ from classic 6.x.

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm trying to reason about Redis's per-value memory footprint and how a
stored value is tagged and tracked while it lives in the keyspace. I need to
understand the fundamental in-memory container that holds a single value: what
field distinguishes its logical data type from the concrete way it is currently
represented, and what else that container carries for lifetime management and for
the eviction/LRU machinery. Walk me through the makeup of that container."

**Larger task it slices from:** estimating/optimizing memory overhead per key, or
adding a new field/encoding to the value object — needs a clear mental model of the
object header first.

**Why this level:** The answer lives at a single definition site — `struct
redisObject` in `object.h:100-112` — and is one concrete fact (the shape of one
entity). To answer well the agent must integrate the meaning of several adjacent
bitfields (`type:4` vs `encoding:4`, `refcount`, `iskvobj`, `metabits`, `lru`) and
the constants framing them (`LRU_BITS` 90, `OBJ_REFCOUNT_BITS`/`OBJ_SHARED_REFCOUNT`
95-96), but it never leaves that one struct/header neighborhood — 0 call hops. It is
not primitive-isomorphic: it asks for the role of fields and how `type` differs from
`encoding`, which requires reading and synthesizing the declaration, not a single
"jump to definition." Exceeds nothing below (floor).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `struct redisObject`,
`object.h:100-112`; type/encoding/refcount/lru/ptr spine).

**Neutrality check:** text — grep `redisObject`/`} robj;` lands on the struct;
structural — the struct declaration is one node; semantic — go-to-def on `robj`.
All three reach the same single site; differences are only in cost, not feasibility.
Not isomorphic because the *understanding* (type vs encoding, what each field is for)
must be read off the fields, not produced by the locate primitive itself.

---

## L2 — neighborhood (symbol + its direct callers, 1 hop)

**Prompt:** "To predict when a key that is already past its TTL actually gets removed
during ordinary request handling — as opposed to by the background expiry sweep — I
need to understand the routine that performs the on-access 'is this key expired, and
should it be deleted now' check, together with the command-handling places that call
into it. Help me see where that check fires during normal keyspace access and what the
various callers do with its outcome."

**Larger task it slices from:** changing lazy-expiration semantics (e.g. a new flag
that suppresses on-access deletion in some context) — must first know the central
routine and all the access points that depend on it.

**Why this level:** One focal symbol — `expireIfNeeded` (`db.c:2935`) — plus its
direct callers, exactly one hop out. The callers are a small, real cluster the agent
must gather and read: `lookupKey` (db.c:302), `dbRandomKey` (db.c:834),
`delGenericCommand` (db.c:1419), `scanCallback` (db.c:1702). Synthesis required: the
callers branch on the return enum (`KEY_VALID`/`KEY_EXPIRED`/`KEY_DELETED`/`KEY_TRIMMED`)
differently, so "what they do with the outcome" can't be read from the definition
alone. Exceeds L1 because it is no longer one site/one fact — it requires fanning out
to several call sites and relating them to one definition. It stops short of L3
because there is no ordered chain to walk — it's a star (one symbol, its neighbors),
not a path.

**Ground-truth answer sketch:** see `L2.reference.md` (focal `expireIfNeeded` `db.c:2935`;
keyIsExpired `db.c:2877`; replica guard `db.c:2974-2977`; callers lookupKey `db.c:302`,
dbRandomKey `db.c:834`, delGenericCommand `db.c:1419`, scanCallback `db.c:1702`).

**Neutrality check:** text — grep `expireIfNeeded` yields def + the 4 call sites
directly; structural — the function node plus its reference set; semantic — find-refs
on the symbol. Each reaches the same neighborhood; cost differs (grep returns raw
hits to be read; structural/semantic give the reference set), feasibility does not.
Not isomorphic: a single find-refs lists call sites but does not tell you *what each
caller does with the result* — that needs reading and integrating each site.

---

## L3 — path (directed chain across files, multi-hop, one path)

**Prompt:** "I want to trace what happens to a single client request from the moment
its bytes arrive on the socket until the matching command handler actually runs. I'm
interested in how the raw buffer is read, how it gets parsed into a command and its
arguments, how the command name is resolved to its implementation, and how control is
finally handed off into the execution that invokes the handler. Walk me through that
sequence in order, end to end."

**Larger task it slices from:** adding cross-cutting per-request instrumentation, or
changing protocol parsing/dispatch — needs the precise read→parse→resolve→execute
spine.

**Why this level:** A single directed chain threaded through `networking.c` and
`server.c`, multiple hops, followed in order: socket read handler → input buffer
processing → protocol parse → command lookup → process → call → handler invocation.
Each step names the next; the agent must follow them as a sequence, not just collect
neighbors. Entry ambiguity is real: the read handler is installed indirectly via
`connSetReadHandler(conn, readQueryFromClient)` (networking.c:133), and lookup happens
in more than one place, so the agent must pick the live main-thread path. Exceeds L2
because it is an ordered multi-file traversal (a path), not a one-hop star; stays below
L4 because it is one linear path, not a cluster of interrelating paths forming a
subsystem.

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain readQueryFromClient
`networking.c:3830` → processInputBuffer `:3626` → processMultibulk/InlineBuffer
`:3214`/`:3063` → processCommandAndResetClient `:3491` → processCommand `server.c:4412` →
lookupCommand `:4455`/def `:3609` → call `:3949`/`:4788` → `c->cmd->proc(c)` `:4015`).

**Neutrality check:** text — grep the function names and follow the calls between them;
structural — call-graph edges from `readQueryFromClient` down to `proc`; semantic —
go-to-def chained call by call. All three can walk the chain; grep must read each body
to find the next callee (higher cost), structural/semantic surface callees directly.
Feasible for all. Not isomorphic: no single primitive yields a *4-hop ordered path*;
the agent must decide the order and the right branch at each step.

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm studying how Redis produces a point-in-time snapshot of the dataset to
disk without blocking the server from serving clients. I need to understand how the
background save is launched, how the work is divided between the main server process and
the separate process that does the writing, how progress and final completion are
communicated back to the server, and how the server finalizes things once the saving
process is done. Show me how these cooperating pieces fit together."

**Larger task it slices from:** changing snapshot behavior (e.g. fork-less save, new
progress reporting, or altering post-save bookkeeping) — needs the whole bgsave
subsystem and how its parts coordinate across the fork boundary.

**Why this level:** A cohesive feature cluster spanning `rdb.c`, `server.c`, and
`childinfo.c`, with several interrelating paths rather than one line: (a) launch+fork,
(b) child write path, (c) child→parent progress/info pipe, (d) parent reap+finalize.
The agent must understand how these cooperate around a process boundary (a pipe and
SIGCHLD/poll), not just trace one call. Entry ambiguity: "communicated back" spans the
childinfo pipe *and* the exit-code reaping, two distinct mechanisms the agent has to
discover and join. Exceeds L3 because it's a bounded module with multiple cooperating
paths (not a single ordered chain); stays below L5 because it is one feature/area
(persistence snapshotting), not a concern threaded across multiple subsystems.

**Ground-truth answer sketch:** see `L4.reference.md` (four pieces: launch/fork
rdbSaveBackground `rdb.c:2070`/redisFork `:2079`; child rdbSave `:2085`/def `:2027`;
childinfo pipe sendChildInfo `rdb.c:1858`→`childinfo.c:49`, receiveChildInfo
`childinfo.c:150`; parent reap checkChildrenDone `server.c:1416`→backgroundSaveDoneHandler
`rdb.c:4605`→`:4544`).

**Neutrality check:** text — grep `rdbSaveBackground`/`redisFork`/`sendChildInfo`/
`checkChildrenDone` and stitch the module; structural — the call cluster around
rdbSaveBackground plus childinfo references; semantic — refs/defs across the three
files. All feasible; the fork boundary means *no* tool auto-links child→parent — every
regime must reason about the pipe + reaping, so none is uniquely advantaged. Not
isomorphic: spans multiple functions/files and two IPC mechanisms; no single primitive
returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to how a write performed on a primary becomes visible
on its replicas, so I need to understand the full journey of a write command's effect
through the system. Starting from running the command's handler and detecting that it
actually modified data, then how that modification is queued as a replicated operation
and flushed once the command finishes, and finally how it is turned into bytes that feed
the replication stream going out to connected replicas — walk me through that whole flow
and how the stages connect."

**Larger task it slices from:** modifying replication semantics (e.g. how/when writes
propagate, new propagation filtering, or consistency changes) — requires the end-to-end
write→propagation→replication-transport spine across subsystems.

**Why this level:** A concern that threads three subsystems — command execution
(server.c `call`), the propagation machinery (server.c alsoPropagate/postExec/
propagatePending/propagateNow), and the replication transport (replication.c
feed/backlog). It is whole-system: the agent integrates "did it write?" (dirty
accounting), "queue + flush" (execution-unit propagation), and "emit to replicas"
(replication feed) — distinct modules that only make sense together. Entry ambiguity is
high: commands rarely call replication directly; propagation is deferred via an op array
and flushed at the end of the execution unit, so the agent must discover the indirection
(`server.dirty` → also_propagate → postExecutionUnitOperations) rather than find a direct
call. Exceeds L4 because it crosses subsystem boundaries (dispatch ↔ propagation ↔
replication) instead of staying inside one feature module.

**Ground-truth answer sketch:** see `L5.reference.md` (call `server.c:3949` with dirty
snapshot `:3978`/`:4032` around proc `:4015`; alsoPropagate `:4153`/def `:3732` into
also_propagate `:3744`; flush afterCommand `:4189`→postExecutionUnitOperations `:3867`→
propagatePendingCommands `:3811`→propagateNow `:3704`→replicationFeedSlaves `:3716`/def
`replication.c:631`→feedReplicationBuffer `:773`/def `:618`; AOF sink `server.c:3713`).

**Neutrality check:** text — grep `server.dirty`, `alsoPropagate`,
`propagatePendingCommands`, `replicationFeedSlaves` and assemble across files;
structural — call edges from `call` through the propagation funcs into replication;
semantic — refs/defs chaining the same. All feasible. The deferred op-array indirection
defeats a naive single-call trace for every regime equally — each must reason about the
queue-then-flush pattern — so none is uniquely required. Not isomorphic: the flow spans
~7 functions across server.c/replication.c/db.c and a data-structure handoff
(also_propagate), well beyond any one primitive.

---

## Calibration notes for the reviewer

- **L2 vs L4 expiry overlap:** L2 is deliberately scoped to the *lazy/on-access* trigger
  (`expireIfNeeded` + callers). The active background sweep (`activeExpireCycle`,
  expire.c:287) is intentionally excluded from L2 and not the L4 subject (L4 is RDB), so
  there is no scope collision; the active cycle is left available for other repos'/levels'
  reuse if needed.
- **L3 iothread caveat:** this Redis has an iothread pre-parse layer
  (`preprocessCommand`/`pendingCommand`, networking.c:~3720). The main-thread spine in the
  answer sketch is correct and load-bearing; judges should accept answers that mention the
  iothread split but should not require it.
- **L5 breadth:** L5 touches AOF as a parallel propagation sink (feedAppendOnlyFile). The
  prompt steers toward the replica path; a complete answer naturally notes AOF as the
  sibling target but the replication transport is the required spine.
- Every file:line above was opened and confirmed against the pinned SHA.
