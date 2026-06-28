# transcript: To predict when a running task will actually be forced to yield back to the scheduler versus being allowed to keep polling, I need to understand the routine ...


💬 I'll load the LSP tool and start with workspace symbol searches for the cooperative scheduling budget.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(budget)
  ▸ LSP(poll_proceed)

💬 I need a file path to anchor LSP queries. Let me find the coop module first.
  ▸ Bash(find /home/bench/repos/tokio/tokio/src -name "coop*" -type f)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src -name "*.rs" | head -30 && find /home/bench/repos/tokio -name "coop*")
  ▸ Bash(ls /home/bench/repos/tokio/tokio/src/task/coop/)
  ▸ Read(/home/bench/repos/tokio/tokio/src/task/coop/mod.rs)

💬 Now let me find where `poll_proceed` is called and where the budget wrapper fires at task poll entry.
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/tokio/tokio/src/task/coop/mod.rs","line":343,"character":12})
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/tokio/tokio/src/task/coop/mod.rs","line":132,"character":12})

💬 LSP didn't find references for `poll_proceed` (index still warming). Falling back to grep as permitted.
  ▸ Bash(grep -rn "poll_proceed\|coop::budget\b\|task::coop::budget\b" /home/bench/repos/tokio/tokio/src/ 2>/dev/null | grep -v "test\|#\[" | head -60)
  ▸ Bash(grep -rn "coop::budget\b\|coop\.budget\b\| budget(|with_budget\|task::coop" /home/bench/repos/tokio/tokio/src/runtime/ 2>/dev/null | head -40)

💬 Good map of call sites. Now let me read the key ones in detail — the budget entry in the multi-thread worker, plus representative `poll_proceed` callers.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/current_thread/mod.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/io/registration.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/sync/batch_semaphore.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/sync/mpsc/chan.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/time/sleep.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/join.rs)

💬 Now let me see what `context::defer` does when the waker is registered on exhaustion.
  ▸ LSP(context::defer)
  ▸ Bash(grep -rn "pub.*fn defer\b" /home/bench/repos/tokio/tokio/src/runtime/context/ 2>/dev/null)
  ▸ Bash(grep -rn "pub.*fn defer\b\|fn defer(" /home/bench/repos/tokio/tokio/src/runtime/ 2>/dev/null | head -20)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/context.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/defer.rs)

