# transcript: I'm studying how Rails manages the pool of database connections that many threads share, without any one thread holding a connection permanently. I need to u...


💬 I'll start by loading the LSP tool and finding the connection pool class, then trace all four mechanisms.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(ConnectionPool)
  ▸ Bash(find /home/bench/repos/rails/activerecord -name "*.rb" | xargs grep -l "class ConnectionPool" 2>/dev/null)

💬 Good. The pool is split across three files. Let me read all three in parallel, plus get symbol outlines.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb","line":1,"c...)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/queue.rb","line...)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/reaper.rb","lin...)

💬 LSP is still warming up for those files. Let me read all three files directly.
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/queue.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/reaper.rb)

💬 Now let me look at the connection-side state machine — `lease`, `expire`, `steal!`, `owner`, `seconds_idle` on the abstract adapter.
  ▸ Bash(grep -n "def lease\|def expire\|def steal!\|def in_use?\|def owner\|def seconds_idle\|@owner\|@lease\b" /home/bench/repos/rails/activerecord/lib/active_recor...)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb)

💬 I have everything I need. Here's a thorough walkthrough of all four mechanisms and how they interlock.  ---  ## The Connection Pool — How the Four Mechanisms...

──────── RESULT (success, 131986ms, 12 turns) ────────
I have everything I need. Here's a thorough walkthrough of all four mechanisms and how they interlock.

---

## The Connection Pool — How the Four Mechanisms Fit Together

The key files:

| File | Purpose |
|---|---|
| `connection_pool.rb` | The `ConnectionPool` class and its inner `Lease`/`LeaseRegistry` types |
| `connection_pool/queue.rb` | `Queue` + `ConnectionLeasingQueue` — the blocking/non-blocking dequeue |
| `connection_pool/reaper.rb` | Background thread that calls `reap` + `flush` periodically |
| `abstract_adapter.rb` | Per-connection state: `@owner`, `lease`/`expire`/`steal!`, `seconds_idle` |

---

### 1. Checking out a connection

**Entry point:** `lease_connection` (pool.rb:310)

```ruby
def lease_connection
  lease = connection_lease          # per-thread Lease object
  lease.sticky = true
  lease.connection ||= checkout     # fast path: already have one
end
```

`connection_lease` (pool.rb:700) looks up a `Lease` from `@leases` (a `LeaseRegistry`), keyed by `ActiveSupport::IsolatedExecutionState.context` — the current thread or fiber. If the thread already holds a connection, `lease.connection` is non-nil and returns immediately with no locking at all.

When a connection must be acquired, `checkout` (pool.rb:550) calls `acquire_connection`, which tries three strategies in order:

```ruby
def acquire_connection(checkout_timeout)
  if conn = @available.poll || try_to_checkout_new_connection   # (A) fast paths
    conn
  else
    reap                                                          # (B) one free reap attempt
    if conn = @available.poll || try_to_checkout_new_connection
      conn
    else
      @available.poll(checkout_timeout)                          # (C) blocking wait
    end
  end
end
```

**Strategy A — take an idle connection:** `@available.poll` (no timeout arg) calls `no_wait_poll`, which only succeeds if `@queue.size > @num_waiting` (queue.rb:94). The fairness invariant: a non-waiting thread cannot steal a connection that a waiting thread is already queued for.

**Strategy A — create a new connection:** `try_to_checkout_new_connection` (pool.rb:895). Under the pool's `synchronize` lock it checks `(@connections.size + @now_connecting) < @size`, increments `@now_connecting`, then — critically — **exits the synchronized block** to establish the TCP connection to the database. This lets other threads keep running while the slow network call completes. When done it calls `adopt_connection` (adds to `@connections`) and `conn.lease` — still inside a `synchronize` — then decrements `@now_connecting`.

**Strategy B — one free reap:** If both fast paths fail the pool calls `reap` immediately (see §3 below) in case a thread just died and freed a connection, then retries A.

