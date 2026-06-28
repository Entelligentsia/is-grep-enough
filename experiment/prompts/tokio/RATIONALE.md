# Tokio prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/tokio` (SHA 66e29121b333d1ba5bde803f570e421524d4431e, Rust,
Tokio 1.x main). All file:line cites verified against that tree. The five levels are drawn from five
distinct areas (task data model, cooperative scheduling, I/O driver, multi-thread scheduler,
whole-runtime integration) so no level's traversal scope collides with another, mirroring the redis
anchor.

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm trying to reason about the per-task memory footprint of a Tokio task and how a task
is represented once it's been spawned, before I tune its allocation behavior. I need to understand
the in-memory container that holds a single task: what the hot, type-erased header carries for
scheduling bookkeeping and how the runtime reaches the typed future/output and the cold
consumer-facing data from that header, and what single field flips between holding the running
future and the finished output. Walk me through the makeup of that container."

**Larger task it slices from:** tuning per-task allocation/alignment or adding a field/flag to the
task header — needs a clear model of the `Cell` layout and the type-erasure bridge first.

**Why this level:** The answer lives at one definition site — `Cell<T, S>` in
`runtime/task/core.rs:126` plus its component structs (`Header` `:168`, `Core` `:148`, `Trailer`
`:201`, `Stage` `:221`) and the `Vtable` offset bridge in `runtime/task/raw.rs:24-46`. It is one
concrete fact (the shape of one entity). To answer well the agent must integrate the roles of the
header fields (`state`/`queue_next`/`vtable`/`owner_id`), the `Stage` enum (Running/Finished/Consumed),
and the vtable-offset mechanism by which a type-erased `*mut Header` reaches the typed `Core`/`Trailer`
— but it never makes a call hop; it is pure data layout. It is not primitive-isomorphic: it asks for
the role of the regions and how the type-erased header relates to the typed core (the load-bearing
"type vs encoding"-style distinction), which must be read off the struct + vtable, not returned by a
single "jump to definition." Exceeds nothing below (floor).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `Cell<T,S>` `core.rs:126`; header/core/
trailer regions `:128/:131/:134`; `Header` `:168` fields; `Stage` `:221-224`; `Vtable` offsets
`raw.rs:47/50/53`; `RawTask` `raw.rs:20`).

**Neutrality check:** text — grep `struct Cell` / `struct Header` / `pub(super) header:` lands on the
structs and fields; structural — the struct declaration + field members are nodes; semantic —
go-to-def on `Cell`/`Header`/`Vtable`. All three reach the same single site; differences are only cost,
not feasibility. Not isomorphic because the *understanding* (type-erased header vs typed core, the
vtable-offset bridge, the `Stage` flip) must be read off the layout, not produced by the locate
primitive itself.

---

## L2 — neighborhood (symbol + its direct callers, 1 hop)

**Prompt:** "To predict when a running task will actually be forced to yield back to the scheduler
versus being allowed to keep polling, I need to understand the routine that checks the cooperative
scheduling budget and the poll sites that call into it. Help me see where that budget check fires
during normal task progress and what the various callers do with its outcome, both when budget
remains and when it has run out."

**Larger task it slices from:** changing the cooperative-yield policy (e.g. a new budget source, or
a context where yields should be suppressed) — must first know the central routine and all the poll
sites that depend on it.

**Why this level:** One focal symbol — `coop::poll_proceed` (`task/coop/mod.rs:343`) — plus its direct
callers, exactly one hop out. The callers are a real, diverse cluster the agent must gather and read:
I/O readiness (`runtime/io/registration.rs:151`), join (`runtime/task/join.rs:332`), `io::copy`
(`io/util/copy.rs:97`), channel/semaphore/oneshot (`sync/mpsc/chan.rs:295`, `sync/batch_semaphore.rs:598`,
`sync/oneshot.rs:824`), process (`process/mod.rs:1140`), sleep (`time/sleep.rs:402`). Synthesis
required: callers branch on the `Poll` result with the `ready!` macro — `Pending` (forced yield) vs
`Ready` (proceed + `RestoreOnPending::made_progress()`) — which cannot be read from the definition
alone. Exceeds L1 because it is no longer one site/one fact — it fans out to several call sites and
relates them to one branch. It stops short of L3 because there is no ordered chain to walk — it is a
star (one routine, its callers), not a path.

**Ground-truth answer sketch:** see `L2.reference.md` (`poll_proceed` `coop/mod.rs:343`; `Budget`
`:97`, `BudgetDecrement` `:99-101`, `decrement` `:413`; branch `:349-362`; `RestoreOnPending` `:260`,
`made_progress` `:273`; callers registration.rs:151, join.rs:332, copy.rs:97, mpsc:295, semaphore:598,
oneshot:824, process:1140, sleep:402).

