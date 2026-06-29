# transcript: I'm planning a change to how a task that is parked waiting on both a socket read and a timeout gets resumed, so I need to understand the full journey of such...


💬 I'll load the LSP tool and then do a structured walkthrough of the codebase, following each stage of the journey.
  ▸ ToolSearch(select:LSP)

💬 Let me explore the key symbols in parallel to map out the full architecture.
  ▸ LSP(Driver)
  ▸ LSP(Park)
  ▸ LSP(spawn)

💬 I need a file to anchor LSP queries. Let me find the key files first.
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime -name "*.rs" | sort | head -60)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src -name "driver*" -o -name "park*" | sort)

💬 Good, the key files are clear. Let me now read the most important ones in parallel.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/driver.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/park.rs)

💬 Now let me read the multi-thread park, scheduler worker, and I/O driver in parallel.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/park.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)

💬 Now let me look at `ScheduledIo` (waker storage for I/O), the time driver, and the task scheduling.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/time -name "*.rs" | sort)

💬 Now let me look at the time driver's park logic and the timer entry (waker storage), plus the worker loop.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/time/mod.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/time/entry.rs)

💬 Now let me check the multi-thread worker's run loop, and how tasks get spawned and polled.
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread -name "*.rs" | sort)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/task -name "*.rs" | sort | head -20)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)

💬 Now let me check how tasks get notified (the task waker → scheduler path) and how `tokio::spawn` works.
  ▸ LSP(schedule_local)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle.rs)
  ▸ LSP(schedule_task)
  ▸ Bash(grep -n "fn schedule_task\|fn schedule_option_task\|fn notify_parked" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle/metrics.rs /hom...)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)

💬 Let me quickly check the I/O registration to complete the socket read → waker path.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/registration.rs)

💬 I now have everything I need. Here is the complete, end-to-end walkthrough.  ---  ## Full journey of a task parked on a socket read and a timeout  ### Stage ...

──────── RESULT (success, 249473ms, 28 turns) ────────
I now have everything I need. Here is the complete, end-to-end walkthrough.

---

## Full journey of a task parked on a socket read and a timeout

### Stage 1: Spawning — allocate, bind, schedule the first notification

`tokio::spawn(future)` reaches `Handle::bind_new_task()` (`handle.rs:81`). The future is allocated on the heap and stored in `Shared::owned` (an `OwnedTasks` slab). `OwnedTasks::bind` returns both a `JoinHandle` and a `Notified<Arc<Handle>>` — a typed "this task has been notified and should be polled" token. That `Notified` is handed to `schedule_task()` (`worker.rs:1327`), which — if called from within a worker thread — puts it in the LIFO slot (`core.lifo_slot`) or the local run queue via `schedule_local()` (`worker.rs:1353`).

---

### Stage 2: First poll — the futures park themselves

`Context::run()` (`worker.rs:561`) is the main worker loop. It calls `next_task()` to dequeue the task and then `run_task()` (`worker.rs:630`), which unwraps the future harness and calls `task.run()`. That polls the outermost future under a cooperative budget.

Inside your combinator (e.g. `tokio::time::timeout`), two sub-futures are polled:

**Socket read future** — `TcpStream` holds a `Registration`, which holds an `Arc<ScheduledIo>`. Calling `poll_read()` → `Registration::poll_read_ready()` → `ScheduledIo::poll_readiness(cx, Direction::Read)` (`scheduled_io.rs:302`). If no data is available the method:
1. Locks `waiters`
2. Stores `cx.waker().clone()` into `waiters.reader`
3. Re-checks readiness under the lock (to close the TOCTOU window)
4. Returns `Poll::Pending`

The underlying mio file descriptor is already registered with the OS poller. The socket was registered when the `TcpStream` was created via `Handle::add_source()` (`io/driver.rs:263`), which called `mio::Registry::register()`, so the OS will produce an epoll/kqueue event when the socket becomes readable.

