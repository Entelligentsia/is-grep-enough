# rails · L3 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **rails** (ruby) @ `3f32215ef`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | rails (ruby) · L3 |
| pinned source | `3f32215efb068fd941d03b58295730560227f648` |
| status | completed |
| engagement | `grove_tools = 37` (gate: > 0 → ✓ used its capability) |
| turns | 39 |
| wall clock | 237 s |
| context (peak) | 623,138 tokens |
| cost (billed) | $0.5176 |
| &nbsp;&nbsp;↳ token split | in 29 · out 9,630 · cache-create 32,536 · cache-read 590,573 |
| tool calls | 38 (mcp__grove__source×19, mcp__grove__symbols×15, mcp__grove__outline×3, ToolSearch×1) |
| evidence | `evidence/nav3/L3/raw/rails-L3.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens to a query from the moment a relation is forced to load until the matching rows exist as model objects in memory. I'm interested in how the accumulated where-clause gets turned into SQL, how that SQL is handed to the connection and executed, how the raw result rows come back, and how those rows are then turned into initialized ActiveRecord instances. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll trace this end-to-end using grove to navigate the code structurally. Let me load the grove tools and start exploring the key files simultaneously.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)`

💬 Now let me explore the key files in parallel — the Relation class (where loading starts), the query compilation layer, and the connection adapter.

&nbsp;&nbsp;▸ `mcp__grove__outline(activerecord/lib/active_record/relation.rb)`
&nbsp;&nbsp;▸ `mcp__grove__outline(activerecord/lib/active_record/relation/finder_methods.rb)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(load)`

💬 Now let me read the key methods in the loading pipeline in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation.rb#load@1165)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation.rb#exec_queries@1385)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation.rb#exec_main_query@1405)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation.rb#instantiate_records@1437)`

💬 Good. Now I need to trace two branches: how `arel` is built from the relation's accumulated clauses, and what `_query_by_sql` / `_load_from_sql` do. Let me fetch those in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation.rb#to_sql@1196)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(_query_by_sql)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(_load_from_sql)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(arel)`

💬 Now let me read those three methods and also the `build_arel` method which does the heavy lifting.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation/query_methods.rb#arel@1572)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/querying.rb#_query_by_sql@69)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/querying.rb#_load_from_sql@73)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(build_arel)`

💬 Now let me read `build_arel` in full, and in parallel look at `instantiate` and `select_all` on the connection.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation/query_methods.rb#build_arel@1732)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(instantiate)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(select_all)`

💬 Now I need the last few pieces: how `where_clause.ast` is built, how `select_all` actually executes the query and what it returns, and how `instantiate` on the model works.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb#select_all@69)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/persistence.rb#instantiate@100)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(instantiate_instance_of)`
&nbsp;&nbsp;▸ `mcp__grove__outline(activerecord/lib/active_record/relation/where_clause.rb)`

💬 A few more key pieces to complete the picture — `WhereClause#ast`, `to_sql_and_binds`, and `instantiate_instance_of`.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation/where_clause.rb#ast@70)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(to_sql_and_binds)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(instantiate_instance_of)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb#to_sql_and_binds@17)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/persistence.rb#instantiate_instance_of@313)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(select)`

💬 One more round — the bottom of the connection stack and the model initialization.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb#select@626)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(init_with_attributes)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/relation/where_clause.rb#predicates_with_wrapped_sql_literals@187)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/core.rb#init_with_attributes@500)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(internal_exec_query)`

💬 Let me read the PostgreSQL `internal_exec_query` as a concrete example, and also check how `build_from_database` works.

&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activerecord/lib/active_record/connection_adapters/postgresql/database_statements.rb#internal_exec_query@65)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(build_from_database)`

💬 I have enough to write the full trace. Let me look up one last piece — the attributes builder `build_from_database`.

&nbsp;&nbsp;▸ `mcp__grove__symbols(build_from_database)`
&nbsp;&nbsp;▸ `mcp__grove__source(ruby:activemodel/lib/active_model/attribute_set/builder.rb#build_from_database@15)`

💬 I now have every piece of the pipeline. Here is the complete end-to-end trace.

---

## End-to-end: from forcing a relation to load to model objects in memory

