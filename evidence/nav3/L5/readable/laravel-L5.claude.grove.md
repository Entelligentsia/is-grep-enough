# transcript: I'm planning a change to how a dispatched event reaches its handlers, so I need to understand the full journey of an event through the system. Starting from ...


💬 I'll trace this flow structurally using grove. Let me load the tools and explore the key files in parallel.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map)

💬 Now let me map the Events directory and outline the Dispatcher in parallel.
  ▸ mcp__grove__map({"dir":"src/Illuminate/Events"})
  ▸ mcp__grove__outline({"file":"src/Illuminate/Events/Dispatcher.php","detail":0})

💬 Good overview. Now let me read the core methods in parallel — the dispatch/invoke path, the queue detection/handoff path, and the broadcast path.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#dispatch@280"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#invokeListeners@320"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#createClassCallable@529"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#createQueuedHandlerCallable@588"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#queueHandler@660"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#invokeListeners@320"})

💬 Now let me fetch the remaining pieces in parallel — listener/job creation, broadcast, and the queue worker side.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#createListenerAndJob@706"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#propagateListenerOptions@722"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#shouldBroadcast@372"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#broadcastEvent@398"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#handlerShouldBeQueued@570"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#handlerWantsToBeQueued@641"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/CallQueuedListener.php#handle@133"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/CallQueuedListener.php#failed@216"})

💬 Now let me check the remaining pieces — listener resolution, `prepareData`, and the queue worker dispatch path.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#getListeners@409"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#makeListener@484"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/Dispatcher.php#createClassListener@510"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Events/CallQueuedListener.php#prepareData@234"})
  ▸ mcp__grove__outline({"file":"src/Illuminate/Queue/Worker.php","detail":0,"kind":"function"})

