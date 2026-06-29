# transcript: I'm planning a change to how a task that is parked waiting on both a socket read and a timeout gets resumed, so I need to understand the full journey of such...


💬 I'll load the grove tools and do a thorough structural exploration of the runtime, I/O reactor, timer, and task scheduling code to trace this end-to-end.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map,mcp__grove__callers,mcp__grove__definition)

💬 Now let me explore the key subsystems in parallel — the runtime scheduler, driver, time, and task modules.
  ▸ mcp__grove__map({"dir":"tokio/src/runtime"})
  ▸ mcp__grove__map({"dir":"tokio/src/time"})
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime -name "*.rs" | sort)

💬 Good. Now let me drill into the critical files in parallel — the combined driver, I/O driver, timer, worker park loop, task waker, and time entry.
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/driver.rs"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/io/driver.rs"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/io/scheduled_io.rs"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/time/mod.rs"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/time/entry.rs"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/task/waker.rs"})

💬 Now let me read the key implementation bodies in parallel — the combined driver park, the I/O driver turn loop, ScheduledIo poll_readiness and wake, timer en...
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/mod.rs#park_internal@213"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/driver.rs#turn@179"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/scheduled_io.rs#poll_readiness@303"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/scheduled_io.rs#wake@236"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/waker.rs#wake_by_val@93"})

💬 Now let me read the timer entry's poll/fire, the multi-thread worker park loop, and the raw task wake.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/entry.rs#poll_elapsed@535"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/entry.rs#fire@614"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/mod.rs#process_at_time@296"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/scheduler/multi_thread/worker.rs"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/task/harness.rs"})

💬 Let me read the worker run loop, park method, harness wake, Sleep::poll_elapsed, and the IO registration.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/worker.rs#run@561"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/worker.rs#park_internal@844"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/harness.rs#wake_by_val@68"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/time/sleep.rs#poll_elapsed@391"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/scheduled_io.rs#poll@427"})

💬 Let me get two more pieces: the StateCell::poll (timer waker storage), the schedule method (task -> queue), and the driver.rs park method.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/entry.rs#poll@142"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/entry.rs#fire@211"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/driver.rs#park@66"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/worker.rs#schedule_task@1327"})

💬 Let me check the multi-thread park unpark and how notify_parked_remote unblocks the OS thread.
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/scheduler/multi_thread/park.rs"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/worker.rs#notify_parked_remote@1453"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/entry.rs#init@481"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/park.rs#park@132"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/park.rs#park_driver@228"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/scheduler/multi_thread/park.rs#unpark@277"})

💬 Let me check the I/O driver's unpark and the timer wheel's `reregister`/`poll` briefly.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/io/driver.rs#unpark@258"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/time/mod.rs#reregister@398"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/time/wheel/mod.rs"})

💬 Now I have the full picture. Here is the complete end-to-end walkthrough.  ---  ## Full journey: a task waiting on a socket read and a timeout  The canonical...

──────── RESULT (success, 210910ms, 39 turns) ────────
Now I have the full picture. Here is the complete end-to-end walkthrough.

---

## Full journey: a task waiting on a socket read and a timeout

The canonical example is `select! { result = socket.read(...) => ..., _ = sleep(duration) => ... }`. The two halves are polled together every time the future is polled.

---

### 1. Spawning — task allocation and first schedule

`tokio::spawn` allocates a heap block containing a `Header`, a `Core<T, S>` (which holds the `Future` itself and the `Schedule` handle), and a `Trailer` (output slot + join waker). The `Header` contains an atomic `State` word that tracks whether the task is idle, running, or notified. A `Notified` token is pushed into the scheduler's run queue (local if called from a worker context, otherwise the global inject queue).

---

### 2. Worker picks up the task and polls it

Each worker OS thread runs `Context::run` (`multi_thread/worker.rs:561`):

```
loop {
    core.tick();
    core = self.maintenance(core);
    if let Some(task) = core.next_task() { run_task(task); continue; }
    if let Some(task) = core.steal_work() { run_task(task); continue; }
    core = self.park(core);
}
```

`run_task` → `Harness::poll` → `poll_future` calls `Future::poll` on the task with a `Context` whose `Waker` is backed by the task's `Header` pointer. The `RawWakerVTable` hooks (`wake_by_val`, `wake_by_ref`) are what will eventually reschedule this task.

---

### 3a. The socket parks the task

Polling a `TcpStream` read ultimately calls `ScheduledIo::poll_readiness` (`runtime/io/scheduled_io.rs:303`). If no bytes are available yet, the atomic `readiness` field is empty, so:

1. The lock on `waiters` is acquired.
2. `cx.waker().clone()` is stored in `waiters.reader` (for the read direction).
3. The atomic is re-checked under the lock (standard Mutex+atomic two-phase check).
4. Returns `Poll::Pending`.

