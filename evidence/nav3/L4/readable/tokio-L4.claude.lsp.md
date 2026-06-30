# transcript: I'm studying how the multi-thread runtime keeps all of its worker threads supplied with work without a central dispatcher. I need to understand how a newly n...


💬 I'll load the LSP tool first, then systematically map the multi-thread scheduler's cooperating pieces.
  ▸ ToolSearch(select:LSP)

💬 Now let me explore the multi-thread scheduler systematically, starting with the key symbols.
  ▸ LSP(multi_thread)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/scheduler -type f | sort)

💬 Good, now let me read all the key files in parallel.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/queue.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/idle.rs)

💬 Now let me read the inject and overflow files to complete the picture.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/inject/shared.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/overflow.rs)

💬 Now let me check the inject/synced.rs and the `push_batch` implementation on `inject::Shared` to complete the overflow path.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/inject/synced.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/inject/rt_multi_thread.rs)

💬 Now I have everything I need. Let me compile a thorough walkthrough of all four cooperating mechanisms.  ---  ## Multi-thread runtime: how workers stay fed w...

──────── RESULT (success, 177619ms, 11 turns) ────────
Now I have everything I need. Let me compile a thorough walkthrough of all four cooperating mechanisms.

---

## Multi-thread runtime: how workers stay fed with work

There are four interlocking mechanisms. Here's how they fit together.

---

### 1. Data structures involved

```
Shared (one per runtime)
├── remotes: Box<[Remote]>          -- one per worker
│   ├── steal: queue::Steal<…>     -- the stealable view of that worker's ring buffer
│   └── unpark: Unparker           -- OS-level wake handle
├── inject: inject::Shared<…>      -- global lock-protected MPMC linked-list queue
├── idle: Idle                     -- packed AtomicUsize: num_unparked|num_searching
└── synced: Mutex<Synced>          -- guards idle.sleepers + inject's linked list head/tail
```

```
Core (held by exactly one thread at a time)
├── lifo_slot: Option<Notified>    -- the one LIFO fast lane
├── run_queue: queue::Local<…>     -- 256-slot lock-free ring buffer (producer-only)
└── is_searching: bool             -- local cache of "I'm currently a searcher"
```

Each `queue::Local<T>` is paired with a `queue::Steal<T>`—both are `Arc`-sharing a single `Inner` that has two atomic head fields and one atomic tail (`queue.rs:36–57`).

---

### 2. Where a newly notified task lands

Entry point: `Handle::schedule_task` (`worker.rs:1327`).

```
schedule_task(task, is_yield)
│
├─ Am I a worker thread for THIS runtime AND still holding a Core?
│  (with_current → core.borrow_mut().as_mut())
│
│  YES → schedule_local(core, task, is_yield)   (worker.rs:1353)
│  │
│  │  is_yield == true, or LIFO disabled?
│  │  YES → run_queue.push_back_or_overflow(task)   // FIFO, may overflow
│  │        if task was displaced from lifo_slot → notify_parked_local()
│  │
│  │  NO (normal schedule from within a task)
│  │  → swap task into core.lifo_slot, push displaced occupant → run_queue
│  │    if a previous task WAS displaced → notify_parked_local()
│  │                                       (queue grew; another worker might want it)
│
│  NO (external thread, or worker lost its core via block_in_place)
│  → push_remote_task(task)   // acquires synced mutex, appends to inject linked list
│    notify_parked_remote()   // wake a sleeping worker if one exists
```

**Key LIFO invariant**: the lifo slot is a _size-1 fast lane_ (`lifo_slot.take()` in `next_local_task`, `worker.rs:1133`). Its purpose is locality—the task that was just woken is the most cache-warm one and should run immediately. But it is capped at `MAX_LIFO_POLLS_PER_TICK = 3` consecutive polls (`worker.rs:264, 743`) to prevent two ping-ponging tasks from starving the rest of the queue.

---

### 3. How a worker selects its next task

Main loop in `Context::run` (`worker.rs:561`):

```
loop:
  tick++
  run maintenance every event_interval ticks (park_yield + shutdown check)

  task = core.next_task(worker)?     // local work exists
  if task: run_task(task); continue

  // nothing local; try stealing
  task = core.steal_work(worker)?
  if task: run_task(task); continue

  // truly idle: park (or park_yield if defer queue non-empty)
```

**`Core::next_task`** (`worker.rs:1062`) implements two modes based on a tick modulus:

```
every global_queue_interval ticks:
    // Prioritize inject to prevent starvation of externally-spawned work
    next_remote_task()                 // lock synced, pop one from inject linked list
    .or_else(|| next_local_task())     // LIFO slot → run_queue.pop()

other ticks:
    next_local_task()?                 // LIFO slot → run_queue.pop()

    // Local empty but inject non-empty: bulk-pull to amortize lock cost
    n = min(inject.len / num_workers + 1,  // fair share
            min(remaining_slots, max_capacity / 2))  // only fill first half (see §5)
    lock synced; pop_n(n) tasks
    ret  = tasks.next()      // return first directly
    push tasks.rest → run_queue.push_back()  // stage remainder locally
```

`global_queue_interval` starts at a configured value and is **dynamically tuned** by `Stats::tuned_global_queue_interval` based on task poll time, so busier workers check inject less often.

**`Core::steal_work`** (`worker.rs:1141`):

