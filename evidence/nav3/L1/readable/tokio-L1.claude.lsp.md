# transcript: I'm trying to reason about the per-task memory footprint of a Tokio task and how a task is represented once it's been spawned, before I tune its allocation b...


💬 I'll use the LSP to navigate the task internals starting from the core types.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(Task)
  ▸ LSP(Header)
  ▸ Bash(find /home/bench/repos/tokio/tokio/src/runtime/task -name "*.rs" | sort)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/core.rs)

💬 Now let me read `raw.rs` to see the `Vtable` definition and how offsets are computed.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/raw.rs)

💬 Let me also check `state.rs` to understand the atomic state word, and the `mod.rs` for the public `Task`/`Notified` wrappers.
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/state.rs)
  ▸ Read(/home/bench/repos/tokio/tokio/src/runtime/task/mod.rs)

💬 I now have everything needed to give a complete picture. Here is the full anatomy:  ---  ## The task container: `Cell<T, S>`  Every spawned task is a single ...

──────── RESULT (success, 90768ms, 9 turns) ────────
I now have everything needed to give a complete picture. Here is the full anatomy:

---

## The task container: `Cell<T, S>`

Every spawned task is a single heap allocation — a `Box<Cell<T, S>>` — defined in `tokio/src/runtime/task/core.rs:126`:

```
Cell<T, S>   #[repr(C)], cache-line aligned (64 / 128 / 256 bytes by arch)
├── header:  Header          ← always at offset 0
├── core:    Core<T, S>      ← typed middle
└── trailer: Trailer         ← cold consumer data
```

`#[repr(C)]` is mandatory: the comment at `core.rs:38` explains that the entire task is referenced interchangeably as `*mut Cell<T, S>` and `*mut Header`, so `Header` must sit at the very front with no leading padding.

---

### 1. `Header` — the hot, type-erased head (`core.rs:168`)

```rust
pub(crate) struct Header {
    pub(super) state:      State,                         // AtomicUsize — all scheduling flags + ref count
    pub(super) queue_next: UnsafeCell<Option<NonNull<Header>>>,  // injection-queue intrusive link
    pub(super) vtable:     &'static Vtable,               // fn-ptr table that re-introduces T and S
    pub(super) owner_id:   UnsafeCell<Option<NonZeroU64>>,// which OwnedTasks collection owns this
    // (unstable) tracing_id: Option<tracing::Id>
}
```

**`State`** (`state.rs:6`) is one `AtomicUsize`, bit-packed:

| bits | name | meaning |
|---|---|---|
| 0 | `RUNNING` | lock bit: this task is being polled right now |
| 1 | `COMPLETE` | set-once when the future has finished and been dropped |
| 2 | `NOTIFIED` | a `Notified` reference exists (task is enqueued) |
| 3 | `JOIN_INTEREST` | a `JoinHandle` exists |
| 4 | `JOIN_WAKER` | access-control bit for the waker stored in `Trailer` |
| 5 | `CANCELLED` | abort requested |
| 6.. | ref count | (`INITIAL_STATE` starts at 3 refs: OwnedTask + Notified + JoinHandle) |

**`vtable`** is a `&'static Vtable` baked once per `(T, S)` type pair at spawn time (`raw.rs:61`). It holds:
- Seven function pointers (`poll`, `schedule`, `dealloc`, `try_read_output`, `drop_join_handle_slow`, `drop_abort_handle`, `shutdown`) — each casts the `NonNull<Header>` back to `Harness<T, S>` to re-introduce the erased types.
- Four compile-time byte offsets (`trailer_offset`, `scheduler_offset`, `id_offset`, optionally `spawn_location_offset`) computed by `OffsetHelper<T, S>` const fns following `#[repr(C)]` layout rules (`raw.rs:84`). These are how type-erased code starting at a bare `*mut Header` navigates to any other field.

All scheduler access to a task starts with `RawTask { ptr: NonNull<Header> }` (`raw.rs:20`). Dispatching is always: read `header.vtable`, call the fn-ptr, which reconstructs `Harness<T, S>`. Never storing `T` or `S` in the header.

---

### 2. `Core<T, S>` — the typed middle (`core.rs:148`)