**Timer/sleep future** — A `Sleep` holds a pinned `TimerEntry`. On its first poll, `TimerEntry::init()` (`entry.rs:481`) converts the deadline to a tick and calls `Handle::reregister()` (`time/mod.rs:400`), which acquires the timer driver mutex and inserts a `TimerHandle` (a raw pointer to the pinned `TimerShared`) into the hashed timing wheel. The wheel's level/slot is determined by how many milliseconds away the deadline is. Then `poll_elapsed()` (`entry.rs:535`) calls `StateCell::poll(cx.waker())` (`entry.rs:142`), which calls `self.waker.register_by_ref(waker)` (stores the task's waker in an `AtomicWaker`), reads the state atomically, sees the timer has not fired, and returns `Poll::Pending`.

At this point the task's future has returned `Poll::Pending` to the runtime. The task is not on any run queue; its waker is stored in two places: `ScheduledIo::waiters.reader` and `TimerShared::state::waker`.

---

### Stage 3: The worker parks on the combined driver stack

After `run_task()` returns, the worker loop finds nothing else to run and reaches `Context::park()` (`worker.rs:810`). `transition_to_parked()` marks the worker idle. The inner loop calls `park_internal(core, None)` (`worker.rs:844`).

`park_internal()` does the following critically important shuffle:
1. **Moves the `Parker` out of `core`** → `core.park = None`
2. **Stores `core` back into the thread-local context** (`self.core.borrow_mut() = Some(core)`) — so the core remains accessible if a waker fires during the driver poll
3. Calls `park.park(&self.worker.handle.driver)`

**`Parker::park()` / `Inner::park()`** (`multi_thread/park.rs:132`): only one worker at a time can own the `Driver` — it is protected by `TryLock<Driver>`. The worker that wins the `try_lock()` calls `park_driver()` (`park.rs:228`):
- Sets `state = PARKED_DRIVER`
- Calls `driver.park(handle)` — delegating into the combined driver stack

**`Driver::park()`** (`runtime/driver.rs:66`) delegates to `TimeDriver::park()` which calls `time::Driver::park_internal()` (`time/mod.rs:213`):
1. Locks the `InnerState`, reads `wheel.next_expiration_time()`, updates `next_wake`, then **drops the lock**
2. If there is a pending timer: computes `duration = ticks_until_next_expiry → milliseconds` and calls `self.park.park_timeout(rt_handle, duration)` — this bounds how long the OS poll can sleep
3. If there are no pending timers: calls `self.park.park(rt_handle)` (indefinite sleep)

`IoStack::park_timeout()` calls `io::Driver::park_timeout()` → `turn(handle, Some(duration))` (`io/driver.rs:179`). The call that actually suspends the OS thread is:

```rust
self.poll.poll(events, max_wait)   // mio → epoll_wait / kevent / etc.
```

Workers that lost the `try_lock()` race call `park_condvar()` and block on a `Condvar`, waiting to be woken by `unpark_condvar()`.

---

### Stage 4a: The socket becomes readable first — I/O wake path

The OS delivers a `READABLE` event. `poll.poll()` returns. Back in `turn()` (`io/driver.rs:199`):

```rust
let token = event.token();                       // raw pointer to ScheduledIo
let io: &ScheduledIo = unsafe { &*ptr };
io.set_readiness(Tick::Set, |curr| curr | ready); // atomically update readiness bits
io.wake(ready);                                   // fire stored wakers
```

`ScheduledIo::wake(ready)` (`scheduled_io.rs:236`):
1. Acquires `waiters` lock
2. Takes out `waiters.reader` → gets the task's waker
3. Drops the lock
4. Calls `waker.wake()`

`waker.wake()` for a Tokio task calls back through the task harness vtable into `Arc<Handle>::schedule(task)` → `Handle::schedule_task()` → `schedule_local()`. Because this is happening **on the driver-holding worker thread** while `core` is accessible in the thread-local context, `schedule_local()` places the task in the core's LIFO slot. Note: `core.park.is_none()` at this point (the parker was moved out), so the comment at `worker.rs:1382` applies — "*notifications often come in batches; the notification is delayed until the park is complete*" — no `notify_parked_local()` is called here.

