# transcript: To predict when a running task will actually be forced to yield back to the scheduler versus being allowed to keep polling, I need to understand the routine ...


💬 I'll explore the cooperative scheduling budget code across the codebase to map out the check routine and all its call sites.

  ▸ Agent(Explore cooperative scheduling budget in Tokio)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/tokio -type f -name "*.rs" | grep -E "(coop|budget)" | head -20)
      ↳ Read(/home/bench/repos/tokio/tokio/src/task/coop/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/task/coop/consume_budget.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/task/coop/unconstrained.rs)
      ↳ Bash(grep -r "poll_proceed\|has_budget_remaining\|consume_budget\|poll_budget_available" /home/bench/repos/tokio/tokio/src --include="*.rs" | grep -v "test" | hea...)
      ↳ Bash(grep -r "poll_proceed\|has_budget_remaining\|consume_budget\|poll_budget_available" /home/bench/repos/tokio/tokio/src --include="*.rs" | wc -l)
      ↳ Bash(grep -rn "poll_proceed\|has_budget_remaining\|consume_budget\|poll_budget_available" /home/bench/repos/tokio/tokio/src --include="*.rs" | grep -v "test" | gr...)
      ↳ Bash(grep -rn "fn budget\|with_budget\|Budget::initial\|Budget::unconstrained" /home/bench/repos/tokio/tokio/src --include="*.rs" | grep -v test)
      ↳ Bash(grep -rn "coop::budget\|task::coop::budget" /home/bench/repos/tokio/tokio/src --include="*.rs")
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/current_thread/mod.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/context.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/io/util/copy.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/sync/oneshot.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/sync/mpsc/chan.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/time/sleep.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/time/sleep.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/time/timeout.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/time/timeout.rs)
      ↳ Read(/home/bench/repos/tokio/tokio/src/runtime/io/registration.rs)
      ↳ Bash(grep -n "const fn initial\|pub(crate) const fn unconstrained" /home/bench/repos/tokio/tokio/src/task/coop/mod.rs)
      ↳ ⟹ returned to parent


💬 Let me read the core files to verify the key details before explaining.
  ▸ Read(/home/bench/repos/tokio/tokio/src/task/coop/mod.rs)

💬 Now let me verify a few representative call sites across I/O, sync, and the scheduler.
  ▸ Read(/home/bench/repos/tokio/tokio/src/sync/mpsc/chan.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/registration.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)

💬 Let me also check `context::defer` to understand waker registration on exhaustion.
  ▸ Bash(grep -n "pub.*fn defer\|fn defer" /home/bench/repos/tokio/tokio/src/runtime/context.rs | head -20)
  ▸ Bash(grep -n "poll_proceed_and_make_progress\|poll_proceed" /home/bench/repos/tokio/tokio/src/io/util/mod.rs 2>/dev/null | head -20)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/context.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/io/util/mod.rs)

💬 I have a thorough picture now. Here's the complete walkthrough.  ---  ## Cooperative scheduling budget: how it works end to end  ### 1. Budget lives in a thr...

──────── RESULT (success, 167495ms, 10 turns) ────────
I have a thorough picture now. Here's the complete walkthrough.

---

## Cooperative scheduling budget: how it works end to end

### 1. Budget lives in a thread-local cell

`tokio/src/task/coop/mod.rs` stores the current budget as `Budget(Option<u8>)` in a thread-local cell managed by `tokio/src/runtime/context.rs`. `Budget(None)` means unconstrained (no limit); `Budget(Some(n))` is the remaining count.

---

### 2. Budget is set to 128 at the start of each task poll

Every scheduler variant wraps `task.run()` in `coop::budget()`:

| Scheduler | File:line |
|---|---|
| Multi-thread | `runtime/scheduler/multi_thread/worker.rs:675` |
| Current-thread | `runtime/scheduler/current_thread/mod.rs:373` |
| `block_on` loop | `runtime/scheduler/current_thread/mod.rs:783` |
| `LocalSet` | `task/local.rs:770` |
| Blocking pool | `runtime/context/blocking.rs:90` |

`coop::budget()` saves the previous budget in a `ResetGuard` (restoring it on drop), then sets the cell to `Budget::initial()` = `Budget(Some(128))`. That is your task's entire budget for this one poll cycle.

---

### 3. The check: `poll_proceed`

**`task/coop/mod.rs:343`**

```rust
pub fn poll_proceed(cx: &mut Context<'_>) -> Poll<RestoreOnPending>
```

It reads the thread-local cell and calls `budget.decrement()`:

- **`Budget(None)` (unconstrained):** always succeeds, budget unchanged.
- **`Budget(Some(n))` where `n > 0`:** decrements to `n-1`. If `n-1 == 0`, sets `hit_zero = true` (which increments a runtime metric for forced-yield counting). Returns `Poll::Ready(restore)`.
- **`Budget(Some(0))` (exhausted):** calls `register_waker(cx)` → `context::defer(cx.waker())`, which hands the waker to the scheduler to re-queue the task *after* the current cycle ends. Returns `Poll::Pending`.

The decrement is **speculative**. The returned `RestoreOnPending` holds the pre-decrement budget value. If dropped without calling `.made_progress()`, it writes that saved value back into the cell — effectively undoing the decrement. This ensures budget is only permanently consumed when real work was done.

---

### 4. What callers do with the outcome

#### Pattern A — the main pattern (mpsc, I/O, semaphore, oneshot, JoinHandle, sleep, copy)

```rust
let coop = ready!(crate::task::coop::poll_proceed(cx));
// ... attempt to do work ...
if work_was_done {
    coop.made_progress();   // commits the decrement
    Poll::Ready(result)
} else {
    Poll::Pending           // coop drops → decrement is undone
}
```

`ready!` short-circuits to `Poll::Pending` when budget is zero — the caller returns without touching any resources. Representative sites:

- `sync/mpsc/chan.rs:295` (`recv`), `chan.rs:355` (`recv_many`) — each message dequeued calls `coop.made_progress()`
- `runtime/io/registration.rs:151` (`poll_ready`) — `made_progress()` fires when a readiness event is received
- `sync/batch_semaphore.rs:594` — permit acquisition
- `sync/oneshot.rs:824, 1318` — receiver/sender closure poll
- `runtime/task/join.rs:332` — `JoinHandle` poll
- `time/sleep.rs:398` — timer poll
- `io/util/copy.rs:97` — copy loop iteration

#### Pattern B — always-ready sources (`Empty`, `Repeat`, `Sink`)

A thin helper at `io/util/mod.rs:91`:

```rust
fn poll_proceed_and_make_progress(cx) -> Poll<()> {
    let coop = ready!(crate::task::coop::poll_proceed(cx));
    coop.made_progress();   // always commits — these sources never block
    Poll::Ready(())
}
```

#### Pattern C — query without consuming: `has_budget_remaining()`

Returns `bool`, does not touch the counter. Used in two places:

- `worker.rs:716` — after a task finishes its poll, the multi-thread worker checks whether to immediately run the task sitting in the LIFO slot (a cache-warm optimization). If budget is gone, the LIFO task is pushed to the back of the run queue instead, preventing one task from starving others.
- `time/timeout.rs:214,237` — `Timeout<T>` checks budget before and after polling the inner future. If the inner future drained the budget, it re-polls the deadline check wrapped in `with_unconstrained` to guarantee the timeout still fires even though budget is at zero.

#### Pattern D — gate without consuming: `poll_budget_available`

`task/coop/mod.rs:371` — returns `Poll::Ready(())` if budget > 0, else `Poll::Pending` (and registers the waker), but does **not** decrement. Used by the `select!` macro via `macros/support.rs:16` to decide whether to poll any branch at all this iteration.

#### Pattern E — explicit public yield: `consume_budget()`

`task/coop/consume_budget.rs` — async function the user can call directly. It calls `poll_proceed`, commits with `made_progress()`, and returns; if budget is zero it yields (returns `Poll::Pending`), causing the task to be re-scheduled.

#### Pattern F — `cooperative(fut)` wrapper

`task/coop/mod.rs:490` — a future adapter (`Coop<F>`) that gates any inner future behind `poll_proceed`. On each poll it first tries to consume budget; if exhausted it returns `Pending` without touching the inner future at all.

---

### 5. What happens on exhaustion, step by step

1. `poll_proceed` sees `Budget(Some(0))`.
2. Calls `context::defer(cx.waker())` — inside the runtime this hands the waker to the scheduler's deferred-waker list; outside the runtime it calls `wake_by_ref()` immediately.
3. Returns `Poll::Pending`.
4. `ready!` in the caller propagates `Poll::Pending` up the future tree.
5. The task's top-level `poll()` returns `Poll::Pending` to the scheduler.
6. The scheduler (multi-thread or current-thread) finishes the current task slot and, during its maintenance pass, fires the deferred waker, re-enqueuing the task.
7. The next time the scheduler picks up that task it calls `coop::budget()` again, resetting the cell to `Budget(Some(128))` for the new poll.

The net effect: a task that keeps hitting ready I/O or channel messages can run at most 128 "units" of forward progress per scheduler turn before it must give other tasks a chance to run.