```rust
pub(super) struct Core<T: Future, S> {
    pub(super) scheduler: S,           // first field ⟹ same offset as Core itself
    pub(super) task_id:   Id,
    // (unstable) spawned_at: &'static Location<'static>
    pub(super) stage:     CoreStage<T>,
}
```

`scheduler` is first by design: `SCHEDULER_OFFSET` in the vtable is just `get_core_offset(header_size, core_align)` — the offset of `Core` from the start of `Cell` — so a type-erased `Header` pointer plus that offset gives a `*mut S` directly.

**`CoreStage<T>`** is a thin wrapper over `UnsafeCell<Stage<T>>`.

---

### 3. `Stage<T>` — the field that flips (`core.rs:221`)

```rust
pub(super) enum Stage<T: Future> {
    Running(T),                        // holds the live future
    Finished(super::Result<T::Output>),// holds the completed output
    Consumed,                          // both have been taken
}
```

This is the field that overlaps the future's storage with the output storage:

1. **At spawn**: `Stage::Running(future)` — the future is in-place inside the enum.
2. **When `poll` returns `Ready(output)`**: `Core::poll` immediately calls `drop_future_or_output()` which writes `Stage::Consumed` into the cell, dropping the future in-place (`core.rs:391`). The output value is returned up to the harness.
3. **Harness stores result**: `Core::store_output(Ok(output))` writes `Stage::Finished(output)` (`core.rs:403`).
4. **`JoinHandle::poll` reads it**: `Core::take_output()` does a `mem::replace(…, Stage::Consumed)`, moving out the `Result<T::Output>` and leaving `Consumed` again (`core.rs:415`).

The mutual exclusion for this field is documented at `mod.rs:70`: while `COMPLETE` is zero, the `RUNNING` bit acts as a lock; once `COMPLETE` is set, the `JoinHandle` has exclusive access.

---

### 4. `Trailer` — cold consumer data (`core.rs:201`)

Placed after `Core` so that the hot path (polling) never touches these cache lines:

```rust
pub(super) struct Trailer {
    pub(super) owned: linked_list::Pointers<Header>, // intrusive list node for OwnedTasks (two NonNull ptrs)
    pub(super) waker: UnsafeCell<Option<Waker>>,      // JoinHandle's stored waker
    pub(super) hooks: TaskHarnessScheduleHooks,        // unstable schedule hooks
}
```

`owned` links the task into the runtime's `OwnedTasks` doubly-linked list, which is what lets a runtime shutdown walk every live task and cancel them. `waker` is written by the `JoinHandle` when it suspends waiting for the result, and read/consumed by the executor when it stores the output and wakes the joiner.

---

### Memory layout summary

```
Box<Cell<T, S>>
│
├─[0]── Header (hot, type-erased)
│         state:      AtomicUsize     — flags + ref count
│         queue_next: *mut Header     — injection queue link (owned by Notified ref)
│         vtable:     &'static Vtable — fn ptrs + field offsets keyed on (T, S)
│         owner_id:   Option<u64>     — which OwnedTasks set
│
├─[sizeof(Header), aligned]── Core<T, S> (typed)
│         scheduler:  S              — vtable.scheduler_offset points here
│         task_id:    Id             — vtable.id_offset points here
│         stage:      UnsafeCell<Stage<T>>   ← THE flip field
│                     ├─ Running(T)          while future is live
│                     ├─ Finished(Result<T::Output>)  after poll returns Ready
│                     └─ Consumed            after JoinHandle takes the value
│
└─[…]── Trailer (cold)     ← vtable.trailer_offset points here
          owned:  Pointers<Header>   — OwnedTasks linked-list node
          waker:  Option<Waker>      — JoinHandle's park waker
          hooks:  TaskHarnessScheduleHooks
```

The key design points for memory sizing:
- `Cell` is padded to a full cache line (128 bytes on x86-64/aarch64) to prevent false sharing between tasks on different threads.
- `Stage<T>` is the dominant contributor to size: it must hold either the full `T` state machine or the `T::Output`, so its size is `max(size_of::<T>(), size_of::<Result<T::Output>>())` plus enum discriminant.
- `Header` is explicitly tested to fit within 8 pointer-widths (`core.rs:570`), keeping the hot scheduling data tight.