### 1. The trigger — `load` (`relation.rb:1165`)

Any operation that needs the actual records — `to_a`, iteration, `inspect` — calls `to_ary` (line 330), which is aliased to `to_a`. Both simply delegate to `load`:

```ruby
def load(&block)
  if !loaded? || scheduled?
    @records = exec_queries(&block)
    @loaded = true
  end
  self
end
```

If the relation is already `@loaded` this is a no-op. Otherwise it hands off to `exec_queries` and caches the result in `@records`.

---

### 2. `exec_queries` (`relation.rb:1385`)

```ruby
def exec_queries(&block)
  skip_query_cache_if_necessary do
    rows = exec_main_query          # or future_result.result for async
    records = instantiate_records(rows, &block)
    preload_associations(records) unless skip_preloading_value
    records.each(&:readonly!) if readonly_value
    records
  end
end
```

Three concerns happen here in sequence: get raw rows, instantiate model objects, and then preload any `:includes` associations. `skip_query_cache_if_necessary` bypasses the query cache when the relation's `uncached` flag is set.

---

### 3. `exec_main_query` (`relation.rb:1405`) — routing

```ruby
def exec_main_query(async: false)
  return [] if @none
  skip_query_cache_if_necessary do
    if where_clause.contradiction?    # e.g. WHERE 1=0
      [].freeze
    elsif eager_loading?              # includes + references path
      klass.with_connection do |c|
        apply_join_dependency do |relation, join_dependency|
          c.select_all(relation.arel, "SQL", async: async)
        end
      end
    else                              # the common path
      klass.with_connection do |c|
        klass._query_by_sql(c, arel, async: async)
      end
    end
  end
end
```

Three short-circuits exist before any SQL runs: the `none` scope, a detected contradiction in the where clause, and the eager-loading path (which joins associations into one big query). The common case hits the `else` branch. The key call is `arel` — the first time it's accessed, the whole Arel tree gets built.

---

### 4. Building the Arel tree — `arel` and `build_arel` (`query_methods.rb:1572, 1732`)

```ruby
def arel(aliases = nil)
  @arel ||= with_connection { |c| build_arel(c, aliases) }
end
```

Memoised on first access. `build_arel` materialises all the accumulated query values that have been stacked up by each chained `where`, `order`, `limit`, etc. call:

```ruby
def build_arel(connection, aliases = nil)
  arel = Arel::SelectManager.new(table)

  build_joins(arel.join_sources, aliases)

  arel.where(where_clause.ast)  unless where_clause.empty?
  arel.having(having_clause.ast) unless having_clause.empty?
  arel.take(...)   if limit_value
  arel.skip(...)   if offset_value
  arel.group(...)  unless group_values.empty?
  build_order(arel)
  build_with(arel)
  build_select(arel)
  arel.distinct(distinct_value)
  arel.from(build_from) unless from_clause.empty?
  arel.lock(lock_value) if lock_value
  # ...annotations, optimizer hints
  arel
end
```

`Arel::SelectManager` is the root of the AST. Each call on it (`where`, `take`, `group`, …) attaches the appropriate Arel node type as a child.

**How the where clause becomes an AST node — `WhereClause#ast` (`where_clause.rb:70`)**

Every call to `.where(...)` on the relation pushed a predicate onto `WhereClause#@predicates`. These are already Arel nodes (built by `PredicateBuilder` when `where` was called). `ast` packages them:

```ruby
def ast
  predicates = predicates_with_wrapped_sql_literals
  predicates.one? ? predicates.first : Arel::Nodes::And.new(predicates)
end
```

Raw SQL strings get wrapped in an `Arel::Nodes::SqlLiteral` fragment. Multiple predicates are joined under a single `And` node. A single predicate is returned as-is. This AST node becomes the argument to `arel.where(...)`.

---

### 5. `_query_by_sql` → `select_all` (`querying.rb:69`, `database_statements.rb:69`)

```ruby
def _query_by_sql(connection, sql, binds = [], ...)
  connection.select_all(sanitize_sql(sql), "#{name} Load", binds, ...)
end
```

`sanitize_sql` resolves any remaining string interpolation or array-condition syntax (`["name = ?", "Alice"]`) before going further.

