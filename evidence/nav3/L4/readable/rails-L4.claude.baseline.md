# transcript: I'm studying how Rails manages the pool of database connections that many threads share, without any one thread holding a connection permanently. I need to u...


💬 I'll explore the ActiveRecord connection pool implementation to map out all four mechanisms you're asking about.

  ▸ Agent(Deep dive into Rails connection pool implementation)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/ -type f -name "*.rb" | grep -E "(pool|connection)" | head -20)
      ↳ Bash(ls -la /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/ | grep -E "\.rb$")
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract -type f -name "*.rb" | head -20)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/queue.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/reaper.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/pool_manager.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/pool_config.rb)
      ↳ ⟹ returned to parent


💬 Let me read the key files directly to verify the analysis and give you precise line numbers.
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/queue.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/reaper.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb)

💬 Now I have everything I need. Here's the complete picture of how the four mechanisms cooperate.  ---  ## Rails Connection Pool: How the Pieces Fit Together  ...

──────── RESULT (success, 130751ms, 8 turns) ────────
Now I have everything I need. Here's the complete picture of how the four mechanisms cooperate.

---

## Rails Connection Pool: How the Pieces Fit Together

The implementation lives in three files:

| File | Contents |
|------|----------|
| `activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb` | `ConnectionPool` class — checkout, checkin, reap, flush |
| `…/connection_pool/queue.rb` | `Queue` and `ConnectionLeasingQueue` — the wait queue |
| `…/connection_pool/reaper.rb` | `Reaper` — the background maintenance thread |

The pool shares one `Monitor` lock between `ConnectionPool` and the `Queue`. This is the critical design choice that lets the lease be stamped atomically as the connection leaves the queue.

---

### 1. Checkout — acquiring a connection

The public entry point is `lease_connection` (line 310), which is what `with_connection` and every query path calls. It checks a per-thread `LeaseRegistry` (`@leases`) for a cached connection first; if absent it calls `checkout` (line 550).

`checkout` delegates to `acquire_connection` (line 852), which runs three ordered attempts:

```
acquire_connection
  │
  ├─ Phase 1: @available.poll (no timeout)
  │           └─ no_wait_poll: returns a connection only if queue.size > @num_waiting
  │              (won't jump ahead of threads already queued)
  │
  ├─ Phase 1b: try_to_checkout_new_connection
  │             └─ inside synchronize: checks (@connections.size + @now_connecting) < @size
  │                If room exists, increments @now_connecting and opens new connection
  │                *outside* the lock (DB connection is slow; holding the mutex here
  │                would block everyone else unnecessarily).
  │                @now_connecting ensures the in-flight count is reserved immediately
  │                even before the socket is open.
  │
  ├─ Phase 2: reap (inline, synchronous) — see §3 below
  │           then retry Phase 1 + 1b exactly once
  │           (a recently-dead thread may have freed a slot)
  │
  └─ Phase 3: @available.poll(checkout_timeout)
              └─ wait_poll: increments @num_waiting, then blocks on @cond.wait
                 Raises ConnectionTimeoutError after checkout_timeout seconds (default 5s)
```

Key code:

```ruby
# connection_pool.rb:859-873
def acquire_connection(checkout_timeout)
  if conn = @available.poll || try_to_checkout_new_connection
    conn
  else
    reap
    if conn = @available.poll || try_to_checkout_new_connection
      conn
    else
      @available.poll(checkout_timeout)   # blocks here
    end
  end
rescue ConnectionTimeoutError => ex
  raise ex.set_pool(self)
end
```

**Pool exhaustion** is enforced by the combination of `@size`, `@connections.size`, and `@now_connecting`. Once all three add up to the limit, `try_to_checkout_new_connection` returns `nil` (line 900), and the thread falls through to the blocking `poll(timeout)`.

**Why `@num_waiting` matters in the queue:** `no_wait_poll` (queue.rb:106) only returns a connection if `@queue.size > @num_waiting`. If three connections are available but five threads are already waiting, a new thread must join the wait rather than jumping the queue. This enforces LIFO fairness.

The connection is **leased** (bound to the calling thread) atomically inside `ConnectionLeasingQueue#internal_poll` (queue.rb:203–207), which runs under the same `Monitor` lock as the pool. There is no window where a connection is dequeued but not yet owned.

---

### 2. Check-in — returning a connection

```ruby
# connection_pool.rb:573-587
def checkin(conn)
  return if @pinned_connection.equal?(conn)   # skip for transaction-pinned conns

  conn.lock.synchronize do         # ① acquire the connection's own lock first
    synchronize do                 # ② then the pool lock
      connection_lease.clear(conn) # evict from @leases cache
      conn._run_checkin_callbacks do
        conn.expire                # marks the connection as not-in-use
      end
      @available.add conn          # push back to queue
    end
  end
end
```

