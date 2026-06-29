# tokio · L3 · baseline — readable transcript

> baseline — text search (bash + coreutils), over **tokio** (rust) @ `66e29121b`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `baseline` — text search (bash + coreutils) |
| repo · rung | tokio (rust) · L3 |
| pinned source | `66e29121b333d1ba5bde803f570e421524d4431e` |
| status | completed |
| engagement | `bash_calls = 4` (gate: > 0 → ✓ used its capability) |
| turns | 18 |
| wall clock | 100 s |
| context (peak) | 525,474 tokens |
| cost (billed) | $0.4670 |
| &nbsp;&nbsp;↳ token split | in 13 · out 4,471 · cache-create 42,384 · cache-read 483,077 |
| tool calls | 17 (Read×13, Bash×4) |
| evidence | `evidence/nav3/L3/raw/tokio-L3.claude.baseline.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens from the moment the reactor's underlying system poll reports an I/O resource is ready until the task that was waiting on that resource is woken and scheduled to run again. I'm interested in how the ready events are read from the system poll, how a ready event is turned into a readiness update and a wake on the right resource, and how that finally hands off to the task being put back onto a run queue. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me trace this path through the source code directly.

&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/tokio/tokio/src/runtime -name "*.rs" | sort)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/tokio/tokio/src/io -name "*.rs" | sort)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/io/registration.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/task/waker.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/task/raw.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/util/wake_list.rs)`

💬 Now let me look at the `Schedule` trait and its multi-thread implementation, plus how `wake_by_val` flows through `RawTask`.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/task/mod.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle.rs)`
&nbsp;&nbsp;▸ `Bash(grep -n "schedule_task\|fn schedule_task\|fn wake_by_val\|wake_by_ref\|fn schedule\b" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs | head -60)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)`
&nbsp;&nbsp;▸ `Bash(grep -n "push_remote_task\|notify_parked_remote\|fn push_remote" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)`

💬 Now I have all the pieces I need to write the complete trace. Let me also check one small detail — how `schedule` in `raw.rs` creates the `Notified` and calls into the scheduler's `Schedule::schedule`.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)`

💬 Now I have a complete picture. Let me write the walkthrough.

---

Here is the end-to-end sequence, in order, with exact file locations.

---

## 1. The system poll call — `Driver::turn`

**`tokio/src/runtime/io/driver.rs:179`** — `turn()` is the reactor's main loop body. It is called from `park` / `park_timeout` on each scheduler iteration when a worker goes idle. It calls:

```rust
self.poll.poll(events, max_wait)   // line 188
```

`mio::Poll::poll` is a thin wrapper around `epoll_wait` / `kqueue` / `IOCP`. It blocks until at least one event arrives (or the timeout expires) and fills `self.events`.

---

## 2. Iterating ready events — still inside `turn`

**`driver.rs:201–222`** — For every event returned by `mio`:

```rust
for event in events.iter() {
    let token = event.token();
    // ... wakeup/signal tokens skipped ...
    let ready = Ready::from_mio(event);                    // convert mio flags → tokio Ready
    let ptr = super::EXPOSE_IO.from_exposed_addr(token.0); // recover raw *ScheduledIo
    let io: &ScheduledIo = unsafe { &*ptr };

    io.set_readiness(Tick::Set, |curr| curr | ready);      // (1) update readiness
    io.wake(ready);                                         // (2) wake waiters
}
```

The token stored in mio's registry is the raw address of a `ScheduledIo` (set in `ScheduledIo::token()` at **`scheduled_io.rs:188`**), so there is no lookup — the token *is* the pointer.

---

## 3. Updating readiness — `ScheduledIo::set_readiness`

**`scheduled_io.rs:207`**

The 32-bit `readiness` atomic packs three fields:
- bits 0–15: ready flags (readable, writable, read-closed, write-closed, …)
- bits 16–30: a 15-bit driver tick counter
- bit 31: shutdown flag