`select_all` (`database_statements.rb:69`):

```ruby
def select_all(arel, name = nil, binds = [], preparable: nil, async: false, allow_retry: false)
  arel = arel_from_relation(arel)
  sql, binds, preparable, allow_retry = to_sql_and_binds(arel, binds, preparable, allow_retry)
  select(sql, name, binds, prepare: prepared_statements && preparable, ...)
end
```

---

### 6. `to_sql_and_binds` — Arel → SQL string (`database_statements.rb:17`)

This is where the Arel AST gets serialised to a SQL string:

```ruby
def to_sql_and_binds(arel_or_sql_string, binds = [], ...)
  if arel_or_sql_string.respond_to?(:ast)
    arel_or_sql_string = arel_or_sql_string.ast   # SelectManager → root node
  end

  if Arel.arel_node?(arel_or_sql_string)
    collector = collector()
    if prepared_statements
      collector.preparable = true
      sql, binds = visitor.compile(arel_or_sql_string, collector)
      # binds = extracted BindParam values
    else
      sql = visitor.compile(arel_or_sql_string, collector)
      # values are inlined into the SQL string
    end
    [sql.freeze, binds, preparable, allow_retry]
  end
end
```

`visitor` is a database-specific Arel visitor (e.g. `Arel::Visitors::PostgreSQL`). It does a recursive depth-first walk of the AST, emitting SQL fragments into a `Collector` string buffer. Each node type has a corresponding `visit_*` method — `visit_Arel_Nodes_And`, `visit_Arel_Nodes_Equality`, etc. — that writes the appropriate SQL syntax. When `prepared_statements` is on, `BindParam` nodes are emitted as `$1`/`?` placeholders and their values are collected separately.

---

### 7. `select` → `internal_exec_query` — actual database round-trip (`database_statements.rb:626`)

```ruby
def select(sql, name = nil, binds = [], prepare: false, async: false, ...)
  result = internal_exec_query(sql, name, binds, prepare: prepare, allow_retry: allow_retry)
  result
end
```

`internal_exec_query` is adapter-specific. For PostgreSQL (`postgresql/database_statements.rb:65`):

```ruby
def internal_exec_query(sql, name = "SQL", binds = [], prepare: false, ...)
  execute_and_clear(sql, name, binds, prepare: prepare, ...) do |result|
    types = {}
    fields = result.fields
    fields.each_with_index do |fname, i|
      ftype = result.ftype(i)
      fmod  = result.fmod(i)
      types[fname] = types[i] = get_oid_type(ftype, fmod, fname)
    end
    build_result(columns: fields, rows: result.values, column_types: types.freeze)
  end
end
```

`execute_and_clear` sends the SQL (and bound values, if prepared) to the `pg` gem, gets back a `PG::Result`. The block then:
- reads the **column names** from `result.fields`
- maps each column's PostgreSQL **OID** (`ftype`) and modifier (`fmod`) through the OID type map to get a cast object
- packages everything into an `ActiveRecord::Result` — a thin struct holding `columns` (Array of names), `rows` (Array of value arrays), and `column_types` (Hash of name → type object)

This `Result` object is what comes back as `rows` up in `exec_queries`.

---

### 8. `instantiate_records` → `_load_from_sql` (`relation.rb:1437`, `querying.rb:73`)

```ruby
def instantiate_records(rows, &block)
  return [].freeze if rows.empty?
  klass._load_from_sql(rows, &block).freeze
end
```

```ruby
def _load_from_sql(result_set, &block)
  column_types = result_set.column_types
  # Strip out types already known to the model's own schema
  column_types = column_types.reject { |k, _| attribute_types.key?(k) }

  message_bus.instrument("instantiation.active_record", payload) do
    if result_set.includes_column?(inheritance_column)
      result_set.map { |record| instantiate(record, column_types, &block) }
    else
      result_set.map { |record| instantiate_instance_of(self, record, column_types, &block) }
    end
  end
end
```

`result_set` iterates as a sequence of hashes: `{ "id" => 1, "name" => "Alice", … }`. The `column_types` passed down are the extra OID-derived types for columns not already covered by the model's declared attribute schema. The `"instantiation.active_record"` instrumentation notification fires here (with `record_count` and `class_name` in the payload).

