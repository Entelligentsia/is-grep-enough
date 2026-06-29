# transcript: I'm planning a change to how a task that is parked waiting on both a socket read and a timeout gets resumed, so I need to understand the full journey of such...


💬 I'll explore the relevant subsystems in parallel to map out the full flow before synthesizing it.

  ▸ Agent(Explore Tokio task spawn and scheduling flow)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/tokio -type f -name "*.rs" | grep -E "(task|runtime)" | head -30)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/task -type f -name "*.rs" | sort)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime -type f -name "*.rs" | sort)
      ↳ Read(/home/bench/repos/tokio/tokio/src/task/spawn.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/task/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/core.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/core.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/raw.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/waker.rs)
      ↳ Bash(grep -r "fn spawn" /home/bench/repos/tokio/tokio/src/runtime/context/*.rs | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/context/runtime_mt.rs)
      ↳ Bash(grep -r "pub fn spawn" /home/bench/repos/tokio/tokio/src/runtime --include="*.rs" | grep -v test)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/handle.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/handle.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle.rs)
      ↳ Bash(grep -n "fn bind" /home/bench/repos/tokio/tokio/src/runtime/task/list.rs | head -5)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/list.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Bash(grep -n "fn run_task" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/state.rs)
      ↳ Bash(grep -n "fn schedule_task\|schedule_option_task" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle.rs)
      ↳ Bash(grep -n "fn schedule" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle.rs | head -20)
      ↳ Bash(grep -rn "fn schedule_task\|fn schedule_option_task" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread --include="*.rs")
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Bash(grep -n "fn park\|pub fn run" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/task/join.rs)
      ↳ ⟹ returned to parent


  ▸ Agent(Explore Tokio I/O reactor and socket read registration)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/tokio -type f -name "*.rs" | grep -E "(stream|registration|driver|io)" | head -20)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src -type f -name "stream.rs")
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime/io -type f -name "*.rs")
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/io -type f -name "*.rs" | head -10)
      ↳ Read(/home/bench/repos/tokio/tokio/src/net/tcp/stream.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/net/tcp/stream.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/io -name "*.rs" -type f | xargs grep -l "PollEvented")
      ↳ Read(/home/bench/repos/tokio/tokio/src/io/poll_evented.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/registration.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
      ↳ Bash(grep -n "fn turn\|fn poll" /home/bench/repos/tokio/tokio/src/runtime/io/driver.rs | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/io/poll_evented.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/io/async_read.rs)
      ↳ Bash(grep -n "impl.*AsyncRead" /home/bench/repos/tokio/tokio/src/net/tcp/stream.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/net/tcp/stream.rs)
      ↳ Bash(grep -n "poll_read_priv\|poll_write_priv" /home/bench/repos/tokio/tokio/src/net/tcp/stream.rs | head -5)
      ↳ Read(/home/bench/repos/tokio/tokio/src/net/tcp/stream.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs)
      ↳ Bash(grep -n "impl.*Direction\|fn mask" /home/bench/repos/tokio/tokio/src/runtime/io/driver.rs | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/io -name "ready.rs" -o -name "ready*")
      ↳ Read(/home/bench/repos/tokio/tokio/src/io/ready.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/io -name "interest.rs")
      ↳ Read(/home/bench/repos/tokio/tokio/src/io/interest.rs)
      ↳ Bash(grep -n "fn wake" /home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs | head -5)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
      ↳ Bash(grep -n "struct ScheduledIo\|struct Registration\|pub struct TcpStream" /home/bench/repos/tokio/tokio/src/net/tcp/stream.rs /home/bench/repos/tokio/tokio/src...)
      ↳ ⟹ returned to parent


  ▸ Agent(Explore Tokio timer wheel and timeout waker)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/tokio -type f -name "*.rs" | grep -E "(time|timer)" | head -20)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/time -type f -name "*.rs" | sort)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime/time -type f -name "*.rs" | sort)
      ↳ Read(/home/bench/repos/tokio/tokio/src/time/sleep.rs)
      ↳ Bash(grep -r "pub struct Timer" /home/bench/repos/tokio/tokio/src --include="*.rs")
      ↳ Bash(grep -r "struct Timer" /home/bench/repos/tokio/tokio/src/runtime --include="*.rs")
      ↳ Bash(grep -r "^pub use.*Timer" /home/bench/repos/tokio/tokio/src/runtime --include="*.rs")
      ↳ Bash(grep -r "pub.*Timer" /home/bench/repos/tokio/tokio/src --include="*.rs" | grep "use\|type" | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/mod.rs)
      ↳ Bash(grep -n "Timer" /home/bench/repos/tokio/tokio/src/time/sleep.rs | head -20)
      ↳ Bash(grep -r "pub use.*time_alt.*Timer\|pub.*struct Timer\|pub.*type Timer" /home/bench/repos/tokio/tokio/src/runtime --include="*.rs" -A 2)
      ↳ Bash(grep -n "pub.*Timer" /home/bench/repos/tokio/tokio/src/runtime/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/entry.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/wheel/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/wheel/level.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/handle.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/time/timeout.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/source.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src -name "*.rs" -path "*/sync/*" | xargs grep -l "AtomicWaker" | head -1)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src -name "*.rs" | xargs grep -l "pub.*struct AtomicWaker" | head -1)
      ↳ Read(/home/bench/repos/tokio/tokio/src/sync/task/atomic_waker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/sync/task/atomic_waker.rs)
      ↳ Bash(grep -n "pub fn poll_at\|fn poll\|impl.*Future for Sleep" /home/bench/repos/tokio/tokio/src/time/sleep.rs | head -30)
      ↳ ⟹ returned to parent


  ▸ Agent(Explore Tokio combined driver and worker thread parking)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/tokio -type f -name "*.rs" | grep -E "(driver|park|worker)" | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/driver.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/park.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/park.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Bash(grep -n "park\|Park\|PARK" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs | head -40)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime/time -name "*.rs" | head -15)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/time/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
      ↳ Bash(grep -n "pub(crate) fn turn\|pub(crate) fn park" /home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Bash(grep -n "transition_to_parked\|transition_from_parked\|is_searching\|steal_work" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs |...)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Bash(grep -n "pub(crate) fn notify_parked_local\|pub(crate) fn notify_if_work_pending\|pub(crate) fn unpark" /home/bench/repos/tokio/tokio/src/runtime/scheduler/m...)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread -name "*.rs" | xargs grep -l "notify_parked_local")
      ↳ Bash(grep -n "notify_parked_local\|notify_if_work_pending" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime -name "signal.rs" | xargs grep -n "pub(crate) fn park\|pub(crate) fn park_timeout" | head -10)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime -name "process.rs" | head -5)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/process.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/signal.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime -type d -name signal)
      ↳ Bash(ls -la /home/bench/repos/tokio/tokio/src/runtime/signal/)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/signal/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/park.rs)
      ↳ Bash(grep -n "struct Remote" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Bash(grep -n "next_expiration_time\|next_wake" /home/bench/repos/tokio/tokio/src/runtime/time/mod.rs | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/driver.rs)
      ↳ Bash(find /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread -name "*.rs" | xargs grep -l "idle")
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/idle.rs)
      ↳ ⟹ returned to parent


💬 Here is the full end-to-end journey, stage by stage.  ---  ## Stage 1 — Spawn: task allocation and initial queuing  `tokio::spawn` calls into the multi-threa...

──────── RESULT (success, 242702ms, 5 turns) ────────
Here is the full end-to-end journey, stage by stage.

---

## Stage 1 — Spawn: task allocation and initial queuing

`tokio::spawn` calls into the multi-thread scheduler's `Handle::bind_new_task` (`runtime/scheduler/multi_thread/handle.rs:65`). That calls `OwnedTasks::bind`, which heap-allocates a single `Cell<T,S>` (`runtime/task/core.rs:126`) with three packed sections:

- **`Header`** — atomic `State` bitfield, `queue_next` pointer for the injection queue, and a `&'static Vtable` of function pointers.
- **`Core`** — the scheduler handle, task ID, and the `CoreStage` union holding either the live `Future` or its finished output.
- **`Trailer`** — intrusive list pointers for `OwnedTasks`, the join-handle waker slot, and schedule hooks.

`bind` yields three refcounted handles: one owned by `OwnedTasks`, one `Notified` token sent into the run queue, and one `JoinHandle` returned to the caller. Initial `State` (`state.rs:61`) is `(REF_ONE * 3) | JOIN_INTEREST | NOTIFIED` — three refcounts, the join-interest flag, and the `NOTIFIED` bit already set.

The `Notified` is pushed to the spawning worker's LIFO slot or local queue; if spawned from outside a worker it goes to the global injection queue (`worker.rs:1327–1385`). Any parked worker is nudged via `notify_parked_local`.

---

## Stage 2 — The worker picks it up and calls `poll`

Worker threads run a loop (`worker.rs:561`) that drains the local queue, then steals from others, then parks. When the task is dequeued, `run_task` (`worker.rs:630`) converts the `Notified` into a `LocalNotified` (asserting same-thread ownership) and calls `task.run()`.

Inside `Harness::poll` (`task/harness.rs:138`):

1. `state.transition_to_running()` CAS-clears `NOTIFIED` and sets `RUNNING`.
2. A `Waker` is constructed from `waker_ref(&header_ptr)` (`task/waker.rs`). The waker's `data` pointer is the raw `Header *`; its vtable's `wake_by_val`/`wake_by_ref` will, when called, do `state → NOTIFIED` and push the header back into the scheduler's queue.
3. The future is polled with that `Context`.

---

## Stage 3 — `timeout(duration, read)` parks on both the socket and the timer

The user's future is something like `timeout(dur, stream.read_buf(&mut buf))`. When polled, `Timeout::poll` (`time/timeout.rs:205`) first polls the inner future, then polls its embedded `Sleep`.

### Socket registration (I/O side)

`TcpStream::poll_read` delegates through `PollEvented::poll_read` → `Registration::poll_read_ready` → `ScheduledIo::poll_readiness` (`runtime/io/scheduled_io.rs:303`).

`ScheduledIo` holds:
- An `AtomicUsize readiness` packed field (shutdown:1 | tick:15 | ready:16 bits).
- A `Mutex<Waiters>` containing dedicated `reader: Option<Waker>` and `writer: Option<Waker>` slots plus a linked list for more complex interest registrations.

If no readable bits are set, `poll_readiness` takes the `Waiters` lock, stores `cx.waker().clone()` into `waiters.reader`, re-checks readiness (to close the race), and returns `Poll::Pending`. This waker is a clone of the task's `Waker` from Stage 2.

The `TcpStream`'s underlying `mio::TcpStream` was registered with mio on creation via `Handle::add_source` (`runtime/io/driver.rs:266`), which called `registry.register(source, token, interest)`. The token encodes the pointer to the `ScheduledIo`.

### Timer registration (time side)

`Sleep::poll_elapsed` (`time/sleep.rs:391`) lazily creates a `TimerEntry` on first poll. `TimerEntry::init` converts the `Instant` deadline to a millisecond tick via `time_source.deadline_to_tick(deadline)` and calls `handle.reregister(&io_handle, tick, entry_ptr)` (`runtime/time/mod.rs`).

`reregister` locks the time driver, calls `wheel.insert(entry)` which places the `TimerShared` node into the appropriate level and slot of the hierarchical timing wheel (`runtime/time/wheel/mod.rs`):
- 6 levels × 64 slots each, covering 1 ms up to ~2 years.
- The entry becomes an intrusive linked-list node at `levels[level].slot[slot]`.

Immediately before returning `Pending`, `Sleep::poll_elapsed` also calls `StateCell::poll(cx.waker())` which stores the task's waker into the `AtomicWaker` inside `TimerShared::StateCell`.

After both polls, the task has deposited its waker in **two places**: `ScheduledIo::Waiters::reader` and `TimerShared::StateCell::waker`. The future returns `Poll::Pending` to the harness.

---

## Stage 4 — Harness releases the task; worker searches for more work

Back in `Harness::poll`, the `Poll::Pending` result causes `state.transition_to_idle()` (`task/state.rs:151`). This CAS clears `RUNNING`. If another thread sneaked in a `NOTIFIED` bit during the poll, `transition_to_idle` detects it and returns `OkNotified`, meaning the task is immediately re-queued. Otherwise the task is truly idle — pinned to the `OwnedTasks` list, waiting to be notified.

The worker loops back to look for more tasks. Eventually it finds nothing and calls `park`.

---

## Stage 5 — Worker thread parks on the combined driver

`worker.park` (`worker.rs:810`) does `core.transition_to_parked()` (marks this worker as idle in the `Idle` bitmap at `idle.rs`), then calls `park_internal`.

**The driver is shared**: only one worker at a time can run the combined driver. `park.rs:132` shows a `Mutex<Driver>` — the worker that succeeds `try_lock()` gets to call `driver.park(handle)` (or `park_timeout`); all other workers fall back to `park_condvar`, sleeping on a `Condvar` instead. This is why you can have 8 worker threads but only one calling into `mio::Poll::poll` at a time.

The driver stack is layered (`runtime/driver.rs:15`):

```
TimeDriver
  └─ ProcessDriver (reaps child processes on wake)
       └─ SignalDriver (checks signals on wake)
            └─ IoDriver (mio::Poll)
```

`TimeDriver::park_internal` (`time/mod.rs:213`) computes a `max_wait` duration:
1. Calls `wheel.poll_at()` — returns the tick of the soonest pending timer.
2. Subtracts the current time to get a duration.
3. Clamps it to any external `park_timeout` limit.

It then calls `IoDriver::turn(handle, Some(max_wait))` (`io/driver.rs:179`), which calls:

```rust
self.poll.poll(&mut self.events, max_wait)   // line 188 — blocks here
```

This is the single blocking syscall (`epoll_wait` on Linux, `kqueue` on macOS) that puts the thread to sleep. The OS will wake it when either:
- **an I/O event arrives** for a registered fd, or
- **the timeout elapses** (= the soonest timer deadline), or
- **`mio::Waker::wake()`** is called (used by `Handle::unpark` to inject a software wakeup).

---

## Stage 6 — Whichever resource fires first wakes the worker

### Path A — socket becomes readable first

`mio::Poll::poll` returns with an event whose token encodes the `ScheduledIo *`. The driver loop (`io/driver.rs:201`):

1. Recovers the `ScheduledIo` from the token.
2. Calls `io.set_readiness(Tick::Set, |curr| curr | ready)` — updates the `AtomicUsize readiness` field.
3. Calls `io.wake(ready)` (`scheduled_io.rs:236`), which takes the `Waiters` lock, pops the stored `reader` waker, and calls `waker.wake()`.

`waker.wake()` is the task waker from Stage 3. It calls `wake_by_val` in `task/waker.rs:93`, which does a `state → NOTIFIED` transition and pushes the header (as a `Notified` token) back into the worker's run queue (or the remote injection queue if on a different thread). Another parked worker is then nudged if needed.

The timer waker in `TimerShared::StateCell` is still there, untouched. The next time `Sleep::poll` runs, it will find the state deregistered from the wheel and return `Poll::Pending` again (or it may have been deregistered first if the timeout fires simultaneously — but only one `wake()` actually reschedules the task since only one can clear `IDLE → NOTIFIED`).

### Path B — timer fires first

`mio::Poll::poll` returns because `max_wait` elapsed (or a software wakeup via `mio::Waker` was sent when a new shorter timer was inserted — `reregister` calls `handle.unpark()` if the new deadline beats `next_wake`).

After `IoDriver::turn` returns, `TimeDriver::park_internal` calls `handle.process_at_time(now)` (`time/mod.rs:296`). That locks the wheel, calls `wheel.poll(now)` in a loop — `poll` walks levels, cascades entries from higher levels into lower ones, moves expired entries to `self.pending` — then for each expired `TimerHandle` calls `entry.fire(Ok(()))` (`entry.rs:210`), which:

1. Stores the `TimerResult` in `StateCell::result`.
2. Stores `STATE_DEREGISTERED` in `StateCell::state`.
3. Calls `self.waker.take_waker()` to extract the stored `Waker`.

The collected wakers are called **outside** the driver lock (in `WakeList::wake_all()`) to avoid deadlock. Each `waker.wake()` re-queues the task as before.

The socket's `ScheduledIo::waiters.reader` waker slot still holds the stale waker. It will be overwritten or dropped when the task is next polled and the `read_buf` call either succeeds or re-registers.

---

## Stage 7 — Task is rescheduled and re-polled

The `Notified` token lands in the run queue. A worker dequeues it, re-enters `Harness::poll`, builds a fresh `Waker` (same pointer, same vtable), and polls the future again.

Inside `Timeout::poll`:

- **If the I/O fired**: `TcpStream::poll_read` → `ScheduledIo::poll_readiness` sees readable bits set in the `AtomicUsize`, returns `Poll::Ready(ReadyEvent)`, proceeds to actually call `mio::TcpStream::read`, and the future completes with `Poll::Ready(Ok(...))`.
- **If the timer fired**: `Sleep::poll_elapsed` → `StateCell::poll` → `StateCell::read_state` sees `STATE_DEREGISTERED` and returns `Poll::Ready(TimerResult::Success)`. `Timeout::poll` converts that to `Poll::Ready(Err(Elapsed))`.

Either way, the future returns `Poll::Ready`. `Harness::poll` calls `state.transition_to_complete()`, stores the output in `CoreStage::Finished`, and wakes the `JoinHandle`'s waker (if one is registered in `Trailer::waker`).

---

## How the stages connect — summary wiring

```
tokio::spawn
  └─ OwnedTasks::bind → Cell<T,S> on heap
       ├─ Notified → run queue
       └─ JoinHandle → caller

Worker loop
  └─ run_task → Harness::poll
       └─ Future::poll(cx)  [cx.waker() == task waker → Header*]
            ├─ TcpStream::poll_read
            │    └─ ScheduledIo::poll_readiness
            │         └─ stores cx.waker() in Waiters::reader  [PENDING]
            └─ Sleep::poll_elapsed
                 ├─ wheel.insert(TimerEntry)
                 └─ StateCell::poll(cx.waker())  [stores waker in AtomicWaker]
                      └─ returns PENDING

Worker parks
  └─ park.try_lock(Driver)
       └─ TimeDriver: next_wake = wheel.poll_at()
            └─ IoDriver::turn(max_wait = next_wake - now)
                 └─ mio::Poll::poll(events, max_wait)  ← BLOCKS

OS event / timer expiry
  ├─ I/O path: mio event → ScheduledIo::wake → Waiters::reader.wake()
  └─ Timer path: TimeDriver::process_at_time → wheel.poll → fire → AtomicWaker::take_waker().wake()

wake() in either path
  └─ task/waker.rs: state → NOTIFIED, push Notified into run queue
       └─ notify_parked → unpark another worker if needed

Worker re-polls
  └─ Harness::poll → Future::poll again
       ├─ I/O path: readiness bits set → read succeeds → Poll::Ready(Ok)
       └─ Timer path: STATE_DEREGISTERED → Sleep::Ready → Timeout::Err(Elapsed)
```

**Key connection points to know when changing wake-up behavior:**

- The waker deposited in `ScheduledIo::Waiters` (for I/O) and `TimerShared::StateCell::waker` (for timers) are independent clones of the same task waker. Either calling `wake()` is sufficient and idempotent because the state machine only lets one transition from `IDLE → NOTIFIED` win.
- The `max_wait` timeout passed to `mio::Poll::poll` is derived entirely from `wheel.poll_at()` — there is no separate OS timer. If you insert a timer shorter than the current `next_wake`, `reregister` calls `io_handle.unpark()` to abort the current `epoll_wait` and recompute.
- The driver lock (`park.rs: Mutex<Driver>`) means only one worker runs `epoll_wait`; all others sleep on a `Condvar`. When any of those others need to be woken (e.g., a new remote-spawn), `Unparker::unpark` either sends a `mio::Waker` byte (wakes the driver holder) or signals the condvar (wakes a condvar sleeper), depending on which state the target worker's parker is in.
