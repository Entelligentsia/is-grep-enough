# transcript: I want to trace what happens from the moment the reactor's underlying system poll reports an I/O resource is ready until the task that was waiting on that re...


💬 I'll trace this path through the code using LSP. Let me start by finding the core driver and reactor symbols.
  ▸ ToolSearch(select:LSP)

💬 Let me find the key entry points: the I/O driver's poll/turn method and the reactor's core structs.
  ▸ LSP(IoDriver)
  ▸ LSP(turn)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime -name "*.rs" | head -30)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src -path "*/io/driver*" -o -path "*/reactor*" | sort)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs","line":1,"character":1})
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/io -name "*.rs" | sort)

💬 The core `turn` method at line 179 is the entry point. Let me read the key files in full.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/driver.rs)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs","line":1,"character":1})

💬 Now let me read the `set_readiness` and `wake` methods in `scheduled_io.rs`, and also the `poll_readiness` / `Readiness::poll` future.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs)

💬 Now let me read the `Future` impl for `Readiness` (how tasks register as waiters) and then check how `Waker::wake` connects to the scheduler's run queue.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/scheduled_io.rs)
  ▸ LSP(RawWaker wake)

💬 Now let me trace the `Waker::wake()` call back to the scheduler. I need to find where task wakers are created.
  ▸ LSP(wake_by_val)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/task -name "*.rs" | sort)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/waker.rs)

💬 Now let me read `RawTask::wake_by_val` in `harness.rs`.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs","line":1,"character":1})

💬 Let me find the `schedule` method and the `Schedule` trait to see the connection to the run queue.
  ▸ LSP(Schedule schedule)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)
  ▸ Bash(grep -n "fn schedule" /home/bench/repos/tokio/tokio/src/runtime/task/harness.rs /home/bench/repos/tokio/tokio/src/runtime/task/mod.rs /home/bench/repos/tokio...)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/mod.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/raw.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/raw.rs)
  ▸ LSP(impl Schedule)

💬 Now let me find the multi-thread scheduler's `impl Schedule` to see how `schedule` puts the task on a run queue.
  ▸ Bash(grep -rn "impl.*Schedule.*for" /home/bench/repos/tokio/tokio/src/runtime/scheduler/ 2>/dev/null)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/handle.rs)
  ▸ LSP(schedule_task)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)

💬 Let me check `push_remote_task` and `notify_parked_remote` to close the remote-wake path.
  ▸ Bash(grep -n "fn push_remote_task\|fn notify_parked_remote\|fn notify_parked_local" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs | h...)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)

