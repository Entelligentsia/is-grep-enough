# transcript: I'm studying how Laravel keeps pulling jobs off a queue and running them in a long-lived worker process without blocking the caller and without losing jobs w...


💬 Let me load the grove tools and map the Queue worker structure.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map)

💬 Now let me get a structural map of the Queue directory and a skeleton of the Worker class in parallel.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/laravel/src/Illuminate/Queue/Worker.php"})
  ▸ mcp__grove__map({"dir":"/home/bench/repos/laravel/src/Illuminate/Queue","kind":"class"})

💬 Now let me read the key methods in parallel — the main loop, the job fetcher, the job runner, and the exception handler.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#daemon@194"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#getNextJob@425"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#process@534"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#handleJobException@578"})

💬 Good — now let me pull the remaining pieces: loop-control, failure routing, backoff, and timeout.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#daemonShouldRun@344"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#stopIfNecessary@379"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#runJob@494"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#markJobAsFailedIfWillExceedMaxAttempts@659"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#markJobAsFailedIfWillExceedMaxExceptions@680"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#markJobAsFailedIfItShouldntBeRetried@706"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#calculateBackoff@747"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#registerTimeoutHandler@282"})

💬 Now let me grab the three remaining pieces: `failJob`, `markJobAsFailedIfAlreadyExceedsMaxAttempts`, and `listenForSignals`.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#failJob@735"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#markJobAsFailedIfAlreadyExceedsMaxAttempts@631"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Queue/Worker.php#listenForSignals@880"})

💬 Here is a thorough walkthrough of how all the pieces fit together.  ---  ## 1. The outer loop — `daemon()` (`Worker.php:194`)  `daemon()` is the entry point ...

──────── RESULT (success, 101810ms, 19 turns) ────────
Here is a thorough walkthrough of how all the pieces fit together.

---

## 1. The outer loop — `daemon()` (`Worker.php:194`)

`daemon()` is the entry point for `php artisan queue:work`. It never returns on its own; the only way out is through `stop()`. Before the loop starts, two one-time things happen:

**Signal wiring** — if `pcntl` is available, `listenForSignals()` (line 880) installs four POSIX handlers with `pcntl_async_signals(true)`:

| Signal | Effect |
|---|---|
| `SIGQUIT / SIGTERM / SIGINT` | Sets `$this->shouldQuit = true`, dispatches `WorkerInterrupted` |
| `SIGUSR2` | Sets `$this->paused = true`, dispatches `WorkerPausing` |
| `SIGCONT` | Sets `$this->paused = false`, dispatches `WorkerResuming` |

These flags are checked synchronously at safe points in the loop — no PHP code is ever interrupted mid-instruction by them.

**Restart baseline** — `getTimestampOfLastQueueRestart()` reads a cache key written by `queue:restart`. The loop remembers this value to detect if a restart command is issued later.

### The loop body (one iteration per job attempt)

```
while (true) {
    if (! daemonShouldRun())   → pauseWorker() / continue or stop
    resetScope()
    $job = getNextJob()
    registerTimeoutHandler($job)    // arms SIGALRM
    if ($job) runJob()  else sleep()
    resetTimeoutHandler()           // disarms SIGALRM
    stopIfNecessary()               // exit if a stop condition is met
}
```

---

## 2. Loop-continuation guard — `daemonShouldRun()` (`Worker.php:344`)

```php
return ! (
    (! $options->force && ($this->isDownForMaintenance)()) ||
    $this->paused ||
    $this->events->until(new Looping(...)) === false
);
```

Three independent vetoes, ANDed as a NOR:

- **Maintenance mode** — unless `--force` was passed, the injected `isDownForMaintenance` closure (wired to `app()->isDownForMaintenance()`) pauses the worker.
- **`$this->paused`** — set by the `SIGUSR2` handler or by `queue:pause`. The worker sleeps and keeps looping rather than processing jobs.
- **`Looping` event** — any listener can return `false` from this event to veto the current iteration. This is the extension point for application-level throttles.

When `daemonShouldRun()` returns `false`, `pauseWorker()` is called. It sleeps for `$options->sleep` seconds and then calls `stopIfNecessary()` to check whether a stop condition has been reached _while_ the worker was sleeping. If a stop code comes back, `daemon()` exits; otherwise it `continue`s to the next iteration.