```
transition_to_searching()?   // allowed only if num_searching < num_workers/2 (see §4)
  return None if not allowed

start = rand.fastrand_n(num_workers)  // randomize starting peer to avoid thundering herd
for i in 0..num_workers:
    target = remotes[(start + i) % num]
    skip self
    target.steal.steal_into(&mut self.run_queue)?  // lock-free CAS, copies half of peer's queue
        return Some(first_stolen_task)

// fallback: try inject queue directly
next_remote_task()
```

`steal_into` (`queue.rs:417`) grabs **half** the victim's tasks: it CAS-claims them (by advancing `head_real` while leaving `head_steal` unchanged, which blocks other stealers on that queue), copies them into the stealing worker's local queue, then finalises the CAS to restore `head_steal == head_real`. One task is returned directly; the rest become stealable from the thief's own queue.

---

### 4. Searching vs. parked state machine

`Idle` encodes its entire state in one `AtomicUsize` (`idle.rs:9–18`):

```
state: AtomicUsize
 bits [0..15]  = num_searching   (SEARCH_MASK)
 bits [16..]   = num_unparked    (UNPARK_MASK, shifted by UNPARK_SHIFT=16)
```

All transitions are SeqCst to ensure the "no searcher" observation is globally ordered against new task pushes (the `notify_should_wakeup` comment, `idle.rs:53–63` explains this: it must pair with the `fetch_sub` that drains `num_searching` to zero).

| Transition | Where called | Atomic effect | Side effects |
|---|---|---|---|
| **to searching** | `steal_work` → `transition_to_searching` (`worker.rs:1171`) | `inc_num_searching` if `2*searching < workers` | Returns false (skip steal) if cap would be exceeded |
| **from searching** (work found) | `run_task` → `transition_from_searching` (`worker.rs:1179`) | `dec_num_searching` | If this was the **last** searcher: `notify_parked_local()` to spawn a replacement searcher |
| **to parked** | `Core::transition_to_parked` (`worker.rs:1204`) | `dec_num_unparked` (and `dec_num_searching` if was searching) + push to `sleepers` | If last searcher: `notify_if_work_pending()` scans all remote steal queues + inject for work before committing to sleep |
| **from parked** (woken) | `Core::transition_from_parked` (`worker.rs:1231`) | — | If tasks exist locally: `is_searching = !unpark_worker_by_id()` (searching only if woken by a peer, not by own driver events). Otherwise: `is_searching = true` |
| **notify parked worker** | `notify_parked_local/remote` (`worker.rs:1441`) | `unpark_one` atomically increments both `num_unparked` and `num_searching` | Only wakes a sleeper when `num_searching == 0`—if any worker is already searching, it will find the work and then wake another |

The **"last searcher" invariant** is the key safety property: whenever the final searching worker transitions away (either to found-work or to parked), it is required to ensure a replacement watcher exists or all queues are confirmed empty. This prevents the system from deadlocking with tasks pending but all workers asleep.

---

### 5. What happens when the local queue overflows

The local queue is a 256-slot lock-free ring buffer. When `push_back_or_overflow` is called and the queue is full (`worker.rs:188`, `queue.rs:188`):

**Case A: a concurrent steal is in progress** (`steal != real` in `head`):
- That steal will free slots shortly.
- Just push the single new task straight to inject. Don't attempt the batch operation (would race with the stealer).

**Case B: truly full, no concurrent stealer**:
`push_overflow` (`queue.rs:253`) runs:

```
1. CAS head: pack(H, H) → pack(T, T)
   where H = current real head, T = current tail
   This makes the queue appear EMPTY to all stealers simultaneously
   (since head_real == tail).
   Fails? Retry push_back_or_overflow from scratch.

2. tail.store(T + 128, Release)
   This makes the FIRST HALF (positions [T..T+128)) visible again.
   Because indices wrap mod 256:  T & 255 == H & 255
   So slots buffer[H..H+128] (the OLDER half) are now stealable.

3. Collect the SECOND HALF (positions [H+128..H+256) = the NEWER tasks)
   + the new incoming task → chain into a linked list

4. inject.push_batch(batch)  ← acquires synced mutex once for the whole batch
   Updates inject len atomically.
```

**Why second half to inject, not first half?**
When a worker later pulls tasks _from_ inject back into its local queue (`push_back` after `pop_n`), those tasks always land at the current tail (the "first half" of the ring buffer at that moment). By sending only the second-half tasks to inject, the code guarantees that any task currently in the second half was NOT just retrieved from inject—it was genuinely locally produced. This prevents inject↔local ping-ponging where a task bounces from inject → local → overflow → inject without ever getting polled.

After `push_overflow` completes, the overflow path (`Overflow::push_batch` on `Handle`, `worker.rs:1525`) calls `inject.push_batch` which walks the linked batch and appends it to the inject queue's tail under the synced mutex. The `notify_parked_local` call from the overflowing worker's `schedule_local` (triggered by the LIFO displacement) ensures a sleeping worker wakes to drain the inject queue.

---

### The full cooperation loop in one sentence

A locally-scheduled task goes into the LIFO slot (or local ring buffer) and a parked worker is nudged only if the queue grew; when a worker runs dry it steals half a peer's ring buffer using lock-free CAS, but only if fewer than half of all workers are already searching; when the local ring buffer overflows its 256 slots, the newer half of the buffer plus the arriving task are batch-appended to the global inject linked list under one mutex acquisition; and a sleeping worker is woken only when the `Idle` state shows zero active searchers, ensuring that one active searcher is always enough to propagate new work to the rest of the pool.
