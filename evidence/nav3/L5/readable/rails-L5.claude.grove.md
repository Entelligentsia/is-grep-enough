# transcript: I'm planning a change to what happens around persisting a record, so I need to understand the full journey of a save through the system. Starting from the po...


💬 I'll map out the full save flow using grove's structural tools across the relevant modules.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map,mcp__grove__callers,mcp__grove__definition)

💬 Let me fan out across all five modules simultaneously.
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/persistence.rb"})
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/validations.rb"})
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/callbacks.rb"})
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/transactions.rb"})
  ▸ mcp__grove__outline({"file":"activerecord/lib/active_record/associations.rb","detail":0})

💬 Now I'll read all the load-bearing method bodies in parallel.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/validations.rb#save@47"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/validations.rb#save!@53"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/validations.rb#perform_validations@90"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/transactions.rb#save@361"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/transactions.rb#with_transaction_returning_status@409"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/callbacks.rb#create_or_update@440"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/callbacks.rb#_create_record@444"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/callbacks.rb#_update_record@448"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/persistence.rb#create_or_update@893"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/persistence.rb#_create_record@922"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/persistence.rb#_update_record@902"})

💬 Good. Now I need the attribute-selection methods, the class-level SQL builders, the transaction enrollment/outcome methods, and association autosave.
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record","name":"attributes_for_create"})
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record","name":"attributes_for_update"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/persistence.rb#_insert_record@238"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/persistence.rb#_update_record@265"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/transactions.rb#add_to_transaction@513"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/transactions.rb#committed!@381"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/transactions.rb#rolledback!@393"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/transactions.rb#remember_transaction_record_state@441"})

💬 Now I'll read the attribute filter methods and the autosave association mechanism.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/attribute_methods.rb#attributes_for_update@503"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/attribute_methods.rb#attributes_for_create@514"})
  ▸ mcp__grove__symbols({"dir":"activerecord/lib/active_record/autosave_association.rb","kind":"method"})

💬 Now let me read the autosave wiring and the key save methods for each association type.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/autosave_association.rb#add_autosave_association_callbacks@189"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/autosave_association.rb#save_belongs_to_association@492"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/autosave_association.rb#save_has_one_association@429"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/autosave_association.rb#save_collection_association@375"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/transactions.rb#restore_transaction_record_state@468"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/persistence.rb#_update_row@886"})

💬 Let me check the `Persistence#save` base method to complete the method resolution chain.
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/persistence.rb#save@392"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/validations.rb#valid?@69"})
  ▸ mcp__grove__source({"id":"ruby:activerecord/lib/active_record/autosave_association.rb#around_save_collection_association@358"})

💬 I now have the full picture. Here is the complete flow, stage by stage.  ---  ## The full save journey  ### Module layering: how `super` chains  Every AR mod...

──────── RESULT (success, 155745ms, 38 turns) ────────
I now have the full picture. Here is the complete flow, stage by stage.

---

## The full save journey

### Module layering: how `super` chains

Every AR model has these modules in its ancestry, outermost first:

```
Validations#save
  → Transactions#save
      → Persistence#save          (calls create_or_update)
          → Callbacks#create_or_update
              → Persistence#create_or_update
                  → Callbacks#_create_record  OR  Callbacks#_update_record
                      → Persistence#_create_record / _update_record
```

Each level wraps the next via `super`. Reading the code linearly you see each one delegate downward.

---

### Stage 1 — Validation gate (`validations.rb:47`)

```ruby
def save(**options)
  perform_validations(options) ? super : false
end
```

`perform_validations` (`validations.rb:90`) short-circuits if `validate: false` was passed; otherwise it calls `valid?` (`validations.rb:69`), which sets the context (`:create` or `:update` based on `new_record?`), delegates into `ActiveModel::Validations` to run all registered validators, and returns `errors.empty?`.

Autosave associations that declared `validates_associated` also hook in here — `define_autosave_validation_callbacks` registers a `validate` callback that calls `validate_single_association` / `validate_collection_association`, walking each loaded association and merging its errors upward if invalid.

If validation fails: `save` returns `false` immediately (or `save!` raises `RecordInvalid`). Nothing below executes.

---

### Stage 2 — Transaction envelope (`transactions.rb:361`, `409`)

```ruby
def save(**) = with_transaction_returning_status { super }
```

