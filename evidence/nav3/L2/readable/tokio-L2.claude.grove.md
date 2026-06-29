# tokio · L2 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **tokio** (rust) @ `66e29121b`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | tokio (rust) · L2 |
| pinned source | `66e29121b333d1ba5bde803f570e421524d4431e` |
| status | completed |
| engagement | `grove_tools = 6` (gate: > 0 → ✓ used its capability) |
| turns | 17 |
| wall clock | 134 s |
| context (peak) | 392,389 tokens |
| cost (billed) | $0.3704 |
| &nbsp;&nbsp;↳ token split | in 19 · out 6,281 · cache-create 27,676 · cache-read 364,694 |
| tool calls | 16 (Read×6, Bash×3, mcp__grove__callers×3, ToolSearch×1, mcp__grove__symbols×1, mcp__grove__map×1, mcp__grove__source×1) |
| evidence | `evidence/nav3/L2/raw/tokio-L2.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To predict when a running task will actually be forced to yield back to the scheduler versus being allowed to keep polling, I need to understand the routine that checks the cooperative scheduling budget and the poll sites that call into it. Help me see where that budget check fires during normal task progress and what the various callers do with its outcome, both when budget remains and when it has run out.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll load the grove tools and map the cooperative scheduling budget system.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__outline,mcp__grove__map)`

💬 Now let me locate the coop module and map its structure in parallel.

&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/tokio/tokio/src -name "coop*" -o -name "*coop*" 2>/dev/null)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(poll_proceed)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/tokio/tokio/src/task/coop -type f | sort)`
&nbsp;&nbsp;▸ `mcp__grove__map({"dir":"/home/bench/repos/tokio/tokio/src/task/coop"})`

💬 The map shows `Budget`, `BudgetDecrement`, and `has_budget_remaining`, but not the actual decrement/check function. Let me read the full `mod.rs` and look for callers of the key functions.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/task/coop/mod.rs)`
&nbsp;&nbsp;▸ `mcp__grove__callers(has_budget_remaining)`

💬 Now let me find all callers of `poll_proceed` across the codebase in parallel with reading the scheduler integration point.

&nbsp;&nbsp;▸ `mcp__grove__callers(poll_proceed)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/time/timeout.rs)`

💬 Now let me look at how the scheduler installs the budget at task poll time, and read `consume_budget.rs`.

&nbsp;&nbsp;▸ `mcp__grove__callers(budget)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/task/coop/consume_budget.rs)`

