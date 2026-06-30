# transcript: I'm studying how Laravel keeps pulling jobs off a queue and running them in a long-lived worker process without blocking the caller and without losing jobs w...


💬 I'll start by loading the LSP tool and locating the core queue worker symbols.
  ▸ ToolSearch(select:LSP)

💬 Now let me find the main queue Worker class and related symbols.
  ▸ LSP(Worker)
  ▸ Bash(find /home/bench/repos/laravel/src/Illuminate/Queue -name "*.php" | sort)

💬 Now let me read the core files in parallel.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/Worker.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/WorkerOptions.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/WorkerStopReason.php)

💬 Now let me read the Job base class and the CallQueuedHandler to understand how `fire()` and `fail()` work.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/Jobs/Job.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/CallQueuedHandler.php)

💬 I have everything I need. Here is a thorough walkthrough of how all four pieces fit together.  ---  ## How the Laravel queue worker runs jobs  ### 1. The mai...

──────── RESULT (success, 100141ms, 9 turns) ────────
I have everything I need. Here is a thorough walkthrough of how all four pieces fit together.

---

## How the Laravel queue worker runs jobs

### 1. The main loop and stop conditions — `daemon()`

`Worker::daemon()` (`Worker.php:194`) is the entry point for `php artisan queue:work`. It runs a `while (true)` loop and never blocks the caller between iterations; each turn either processes one job or sleeps for `$options->sleep` seconds.

**Before each job is picked:**

`daemonShouldRun()` (`Worker.php:344`) returns false — and the loop calls `pauseWorker()` instead of running — when any of three things is true:

```
maintenance mode (and --force not set)
  OR  $this->paused === true
  OR  a Looping event listener returns false
```

The `$paused` flag is toggled purely by Unix signals (`Worker.php:894`):

| Signal | Effect |
|--------|--------|
| `SIGUSR2` | `$this->paused = true` + `WorkerPausing` event |
| `SIGCONT` | `$this->paused = false` + `WorkerResuming` event |
| `SIGQUIT/SIGTERM/SIGINT` | `$this->shouldQuit = true` + `WorkerInterrupted` event |

**After each job (or sleep):**

`stopIfNecessary()` (`Worker.php:379`) is a `match` expression that evaluates every possible exit condition in priority order and returns a `[int $exitCode, WorkerStopReason $reason]` pair, or `null` to keep going:

```php
match (true) {
    $this->lostConnection          => [EXIT_SUCCESS, LostConnection],
    $this->shouldQuit              => [EXIT_SUCCESS, Interrupted],
    $this->memoryExceeded(...)     => [EXIT_MEMORY_LIMIT, MaxMemoryExceeded],
    $this->queueShouldRestart(...) => [EXIT_SUCCESS, ReceivedRestartSignal],
    $options->stopWhenEmpty && is_null($job)           => [..., QueueEmpty],
    $options->stopWhenEmptyFor && idle > threshold     => [..., QueueEmptyFor],
    $options->maxTime && elapsed >= maxTime            => [..., MaxTimeExceeded],
    $options->maxJobs && processed >= maxJobs          => [..., MaxJobsExceeded],
    default => null,
}
```

The restart signal is a cache key (`illuminate:queue:restart`), not a signal; `queueShouldRestart()` (`Worker.php:847`) compares the timestamp written there when `artisan queue:restart` is run against the one snapshotted when `daemon()` started. The process exits cleanly with code 0, relying on a process supervisor (Supervisor, Horizon) to restart it.

`stop()` dispatches a `WorkerStopping` event and returns the status code. The `kill()` variant (`Worker.php:976`) dispatches the same event then calls `posix_kill(getmypid(), SIGKILL)` — used from the SIGALRM timeout handler where a clean return is impossible.

---

### 2. Obtaining the next job — `getNextJob()`

`getNextJob()` (`Worker.php:425`) takes the live queue connection and the comma-separated queue priority list. The algorithm:

1. Dispatches `JobPopping`.
2. If a named `$popCallbacks` hook exists for this worker name, delegates entirely to that callable (used by Horizon for its own scheduling logic).
3. Otherwise, iterates the queue list in order and skips any queue names that appear in the `getPausedQueues()` result (a cache-backed per-queue pause, separate from the whole-worker `$paused` flag).
4. Calls `$connection->pop($queue)` on each; the first non-null result wins.
5. Dispatches `JobPopped` with the job.
6. On any `Throwable`: reports to the exception handler, checks for a lost DB connection (`DetectsLostConnections` trait sets `$this->lostConnection = true`), sleeps 1 second, and returns `null`.

`pop()` is driver-specific. For Redis it uses the `ZPOPMIN`/`RPOPLPUSH` Lua scripts; for database it does a `SELECT … FOR UPDATE SKIP LOCKED` plus an `UPDATE` to mark the row reserved.

---

### 3. Firing the job and events raised — `process()` and `Job::fire()`

`runJob()` (`Worker.php:494`) sets `$this->currentJob` (so a signal handler can forward interrupts to it), calls `process()`, and clears it in `finally`.

`process()` (`Worker.php:534`) is the orchestrator. A `JobAttempted` event fires in `finally` no matter what happens — it always carries whether an exception occurred.

**Happy path:**