**STI branching:** if the result set contains the inheritance column (`type`), each row may be a different subclass, so `instantiate` is called per-row, which calls `discriminate_class_for_record` to find the right class before delegating to `instantiate_instance_of`. Without STI the whole set is homogeneous and `instantiate_instance_of` is called directly with `self` as the klass.

---

### 9. `instantiate_instance_of` — building the model object (`persistence.rb:313`)

```ruby
def instantiate_instance_of(klass, attributes, column_types = {}, &block)
  attributes = klass.attributes_builder.build_from_database(attributes, column_types)
  klass.allocate.init_with_attributes(attributes, &block)
end
```

Two steps:

**Step A — `build_from_database` (`attribute_set/builder.rb:15`)**

```ruby
def build_from_database(values = {}, additional_types = {})
  LazyAttributeSet.new(values, types, additional_types, default_attributes)
end
```

This does **not** cast any values yet. It creates a `LazyAttributeSet` that holds the raw database strings alongside the type registry. Each attribute is only cast to its Ruby type the first time it is read (via `ActiveModel::Attribute#value`, which calls `type.deserialize(raw_value)`). This is the lazy deserialisation that keeps instantiation cheap even for wide tables.

**Step B — `allocate` + `init_with_attributes` (`core.rb:500`)**

```ruby
def init_with_attributes(attributes, new_record = false)
  @new_record = new_record    # false — persisted record
  @attributes = attributes    # the LazyAttributeSet from above

  init_internals              # zeros @destroyed, @previously_new_record,
                              # clears association/aggregation caches, etc.

  yield self if block_given?

  _run_find_callbacks
  _run_initialize_callbacks
  self
end
```

`allocate` bypasses `initialize` entirely — no callbacks fire during allocation. `init_with_attributes` sets the two essential instance variables (`@new_record`, `@attributes`), calls `init_internals` to reset bookkeeping state, runs any block passed in (the optional block from `.all { |r| ... }` calls), and then fires the `after_find` and `after_initialize` callbacks. The object is fully usable at this point.

---

## Summary of the call chain

```
Relation#to_ary / #load
  └─ exec_queries
       ├─ exec_main_query
       │    └─ arel          ← build_arel (Arel::SelectManager assembled
       │         │              from where_clause.ast, order, limit, …)
       │         └─ _query_by_sql → connection.select_all
       │              └─ to_sql_and_binds
       │                   └─ visitor.compile(ast, collector)
       │                        → SQL string + bind params
       │              └─ select → internal_exec_query
       │                   └─ [pg/mysql2/sqlite3 gem round-trip]
       │                        → ActiveRecord::Result
       │                             (columns[], rows[][], column_types{})
       └─ instantiate_records
            └─ _load_from_sql                 ← "instantiation.active_record" notif
                 └─ instantiate_instance_of (×N, one per row)
                      ├─ attributes_builder.build_from_database
                      │    → LazyAttributeSet  (values not cast yet)
                      └─ klass.allocate.init_with_attributes
                           → @new_record=false, @attributes=…
                           → init_internals (caches zeroed)
                           → _run_find_callbacks
                           → _run_initialize_callbacks
```

### Key design points to hold onto

- **The `WhereClause` is just an array of Arel nodes.** Every call to `.where(...)` appends to it; nothing is compiled until `arel` is first accessed.
- **`build_arel` is the single assembly point.** It is memoised — the Arel tree is built once, SQL is then derived from it.
- **The Arel visitor does the actual text generation.** One visitor per adapter subclass handles dialect differences (quoting, `LIMIT` syntax, `RETURNING`, etc.).
- **`internal_exec_query` is the adapter seam.** Everything above it is adapter-agnostic; below it you are talking to the gem (`pg`, `mysql2`, `sqlite3`).
- **`ActiveRecord::Result` is just data.** Columns + rows + types — no model awareness at all.
- **Instantiation is lazy.** `LazyAttributeSet` defers type casting until an attribute is read; `allocate` + `init_with_attributes` bypasses `initialize`, keeping object construction fast.


## Final answer

_Result event — success, 237 s, 39 turns._

