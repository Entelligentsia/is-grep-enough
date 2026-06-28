# transcript: To predict when a relation that hasn't run yet actually fires its database query during ordinary use — as opposed to an explicit call to force it — I need to...


💬 Let me start by loading the grove tools and then mapping the Relation class structure.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__map)

💬 Now let me map the core relation files to find the materialization and loaded-state machinery.
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record","kind":"method","name":"load"})
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record","kind":"method","name":"loaded?"})
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record","kind":"method","name":"records"})

💬 Good, I have the key symbol IDs. Let me read the core materialization methods and the relation's loaded state in parallel.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#load@1165"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#records@335"})
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/relation.rb","detail":0})

💬 Now let me read all the load-path methods, the bypass paths, and the `initialize`/`reset` state in parallel.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#exec_queries@1385"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#exec_main_query@1405"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#load_async@1134"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#scheduled?@1155"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#reload@1175"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#reset@1180"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#initialize@77"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#initialize_copy@90"})

💬 Now let me read the access-path methods that branch on loaded state versus hitting the DB directly.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#to_ary@330"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#size@346"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#empty?@355"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#any?@384"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#none?@371"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#one?@397"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#many?@406"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#==@1239"})

💬 Now let me check `inspect`, `destroy_all`, `load_records`, and how Enumerable delegation is wired — these reveal the remaining branch points.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#inspect@1272"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#destroy_all@982"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#load_records@1313"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#preload_associations@1303"})
  ▸ Bash(grep -n "delegate\|Enumerable\|method_missing\|respond_to" activerecord/lib/active_record/relation.rb | head -40)

💬 Now let me find `each` on Relation and `method_missing`, which wire Enumerable through `records`.
  ▸ Bash(grep -n "def each\|def method_missing\|def respond_to_missing" activerecord/lib/active_record/relation.rb)
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record","kind":"method","name":"exec_queries"})
  ▸ Bash(grep -rn "def each" activerecord/lib/active_record/relation/ activerecord/lib/active_record/relation.rb 2>/dev/null | head -20)
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/record_fetch_warning.rb#exec_queries@19"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/association_relation.rb#exec_queries@43"})
  ▸ Bash(grep -rn "def each\|alias.*each\|alias_method.*each" activerecord/lib/active_record/ | grep -v "each_\|foreach\|find_each\|batch" | head -20)
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation.rb#to_a@333"})
  ▸ Bash(grep -n "each\|delegate" activerecord/lib/active_record/relation.rb | grep -v "#\|each_\|find_each\|each_with\|each_slice\|each_cons" | head -30)
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/relation/delegation.rb","detail":1})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/delegation.rb#method_missing@115"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/delegation.rb#delegated_classes@8"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/delegation.rb#initialize_relation_delegate_cache@29"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/delegation.rb#generate_method@71"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/delegation.rb#include_relation_methods@54"})

💬 Now let me check the finder methods that deliberately bypass the loaded cache and issue fresh queries.
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/relation/finder_methods.rb","detail":0})
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/relation/calculations.rb","detail":0})

💬 Let me read the key finder methods and `include?` to see which bypass the `@records` cache.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/finder_methods.rb#first@173"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/finder_methods.rb#find_nth@598"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/finder_methods.rb#find_nth_with_limit@603"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/finder_methods.rb#last@202"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/finder_methods.rb#exists?@357"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/finder_methods.rb#include?@389"})

💬 Let me also check `find_last` and `spawn` (which resets loaded state on chaining), then I have everything I need.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/finder_methods.rb#find_last@636"})
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record/relation","kind":"method","name":"spawn"})

