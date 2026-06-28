# Rails prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/rails` (SHA abbcb8d7dcf908bc2e6bc70b03651cae671a6e75, Ruby).
All file:line cites verified against that tree. Rails is a multi-gem workspace (activemodel,
activerecord, activesupport, actionpack, …); the levels below deliberately range across the
data-modeling spine (ActiveModel → ActiveRecord) because it is the most structurally legible part
of Rails and lets the traversal ladder escalate cleanly in one cohesive area.

Calibrated against the approved anchor set at `experiment/prompts/redis`. Traversal depth per
level is held comparable to the redis bar (L1 one-site/one-fact; L2 one symbol + a star of
internal callers; L3 an ordered multi-file chain; L4 a bounded cooperating cluster; L5 a concern
threading multiple subsystems).

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm trying to reason about how Rails holds a single attribute's value in memory before
it ever touches the database — the object that represents one named attribute on a model, separate
from the record itself. I need to understand what that container stores: how it keeps the raw value
exactly as it arrived (before any type conversion) distinct from the value that gets returned after
casting, how it references the type object responsible for that conversion, and how it remembers
where the value came from so that change detection can work. Walk me through the makeup of that
container."

**Larger task it slices from:** adding a new attribute provenance/encoding, optimizing per-attribute
allocation, or reasoning about type-casting behavior — needs a clear mental model of the per-attribute
value object first.

**Why this level:** The answer lives at a single definition site — `ActiveModel::Attribute` in
`activemodel/lib/active_model/attribute.rb:6` — and is one concrete fact (the shape of one entity).
To answer well the agent must integrate the meaning of several adjacent fields
(`name`/`value_before_type_cast`/`type`/`original_attribute` and the lazy `@value`) and the
factory/variant split (`from_database`/`from_user`/`with_cast_value`/`null`/`uninitialized`, whose
subclasses differ in `type_cast`: deserialize vs cast vs identity vs nil), but it never leaves that
one class — 0 call hops. It is not primitive-isomorphic: it asks for the *role* of the fields
(raw-in vs cast-out vs serialized-out, what `type` does, why `original_attribute` exists), which
requires reading and synthesizing the declaration, not a single "jump to definition." Exceeds
nothing below (floor). Directly analogous to redis L1's `struct redisObject` (one container, its
fields, the type-vs-encoding distinction).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `ActiveModel::Attribute` `attribute.rb:6`;
name/value_before_type_cast/type `:29`; lazy cast `value` `:41`/`:43`; `original_attribute` `:160`;
variants FromDatabase `:181`/FromUser `:205`/WithCastValue `:220`/Null `:230`/Uninitialized `:250`).

**Neutrality check:** text — grep `class Attribute` / `attr_reader :name` lands on the class;
structural — the class declaration is one node; semantic — go-to-def on an `ActiveModel::Attribute`
use. All three reach the same single site; differences are only in cost. Not isomorphic because the
*understanding* (raw vs cast vs serialized, why `original_attribute`) must be read off the fields,
not produced by the locate primitive itself.

---

## L2 — neighborhood (a symbol + its direct relations, 1 hop)

**Prompt:** "To predict when a relation that hasn't run yet actually fires its database query during
ordinary use — as opposed to an explicit call to force it — I need to understand the routine that
performs the on-access 'have these records been loaded yet, and if not fetch them now' materialization,
together with the places that consult that loaded state during normal use. Help me see which access
paths force the records to materialize versus which ones deliberately avoid loading, and how each one
branches on whether the data is already in memory."

**Larger task it slices from:** changing lazy-loading semantics (e.g. making `size`/`empty?` use a
cached count, or adding an accessor that must not force materialization) — must first know the
materialization routine and every access point that branches on the loaded state.

