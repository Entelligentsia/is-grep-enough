# transcript: I'm studying how the multi-thread runtime keeps all of its worker threads supplied with work without a central dispatcher. I need to understand how a newly n...


💬 I'll explore the multi-thread scheduler source systematically before synthesizing an answer.

  ▸ Agent(Explore multi-thread scheduler internals)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread -type f -name "*.rs" | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/queue.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/idle.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime -name "*inject*" -type f)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/inject.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/inject/shared.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/inject/synced.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/inject/pop.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/overflow.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/park.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/mod.rs)
      ↳ Bash(wc -l /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/*.rs)
      ↳ ⟹ returned to parent


💬 Here is how the four cooperating mechanisms fit together.  ---  ## 1. Where a newly scheduled task lands  The decision happens in `Handle::schedule_task` (`w...

──────── RESULT (success, 142927ms, 2 turns) ────────
Here is how the four cooperating mechanisms fit together.

---

## 1. Where a newly scheduled task lands

The decision happens in `Handle::schedule_task` (`worker.rs:1327`).

```
schedule_task(task, is_yield)
├── on current worker thread AND core is available?
│   └── schedule_local(core, task, is_yield)          ← fast path
└── otherwise
    ├── push_remote_task(task)   → inject queue        ← slow path
    └── notify_parked_remote()
```

**`schedule_local` (`worker.rs:1353`)** uses a LIFO slot for locality:

- If `is_yield` or LIFO is disabled → `run_queue.push_back_or_overflow(task)` straight onto the local ring buffer.
- Otherwise → the incoming task displaces whatever is in `core.lifo_slot`; the displaced task goes to the back of the ring buffer; the new task sits in the slot.  The LIFO slot is consumed first by the worker on its very next iteration of the task-execution loop (`MAX_LIFO_POLLS_PER_TICK = 3`, `worker.rs:689`).  The effect is that a task that just woke another task gets to run that other task almost immediately, exploiting hot CPU cache.

If the current thread has no core (e.g. it is inside `block_in_place`) or is simply a foreign thread, the task goes into the **global injection queue** (`inject::Shared`, a lock-protected linked list in `inject/shared.rs`) and a parked worker is kicked.

---

## 2. How a worker picks its next task

`Core::next_task` (`worker.rs:1062`) is called on every loop iteration:

```
next_task(core, handle)
│
├── tick % global_queue_interval == 0?  (periodic inject check)
│   ├── Yes → try inject first, then local
│   └── No  → try local first
│
├── local pop returns Some(task) → done
│
├── local empty, inject non-empty →
│   batch = min(inject.len / num_workers + 1, free_capacity)
│   pop_n(batch) → first task returned, rest pushed to local queue
│
└── None from both → caller (run loop) calls steal_work()
```

`global_queue_interval` (default 61, a prime to spread polling across workers) prevents starvation of remote/externally-submitted tasks while keeping the common case fast.

**`Core::steal_work` (`worker.rs:1141`):**

```
steal_work(core, handle)
├── transition_to_searching()       ← tell idle system "I'm looking"
├── random starting index           ← avoids thundering-herd on the same victim
├── for each other worker in ring:
│   └── steal.steal_into(&mut run_queue)
│       ├── steals ~half the victim's tasks into local queue
│       └── returns one task to run immediately
└── fallback: handle.next_remote_task()   ← drain inject queue
```

`steal_into` (`queue.rs:417`) only steals if the destination queue has fewer than `CAPACITY/2` tasks (so a nearly-full queue cannot be a thief). The steal is an atomic two-phase CAS: first set `steal_head ≠ real_head` to lock out other stealers, copy the tasks, then advance `steal_head = new_real_head` to release.

---

## 3. How workers coordinate: searching vs parked

`Idle` (`idle.rs:9`) packs two counters into one `AtomicUsize`:

```
state = (num_unparked << 16) | num_searching
```

**Entering search mode** (`transition_worker_to_searching`, `idle.rs:104`):

```
if 2 * num_searching >= num_workers → return false  (already ≥50% searching, bail out)
else → inc_num_searching(), return true
```

This cap prevents the thundering-herd problem: at most half the workers actively steal at any one time.

**Parking** (`Core::transition_to_parked`, `worker.rs:1204`):

```
1. Check run_queue, lifo_slot, inject queue — if any work exists, abort park
2. idle.transition_worker_to_parked(index, is_searching)
   → dec_num_unparked, dec_num_searching if applicable
   → push index onto sleepers vec
   → return is_last_searcher
3. if is_last_searcher → handle.notify_if_work_pending()
```

Step 3 is a critical safety valve: if *this* worker was the last one actively looking for work and there is still work in the queues, it must wake someone before sleeping, or that work will never run.

**Waking** (`Idle::worker_to_notify`, `idle.rs:51`):

```
notify_should_wakeup?
  → num_unparked == 0, OR
  → num_searching == 0
→ pop from sleepers vec
→ inc_num_unparked + inc_num_searching (new worker wakes as a searcher)
→ call remote.unpark.unpark()
```

The incoming worker wakes as a searcher, not as an idle worker, so it immediately starts stealing rather than checking only its empty local queue.

**Leaving search mode** (`transition_from_searching`, `idle.rs:121`): when a worker actually *finds* a task it calls `dec_num_searching`. If it was the last searcher and there is still work, it calls `notify_parked_local`/`notify_parked_remote` to chain-wake another worker — so discovered work propagates outward, one wakeup at a time.

---

## 4. Local queue overflow

`Local::push_back_or_overflow` (`queue.rs:188`) triggers when `tail - steal_head >= 256`:

```
queue full AND no active stealer (steal == real)?
    → push_overflow(task, head, tail, inject, metrics)
queue full AND stealer active?
    → push directly to inject queue (stealer will drain us soon)
```

**`push_overflow` (`queue.rs:253`)** moves the *second* half of the ring buffer into the global injection queue:

```
n = LOCAL_QUEUE_CAPACITY / 2  (128 tasks)

1. CAS head: pack(real, real) → pack(tail, tail)
   (claims the entire queue atomically; retried if CAS fails)

2. tail -= n
   (gives back the first 128 slots to the local queue)

3. Collect tasks at indices [old_real + 128 .. old_tail)
   + the overflow task itself

4. inject.push_batch(those 129 tasks)
```

The second half is moved — not the first — because tasks recently pulled *from* the inject queue always land in the first half of the local ring. Moving the second half therefore moves the oldest local-origin tasks, which are farthest from the tasks just pulled from inject, reducing the chance of accidentally moving freshly-injected work back into inject.

After the overflow, one of the now-freed slots in the local queue is used for the triggering task, and any sleeping worker can be woken to drain the newly-populated inject queue.

---

## Putting it together

```
External wakeup / spawn
        │
        ▼
  On current worker?──Yes──▶ LIFO slot or run_queue.push_back_or_overflow
        │                              │ (overflow → inject 128 tasks)
        No                             │
        │                             ▼
        └──────────────────▶ inject queue  +  notify_parked_remote
                                      │
                           ┌──────────┴──────────────┐
                           ▼                         ▼
                    Worker wakes              Worker already running
                    as searcher
                           │
                    ┌──────▼──────────────────────────────┐
                    │  next_task():                        │
                    │  tick check → inject batch-pull      │
                    │  OR local queue pop                  │
                    │  OR steal_work → peer steal/inject   │
                    └──────┬──────────────────────────────┘
                           │ task found
                    transition_from_searching
                           │ (was last searcher + work remains?)
                           └──────▶ notify_parked → chain-wake
```

All of this is lock-free on the common path (the local queue head/tail are `AtomicU32`/`AtomicU64` pairs with CAS loops; the `Idle::state` is a single `AtomicUsize`). The global `Synced` mutex is only acquired during park/unpark bookkeeping and inject-queue batch operations, which are comparatively rare.