💬 Now let me find where `defer.wake()` fires to complete the picture of the re-wakeup path.
  ▸ Bash(grep -rn "\.defer\.wake\(\)\|defer\.wake\(\)\|take_deferred\b" /home/bench/repos/tokio/tokio/src/runtime/ 2>/dev/null | head -20)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/current_thread/mod.rs)
  ▸ Bash(grep -rn "\.wake()\|\.defer\.wake\|deferred\.wake\|take_deferred\|wake_deferred" /home/bench/repos/tokio/tokio/src/runtime/ 2>/dev/null | grep -v "//\|test\|...)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/current_thread/mod.rs)

💬 Now let me read the `consume_budget` future and the `blocking/task.rs` stop call for completeness.
  ▸ Read(/home/bench/repos/tokio/tokio/src/task/coop/consume_budget.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/blocking/task.rs)

💬 I now have the full picture. Here is a precise, end-to-end explanation of how the cooperative budget works and where each call site sits in the flow.  ---  #...

──────── RESULT (success, 172804ms, 34 turns) ────────
I now have the full picture. Here is a precise, end-to-end explanation of how the cooperative budget works and where each call site sits in the flow.

---

## Cooperative scheduling budget — how it works end to end

### 1. The budget type and storage

`Budget(Option<u8>)` lives in a thread-local cell managed by `context::budget` (`tokio/src/task/coop/mod.rs`).

- `Some(128)` — constrained; 128 units of work allowed this poll.
- `None` — unconstrained; the task opted out entirely.

The thread-local is read and written by every `poll_proceed` call and reset at the boundaries described below.

---

### 2. Budget entry: wrapping a task's top-level poll

Every time the scheduler drives a task, it first installs a fresh `Budget::initial()` (128) around the entire poll, then restores the prior value on exit via a `Drop` guard:

| Call site | File:line | What it wraps |
|---|---|---|
| Multi-thread worker | `runtime/scheduler/multi_thread/worker.rs:675` | `task.run()` + the subsequent LIFO loop |
| Current-thread `run_task` | `runtime/scheduler/current_thread/mod.rs:373` | the closure `f` passed to `run_task` |
| Current-thread block-on future | `runtime/scheduler/current_thread/mod.rs:783` | the top-level `block_on` future's poll |
| `block_in_place` / park | `runtime/park.rs:284`, `runtime/context/blocking.rs:90` | polls inside a `block_in_place` context |
| `LocalSet` | `task/local.rs:770` | `task.run()` for each local task |

`coop::budget(f)` calls `with_budget(Budget::initial(), f)`, which uses the `ResetGuard` drop guard so the budget is always restored to its pre-entry value when the task poll frame exits, regardless of panics.

---

### 3. The check: `poll_proceed` (`mod.rs:343`)

Every "leaf" future that produces work calls `poll_proceed(cx)` before doing anything:

```
poll_proceed(cx) → Poll<RestoreOnPending>
```

Inside (`mod.rs:344–363`):

1. Reads the thread-local cell.
2. Calls `budget.decrement()`:
   - If `Some(n > 0)`: decrement succeeds, `n` drops by 1. Returns `BudgetDecrement { success: true, hit_zero: n-1 == 0 }`.
   - If `Some(0)`: decrement fails. Returns `{ success: false }`.
   - If `None` (unconstrained): always succeeds, never hits zero.
3. **Budget remains (`success == true`)**:
   - Stores the *post-decrement* budget back in the cell.
   - Creates `RestoreOnPending` holding the *pre-decrement* value as the rollback budget.
   - If this is the last unit (`hit_zero`), increments the metrics counter `inc_budget_forced_yield_count`.
   - Returns `Poll::Ready(restore)` — the caller proceeds.
4. **Budget exhausted (`success == false`, i.e. already at 0)**:
   - Calls `register_waker(cx)` → `context::defer(cx.waker())`, which pushes the waker into the `Defer` list instead of immediately waking it.
   - Returns `Poll::Pending` — the caller short-circuits with `Poll::Pending` via `ready!`.

---

### 4. The `RestoreOnPending` RAII guard

When `poll_proceed` returns `Ready(restore)`, the caller gets a `RestoreOnPending` containing the pre-decrement budget. Two outcomes:

- **Caller made progress** (e.g. a message was received, I/O completed): calls `restore.made_progress()`, which sets the stored rollback budget to `Budget::unconstrained()`. When `restore` drops, the `Drop` impl sees `unconstrained` and does *nothing* — the decrement is kept.
- **Caller returned `Pending` without making progress** (e.g. semaphore not available, channel empty after registering waker): `restore.made_progress()` is not called. When `restore` drops, `Drop` writes the pre-decrement budget back to the cell — the decrement is *rolled back*. This prevents counting a speculative check against the budget.

---

### 5. Call sites and what they do with the outcome

| Call site | File:line | Budget exhausted → | Budget available + progress → |
|---|---|---|---|
| **`io::Registration::poll_ready`** | `runtime/io/registration.rs:151` | `ready!` returns `Poll::Pending` immediately, I/O is not attempted | `coop.made_progress()` before returning `Poll::Ready(ev)` |
| **`io::Registration::async_io`** | `registration.rs:222` | same, `poll_fn` suspends | `coop.made_progress()` on successful syscall |
| **`sync::batch_semaphore` Acquire** | `batch_semaphore.rs:598` | returns `Pending` before touching semaphore state | `coop.made_progress()` only if `poll_acquire` returned `Ready` |
| **`sync::mpsc::Chan::recv`** | `mpsc/chan.rs:295` | returns `Pending` before dequeuing | `coop.made_progress()` on each popped value or closed signal |
| **`sync::mpsc::Chan::recv_many`** | `mpsc/chan.rs:355` | same | `made_progress()` after drain loop |
| **`sync::oneshot` Receiver** | `oneshot.rs:824, 1318` | returns `Pending` without reading | `coop.made_progress()` when value is ready |
| **`time::Sleep::poll_elapsed`** | `time/sleep.rs:402` | returns `Pending` without registering timer waker | `coop.made_progress()` when timer fired |
| **`task::JoinHandle`** | `task/join.rs:332` | returns `Pending` without reading output | `coop.made_progress()` if `try_read_output` set `ret` to `Ready` |
| **`io::util::copy`** | `io/util/copy.rs:97` | returns `Pending` before any copy iteration | `made_progress()` after each chunk |
| **`io::util::{Empty,Repeat,Sink}`** | via `poll_proceed_and_make_progress` | `Pending` | always calls `made_progress()` (progress is the definition of these sources/sinks) |
| **`io::util::mem` (duplex)** | `io/util/mem.rs:335,365,393` | `Pending` | `made_progress()` per read/write |
| **`process` output** | `process/mod.rs:1140` | `Pending` | `made_progress()` on output available |
| **`task::consume_budget()`** | `task/coop/consume_budget.rs:33` | suspends for one scheduler turn, then re-polls | always calls `made_progress()` — used to voluntarily yield after CPU work |
| **LIFO slot check (multi-thread)** | `worker.rs:716` | calls `has_budget_remaining()` (no decrement); pushes LIFO task to the back of the run queue and exits the LIFO loop | continues into the loop to run the LIFO task |

The multi-thread LIFO check at `worker.rs:716` is the one place that reads the budget *without* decrementing it — `has_budget_remaining()` is a peek, not a consume. Its effect is that a chain of woken-by-LIFO tasks inherits the parent poll's remaining budget and is cut off at the same boundary.

---

### 6. What happens after forced yield

When a `poll_proceed` exhaustion returns `Poll::Pending`, `register_waker` does **not** call `cx.waker().wake()` directly. Instead it calls `context::defer(cx.waker())` (`context.rs:174`), which adds the waker to the `Defer` list for the current scheduler context.

The `Defer::wake()` drain fires at well-defined scheduler checkpoints:

- **Multi-thread**: `worker.rs:443` (before blocking on park), `worker.rs:555` (after `block_in_place` steals the core), `worker.rs:876` (immediately after the thread wakes from park).
- **Current-thread**: `current_thread/mod.rs:438` (inside `park_internal`, after unparking), `current_thread/mod.rs:580` (at `wake_deferred_tasks_and_free`, after the main `block_on` loop exits a turn).

This batches the re-schedule so the task isn't immediately re-pushed to the front of the run queue — it goes through the normal scheduling round, giving other tasks a turn before the budget is replenished to 128 for the next poll.

---

### Summary of the lifecycle

```
Scheduler picks task
  → coop::budget(|| task.run())       # installs Budget(Some(128))
       │
       ├─ leaf future polls → poll_proceed(cx)
       │       ├─ budget > 0: decrement, return Ready(RestoreOnPending)
       │       │       ├─ inner work succeeds → coop.made_progress() → decrement is permanent
       │       │       └─ inner work pending  → RestoreOnPending drops → decrement rolled back
       │       └─ budget == 0: defer waker, return Pending
       │               → task returns Poll::Pending to scheduler
       │               → budget restored to prior value by ResetGuard drop
       │
  → next scheduler turn: defer.wake() fires
  → task re-queued, picks up fresh Budget(Some(128)) on next poll
```