**Strategy C — block:** `@available.poll(checkout_timeout)` calls `wait_poll` (queue.rb:112), which increments `@num_waiting`, then loops on `@cond.wait(remaining)` until either a connection is signalled in or the timeout fires and raises `ConnectionTimeoutError`.

**The atomic lease trick:** `@available` is a `ConnectionLeasingQueue`, not the raw `Queue`. It overrides `internal_poll` (queue.rb:203):

```ruby
def internal_poll(timeout)
  conn = super
  conn.lease if conn   # ← calls conn.lease INSIDE the lock
  conn
end
```

`@lock` is the same `Monitor` shared between the queue and the pool (`ConnectionPool` mixes in `MonitorMixin` and passes `self` as the lock). So `conn.lease` (`@owner = current_thread`) executes atomically with the dequeue — there is no window where a connection is dequeued but not yet owned.

After acquiring, `checkout_and_verify` (pool.rb:938) runs the checkout callbacks and calls `conn.clean!` to verify the connection is in a sane state.

---

### 2. Returning a connection for reuse

**Normal path — thread-managed lease:**

`release_connection` (pool.rb:391) calls `connection_lease.release`, which clears `@connection` and `@sticky` from the `Lease`, then calls `checkin` with the returned connection object.

`checkin` (pool.rb:573):

```ruby
def checkin(conn)
  return if @pinned_connection.equal?(conn)   # pinned conns never return

  conn.lock.synchronize do          # per-connection mutex
    synchronize do                  # pool Monitor
      connection_lease.clear(conn)  # remove from thread's Lease if still there
      conn._run_checkin_callbacks do
        conn.expire                 # @idle_since = now; @owner = nil
      end
      @available.add conn           # push to queue + @cond.signal
    end
  end
end
```

The double-lock (`conn.lock` + pool `synchronize`) prevents races where the reaper thread concurrently tries to steal this connection. `conn.expire` (abstract_adapter.rb:313) records `@idle_since = Process.clock_gettime(CLOCK_MONOTONIC)` and sets `@owner = nil`. `@available.add` pushes onto the LIFO queue (most recently returned connection is next to be given out — cache-warm sockets) and calls `@cond.signal`, waking exactly one blocked thread from `wait_poll`.

**Executor hooks:** `ExecutorHooks.complete` (pool.rb:193) is registered with `ActiveSupport::Executor`. After every request/job completes, it iterates all pools and calls `release_connection` for any thread whose connection has no open joinable transaction. This is the mechanism that returns web-request connections automatically without the application having to call checkin.

---

### 3. Reclaiming connections from dead threads

**The Reaper:** `Reaper.run` (reaper.rb:72) calls `Reaper.register_pool(pool, frequency)`. The class-level `@pools` and `@threads` hashes (indexed by frequency) mean **one background thread per unique reaping interval** serves all pools with that interval. Pools are stored as `WeakRef` objects so discarded pools can be GC'd without being pinned by the reaper.

Every `frequency` seconds (default 60s) the thread calls `pool.reap` then `pool.flush`:

```ruby
@pools[frequency].each do |p|
  p.reap
  p.flush
rescue WeakRef::RefError   # pool was GC'd, skip
end
```

`reap` (pool.rb:623):

```ruby
def reap
  stale_connections = synchronize do
    @connections.select { |conn| conn.in_use? && !conn.owner.alive? }
               .each   { |conn| conn.steal! }
  end

  stale_connections.each do |conn|
    if conn.active?
      conn.reset!
      checkin conn   # returns to pool, available to other threads
    else
      remove conn    # removes from @connections, possibly makes room for new
    end
  end
end
```

Inside the `synchronize` block: scan `@connections` for entries where `conn.in_use?` (i.e., `@owner != nil`) but `conn.owner.alive?` is false — the owning thread is dead. Call `steal!` (abstract_adapter.rb:329) on each, which:
1. Calls `remove_connection_from_thread_cache(self, dead_thread)` — clears the dead thread's `Lease` entry from `@leases`
2. Sets `@owner = current_thread` (the reaper thread now legally owns it)

