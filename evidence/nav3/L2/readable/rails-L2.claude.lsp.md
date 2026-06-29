# transcript: To predict when a relation that hasn't run yet actually fires its database query during ordinary use — as opposed to an explicit call to force it — I need to...


💬 Let me load the LSP tool first, then trace the materialization logic through the relation code.
  ▸ ToolSearch(select:LSP)

💬 Now let me find the core materialization symbols in parallel.
  ▸ LSP(loaded?)
  ▸ LSP(exec_queries)
  ▸ LSP(loaded?)
  ▸ LSP(exec_queries)

💬 LSP is still indexing — let me read the key files directly while it warms up.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/rails/activerecord/lib/active_record/relation.rb","line":1,"character":1})
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)

💬 Now let me check the delegation module (which handles `each` and Enumerable) and the finder methods.
  ▸ Bash(find /home/bench/repos/rails/activerecord/lib -name "delegation.rb" | head -5)
  ▸ Bash(find /home/bench/repos/rails/activerecord/lib -name "finder_methods.rb" | head -5)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/delegation.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)

💬 Let me grab the key finder methods too.
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)

💬 I now have everything needed for a precise, complete answer.  ---  ## ActiveRecord `Relation` materialization: the full picture  ### The state variables  A `...

──────── RESULT (success, 134717ms, 16 turns) ────────
I now have everything needed for a precise, complete answer.

---

## ActiveRecord `Relation` materialization: the full picture

### The state variables

A `Relation` has two instance variables that track loading state, set in `initialize` at relation.rb:81:

```ruby
@loaded = false   # attr_reader :loaded; alias loaded? :loaded  (line 71/74)
@records = nil    # the frozen Array of AR objects once populated
@future_result = nil  # non-nil when load_async has scheduled a background query
```

`loaded?` is just `@loaded` through `alias`. `scheduled?` (line 1155) is `!!@future_result`. Both being `true` simultaneously is the async-in-flight state.

---

### The gate: `load` (line 1165)

```ruby
def load(&block)
  if !loaded? || scheduled?
    @records = exec_queries(&block)
    @loaded = true
  end
  self
end
```

This is the single choke-point. It fires if either:
- `@loaded` is false — never loaded at all, or
- `scheduled?` — `load_async` already set `@loaded = true` but the query is still a `FutureResult` in `@future_result`

It **returns `self`** (the Relation), not the records. The actual array is written to `@records`.

---

### The universal entry point: `records` (line 335)

```ruby
def records
  load
  @records
end
```

`records` calls `load` then hands back the array. **Almost every record-touching call eventually reaches `records`.**

The `Delegation` module delegates a large set of methods directly to it (delegation.rb:98–101):

```ruby
delegate :to_xml, :encode_with, :length, :each, :join, :intersect?,
         :[], :&, :|, :+, :-, :sample, :reverse, :rotate, :compact, :in_groups, :in_groups_of,
         :to_sentence, :to_fs, :to_formatted_s, :as_json,
         :shuffle, :split, :slice, :index, :rindex, to: :records
```

So `each`, `[]`, `length`, and every array-style call materializes unconditionally. `to_ary`/`to_a` (line 330) also call `records.dup` directly. This means Ruby's implicit coercion of a `Relation` to an array (e.g. in splat, array concatenation, any block to `Enumerable` called without an overriding guard) will fire the query.

---

### What `exec_queries` does (line 1385)

`load` calls `exec_queries`, which:

1. **Resolves async or runs sync** — if `scheduled?`, drains `@future_result` via `.result`; otherwise calls `exec_main_query` inline.
2. **Calls `exec_main_query`** (line 1405):
   - `@none` → returns `[]` without touching the DB.
   - `where_clause.contradiction?` → returns `[].freeze` without touching the DB.
   - `eager_loading?` → builds a LEFT OUTER JOIN plan via `apply_join_dependency`, executes via `c.select_all`.
   - Otherwise → `klass._query_by_sql(c, arel, async:)`, the plain SELECT path.
3. **Instantiates rows** — `instantiate_records`: either through `@_join_dependency.instantiate` (eager path) or `klass._load_from_sql`.
4. **Preloads associations** (unless `skip_preloading_value`).
5. **Marks records** `readonly!` / `strict_loading!` if those values are set.

---

### `load_async` (line 1134)

```ruby
def load_async
  with_connection do |c|
    return load if !c.async_enabled?

    unless loaded?
      result = exec_main_query(async: c.current_transaction.closed?)
      if result.is_a?(Array)     # contradiction short-circuit returned [] already
        @records = result
      else
        @future_result = result  # a FutureResult wrapping the background thread
      end
      @loaded = true             # marks loaded NOW even though data isn't here yet
    end
  end
  self
end
```