💬 Let me read the multi-thread `run_task` function to see the full budget installation and LIFO-slot context.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/scheduler/multi_thread/worker.rs)`

💬 Let me also look at `context::defer` to understand how the waker re-registration works when budget is exhausted.

&nbsp;&nbsp;▸ `mcp__grove__source(defer)`
&nbsp;&nbsp;▸ `Bash(grep -n "pub.*fn defer" /home/bench/repos/tokio/tokio/src/runtime/context.rs /home/bench/repos/tokio/tokio/src/runtime/context/*.rs 2>/dev/null | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/tokio/tokio/src/runtime/context.rs)`

💬 I now have the complete picture. Here's a precise walkthrough of every layer.

---

## The budget check routine: `poll_proceed`

**`tokio/src/task/coop/mod.rs:343`**

```
poll_proceed(cx) → Poll<RestoreOnPending>
```

It reads the **thread-local `Budget(Option<u8>)`** via `context::budget`, then calls `Budget::decrement()` (line 413):

| Cell value | Meaning | Decrement result |
|---|---|---|
| `None` | Unconstrained (`task::unconstrained`) | Always succeeds, `hit_zero = false` |
| `Some(n > 0)` | Budget remaining | Succeeds; `hit_zero = (n-1 == 0)` |
| `Some(0)` | Already exhausted | Fails |

**When decrement succeeds** (budget ≥ 1):

1. Snapshot the pre-decrement cell value into `RestoreOnPending` (line 350).
2. Write the decremented value back to the cell (line 351).
3. If `hit_zero`, atomically increment `budget_forced_yield_count` metric.
4. Return `Poll::Ready(restore)`.

**When decrement fails** (budget == 0):

1. Call `register_waker(cx)` → `context::defer(cx.waker())` (line 397). Inside the runtime this defers to the scheduler's own waker mechanism, which **immediately re-queues the task** for the next scheduling round without touching external I/O readiness. Outside the runtime it calls `wake_by_ref()` directly.
2. Return `Poll::Pending`.

---

## The `RestoreOnPending` contract

The snapshot stored in `RestoreOnPending` is the budget value **before** the decrement. Its `Drop` impl (line 279) restores that pre-decrement value to the cell — **refunding** the budget unit — *unless* `made_progress()` was called first.

`made_progress()` (line 273) writes `Budget::unconstrained()` (`None`) into the cell inside `RestoreOnPending`. `Drop` then sees `is_unconstrained() == true` and skips the restore. Result: the decremented value stays, **consuming** the budget unit.

So the invariant is:
- **Leaf produced a value** → call `coop.made_progress()` before returning `Poll::Ready` → budget is consumed.
- **Leaf returned `Poll::Pending`** → drop `coop` without calling `made_progress()` → budget is refunded, next poll starts with the same count.

---

## Where the budget is installed

Each task gets a fresh `Budget(Some(128))` at the start of every scheduler poll, via `coop::budget(|| ...)` → `with_budget(Budget::initial(), f)`, which sets the cell and resets it on exit via `ResetGuard::drop`.

**Multi-thread scheduler** (`multi_thread/worker.rs:675`):

```rust
coop::budget(|| {
    task.run();             // polls the task future
    loop {                  // LIFO-slot drain
        if !coop::has_budget_remaining() {
            // push LIFO task to back of run queue, stop
        }
        lifo_task.run();    // inherits remaining budget
    }
})
```

The call to `task.run()` and any subsequent LIFO-slot tasks all share the **same 128-unit budget**. The LIFO drain uses `has_budget_remaining()` (not `poll_proceed`) as a gate — it's a coarser check that doesn't consume a unit, just decides whether to attempt another task.

**Current-thread scheduler** (`current_thread/mod.rs:373`): same `coop::budget(f)` wrapper around each task poll.

**`block_on` paths** (`park.rs:284`, `context/blocking.rs:90`): same wrapper, so synchronous `block_on` callers also get a budget.

**`block_in_place`** (`multi_thread/worker.rs:491`): calls `coop::stop()` to drain and save the remaining budget, then restores it via a `Drop` guard when the blocking section ends — blocking code runs completely unconstrained.

---

## Poll sites: every caller of `poll_proceed`

All callers use the `ready!` macro, so `Poll::Pending` propagates straight up:

| Call site | File | What `made_progress()` means |
|---|---|---|
| `Rx::recv`, `Rx::recv_many` | `sync/mpsc/chan.rs:295,355` | A message was dequeued |
| `Acquire::poll` | `sync/batch_semaphore.rs:598` | Permit was acquired (mutex locked, semaphore decremented) |
| `Inner::poll_recv` | `sync/oneshot.rs:1318` | Value received on oneshot |
| `Sender::poll_closed` | `sync/oneshot.rs:824` | Receiver was observed dropped |
| `Registration::poll_ready` | `runtime/io/registration.rs:151` | I/O readiness event delivered (covers all TCP/UDP/Unix sockets) |
| `Registration::async_io` | `runtime/io/registration.rs:222` | Same, via `poll_fn` wrapper |
| `JoinHandle::poll` | `runtime/task/join.rs:332` | Joined task completed |
| `CopyBuffer::poll_copy` | `io/util/copy.rs:97` | Bytes were copied |
| `DuplexStream` read/write (3× ) | `io/util/mem.rs:335,365,393` | Bytes were transferred |
| `Sleep::poll_elapsed` | `time/sleep.rs:398,402` | Timer fired |
| `ChildDropGuard::poll` | `process/mod.rs:1140` | Child process exited |
| `consume_budget()` | `task/coop/consume_budget.rs:33` | Always calls `made_progress()` — unconditional unit-consume |
| `Coop<F>::poll` | `task/coop/mod.rs:447` | Inner future returned `Poll::Ready` |

---

## `has_budget_remaining` — the non-consuming check

Two places read the budget without decrementing it:

**`Timeout::poll`** (`time/timeout.rs:211-248`): Snapshots `has_budget_remaining()` before polling the inner future, then checks it again after. If the transition was `true → false`, the inner future drained the budget; the delay future is then polled under `with_unconstrained` to guarantee the timeout is evaluated even if it would otherwise be blocked by an empty budget.

**Multi-thread LIFO loop** (`worker.rs:716`): As described above — guards whether to attempt the next LIFO task rather than deferring it to the global queue.

---

## End-to-end flow when budget hits zero mid-poll

1. A leaf (e.g. `Rx::recv`) calls `poll_proceed`. The cell is `Some(0)` → `decrement` fails.
2. `register_waker` defers the task's waker to the scheduler (no external I/O subscription changed).
3. `poll_proceed` returns `Poll::Pending`. `ready!` short-circuits every frame up the stack until `coop::budget`'s closure returns.
4. The scheduler's `run_task` closure exits. `ResetGuard::drop` resets the cell to the value before `budget()` was called (unconstrained for subsequent code on this thread).
5. The deferred waker fires in the scheduler's deferred-wakeup pass, re-enqueuing the task. On the next poll it gets a fresh `Budget(Some(128))`.


## Final answer

_Result event — success, 134 s, 17 turns._

I now have the complete picture. Here's a precise walkthrough of every layer.

---

## The budget check routine: `poll_proceed`

**`tokio/src/task/coop/mod.rs:343`**

```
poll_proceed(cx) → Poll<RestoreOnPending>
```

It reads the **thread-local `Budget(Option<u8>)`** via `context::budget`, then calls `Budget::decrement()` (line 413):

| Cell value | Meaning | Decrement result |
|---|---|---|
| `None` | Unconstrained (`task::unconstrained`) | Always succeeds, `hit_zero = false` |
| `Some(n > 0)` | Budget remaining | Succeeds; `hit_zero = (n-1 == 0)` |
| `Some(0)` | Already exhausted | Fails |

**When decrement succeeds** (budget ≥ 1):

1. Snapshot the pre-decrement cell value into `RestoreOnPending` (line 350).
2. Write the decremented value back to the cell (line 351).
3. If `hit_zero`, atomically increment `budget_forced_yield_count` metric.
4. Return `Poll::Ready(restore)`.

**When decrement fails** (budget == 0):

1. Call `register_waker(cx)` → `context::defer(cx.waker())` (line 397). Inside the runtime this defers to the scheduler's own waker mechanism, which **immediately re-queues the task** for the next scheduling round without touching external I/O readiness. Outside the runtime it calls `wake_by_ref()` directly.
2. Return `Poll::Pending`.

---

## The `RestoreOnPending` contract

The snapshot stored in `RestoreOnPending` is the budget value **before** the decrement. Its `Drop` impl (line 279) restores that pre-decrement value to the cell — **refunding** the budget unit — *unless* `made_progress()` was called first.

`made_progress()` (line 273) writes `Budget::unconstrained()` (`None`) into the cell inside `RestoreOnPending`. `Drop` then sees `is_unconstrained() == true` and skips the restore. Result: the decremented value stays, **consuming** the budget unit.

So the invariant is:
- **Leaf produced a value** → call `coop.made_progress()` before returning `Poll::Ready` → budget is consumed.
- **Leaf returned `Poll::Pending`** → drop `coop` without calling `made_progress()` → budget is refunded, next poll starts with the same count.

---

## Where the budget is installed

Each task gets a fresh `Budget(Some(128))` at the start of every scheduler poll, via `coop::budget(|| ...)` → `with_budget(Budget::initial(), f)`, which sets the cell and resets it on exit via `ResetGuard::drop`.

**Multi-thread scheduler** (`multi_thread/worker.rs:675`):

```rust
coop::budget(|| {
    task.run();             // polls the task future
    loop {                  // LIFO-slot drain
        if !coop::has_budget_remaining() {
            // push LIFO task to back of run queue, stop
        }
        lifo_task.run();    // inherits remaining budget
    }
})
```

The call to `task.run()` and any subsequent LIFO-slot tasks all share the **same 128-unit budget**. The LIFO drain uses `has_budget_remaining()` (not `poll_proceed`) as a gate — it's a coarser check that doesn't consume a unit, just decides whether to attempt another task.

**Current-thread scheduler** (`current_thread/mod.rs:373`): same `coop::budget(f)` wrapper around each task poll.

**`block_on` paths** (`park.rs:284`, `context/blocking.rs:90`): same wrapper, so synchronous `block_on` callers also get a budget.

**`block_in_place`** (`multi_thread/worker.rs:491`): calls `coop::stop()` to drain and save the remaining budget, then restores it via a `Drop` guard when the blocking section ends — blocking code runs completely unconstrained.

---

## Poll sites: every caller of `poll_proceed`

All callers use the `ready!` macro, so `Poll::Pending` propagates straight up:

| Call site | File | What `made_progress()` means |
|---|---|---|
| `Rx::recv`, `Rx::recv_many` | `sync/mpsc/chan.rs:295,355` | A message was dequeued |
| `Acquire::poll` | `sync/batch_semaphore.rs:598` | Permit was acquired (mutex locked, semaphore decremented) |
| `Inner::poll_recv` | `sync/oneshot.rs:1318` | Value received on oneshot |
| `Sender::poll_closed` | `sync/oneshot.rs:824` | Receiver was observed dropped |
| `Registration::poll_ready` | `runtime/io/registration.rs:151` | I/O readiness event delivered (covers all TCP/UDP/Unix sockets) |
| `Registration::async_io` | `runtime/io/registration.rs:222` | Same, via `poll_fn` wrapper |
| `JoinHandle::poll` | `runtime/task/join.rs:332` | Joined task completed |
| `CopyBuffer::poll_copy` | `io/util/copy.rs:97` | Bytes were copied |
| `DuplexStream` read/write (3× ) | `io/util/mem.rs:335,365,393` | Bytes were transferred |
| `Sleep::poll_elapsed` | `time/sleep.rs:398,402` | Timer fired |
| `ChildDropGuard::poll` | `process/mod.rs:1140` | Child process exited |
| `consume_budget()` | `task/coop/consume_budget.rs:33` | Always calls `made_progress()` — unconditional unit-consume |
| `Coop<F>::poll` | `task/coop/mod.rs:447` | Inner future returned `Poll::Ready` |

---

## `has_budget_remaining` — the non-consuming check

Two places read the budget without decrementing it:

**`Timeout::poll`** (`time/timeout.rs:211-248`): Snapshots `has_budget_remaining()` before polling the inner future, then checks it again after. If the transition was `true → false`, the inner future drained the budget; the delay future is then polled under `with_unconstrained` to guarantee the timeout is evaluated even if it would otherwise be blocked by an empty budget.

**Multi-thread LIFO loop** (`worker.rs:716`): As described above — guards whether to attempt the next LIFO task rather than deferring it to the global queue.

---

## End-to-end flow when budget hits zero mid-poll

1. A leaf (e.g. `Rx::recv`) calls `poll_proceed`. The cell is `Some(0)` → `decrement` fails.
2. `register_waker` defers the task's waker to the scheduler (no external I/O subscription changed).
3. `poll_proceed` returns `Poll::Pending`. `ready!` short-circuits every frame up the stack until `coop::budget`'s closure returns.
4. The scheduler's `run_task` closure exits. `ResetGuard::drop` resets the cell to the value before `budget()` was called (unconstrained for subsequent code on this thread).
5. The deferred waker fires in the scheduler's deferred-wakeup pass, re-enqueuing the task. On the next poll it gets a fresh `Budget(Some(128))`.

