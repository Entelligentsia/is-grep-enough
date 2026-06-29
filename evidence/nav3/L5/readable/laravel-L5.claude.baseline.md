# transcript: I'm planning a change to how a dispatched event reaches its handlers, so I need to understand the full journey of an event through the system. Starting from ...


💬 I'll map the full event dispatch pipeline across the Events, Queue, and Broadcasting components. Let me explore the key files.

  ▸ Agent(Map Laravel event dispatch pipeline)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/laravel/src/Illuminate/Events/ -type f -name "*.php" | head -20)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Events/Dispatcher.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Events/CallQueuedListener.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Events/QueuedClosure.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Events/InvokeQueuedClosure.php)
      ↳ ⟹ returned to parent


💬 Now let me check the queue worker side and the broadcasting path.

  ▸ Agent(Map queue worker job execution and broadcast event path)  ⟶ subagent:
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Queue/Worker.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Queue/CallQueuedHandler.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Events/Dispatcher.php)
      ↳ bash(find /home/bench/repos/laravel -type f -name "BroadcastManager.php" -o -name "BroadcastFactory.php" | head -5)
      ↳ bash(grep -r "class BroadcastFactory" /home/bench/repos/laravel/src/Illuminate/Broadcasting/ 2>/dev/null | head -1)
      ↳ Bash(find /home/bench/repos/laravel/src/Illuminate/Broadcasting -type f -name "*.php" | grep -i "broadcast")
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Broadcasting/BroadcastManager.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Broadcasting/BroadcastEvent.php)
      ↳ Bash(find /home/bench/repos/laravel/src/Illuminate/Queue -type f -name "Job.php" | head -1)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Queue/Jobs/Job.php)
      ↳ ⟹ returned to parent


💬 Here is the complete pipeline, stage by stage.  ---  ## 1. Firing the event — `Dispatcher::dispatch()`  `src/Illuminate/Events/Dispatcher.php:280`  `event($p...

──────── RESULT (success, 193607ms, 3 turns) ────────
Here is the complete pipeline, stage by stage.

---

## 1. Firing the event — `Dispatcher::dispatch()`

`src/Illuminate/Events/Dispatcher.php:280`

`event($payload)` or `Event::dispatch($payload)` both resolve the `Dispatcher` singleton and call `dispatch()`. The method first normalises its arguments: if you pass an object it uses the class name as the event name and wraps the object in a one-element array; if you pass a string it uses that as the name directly. Two early-exit paths exist before listeners are touched:

- **Deferred dispatch** (line ~299): if `shouldDeferEvent()` is true the event is buffered and flushed later by `defer()`.
- **After-commit dispatch** (line ~303): if the event object implements `ShouldDispatchAfterCommit` and a transaction manager is present, the whole dispatch is registered as a post-commit callback instead of running now.

If neither applies, execution falls through to `invokeListeners()`.

---

## 2. Resolving listeners — `invokeListeners()` / `getListeners()`

`Dispatcher.php:320` and `:409`

`invokeListeners()` calls `getListeners($eventName)`, which assembles three groups:

1. **Exact-name listeners** that were registered under the same string — run through `prepareListeners()` which calls `makeListener()` on each raw entry.
2. **Wildcard listeners** (`getWildcardListeners()`) whose patterns match the event name.
3. **Interface listeners** (`addInterfaceListeners()`) — if the event is an object, any listeners registered against interfaces that class implements are added.

`makeListener()` (`:484`) is the factory. For a string or `[Class, method]` it calls `createClassListener()`, which wraps `createClassCallable()`.

### `createClassCallable()` — the routing fork (`:529`)

This is where the pipeline splits into three paths:

```
parseClassCallable($listener)   →  [ClassName, 'handle']
  │
  ├─ handlerShouldBeQueued($class)?   implements ShouldQueue
  │    └─ YES → return createQueuedHandlerCallable($class, $method)
  │
  ├─ handlerShouldBeDispatchedAfterDatabaseTransactions($listener)?
  │    └─ YES → return createCallbackForListenerRunningAfterCommits(...)
  │
  └─ NO  → return [$listenerInstance, $method]  (sync, called immediately)
```

The sync path is straightforward — `invokeListeners` calls the `[$instance, 'handle']` callable directly.

---

## 3. The queued path — from `createQueuedHandlerCallable()` to the queue

`Dispatcher.php:588`

`createQueuedHandlerCallable()` returns a **closure** (not the listener itself). That closure is what `invokeListeners` actually invokes. When called with the event arguments it does two things:

1. **`handlerWantsToBeQueued($class, $arguments)`** (`:641`) — instantiates the listener and calls `shouldQueue($event)` on it if that method exists. This is the runtime opt-out: a listener that `implements ShouldQueue` can still decline to queue for a specific event instance by returning `false` from `shouldQueue()`. If the method doesn't exist the answer is always `true`.

2. **`queueHandler($class, $method, $arguments)`** (`:660`) when the above returns true.

### Inside `queueHandler()`

`createListenerAndJob()` (`:706`) does two things: it resolves the listener class out of the container *without* its constructor (to avoid side-effects), then constructs a `CallQueuedListener` job and calls `propagateListenerOptions()` (`:722`) on it. That method copies every queue-relevant property from the listener onto the job: `$tries`, `$backoff`, `$timeout`, `$maxExceptions`, `$failOnTimeout`, `$shouldBeEncrypted`, `$deleteWhenMissingModels`, middleware, and uniqueness settings.

Back in `queueHandler()`, the connection, queue name, and delay are resolved in priority order:

| Setting | Priority |
|---|---|
| Connection | `viaConnection()` → `#[Connection]` attribute → route resolution |
| Queue name | `viaQueue()` → `#[Queue]` attribute → route resolution |
| Delay | `withDelay()` → `#[Delay]` attribute |

