# transcript: I'm planning a change to how a dispatched event reaches its handlers, so I need to understand the full journey of an event through the system. Starting from ...


💬 I'll trace this through the LSP tool, starting with the `Dispatcher` (the `Event` facade's backing class).
  ▸ ToolSearch(select:LSP)
  ▸ LSP(Dispatcher)
  ▸ Bash(find /home/bench/repos/laravel/src/Illuminate/Events -type f | sort)
  ▸ LSP(Illuminate\Events\Dispatcher)

💬 Good. Now let me read the key methods in sequence — `dispatch`, `invokeListeners`, `makeListener`, `createClassListener`, `createClassCallable`, `handlerShou...
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Events/Dispatcher.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Events/Dispatcher.php)

💬 Now let me read `CallQueuedListener` — the job that gets serialized onto the queue — and also check `broadcastEvent` to see how broadcasting flows.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Events/CallQueuedListener.php)
  ▸ LSP(BroadcastManager queue)

💬 Now let me look at how the queue worker picks up and executes the job — specifically `Worker` and how it invokes the job's `handle()`.
  ▸ LSP(Illuminate\Queue\Worker)
  ▸ LSP(BroadcastManager)

💬 Let me read `Worker::process()` and the `BroadcastManager::queue()` method.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/Worker.php)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/laravel/src/Illuminate/Broadcasting/BroadcastManager.php","line":1,"character":1})
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Broadcasting/BroadcastManager.php)
  ▸ LSP(BroadcastEvent job)
  ▸ LSP(BroadcastEvent)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Broadcasting/BroadcastEvent.php)

💬 I have everything I need. Here's the full event journey through the code.  ---  ## The full event dispatch pipeline  ### Stage 1 — `Dispatcher::dispatch()` (...

──────── RESULT (success, 132705ms, 17 turns) ────────
I have everything I need. Here's the full event journey through the code.

---

## The full event dispatch pipeline

### Stage 1 — `Dispatcher::dispatch()` (line 280)

`Event::dispatch($event)` or calling the facade lands here. Two normalisation steps happen immediately:

**`parseEventAndPayload()`** (line 358) — if you pass an object, it becomes `$payload = [$eventObject]` and `$event` becomes its class name string. This is the canonical form used everywhere downstream.

Two early-exit branches before any listeners run:

- **`shouldDeferEvent()`** — if the event is registered in `$eventsToDefer` and `$deferringEvents` is true, the raw `func_get_args()` are stored in `$deferredEvents` and `null` is returned.
- **`ShouldDispatchAfterCommit`** (line 299) — if the event object implements this interface and a transaction manager is present, `invokeListeners()` is registered as a commit callback instead of being called now. The event waits for the DB transaction to succeed.

Otherwise it falls through to `invokeListeners()`.

---

### Stage 2 — `invokeListeners()` (line 320): broadcasting fork happens here

```
invokeListeners($event, $payload, $halt)
  ├─ shouldBroadcast($payload)  →  broadcastEvent($payload[0])    ← broadcast fork
  └─ foreach getListeners($event) as $listener → $listener($event, $payload)
```

**Broadcasting fork** — `shouldBroadcast()` (line 372) checks that `$payload[0]` implements `ShouldBroadcast` and that `broadcastWhen()` returns true. If so, `broadcastEvent()` (line 398) is called **before** any listener is invoked. It does one thing:

```php
$this->container->make(BroadcastFactory::class)->queue($event);
```

The broadcast path and the listener path are fully parallel — one does not affect the other.

---

### Stage 3 — listener resolution: `getListeners()` → `makeListener()` (lines 409, 484)

`getListeners()` assembles three pools and merges them:

1. **Direct** — `$this->listeners[$eventName]` run through `prepareListeners()`.
2. **Wildcard** — `$this->wildcards` patterns matched via `Str::is()`, cached in `$wildcardsCache`.
3. **Interface** — `class_implements($eventName)` checked against `$this->listeners` for any registered interface listeners.

Each raw listener (string class name, `[class, method]` array, or Closure) is passed to `makeListener()`:

- Closures are wrapped in a thin adapter that handles `$wildcard` argument spreading.
- String/array class listeners go to `createClassListener()` (line 510), which returns a closure that calls `createClassCallable()` when actually invoked.

`createClassCallable()` (line 529) is the fork point for queued vs synchronous:

```php
[$class, $method] = $this->parseClassCallable($listener);  // defaults method to "handle"