**Neutrality check:** text — grep `coop::poll_proceed` yields the def + ~18 call sites directly;
structural — the function node + its reference set; semantic — find-refs on `poll_proceed`. Each
reaches the same neighborhood; cost differs (grep returns raw hits to read; structural/semantic give
the reference set), feasibility does not. Not isomorphic: a find-refs lists call sites but does not
tell you *what each caller does with the `Poll` result* (the `ready!` early-return + `made_progress`)
— that needs reading and integrating each site.

---

## L3 — path (directed chain across files, multi-hop, one path)

**Prompt:** "I want to trace what happens from the moment the reactor's underlying system poll
reports an I/O resource is ready until the task that was waiting on that resource is woken and
scheduled to run again. I'm interested in how the ready events are read from the system poll, how a
ready event is turned into a readiness update and a wake on the right resource, and how that finally
hands off to the task being put back onto a run queue. Walk me through that sequence in order, end to
end."

**Larger task it slices from:** adding I/O-side instrumentation or changing the reactor's
event→wake dispatch — needs the precise mio-poll → event → ScheduledIo → waker → schedule spine.

**Why this level:** A single directed chain threaded through `runtime/io/driver.rs` and
`runtime/io/scheduled_io.rs` (terminating in the scheduler `Schedule::schedule` in
`scheduler/multi_thread/{handle,worker}.rs`), multiple hops, followed in order: park/turn → mio
`poll.poll` → event iterate → token→`ScheduledIo` (`from_exposed_addr`) → `set_readiness` +
`ScheduledIo::wake` → waiter waker → `Schedule::schedule` push to run queue. Each step names the
next; the agent must follow them as a sequence, not just collect neighbors. Entry ambiguity is real:
mio tokens are not opaque ints but `from_exposed_addr` of the resource pointer, so the agent must
discover that decode to link event→resource. Exceeds L2 because it is an ordered multi-file traversal
(a path), not a one-hop star; stays below L4 because it is one linear path, not a cluster of
interrelating paths forming a subsystem.

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `Driver::park`/`turn`
`runtime/io/driver.rs:159/179` → `poll.poll` `:188` → iterate `:201` → `Ready::from_mio` `:209` →
`EXPOSE_IO.from_exposed_addr` `:210` → `set_readiness` `:218`/`scheduled_io.rs:207` →
`ScheduledIo::wake` `:219`/`scheduled_io.rs:236` → `wakers.wake_all` `:285` → `Schedule::schedule`
`handle.rs:110` → `schedule_task` `worker.rs:1327`).

**Neutrality check:** text — grep the function names and follow the calls between them;
structural — call-graph edges from `turn` through `wake` into `schedule`; semantic — go-to-def chained
call by call. All three can walk the chain; grep must read each body to find the next callee and the
token decode (higher cost), structural/semantic surface callees directly. Feasible for all. Not
isomorphic: no single primitive yields a 7-hop *ordered path* across three files; the agent must
decide the order and the token→ScheduledIo branch.

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm studying how the multi-thread runtime keeps all of its worker threads supplied with
work without a central dispatcher. I need to understand how a newly notified task is placed when it's
scheduled (locally on the current worker versus into the shared injection queue), how a worker picks
its next task (from its own queue, the injection queue, or by stealing from peers), how the workers
coordinate which of them are searching for work versus parked, and what happens when a worker's local
queue overflows. Show me how these cooperating pieces fit together."

**Larger task it slices from:** changing scheduler behavior (a new task-placement policy, a new
stealing strategy, altering idle/wake coordination) — needs the whole work-stealing subsystem and
how its parts coordinate across the local-queue / inject / idle boundaries.

**Why this level:** A cohesive feature cluster spanning `scheduler/multi_thread/{handle,worker,queue,
inject,idle,overflow}.rs`, with several interrelating paths rather than one line: (a) schedule
placement (local vs inject), (b) worker run loop + task selection (local/inject/steal), (c)
work-stealing from peers, (d) idle coordination (searching cap + notify parked), (e) overflow →
inject. The agent must understand how these cooperate around a shared injection queue and an idle
state machine, not just trace one call. Entry ambiguity: "kept supplied" spans the steal path AND
the notify-parked path, two distinct mechanisms to join. Exceeds L3 because it is a bounded module
with multiple cooperating paths (not a single ordered chain); stays below L5 because it is one
feature/area (the scheduler), not a concern threaded across multiple subsystems.

**Ground-truth answer sketch:** see `L4.reference.md` (five pieces: schedule placement
`worker.rs:1327`/`:1353`/`:1397`; run loop + selection `:561`/`:1062`/`:1132`/`:1387`; stealing
`:1141`; idle coordination `idle.rs:104`/`:121`/`:51`, `worker.rs:1441`; overflow
`queue.rs:188`/`:253` → inject).