`with_transaction_returning_status`:
1. Acquires a connection and checks whether a transaction is **already open** (`ensure_finalize = !connection.transaction_open?`).
2. Opens `connection.transaction { ... }` — if one is already open this becomes a savepoint, not a new outer transaction.
3. Calls `add_to_transaction` → `connection.add_transaction_record(self, ensure_finalize)`. This registers the record with the transaction manager so it receives `committed!` or `rolledback!` when the outermost transaction settles.
4. Calls `remember_transaction_record_state` — snapshots `@new_record`, `@previously_new_record`, `@destroyed`, `@attributes`, and the current `id` into `@_start_transaction_state`. This is the rollback restore point.
5. Yields (executes all remaining stages inside the DB transaction).
6. If the result is falsy, raises `ActiveRecord::Rollback` to abort — so a `save` returning `false` rolls back the transaction automatically.

---

### Stage 3 — Save callbacks (`callbacks.rb:440`)

```ruby
def create_or_update(**) = _run_save_callbacks { super }
```

`_run_save_callbacks` fires `before_save` hooks, yields to the next stage, then fires `after_save` hooks on the way back out. The `belongs_to` autosave callback is registered as a `before_save`, so it runs here (more on that below).

---

### Stage 4 — New-vs-existing dispatch (`persistence.rb:893`)

```ruby
def create_or_update(**, &block)
  _raise_readonly_record_error if readonly?
  return false if destroyed?
  result = new_record? ? _create_record(&block) : _update_record(&block)
  result != false
end
```

Two guard rails (readonly, destroyed), then a simple branch on `@new_record`.

---

### Stage 5a — INSERT path

**`Callbacks#_create_record` (`callbacks.rb:444`)**:

```ruby
def _create_record = _run_create_callbacks { super }
```

Fires `before_create`, then yields.

**`Persistence#_create_record` (`persistence.rb:922`)**:

1. **Attribute filtering** via `attributes_for_create` (`attribute_methods.rb:514`):
   - Intersects the candidate list with `column_names` (no virtual columns written).
   - Drops the primary key if `id` is currently `nil` (lets the DB auto-generate it). If `prefetch_primary_key?` is true (Postgres sequences), the PK is pre-fetched via `next_sequence_value` and included instead.

2. **SQL** via `self.class._insert_record(connection, values, returning_columns)` (`persistence.rb:238`):
   - Builds an `Arel::InsertManager` with the filtered, cast values.
   - Calls `connection.insert(im, ...)`, which materialises the SQL and sends it to the DB.
   - Returns any `RETURNING` columns (DB-generated id, `created_at`, etc.).

3. **Write-back** — iterates `returning_columns.zip(returning_values)` and calls `_write_attribute` for any column that wasn't already set (e.g., the auto-generated id lands back on the model).

4. Sets `@new_record = false` and `@previously_new_record = true`.

On the way back out through `_run_create_callbacks`: `after_create` fires.

---

### Stage 5b — UPDATE path

**`Callbacks#_update_record` (`callbacks.rb:448`)**:

```ruby
def _update_record = _run_update_callbacks { record_update_timestamps { super } }
```

`record_update_timestamps` marks `updated_at`/`updated_on` as dirty in the attribute set before the attribute list is locked in.

**`Persistence#_update_record` (`persistence.rb:902`)**:

1. **Attribute filtering** via `attributes_for_update` (`attribute_methods.rb:503`):
   - Intersects with `column_names`.
   - Removes readonly attributes, counter cache columns, and virtual columns.

2. If the filtered list is **empty** (nothing changed): `affected_rows = 0`, but `@_trigger_update_callback = true` so `after_update` still fires on the way out.

3. Otherwise: `_update_row(attribute_names)` → `self.class._update_record(values, _query_constraints_hash)` (`persistence.rb:265`):
   - `_query_constraints_hash` produces the WHERE identity — either `{ primary_key => id }` or the composite columns declared with `query_constraints`.
   - `_update_record` builds predicate constraints, optionally appends the global current scope's WHERE clause, then builds an `Arel::UpdateManager` and calls `connection.update(um, ...)`.
   - Returns affected-row count.

4. `@_trigger_update_callback = (affected_rows == 1)` — if a concurrent delete means 0 rows matched, the update callback is suppressed.

`after_update` fires on the way back through `_run_update_callbacks`.

---

### Stage 6 — Association cascading (`autosave_association.rb`)