After `turn()` returns, control unwinds back through:
- `time::Driver::park_internal()` → calls `handle.process(clock)` (`time/mod.rs:255`) — this runs the timer wheel to fire any timers that expired while we slept, even if the socket won the race
- `IoStack::park_timeout()` → returns
- `time::Driver::park_internal()` → returns
- `Inner::park_driver()` swaps state back to `EMPTY`, returns `HadDriver::Yes`
- `park.park()` returns in `park_internal()`

Back in `park_internal()` (`worker.rs:894`):
- `self.defer.wake()` — processes any deferred wakes
- Recovers `core` from context
- Puts the parker back: `core.park = Some(park)`
- `core.had_driver = HadDriver::Yes`
- If `core.should_notify_others()`, calls `notify_parked_local()` to wake a condvar-parked peer

Back in `Context::park()`, `transition_from_parked()` checks for work. The LIFO slot is populated, so it returns `true` and the outer park loop exits.

---

### Stage 4b: The timeout fires first — timer wake path

If the timer expires before the socket, `poll()` returns after `duration` with zero socket events. `turn()` processes no socket events and returns. Then `time::Driver::park_internal()` calls `handle.process(clock)`:

```rust
// time/mod.rs:311
while let Some(entry) = lock.wheel.poll(now) {
    if let Some(waker) = unsafe { entry.fire(Ok(())) } {
        waker_list.push(waker);
    }
}
```

`wheel.poll(now)` walks the expired slots of the 6-level hashed timing wheel. For each expired entry it returns a `TimerHandle`. `entry.fire(Ok(()))` calls `StateCell::fire()` (`entry.rs:211`):
1. Writes `Ok(())` into the `result` cell
2. Stores `STATE_DEREGISTERED` to `state` with Release ordering (signals "done")
3. Calls `self.waker.take_waker()` — extracts the `Waker` that was stored by `StateCell::poll`

The waker is collected into `waker_list`. After dropping the driver lock, `waker_list.wake_all()` is called, which fires each waker — again routing through `Handle::schedule_task()` → task lands in the LIFO slot or run queue.

Meanwhile, `if reregister()` was called to insert a timer earlier than `next_wake`, it would have called `unpark.unpark()` (`time/mod.rs:431`) → `IoHandle::unpark()` → `mio::Waker::wake()` → writes to the waker fd, causing `poll()` to return early even if no real I/O events are ready (the `TOKEN_WAKEUP` branch at `io/driver.rs:204` handles this no-op wakeup).

---

### Stage 5: Task is rescheduled and polled again

After `park_internal()` returns, the worker is back in `Context::run()`. `next_task()` finds the task in the LIFO slot and hands it to `run_task()` → `task.run()` polls the future again.

**On re-poll of the socket future**: `ScheduledIo::poll_readiness()` loads `readiness` atomically. The bits are now set. It returns `Poll::Ready(ReadyEvent { tick, ready, .. })` immediately (fast path, no lock needed). The future clears the readiness via `clear_readiness()` (so the next poll starts fresh), reads data from the OS socket buffer, and returns `Poll::Ready(data)`.

**On re-poll of the timer future** (if the timeout fired): `StateCell::poll()` → `read_state()` reads `state` and sees `STATE_DEREGISTERED`. Returns `Poll::Ready(result)` immediately.

The combinator (`timeout` / `select!`) sees which arm is ready and propagates the result upward.

---

### How the two sides connect

The key design insight is that the **combined driver stack is a single lock**. There is one `Driver` (containing `TimeDriver { park: IoStack }`) protected by `TryLock` in `multi_thread/park.rs:Shared`. Only one worker at a time reaches the OS `epoll_wait`. That one worker computes the *minimum* of the next timer deadline and any caller-supplied duration, uses that as the `epoll_wait` timeout, and thus a single syscall covers both the I/O and timer cases. Whichever fires first causes `poll()` to return, and the worker immediately processes both channels: I/O events in `turn()` → `ScheduledIo::wake()`, and expired timers in `time::Driver::process()` → `wheel.poll()` → `entry.fire()`. Both paths end in `waker.wake()` → `schedule_task()` → task placed in run queue → polled again on the next worker loop iteration.

The wakers stored in `ScheduledIo::waiters.reader` and `TimerShared::state::waker` (an `AtomicWaker`) are the two registration sites your change would need to reason about.