The lock ordering — connection lock first, then pool lock — is consistent everywhere in the pool and prevents deadlocks.

`@available.add` (queue.rb:37–41) pushes the connection and calls `@cond.signal`, waking exactly one thread that may be sleeping in `wait_poll`. That thread will find the connection in `@queue`, call `remove`, and the `ConnectionLeasingQueue` subclass will atomically call `conn.lease` before returning.

---

### 3. Dead-thread reclamation — the Reaper

**The Reaper is a class-level singleton thread pool, not per-pool.** All `ConnectionPool` instances with the same `reaping_frequency` share one background thread (reaper.rb:25–27):

```ruby
@mutex = Mutex.new
@pools = {}    # frequency => [WeakRef<pool>, ...]
@threads = {}  # frequency => Thread
```

When a pool is created (connection_pool.rb:269–270):
```ruby
@reaper = Reaper.new(self, db_config.reaping_frequency)
@reaper.run
```

`run` calls `register_pool`, which records the pool as a `WeakRef` (so the pool can be garbage-collected if discarded) and starts exactly one thread per frequency value (reaper.rb:32–37). The thread sleeps, then calls `reap` and `flush` on each live pool (reaper.rb:49–59).

**`reap` itself** (connection_pool.rb:623–641):

```ruby
def reap
  stale_connections = synchronize do
    return if self.discarded?
    @connections.select do |conn|
      conn.in_use? && !conn.owner.alive?   # leased, but owning thread is dead
    end.each do |conn|
      conn.steal!    # reassigns ownership to the current thread so it can be handled
    end
  end

  stale_connections.each do |conn|
    if conn.active?
      conn.reset!    # roll back any open transaction, reset session state
      checkin conn   # return to pool normally
    else
      remove conn    # broken; drop it and let the pool open a fresh one
    end
  end
end
```

`reap` is also called inline during Phase 2 of checkout (line 862) — so if your thread is the first to notice the pool is exhausted, it tries to recover dead-thread connections immediately before blocking.

---

### 4. Idle eviction — `flush`

```ruby
# connection_pool.rb:646-664
def flush(minimum_idle = @idle_timeout)
  return if minimum_idle.nil?     # nil means "keep forever"

  idle_connections = synchronize do
    return if self.discarded?
    @connections.select do |conn|
      !conn.in_use? && conn.seconds_idle >= minimum_idle
    end.each do |conn|
      conn.lease                   # mark in-use so nothing else grabs it
      @available.delete conn       # remove from the wait queue
      @connections.delete conn     # remove from the pool roster
    end
  end

  idle_connections.each do |conn|
    conn.disconnect!               # actual I/O happens *outside* the lock
  end
end
```

`minimum_idle` defaults to `@idle_timeout` (default 300 s, from `database.yml`). The connections are **leased inside the lock** to prevent another thread from grabbing them between identification and removal. The actual `disconnect!` happens outside the lock so the mutex isn't held during network I/O.

The Reaper calls both `reap` and `flush` every `reaping_frequency` seconds (default 60 s). `flush!` (line 668) is the aggressive variant: it calls `reap` first to collect dead connections, then `flush(-1)` where `−1 < seconds_idle` is always true, evicting every idle connection regardless of age.

---

### How they cooperate — the lifecycle

```
Thread A                           Thread B (dead)     Reaper thread
   │                                    │                    │
   │ lease_connection                   │ died mid-query     │
   │   checkout                         │ conn still leased  │ sleep(60s)
   │     acquire_connection             │                    │
   │       @available.poll → nil        │                    │
   │       try_to_checkout_new → nil    │                    │
   │       reap() ──────────────────────┼────────────────────┤
   │         find in_use? &&            │ conn.steal!        │
   │         !owner.alive?              │                    │
   │         conn.reset! + checkin ─┐   │                    │
   │       @available.poll → conn ←─┘   │                    │
   │     checkout_and_verify(conn)      │                    │
   │   returns conn                     │                    │
   │                                    │                    │
   │ [uses conn]                        │                    │ sleep(60s) done
   │ checkin(conn)                      │                    │ reap() + flush()
   │   conn.expire                      │                    │   evict idle conns
   │   @available.add(conn)             │                    │   >= 300s idle
   │   @cond.signal ──────────────────────────────> wakes    │
   │                                    │          waiting   │
   │                                    │          Thread C  │
```

The three mechanisms interlock cleanly: inline `reap` during checkout recovers slots opportunistically (avoiding a blocking wait when dead threads are common), the Reaper handles steady-state cleanup on a timer, and `flush` prevents idle connections from accumulating when traffic drops.