if ($this->handlerShouldBeQueued($class)) {              // ← ShouldQueue check
    return $this->createQueuedHandlerCallable($class, $method);
}

$listener = $this->container->make($class);              // ← synchronous path
return $this->handlerShouldBeDispatchedAfterDatabaseTransactions($listener)
    ? $this->createCallbackForListenerRunningAfterCommits($listener, $method)
    : [$listener, $method];
```

`handlerShouldBeQueued()` (line 570) uses `ReflectionClass` to check that the listener class implements `Contracts\Queue\ShouldQueue`. If yes, the listener is **never instantiated** at dispatch time — the queue path takes over.

---

### Stage 4 — handing off to the queue: `queueHandler()` (line 660)

`createQueuedHandlerCallable()` (line 588) returns a closure. When invoked by the foreach loop in `invokeListeners()`, that closure:

1. Clones any object arguments (so later mutations don't affect the serialised payload).
2. Calls `handlerWantsToBeQueued()` (line 641) — instantiates the listener and calls `shouldQueue($event)` if that method exists, giving the listener an opt-out.
3. Calls `queueHandler($class, $method, $arguments)`.

`queueHandler()` does the real work:

**`createListenerAndJob()`** (line 706) — instantiates the listener *without* calling its constructor (`newInstanceWithoutConstructor()`) to read its properties cheaply, then constructs:

```php
new CallQueuedListener($class, $method, $arguments)
```

**`propagateListenerOptions()`** (line 722) — copies every queue-relevant property from the listener class onto the job: `tries`, `backoff`, `timeout`, `failOnTimeout`, `retryUntil`, `maxExceptions`, `deleteWhenMissingModels`, `shouldBeEncrypted`, `afterCommit`, `messageGroup`, middleware pipeline, `uniqueId`/`uniqueFor`, and the deduplicator.

Back in `queueHandler()`, if `$job->shouldBeUnique`, a `UniqueLock` is attempted before pushing (failed lock = drop silently). Then:

- Connection resolved from `viaConnection()` → `#[Connection]` attribute → queue route config.
- Queue name from `viaQueue()` → `#[Queue]` attribute → queue route config.
- Delay from `withDelay()` → `#[Delay]` attribute.

Finally: `$connection->pushOn($queue, $job)` or `->laterOn($queue, $delay, $job)`.

---

### Stage 5 — the job on the wire: `CallQueuedListener` (Events/CallQueuedListener.php)

This is an ordinary `ShouldQueue` job. It serialises to the queue backend with three core fields:

```php
$this->class  = 'App\Listeners\SendWelcomeEmail';
$this->method = 'handle';
$this->data   = [$eventObject];    // the event, serialised with PHP's model binding
```

Plus all the propagated queue options. `$this->data` may be stored as a PHP-serialised string when the driver serialises the job payload.

---

### Stage 6 — queue worker picks it up: `Worker::process()` (line 534)

The `php artisan queue:work` daemon loops through `getNextJob()` → `runJob()` → `process()`. The core of `process()`:

```php
$job->fire();    // the raw driver-level job object
```

`$job` here is the driver-level wrapper (e.g. `RedisJob`, `DatabaseJob`). Its `fire()` method deserialises the stored payload, resolves the `ShouldQueue` class out of the container, and calls `handle()` on it — which is `CallQueuedListener::handle()`.