**Why this level:** One focal symbol — `Relation#load` (`relation.rb:1205`) — plus the `loaded?`
state flag (`:75`) and the small, real cluster of accessors that consult it: materializers
(`records` `:353`, `to_ary` `:348`) that force `load`, and short-circuiters (`size` `:364`,
`empty?` `:373`, `inspect` `:1316`/`pretty_print` `:1291`) that branch on `loaded?` to answer
without loading. Exactly one hop out (focal → accessors), and synthesis is required: the accessors
do *different* things with the loaded/not-loaded state (force a query vs. issue a cheaper
COUNT/EXISTS vs. print a placeholder), which cannot be read from `load`'s definition alone. Exceeds
L1 because it is no longer one site/one fact — it requires fanning out to several access points and
relating them to one routine. It stops short of L3 because there is no ordered chain to walk — it
is a star (one routine + its loaded?-consulting neighbors), not a path. Directly analogous to redis
L2's `expireIfNeeded` + on-access callers branching on the expiry outcome (both are on-access
lazy triggers with a star of callers that branch on state).

**Ground-truth answer sketch:** see `L2.reference.md` (focal `load` `relation.rb:1205`; `loaded?`
`:75`; materializers `records` `:353`/`to_ary` `:348`; short-circuiters `size` `:364`/`empty?`
`:373`/`inspect` `:1316`/`pretty_print` `:1291`; `reload`/`reset` `:1215`/`:1220`).

**Neutrality check:** text — grep `def load` / `loaded?` yields the focal + every accessor that
mentions `loaded?` directly; structural — the method node plus its reference set; semantic —
find-refs on `load`/`loaded?`. Each reaches the same neighborhood; cost differs (grep returns raw
hits to be read; structural/semantic give the reference set), feasibility does not. Not isomorphic:
a single find-refs lists accessors but does not tell you *which force loading vs which avoid it* —
that needs reading and integrating each accessor's branch.

---

## L3 — path (a directed chain across files, multi-hop, one path)

**Prompt:** "I want to trace what happens to a query from the moment a relation is forced to load
until the matching rows exist as model objects in memory. I'm interested in how the accumulated
where-clause gets turned into SQL, how that SQL is handed to the connection and executed, how the raw
result rows come back, and how those rows are then turned into initialized ActiveRecord instances.
Walk me through that sequence in order, end to end."

**Larger task it slices from:** adding per-query instrumentation, changing SQL generation, or altering
result materialization (e.g. STI/inheritance handling) — needs the precise build → execute →
instantiate spine.

**Why this level:** A single directed chain threaded through `query_methods.rb`, `relation.rb`,
`querying.rb`, `connection_adapters/abstract/database_statements.rb`, and `persistence.rb`, multiple
hops, followed in order: where-clause build (PredicateBuilder) → `load`/`exec_queries` trigger →
`exec_main_query`/`_query_by_sql` → `select_all`/`QueryIntent.execute!` → rows →
`instantiate_records`/`_load_from_sql` → `instantiate`/`instantiate_instance_of`. Each step names the
next; the agent must follow them as a sequence, not just collect neighbors. Entry ambiguity is real:
the relation is lazy (the `where` step only builds; the chain only runs when `load` is forced), and
`exec_main_query` has an eager-load branch vs the simple path, so the agent must pick the live simple
path. Exceeds L2 because it is an ordered multi-file traversal (a path), not a one-hop star; stays
below L4 because it is one linear path, not a cluster of interrelating paths forming a subsystem.
Directly analogous to redis L3's socket-bytes → handler chain (a build/parse → resolve → execute →
deliver chain of comparable hop count).

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `where` `query_methods.rb:1097`
→ `where!`/`PredicateBuilder#build` `:1107`/`predicate_builder.rb:57` → `load` `relation.rb:1205` →
`exec_queries` `:1429` → `exec_main_query` `:1442` → `_query_by_sql` `querying.rb:79` → `select_all`/
`QueryIntent.execute!` `database_statements.rb:71`/`:82` → `instantiate_records` `relation.rb:1485`
→ `_load_from_sql` `querying.rb:83` → `instantiate` `persistence.rb:100` → `instantiate_instance_of`
`:102`).