I now have every piece of the pipeline. Here is the complete end-to-end trace.

---

## End-to-end: from forcing a relation to load to model objects in memory

### 1. The trigger — `load` (`relation.rb:1165`)

Any operation that needs the actual records — `to_a`, iteration, `inspect` — calls `to_ary` (line 330), which is aliased to `to_a`. Both simply delegate to `load`:

```ruby
def load(&block)
  if !loaded? || scheduled?
    @records = exec_queries(&block)
    @loaded = true
  end
  self
end
```

If the relation is already `@loaded` this is a no-op. Otherwise it hands off to `exec_queries` and caches the result in `@records`.

---

### 2. `exec_queries` (`relation.rb:1385`)

```ruby
def exec_queries(&block)
  skip_query_cache_if_necessary do
    rows = exec_main_query          # or future_result.result for async
    records = instantiate_records(rows, &block)
    preload_associations(records) unless skip_preloading_value
    records.each(&:readonly!) if readonly_value
    records
  end
end
```

Three concerns happen here in sequence: get raw rows, instantiate model objects, and then preload any `:includes` associations. `skip_query_cache_if_necessary` bypasses the query cache when the relation's `uncached` flag is set.

---

### 3. `exec_main_query` (`relation.rb:1405`) — routing

```ruby
def exec_main_query(async: false)
  return [] if @none
  skip_query_cache_if_necessary do
    if where_clause.contradiction?    # e.g. WHERE 1=0
      [].freeze
    elsif eager_loading?              # includes + references path
      klass.with_connection do |c|
        apply_join_dependency do |relation, join_dependency|
          c.select_all(relation.arel, "SQL", async: async)
        end
      end
    else                              # the common path
      klass.with_connection do |c|
        klass._query_by_sql(c, arel, async: async)
      end
    end
  end
end
```

Three short-circuits exist before any SQL runs: the `none` scope, a detected contradiction in the where clause, and the eager-loading path (which joins associations into one big query). The common case hits the `else` branch. The key call is `arel` — the first time it's accessed, the whole Arel tree gets built.

---

### 4. Building the Arel tree — `arel` and `build_arel` (`query_methods.rb:1572, 1732`)

```ruby
def arel(aliases = nil)
  @arel ||= with_connection { |c| build_arel(c, aliases) }
end
```

Memoised on first access. `build_arel` materialises all the accumulated query values that have been stacked up by each chained `where`, `order`, `limit`, etc. call:

```ruby
def build_arel(connection, aliases = nil)
  arel = Arel::SelectManager.new(table)

  build_joins(arel.join_sources, aliases)

  arel.where(where_clause.ast)  unless where_clause.empty?
  arel.having(having_clause.ast) unless having_clause.empty?
  arel.take(...)   if limit_value
  arel.skip(...)   if offset_value
  arel.group(...)  unless group_values.empty?
  build_order(arel)
  build_with(arel)
  build_select(arel)
  arel.distinct(distinct_value)
  arel.from(build_from) unless from_clause.empty?
  arel.lock(lock_value) if lock_value
  # ...annotations, optimizer hints
  arel
end
```

`Arel::SelectManager` is the root of the AST. Each call on it (`where`, `take`, `group`, …) attaches the appropriate Arel node type as a child.

**How the where clause becomes an AST node — `WhereClause#ast` (`where_clause.rb:70`)**

Every call to `.where(...)` on the relation pushed a predicate onto `WhereClause#@predicates`. These are already Arel nodes (built by `PredicateBuilder` when `where` was called). `ast` packages them:

```ruby
def ast
  predicates = predicates_with_wrapped_sql_literals
  predicates.one? ? predicates.first : Arel::Nodes::And.new(predicates)
end
```

Raw SQL strings get wrapped in an `Arel::Nodes::SqlLiteral` fragment. Multiple predicates are joined under a single `And` node. A single predicate is returned as-is. This AST node becomes the argument to `arel.where(...)`.

---

### 5. `_query_by_sql` → `select_all` (`querying.rb:69`, `database_statements.rb:69`)

```ruby
def _query_by_sql(connection, sql, binds = [], ...)
  connection.select_all(sanitize_sql(sql), "#{name} Load", binds, ...)
end
```