💬 Good. Now the worker's `process` method and the broadcasting queue path.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#process@534"})
  ▸ mcp__grove__symbols({"dir":"src/Illuminate/Broadcasting","kind":"function","name":"queue"})
  ▸ mcp__grove__symbols({"dir":"src/Illuminate/Broadcasting","kind":"class","name":"BroadcastEvent"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Broadcasting/BroadcastManager.php#queue@188"})
  ▸ mcp__grove__source({"file":"src/Illuminate/Broadcasting/BroadcastEvent.php","name":"handle"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#runJob@494"})

💬 Let me check how `$job->fire()` gets from the queue-layer job object to `CallQueuedListener::handle`.
  ▸ mcp__grove__symbols({"dir":"src/Illuminate/Queue/Jobs","kind":"function","name":"fire"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Jobs/Job.php#fire@96"})

💬 There's a gap — `Job::fire()` reads `$payload['job']` which for a queued listener won't be `CallQueuedListener::handle` directly. Let me find what actually w...
  ▸ mcp__grove__symbols({"dir":"src/Illuminate/Queue","kind":"class","name":"CallQueuedHandler"})
  ▸ Bash(grep -rn "CallQueuedHandler" src/Illuminate/Queue/ --include="*.php" -l)
  ▸ mcp__grove__outline({"file":"src/Illuminate/Queue/CallQueuedHandler.php","detail":0})
  ▸ mcp__grove__symbols({"dir":"src/Illuminate/Queue","kind":"function","name":"createPayload"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/CallQueuedHandler.php#call@67"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Queue.php#createPayload@123"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/CallQueuedHandler.php#dispatchThroughMiddleware@131"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/CallQueuedHandler.php#getCommand@111"})
  ▸ mcp__grove__symbols({"dir":"src/Illuminate/Queue","kind":"function","name":"createPayloadArray"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Queue.php#createPayloadArray@154"})
  ▸ mcp__grove__source({"file":"src/Illuminate/Queue/Queue.php","name":"createObjectPayload"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/CallQueuedHandler.php#resolveHandler@166"})

💬 Now I have the complete picture. Here's the full walkthrough.  ---  ## Stage 1 — Firing the event: `Dispatcher::dispatch()` (line 280)  `event(new MyEvent())...

──────── RESULT (success, 261792ms, 43 turns) ────────
Now I have the complete picture. Here's the full walkthrough.

---

## Stage 1 — Firing the event: `Dispatcher::dispatch()` (line 280)

`event(new MyEvent())` resolves through the `Event` facade to `Dispatcher::dispatch()`. The first thing it does is `parseEventAndPayload()`: if you passed an object, the class name becomes the event key string and `[$event]` becomes the payload array. The rest of dispatch handles two special cases before any listeners run:

- **Deferred events**: if `shouldDeferEvent()` is true (you called `Event::defer()` to accumulate events), the call is stashed in `$deferredEvents` and returns null immediately.
- **`ShouldDispatchAfterCommit`**: if the event object implements this interface, dispatch registers a callback with the transaction manager so `invokeListeners` only runs after the current DB transaction commits. Returns null immediately; the callback fires on commit.

Otherwise it calls `invokeListeners()` directly.

---

## Stage 2 — Broadcasting check fires before any listener: `invokeListeners()` (line 320)

The first thing `invokeListeners()` does — before touching the listener list — is:

```php
if ($this->shouldBroadcast($payload)) {
    $this->broadcastEvent($payload[0]);
}
```

`shouldBroadcast()` (line 372) checks two things: the event object implements `ShouldBroadcast`, and `broadcastWhen()` returns true (calls `$event->broadcastWhen()` if it exists, defaults to true). If both hold, `broadcastEvent()` is called. **This runs concurrently with the listener path in the sense that it fires first, before the foreach loop**; it is entirely separate from registered listeners. Broadcasting is not a listener — it's a side channel baked into the dispatcher itself. More on what `broadcastEvent` does at the end.

Then `invokeListeners()` loops over `getListeners($event)` calling each callable, halting if `$halt=true` and a non-null response comes back, or breaking on a `false` return.

---

## Stage 3 — Resolving listeners: `getListeners()` → `makeListener()` → `createClassCallable()`

`getListeners()` (line 409) merges three sources:

1. **Exact-name listeners** via `prepareListeners()` — wraps each registered raw string/array into a callable via `makeListener()`
2. **Wildcard listeners** via `getWildcardListeners()` — glob-matched, also through `makeListener()`, receive `($event, $payload)` rather than just the spread payload
3. **Interface listeners** via `addInterfaceListeners()` — listeners registered for any interface the event class implements, enabling polymorphic subscription

`makeListener()` (line 484) routes by type: string or `[class, method]` goes to `createClassListener()`; closures are wrapped to spread the payload.

`createClassListener()` (line 510) returns a closure that, when called by `invokeListeners`, calls `createClassCallable($listener)` to build the actual callable. This lazy wrapping is why registration is cheap — nothing is instantiated at listen time.

`createClassCallable()` (line 529) is the **fork point**:

```php
if ($this->handlerShouldBeQueued($class)) {
    return $this->createQueuedHandlerCallable($class, $method);
}

$listener = $this->container->make($class);

return $this->handlerShouldBeDispatchedAfterDatabaseTransactions($listener)
    ? $this->createCallbackForListenerRunningAfterCommits($listener, $method)
    : [$listener, $method];
```

`handlerShouldBeQueued()` (line 570) is a pure reflection check — does this class implement `ShouldQueue`? No instance is made. If yes, the queued path starts. If no, the listener is made from the container right now and returned as a plain callable.

---

## Stage 4 — The queued path: two-phase filter

`createQueuedHandlerCallable()` (line 588) returns another **closure** — the event is not pushed to the queue yet. It's only pushed when that closure is actually invoked by `invokeListeners`. Inside that closure:

```php
if ($this->handlerWantsToBeQueued($class, $arguments)) {
    $this->queueHandler($class, $method, $arguments);
}
```

`handlerWantsToBeQueued()` (line 641) makes the real listener instance via container and calls `shouldQueue($event)` if that method exists. This is the **runtime conditional opt-out** — you can implement `shouldQueue()` to return false based on the event's data (e.g., skip queuing for small orders). Returns true by default.

This two-phase design — static `ShouldQueue` interface check at registration, optional runtime `shouldQueue()` check at fire time — keeps listener resolution cheap while allowing data-driven decisions.

---

## Stage 5 — Building and pushing the job: `queueHandler()` + `createListenerAndJob()`

`queueHandler()` (line 660):

**Step 1** — `createListenerAndJob()` (line 706):
- Instantiates the listener class **without its constructor** via `ReflectionClass::newInstanceWithoutConstructor()` — just to read its property declarations and method signatures without any side effects
- Creates `new CallQueuedListener($class, $method, $arguments)` — the actual queue job, storing the listener class name (string), method name (string), and the event arguments (the payload array)
- Calls `propagateListenerOptions()` (line 722) to copy everything from the listener stub to the job: `tries`, `timeout`, `backoff`, `retryUntil`, `maxExceptions`, `failOnTimeout`, `shouldBeEncrypted`, `deleteWhenMissingModels`, `middleware`, `shouldBeUnique` / `uniqueId` / `uniqueFor`, `messageGroup`, and any deduplicator

**Step 2** — Uniqueness lock: if `$job->shouldBeUnique`, tries to acquire a lock via `UniqueLock`; returns early without pushing if it can't.

**Step 3** — Resolves connection, queue name, and delay from the listener's `viaConnection()` / `viaQueue()` / `withDelay()` methods or `#[Connection]` / `#[Queue]` / `#[Delay]` PHP attributes.

**Step 4** — `$connection->pushOn($queue, $job)` or `laterOn()` with delay.

The push goes through `Queue::createObjectPayload()` (line 170 in `src/Illuminate/Queue/Queue.php`), which serializes the `CallQueuedListener` and builds a JSON payload. The critical field is:

```php
'job' => 'Illuminate\Queue\CallQueuedHandler@call',
'data' => [
    'commandName' => get_class($job), // 'Illuminate\Events\CallQueuedListener'
    'command' => serialize(clone $job), // or encrypted-serialize
]
```

The `CallQueuedListener` is serialized (via `SerializesModels` if it's on the event) and stored in `data.command`. The `job` field is always `CallQueuedHandler@call` — this is the actual entry point the worker calls, not `CallQueuedListener::handle` directly.

---

## Stage 6 — Worker picks up the job: `Worker::process()` → `Job::fire()`

The worker daemon loops, pops a payload, and hydrates a driver-specific job wrapper (`RedisJob`, `DatabaseJob`, etc.). `Worker::runJob()` → `Worker::process()` (line 534):

1. Raises "before job" events, checks max attempts
2. `$job->fire()` — calls the queue-layer `Job::fire()` in `src/Illuminate/Queue/Jobs/Job.php` (line 96):

```php
public function fire()
{
    $payload = $this->payload();
    [$class, $method] = JobName::parse($payload['job']);
    ($this->instance = $this->resolve($class))->{$method}($this, $payload['data']);
}
```

This reads `$payload['job']` = `'Illuminate\Queue\CallQueuedHandler@call'`, resolves `CallQueuedHandler` from the container, and calls `call($job, $payload['data'])`.

---

## Stage 7 — `CallQueuedHandler::call()` reconstructs and runs the listener

`call()` (line 67 in `src/Illuminate/Queue/CallQueuedHandler.php`):

1. **`getCommand($data)`** (line 111): unserializes `$data['command']` (or decrypts then unserializes), giving back the live `CallQueuedListener` object with its stored class name, method name, and serialized event data. Handles `ModelNotFoundException` for `deleteWhenMissingModels`.
2. **Debounce check**: if the command has a deduplicator that says to skip, deletes the job and returns.
3. **`dispatchThroughMiddleware($job, $command)`** (line 131): sends the `CallQueuedListener` through a `Pipeline` of any middleware declared on the listener (from `middleware()` method and `$middleware` property). At the end of the pipeline:
   ```php
   $this->dispatcher->dispatchNow($command, $this->resolveHandler($job, $command))
   ```
   `resolveHandler` checks if there's a registered bus handler for `CallQueuedListener`; there isn't, so `dispatchNow` falls through to calling `$command->handle(Container $container)`.
4. After the pipeline: releases unique locks (if `ShouldBeUniqueUntilProcessing`), dispatches next chained job, records batch success, deletes the queue job.

---

## Stage 8 — `CallQueuedListener::handle()` calls the real listener

`handle()` (line 133 in `src/Illuminate/Events/CallQueuedListener.php`):

```php
public function handle(Container $container)
{
    $this->prepareData();
    $handler = $this->setJobInstanceIfNecessary(
        $this->job, $container->make($this->class)
    );
    $handler->{$this->method}(...array_values($this->data));
}
```

1. `prepareData()` (line 234): if `$this->data` is still a string, unserializes it — restoring the event object(s) including any Eloquent models via `SerializesModels`
2. `$container->make($this->class)`: **this is where the real listener class is finally constructed** with full dependency injection
3. `setJobInstanceIfNecessary`: injects the queue `Job` into the listener if it uses `InteractsWithQueue` (so it can call `$this->release()`, `$this->fail()`, etc.)
4. `$handler->{$this->method}(...array_values($this->data))`: calls the user's `handle(MyEvent $event)` method

On failure, `CallQueuedListener::failed()` (line 216) makes the listener, passes `[...$event_args, $exception]` to the listener's `failed()` method if defined.

---

## Broadcasting path in full

Back in `invokeListeners()`, when `shouldBroadcast()` is true, `broadcastEvent()` (line 398) calls:

```php
$this->container->make(BroadcastFactory::class)->queue($event);
```

`BroadcastManager::queue()` (line 188 in `src/Illuminate/Broadcasting/BroadcastManager.php`):

- **`ShouldBroadcastNow`**: dispatches `BroadcastEvent` synchronously via the bus, skipping the queue entirely
- **Otherwise**: wraps the event in `new BroadcastEvent(clone $event)` (or `UniqueBroadcastEvent`), resolves the queue connection + queue name from `$event->connection`, `broadcastQueue()`, `$event->queue`, or `#[Queue]` attribute, then `$connection->pushOn($queue, $broadcastEvent)`

`BroadcastEvent` also goes through `createObjectPayload` → `CallQueuedHandler@call` → `BroadcastEvent::handle(BroadcastingFactory $manager)` (line 90 in `src/Illuminate/Broadcasting/BroadcastEvent.php`). Its `handle()` method calls `broadcastAs()` for the channel event name, `broadcastOn()` for channels, `broadcastWith()` for the data payload, then calls the WebSocket driver (Pusher, Reverb, etc.) for each connection returned by `broadcastConnections()`.

**Broadcasting is entirely parallel to — and independent of — registered listeners.** It fires before the listener loop, pushes its own `BroadcastEvent` job to the queue, and the worker processes it through the same `CallQueuedHandler` machinery as any other queued job.

---

## Connection map

```
event(new MyEvent())
  └─ Dispatcher::dispatch()
       ├─ ShouldDispatchAfterCommit? → defer to DB commit callback
       └─ invokeListeners()
            ├─ shouldBroadcast()?
            │    └─ BroadcastManager::queue()
            │         └─ pushOn(queue, new BroadcastEvent)
            │              └─ [worker] CallQueuedHandler::call()
            │                   └─ BroadcastEvent::handle() → WebSocket driver
            │
            └─ foreach getListeners() as $listener
                 └─ createClassCallable()
                      ├─ ShouldQueue? NO  → make($class), call handle() synchronously
                      └─ ShouldQueue? YES → createQueuedHandlerCallable()
                           └─ [called by invokeListeners]
                                └─ handlerWantsToBeQueued()? → queueHandler()
                                     └─ createListenerAndJob()
                                          └─ new CallQueuedListener(class, method, [$event])
                                               + propagateListenerOptions()
                                          └─ pushOn(queue, callQueuedListener)
                                               └─ serialize → payload['job'] = CallQueuedHandler@call
                                                             payload['data']['command'] = serialize(CallQueuedListener)
                                               
                [queue worker]
                Worker::process() → Job::fire()
                  └─ CallQueuedHandler::call($job, $data)
                       └─ getCommand() → unserialize → CallQueuedListener
                       └─ dispatchThroughMiddleware()
                            └─ Pipeline → dispatchNow(callQueuedListener)
                                 └─ CallQueuedListener::handle(Container)
                                      └─ prepareData() → unserialize $this->data
                                      └─ $container->make($this->class)
                                      └─ $handler->handle(...$eventArgs)  ← your listener
```

The key seam to understand for your planned change: `createClassCallable()` is where the sync/queued split happens, `createQueuedHandlerCallable()` / `queueHandler()` / `propagateListenerOptions()` control everything about how the job is constructed, and `CallQueuedListener::handle()` is where the listener is finally reconstructed and called on the worker side. Broadcasting is tapped in at `invokeListeners()` and is completely orthogonal to the listener chain.