```
JobProcessing dispatched           ← raiseBeforeJobEvent()
markJobAsFailedIfAlreadyExceedsMaxAttempts()   ← handles leftover timed-out attempts
$job->fire()
JobProcessed dispatched            ← raiseAfterJobEvent()
JobAttempted dispatched (finally)
```

`Job::fire()` (`Jobs/Job.php:96`):
```php
[$class, $method] = JobName::parse($payload['job']);
($this->instance = $this->resolve($class))->{$method}($this, $payload['data']);
```
For all normally-dispatched jobs the payload's `job` field is `"Illuminate\Queue\CallQueuedHandler@call"`.

`CallQueuedHandler::call()` (`CallQueuedHandler.php:67`) then:
1. Deserializes the command from `$data['command']` (plain `unserialize` or decrypt-then-unserialize).
2. Checks debounce (drops stale job if a newer dispatch owns the lock).
3. Runs the command through its `middleware()` array via `Pipeline`, then calls `$dispatcher->dispatchNow($command)` at the end of the pipeline — this is where the actual user code (`handle()`) runs.
4. On success: releases unique-job locks, dispatches the next job in a chain, records batch success, and calls `$job->delete()`.

---

### 4. Exception → retry or permanent failure — `handleJobException()`

When `$job->fire()` throws, control goes to `handleJobException()` (`Worker.php:578`). The structure is:

```
try {
    markJobAsFailedIfWillExceedMaxAttempts()   // check attempt count / retryUntil timestamp
    markJobAsFailedIfWillExceedMaxExceptions() // check cache-backed exception counter
    markJobAsFailedIfItShouldntBeRetried()     // ask ExceptionHandler::shouldStopRetries()
    JobExceptionOccurred dispatched
} finally {
    if (not deleted && not released && not failed) {
        backoff = calculateBackoff()
        $job->release($backoff)                // put back on queue with delay
        JobReleasedAfterException dispatched
    }
}
throw $e;   // re-throw so Worker::runJob() can report it
```

**The three "fail now" checks:**

| Method | Condition |
|--------|-----------|
| `markJobAsFailedIfWillExceedMaxAttempts` (`Worker.php:659`) | `retryUntil` timestamp has passed, or `attempts() >= maxTries` (job-level overrides `--tries`) |
| `markJobAsFailedIfWillExceedMaxExceptions` (`Worker.php:680`) | Increments `job-exceptions:{uuid}` in cache; if count ≥ `maxExceptions` → fail |
| `markJobAsFailedIfItShouldntBeRetried` (`Worker.php:706`) | Calls `ExceptionHandler::shouldStopRetries($e)` — lets the app opt in to non-retriable exception types |

`markJobAsFailedIfAlreadyExceedsMaxAttempts()` (`Worker.php:631`) runs before `fire()` — it catches the case where a previous attempt timed out (the SIGALRM fired, incrementing the attempt counter, but no PHP exception was thrown to trigger `handleJobException`).

**`failJob()` → `Job::fail()`** (`Jobs/Job.php:182`):
1. `markAsFailed()` — sets the in-memory `$failed` flag; prevents double-failure.
2. For `TimeoutExceededException` on a `Batchable` job: rolls back any open batch transaction.
3. For database-backed failed jobs with a timeout: rolls back the DB transaction to level 0 so the failed_jobs insert can commit.
4. `$this->delete()` — removes the job from the queue.
5. `$this->failed($e)` — resolves the handler class and calls `failed()` on it if it exists (e.g. `CallQueuedHandler::failed()` → calls `$command->failed($e)` on the user's job class).
6. `JobFailed` dispatched (in `finally`, guaranteeing it fires even if `failed()` throws).

`CallQueuedHandler::failed()` (`CallQueuedHandler.php:387`) also:
- Releases unique-job locks.
- Calls `batch->recordFailedJob()` for batched jobs.
- Invokes chain `catch` callbacks.
- Calls `$command->failed($e)` — the user-defined failure hook.

**Backoff calculation** (`Worker.php:747`): `$options->backoff` (from `--backoff`) is a comma-separated list of seconds. The job can override it with a `backoff()` method. The value at index `attempts()-1` is used; the last value repeats for all subsequent attempts. `$job->release($backoff)` is driver-specific — Redis schedules with `ZADD` on the delayed set; database sets a `reserved_at` timestamp.

---

### Event timeline for one job attempt

```
WorkerStarting          (once, on daemon() entry)
  └─ Looping            (each loop iteration, gating work)
     └─ JobPopping      (before pop)
        └─ JobPopped    (after pop, if job found)
           └─ JobProcessing   (before fire)
              └─ [job middleware + handle()]
           └─ JobProcessed    (success path)
           └─ JobExceptionOccurred  (exception path)
           └─ JobReleasedAfterException  (if released for retry)
           └─ JobFailed       (if permanently failed)
           └─ JobAttempted    (always, in finally — carries exception if any)
     └─ WorkerIdle       (when queue was empty this iteration)
WorkerStopping          (on exit, with reason and code)
WorkerInterrupted       (on SIGQUIT/SIGTERM/SIGINT)
```

The key design choice throughout: the worker process itself **never loses a job on a crash**. A job is not removed from the queue until either `$job->delete()` succeeds (clean completion or deliberate failure) or `$job->release()` returns it for a future attempt. If the process dies mid-job without calling either, the driver's visibility timeout expires and the job reappears for another worker.
