# transcript: I want to trace what happens from the moment the reactor's underlying system poll reports an I/O resource is ready until the task that was waiting on that re...


💬 I'll map out the reactor's I/O wakeup path using grove, starting from the driver and working down through the readiness chain.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__map,mcp__grove__definition)

💬 Let me map the I/O driver directory first, then drill into the key files simultaneously.
  ▸ mcp__grove__map({"dir":"tokio/src/runtime/io"})
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/io -type f | sort)

💬 Now let me read the four load-bearing methods: `turn`, `set_readiness`, `wake`, and the `Readiness` future's `poll`.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/driver.rs#turn@179"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/scheduled_io.rs#set_readiness@207"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/scheduled_io.rs#wake@236"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/scheduled_io.rs#poll@427"})

💬 Let me also grab `poll_readiness` and `Registration::poll_ready` to complete the picture, plus understand how `Waker::wake` routes to the scheduler.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/scheduled_io.rs#poll_readiness@303"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/registration.rs#poll_ready@144"})
  ▸ Bash(grep -n "wake_by_ref\|fn wake\|schedule\|push_task\|push_back\|run_queue\|WakerRef\|waker_ref\|RawWaker" /home/bench/repos/tokio/tokio/src/runtime/task/waker...)
  ▸ mcp__grove__source({"file":"tokio/src/runtime/task/waker.rs","name":"wake_by_ref"})
  ▸ mcp__grove__symbols({"dir":"tokio/src/runtime/task","name":"wake_by_ref"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/harness.rs#wake_by_ref@96"})
  ▸ mcp__grove__symbols({"dir":"tokio/src/runtime/task","name":"schedule"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/raw.rs#schedule@276"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/raw.rs#schedule@346"})

💬 Let me check one last piece — how `Schedule::schedule` on the multi-thread scheduler enqueues the task.
  ▸ mcp__grove__callers({"dir":"tokio/src/runtime/scheduler","name":"schedule"})
  ▸ mcp__grove__symbols({"dir":"tokio/src/runtime/scheduler/multi_thread","kind":"method","name":"schedule"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/handle.rs#schedule@110"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/handle.rs","name":"schedule_task"})
  ▸ mcp__grove__callers({"dir":"tokio/src/runtime/scheduler/multi_thread","name":"schedule_task"})
  ▸ mcp__grove__symbols({"dir":"tokio/src/runtime/scheduler/multi_thread","name":"schedule_task"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/worker.rs#schedule_task@1327"})
  ▸ mcp__grove__source({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs","name":"schedule_local"})

💬 Now I have the complete picture. Here's the end-to-end trace.  ---  ## The I/O Wakeup Path, End to End  There are six distinct steps. The code is split acros...

──────── RESULT (success, 128453ms, 25 turns) ────────
Now I have the complete picture. Here's the end-to-end trace.

---

## The I/O Wakeup Path, End to End

There are six distinct steps. The code is split across `driver.rs`, `scheduled_io.rs`, `task/waker.rs`, `task/raw.rs`, and the scheduler.

---

### Step 1 — `Driver::turn` polls the OS and iterates events

**`tokio/src/runtime/io/driver.rs:179`** — `Driver::turn`

```rust
match self.poll.poll(events, max_wait) { ... }    // blocks on epoll_wait/kevent/etc.

for event in events.iter() {
    let token = event.token();
    // TOKEN_WAKEUP and TOKEN_SIGNAL are handled separately
    let ready = Ready::from_mio(event);
    let ptr = super::EXPOSE_IO.from_exposed_addr(token.0);
    let io: &ScheduledIo = unsafe { &*ptr };

    io.set_readiness(Tick::Set, |curr| curr | ready);
    io.wake(ready);
}
```

`self.poll` is a `mio::Poll`. When the OS says a file descriptor is ready, mio returns the raw token that was registered with it. That token is the address of the `ScheduledIo` that owns that fd — the pointer was encoded into the token when `add_source` called `mio::Registry::register`. Every ready fd thus maps directly to its `ScheduledIo` without any hash table lookup.

---

### Step 2 — `set_readiness` atomically updates the readiness word

**`tokio/src/runtime/io/scheduled_io.rs:207`** — `ScheduledIo::set_readiness`

```rust
let _ = self.readiness.fetch_update(AcqRel, Acquire, |curr| {
    let new_tick = tick.wrapping_add(1) % MAX_TICK;
    let ready = Ready::from_usize(READINESS.unpack(curr));
    Some(TICK.pack(new_tick, f(ready).as_usize()))   // f = |curr| curr | ready
});
```

`self.readiness` is a single `AtomicUsize` that packs two fields with the `bit_pack` scheme: a `READINESS` bitfield and a `TICK` counter. The tick is incremented on every `Tick::Set` call. This tick is crucial: a task clears readiness by calling `set_readiness(Tick::Clear(tick), ...)` and the clear only takes effect if the tick still matches, preventing a stale clear from stomping a fresh event.

---

### Step 3 — `wake` collects and fires waiting wakers

**`tokio/src/runtime/io/scheduled_io.rs:236`** — `ScheduledIo::wake`

```rust
// Fast-path: dedicated reader/writer slots (used by poll_read_ready / poll_write_ready)
if ready.is_readable() { if let Some(waker) = waiters.reader.take() { wakers.push(waker); } }
if ready.is_writable() { if let Some(waker) = waiters.writer.take() { wakers.push(waker); } }

// General-purpose: intrusive linked list of Waiter nodes (used by readiness().await)
loop {
    let mut iter = waiters.list.drain_filter(|w| ready.satisfies(w.interest));
    while wakers.can_push() {
        if let Some(waiter) = iter.next() {
            if let Some(waker) = waiter.waker.take() {
                waiter.is_ready = true;
                wakers.push(waker);
            }
        }
    }
    drop(waiters);
    wakers.wake_all();        // <-- fires the wakers, releases the lock first
    waiters = self.waiters.lock();
}
```

There are two waiter storage designs:

- **`waiters.reader` / `waiters.writer`**: single optional `Waker` slots, used by `poll_readiness` (the `poll_read_ready`/`poll_write_ready` path). When a task registers with `poll_readiness` it simply stores `cx.waker()` into one of these slots.
- **`waiters.list`**: an intrusive `LinkedList<Waiter>`, used by the `readiness().await` async path. Each `Waiter` node carries `interest` bits and a `waker`. Only waiters whose `interest` is satisfied by the incoming `ready` bits are drained out.

The lock is dropped before `wake_all()` to avoid holding it during waker dispatch (which might re-enter the reactor).

---

### Step 4 — Where do the wakers come from? The `Readiness` future

**`tokio/src/runtime/io/scheduled_io.rs:427`** — `Readiness::poll` (the `Future` impl behind `ScheduledIo::readiness`)

The future state machine has three states: `Init → Waiting → Done`.

- **`State::Init`**: load the readiness word. If already ready, return `Poll::Ready` immediately. If not, acquire the waiters lock, check again (to avoid a TOCTOU with `set_readiness`), then clone `cx.waker()` into a newly-allocated `Waiter` and push that node onto `waiters.list`. Transition to `Waiting`.
- **`State::Waiting`**: lock, check `waiter.is_ready`. `wake()` set that flag and took the waker. If set, transition to `Done`. Otherwise update the stored waker (in case the executor changed it) and return `Poll::Pending`.
- **`State::Done`**: load the current readiness word and return `Poll::Ready(ReadyEvent { tick, ready, ... })`.

The symmetry with `wake()` is exact: `poll` stores the waker in `Waiter`, `wake` checks `waiter.is_ready` as the signal that `wake` already ran.

For the `poll_read_ready`/`poll_write_ready` path, `poll_readiness` (**`scheduled_io.rs:303`**) does the same thing but stores directly into `waiters.reader` or `waiters.writer` instead of a list node.

---

### Step 5 — `Waker::wake()` routes through the task vtable

**`tokio/src/runtime/task/waker.rs:106`** → **`tokio/src/runtime/task/harness.rs:96`**

```rust
// waker.rs — the vtable entry
unsafe fn wake_by_ref(ptr: *const ()) {
    let raw = RawTask::from_raw(NonNull::new_unchecked(ptr as *mut Header));
    raw.wake_by_ref();
}

// harness.rs — the actual logic
pub(super) fn wake_by_ref(&self) {
    match self.state().transition_to_notified_by_ref() {
        TransitionToNotifiedByRef::Submit => self.schedule(),
        TransitionToNotifiedByRef::DoNothing => {}
    }
}
```

The `Waker` stored in every `Waiter` node was built from the raw `*Header` pointer of the task that called `poll`. The vtable's `wake_by_ref` function recovers that pointer and calls `transition_to_notified_by_ref()`, an atomic CAS on the task's state word. It returns `Submit` only once per notification cycle — if the task is already on the run queue, it returns `DoNothing`. This prevents duplicate scheduling.

---

### Step 6 — `schedule` puts the task on the run queue

**`tokio/src/runtime/task/raw.rs:346`** → **`tokio/src/runtime/scheduler/multi_thread/worker.rs:1327`**

```rust
// raw.rs — vtable dispatch
unsafe fn schedule<S: Schedule>(ptr: NonNull<Header>) {
    let scheduler = Header::get_scheduler::<S>(ptr);
    scheduler.as_ref().schedule(Notified(Task::from_raw(ptr.cast())));
}

// multi_thread/worker.rs
pub(super) fn schedule_task(&self, task: Notified, is_yield: bool) {
    with_current(|maybe_cx| {
        if let Some(cx) = maybe_cx {
            if self.ptr_eq(&cx.worker.handle) {
                if let Some(core) = cx.core.borrow_mut().as_mut() {
                    self.schedule_local(core, task, is_yield);  // fast path
                    return;
                }
            }
        }
        self.push_remote_task(task);      // slow path
        self.notify_parked_remote();
    });
}
```

Two cases:

- **Same-thread fast path** (`schedule_local`, `worker.rs:1353`): the I/O driver runs on a runtime worker thread. The task goes into `core.lifo_slot` — the LIFO slot that the worker checks *before* its run queue. This means a task woken by I/O it just initiated tends to run immediately on the same thread, without any cross-thread notification. If the LIFO slot was already occupied, the displaced task goes to `core.run_queue.push_back_or_overflow`.

- **Remote path**: the waker fires from outside any worker (e.g. a signal handler, a remote thread). The task is injected into the shared `inject` queue via `push_remote_task`, then `notify_parked_remote()` unparks a sleeping worker by writing to the driver's wakeup fd.

---

### The complete call chain

```
epoll_wait/kevent returns
  └─ Driver::turn                            [driver.rs:179]
       └─ for each event: recover *ScheduledIo from token
            ├─ ScheduledIo::set_readiness    [scheduled_io.rs:207]
            │    └─ fetch_update on readiness AtomicUsize (OR in ready bits, bump tick)
            └─ ScheduledIo::wake             [scheduled_io.rs:236]
                 ├─ take waker from waiters.reader / waiters.writer  (poll path)
                 └─ drain waiters.list where interest ⊆ ready         (async path)
                      └─ for each Waiter: take waker, set is_ready=true
                           └─ drop lock → WakeList::wake_all()
                                └─ Waker::wake() → wake_by_ref vtable  [waker.rs:106]
                                     └─ RawTask::wake_by_ref           [harness.rs:96]
                                          └─ transition_to_notified_by_ref (atomic CAS)
                                               └─ RawTask::schedule    [raw.rs:276]
                                                    └─ vtable → schedule::<S>  [raw.rs:346]
                                                         └─ S::schedule(Notified(task))
                                                              └─ Handle::schedule_task  [worker.rs:1327]
                                                                   ├─ schedule_local → core.lifo_slot (same thread)
                                                                   └─ push_remote_task + notify_parked_remote
```

The key design points along this path:
- The mio token *is* the `ScheduledIo` pointer, so there's no table lookup to get from event to resource.
- The readiness word packs both the ready bits and a tick counter in one `AtomicUsize`, making the clear-after-poll race safe without an extra lock.
- `is_ready = true` on the `Waiter` is set under the lock before the waker is taken, so `Readiness::poll` in `State::Waiting` will see it correctly even if it races with `wake`.
- The task state CAS in `transition_to_notified_by_ref` prevents double-scheduling.
- The LIFO slot in the multi-thread scheduler gives I/O-woken tasks cache-warm re-execution on the same thread they were parked on.