`set_readiness(Tick::Set, |curr| curr | ready)` does a CAS loop that OR-s the new ready bits in and increments the tick by one. The tick is what lets `clear_readiness` later distinguish a stale "please clear" from an event that arrived after the clear.

---

## 4. Waking waiters — `ScheduledIo::wake`

**`scheduled_io.rs:236`**

There are two waiter lists on each `ScheduledIo`:

- `waiters.reader` / `waiters.writer` — a single `Option<Waker>` slot each, used by the `poll_read_ready` / `poll_write_ready` poll-based path (`AsyncRead` / `AsyncWrite`).
- `waiters.list` — an intrusive linked list of `Waiter` nodes, one per pending `readiness().await` call (`async_io` / `AsyncFd`).

`wake` acquires the `Mutex<Waiters>` lock, drains any wakers whose interest overlaps `ready` into a `WakeList` (a stack-local array of 32 wakers), releases the lock, and then calls `wakers.wake_all()`. If there are more than 32 matching waiters the loop repeats (re-acquires lock, fills array, releases, wakes) until drained.

The lock is dropped before any `waker.wake()` is called, avoiding a potential deadlock if the waker's `wake` re-enters the reactor.

---

## 5. Waker identity — `WakeList::wake_all` → `Waker::wake`

**`util/wake_list.rs:65–72`** — Each `waker.wake()` call dispatches through the `RawWakerVTable` that was installed when the task's waker was created. For tasks managed by Tokio's runtime the vtable entry is at **`task/waker.rs:93`**:

```rust
unsafe fn wake_by_val(ptr: *const ()) {
    let ptr = NonNull::new_unchecked(ptr as *mut Header);
    let raw = RawTask::from_raw(ptr);
    raw.wake_by_val();
}
```

The `ptr` field of the waker *is* the `NonNull<Header>` pointer to the task allocation.

---

## 6. Task state transition — `RawTask::wake_by_val`

**`task/harness.rs:68`**

```rust
pub(super) fn wake_by_val(&self) {
    match self.state().transition_to_notified_by_val() {
        TransitionToNotifiedByVal::Submit => {
            self.schedule();        // creates Notified, calls Schedule::schedule
            self.drop_reference();
        }
        TransitionToNotifiedByVal::Dealloc => { self.dealloc(); }
        TransitionToNotifiedByVal::DoNothing => {}
    }
}
```

`transition_to_notified_by_val` is an atomic CAS on the task state word that sets the `NOTIFIED` bit. If the task was already `NOTIFIED` or `RUNNING` the transition returns `DoNothing` — the wake is absorbed without pushing to the queue a second time. Only if the bit was not already set does it return `Submit`, which means "you must push this task to the scheduler".

---

## 7. Routing to the scheduler — `raw.rs::schedule`

**`task/raw.rs:346`**

```rust
unsafe fn schedule<S: Schedule>(ptr: NonNull<Header>) {
    let scheduler = Header::get_scheduler::<S>(ptr);   // offset into Cell, no alloc
    scheduler.as_ref().schedule(Notified(Task::from_raw(ptr.cast())));
}
```

`Header::get_scheduler` uses a compile-time-computed byte offset (stored in the `Vtable`) to reach the `S` field in the `Cell<T, S>` allocation — which for the multi-thread runtime is an `Arc<multi_thread::Handle>`.

---

## 8. Into the scheduler — `Schedule::schedule` for the multi-thread handle

**`scheduler/multi_thread/handle.rs:110`**

```rust
fn schedule(&self, task: Notified<Self>) {
    self.schedule_task(task, false);
}
```

**`worker.rs:1327`** — `schedule_task` runs two paths based on whether we are already on a worker thread of *this* runtime:

**Path A — same-thread wakeup** (the common case when an I/O driver worker wakes itself):

```rust
if let Some(cx) = maybe_cx {
    if self.ptr_eq(&cx.worker.handle) {
        if let Some(core) = cx.core.borrow_mut().as_mut() {
            self.schedule_local(core, task, is_yield);
            return;
        }
    }
}
```