**Neutrality check:** text — grep the method names and follow the calls between them across files;
structural — call-graph edges from `load`/`exec_queries` down to `instantiate`; semantic —
go-to-def chained call by call. All three can walk the chain; grep must read each body to find the
next callee (higher cost), structural/semantic surface callees directly. Feasible for all. Not
isomorphic: no single primitive yields a 6-hop ordered path with a branch choice; the agent must
decide the order and the right branch (simple vs eager) at each step.

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm studying how Rails manages the pool of database connections that many threads share,
without any one thread holding a connection permanently. I need to understand how a connection is
checked out when a thread needs one and what happens when the pool is exhausted, how a checked-out
connection is returned for reuse, how a background process reclaims connections whose owning thread
has died, and how idle connections get evicted over time. Show me how these cooperating pieces fit
together."

**Larger task it slices from:** changing pool behavior (e.g. a new eviction policy, fork handling, or
reaper tuning) — needs the whole connection-pool subsystem and how its parts coordinate across the
pool/queue/reaper/lease boundary.

**Why this level:** A cohesive feature cluster spanning `connection_pool.rb`, `connection_pool/queue.rb`,
and `connection_pool/reaper.rb`, with several interrelating paths rather than one line:
(a) checkout/acquire (with exhausted-pool waiting), (b) checkin/return, (c) background reaper reclaim
of dead-thread connections, (d) idle flush/eviction. The agent must understand how these cooperate
around a synchronization boundary (the `Queue`'s condition variable) and a thread-ownership boundary
(the lease / `conn.owner`), not just trace one call. Entry ambiguity: "what happens when the pool is
exhausted" spans both the `Queue` wait *and* the reaper-retry inside `acquire_connection`, two
distinct mechanisms the agent has to discover and join; "returned for reuse" is both `checkin` and
the `with_connection` ensure. Exceeds L3 because it is a bounded module with multiple cooperating
paths (not a single ordered chain); stays below L5 because it is one feature/area (connection
pooling), not a concern threaded across multiple subsystems. Directly analogous to redis L4's
bgsave cluster (four cooperating pieces around a process/pipe boundary).

**Ground-truth answer sketch:** see `L4.reference.md` (four pieces: `ConnectionPool`
`connection_pool.rb:129`; `Queue` `connection_pool/queue.rb:12` with `add` `:36`/`poll` `:86`;
checkout `:638`/`acquire_connection` `:1166`; checkin `:666`/`with_connection` `:451`; `Reaper`
`connection_pool/reaper.rb:33`/`register_pool` `:44` → `reap` `:712`; `flush` `:735`/`remove` `:680`).

**Neutrality check:** text — grep `checkout`/`acquire_connection`/`checkin`/`reap`/`flush`/`Queue`/
`Reaper` and stitch the module across three files; structural — the call cluster around
`ConnectionPool` plus `Queue`/`Reaper` references; semantic — refs/defs across the three files. All
feasible; the thread-ownership + condition-variable boundaries mean *no* tool auto-links a waiting
thread to the `add` that wakes it — every regime must reason about the queue + lease, so none is
uniquely advantaged. Not isomorphic: spans multiple classes/files and two coordination mechanisms
(condition-variable wait, dead-owner reclaim); no single primitive returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to what happens around persisting a record, so I need to understand
the full journey of a save through the system. Starting from the point where saving first checks
whether the record is valid, then how it runs the save callbacks around the actual write, how it
decides which attributes to write and issues the INSERT or UPDATE, how saving cascades to associated
records, and finally how the outcome ties into the surrounding transaction if one is open — walk me
through that whole flow and how the stages connect across the modules involved."

**Larger task it slices from:** modifying persistence semantics (e.g. a new save-time hook, changing
how/when associations cascade, or consistency/transaction behavior) — requires the end-to-end
save → validate → callback → write → cascade → transaction spine across subsystems.

**Why this level:** A concern that threads five subsystems — Validations (`validations.rb` +
ActiveModel), Callbacks (`active_support/callbacks.rb` + AR `callbacks.rb`), attribute/change
selection (`attribute_methods.rb`), Persistence/SQL (`persistence.rb` + adapters), Associations
(`autosave_association.rb`), and Transactions (`transactions.rb`). It is whole-system: the agent
integrates "is it valid?" (gate), "wrap the write in callbacks" (the write is the *block* inside the
callback chain, not a sibling), "which columns?" (attribute selection), "emit SQL" (insert/update),
"cascade to associations" (autosave implemented *as* save callbacks), and "tie to the transaction"
(commit/rollback dispatch back to the record). Entry ambiguity is high: the validation override of
`save` and the callback override of `create_or_update`/`_create_record`/`_update_record` are
`super`-chain module overrides the agent must discover rather than a single function; autosave is not
a separate phase but callbacks woven into the same chain; the transaction link is deferred to
commit/rollback dispatch, not a direct call from `save`. Exceeds L4 because it crosses subsystem
boundaries (Validations ↔ Callbacks ↔ Dirty ↔ Persistence ↔ Associations ↔ Transactions) instead of
staying inside one feature module. Directly analogous to redis L5's write → propagation → replication
flow (a write's effect threading execution, propagation, and transport subsystems via deferred
indirection).

**Ground-truth answer sketch:** see `L5.reference.md` (Validations `save` `validations.rb:47`/
`perform_validations` `:90`/`valid?` `:69` → AM `valid?` `activemodel/…/validations.rb:377`; callback
gate `create_or_update` `callbacks.rb:439`/`_create_record` `:443`/`_update_record` `:447` via
`define_model_callbacks` `:415` → `run_callbacks` `activesupport/…/callbacks.rb:97`/`:110`; attribute
selection `attributes_for_update`/`attributes_for_create` `attribute_methods.rb:508`/`:519`; SQL
`_insert_record` `persistence.rb:238`/`connection.insert` `:257` and `_update_row` `:957`; autosave
`autosave_association.rb:193`/`:213`/`:419`/`:473`/`:536`; transactions `committed!`/`rolledback!`
`transactions.rb:402`/`:414` → `_run_commit_callbacks`/`_run_rollback_callbacks` `:406`/`:416` via
`define_callbacks :commit, :rollback` `:10`).

**Neutrality check:** text — grep `perform_validations`, `_run_save_callbacks`, `create_or_update`,
`_insert_record`, `autosave_association`, `committed!`/`rolledback!` and assemble across six files;
structural — call/super edges from `save` through the callback chain into persistence and the
transaction dispatch; semantic — refs/defs chaining the same. All feasible. The module-override
(`super`) and callback-chain indirection defeats a naive single-call trace for every regime equally
— each must reason about "the write is the block inside `run_callbacks`" and "autosave is callbacks,
not a phase" — so none is uniquely required. Not isomorphic: the flow spans ~10 functions across six
files and a callback-chain/deferred-dispatch handoff, well beyond any one primitive.

---

## Calibration notes for the reviewer

- **Cohesion:** L1–L3 live in ActiveModel/ActiveRecord's attribute-and-query core; L4–L5 stay in
  ActiveRecord's persistence/connection machinery. The ladder escalates within one cohesive area
  (the data-modeling spine) rather than bouncing across unrelated gems, which keeps traversal scope
  comparable to redis (whose L1–L5 stayed within the server core).
- **L1↔L2 distinction:** L1 is one container's fields (0 hops, one class); L2 is one routine + the
  accessors branching on its state (1 hop). The L2 focal `load` is distinct from the L1 entity
  `Attribute`, so there is no scope collision; an arm could even note that L3's `instantiate`
  ultimately builds `Attribute` objects (the L1 container) — a free cross-level resonance, never
  required.
- **L2↔L4 overlap guard:** L2 is scoped to the *on-access lazy materialization* of one relation
  (`load` + `loaded?`-branching accessors). The connection pool (L4) is a separate subsystem; the
  only shared word is "lazy/deferred," but the entities and files are disjoint (`relation.rb` vs
  `connection_pool.rb`).
- **L3 branch caveat:** the simple (non-eager) path is the required spine; the `eager_loading?`
  branch in `exec_main_query` (`relation.rb:1456-1470`) is an acceptable extra, mirroring how redis
  L3's iothread pre-parse layer was treated (correct main spine, optional modern path).
- **L5 breadth:** L5 touches the query-cache invalidation around writes as a sibling effect; the
  prompt steers toward validate → callback → write → cascade → transaction, and the query-cache is
  left as an acceptable extra, never required (parallel to redis L5 leaving AOF as an acceptable
  extra alongside the replica path).
- Every file:line above was opened and confirmed against the pinned SHA.