`sanitize_sql` resolves any remaining string interpolation or array-condition syntax (`["name = ?", "Alice"]`) before going further.

`select_all` (`database_statements.rb:69`):

```ruby
def select_all(arel, name = nil, binds = [], preparable: nil, async: false, allow_retry: false)
  arel = arel_from_relation(arel)
  sql, binds, preparable, allow_retry = to_sql_and_binds(arel, binds, preparable, allow_retry)
  select(sql, name, binds, prepare: prepared_statements && preparable, ...)
end
```

---

### 6. `to_sql_and_binds` — Arel → SQL string (`database_statements.rb:17`)

This is where the Arel AST gets serialised to a SQL string:

```ruby
def to_sql_and_binds(arel_or_sql_string, binds = [], ...)
  if arel_or_sql_string.respond_to?(:ast)
    arel_or_sql_string = arel_or_sql_string.ast   # SelectManager → root node
  end

  if Arel.arel_node?(arel_or_sql_string)
    collector = collector()
    if prepared_statements
      collector.preparable = true
      sql, binds = visitor.compile(arel_or_sql_string, collector)
      # binds = extracted BindParam values
    else
      sql = visitor.compile(arel_or_sql_string, collector)
      # values are inlined into the SQL string
    end
    [sql.freeze, binds, preparable, allow_retry]
  end
end
```

`visitor` is a database-specific Arel visitor (e.g. `Arel::Visitors::PostgreSQL`). It does a recursive depth-first walk of the AST, emitting SQL fragments into a `Collector` string buffer. Each node type has a corresponding `visit_*` method — `visit_Arel_Nodes_And`, `visit_Arel_Nodes_Equality`, etc. — that writes the appropriate SQL syntax. When `prepared_statements` is on, `BindParam` nodes are emitted as `$1`/`?` placeholders and their values are collected separately.

---

### 7. `select` → `internal_exec_query` — actual database round-trip (`database_statements.rb:626`)

```ruby
def select(sql, name = nil, binds = [], prepare: false, async: false, ...)
  result = internal_exec_query(sql, name, binds, prepare: prepare, allow_retry: allow_retry)
  result
end
```

`internal_exec_query` is adapter-specific. For PostgreSQL (`postgresql/database_statements.rb:65`):

```ruby
def internal_exec_query(sql, name = "SQL", binds = [], prepare: false, ...)
  execute_and_clear(sql, name, binds, prepare: prepare, ...) do |result|
    types = {}
    fields = result.fields
    fields.each_with_index do |fname, i|
      ftype = result.ftype(i)
      fmod  = result.fmod(i)
      types[fname] = types[i] = get_oid_type(ftype, fmod, fname)
    end
    build_result(columns: fields, rows: result.values, column_types: types.freeze)
  end
end
```

`execute_and_clear` sends the SQL (and bound values, if prepared) to the `pg` gem, gets back a `PG::Result`. The block then:
- reads the **column names** from `result.fields`
- maps each column's PostgreSQL **OID** (`ftype`) and modifier (`fmod`) through the OID type map to get a cast object
- packages everything into an `ActiveRecord::Result` — a thin struct holding `columns` (Array of names), `rows` (Array of value arrays), and `column_types` (Hash of name → type object)

This `Result` object is what comes back as `rows` up in `exec_queries`.

---

### 8. `instantiate_records` → `_load_from_sql` (`relation.rb:1437`, `querying.rb:73`)

```ruby
def instantiate_records(rows, &block)
  return [].freeze if rows.empty?
  klass._load_from_sql(rows, &block).freeze
end
```

```ruby
def _load_from_sql(result_set, &block)
  column_types = result_set.column_types
  # Strip out types already known to the model's own schema
  column_types = column_types.reject { |k, _| attribute_types.key?(k) }

  message_bus.instrument("instantiation.active_record", payload) do
    if result_set.includes_column?(inheritance_column)
      result_set.map { |record| instantiate(record, column_types, &block) }
    else
      result_set.map { |record| instantiate_instance_of(self, record, column_types, &block) }
    end
  end
end
```