`schedule_local` (line 1353) pushes the `Notified` into either the **LIFO slot** (`core.lifo_slot`) or the worker's **local run queue** (`core.run_queue`) — a Chase-Lev work-stealing deque. Because this is happening from the same thread that holds the driver, `core.park` is `None` at this point (the worker is inside `turn`, not sleeping), so no extra notification is sent. The task will be picked up on the next scheduler iteration.

**Path B — cross-thread wakeup** (another thread or a resource driver on a different core):

```rust
self.push_remote_task(task);      // line 1341 — injects into global inject queue
self.notify_parked_remote();      // line 1342 — unparks a sleeping worker
```

`push_remote_task` (line 1397) locks `shared.synced.inject` and pushes the `Notified` onto the injector queue (an MPSC linked list).

`notify_parked_remote` (line 1453) finds one idle worker via `shared.idle.worker_to_notify` and calls `remote.unpark.unpark(&self.driver)`. This writes a byte to the mio `Waker` pipe/eventfd that the parked worker is sleeping on, causing its `epoll_wait` / `kqueue` to return. The sleeping worker wakes, sees the inject queue is non-empty, drains `Notified` tasks from it and runs them.

---

## Summary of the full chain

```
epoll_wait returns
  └─ Driver::turn (io/driver.rs:179)
       └─ for each mio event:
            ├─ ScheduledIo::set_readiness  (scheduled_io.rs:207)
            │    atomically OR ready bits into readiness word, bump tick
            └─ ScheduledIo::wake           (scheduled_io.rs:236)
                 └─ collect Wakers from waiters.reader / .writer / .list
                 └─ WakeList::wake_all     (util/wake_list.rs:65)
                      └─ Waker::wake  →  wake_by_val (task/waker.rs:93)
                           └─ RawTask::wake_by_val   (task/harness.rs:68)
                                └─ transition_to_notified_by_val (CAS on task state)
                                └─ RawTask::schedule (task/raw.rs:346)
                                     └─ Schedule::schedule on Arc<multi_thread::Handle>
                                          └─ Handle::schedule_task (worker.rs:1327)
                                               ├─ [same thread] schedule_local → LIFO slot or run_queue
                                               └─ [cross thread] push inject queue + unpark a worker
```

A few design details worth noting:

- **No lookup table** — the mio token *is* the raw `*ScheduledIo` pointer, so dispatch is O(1) with no map traversal.
- **Lock is released before waking** — `ScheduledIo::wake` drops the `Mutex<Waiters>` before calling any `Waker::wake`, preventing re-entrant deadlock.
- **Batched wakeup** — the `WakeList` (32 slots) avoids calling `wake()` under the lock; if there are >32 waiters it loops (lock → fill → unlock → wake) until drained.
- **NOTIFIED bit idempotency** — the CAS in `transition_to_notified_by_val` guarantees a task in the queue is never enqueued twice even if multiple I/O events arrive before the task runs.
- **LIFO slot** — if the wakeup lands on the same worker thread, the task goes into a single-slot bypass ahead of the deque, reducing cache miss latency for the common ping-pong pattern (write to socket → wake reader on same thread).


## Final answer

_Result event — success, 100 s, 18 turns._

Now I have a complete picture. Let me write the walkthrough.

---

Here is the end-to-end sequence, in order, with exact file locations.

---

## 1. The system poll call — `Driver::turn`

**`tokio/src/runtime/io/driver.rs:179`** — `turn()` is the reactor's main loop body. It is called from `park` / `park_timeout` on each scheduler iteration when a worker goes idle. It calls:

```rust
self.poll.poll(events, max_wait)   // line 188
```

`mio::Poll::poll` is a thin wrapper around `epoll_wait` / `kqueue` / `IOCP`. It blocks until at least one event arrives (or the timeout expires) and fills `self.events`.

---

## 2. Iterating ready events — still inside `turn`

**`driver.rs:201–222`** — For every event returned by `mio`:

```rust
for event in events.iter() {
    let token = event.token();
    // ... wakeup/signal tokens skipped ...
    let ready = Ready::from_mio(event);                    // convert mio flags → tokio Ready
    let ptr = super::EXPOSE_IO.from_exposed_addr(token.0); // recover raw *ScheduledIo
    let io: &ScheduledIo = unsafe { &*ptr };

    io.set_readiness(Tick::Set, |curr| curr | ready);      // (1) update readiness
    io.wake(ready);                                         // (2) wake waiters
}
```

The token stored in mio's registry is the raw address of a `ScheduledIo` (set in `ScheduledIo::token()` at **`scheduled_io.rs:188`**), so there is no lookup — the token *is* the pointer.

---

## 3. Updating readiness — `ScheduledIo::set_readiness`

**`scheduled_io.rs:207`**

The 32-bit `readiness` atomic packs three fields:
- bits 0–15: ready flags (readable, writable, read-closed, write-closed, …)
- bits 16–30: a 15-bit driver tick counter
- bit 31: shutdown flag

`set_readiness(Tick::Set, |curr| curr | ready)` does a CAS loop that OR-s the new ready bits in and increments the tick by one. The tick is what lets `clear_readiness` later distinguish a stale "please clear" from an event that arrived after the clear.

---

## 4. Waking waiters — `ScheduledIo::wake`

**`scheduled_io.rs:236`**

There are two waiter lists on each `ScheduledIo`:

- `waiters.reader` / `waiters.writer` — a single `Option<Waker>` slot each, used by the `poll_read_ready` / `poll_write_ready` poll-based path (`AsyncRead` / `AsyncWrite`).
- `waiters.list` — an intrusive linked list of `Waiter` nodes, one per pending `readiness().await` call (`async_io` / `AsyncFd`).

`wake` acquires the `Mutex<Waiters>` lock, drains any wakers whose interest overlaps `ready` into a `WakeList` (a stack-local array of 32 wakers), releases the lock, and then calls `wakers.wake_all()`. If there are more than 32 matching waiters the loop repeats (re-acquires lock, fills array, releases, wakes) until drained.

The lock is dropped before any `waker.wake()` is called, avoiding a potential deadlock if the waker's `wake` re-enters the reactor.

---

## 5. Waker identity — `WakeList::wake_all` → `Waker::wake`

**`util/wake_list.rs:65–72`** — Each `waker.wake()` call dispatches through the `RawWakerVTable` that was installed when the task's waker was created. For tasks managed by Tokio's runtime the vtable entry is at **`task/waker.rs:93`**:

```rust
unsafe fn wake_by_val(ptr: *const ()) {
    let ptr = NonNull::new_unchecked(ptr as *mut Header);
    let raw = RawTask::from_raw(ptr);
    raw.wake_by_val();
}
```

The `ptr` field of the waker *is* the `NonNull<Header>` pointer to the task allocation.

---

## 6. Task state transition — `RawTask::wake_by_val`

**`task/harness.rs:68`**

```rust
pub(super) fn wake_by_val(&self) {
    match self.state().transition_to_notified_by_val() {
        TransitionToNotifiedByVal::Submit => {
            self.schedule();        // creates Notified, calls Schedule::schedule
            self.drop_reference();
        }
        TransitionToNotifiedByVal::Dealloc => { self.dealloc(); }
        TransitionToNotifiedByVal::DoNothing => {}
    }
}
```

`transition_to_notified_by_val` is an atomic CAS on the task state word that sets the `NOTIFIED` bit. If the task was already `NOTIFIED` or `RUNNING` the transition returns `DoNothing` — the wake is absorbed without pushing to the queue a second time. Only if the bit was not already set does it return `Submit`, which means "you must push this task to the scheduler".

---

## 7. Routing to the scheduler — `raw.rs::schedule`

**`task/raw.rs:346`**

```rust
unsafe fn schedule<S: Schedule>(ptr: NonNull<Header>) {
    let scheduler = Header::get_scheduler::<S>(ptr);   // offset into Cell, no alloc
    scheduler.as_ref().schedule(Notified(Task::from_raw(ptr.cast())));
}
```