💬 Let me also quickly verify how the scheduler's worker loop calls `park` which drives `turn`.
  ▸ Bash(grep -n "\.park\b\|park_timeout\|io.*driver\|turn(" /home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs | grep -v "unpark\|notify_park...)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)

💬 I now have the complete picture across all the key files. Here is the end-to-end walk-through in order.  ---  ## I/O Readiness Path: End-to-End  ### 1. Block...

──────── RESULT (success, 193448ms, 33 turns) ────────
I now have the complete picture across all the key files. Here is the end-to-end walk-through in order.

---

## I/O Readiness Path: End-to-End

### 1. Blocking in `epoll_wait` — `Driver::turn`
**`tokio/src/runtime/io/driver.rs:179`**

A worker thread without runnable tasks calls `park` or `park_timeout` on the I/O driver, which immediately calls `turn`. The heart of `turn` is:

```rust
self.poll.poll(events, max_wait)   // driver.rs:188
```

This is `mio::Poll::poll`, a thin wrapper over the OS system call (`epoll_wait` on Linux, `kqueue` on macOS). The thread blocks here until the kernel reports at least one fd is ready or the timeout fires.

---

### 2. Event iteration — token → `ScheduledIo` pointer
**`tokio/src/runtime/io/driver.rs:201–222`**

When `poll` returns, the driver iterates over `events`. Each mio `Event` carries a `Token`. The token for an I/O resource is the raw address of the `Arc<ScheduledIo>` for that resource, stored there when the source was registered (`add_source` in `driver.rs:263`, via `EXPOSE_IO.expose_provenance`). The driver recovers it:

```rust
let ready = Ready::from_mio(event);
let ptr = super::EXPOSE_IO.from_exposed_addr(token.0);
let io: &ScheduledIo = unsafe { &*ptr };
```

Two special tokens are filtered out first: `TOKEN_WAKEUP` (unpark byte, no-op) and `TOKEN_SIGNAL` (signal fd).

---

### 3. Atomic readiness update — `ScheduledIo::set_readiness`
**`tokio/src/runtime/io/scheduled_io.rs:207`**

```rust
io.set_readiness(Tick::Set, |curr| curr | ready);
```

`ScheduledIo::readiness` is a single `AtomicUsize` that packs three fields using `bit::Pack`: a wraparound tick counter, the readiness bitmask, and a shutdown bit. `set_readiness` uses `fetch_update` to atomically OR in the new ready bits and increment the tick. The tick increment means any `clear_readiness` call holding a stale tick snapshot will be a no-op — the "generation counter" that prevents over-clearing.

---

### 4. Waker collection and notification — `ScheduledIo::wake`
**`tokio/src/runtime/io/scheduled_io.rs:226`**

```rust
io.wake(ready);
```

This is where the actual wakeup fans out. The method:

1. Locks `self.waiters` (a `Mutex<Waiters>`).
2. Checks the reserved `reader` / `writer` slots — populated by `poll_readiness` (the `AsyncRead`/`AsyncWrite` path). If the ready set matches, the stored `Waker` is moved out.
3. Drains the linked list of `Waiter` nodes whose `.interest` overlaps `ready` — these are registered by the async `Readiness` future path. For each matching waiter, `waiter.waker.take()` is called and `waiter.is_ready = true` is set.
4. Wakers are pushed onto a `WakeList` stack buffer. If the buffer fills before the list is exhausted, the mutex is *dropped*, `wakers.wake_all()` is called, the mutex is reacquired, and iteration continues. This avoids holding the lock while notifying, preventing a deadlock where the woken task tries to re-register in `wake`.
5. After the loop, the mutex is dropped and `wakers.wake_all()` fires any remaining wakers.

---

### 5. How tasks register themselves as waiters

There are two registration paths:

**`poll_readiness`** (`scheduled_io.rs:303`) — used by `AsyncRead`/`AsyncWrite` polls. Checks readiness atomically; if not ready, stores `cx.waker().clone()` into the `reader` or `writer` slot, then re-checks under the lock to avoid a race.

**`Readiness` future** (`scheduled_io.rs:424`) — used by the async `.readiness(interest).await` path. On first poll (`State::Init`), it checks readiness optimistically, then under the lock inserts a `Waiter` node (holding `cx.waker().clone()` and the `interest` set) into the intrusive linked list. On subsequent polls (`State::Waiting`), it checks `waiter.is_ready` (set by `wake`) and either returns `Poll::Ready` or updates the stored waker.

---

### 6. Waker vtable — `wake_by_val` → state transition
**`tokio/src/runtime/task/waker.rs:93`**, **`harness.rs:68`**

Each Tokio `Waker` stores a raw pointer to the task's `Header` with a single static `WAKER_VTABLE`. When `Waker::wake()` is called, the vtable dispatches to `wake_by_val(ptr)`, which:

1. Recovers `RawTask` from the header pointer.
2. Calls `self.state().transition_to_notified_by_val()`. The task's state machine atomically transitions `Idle → Notified`. If the task is already `Notified` or running, it returns `DoNothing` — the wakeup is a no-op since it will run again anyway. On success it returns `Submit`.
3. On `Submit`, calls `self.schedule()`.

---

### 7. vtable dispatch → scheduler `schedule()`
**`tokio/src/runtime/task/raw.rs:346`**

`schedule()` goes through the task's vtable (which is monomorphized per `T: Future` + `S: Schedule` at spawn time):

```rust
unsafe fn schedule<S: Schedule>(ptr: NonNull<Header>) {
    let scheduler = Header::get_scheduler::<S>(ptr);
    scheduler.as_ref().schedule(Notified(Task::from_raw(ptr.cast())));
}
```

The scheduler handle is stored in the task allocation itself (in `Core<T, S>`). This calls the `Schedule` impl on `Arc<Handle>`.

---

### 8. Multi-thread scheduler — local vs. remote queue
**`tokio/src/runtime/scheduler/multi_thread/handle.rs:110`**, **`worker.rs:1327`**

`schedule_task` checks the thread-local context to see if the current thread is a worker of this same scheduler and still holds a core:

**Local path** (`schedule_local`, `worker.rs:1353`): The task goes directly onto the calling worker's per-thread run queue. If LIFO is enabled and this is not a yield, the task is placed in the worker's `lifo_slot` (so it runs *next*, giving the freshly-woken task hot-cache locality). If the LIFO slot was already occupied, the displaced task is pushed to `run_queue.push_back_or_overflow`. A `notify_parked_local` is sent only if there are other idle workers that should be woken to help.

**Remote path** (`worker.rs:1397`): If the wakeup came from outside a worker (e.g., from the I/O driver thread itself, which is not a scheduler worker), the task is pushed into the shared inject queue under `shared.synced` lock:

```rust
self.shared.inject.push(&mut synced.inject, task);
```

Then `notify_parked_remote` finds a parked worker in the idle set and calls:

```rust
self.shared.remotes[index].unpark.unpark(&self.driver);
```

This writes to a `mio::Waker` (backed by an eventfd or pipe), which injects a `TOKEN_WAKEUP` event into the sleeping worker's `epoll_wait`. That worker's next call to `Driver::turn` returns immediately, the loop runs, finds nothing in the event list for I/O (the token is `TOKEN_WAKEUP`), exits `turn`, and the worker proceeds to drain the inject queue and run the task.

---

### Summary diagram

```
epoll_wait (mio::Poll::poll)
  └─ Driver::turn [driver.rs:188]
       └─ for each event:
            token → &ScheduledIo            [driver.rs:210–216]
            ScheduledIo::set_readiness()    [scheduled_io.rs:207]  ← atomic OR + tick++
            ScheduledIo::wake()             [scheduled_io.rs:236]
              └─ drain waiters.reader/writer/list
                 Waker::wake_all()
                   └─ wake_by_val (WAKER_VTABLE) [waker.rs:93]
                        └─ state: Idle → Notified
                             └─ RawTask::schedule() [raw.rs:276]
                                  └─ vtable → scheduler.schedule(Notified) [raw.rs:346]
                                       └─ Handle::schedule_task() [worker.rs:1327]
                                            ├─ local: core.lifo_slot / run_queue
                                            └─ remote: inject queue + unpark(mio::Waker)
```

The key design decisions worth noting: the readiness is stored atomically in `ScheduledIo` *before* any lock is taken, so a task polling for readiness after `set_readiness` but before `wake` will still see it. Wakers are collected under the lock but fired outside it to prevent re-registration deadlocks. The LIFO slot gives woken I/O tasks cache-warm scheduling priority without holding any locks during the enqueue.