**`CallQueuedListener::handle()`** (line 133):

```php
public function handle(Container $container)
{
    $this->prepareData();   // unserialises $this->data if it came back as a string

    $handler = $this->setJobInstanceIfNecessary(
        $this->job, $container->make($this->class)   // real container resolution
    );

    $handler->{$this->method}(...array_values($this->data));
}
```

`setJobInstanceIfNecessary()` (line 199) checks if the listener uses `InteractsWithQueue` and if so calls `$instance->setJob($job)`, giving the listener access to `$this->release()`, `$this->delete()`, etc.

The final line is the actual listener invocation — `App\Listeners\SendWelcomeEmail::handle($event)`.

If it fails: `CallQueuedListener::failed()` (line 216) resolves the listener and calls `$handler->failed($event, $e)` if that method exists.

---

### The broadcasting path in full

Back at Stage 2, when `broadcastEvent()` is called, it delegates to `BroadcastManager::queue()` (line 188):

```
BroadcastManager::queue($event)
  ├─ ShouldBroadcastNow?  →  Bus::dispatchNow(new BroadcastEvent($event))   ← synchronous
  └─ default              →  Queue::connection(...)->pushOn($queue, new BroadcastEvent($event))
```

`BroadcastEvent` is its own `ShouldQueue` job. It stores the event object as `$this->event`. When the worker picks it up, `BroadcastEvent::handle(BroadcastingFactory $manager)` (line 90):

1. Gets the broadcast name — `$event->broadcastAs()` or `get_class($event)`.
2. Gets channels from `$event->broadcastOn()`.
3. Assembles the payload from `$event->broadcastWith()` if defined, or by reflecting over all public properties.
4. For each connection in `broadcastConnections()` (or just `[null]` for the default): calls `$manager->connection($connection)->broadcast($channels, $name, $payload)` — this is the call that actually hits Pusher, Reverb, Ably, Redis, or whichever driver is configured.

---

### How the stages connect — summary map

```
Event::dispatch($event)
  └─ Dispatcher::dispatch()
       ├─ ShouldDispatchAfterCommit → deferred until DB commit
       └─ invokeListeners()
            ├─ shouldBroadcast()
            │    └─ BroadcastManager::queue()
            │         ├─ ShouldBroadcastNow → BroadcastEvent synchronously via Bus
            │         └─ default → BroadcastEvent pushed to queue
            │              └─ [worker] BroadcastEvent::handle()
            │                   └─ $manager->connection()->broadcast()  → WebSocket backend
            │
            └─ foreach getListeners()   (direct + wildcard + interface)
                 └─ makeListener() → createClassListener() → createClassCallable()
                       ├─ ShouldQueue?  → createQueuedHandlerCallable()
                       │    └─ [on invocation] queueHandler()
                       │         ├─ CallQueuedListener($class, $method, $event)
                       │         ├─ propagateListenerOptions()
                       │         └─ Queue::connection()->pushOn($queue, $job)
                       │              └─ [worker] Worker::process() → $job->fire()
                       │                   └─ CallQueuedListener::handle()
                       │                        └─ $container->make($class)->handle($event)
                       │
                       ├─ ShouldHandleEventsAfterCommit → deferred until DB commit
                       └─ synchronous → [$listener, 'handle']($event)
```

Key design points to note for your change:
- `createClassCallable()` is the single fork point between sync, after-commit, and queued listener paths — any change to routing logic lives there.
- `propagateListenerOptions()` is the exhaustive list of everything that can be transferred from a listener class onto its job — if you add a new queue attribute to listeners, this is where it gets copied.
- The broadcast job (`BroadcastEvent`) and the listener job (`CallQueuedListener`) are pushed to the queue independently and have no ordering guarantee relative to each other.
- `CallQueuedListener::handle()` calls `prepareData()` first — the event object in `$this->data` may need to be PHP-unserialized at that point if the queue driver stored it as a string.