Outside the `synchronize` block (important — don't hold the lock during IO): if the underlying database socket is still live, `reset!` clears any in-progress transaction or cursor state, then `checkin` returns it to `@available`. If the socket is dead, `remove` deletes it from `@connections` and `@available`; if any threads are queued waiting, `remove` calls `bulk_make_new_connections(1)` to fill the gap.

The `acquire_connection` method also calls `reap` inline (strategy B above) so a freshly dead thread's connection can be recycled immediately on the next checkout attempt, without waiting for the next reaper cycle.

---

### 4. Idle connection eviction

`flush(minimum_idle = @idle_timeout)` (pool.rb:646, default 300 seconds):

```ruby
def flush(minimum_idle = @idle_timeout)
  return if minimum_idle.nil?

  idle_connections = synchronize do
    @connections.select do |conn|
      !conn.in_use? && conn.seconds_idle >= minimum_idle
    end.each do |conn|
      conn.lease              # mark in-use to block concurrent checkout
      @available.delete conn
      @connections.delete conn
    end
  end

  idle_connections.each(&:disconnect!)  # actual IO outside the lock
end
```

`seconds_idle` (abstract_adapter.rb:342) returns `Process.clock_gettime(CLOCK_MONOTONIC) - @idle_since`, where `@idle_since` was stamped by `expire` at checkin time.

Inside `synchronize`: temporarily call `conn.lease` to claim ownership (preventing a racing checkout), then atomically remove from both `@connections` and `@available`. Outside the lock: call `disconnect!` to close the socket.

The reaper's background thread calls both `reap` and `flush` each cycle, so dead-thread recovery and idle eviction share the same timer and thread.

---

### How the pieces cohere

```
                          ┌─────────────────────┐
                          │    @available        │  ConnectionLeasingQueue
                          │  (LIFO queue + cond) │  shares pool's Monitor
                          └────────┬────────┬────┘
                    poll()◄────────┘        └────────►add() (on checkin)
                          │                           signals @cond
              acquire_connection
             ╔═════════════╩════════════════╗
             ║ A: poll (no wait)            ║
             ║ A: try_to_checkout_new_conn  ║  @now_connecting guards @size
             ║ B: reap + retry              ║  inline fast reap
             ║ C: poll(timeout) — blocks    ║  @cond.wait loop
             ╚══════════════════════════════╝
                          │
                    conn.lease  ←── inside lock (atomic with dequeue)
                          │
                    checkout_and_verify
                          │
               ┌──────────▼──────────┐
               │  thread uses conn   │
               └──────────┬──────────┘
                          │  release_connection / ExecutorHooks.complete
                    checkin(conn)
                          │
              conn.expire  (@owner=nil, @idle_since=now)
              @available.add  (signals waiting threads)

Background (Reaper thread, every reaping_frequency seconds):
  reap:   scan for in_use? && !owner.alive? → steal! → reset!/checkin or remove
  flush:  scan for !in_use? && seconds_idle >= idle_timeout → disconnect!
```

A few design decisions worth noting:

- **`@leases` is a cache, not the authority.** `conn.@owner` is the authoritative record of who owns a connection. `@leases` (keyed by thread via `WeakThreadKeyMap`) is just a shortcut so `lease_connection` can skip `checkout` on repeat calls. The `WeakThreadKeyMap` prunes dead-thread entries on every write, keeping it from leaking.

- **New connections open outside the lock.** `try_to_checkout_new_connection` increments `@now_connecting` under the lock but does the actual `db_config.new_connection` call without holding it. This is why `@connections.size + @now_connecting` is the capacity check — `@now_connecting` accounts for in-flight TCP connects that haven't been added to `@connections` yet.

- **LIFO queue.** `Queue#remove` does `@queue.pop` (last in, first out). The most recently checked-in connection is checked out first — it's the one most likely to still have a warm server-side session.

- **The double lock in `checkin`.** `conn.lock.synchronize { synchronize { ... } }` prevents a race with `reap`, which also calls `steal!` inside `synchronize`. The ordering is always `conn.lock` → pool `synchronize`, never the reverse, to avoid deadlock.