### Post-iteration stop check — `stopIfNecessary()` (`Worker.php:379`)

At the end of every iteration (whether a job ran or not), this method returns either `null` (keep going) or a `[exitCode, reason]` pair. It is a pure `match` over boolean conditions checked in priority order:

1. `$this->lostConnection` — DB/Redis connectivity failure
2. `$this->shouldQuit` — OS signal received
3. Memory limit exceeded (`$options->memory` MB)
4. Restart cache key changed since startup
5. `--stop-when-empty` and no job was found this pass
6. `--stop-when-empty-for N` and idle for N seconds
7. `--max-time` wall-clock budget elapsed
8. `--max-jobs` job count budget reached

`lostConnection` and `shouldQuit` both cause a clean `EXIT_SUCCESS` so the supervisor (e.g. Supervisor) immediately restarts the worker.

---

## 3. Fetching the next job — `getNextJob()` (`Worker.php:425`)

```php
$popJobCallback = fn($queue, $index) => $connection->pop($queue, $index);

$this->raiseBeforeJobPopEvent(...);   // → JobPopping event

// If a named pop callback is registered (for testing/interception):
if (isset(static::$popCallbacks[$this->name])) {
    $job = ($popCallbacks[...])(popJobCallback, $queue);
    raiseAfterJobPopEvent if job found;
    return $job;
}

// Otherwise: iterate the comma-separated queue list in priority order
foreach (explode(',', $queue) as $index => $queue) {
    if (paused[$queue]) continue;           // per-queue pause support
    if ($job = $popJobCallback($queue)) {
        raiseAfterJobPopEvent(job);
        return $job;
    }
}
```

Key points:

- **Priority order** — queues are tried left-to-right; the first non-empty queue wins. `high,default,low` means `high` is always drained first.
- **Per-queue pause** — individual queues can be paused via `queue:pause connection:queue`; they are skipped during pop but the worker keeps running and polling the unpaused queues.
- **`raiseBeforeJobPopEvent`** dispatches `JobPopping`; `raiseAfterJobPopEvent` dispatches `JobPopped` (only when a job is actually found). These fire on every loop iteration, not just when work is found.
- The underlying `$connection->pop()` call is driver-specific (Redis, SQS, database, etc.) and atomically moves the job from "available" to "reserved" so no two workers can claim the same job.
- If `pop()` throws (e.g. a Redis connection error), the exception is reported, `stopWorkerIfLostConnection()` sets `$this->lostConnection = true`, and the worker sleeps 1 second before the loop's next pass discovers the flag and exits cleanly.

---

## 4. Firing a job — `process()` (`Worker.php:534`)

`runJob()` (line 494) just sets `$this->currentJob`, delegates to `process()`, and catches any unhandled `Throwable` that escapes for final reporting. The real work is in `process()`:

```
raiseBeforeJobEvent()                   // → JobProcessing
markJobAsFailedIfAlreadyExceedsMaxAttempts()
if job.isDeleted() → raiseAfterJobEvent and return
job.fire()                              // execute the user's handler
raiseAfterJobEvent()                    // → JobProcessed
catch Throwable → handleJobException()
finally → dispatch(JobAttempted)        // always fires, even on failure
```

### Event sequence for a successful job

| Order | Event class | When |
|---|---|---|
| 1 | `JobPopping` | before `pop()` |
| 2 | `JobPopped` | after `pop()`, only if job found |
| 3 | `JobProcessing` | inside `process()`, before `fire()` |
| 4 | `JobProcessed` | after `fire()` succeeds |
| 5 | `JobAttempted` | `finally` block — always |

### Pre-flight check — `markJobAsFailedIfAlreadyExceedsMaxAttempts()` (`Worker.php:631`)

Called _before_ `fire()`. If the job has already exhausted its attempts (e.g. it timed out on a previous run without ever throwing, so `handleJobException` never ran), it is failed _right here_ and a `MaxAttemptsExceededException` is thrown, which short-circuits the actual execution.

---

## 5. Exception handling — `handleJobException()` (`Worker.php:578`)

When `fire()` throws, `handleJobException()` decides: fail permanently, or release for retry?