**Neutrality check:** text — grep `schedule_task`/`next_task`/`steal_work`/`transition_worker_to_searching`
/`push_back_or_overflow` and stitch the module; structural — the call cluster around `schedule_task` +
the idle references; semantic — refs/defs across the scheduler files. All feasible; the
work-stealing boundary (stealing from another worker's queue) and the inject-queue sharing mean *no*
tool auto-traces "who supplies this worker" — every regime must reason about the local/inject/idle
cooperation, so none is uniquely advantaged. Not isomorphic: spans multiple functions/files and a
shared queue + state machine; no single primitive returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to how a task that is parked waiting on both a socket read and a
timeout gets resumed, so I need to understand the full journey of such a task from being spawned,
through parking its future on the I/O resource and the timer, the worker thread parking on the
runtime's combined driver stack, whichever resource becomes ready first waking the task, and the
task being rescheduled and polled again until it completes. Walk me through that whole flow and how
the stages connect."

**Larger task it slices from:** modifying the wake/resume path (e.g. a new driver, a change to the
combined park, or how a multi-await task is resumed) — requires the end-to-end spawn→park→wake→
reschedule→complete spine across the scheduler, I/O driver, and time driver.

**Why this level:** A concern that threads four subsystems — the scheduler (`Handle::schedule`/
`Worker::run`/`schedule_task`), the I/O driver (`ScheduledIo::readiness`/`Driver::turn`/`wake`), the
time driver (`TimerEntry::init`/`poll_elapsed`/`Handle::process`/`fire`), and the task cell
(`Stage::Running`→`Finished`). It is whole-system: the agent integrates "park on I/O," "park on
timer," "the combined driver park," "wake from either driver," and "reschedule + re-poll + complete"
— distinct modules that only make sense together. Entry ambiguity is high: the worker does not poll
the OS itself; it parks on a *layered* driver where `time::Driver::park_internal` wraps the I/O
driver and computes `min(io, timer)`, so the agent must discover that the two drivers are one combined
park, not two. Exceeds L4 because it crosses subsystem boundaries (scheduler ↔ I/O driver ↔ time
driver ↔ task cell) instead of staying inside one feature module.

**Ground-truth answer sketch:** see `L5.reference.md` (spawn `handle.rs:55`→`schedule_task`
`worker.rs:1327`; park on I/O `scheduled_io.rs:382`/`:427`/`:495`; park on timer `time/sleep.rs:391`
→ `entry.rs:481`/`:486`/`:535`/`:545`/`:146`; combined park `worker.rs:810`→`:873`→`driver.rs:66`→
`:328`→`runtime/time/mod.rs:213`/`:188`; wake I/O `driver.rs:219`→`scheduled_io.rs:236`/`:285` or
timer `runtime/time/mod.rs:255`/`:311`/`:315`/`:336`; reschedule `handle.rs:110`→`worker.rs:1327`;
complete `core.rs:406`/`handle.rs:106`).

**Neutrality check:** text — grep `Schedule::schedule`, `ScheduledIo::readiness`, `park_internal`,
`TimerEntry::poll_elapsed`, `entry.fire`, `Driver::turn` and assemble across files; structural —
call edges from `run_task` into the drivers and back into `schedule`; semantic — refs/defs chaining
the same. All feasible. The layered-combined-driver indirection (time wraps I/O; one park drives both)
defeats a naive single-poll trace for every regime equally — each must reason about the
min(io,timer) park and the two wake paths — so none is uniquely required. Not isomorphic: the flow
spans ~10 functions across `scheduler/`, `runtime/io/`, `runtime/time/`, and `runtime/task/` plus a
waker handoff, well beyond any one primitive.

---

## Calibration notes for the reviewer

- **L3 and L5 both touch the I/O driver, different scopes.** L3 is one linear wake path (mio event →
  `ScheduledIo` → waker); L5 is the whole-task lifecycle that *integrates* the I/O driver with the
  time driver and the scheduler. Different concerns and traversal scopes, analogous to the redis
  anchor where L3 (request path, networking) and L5 (replication transport, also networking-ish) are
  different concerns.
- **L4 and L5 both touch the scheduler, different scopes.** L4 is the bounded scheduler cluster
  (placement/selection/steal/idle/overflow); L5 threads the scheduler as just one of four subsystems
  in an end-to-end flow. The L4 subject (work distribution) is not the L5 concern (wake/resume
  integration), so no scope collision.
- **L2/L5 both touch `coop::poll_proceed`** — L2 owns the budget gate as its focal subject; L5 only
  notes that `run_task` polls under `coop::budget` as bonus context. The L5 spine does not depend on
  the budget detail, so the two levels don't collide.
- **L4 alternative timer:** this Tokio has a `time_alt` alternative wheel
  (`TimerFlavor::Alternative`, `driver.rs:~318`). The traditional wheel is the L5 spine; judges should
  accept answers that mention the alternative wheel but should not require it — mirroring the redis
  L4 disk-bgsave/diskless note.
- Every file:line above was opened and confirmed against the pinned SHA.
