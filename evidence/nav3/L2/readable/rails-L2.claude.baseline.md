# transcript: To predict when a relation that hasn't run yet actually fires its database query during ordinary use — as opposed to an explicit call to force it — I need to...


💬 I'll explore the ActiveRecord `Relation` class to map out the lazy-loading machinery.

  ▸ Agent(Map ActiveRecord relation lazy-loading paths)  ⟶ subagent:
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/delegation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/associations/collection_proxy.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/associations/collection_proxy.rb)
      ↳ Bash(grep -n "def each\|def first\|def last\|def to_a\|def records\|def loaded\|def load\|def exec_queries" /home/bench/repos/rails/activerecord/lib/active_record...)
      ↳ Bash(grep -n "def each\|include Enumerable" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
      ↳ Bash(grep -n "def each" /home/bench/repos/rails/activerecord/lib/active_record/relation*.rb)
      ↳ Bash(grep -A 5 "delegate.*to_a" /home/bench/repos/rails/activerecord/lib/active_record/relation/delegation.rb)
      ↳ Bash(grep -B 2 "to_a" /home/bench/repos/rails/activerecord/lib/active_record/relation/delegation.rb)
      ↳ Bash(grep -B 3 -A 3 "def to_ary\|def to_a\|alias.*to_a" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/delegation.rb)
      ↳ Bash(grep -n "loaded?" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "loaded?\|@records" /home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "def count\|def sum\|def pluck" /home/bench/repos/rails/activerecord/lib/active_record/relation/calculations.rb | head -20)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/calculations.rb)
      ↳ Bash(grep -n "def calculate" /home/bench/repos/rails/activerecord/lib/active_record/relation/calculations.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/calculations.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/calculations.rb)
      ↳ Bash(grep -n "@records\|@loaded" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -40)
      ↳ Bash(grep -n "@arel\|def arel" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -20)
      ↳ Bash(grep -n "def arel\|@arel =" /home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb | head -20)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Bash(grep -n "find_from_target?" /home/bench/repos/rails/activerecord/lib/active_record/associations/collection_proxy.rb)
      ↳ Bash(grep -n "return.*if.*loaded\?" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb /home/bench/repos/rails/activerecord/lib/active_record/rela...)
      ↳ Bash(grep -n "if loaded?\|unless loaded?" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb /home/bench/repos/rails/activerecord/lib/active_recor...)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ ⟹ returned to parent


💬 Let me verify the key line numbers against the actual source.
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/delegation.rb)

💬 Good — all the line numbers check out. Let me get the finder_methods and pluck details to complete the picture.
  ▸ Bash(grep -n "def find_nth\|def find_last\|def find_take\|def include?\|def last\b" /home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods...)
  ▸ Bash(grep -n "def pluck\|if loaded?" /home/bench/repos/rails/activerecord/lib/active_record/relation/calculations.rb | head -20)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)

💬 Here is the complete picture, verified against the source.  ---  ## The materialization routine  **`load` — `relation.rb:1165`** is the gateway:  ```ruby def...

──────── RESULT (success, 210702ms, 10 turns) ────────
Here is the complete picture, verified against the source.

---

## The materialization routine

**`load` — `relation.rb:1165`** is the gateway:

```ruby
def load(&block)
  if !loaded? || scheduled?
    @records = exec_queries(&block)
    @loaded = true
  end
  self
end
```

It checks `@loaded` (exposed via `loaded?`). If false — or if an async result is pending — it calls `exec_queries`, stores the result in `@records`, and sets `@loaded = true`. It returns `self`, not the records.

**`exec_queries` — `relation.rb:1385`** does the real work:
1. If `scheduled?` is true (an async background query was started with `load_async`), it awaits `@future_result.result`.
2. Otherwise it calls `exec_main_query`, which runs the SQL via `klass._query_by_sql` (or the join-dependency path for eager loads).
3. Then: instantiate model objects → preload associations → stamp `readonly!` / `strict_loading!`.

**`exec_main_query` — `relation.rb:1405`** short-circuits before touching the database if `@none` is set or `where_clause.contradiction?` is true — both return `[]` immediately.

---

## The one-stop access point

**`records` — `relation.rb:335`**:

```ruby
def records
  load
  @records
end
```

Every path that needs the in-memory array goes through `records`. It always calls `load` first, so `load`'s `!loaded?` guard is the single place that decides whether a SQL round-trip happens.

**`to_ary` / `to_a` — `relation.rb:330`**: both delegate to `records.dup`, so they trigger the same path.

---

## Delegation — the largest set of triggers

`delegation.rb:98–101` wires a fixed list of array methods directly to `records`:

```ruby
delegate :to_xml, :encode_with, :length, :each, :join, :intersect?,
         :[], :&, :|, :+, :-, :sample, :reverse, :rotate, :compact, :in_groups, :in_groups_of,
         :to_sentence, :to_fs, :to_formatted_s, :as_json,
         :shuffle, :split, :slice, :index, :rindex, to: :records
```

Any call to one of these — including the ubiquitous `each`, `[]`, `length` — unconditionally calls `records`, which calls `load`. There is no `loaded?` check before the delegation; the guard lives inside `load` itself.

---

## Methods that deliberately avoid loading

These all branch on `loaded?` at their own level and, when the relation is cold, fire a narrower SQL query instead of loading every record:

| Method | File | What it does when NOT loaded | What it does when loaded |
|---|---|---|---|
| `size` | `relation.rb:346` | `count(:all)` — runs `COUNT(*)` | `records.length` |
| `empty?` | `relation.rb:355` | `!exists?` — runs `EXISTS` or `COUNT` | `records.empty?` |
| `none?` | `relation.rb:371` | delegates to `empty?` | same |
| `any?` | `relation.rb:384` | delegates to `empty?` | same |
| `one?` | `relation.rb:397` | `limited_count == 1` — `LIMIT 2` count | `records.one?` |
| `many?` | `relation.rb:406` | `limited_count > 1` — `LIMIT 2` count | `records.many?` |
| `include?` | `finder_methods.rb:389` | `exists?(id)` — SQL EXISTS (unless offset/limit/having are set, in which case it forces load) | `records.include?(record)` |
| `last` | `finder_methods.rb:202` | builds a reversed `ORDER BY … LIMIT n` relation and calls `first` on it — only materializes that one row | `find_last` → `records.last` |
| `pluck` | `calculations.rb:296` | runs `SELECT col FROM …` — only fetches named columns | `records.pluck(…)` (in-memory) |
| `pick` | `calculations.rb:349` | `pluck(*cols).first` — single-row narrow select | `records.first.slice(…)` |
| `count` / `sum` / `min` / `max` / `average` | `calculations.rb` | aggregate SQL query; never touches `@records` | aggregate SQL query (ignores cache) |
| `exists?` | `finder_methods.rb` | runs `SELECT 1 FROM … LIMIT 1` | runs the query anyway — does not check `loaded?` |

Note the asymmetry on `exists?`: it never consults `@records` even if the data is already in memory — it always goes to the database.

---

## Finder methods: conditional load

These check `loaded?` and, when cold, issue a targeted query rather than loading everything:

- **`find_nth_with_limit` (`finder_methods.rb:603`)** — if loaded, slices `@records[index, limit]`; if cold, runs `OFFSET index LIMIT limit`.
- **`find_nth_from_last` (`finder_methods.rb:622`)** — if loaded, uses `records[-index]`; if cold, reverses ordering and queries.
- **`find_take` / `find_take_with_limit` (`finder_methods.rb:582/590`)** — if loaded, reads from `@records`; if cold, adds `LIMIT n` and calls `records` (materializing only that slice).

---

## `load_async` — the async fork

`load_async` (`relation.rb:1134`) takes a different path:

```ruby
unless loaded?
  result = exec_main_query(async: c.current_transaction.closed?)
  if result.is_a?(Array)   # async unavailable, got rows directly
    @records = result
  else
    @future_result = result  # FutureResult scheduled in thread pool
  end
  @loaded = true
end
```

It sets `@loaded = true` immediately, before the query finishes. `scheduled?` (`relation.rb:1155`) returns `!!@future_result`. When `load` is later called for real access, the `!loaded? || scheduled?` condition re-enters `exec_queries`, which then waits for `@future_result.result` and promotes it into `@records`.

---

## What never loads

- **`to_sql` (`relation.rb:1196`)** — builds the SQL string from the Arel AST without executing it. Cached in `@to_sql`.
- **`arel`** — builds the Arel AST; no execution.
- All scope-building methods (`where`, `order`, `limit`, `joins`, …) — they return a new Relation object with modified bindings; nothing is executed.

---

## The reset path

`reset` (`relation.rb:1180`) clears everything: cancels `@future_result`, nils out `@loaded`, `@records`, `@arel`, `@to_sql`. `reload` calls `reset` then immediately calls `load`, forcing a fresh query even if the relation was already materialized.

---

**Summary of the decision tree for any method call on a Relation:**

1. Is this a scope-builder (`where`/`order`/…)? → returns a new cold Relation, no query.
2. Is this a delegated Array method (`each`, `[]`, `length`, …)? → calls `records` → calls `load` → queries if `!loaded? || scheduled?`.
3. Is this a smart aggregate (`size`, `empty?`, `count`, `pluck`, …)? → checks `loaded?` itself; uses a narrow SQL query when cold, in-memory operation when warm.
4. Is this `to_sql` or `arel`? → never queries, returns query description only.