`@loaded = true` is set **immediately** — this prevents a second call from re-queuing the same query. But `@future_result` is still non-nil so `scheduled?` is `true`. When `load` is later called (by `records` or any consumer), it sees `!loaded? || scheduled?` as true, falls through to `exec_queries`, which picks up `@future_result` and blocks waiting for the result.

---

### Methods that consult `loaded?` and take a cheaper SQL path when false

These never load all records if the relation is unloaded — they issue a targeted query instead:

| Method | When unloaded | When loaded |
|--------|---------------|-------------|
| `size` (line 346) | `count(:all)` — `SELECT COUNT(*)` | `records.length` in Ruby |
| `empty?` (line 355) | `!exists?` — `SELECT 1 … LIMIT 1` | `records.empty?` in Ruby |
| `none?` (line 371) | delegates to `empty?` | same |
| `any?` (line 384) | delegates to `!empty?` | same |
| `one?` (line 397) | `limited_count == 1` — `SELECT COUNT(*) … LIMIT 2` | `records.one?` in Ruby |
| `many?` (line 406) | `limited_count > 1` — same as above | `records.many?` in Ruby |
| `compute_cache_version` (line 465) | `SELECT COUNT(*), MAX(updated_at)` | iterates `records` in Ruby |
| `last` (finder_methods.rb:203) | builds reversed-ORDER + LIMIT SQL query | `find_last` — scans `records` in Ruby |
| `find_take` / `take` (finder_methods.rb:582) | `limit(1).records.first` — a new SQL with LIMIT 1 | `records.first` in Ruby |
| `find_take_with_limit` (finder_methods.rb:590) | `limit(n).to_a` | `records.take(n)` in Ruby |
| `find_nth_with_limit` / `first`, `second`, … (finder_methods.rb:603) | `OFFSET + LIMIT` query | `records[index, limit]` slice in Ruby |
| `include?` (finder_methods.rb:389) | `exists?(id)` — unless offset/limit/having forces materialization | `records.include?(record)` in Ruby |

The common shape throughout is:

```ruby
if loaded?
  records.<in-memory operation>
else
  <targeted SQL that answers only the scalar question>
end
```

`inspect` and `pretty_print` (lines 1272/1250) have a superficially similar branch but both branches still ultimately touch the DB — the unloaded path calls `take(limit)` on an annotated relation which runs a bounded SELECT, not a full load.

---

### Methods that always bypass materialization (never touch `@records`)

These issue their own SQL statement and leave the relation's loaded state untouched:

- **`update_all`** (line 581) — emits a single `UPDATE … SET`. Calls `reset` afterward.
- **`delete_all`** (line 1004) — emits a single `DELETE`. Calls `reset` afterward.
- **`touch_all`**, **`update_counters`** — delegate to `update_all`.
- **Calculations** — `count`, `sum`, `average`, `maximum`, `minimum` (in `activerecord/lib/active_record/relation/calculations.rb`) — always run a fresh aggregation query.
- **`pluck`**, **`ids`**, **`pick`** — build a projection-only query.
- **`exists?`** — `SELECT 1 … LIMIT 1`.
- **`find_by`** (finder_methods.rb:111) — `where(…).take`, which runs `LIMIT 1` against a fresh relation object, not `self`.
- **`to_sql`** (line 1196) — purely compiles Arel to a string; no DB round-trip, no loading.

---

### `reset` clears the gate (line 1180)

```ruby
def reset
  @future_result&.cancel
  @future_result = nil
  @to_sql = @arel = @loaded = @should_eager_load = nil
  @records = nil
  self
end
```

Setting `@loaded = nil` (falsy) puts the relation back to unloaded. `update_all`, `delete_all` call `reset` to signal that any previously cached records are stale. `reload` calls `reset` then `load`.

---

### Summary decision tree

```
Consumer calls a method on a Relation
│
├── Method delegates to :records (each, [], to_ary, to_a, blank?, destroy_all, …)
│     └── records → load → exec_queries [ALWAYS MATERIALIZES]
│
├── Method checks loaded? first (size, empty?, any?, one?, many?, last, first/nth, include?, …)
│     ├── loaded? = true  → operate on @records in memory [NO QUERY]
│     └── loaded? = false → issue a narrow targeted SQL [ONE TARGETED QUERY, @records stays nil]
│
├── Method ignores loaded entirely (update_all, delete_all, count, pluck, exists?, find_by, …)
│     └── issues its own SQL directly [BYPASSES @records COMPLETELY]
│
└── load_async path
      → sets @loaded = true + @future_result immediately
      → first call to records/load resolves the future [BLOCKS UNTIL BACKGROUND QUERY FINISHES]
```

The key invariant: **`@loaded` guards `load`; `loaded?` is tested by individual methods to avoid a full `SELECT *`.** A relation that has never been iterated as an array but has been queried via `count`/`exists?`/`pluck` remains `@loaded = false` — the next `to_a` will still fire the full query.
