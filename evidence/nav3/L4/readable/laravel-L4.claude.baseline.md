# transcript: I'm studying how Laravel keeps pulling jobs off a queue and running them in a long-lived worker process without blocking the caller and without losing jobs w...


💬 Let me read the core queue worker file directly, since we know exactly where to look.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/Worker.php)

💬 Now let me read the Job base class to understand `fire()` and `fail()`:
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/Jobs/Job.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Queue/WorkerOptions.php)

💬 Now I have everything needed to give a thorough explanation. Let me also quickly check the `WorkerStopReason` enum for completeness.
  ▸ Bash(find /home/bench/repos/laravel/src/Illuminate/Queue -name "WorkerStopReason.php" | head -1 | xargs cat)

💬 Here is a complete walk-through of how all the cooperating pieces fit together.  ---  ## The daemon loop (`Worker::daemon`)  `Worker.php:194` — this is the l...

──────── RESULT (success, 78930ms, 5 turns) ────────
Here is a complete walk-through of how all the cooperating pieces fit together.

---

## The daemon loop (`Worker::daemon`)

`Worker.php:194` — this is the long-lived entry point. It never returns until the process decides it is time to die. Every iteration of `while (true)` does the same five things:

1. **Should-run gate** — calls `daemonShouldRun()` (line 344). If that returns `false` the worker calls `pauseWorker()` (line 361), which sleeps for `$options->sleep` seconds and then checks whether a stop condition has been reached. The gate returns `false` when any of three things are true: the app is in maintenance mode (and `--force` was not passed), `$this->paused` is set, or any listener attached to the `Looping` event returns `false`. This is how the process gracefully yields without spinning.

2. **Scope reset** — if a `$resetScope` callable was provided (typically by the HTTP kernel to clear auth state, scoped bindings, etc.) it is called here, before a new job is ever touched.

3. **Fetch** — `getNextJob()` (line 425). This fires a `JobPopping` event, then iterates the comma-separated list of queue names in priority order, skipping any that appear in the paused-queue set (stored in cache). For each queue it calls `$connection->pop($queue)`, which is a blocking-free poll returning `null` if the queue is empty. The first non-null result fires `JobPopped` and is returned. A `Throwable` from `pop()` is reported and swallowed, and if the exception indicates a lost DB connection, `$this->lostConnection` is set to `true` (which will cause `stopIfNecessary` to exit at the bottom of the loop).

4. **Run or sleep** — if a job was returned it is handed to `runJob()` (line 494); if the queue was empty, a `WorkerIdle` event is fired and the process sleeps for `$options->sleep` seconds. An optional `$options->rest` sleep *after* a successful job provides a deliberate inter-job pause.

5. **Stop-if-necessary gate** (line 265 / `stopIfNecessary` at 379) — checked unconditionally at the bottom of every iteration, after `resetTimeoutHandler()` has cancelled the alarm. `stopIfNecessary` is a single `match` that evaluates conditions in priority order and returns a `[exitCode, WorkerStopReason]` pair or `null`:

   | Condition | Exit code | Reason |
   |---|---|---|
   | `$this->lostConnection` | 0 | `LostConnection` |
   | `$this->shouldQuit` | 0 | `Interrupted` |
   | Memory ≥ limit | 12 (or custom) | `MaxMemoryExceeded` |
   | Restart timestamp changed in cache | 0 | `ReceivedRestartSignal` |
   | `--stop-when-empty` and no job | 0 | `QueueEmpty` |
   | `--stop-when-empty-for` elapsed | 0 | `QueueEmptyFor` |
   | `--max-time` elapsed | 0 | `MaxTimeExceeded` |
   | `--max-jobs` reached | 0 | `MaxJobsExceeded` |

   A non-null status calls `$this->stop()` (line 961), which dispatches `WorkerStopping` and returns the code. The supervisor process (e.g. Supervisor or Laravel Octane) sees that exit code and decides whether to restart.

---

## Signal handling

`listenForSignals()` (line 880) enables `pcntl_async_signals` so signal handlers fire between any two PHP opcodes rather than only at `pcntl_signal_dispatch()` call-sites.

- **SIGQUIT / SIGTERM / SIGINT** — set `$this->shouldQuit = true`, fire `WorkerInterrupted`, and — if the current job implements `Interruptible` — call `$job->interrupted($signal)` so the job itself can cooperate. The `while` loop will see `shouldQuit` on the next iteration of `stopIfNecessary` and exit cleanly *after the current job finishes*.
- **SIGUSR2** — sets `$this->paused = true` (fires `WorkerPausing`). The next loop iteration will fail the `daemonShouldRun` gate and the worker sleeps without dequeuing anything.
- **SIGCONT** — clears `$this->paused` (fires `WorkerResuming`).
- **SIGALRM** — the timeout handler (see below).

The restart signal (`php artisan queue:restart`) works differently: it writes a Unix timestamp to the cache key `illuminate:queue:restart`. The worker compares the cached value to the one it read at startup on every pass through `stopIfNecessary`. A change means a graceful stop — no signal needed, compatible with environments where signalling the worker process is impossible.

---

## Timeout enforcement (`registerTimeoutHandler` / `resetTimeoutHandler`)

`Worker.php:282` — immediately after `getNextJob()`, before `runJob()`, the worker arms a POSIX alarm:

```
pcntl_alarm(max(timeoutForJob($job, $options), 0))
```

`timeoutForJob()` (line 331) prefers the per-job `$job->timeout()` value (stored in the payload) over the global `$options->timeout`.

If the alarm fires while `$job->fire()` is still running, the SIGALRM handler:

1. Calls the three `markJobAsFailedIfX` checks for the timed-out exception (so the job is failed if it has run out of retries or carries `failOnTimeout`).
2. Fires `JobTimedOut`.
3. Calls `$this->kill(...)` — which calls `posix_kill(getmypid(), SIGKILL)` — a hard process kill, not a graceful stop, because the job is frozen and nothing else can interrupt it.

After `runJob()` returns, `resetTimeoutHandler()` (line 319) calls `pcntl_alarm(0)` to cancel any remaining alarm so the idle sleep isn't killed.

---

## `process()` — the job lifecycle

`Worker.php:534` — called from `runJob()` (which captures `$this->currentJob` for signal forwarding and swallows any uncaught `Throwable` that escapes `process()`).

```
raiseBeforeJobEvent          →  JobProcessing dispatched
markJobAsFailedIfAlreadyExceedsMaxAttempts   (throws if true)
$job->isDeleted() check      →  bail out early if already cancelled
$job->fire()                 →  the actual work
raiseAfterJobEvent           →  JobProcessed dispatched
```

`finally`: `JobAttempted` is always dispatched, carrying the exception if one occurred.

### `Job::fire()` (`Jobs/Job.php:96`)

The payload stored in the queue message contains two fields that matter here:

- `job` — a `ClassName@method` string (typically `CallQueuedHandler@call`)
- `data` — the serialised command

`fire()` parses that string, resolves the class out of the container, and calls `$instance->method($this, $payload['data'])`. For user-defined jobs dispatched via `Bus::dispatch`, the handler is always `CallQueuedHandler`, which deserialises the command object and calls `handle()` on it.

---

## Exception → retry or fail (`handleJobException`)

`Worker.php:578` — this is called when `$job->fire()` throws. The path is:

```
handleJobException()
  ├─ markJobAsFailedIfWillExceedMaxAttempts()   (attempts >= maxTries, or retryUntil expired)
  ├─ markJobAsFailedIfWillExceedMaxExceptions()  (cache counter `job-exceptions:{uuid}`)
  ├─ markJobAsFailedIfItShouldntBeRetried()      (exception handler veto via shouldStopRetries())
  ├─ raiseExceptionOccurredJobEvent()            →  JobExceptionOccurred dispatched
  └─ finally:
       if not deleted && not released && not failed:
           backoff = calculateBackoff()
           job->release(backoff)                 →  back onto the queue with delay
           JobReleasedAfterException dispatched
throw $e   ←  always re-thrown (runJob() catches and swallows)
```

**`markJobAsFailedIfWillExceedMaxAttempts`** (line 659) — the job's attempt count at this point is already incremented (the broker incremented it when it was reserved). If `attempts() >= maxTries`, or `retryUntil()` is in the past, it calls `failJob()`.

**`markJobAsFailedIfWillExceedMaxExceptions`** (line 680) — uses the cache key `job-exceptions:{uuid}` as an atomic counter. Each exception increments it; once it hits `maxExceptions`, the key is deleted and `failJob()` is called. This is separate from `maxTries` so a job can have `maxTries=∞, maxExceptions=3`.

**`calculateBackoff`** (line 747) — reads the job's `backoff()` (or falls back to `$options->backoff`), splits on commas to support stepped backoff arrays (`"5,30,60"`), and picks the entry at index `attempts() - 1`, defaulting to the last entry for later attempts.

### `Job::fail()` (`Jobs/Job.php:182`)

`failJob()` in the worker simply delegates to `$job->fail($e)`. The job itself:

1. Sets `$this->failed = true`.
2. Handles the `TimeoutExceededException` + `Batchable` combination by rolling back the batch repository transaction.
3. If the failed-job driver is `database`/`database-uuids`, rolls back any open DB transaction so the failed-job record can be written.
4. Calls `$this->delete()` (removes from the broker).
5. Calls `$this->failed($e)` — which resolves the original job class and calls `failed()` on it if that method exists, passing the payload data and exception.
6. In `finally`: dispatches `JobFailed`.

---

## Event map

| When | Event |
|---|---|
| Worker process starts | `WorkerStarting` |
| Every iteration (gate) | `Looping` (listeners can return `false` to pause) |
| Before `connection->pop()` | `JobPopping` |
| Job reserved from broker | `JobPopped` |
| Before `job->fire()` | `JobProcessing` |
| After successful `job->fire()` | `JobProcessed` |
| Any exception during fire | `JobExceptionOccurred` |
| Released back after exception | `JobReleasedAfterException` |
| Every attempt (success or not) | `JobAttempted` |
| SIGALRM fires | `JobTimedOut` |
| `job->fail()` finalises | `JobFailed` |
| Queue empty on a pass | `WorkerIdle` |
| SIGQUIT/TERM/INT received | `WorkerInterrupted` |
| SIGUSR2 received | `WorkerPausing` |
| SIGCONT received | `WorkerResuming` |
| Clean exit | `WorkerStopping` |
| Hard kill (timeout) | `WorkerStopping` (then SIGKILL) |

---

## How "no jobs are lost" is guaranteed

The broker (Redis, SQS, database) uses a **reservation** model: `pop()` does not delete the message; it marks it as in-flight. The job is only truly removed from the broker when `$job->delete()` is called — either explicitly by the handler, or inside `Job::fail()`. If the worker dies (SIGKILL, OOM, power loss) before either of those happens, the broker's visibility timeout expires and the message becomes visible again, so another worker can pick it up. The worker deliberately *does not* call `delete()` on the happy path — that is done by the handler itself (via `CallQueuedHandler`) after `handle()` returns without error.
