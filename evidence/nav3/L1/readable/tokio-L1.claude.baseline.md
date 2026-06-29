# transcript: I'm trying to reason about the per-task memory footprint of a Tokio task and how a task is represented once it's been spawned, before I tune its allocation b...


💬 Let me read through the task internals directly.
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/task -type f | sort)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/task -type f | sort 2>/dev/null || echo "not found")
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/core.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/mod.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/raw.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/state.rs)

💬 Let me also check the harness to see the poll→store_output sequence.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/harness.rs)

💬 Now I have the full picture. Here's a thorough walkthrough.  ---  ## The task allocation: `Box<Cell<T, S>>`  Every spawned task is a single heap allocation —...

──────── RESULT (success, 153286ms, 12 turns) ────────
Now I have the full picture. Here's a thorough walkthrough.

---

## The task allocation: `Box<Cell<T, S>>`

Every spawned task is a single heap allocation — `Box<Cell<T, S>>` — where `T` is the concrete future type and `S` is the concrete scheduler type. The struct is `#[repr(C)]` and cache-line padded (128 bytes aligned on x86_64/aarch64/ppc64) with exactly three fields in order:

```
// core.rs:126
pub(super) struct Cell<T: Future, S> {
    pub(super) header:  Header,       // hot, type-erased
    pub(super) core:    Core<T, S>,   // generic: holds the future or output
    pub(super) trailer: Trailer,      // cold: JoinHandle waker + list links
}
```

The invariant that `Header` is field 0 is load-bearing: because the struct is `repr(C)`, a pointer to `Cell<T,S>` and a pointer to its `Header` are the same address. Every handle the runtime passes around — `RawTask`, `Task<S>`, `Notified<S>`, wakers — is ultimately a `NonNull<Header>`, which is also implicitly `NonNull<Cell<T,S>>`.

---

## The hot header: `Header`

```
// core.rs:168
pub(crate) struct Header {
    pub(super) state:    State,
    pub(super) queue_next: UnsafeCell<Option<NonNull<Header>>>,
    pub(super) vtable:  &'static Vtable,
    pub(super) owner_id: UnsafeCell<Option<NonZeroU64>>,
    // (tokio_unstable) tracing_id: Option<tracing::Id>
}
```

A `#[test]` at `core.rs:569` asserts this stays ≤ 8 pointer-widths to guarantee it fits in a single cache line.

### `state: State` — single `AtomicUsize`, all bookkeeping

The upper bits are the ref-count (shifted left by 6). The lower 6 bits are flags:

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | `RUNNING` | Task is currently being polled — acts as a mutex on `stage` |
| 1 | `COMPLETE` | Future has finished and been dropped; never unset |
| 2 | `NOTIFIED` | A `Notified` object exists (task is enqueued) |
| 3 | `JOIN_INTEREST` | A `JoinHandle` is still alive |
| 4 | `JOIN_WAKER` | JoinHandle's waker has been stored in the trailer |
| 5 | `CANCELLED` | Task should be cancelled at next opportunity |

Initial state (`state.rs:61`) is `(REF_ONE * 3) | JOIN_INTEREST | NOTIFIED` — three ref-counts for the `OwnedTask` handle, the initial `Notified`, and the `JoinHandle`.

The `RUNNING` bit is the in-task lock: only the thread that successfully flips it from 0→1 may touch `core.stage`. When `COMPLETE` is 1, ownership of `stage` transfers to the `JoinHandle`.

### `queue_next` — intrusive injection queue link

When a task is enqueued in the scheduler's injection queue (a lock-free MPMC queue), this field is the "next" pointer in that intrusive linked list. It is owned exclusively by the `Notified` wrapper while the task sits in the queue.

### `vtable: &'static Vtable` — type recovery

```
// raw.rs:24
pub(super) struct Vtable {
    pub(super) poll:                unsafe fn(NonNull<Header>),
    pub(super) schedule:            unsafe fn(NonNull<Header>),
    pub(super) dealloc:             unsafe fn(NonNull<Header>),
    pub(super) try_read_output:     unsafe fn(NonNull<Header>, *mut (), &Waker),
    pub(super) drop_join_handle_slow: unsafe fn(NonNull<Header>),
    pub(super) drop_abort_handle:   unsafe fn(NonNull<Header>),
    pub(super) shutdown:            unsafe fn(NonNull<Header>),
    // Compile-time byte offsets from the Header pointer
    pub(super) trailer_offset:      usize,
    pub(super) scheduler_offset:    usize,
    pub(super) id_offset:           usize,
    // (tokio_unstable) spawn_location_offset: usize,
}
```

The vtable does two jobs:

**1. Typed function dispatch.** Each fn pointer recovers the concrete types by recasting: `raw.rs:342` shows `poll<T,S>` does `Harness::<T, S>::from_raw(ptr)` which is just `ptr.cast::<Cell<T, S>>()`. Same pattern for every other entry.

**2. Typed field navigation.** The `*_offset` fields are compile-time constants computed by `OffsetHelper::<T, S>` using the `#[repr(C)]` layout algorithm (`raw.rs:84–117`). Reaching the trailer from a bare header pointer: `core.rs:456–459`:

```rust
pub(super) unsafe fn get_trailer(me: NonNull<Header>) -> NonNull<Trailer> {
    let offset = me.as_ref().vtable.trailer_offset;
    let trailer = me.as_ptr().cast::<u8>().add(offset).cast::<Trailer>();
    NonNull::new_unchecked(trailer)
}
```

The scheduler and task ID use the same pattern via `scheduler_offset` and `id_offset`. These offsets let type-erased callers reach typed fields without knowing `T` or `S`, without a second allocation, and without any runtime dispatch overhead beyond a pointer add.