Autosave callbacks are registered per-association by `add_autosave_association_callbacks` (`autosave_association.rb:189`). The timing is different for each association direction:

**`belongs_to` → `before_save`**

`save_belongs_to_association` runs before the owner record is written to the DB. If the parent is new or dirty (and `autosave: true`), it saves the parent first. After saving, it copies the parent's PK into the owner's foreign-key column — that value then gets included in the owner's INSERT/UPDATE issued in Stage 5.

**`has_one` → `after_create` + `after_update`**

`save_has_one_association` runs after the owner is persisted (and therefore has an id). It sets the child's FK to the owner's PK and calls `record.save`. If `autosave: true` and the child's save returns false, it raises `ActiveRecord::Rollback` to abort the enclosing transaction.

**`has_many` / `habtm` → `around_save` + `after_create` + `after_update`**

`around_save_collection_association` wraps the entire save to capture `@new_record_before_save` (so that records added inside `after_create` callbacks don't mistakenly get treated as pre-existing). After the owner is persisted, `save_collection_association`:
- Resets the association scope now that the owner has an id.
- Destroys records marked for destruction (if `autosave: true`).
- For each surviving record: calls `association.insert_record` (new records) or `record.save(validate: false)` (dirty records when `autosave: true`).
- Raises `RecordInvalid` on failure, which propagates into the DB transaction and triggers a rollback.

All of this happens inside the `connection.transaction` block opened in Stage 2, so any failure anywhere in the association cascade rolls back every write.

---

### Stage 7 — Transaction outcome

When the outermost `connection.transaction` block exits, the connection's transaction manager notifies every registered record:

**On commit → `committed!` (`transactions.rb:381`)**:
```ruby
def committed!(should_run_callbacks: true)
  @_start_transaction_state = nil       # discard the snapshot
  _run_commit_callbacks                 # fires after_commit / after_save_commit etc.
ensure
  @_committed_already_called = @_trigger_update_callback = @_trigger_destroy_callback = false
end
```
`after_commit` (and its shorthand aliases `after_create_commit`, `after_update_commit`) runs here, outside the DB transaction. The `@_trigger_update_callback` flag set in Stage 5b controls which variant fires.

**On rollback → `rolledback!` (`transactions.rb:393`)**:
```ruby
def rolledback!(force_restore_state: false, should_run_callbacks: true)
  _run_rollback_callbacks
ensure
  restore_transaction_record_state(force_restore_state)
  clear_transaction_record_state
end
```
`restore_transaction_record_state` (`transactions.rb:468`) replays the snapshot captured at Stage 2 — it reverts `@new_record`, `@destroyed`, `@attributes` (including the id), and clears `@mutations_from_database` and `@mutations_before_last_save`. The in-memory object goes back to looking exactly as it did before `save` was called.

---

### How the stages connect — the dependency chain

```
caller calls save
  │
  ├─ [Validations] run validators (including autosave validates_associated)
  │    ↓ if valid
  ├─ [Transactions] open/join a DB transaction; register record; snapshot state
  │    ↓
  ├─ [Callbacks] fire before_save
  │    │  ← belongs_to autosave fires here (saves parent, writes FK into owner)
  │    ↓
  ├─ [Persistence] choose INSERT vs UPDATE
  │    ↓
  ├─ [Callbacks] fire before_create / before_update
  │    ↓
  ├─ [Persistence] filter attributes → build Arel → connection.insert / .update
  │    ↓
  ├─ [Callbacks] fire after_create / after_update
  │    │  ← has_one / has_many autosave fires here (saves children with FK set to owner PK)
  │    ↓
  ├─ [Callbacks] fire after_save
  │    ↓
  └─ [Transactions] transaction commits or rolls back
       ├─ commit → committed! → after_commit callbacks
       └─ rollback → rolledback! → after_rollback + in-memory state restored
```

The key coupling points for your planned change:
- `create_or_update` in `Persistence` is where readonly/destroyed guards live and where new-vs-existing is decided.
- `attributes_for_create` / `attributes_for_update` in `AttributeMethods` are where column filtering happens — the narrowest place to control what gets written.
- `with_transaction_returning_status` is the only place that registers the record with the transaction and takes the state snapshot — touching it affects rollback recovery for the whole hierarchy.
- Association saves are pure callbacks, completely separate from the owner's write, but they share the same open transaction.