The underlying fd was already registered with mio/epoll at socket creation via `Handle::add_source` (`io/driver.rs:266`). Mio stored the `ScheduledIo` pointer (cast to `usize`) as the epoll token, so when the kernel reports readiness, this exact object is found.

---

### 3b. The timer parks the task

Polling `Sleep::poll` calls `poll_elapsed` (`time/sleep.rs:391`). On the first call, there is no `TimerEntry` yet, so one is created and then:

1. `TimerEntry::init` (`time/entry.rs:481`) converts the deadline to a 1-ms-resolution tick and calls `Handle::reregister`.

2. `Handle::reregister` (`time/mod.rs:398`) acquires the **timer driver mutex**, inserts the entry into the `Wheel` at the right slot, then — critically — if the new deadline is *earlier* than the current `next_wake`, calls `unpark.unpark()` on the I/O handle. This sends a byte to the eventfd/wakeup pipe so the worker sleeping in `epoll_wait` wakes up and recomputes its timeout.

3. Back in `TimerEntry::poll_elapsed` (`time/entry.rs:535`), `self.inner.state.poll(cx.waker())` is called. `StateCell::poll` (`time/entry.rs:142`) registers the waker into an `AtomicWaker` and reads the state: it is still `Pending`, so it returns `Poll::Pending`.

**After step 3, two copies of the same `Waker` are parked in two different places:** one in `ScheduledIo::waiters.reader`, one in `StateCell`'s `AtomicWaker`. Whichever resource becomes ready first will call `.wake()` on its copy.

---

### 4. The worker thread enters the driver stack

After `run_task` returns `Poll::Pending` and the run queues are exhausted, `Context::run` calls `self.park(core)` → `park_internal` (`worker.rs:844`):

1. The `Parker` is taken out of `Core` and `core` is stored in TLS.
2. `park.park(&self.worker.handle.driver)` is called.

`Parker::park` → `Inner::park` (`park.rs:132`):
- First checks for a pending notification (`compare_exchange(NOTIFIED, EMPTY)`).
- Then races to acquire the **driver mutex** (`self.shared.driver.try_lock()`).

**Only one worker thread at a time holds the driver.** All others fall through to `park_condvar`, blocking on a `Condvar`. The winner calls `park_driver` (`park.rs:228`), sets the atomic state to `PARKED_DRIVER`, then calls:

```
driver.park(handle)   // or park_timeout
```

This is `runtime::driver::Driver::park` → the time driver's `park` → `park_internal` (`time/mod.rs:213`):

1. Queries `wheel.next_expiration_time()` — the soonest pending timer tick.
2. Computes `duration = time_source.tick_to_duration(soonest - now)`.
3. Calls `self.park.park_timeout(rt_handle, duration)` on the **I/O driver** (the inner `IoStack`).

`io::Driver::park_timeout` → `io::Driver::turn` (`io/driver.rs:179`) calls:

```rust
self.poll.poll(events, max_wait)
```

This is `mio::Poll::poll` → **`epoll_wait(fd, events, max_wait_ms)`** on Linux. The OS thread is now blocked, waiting for whichever happens first: a socket event, the timer timeout, or an explicit wakeup write.

---

### 5a. The socket becomes readable first

1. The kernel delivers a read event on the socket's fd. `epoll_wait` returns.

2. `io::Driver::turn` iterates the events. For the socket's token, it recovers the `ScheduledIo` pointer:
   ```rust
   io.set_readiness(Tick::Set, |curr| curr | ready);  // updates atomic
   io.wake(ready);
   ```

3. `ScheduledIo::wake` (`scheduled_io.rs:236`):
   - Locks `waiters`.
   - Takes `waiters.reader` (the stored task waker), pushes it into a `WakeList`.
   - Drops the lock.
   - Calls `waker.wake()` on each entry in the list.