```
if ! job.hasFailed():
    markJobAsFailedIfWillExceedMaxAttempts()   // attempts ≥ maxTries, or retryUntil expired
    markJobAsFailedIfWillExceedMaxExceptions() // cumulative exception count via cache
    markJobAsFailedIfItShouldntBeRetried()     // exception handler says stop retrying

raiseExceptionOccurredJobEvent()               // → JobExceptionOccurred

finally:
    if ! deleted && ! released && ! failed:
        backoff = calculateBackoff()
        job.release(backoff)                   // put back on queue with delay
        dispatch(JobReleasedAfterException)

throw $e   // always re-thrown; caught and reported by runJob()
```

### The three permanent-failure gates

| Method | Fails when… |
|---|---|
| `markJobAsFailedIfWillExceedMaxAttempts` | `attempts() >= maxTries` (job-level `maxTries()` overrides the worker option) **or** `retryUntil()` timestamp has passed |
| `markJobAsFailedIfWillExceedMaxExceptions` | A per-UUID counter in the cache reaches `maxExceptions()` — allows a job to tolerate N total exceptions across all its attempts regardless of which attempt it's on |
| `markJobAsFailedIfItShouldntBeRetried` | The registered exception handler implements `shouldStopRetries($e)` and returns true |

If any of those calls `failJob()` → `job->fail($e)`, the job contract marks itself as failed (deletes from queue, writes to the `failed_jobs` table, calls the job's own `failed()` hook). Because `hasFailed()` then returns true, the `finally` block skips `release()`, so the job is not put back on the queue.

If _none_ of the gates trigger, the `finally` block calls `job->release($backoff)`, which returns the job to the queue with a visibility delay. `calculateBackoff()` resolves the delay by reading a comma-separated backoff list (e.g. `"5,15,60"`) and indexing it by `attempts() - 1`, falling back to the last value once the list is exhausted.

### Timeout path — `registerTimeoutHandler()` (`Worker.php:282`)

Before every `runJob()` call, a `SIGALRM` is armed via `pcntl_alarm(timeout)`. If the job exceeds its wall-clock limit, the kernel delivers `SIGALRM`, which:

1. Runs the same failure-gate logic (`markJobAsFailedIfWillExceedMaxAttempts`, `markJobAsFailedIfWillExceedMaxExceptions`, `markJobAsFailedIfItShouldFailOnTimeout`).
2. Dispatches `JobTimedOut`.
3. Calls `kill()` — which does `posix_kill(getmypid(), SIGKILL)`, terminating the process immediately. The supervisor then starts a fresh worker.

After `runJob()` returns normally, `resetTimeoutHandler()` calls `pcntl_alarm(0)` to disarm the alarm.

---

## The whole picture

```
daemon()
│
├── listenForSignals()          SIGTERM/QUIT/INT → shouldQuit
│                               SIGUSR2 → paused, SIGCONT → unpaused
│
└── while(true)
    ├── daemonShouldRun()?
    │    no → pauseWorker() → sleep → stopIfNecessary → continue/stop
    │
    ├── getNextJob()
    │    ├── JobPopping event
    │    ├── connection->pop(queue)   atomic reserve in driver
    │    └── JobPopped event (if found)
    │
    ├── registerTimeoutHandler()   arm SIGALRM
    │
    ├── runJob()
    │    └── process()
    │         ├── JobProcessing event
    │         ├── markJobAsFailedIfAlreadyExceedsMaxAttempts
    │         ├── job->fire()        ← user code runs here
    │         ├── JobProcessed event (success path)
    │         ├── catch → handleJobException()
    │         │    ├── markJobAsFailedIfWillExceedMaxAttempts
    │         │    ├── markJobAsFailedIfWillExceedMaxExceptions
    │         │    ├── markJobAsFailedIfItShouldntBeRetried
    │         │    ├── JobExceptionOccurred event
    │         │    └── finally: hasFailed? → nothing
    │         │               else → job.release(backoff) + JobReleasedAfterException
    │         └── finally → JobAttempted event (always)
    │
    ├── resetTimeoutHandler()      disarm SIGALRM
    │
    └── stopIfNecessary()          lostConnection / shouldQuit / memory /
                                   restart signal / empty / time / jobs
```

The central design invariant is that no job is silently dropped. Every path out of `handleJobException` either calls `job->fail()` (permanent failure, stored + notified) or `job->release()` (returned to queue for retry). The `finally` block in `handleJobException` enforces this even if the failure-gate methods themselves throw.