### `owner_id` — OwnedTasks membership

Identifies which `OwnedTasks` or `LocalOwnedTasks` list holds this task. Set once at insertion (`OwnedTasks::bind`), then read-only. Used without synchronization for reads.

---

## The generic middle: `Core<T, S>`

```
// core.rs:148
pub(super) struct Core<T: Future, S> {
    pub(super) scheduler: S,       // first field — scheduler_offset points here
    pub(super) task_id:   Id,      // NonZeroU64
    // (tokio_unstable) spawned_at: &'static Location<'static>
    pub(super) stage: CoreStage<T>, // UnsafeCell<Stage<T>>
}
```

`scheduler` is the first field of `Core`, which is the second field of `Cell`, so `scheduler_offset = get_core_offset(sizeof::<Header>(), align_of::<Core<T,S>>())`. The scheduler handle `S` (e.g., `Arc<Handle>` for the multi-thread runtime) lives here, inline in the allocation.

---

## The pivotal field: `Stage<T>`

```
// core.rs:221
pub(super) enum Stage<T: Future> {
    Running(T),
    Finished(super::Result<T::Output>),
    Consumed,
}
```

This is the one field that flip-flops between the live future and the finished output. It lives inside `CoreStage<T>` which is just `UnsafeCell<Stage<T>>` — both `T` and `T::Output` live in-place in the heap allocation, no secondary allocation.

**Lifecycle of `stage`:**

1. **At spawn** (`core.rs:267`): `Stage::Running(future)` — the concrete future is in place.

2. **On poll, when ready** (`harness.rs:519–556`, `poll_future` function): a `Guard` installs `drop_future_or_output` as the panic handler. If no panic, the guard is forgotten, `Core::poll` returns the output value, and the sequence is:
   - `Core::poll` sees `Poll::Ready`, calls `self.drop_future_or_output()` → `Stage::Consumed` (drops `T` in place)
   - `poll_future` then calls `core.store_output(Ok(output))` → `Stage::Finished(Ok(output))`

3. **On cancellation** (`harness.rs:500–507`): `cancel_task` calls `drop_future_or_output()` → `Stage::Consumed`, then `store_output(Err(JoinError::cancelled(...)))` → `Stage::Finished(Err(...))`.

4. **When `JoinHandle` collects output** (`core.rs:418–424`): `take_output()` does `mem::replace(&mut *ptr, Stage::Consumed)`, returning the `Stage::Finished` value and leaving `Stage::Consumed` behind.

The access protocol enforced by the `State` bits: while `COMPLETE=0`, only the thread holding `RUNNING=1` may touch `stage`. After `COMPLETE=1`, the `JoinHandle` has exclusive access.

---

## The cold trailer: `Trailer`

```
// core.rs:201
pub(super) struct Trailer {
    pub(super) owned: linked_list::Pointers<Header>,  // intrusive OwnedTasks list ptrs
    pub(super) waker: UnsafeCell<Option<Waker>>,      // JoinHandle's waker
    pub(super) hooks: TaskHarnessScheduleHooks,        // optional terminate callback
}
```

Placed last in `Cell` because it is not touched on the poll hot path:

- `owned`: prev/next pointers for the `OwnedTasks` doubly-linked list. Owned exclusively by the `OwnedTask` reference type.
- `waker`: the `Waker` the `JoinHandle` deposited when it polled and found the task incomplete. The runtime calls `trailer.wake_join()` at completion. Concurrent access is mediated by the `JOIN_WAKER` bit in `State` (a six-rule protocol described in `mod.rs:76–120`).
- `hooks`: holds an optional `Arc<dyn Fn(TaskMeta)>` terminate callback; zero-cost when unused.

---

## Summary diagram

```
Box<Cell<T, S>>   (single heap allocation, cache-line aligned)
│
├── Header        (type-erased; same address as the Box)
│   ├── state     AtomicUsize   RUNNING|COMPLETE|NOTIFIED|JOIN_INTEREST|JOIN_WAKER|CANCELLED + refcount
│   ├── queue_next              intrusive injection-queue link (owned by Notified)
│   ├── vtable    &'static      fn ptrs (poll/dealloc/…) + byte offsets to reach Core/Trailer
│   └── owner_id                which OwnedTasks list holds this task
│
├── Core<T, S>    (generic; reachable via vtable.scheduler_offset)
│   ├── scheduler S             inline scheduler handle (e.g. Arc<Handle>)
│   ├── task_id   Id            NonZeroU64
│   └── stage     UnsafeCell<Stage<T>>   ← THE PIVOT
│                   Stage::Running(T)          while future is live
│                   Stage::Finished(Result<T::Output>)  after poll returns Ready
│                   Stage::Consumed            after JoinHandle takes output
│
└── Trailer       (cold; reachable via vtable.trailer_offset)
    ├── owned     Pointers<Header>   intrusive OwnedTasks list prev/next
    ├── waker     UnsafeCell<Option<Waker>>  JoinHandle's parked waker
    └── hooks     TaskHarnessScheduleHooks   optional terminate callback
```

Every handle in circulation (`RawTask`, `Task<S>`, `Notified<S>`, `JoinHandle`, `AbortHandle`, wakers) is ultimately a `NonNull<Header>` — 8 bytes — pointing at this single allocation. The vtable embedded in the header is what lets type-erased scheduler code reach the scheduler handle `S`, the task ID, the trailer, and dispatch typed operations like `poll` and `try_read_output` without carrying the type parameters `T` and `S` anywhere outside that vtable.
