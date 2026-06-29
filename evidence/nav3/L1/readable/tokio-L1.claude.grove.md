# transcript: I'm trying to reason about the per-task memory footprint of a Tokio task and how a task is represented once it's been spawned, before I tune its allocation b...


💬 Let me load the grove tools and map the task module structure first.
  ▸ ToolSearch(select:mcp__grove__map,mcp__grove__outline,mcp__grove__source,mcp__grove__symbols,mcp__grove__definition)

💬 Now let me map the task module and get the outline of the core task files simultaneously.
  ▸ mcp__grove__map({"dir":"tokio/src/runtime/task"})
  ▸ mcp__grove__outline({"file":"tokio/src/runtime/task/core.rs"})

💬 Good, I can see the full struct layout. Let me read the actual source for the key types and the Stage enum.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#Cell@126"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#Header@168"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#Stage@221"})

💬 Now get `Core`, `CoreStage`, `Trailer`, and the `Vtable` definition.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#Core@148"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#CoreStage@137"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#Trailer@201"})
  ▸ mcp__grove__symbols({"dir":"tokio/src/runtime/task","name":"Vtable"})

💬 Now get the `Vtable` struct and the pointer-arithmetic navigation methods from `Header`.
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/raw.rs#Vtable@24"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#get_trailer@456"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/core.rs#get_scheduler@470"})

💬 Let me also grab `State` to complete the scheduling bookkeeping picture.
  ▸ mcp__grove__symbols({"dir":"tokio/src/runtime/task","name":"State","kind":"struct"})
  ▸ mcp__grove__source({"id":"rust:tokio/src/runtime/task/state.rs#State@6"})
  ▸ Bash(grep -n "const\|RUNNING\|COMPLETE\|NOTIFIED\|JOIN\|CANCELLED\|REF_COUNT\|LIFECYCLE\|MASK" tokio/src/runtime/task/state.rs | head -40)

💬 I have everything I need. Here is the complete picture.  ---  ## The task allocation: `Cell<T, S>`  Every spawned task is a **single heap allocation** of typ...

──────── RESULT (success, 109127ms, 17 turns) ────────
I have everything I need. Here is the complete picture.

---

## The task allocation: `Cell<T, S>`

Every spawned task is a **single heap allocation** of type `Cell<T, S>` (`core.rs:126`). It is three fields, in order:

```
┌──────────────────────────────────┐  ← the raw pointer the runtime passes everywhere
│  Header                          │  hot, type-erased, always at offset 0
├──────────────────────────────────┤
│  Core<T, S>                      │  typed body: scheduler handle + the stage
├──────────────────────────────────┤
│  Trailer                         │  cold: consumer waker + owned-list links
└──────────────────────────────────┘
```

---

### 1. `Header` — hot, type-erased

```rust
pub(crate) struct Header {
    pub(super) state:      State,                              // AtomicUsize — scheduling bits
    pub(super) queue_next: UnsafeCell<Option<NonNull<Header>>>,// intrusive run-queue link
    pub(super) vtable:     &'static Vtable,                    // fn-pointer table + byte offsets
    pub(super) owner_id:   UnsafeCell<Option<NonZeroU64>>,     // which OwnedTasks list owns this
    // cfg(tokio_unstable, tracing): tracing_id
}
```

The runtime only ever holds a `NonNull<Header>`. Because `Header` is the *first* field of `Cell`, that pointer **is** a pointer to the whole allocation — no arithmetic needed to reach it.

**`state: State`** — a single `AtomicUsize`, packed with all scheduling bookkeeping:

| bits | constant | meaning |
|------|----------|---------|
| 0 | `RUNNING` (0b01) | someone is polling this task right now |
| 1 | `COMPLETE` (0b10) | future returned `Ready`, output is stored |
| 2 | `NOTIFIED` | task is sitting in a run queue |
| 3 | `JOIN_INTEREST` | a `JoinHandle` exists |
| 4 | `JOIN_WAKER` | consumer's waker is live in `Trailer.waker` |
| 5 | `CANCELLED` | abort was requested |
| 6+ | `REF_COUNT_MASK` | reference count (shifted up by 6) |

`RUNNING` and `COMPLETE` together form the lifecycle — they are mutually exclusive. The initial state (`INITIAL_STATE`) starts with ref-count=3 (the task itself, the `JoinHandle`, and the `Notified` handle), plus `JOIN_INTEREST | NOTIFIED` set.

**`queue_next`** is the intrusive singly-linked-list field used by the injection queue and per-worker run queues. When a task is enqueued, this is set to point at the next task's header.

**`vtable: &'static Vtable`** is how the type-erased runtime recovers the concrete types. It is set once at `spawn` time with the monomorphized `<T, S>` instantiation and never changes. It carries both function pointers and byte offsets:

```rust
pub(super) struct Vtable {
    pub(super) poll:                  unsafe fn(NonNull<Header>),
    pub(super) schedule:              unsafe fn(NonNull<Header>),
    pub(super) dealloc:               unsafe fn(NonNull<Header>),
    pub(super) try_read_output:       unsafe fn(NonNull<Header>, *mut (), &Waker),
    pub(super) drop_join_handle_slow: unsafe fn(NonNull<Header>),
    pub(super) drop_abort_handle:     unsafe fn(NonNull<Header>),
    pub(super) shutdown:              unsafe fn(NonNull<Header>),
    // navigation: byte distances from the Header pointer to each typed sub-field
    pub(super) trailer_offset:        usize,
    pub(super) scheduler_offset:      usize,
    pub(super) id_offset:             usize,
}
```

Each function pointer casts the `NonNull<Header>` straight to `*mut Cell<T, S>` (offset 0, no arithmetic) to reach the concrete type. The offset fields let everything *else* navigate without that cast.

---

### 2. `Core<T, S>` — the typed body

```rust
pub(super) struct Core<T: Future, S> {
    pub(super) scheduler: S,         // scheduler handle — used when re-queuing
    pub(super) task_id:   Id,        // Id baked into JoinError on panic/cancel
    pub(super) stage:     CoreStage<T>, // ← THE field that flips
}
```

`S` is a scheduler handle (e.g. a `Arc<worker::Shared>` in the multi-thread scheduler). The runtime reaches it from a bare `NonNull<Header>` via:

```rust
// Header::get_scheduler<S>():
let offset = me.as_ref().vtable.scheduler_offset;
me.as_ptr().cast::<u8>().add(offset).cast::<S>()
```

---

### 3. `CoreStage<T>` — the field that flips

```rust
pub(super) struct CoreStage<T: Future> {
    stage: UnsafeCell<Stage<T>>,
}

pub(super) enum Stage<T: Future> {
    Running(T),                         // live future, being polled
    Finished(super::Result<T::Output>), // completed output (or JoinError)
    Consumed,                           // JoinHandle took the output
}
```

The `UnsafeCell<Stage<T>>` is the single memory region that holds **either** the running future **or** the finished output. The transition happens in `Core::store_output` (`core.rs:403`) immediately after `poll` returns `Poll::Ready`:

```
Running(T)  ──[poll returns Ready]──►  Finished(Result<T::Output>)
                                              │
                                  [JoinHandle polls, takes value]
                                              │
                                              ▼
                                         Consumed
```

Because `Running(T)` and `Finished(T::Output)` are variants of the same `UnsafeCell<Stage<T>>`, they share the same memory: the allocation is sized to `max(size_of::<T>(), size_of::<T::Output>())` plus the discriminant. The future is dropped in-place, then the output is written into the same bytes.

---

### 4. `Trailer` — cold, consumer-facing

```rust
pub(super) struct Trailer {
    pub(super) owned: linked_list::Pointers<Header>, // prev/next in OwnedTasks intrusive list
    pub(super) waker: UnsafeCell<Option<Waker>>,      // the JoinHandle's waker
    pub(super) hooks: TaskHarnessScheduleHooks,        // unstable lifecycle hooks
}
```

`Trailer` is at the end because it is **cold path** — it is only touched when a `JoinHandle` is polled (to register or wake `waker`) and when the task is inserted into or removed from the `OwnedTasks` list. The runtime navigates to it via `vtable.trailer_offset` with the same byte-pointer arithmetic as `get_scheduler`. When `store_output` runs, it also calls `Trailer::wake_join()` to unpark the awaiting `JoinHandle`.

---

### Summary as memory layout

```
Cell<T, S> heap allocation
┌──────────────────────────────────────────────────────────┐
│ Header                                                   │
│   state:      AtomicUsize   [lifecycle|notified|join|rc] │
│   queue_next: *Header        [run-queue intrusive link]  │
│   vtable:     &'static Vtable [fn ptrs + offsets]        │
│   owner_id:   Option<NonZeroU64>                         │
├──────────────────────────────────────────────────────────┤
│ Core<T, S>                                               │
│   scheduler: S               [re-queue handle]           │
│   task_id:   Id                                          │
│   stage: UnsafeCell<Stage<T>>  ◄── flips Running↔Finished│
├──────────────────────────────────────────────────────────┤
│ Trailer                                                  │
│   owned:  Pointers<Header>   [OwnedTasks list links]     │
│   waker:  Option<Waker>      [JoinHandle's waker]        │
│   hooks:  TaskHarnessScheduleHooks                       │
└──────────────────────────────────────────────────────────┘
```

The per-task footprint is therefore dominated by `max(size_of::<T>(), size_of::<T::Output>())` — whatever the future itself carries — plus a fixed overhead of `Header` (one `AtomicUsize`, one pointer, one `&'static` ref, one `Option<NonZeroU64>`) and `Trailer` (two list pointers, one `Option<Waker>`, hooks). There is no separate allocation for the future; it lives directly inside the `Cell`.