`Header::get_scheduler` uses a compile-time-computed byte offset (stored in the `Vtable`) to reach the `S` field in the `Cell<T, S>` allocation — which for the multi-thread runtime is an `Arc<multi_thread::Handle>`.

---

## 8. Into the scheduler — `Schedule::schedule` for the multi-thread handle

**`scheduler/multi_thread/handle.rs:110`**

```rust
fn schedule(&self, task: Notified<Self>) {
    self.schedule_task(task, false);
}
```

**`worker.rs:1327`** — `schedule_task` runs two paths based on whether we are already on a worker thread of *this* runtime:

**Path A — same-thread wakeup** (the common case when an I/O driver worker wakes itself):

```rust
if let Some(cx) = maybe_cx {
    if self.ptr_eq(&cx.worker.handle) {
        if let Some(core) = cx.core.borrow_mut().as_mut() {
            self.schedule_local(core, task, is_yield);
            return;
        }
    }
}
```

`schedule_local` (line 1353) pushes the `Notified` into either the **LIFO slot** (`core.lifo_slot`) or the worker's **local run queue** (`core.run_queue`) — a Chase-Lev work-stealing deque. Because this is happening from the same thread that holds the driver, `core.park` is `None` at this point (the worker is inside `turn`, not sleeping), so no extra notification is sent. The task will be picked up on the next scheduler iteration.

**Path B — cross-thread wakeup** (another thread or a resource driver on a different core):

```rust
self.push_remote_task(task);      // line 1341 — injects into global inject queue
self.notify_parked_remote();      // line 1342 — unparks a sleeping worker
```

`push_remote_task` (line 1397) locks `shared.synced.inject` and pushes the `Notified` onto the injector queue (an MPSC linked list).

`notify_parked_remote` (line 1453) finds one idle worker via `shared.idle.worker_to_notify` and calls `remote.unpark.unpark(&self.driver)`. This writes a byte to the mio `Waker` pipe/eventfd that the parked worker is sleeping on, causing its `epoll_wait` / `kqueue` to return. The sleeping worker wakes, sees the inject queue is non-empty, drains `Notified` tasks from it and runs them.

---

## Summary of the full chain

```
epoll_wait returns
  └─ Driver::turn (io/driver.rs:179)
       └─ for each mio event:
            ├─ ScheduledIo::set_readiness  (scheduled_io.rs:207)
            │    atomically OR ready bits into readiness word, bump tick
            └─ ScheduledIo::wake           (scheduled_io.rs:236)
                 └─ collect Wakers from waiters.reader / .writer / .list
                 └─ WakeList::wake_all     (util/wake_list.rs:65)
                      └─ Waker::wake  →  wake_by_val (task/waker.rs:93)
                           └─ RawTask::wake_by_val   (task/harness.rs:68)
                                └─ transition_to_notified_by_val (CAS on task state)
                                └─ RawTask::schedule (task/raw.rs:346)
                                     └─ Schedule::schedule on Arc<multi_thread::Handle>
                                          └─ Handle::schedule_task (worker.rs:1327)
                                               ├─ [same thread] schedule_local → LIFO slot or run_queue
                                               └─ [cross thread] push inject queue + unpark a worker
```

A few design details worth noting:

- **No lookup table** — the mio token *is* the raw `*ScheduledIo` pointer, so dispatch is O(1) with no map traversal.
- **Lock is released before waking** — `ScheduledIo::wake` drops the `Mutex<Waiters>` before calling any `Waker::wake`, preventing re-entrant deadlock.
- **Batched wakeup** — the `WakeList` (32 slots) avoids calling `wake()` under the lock; if there are >32 waiters it loops (lock → fill → unlock → wake) until drained.
- **NOTIFIED bit idempotency** — the CAS in `transition_to_notified_by_val` guarantees a task in the queue is never enqueued twice even if multiple I/O events arrive before the task runs.
- **LIFO slot** — if the wakeup lands on the same worker thread, the task goes into a single-slot bypass ahead of the deque, reducing cache miss latency for the common ping-pong pattern (write to socket → wake reader on same thread).

