# transcript: I want to trace what happens to a query from the moment a relation is forced to load until the matching rows exist as model objects in memory. I'm interested...


💬 I'll trace this end-to-end by reading the key files in order. Let me explore the chain across several components in parallel.

  ▸ Agent(Trace ActiveRecord relation load to SQL to model objects)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -type f -name "*.rb" | grep -E "(relation|core|base|result|abstract_adapter)" | head -20)
      ↳ Bash(grep -n "def load" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -10)
      ↳ Bash(grep -n "def exec_queries\|def instantiate_records\|def to_sql" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "def where\|def build_arel\|def build_where" /home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb | head -20)
      ↳ Bash(grep -n "def instantiate" /home/bench/repos/rails/activerecord/lib/active_record/core.rb /home/bench/repos/rails/activerecord/lib/active_record/base.rb)
      ↳ Bash(grep -n "def instantiate" /home/bench/repos/rails/activerecord/lib/active_record/core.rb)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -name "*.rb" -exec grep -l "def instantiate" {} \;)
      ↳ Bash(grep -n "def instantiate" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "def exec_query\|def execute" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb | head -20)
      ↳ Bash(grep -n "def exec_query\|def execute" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/*.rb | head -20)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Bash(grep -n "def select_all\|def exec_query" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb | head -20)
      ↳ Bash(grep -n "def select_all" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb)
      ↳ Bash(wc -l /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb && grep -n "def " /home/bench/repos/rails/activerecord/l...)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters -name "*.rb" -exec grep -l "def select_all" {} \;)
      ↳ Bash(grep -n "def select_all\|def exec_query" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb | head -10)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/result.rb)
      ↳ Bash(grep -n "def _load_from_sql\|def _query_by_sql" /home/bench/repos/rails/activerecord/lib/active_record/persistence.rb /home/bench/repos/rails/activerecord/li...)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -name "*.rb" -exec grep -l "_load_from_sql\|_query_by_sql" {} \;)
      ↳ Bash(grep -n "def _load_from_sql\|def _query_by_sql" /home/bench/repos/rails/activerecord/lib/active_record/querying.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/querying.rb)
      ↳ Bash(grep -n "def instantiate\|def instantiate_instance_of" /home/bench/repos/rails/activerecord/lib/active_record/persistence.rb | head -10)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
      ↳ Bash(grep -n "def arel\|def arel_table" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -10)
      ↳ Bash(grep -n "def arel" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -10)
      ↳ Bash(grep -n "@arel\|def arel" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -20)
      ↳ Bash(grep -n "^\s*def arel" /home/bench/repos/rails/activerecord/lib/active_record/relation/*.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib -name "*record_fetch*" -o -name "*warning*" | head -10)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/record_fetch_warning.rb)
      ↳ Bash(grep -n "def init_with_attributes" /home/bench/repos/rails/activerecord/lib/active_record/*.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/core.rb)
      ↳ Bash(grep -n "def attributes_builder\|class AttributesBuilder" /home/bench/repos/rails/activerecord/lib/active_record/*.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/model_schema.rb)
      ↳ Bash(grep -n "def apply_join_dependency\|def preload_associations" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "def apply_join_dependency" /home/bench/repos/rails/activerecord/lib/active_record/relation/*.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/finder_methods.rb)
      ↳ Bash(grep -n "def select\(" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Bash(grep -n "def select" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Bash(grep -n "def internal_exec_query" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Bash(grep -n "def internal_exec_query" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/postgresql_adapter.rb)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters -name "*.rb" -exec grep -l "def internal_exec_query" {} \;)
      ↳ Bash(grep -n "def internal_exec_query" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/postgresql/database_statements.rb | head -3)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/postgresql/database_statements.rb)
      ↳ Bash(grep -n "def build_result" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/postgresql/database_statements.rb)
      ↳ Bash(grep -n "def build_result" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Bash(grep -rn "def build_result" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/ | head -5)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "_run_find_callbacks\|_run_initialize_callbacks" /home/bench/repos/rails/activerecord/lib/active_record/core.rb)
      ↳ ⟹ returned to parent


  ▸ Agent(Trace Arel AST to SQL compilation)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/arel -type f -name "*.rb" | head -30)
      ↳ Bash(ls -la /home/bench/repos/rails/activerecord/lib/arel/visitors/ | grep "\.rb")
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/visitors/to_sql.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/tree_manager.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/visitors/visitor.rb)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -name "*.rb" | grep -E "(relation|arel)" | head -20)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -name "*where*" -type f)
      ↳ Bash(grep -r "where_chain\|WhereChain" /home/bench/repos/rails/activerecord/lib/active_record --include="*.rb" | head -20)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/where_clause.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "def to_sql" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "def arel" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Bash(grep -n "\.arel\|def arel\|@arel\|arel =" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -20)
      ↳ Bash(grep -n "def arel\|attr.*arel" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/delegation.rb)
      ↳ Bash(grep -n "def arel\|attr.*arel" /home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Bash(grep -n "def build_arel" /home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Bash(grep -n "def where" /home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb | head -5)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/query_methods.rb)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/arel/nodes -name "*.rb" | grep -E "(and|equality|binary)" | head -10)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/nodes/equality.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/nodes/binary.rb)
      ↳ Bash(grep -r "class And\|class Or" /home/bench/repos/rails/activerecord/lib/arel/nodes --include="*.rb")
      ↳ Bash(grep -r "class And\|class Or" /home/bench/repos/rails/activerecord/lib/arel --include="*.rb")
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/nodes.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/nodes/nary.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/nodes/select_statement.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/nodes/select_core.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/select_manager.rb)
      ↳ Bash(grep -n "def where\|def take" /home/bench/repos/rails/activerecord/lib/arel/select_manager.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/select_manager.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/arel/select_manager.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/predicate_builder.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/relation/predicate_builder.rb)
      ↳ Bash(grep -n "conn.to_sql\|conn.visitor" /home/bench/repos/rails/activerecord/lib/active_record/relation.rb | head -5)
      ↳ Bash(grep -rn "def to_sql" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters --include="*.rb" | head -5)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ ⟹ returned to parent


💬 Here is the end-to-end flow, in order.  ---  ## 1. `Relation#load` — the trigger  `activerecord/lib/active_record/relation.rb:1165`  ```ruby def load(&block)...

──────── RESULT (success, 249743ms, 3 turns) ────────
Here is the end-to-end flow, in order.

---

## 1. `Relation#load` — the trigger

`activerecord/lib/active_record/relation.rb:1165`

```ruby
def load(&block)
  if !loaded? || scheduled?
    @records = exec_queries(&block)
    @loaded = true
  end
  self
end
```

Any call that forces evaluation — `.to_a`, `.each`, `.first` with no limit already cached — lands here. It delegates to `exec_queries` and stores the result in `@records`.

---

## 2. `Relation#exec_queries` — orchestrator

`relation.rb:1385`

```ruby
def exec_queries(&block)
  skip_query_cache_if_necessary do
    rows = exec_main_query          # → raw result set
    records = instantiate_records(rows, &block)  # → model objects
    preload_associations(records) unless skip_preloading_value
    records.each(&:readonly!) if readonly_value
    records
  end
end
```

Two concerns separated cleanly: get rows, then instantiate them. Preloading and readonly marking happen after both.

---

## 3. `Relation#exec_main_query` — decides how to fetch

`relation.rb:1405`

```ruby
def exec_main_query(async: false)
  return [] if @none
  skip_query_cache_if_necessary do
    if where_clause.contradiction?
      [].freeze
    elsif eager_loading?
      klass.with_connection do |c|
        apply_join_dependency do |relation, join_dependency|
          relation = join_dependency.apply_column_aliases(relation)
          c.select_all(relation.arel, "SQL", async: async)
        end
      end
    else
      klass.with_connection do |c|
        klass._query_by_sql(c, arel, async: async)
      end
    end
  end
end
```

The non-eager path (most common) calls `arel` to get the AST, then passes it to `_query_by_sql`.

---

## 4. Building the Arel AST — `QueryMethods#build_arel`

`query_methods.rb:1732`

```ruby
def build_arel(connection, aliases = nil)
  arel = Arel::SelectManager.new(table)
  build_joins(arel.join_sources, aliases)
  arel.where(where_clause.ast) unless where_clause.empty?
  arel.having(having_clause.ast) unless having_clause.empty?
  arel.take(...)  if limit_value
  arel.skip(...)  if offset_value
  arel.group(...)
  build_order(arel)
  build_select(arel)
  arel
end
```

This builds a tree of `Arel::Nodes` — not a SQL string yet. The critical call is `where_clause.ast`.

### Where clause → Arel nodes

When you called `.where(name: "Alice", active: true)`, `build_where_clause` (`query_methods.rb:1591`) ran `PredicateBuilder#build_from_hash` on the hash. For each key/value pair that's an equality, it returns an `Arel::Nodes::Equality` node (a `Binary` with a left column reference and a right `BindParam`). Multiple predicates are stored in the `WhereClause`.

`WhereClause#ast` (`where_clause.rb:70`) then combines them:

```ruby
def ast
  predicates = predicates_with_wrapped_sql_literals
  predicates.one? ? predicates.first : Arel::Nodes::And.new(predicates)
end
```

So two conditions become `And(Equality(name, $1), Equality(active, $2))`. That node is handed to `arel.where(...)`, which appends it to the `SelectCore`'s `@wheres` array.

---

## 5. Arel AST → SQL string — the visitor

`database_statements.rb:17` (`to_sql_and_binds`):

```ruby
if Arel.arel_node?(arel_or_sql_string)
  collector = collector()          # Arel::Collectors::Bind or SQLString
  sql, binds = visitor.compile(arel_or_sql_string, collector)
end
```

`visitor` is an instance of `Arel::Visitors::ToSql` (or an adapter subclass like `PostgreSQL`). `compile` (`to_sql.rb:17`) calls `accept(node, collector)`, which dispatches via a method-name table to the appropriate `visit_*` method.

Key visitor methods:

- **`visit_Arel_Nodes_SelectStatement`** (`to_sql.rb:120`) — emits CTE if present, then delegates to each `SelectCore`
- **`visit_Arel_Nodes_SelectCore`** (`to_sql.rb:149`) — emits `SELECT … FROM … WHERE … GROUP BY … HAVING …`, calling `collect_nodes_for(o.wheres, …, " WHERE ", " AND ")`
- **`visit_Arel_Nodes_And`** (`to_sql.rb:622`) — joins children with `" AND "`
- **`visit_Arel_Nodes_Equality`** (`to_sql.rb:643`) — visits the left (column name) and right (bind param), emitting `" = "` between them, or `" IS NULL"` when the right side is nil

Each visitor method appends SQL fragments to the collector and recurses into child nodes. The output is a flat SQL string plus an array of bind values separated from the SQL.

---

## 6. Handing the SQL to the connection — `select_all`

`querying.rb:69`:

```ruby
def _query_by_sql(connection, sql, binds = [], ...)
  connection.select_all(sanitize_sql(sql), "#{name} Load", binds, ...)
end
```

`DatabaseStatements#select_all` (`database_statements.rb:69`):

```ruby
def select_all(arel, name = nil, binds = [], preparable: nil, async: false, ...)
  arel   = arel_from_relation(arel)
  sql, binds, preparable, allow_retry = to_sql_and_binds(arel, binds, preparable, ...)
  select(sql, name, binds, prepare: prepared_statements && preparable, ...)
end
```

`select` (`database_statements.rb:626`) calls `internal_exec_query`, the adapter-specific method that actually talks to the database driver.

---

## 7. Adapter execution — `internal_exec_query`

For PostgreSQL (`postgresql/database_statements.rb:65`):

```ruby
def internal_exec_query(sql, name, binds, prepare:, ...)
  execute_and_clear(sql, name, binds, prepare: prepare, ...) do |result|
    types = {}
    fields = result.fields
    fields.each_with_index do |fname, i|
      types[fname] = types[i] = get_oid_type(result.ftype(i), result.fmod(i), fname)
    end
    build_result(columns: fields, rows: result.values, column_types: types.freeze)
  end
end
```

`execute_and_clear` sends the SQL (or executes a prepared statement) via the `pg` gem and hands the raw `PG::Result` into this block. The block maps each column to its OID type (so Rails knows how to deserialize integers, timestamps, JSON, etc.), then calls:

```ruby
def build_result(columns:, rows:, column_types: nil)
  ActiveRecord::Result.new(columns, rows, column_types)
end
```

---

## 8. `ActiveRecord::Result` — the raw result wrapper

`result.rb:49`:

```ruby
def initialize(columns, rows, column_types = nil)
  @columns      = columns.each(&:-@).freeze   # frozen column name strings
  @rows         = rows                         # array of value arrays
  @hash_rows    = nil                          # lazily built
  @column_types = column_types || EMPTY_HASH
end
```

Iterating a `Result` yields one hash per row: `{ "id" => 1, "name" => "Alice", … }`. Type casting happens lazily as each value is accessed.

---

## 9. Rows → model objects — `instantiate_records`

`relation.rb:1437`:

```ruby
def instantiate_records(rows, &block)
  return [].freeze if rows.empty?
  if eager_loading?
    @_join_dependency.instantiate(rows, strict_loading_value, &block).freeze
  else
    klass._load_from_sql(rows, &block).freeze
  end
end
```

For the normal path, `_load_from_sql` (`querying.rb:73`):

```ruby
def _load_from_sql(result_set, &block)
  column_types = result_set.column_types.reject { |k, _| attribute_types.key?(k) }

  ActiveSupport::Notifications.instrument("instantiation.active_record", ...) do
    if result_set.includes_column?(inheritance_column)
      result_set.map { |record| instantiate(record, column_types, &block) }
    else
      result_set.map { |record| instantiate_instance_of(self, record, column_types, &block) }
    end
  end
end
```

The STI check: if the result set has a `type` column, each row might be a different subclass and gets routed through `instantiate` → `discriminate_class_for_record`. If it's a homogeneous set, all rows go directly to `instantiate_instance_of`.

---

## 10. `instantiate_instance_of` — the final step

`persistence.rb:313`:

```ruby
def instantiate_instance_of(klass, attributes, column_types = {}, &block)
  attributes = klass.attributes_builder.build_from_database(attributes, column_types)
  klass.allocate.init_with_attributes(attributes, &block)
end
```

Two sub-steps:

**`attributes_builder.build_from_database`** — `ActiveModel::AttributeSet::Builder` takes the raw hash and column type map and builds an `AttributeSet`: a hash of `ActiveModel::Attribute` objects, each wrapping its raw value and knowing its declared type. Values are not yet cast; they are cast on first read.

**`klass.allocate`** — bypasses `initialize`, allocating a bare instance.

**`init_with_attributes`** (`core.rb:500`):

```ruby
def init_with_attributes(attributes, new_record = false)
  @new_record  = new_record        # false — this came from the DB
  @attributes  = attributes        # the AttributeSet

  init_internals                   # sets up @readonly, @destroyed, association cache, etc.

  yield self if block_given?       # optional caller hook

  _run_find_callbacks
  _run_initialize_callbacks

  self
end
```

`init_internals` wires up the per-instance state Rails needs (mutation tracking, association cache, readonly flag). The two callback runs fire any `after_find` and `after_initialize` hooks defined on the model.

At this point the object is a fully initialized, attribute-backed ActiveRecord instance. `exec_queries` collects all of them into an array, stores it in `@records`, marks `@loaded = true`, and returns.

---

## The chain in brief

```
Relation#load
  └─ exec_queries
       ├─ exec_main_query
       │    └─ build_arel          ← accumulates Arel nodes from where_clause, etc.
       │         └─ where_clause.ast  ← And(Equality, Equality, …)
       │    └─ _query_by_sql
       │         └─ connection.select_all
       │              └─ to_sql_and_binds   ← Visitor walks AST → SQL + binds
       │              └─ internal_exec_query ← sends SQL to DB driver
       │              └─ build_result        → ActiveRecord::Result
       └─ instantiate_records
            └─ _load_from_sql
                 └─ instantiate_instance_of  (per row)
                      ├─ attributes_builder.build_from_database → AttributeSet
                      └─ allocate.init_with_attributes
                           ├─ init_internals
                           └─ _run_find_callbacks / _run_initialize_callbacks
```