`result_set` iterates as a sequence of hashes: `{ "id" => 1, "name" => "Alice", … }`. The `column_types` passed down are the extra OID-derived types for columns not already covered by the model's declared attribute schema. The `"instantiation.active_record"` instrumentation notification fires here (with `record_count` and `class_name` in the payload).

**STI branching:** if the result set contains the inheritance column (`type`), each row may be a different subclass, so `instantiate` is called per-row, which calls `discriminate_class_for_record` to find the right class before delegating to `instantiate_instance_of`. Without STI the whole set is homogeneous and `instantiate_instance_of` is called directly with `self` as the klass.

---

### 9. `instantiate_instance_of` — building the model object (`persistence.rb:313`)

```ruby
def instantiate_instance_of(klass, attributes, column_types = {}, &block)
  attributes = klass.attributes_builder.build_from_database(attributes, column_types)
  klass.allocate.init_with_attributes(attributes, &block)
end
```

Two steps:

**Step A — `build_from_database` (`attribute_set/builder.rb:15`)**

```ruby
def build_from_database(values = {}, additional_types = {})
  LazyAttributeSet.new(values, types, additional_types, default_attributes)
end
```

This does **not** cast any values yet. It creates a `LazyAttributeSet` that holds the raw database strings alongside the type registry. Each attribute is only cast to its Ruby type the first time it is read (via `ActiveModel::Attribute#value`, which calls `type.deserialize(raw_value)`). This is the lazy deserialisation that keeps instantiation cheap even for wide tables.

**Step B — `allocate` + `init_with_attributes` (`core.rb:500`)**

```ruby
def init_with_attributes(attributes, new_record = false)
  @new_record = new_record    # false — persisted record
  @attributes = attributes    # the LazyAttributeSet from above

  init_internals              # zeros @destroyed, @previously_new_record,
                              # clears association/aggregation caches, etc.

  yield self if block_given?

  _run_find_callbacks
  _run_initialize_callbacks
  self
end
```

`allocate` bypasses `initialize` entirely — no callbacks fire during allocation. `init_with_attributes` sets the two essential instance variables (`@new_record`, `@attributes`), calls `init_internals` to reset bookkeeping state, runs any block passed in (the optional block from `.all { |r| ... }` calls), and then fires the `after_find` and `after_initialize` callbacks. The object is fully usable at this point.

---

## Summary of the call chain

```
Relation#to_ary / #load
  └─ exec_queries
       ├─ exec_main_query
       │    └─ arel          ← build_arel (Arel::SelectManager assembled
       │         │              from where_clause.ast, order, limit, …)
       │         └─ _query_by_sql → connection.select_all
       │              └─ to_sql_and_binds
       │                   └─ visitor.compile(ast, collector)
       │                        → SQL string + bind params
       │              └─ select → internal_exec_query
       │                   └─ [pg/mysql2/sqlite3 gem round-trip]
       │                        → ActiveRecord::Result
       │                             (columns[], rows[][], column_types{})
       └─ instantiate_records
            └─ _load_from_sql                 ← "instantiation.active_record" notif
                 └─ instantiate_instance_of (×N, one per row)
                      ├─ attributes_builder.build_from_database
                      │    → LazyAttributeSet  (values not cast yet)
                      └─ klass.allocate.init_with_attributes
                           → @new_record=false, @attributes=…
                           → init_internals (caches zeroed)
                           → _run_find_callbacks
                           → _run_initialize_callbacks
```

### Key design points to hold onto

- **The `WhereClause` is just an array of Arel nodes.** Every call to `.where(...)` appends to it; nothing is compiled until `arel` is first accessed.
- **`build_arel` is the single assembly point.** It is memoised — the Arel tree is built once, SQL is then derived from it.
- **The Arel visitor does the actual text generation.** One visitor per adapter subclass handles dialect differences (quoting, `LIMIT` syntax, `RETURNING`, etc.).
- **`internal_exec_query` is the adapter seam.** Everything above it is adapter-agnostic; below it you are talking to the gem (`pg`, `mysql2`, `sqlite3`).
- **`ActiveRecord::Result` is just data.** Columns + rows + types — no model awareness at all.
- **Instantiation is lazy.** `LazyAttributeSet` defers type casting until an attribute is read; `allocate` + `init_with_attributes` bypasses `initialize`, keeping object construction fast.

