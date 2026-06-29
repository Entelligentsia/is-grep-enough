# transcript: I'm studying how the multi-thread runtime keeps all of its worker threads supplied with work without a central dispatcher. I need to understand how a newly n...


💬 I'll use grove to map the multi-thread scheduler structure, then drill into each mechanism you asked about.
  ▸ ToolSearch(select:mcp__grove__map,mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread -type f | sort)

💬 Good. Now I'll map the core files in parallel — the worker loop, idle tracker, run queue, and handle's schedule path — to get the full graph before reading s...
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","detail":0})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","detail":0})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/scheduler/multi_thread/queue.rs","detail":0})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/scheduler/multi_thread/handle.rs","detail":0})

💬 Now let me read the key bodies in parallel — the scheduling path, the worker's task-fetch loop, and the idle/queue internals.
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"schedule_task"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"schedule_local"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"next_task"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/queue.rs","name":"push_back_or_overflow"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","name":"worker_to_notify"})

💬 Now let me read the remaining pieces: stealing, the searching/parked state transitions, overflow body, and the main worker run loop.
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"steal_work"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"transition_to_searching"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"transition_from_searching"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"transition_to_parked"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"transition_from_parked"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/queue.rs","name":"push_overflow"})

💬 Now let me get the main run loop body, the idle state transitions, and the `steal_into` implementation.
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"run"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","name":"transition_worker_to_searching"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","name":"transition_worker_to_parked"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","name":"transition_worker_from_searching"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/queue.rs","name":"steal_into"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"transition_worker_from_searching"})

💬 Let me get the main `Context::run` loop body and `notify_if_work_pending`.
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","id":"rust:tokio/src/runtime/scheduler/multi_thread/worker.rs#run@561"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"notify_if_work_pending"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"next_local_task"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","name":"notify_should_wakeup"})

💬 Let me grab the `State` bit-packing to complete the idle picture.
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","name":"dec_num_searching"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/idle.rs","name":"new"})
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/idle.rs)
  ▸ Bash(grep -n "LOCAL_QUEUE_CAPACITY\|SEARCH_MASK\|UNPARK_SHIFT\|UNPARK_MASK" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/queue.rs | head -5 &&...)

💬 I now have all the pieces. Here's a complete walkthrough of how these mechanisms cooperate.  ---  ## How the Tokio multi-thread scheduler distributes work  #...

──────── RESULT (success, 229631ms, 32 turns) ────────
I now have all the pieces. Here's a complete walkthrough of how these mechanisms cooperate.

---

## How the Tokio multi-thread scheduler distributes work

### The data structures

Each worker has a **`Core`** (moved between threads — see `block_in_place`). Inside `Core`:

- `lifo_slot: Option<Notified>` — a one-task fast-lane
- `run_queue: Local<Task>` — a 256-slot lock-free ring buffer (4 slots under `loom`)
- `is_searching: bool` — local cache of the searching state

The **`Shared`** state (owned by `Handle`) holds:

- `remotes: Vec<Remote>` — one per worker; each `Remote` contains a `steal: Steal<Task>` handle (the read-only view of that worker's ring buffer that peers use to steal)
- `inject: Inject<Task>` — the global injection queue
- `idle: Idle` — a single `AtomicUsize` encoding two counters

The `Idle` atom packs two 16-bit fields into one word:

```
bits  0–15  num_searching   (masked by SEARCH_MASK)
bits 16–31  num_unparked    (shifted by UNPARK_SHIFT = 16)
```

A separate `Synced` struct (behind the main lock) holds `sleepers: Vec<usize>` — a stack of parked worker indices.

---

### 1. Placing a newly woken task

Entry point: `Handle::schedule_task` (`worker.rs:1327`)

```
with_current(|maybe_cx| {
    if let Some(cx) = maybe_cx {
        if self.ptr_eq(&cx.worker.handle) {        // same scheduler?
            if let Some(core) = cx.core.borrow_mut().as_mut() {   // still holds a core?
                self.schedule_local(core, task, is_yield);
                return;
            }
        }
    }
    // External thread, different scheduler, or core was taken by block_in_place
    self.push_remote_task(task);
    self.notify_parked_remote();
});
```

The decision is binary: **same worker thread with a live core → local path; everything else → injection queue**.

**Local path — `schedule_local`** (`worker.rs:1353`):

- **`is_yield` or LIFO disabled**: call `run_queue.push_back_or_overflow(task, …)`. Always push to the back. Set `should_notify = true`.
- **Normal wakeup**: try the LIFO slot first.
  - Evict whatever was previously in `lifo_slot` to the back of the ring buffer.
  - Place the new task in `lifo_slot`.
  - `should_notify = prev.is_some()` — only signal if something was displaced (meaning another task was already waiting to run).

The LIFO slot is a one-slot bypass. When task A wakes task B (producer/consumer pattern), B lands in the slot and runs *next*, before any other queued work. This keeps the hot data in cache. A `yield_now` bypasses it intentionally so that fairness is preserved.

If `should_notify` and `core.park.is_some()` (not currently handling a driver callback batch), call `notify_parked_local()`.

---

### 2. How a worker finds its next task

The main loop in `Context::run` (`worker.rs:561`) is:

```
loop {
    core.tick();
    core = self.maintenance(core);

    if let Some(task) = core.next_task(&self.worker) {
        core = self.run_task(task, core)?;
        continue;
    }

    // Local + inject exhausted — try stealing
    if let Some(task) = core.steal_work(&self.worker) {
        core = self.run_task(task, core)?;
    } else {
        core = self.park(core);   // or park_yield if deferred tasks exist
    }
}
```

**`Core::next_local_task`** (`worker.rs:1132`) — the fast path, always tried first:

```rust
self.lifo_slot.take().or_else(|| self.run_queue.pop())
```

LIFO slot has priority over the ring buffer.

**`Core::next_task`** (`worker.rs:1062`) — called every tick:

- **Every `global_queue_interval` ticks** (periodically re-tuned based on queue load): check the **injection queue *first***, then fall back to local. This prevents injection-queue starvation when the local queue stays perpetually full.
- **All other ticks**:
  1. Try `next_local_task()`.
  2. If local is empty but injection is not empty: pull a **batch** from injection. Batch size = `min(inject.len() / num_workers + 1, remaining_local_slots, max_capacity/2)`. One task is returned directly; the rest are pushed into the ring buffer — into the first half only (see overflow below). This amortizes the lock acquisition across multiple tasks.

---

### 3. Stealing from peers

`Core::steal_work` (`worker.rs:1141`) — reached only when `next_task` returns `None`:

```rust
fn steal_work(&mut self, worker: &Worker) -> Option<Notified> {
    if !self.transition_to_searching(worker) {
        return None;   // cap exceeded: too many searchers already
    }
    let num = worker.handle.shared.remotes.len();
    let start = self.rand.fastrand_n(num as u32) as usize;  // random starting peer
    for i in 0..num {
        let i = (start + i) % num;
        if i == worker.index { continue; }
        if let Some(task) = target.steal.steal_into(&mut self.run_queue, …) {
            return Some(task);
        }
    }
    worker.handle.next_remote_task()   // final fallback: injection queue
}
```

`steal_into` (`queue.rs:417`) works lock-free:

1. Checks that the destination ring buffer has room (aborts if destination is already more than half full — stealing into a nearly-full queue would just cause immediate re-overflow).
2. Uses `steal_into2` to copy tasks from the source's buffer into the destination's buffer without yet advancing the destination's tail.
3. Returns one task immediately to the caller.
4. Only then stores the advanced tail, making the remaining stolen tasks visible to further stealers.

---

### 4. Coordinating searchers vs. parked workers

**The 50% cap** (`idle.rs:104`):

```rust
pub(super) fn transition_worker_to_searching(&self) -> bool {
    let state = State::load(&self.state, SeqCst);
    if 2 * state.num_searching() >= self.num_workers {
        return false;
    }
    State::inc_num_searching(&self.state, SeqCst);
    true
}
```

At most half the workers are allowed to search simultaneously. This limits contention on the injection queue lock and on peers' steal handles.

**When a searcher finds work** — `Handle::transition_worker_from_searching` (`worker.rs:1479`):

```rust
fn transition_worker_from_searching(&self) -> bool {
    if self.shared.idle.transition_worker_from_searching() {
        // We were the last searcher. Work was found → recruit help.
        self.notify_parked_local()
    } else {
        false
    }
}
```

`transition_worker_from_searching` (`idle.rs:181`) atomically decrements `num_searching` and returns `true` if the count just hit zero. When the last searcher finds work and exits the searching state, it wakes one parked worker — because if the last searcher found tasks, there's probably more work to be done by another pair of hands.

**Parking** — `Core::transition_to_parked` (`worker.rs:1204`) + `Idle::transition_worker_to_parked` (`idle.rs:86`):

1. Refuses to park if `has_tasks()` or being traced.
2. Acquires the synced lock, atomically decrements `num_unparked` (and `num_searching` if the worker was searching) via `State::dec_num_unparked`.
3. Pushes the worker index onto `sleepers`.
4. Returns `is_last_searcher` = whether this worker was searching *and* was the last one.
5. Back in `transition_to_parked`: if `is_last_searcher`, calls `notify_if_work_pending()`.

**The last-searcher safety net** — `notify_if_work_pending` (`worker.rs:1465`):

```rust
fn notify_if_work_pending(&self) {
    for remote in &self.shared.remotes[..] {
        if !remote.steal.is_empty() {
            self.notify_parked_local();
            return;
        }
    }
    if !self.shared.inject.is_empty() {
        self.notify_parked_local();
    }
}
```

This plugs a race: a task could have been pushed to some queue *after* the last searcher checked that queue but *before* it atomically decremented `num_searching` to zero. If nobody checks, that task sits invisible. When the last searcher parks, it scans every queue one final time and wakes a worker if anything is there.

**Whether to wake at all** — `notify_should_wakeup` (`idle.rs:153`):

```rust
fn notify_should_wakeup(&self) -> bool {
    let state = State(self.state.fetch_add(0, SeqCst));
    state.num_searching() == 0 && state.num_unparked() < self.num_workers
}
```

If any worker is already searching, new work will eventually be found — no wakeup needed. Only wake if no one is searching *and* at least one worker is parked.

**`worker_to_notify`** (`idle.rs:51`) does a double-checked lock: SeqCst load → fast exit if no wakeup needed → acquire synced lock → recheck → atomically increment both `num_unparked` and `num_searching` by 1 → pop a worker index from `sleepers`. The unparked worker starts life in the searching state.

**Unparking** — `Core::transition_from_parked` (`worker.rs:1231`):

- If the worker finds tasks in its local queue or LIFO slot: it transitions itself out of parked state. `is_searching` is set to `false` if it was explicitly notified by another worker (i.e., unparked *by* someone), `true` if it woke spontaneously (e.g., from I/O events).
- If the sleepers stack still has its index (nobody popped it): stays parked.
- If its index was popped: `is_searching = true` — the woken worker must search.

---

### 5. Local queue overflow

`Local::push_back_or_overflow` (`queue.rs:188`) — called from `schedule_local` and `next_task`'s injection-batch path:

The ring buffer's head word packs two 16-bit cursors: `steal` (where concurrent stealers are reading from) and `real` (the actual unconsumed head).

```rust
if tail.wrapping_sub(steal) < 256 {
    break tail;                  // room available — normal push
} else if steal != real {
    overflow.push(task);         // stealer in progress — just inject the new one
    return;
} else {
    self.push_overflow(…)        // truly full — split
}
```

If a steal is in progress, the stealer will free slots momentarily, so rather than waiting, the new task is immediately injected. The stealer's notification path will wake workers to consume from the injection queue.

**`push_overflow`** (`queue.rs:253`) — when genuinely full:

1. Claims the **second half** of the ring buffer (slots `[head+128, head+256)`) with a CAS: `(steal=head, real=head) → (steal=tail, real=tail)`. This makes the second half look consumed to any concurrent stealer.
2. Resets the tail back to `head+128`, so the owner keeps the first half (128 tasks).
3. Batches the second half's 128 tasks + the new task (129 total) and pushes them to the injection queue.

The asymmetry (evict the *second* half, keep the *first*) is intentional: when tasks are pulled from the injection queue, they fill the *first half* of the local queue. By always evicting the second half and keeping the first, a task that just came from inject won't immediately overflow back out on the very next push — it sits in the first half and is safe until the queue fills again.

---

### How it all fits together

```
External wakeup                   Worker-thread wakeup
      │                                   │
      ▼                                   ▼
push_remote_task (inject)        schedule_local
notify_parked_remote()    ──┐      │  LIFO slot  (hot path: runs next)
                             │      │  push_back  (back of ring buffer)
                             │      │  → overflow → inject (if ring full)
                             │      │
                             └──► worker_to_notify
                                   SeqCst check (no searchers & parked exist)
                                   lock → pop sleepers → unpark_one
                                   unparked worker starts in searching state
                                            │
                              ┌─────────────┼──────────────┐
                              ▼             ▼              ▼
                         next_task      steal_work       park
                        (local+inject)  (≤50% allowed)
                              │             │
                         lifo_slot first    random peer → steal_into (lock-free, half queue)
                         ring_queue next    fallback: inject queue
                         every N ticks:
                           inject first     on success: transition_from_searching
                                              if last searcher → notify one more parked worker
                                            on failure: transition_to_parked
                                              if last searcher → notify_if_work_pending (safety scan)
```

The key invariant the system maintains: **work is never silently stranded**. Any task pushed to any queue either finds a searching worker that will discover it, or triggers a notification that wakes a parked worker into the searching state. The last-searcher safety net and the SeqCst barriers around `num_searching` close the race window between "task pushed" and "someone checking."