💬 Let me read the `include Enumerable` block to see how `each` is wired, and the query-method `spawn` to understand state on chaining.
  ▸ Read(activerecord/lib/active_record/relation.rb)
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/relation/spawn_methods.rb#spawn@9"})
  ▸ Bash(grep -rn "def each\b" activerecord/lib/active_record/ | grep -v "_each\|each_with\|each_slice\|each_cons\|each_key\|each_val\|each_pair\|each_attr\|each_join...)
  ▸ Bash(grep -n "method_missing\|delegate_to_scoped_klass\|generate_relation_method" activerecord/lib/active_record/core.rb activerecord/lib/active_record/scoping.rb...)
  ▸ Bash(grep -n "def method_missing" activerecord/lib/active_record/scoping/named.rb activerecord/lib/active_record/base.rb activerecord/lib/active_record/core.rb 2>...)
  ▸ Bash(grep -rn "def method_missing" activerecord/lib/active_record/ | grep -v "test\|spec" | head -20)
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/dynamic_matchers.rb#method_missing@15"})
  ▸ Read(activerecord/lib/active_record/scoping/named.rb)
  ▸ Bash(grep -n "def each\b" activerecord/lib/active_record/relation/batches.rb 2>/dev/null | head -10)
  ▸ Bash(grep -rn "def each\b" activerecord/lib/active_record/relation/ 2>/dev/null)
  ▸ Read(activerecord/lib/active_record/relation/delegation.rb)

💬 There it is — line 98. Now I have the complete picture. Let me put it all together.  ---  ## How ActiveRecord lazy materialization works  ### The state  Thre...

──────── RESULT (success, 347887ms, 64 turns) ────────
There it is — line 98. Now I have the complete picture. Let me put it all together.

---

## How ActiveRecord lazy materialization works

### The state

Three instance variables hold everything:

```
@loaded        — false on init; true once records are in memory (or async is scheduled)
@future_result — holds an in-flight async promise; nil for sync paths
@records       — the Array of AR objects; nil until fully materialized
```

`loaded?` is `alias :loaded? :loaded` (relation.rb:74) — it reads `@loaded` directly.  
`scheduled?` is `!!@future_result` (relation.rb:1155).

---

### The materialization routine

**`load` (relation.rb:1165)** is the single gatekeeper:

```ruby
def load(&block)
  if !loaded? || scheduled?
    @records = exec_queries(&block)
    @loaded = true
  end
  self
end
```

It fires when `@loaded` is false *or* when `@future_result` is pending (the `scheduled?` branch). After it runs, `@records` is frozen and `@loaded` is `true`. Subsequent calls are no-ops.

**`records` (relation.rb:335)** is the universal gate every access path flows through:

```ruby
def records
  load
  @records
end
```

**`exec_queries` (relation.rb:1385)** is what actually touches the database:

```ruby
def exec_queries(&block)
  skip_query_cache_if_necessary do
    rows = if scheduled?
      future = @future_result
      @future_result = nil
      future.result           # block on the async promise
    else
      exec_main_query         # synchronous SQL
    end
    records = instantiate_records(rows, &block)
    preload_associations(records) unless skip_preloading_value
    records.each(&:readonly!) if readonly_value
    records.each { |r| r.strict_loading!(strict_loading_value) } unless strict_loading_value.nil?
    records
  end
end
```

`exec_main_query` (relation.rb:1405) branches further:
- `@none` flag set → returns `[]` immediately, no SQL
- `where_clause.contradiction?` → returns `[].freeze`, no SQL
- `eager_loading?` → join-dependency path with `select_all`
- otherwise → `klass._query_by_sql(c, arel)`

---

### The async path (`load_async`, relation.rb:1134)

```ruby
def load_async
  with_connection do |c|
    return load if !c.async_enabled?
    unless loaded?
      result = exec_main_query(async: c.current_transaction.closed?)
      if result.is_a?(Array)
        @records = result          # sync fallback (open transaction)
      else
        @future_result = result    # true async: SQL is in-flight
      end
      @loaded = true
    end
  end
  self
end
```

`load_async` sets `@loaded = true` immediately so the relation reads as "loaded" before the result arrives. But `scheduled?` stays true until `exec_queries` consumes `@future_result`. The first call to `records` → `load` sees `scheduled?` and runs `exec_queries` to block on the future, run instantiation, and preload associations. The SQL round-trip itself was already started; only object construction is deferred.

---

### Access paths that force full materialization

These all funnel through `records` → `load`:

**Explicit delegation** — `delegation.rb:98-101` hardwires a list straight to `records`:

```ruby
delegate :each, :length, :[], :&, :|, :+, :-, :sample, :reverse, :rotate,
         :compact, :shuffle, :split, :slice, :index, :rindex,
         :in_groups, :in_groups_of, :to_sentence, :to_fs, :as_json,
         :intersect?, :join, :to_xml, :encode_with, to: :records
```

`each` is in this list. Because `Relation` also `include Enumerable` (relation.rb:67), and `each` is now delegated to `records.each`, every Enumerable method (`map`, `select`, `min_by`, `flat_map`, `inject`, etc.) materializes the relation first.

**`to_ary` / `to_a`** (relation.rb:330-333):
```ruby
def to_ary
  records.dup
end
alias to_a to_ary
```
These also trigger Ruby's implicit array coercion (multiple assignment, array concatenation, splat), so those all materialize.

**`destroy_all`** (relation.rb:982): `records.each(&:destroy).tap { reset }` — forces a load, destroys each record, then resets to unloaded.

**`==` vs Array** (relation.rb:1239): `records == other` — materializes.

---

### Access paths that deliberately avoid loading

These branch on `loaded?` and issue targeted SQL when the cache is cold:

| Method | If `loaded?` | If not `loaded?` |
|--------|-------------|-----------------|
| `size` | `records.length` | `count(:all)` — SQL COUNT |
| `empty?` | `records.empty?` | `!exists?` — SQL EXISTS |
| `any?` / `none?` | delegates to `empty?` above | delegates to `empty?` → SQL EXISTS |
| `one?` | `records.one?` | `limited_count == 1` — SQL COUNT LIMIT 2 |
| `many?` | `records.many?` | `limited_count > 1` — SQL COUNT LIMIT 2 |
| `first(n)` / `find_nth_with_limit` | `records[index, limit]` | fresh `SELECT … LIMIT n OFFSET i` |
| `last` | `find_last` → `records.last` | reversed-order `SELECT … LIMIT` |
| `include?` | `records.include?(record)` | `exists?(id)` — SQL EXISTS (unless has limit/offset/having, then loads) |
| `inspect` | `records.take(...)` | limited query **without** populating `@records` |

`exists?`, `count`, `sum`, `average`, `minimum`, `maximum`, `pluck`, `pick`, and `ids` **always** issue their own SQL regardless of `loaded?` — they never read `@records`.

---

### State resets on chaining

Every query-method call (`.where`, `.order`, `.limit`, etc.) calls `spawn` (spawn_methods.rb:9), which calls `clone` → `initialize_copy` (relation.rb:90-93):

```ruby
def initialize_copy(other)
  @values = @values.dup
  reset
end
```

`reset` (relation.rb:1180) clears everything:

```ruby
def reset
  @future_result&.cancel
  @future_result = nil
  @loaded = @should_eager_load = @to_sql = @arel = nil
  @records = @cache_keys = @cache_versions = nil
  self
end
```

So chaining always produces an unloaded relation, regardless of the parent's state.

`reload` (relation.rb:1175) is `reset` + `load` — it cancels any pending async, wipes the cache, and immediately fires a fresh query.

`load_records` (relation.rb:1313) is a bypass used by preloaders and `CollectionProxy` to inject records directly:

```ruby
def load_records(records)
  @records = records.freeze
  @loaded = true
end
```

This sets `@loaded = true` without ever calling `exec_queries`, used when records are already in hand from a join or preload.

---

### Summary decision tree

```
Access the relation
      │
      ├─ size / empty? / any? / none? / one? / many? / include?
      │         │
      │         ├─ loaded? → reads @records in memory (no SQL)
      │         └─ not loaded? → targeted SQL (COUNT / EXISTS / etc.)
      │
      ├─ count / sum / pluck / pick / ids / exists?
      │         └─ always SQL, never reads @records
      │
      ├─ each / map / to_a / to_ary / [] / inspect-loaded? / destroy_all / ==Array
      │         └─ records → load → exec_queries → SQL (first time only)
      │                                           → @records (subsequent times)
      │
      └─ load_async
                └─ exec_main_query(async:true) starts SQL in background
                   @future_result set, @loaded = true
                   → first records call blocks on future.result, then instantiates
```

The query fires at the moment something calls `records` (or one of its direct delegates) and `@loaded` is false — or `scheduled?` is true, which represents the async case where SQL was pre-issued but objects haven't been built yet.