4. `waker.wake()` → `wake_by_val` (`waker.rs:93`) → `RawTask::wake_by_val` (`harness.rs:68`):
   - Calls `state.transition_to_notified_by_val()`.
   - If the task was Idle→Submit: calls `self.schedule()` → `Handle::schedule_task` (`worker.rs:1327`).
   - `schedule_task` checks whether we're on a worker thread with a `Core` available:
     - **Yes**: `schedule_local` → pushes to the LIFO slot or local run queue.
     - **No** (we're in the driver loop, no user core held right now): `push_remote_task` → injects into the global inject queue, then `notify_parked_remote`.

5. `notify_parked_remote` (`worker.rs:1453`) finds an idle worker and calls `remote.unpark.unpark(&self.driver)` → `Inner::unpark` (`park.rs:277`). Since the *current* thread holds the driver (`PARKED_DRIVER`), the swap writes `NOTIFIED` and then calls `driver.unpark()` → `io::Handle::unpark` → writes to the eventfd, waking `epoll_wait` immediately if we are calling from a different thread — but in the timer-expired path this happens on the same thread, after `epoll_wait` already returned.

6. Control returns back up: `epoll_wait` → `io::Driver::turn` finishes, returns to `time::Driver::park_internal`, which then calls `handle.process(clock)` → `process_at_time` to fire any expired timers (possibly none yet). Then returns through the driver stack.

7. `Parker::park_driver` swaps state back to `EMPTY` and returns. Back in `park_internal` (`worker.rs:844`), `core` is retrieved from TLS, `park` put back, `core.had_driver = HadDriver::Yes`.

8. The `while !core.is_shutdown` loop iterates: `core.next_task()` finds the task (either from the LIFO slot or local run queue), dequeues the `Notified`, and calls `run_task`.

9. The task's future is polled again. Polling the socket read now calls `poll_readiness` → the atomic `readiness` is set → returns `Poll::Ready(ReadyEvent {...})`. Polling the sleep future calls `StateCell::poll` which sees the timer still `Pending` → returns `Poll::Pending`. Since the select arm with the socket is ready, the task proceeds to completion.

---

### 5b. The timer fires first (timeout path)

1. `epoll_wait` blocks for exactly `duration` ms with no I/O events. It returns with an empty event list (timeout).

2. `io::Driver::turn` iterates zero events and returns.

3. `time::Driver::park_internal` calls `handle.process(clock)` → `process_at_time` (`time/mod.rs:296`):
   ```rust
   while let Some(entry) = lock.wheel.poll(now) {
       if let Some(waker) = unsafe { entry.fire(Ok(())) } {
           waker_list.push(waker);
       }
   }
   // drop lock, then:
   waker_list.wake_all();
   ```

4. `TimerHandle::fire` (`time/entry.rs:614`) → `StateCell::fire` (`time/entry.rs:211`):
   - Writes the result (`Ok(())`) to the result cell.
   - Stores `STATE_DEREGISTERED` with Release ordering.
   - Calls `self.waker.take_waker()` — takes the stored `AtomicWaker` and returns the task waker.

5. `waker_list.wake_all()` calls `waker.wake()` on the timer's copy, going through the exact same `wake_by_val` → `schedule` path as the I/O case.

6. The task is rescheduled. On re-poll:
   - `TimerEntry::poll_elapsed` → `StateCell::poll` → `read_state` reads `STATE_DEREGISTERED` → returns `Poll::Ready(Ok(()))`.
   - The `Sleep` future returns `Poll::Ready(())`.
   - `select!` returns the timeout arm.
   - The socket read future is dropped, which removes the waker from `ScheduledIo::waiters` (via `Readiness::drop` or `Registration::deregister`).

---

### How the stages connect — the key structural relationships

```
Task waker (one copy)
    ├─► stored in ScheduledIo::waiters.reader     (I/O path)
    └─► stored in StateCell AtomicWaker            (timer path)
             │
             │ whichever fires first calls waker.wake()
             ▼
    RawTask::wake_by_val
    → state: Idle → Notified
    → Handle::schedule_task
         ├─ if on worker with core  → local run queue (LIFO slot)
         └─ otherwise               → inject queue + notify_parked_remote
                                              │
                                              └─► Unparker::unpark
                                                  → if PARKED_DRIVER: driver.unpark()
                                                     → io::Handle::unpark()
                                                        → writes to eventfd
                                                           → epoll_wait returns

Worker thread (the one with the driver):
  epoll_wait(fd, events, max_wait = soonest_timer_deadline)
       │ returns on: socket event OR timeout OR eventfd write
       ▼
  io::Driver::turn → for each event: ScheduledIo::wake()
  time::Driver::park_internal → handle.process() → wheel.poll() → entry.fire()
       │
       └─► waker.wake() → task enqueued → worker loop picks it up → re-poll
```

**The timer timeout and the I/O readiness both wake the same `epoll_wait` call** — the time driver computes the soonest-expiring timer tick and passes it as the `max_wait` to `mio::Poll::poll`. There is no separate timer thread; the I/O thread *is* the timer thread. The timer wheel is entirely in userspace; the OS only sees a single bounded `epoll_wait`.

**Driver contention:** one worker at a time owns the driver lock and runs the event loop; all others park on a condvar and are woken by `Unparker::unpark_condvar` when a notification arrives. This is why an external `waker.wake()` from another thread (e.g., a channel sender) calls `notify_parked_remote`, which unparks the sleeping worker via its `Unparker`, which either writes the eventfd (if the target is in `epoll_wait`) or signals the condvar (if it's waiting there).