The `CallQueuedListener` is then pushed: `connection->pushOn($queue, $job)` or `laterOn(...)` when there is a delay. The job's payload (serialised by the queue driver) stores three things: the **listener class name**, the **method name** (usually `handle`), and the **serialised event arguments**.

---

## 4. What `CallQueuedListener` carries

`src/Illuminate/Events/CallQueuedListener.php:120`

`CallQueuedListener` is a plain job class that the queue driver serialises. Its constructor just stores `$class`, `$method`, and `$data` (the event arguments array). The class also carries the propagated job options — tries, backoff, timeout, middleware — so the queue worker sees them directly without needing to look up the listener class.

---

## 5. Queue worker picks up the job

`src/Illuminate/Queue/Worker.php` → `Job::fire()` → `CallQueuedHandler`

The worker's daemon loop calls `runJob()` → `process()`. The key line in `process()` (`:553`) is:

```php
$job->fire();
```

`Job::fire()` (`:96` in `Jobs/Job.php`) deserialises the raw payload, reads `payload['job']` — which for all serialised commands is `Illuminate\Queue\CallQueuedHandler@call` — resolves that class, and calls `call($job, $data)` on it.

### `CallQueuedHandler::call()` (`:67`)

This is the general-purpose bridge for every queued command/job. It:

1. Calls `getCommand($data)` which unserialises `$data['command']` back into the `CallQueuedListener` object.
2. Calls `setJobInstanceIfNecessary()` so the listener can access `$this->job` if it uses the `InteractsWithQueue` trait.
3. Runs `dispatchThroughMiddleware($job, $command)` (`:131`), which pipes the `CallQueuedListener` through its own middleware stack and then calls `dispatcher->dispatchNow($command, $this->resolveHandler($job, $command))`.

`dispatchNow` resolves the handler for a `CallQueuedListener` — which is just the class itself — and calls its `handle()` method.

### `CallQueuedListener::handle()` (`:133`)

```
prepareData()          — unserialises $data if it's a string
container->make($class) — instantiates the actual listener class
setJobInstanceIfNecessary()
$listener->$method(...$data)   — e.g. $listener->handle($event)
```

The listener's `handle()` method finally runs with the original event object as its argument. If `handle()` throws, the worker handles retries and eventually calls `CallQueuedListener::failed()` (`:216`), which instantiates the listener and calls `failed($event, $exception)` on it if that method exists.

---

## 6. Broadcasting — the parallel path

`Dispatcher.php:372` and `src/Illuminate/Broadcasting/BroadcastManager.php:188`

**Broadcasting is not a listener.** It is a separate path that runs at the top of `invokeListeners()`, before the listener loop. `shouldBroadcast()` (`:372`) checks whether the first payload item implements `ShouldBroadcast` and whether `broadcastWhen()` returns true. If so, `broadcastEvent()` (`:398`) is called **in parallel with** the listener loop — the listeners still execute normally.

```php
// Dispatcher::invokeListeners() — simplified
if ($this->shouldBroadcast($payload)) {
    $this->broadcastEvent($payload[0]);   // ← separate path
}
foreach ($this->getListeners($event) as $listener) {
    $response = $listener($event, $payload);
    // ...
}
```

`broadcastEvent()` delegates to `BroadcastManager::queue($event)`:

- If the event implements `ShouldBroadcastNow`, it calls `dispatchNow(new BroadcastEvent(...))` — synchronous, no queue.
- Otherwise it wraps the event in a `BroadcastEvent` job and pushes it onto the queue (`connection->pushOn($queue, $broadcastEvent)`), using `broadcastQueue()` / `$broadcastQueue` / `$queue` properties to pick the queue name.

`BroadcastEvent` is its own job class (`src/Illuminate/Broadcasting/BroadcastEvent.php:90`). When the worker picks it up and calls `handle(BroadcastingFactory $manager)`, that method reads `broadcastOn()` for channels, `broadcastAs()` for the event name, builds the payload via `broadcastWith()`, and calls `$manager->connection()->broadcast(...)` to push to Pusher/Reverb/Ably/etc.

The key difference from the listener path: broadcast jobs are pushed **directly as `BroadcastEvent` instances**, not wrapped in `CallQueuedHandler`. There is no `CallQueuedListener` in the broadcast chain.

---

## How the stages connect — summary

```
event(MyEvent)
│
Dispatcher::dispatch()
├─ deferred? → buffer
├─ ShouldDispatchAfterCommit? → register with transaction manager
└─ invokeListeners()
    ├─ shouldBroadcast()?
    │   └─ BroadcastManager::queue()
    │       ├─ ShouldBroadcastNow → dispatchNow(BroadcastEvent)
    │       └─ else → queue->pushOn(BroadcastEvent)   [path A]
    │
    └─ foreach getListeners()
        createClassCallable()
        ├─ sync listener   → call directly             [path B]
        ├─ after-commit    → register with tx manager  [path C]
        └─ ShouldQueue listener
            createQueuedHandlerCallable()
            └─ queueHandler()
                propagateListenerOptions()
                queue->pushOn(CallQueuedListener)      [path D]

--- later, in the worker ---

path A:  Worker → Job.fire() → BroadcastEvent.handle() → broadcaster.broadcast()
path D:  Worker → Job.fire() → CallQueuedHandler.call()
                               → CallQueuedListener.handle()
                               → YourListener.handle($event)
```

The two queue paths (A and D) share the same worker machinery (`Worker::process` → `Job::fire`) but diverge at the job class: `BroadcastEvent` executes itself, while `CallQueuedListener` is a thin envelope that re-instantiates the original listener class and delegates back to it.
