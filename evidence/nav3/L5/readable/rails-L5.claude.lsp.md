# transcript: I'm planning a change to what happens around persisting a record, so I need to understand the full journey of a save through the system. Starting from the po...


💬 I'll trace this through the LSP — let me load the tool and start finding the key entry points.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(save)
  ▸ LSP(save)

💬 The LSP index isn't warm yet — let me fall back to reading the source files directly, starting with persistence.rb.
  ▸ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -name "persistence.rb" -o -name "validations.rb" -o -name "callbacks.rb" -o -name "transactions.r...)
  ▸ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -name "*.rb" | xargs grep -l "def save\b" 2>/dev/null | sort)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/validations.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/callbacks.rb)

💬 Good. Now let me read the persistence and transactions modules, plus the associations autosave code.
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/transactions.rb)
  ▸ Bash(grep -n "def save\|def create_or_update\|def _create_record\|def _update_record\|def with_transaction_returning_status\|def before_committed\|def committed\|...)
  ▸ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -name "autosave_association.rb" | head -3)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/transactions.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
  ▸ Bash(grep -n "def save\|def create_or_update\|def autosave\|before_save\|after_save\|def save_collection\|def save_has_one\|def save_belongs_to\|def validate_sing...)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/autosave_association.rb)
  ▸ Bash(grep -n "def attributes_for_update\|def attributes_for_create\|def attributes_with_values\|def changed_for_autosave\|def changed_attribute_names_to_save" /ho...)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/autosave_association.rb)
  ▸ Bash(grep -n "def attributes_for_update\|def attributes_for_create\|def attributes_with_values" /home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/autosave_association.rb)
  ▸ Bash(grep -n "def attributes_for_update\|def attributes_for_create\|def attributes_with_values" /home/bench/repos/rails/activerecord/lib/active_record/attribute_m...)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/attribute_methods.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/attribute_methods/dirty.rb)
  ▸ Bash(grep -n "def _update_record\|changed_attribute_names_to_save\|attribute_names_for_partial" /home/bench/repos/rails/activerecord/lib/active_record/attribute_m...)
  ▸ Bash(grep -n "def _update_record\|partial_writes\|partial_update" /home/bench/repos/rails/activerecord/lib/active_record/locking/optimistic.rb /home/bench/repos/r...)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/attribute_methods/dirty.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/timestamp.rb)

💬 Now let me check how the connection-level transaction coordinates the after_commit/after_rollback callbacks.
  ▸ Bash(grep -n "def add_transaction_record\|def commit_transaction\|def rollback_transaction\|def before_commit_records\|def commit_records\|def rollback_records" /...)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/transaction.rb)
  ▸ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/transaction.rb)

💬 I have all the pieces. Here's the complete flow:  ---  ## The Full Save Journey  The call stack is a series of layered `super` chains. Each module adds its w...

──────── RESULT (success, 189233ms, 31 turns) ────────
I have all the pieces. Here's the complete flow:

---

## The Full Save Journey

The call stack is a series of layered `super` chains. Each module adds its wrapper around the one below it, so reading "outward to inward" traces the execution order.

---

### 1. Validation gate — `ActiveRecord::Validations#save` (`validations.rb:47`)

This is the outermost override. Before anything else runs:

```ruby
def save(**options)
  perform_validations(options) ? super : false
end
```

`perform_validations` (`validations.rb:90`) short-circuits to `true` if `validate: false` was passed, otherwise calls `valid?(options[:context])`. `valid?` (`validations.rb:69`) picks the context — `:create` if `new_record?`, `:update` otherwise — then delegates to `ActiveModel::Validations#valid?`, which runs the full callback chain: `before_validation` → validators → `after_validation`.

**Autosave validation hooks** are also wired in here. When `autosave: true` or `validate: true` is declared on an association, `define_autosave_validation_callbacks` (`autosave_association.rb:219`) registers a `validate` callback that calls `validate_single_association` or `validate_collection_association`. Those call `association_valid?` (`autosave_association.rb:337`) on each loaded child record, collecting child errors into the parent. Child errors bubble up as `Associations::NestedError` objects.

If validation fails, `save` returns `false` immediately. Nothing below this layer runs.

---

### 2. Transaction wrapping — `ActiveRecord::Transactions#save` (`transactions.rb:361`)

`super` from Validations lands here:

```ruby
def save(**)
  with_transaction_returning_status { super }
end
```

`with_transaction_returning_status` (`transactions.rb:409`) does four things:

1. Calls `connection.transaction { ... }` — opens a new transaction or joins the existing one as a SAVEPOINT.
2. Calls `add_to_transaction` (`transactions.rb:513`) — registers self with the connection-level transaction object so the record will receive `committed!`/`rolledback!` signals later.
3. Calls `remember_transaction_record_state` (`transactions.rb:441`) — snapshots `@new_record`, `@destroyed`, `@attributes`, and the PK so that a rollback can fully restore in-memory state.
4. Yields, captures the return value as `status`; if `status` is falsy, raises `ActiveRecord::Rollback` to trigger a DB ROLLBACK.

**Nested transaction behaviour**: if a transaction is already open, `connection.transaction` creates a SAVEPOINT rather than a real transaction. The `@run_commit_callbacks` flag on the inner transaction is false, so `commit_records` doesn't fire `after_commit` — it just bubbles the enrolled records up to the parent transaction's record list. `after_commit` fires only when the outermost transaction commits.

---

### 3. Callbacks shell — `ActiveRecord::Callbacks#create_or_update` (`callbacks.rb:440`)

After the transaction is open, `Persistence#save` → `create_or_update` → hits the callbacks override first:

```ruby
def create_or_update(**)
  _run_save_callbacks { super }
end
```

This executes `before_save` → `around_save` (outer half) → *the actual write* → `around_save` (inner half) → `after_save`. Throwing `:abort` in any `before_save` cancels the chain and causes `create_or_update` to return `false`, which propagates up to `with_transaction_returning_status` as a ROLLBACK.

**Autosave `belongs_to` runs here**: `add_autosave_association_callbacks` (`autosave_association.rb:212`) registers `save_belongs_to_association` as a `before_save`. So parent records (the side holding the FK) are saved and their FK is back-written onto self before the primary record is ever written. This ensures the FK value is in place when the INSERT/UPDATE runs.

`around_save_collection_association` is also registered here for collections — it's an `around_save` that records `@new_record_before_save` so later `after_create`/`after_update` callbacks can know whether the parent was new.

---

### 4. New vs. persisted fork — `Persistence#create_or_update` (`persistence.rb:893`)

```ruby
def create_or_update(**, &block)
  _raise_readonly_record_error if readonly?
  return false if destroyed?
  result = new_record? ? _create_record(&block) : _update_record(&block)
  result != false
end
```

`new_record?` is the branch point. Both paths then go through multiple overrides before reaching the SQL.

---

### 5a. Attribute selection for UPDATE

The call to `_update_record` passes through two overrides before the SQL:

**Dirty tracking** (`attribute_methods/dirty.rb:233`) sets the default argument:

```ruby
def _update_record(attribute_names = attribute_names_for_partial_updates)
  affected_rows = super
  changes_applied   # resets dirty state to reflect what's now in DB
  affected_rows
end

def attribute_names_for_partial_updates
  partial_updates? ? changed_attribute_names_to_save : attribute_names
end
```

`changed_attribute_names_to_save` consults `mutations_from_database` — the in-memory diff against the last-known database state — so only actually-changed attributes go into the UPDATE. If `partial_updates?` is off (unusual), all column names are sent.

**Timestamps** (`timestamp.rb:119`) also override `_update_record`:

```ruby
def _update_record
  record_update_timestamps
  super
end
```

`record_update_timestamps` writes `updated_at`/`updated_on` directly via `_write_attribute` before the attribute list is finalized, so they appear in `changed_attribute_names_to_save`. The `touch: false` option is passed down through `create_or_update` (`timestamp.rb:125`) via `@_touch_record`.

**`attributes_for_update`** (`attribute_methods.rb:503`) then strips out readonly attributes, counter cache columns, and virtual columns from the final list.

`_update_row` (`persistence.rb:886`) assembles `attributes_with_values(attribute_names)` — a hash of attribute-name → `ActiveModel::Attribute` objects — and passes it to the class-level `_update_record` along with `_query_constraints_hash` (the WHERE clause: usually `{id: self.id}`).

---

### 5b. Attribute selection for INSERT

The `_create_record` path is parallel:

**Dirty tracking** (`dirty.rb:239`) again: if `partial_inserts?`, only changed attributes are sent. Otherwise all non-virtual columns are included, but auto-populated PK columns (sequences, UUIDs generated by the DB) with a nil value are excluded.

**Timestamps** (`timestamp.rb:107`) write `created_at`/`created_on` and `updated_at`/`updated_on` via `_write_attribute` before the SQL, so they land in the column set.

**`attributes_for_create`** (`attribute_methods.rb:514`) then strips virtual columns and nil-value PK columns.

After the INSERT, the adapter returns the DB-generated values for `returning_columns` (e.g. the sequence-assigned `id`, any `DEFAULT`-populated columns). These are written back with `_write_attribute`, and `@new_record = false`, `@previously_new_record = true` are set.

---

### 6. Association cascade — `AutosaveAssociation` hooks (`autosave_association.rb:196–214`)

`has_one` and `has_many` autosave callbacks are registered as `after_create` and `after_update` (not `after_save`) — this is deliberate so their ordering relative to a model's own `after_create`/`after_update` is controllable.

**`save_collection_association`** (`autosave_association.rb:375`): iterates the in-memory `association.target`. Records `marked_for_destruction?` are destroyed. New records are inserted (via `association.insert_record`). Changed records with `autosave: true` are saved with `validate: false` (validation already happened at the top). This recurses — each associated record's own `save` goes through the same full stack.

**`save_has_one_association`** (`autosave_association.rb:429`): checks if the target is new, or if the FK changed, or if `autosave: true` and `changed_for_autosave?`. If so, writes the FK onto the child and calls `record.save(validate: !autosave)`.

All of this runs inside the same open transaction. Any failure (a child save returning false, a `raise ActiveRecord::Rollback`) propagates up and rolls the whole thing back.

---

### 7. Transaction outcome — `transaction.rb:583–609` and `transactions.rb:373–401`

When the outermost `commit_transaction` is called:

1. **`before_commit_records`** (`transaction.rb:274`) iterates enrolled records and calls `record.before_committed!`, which fires `_run_before_commit_callbacks` — the `before_commit` callbacks run while the transaction is still open but all writes have succeeded.
2. **`COMMIT`** is issued to the DB.
3. **`commit_records`** (`transaction.rb:298`) calls `record.committed!` on each enrolled record. `committed!` (`transactions.rb:381`) runs `_run_commit_callbacks` — the `after_commit` callbacks. `trigger_transactional_callbacks?` gates which records actually fire: a record that was created fires if `@_new_record_before_last_commit && persisted?`; an update fires if `_trigger_update_callback && persisted?`. The `@_trigger_update_callback` flag was set inside `_update_record` (`persistence.rb:907`) based on `affected_rows == 1`.

On rollback: **`rollback_records`** (`transaction.rb:254`) calls `record.rolledback!`, which runs `_run_rollback_callbacks` and then `restore_transaction_record_state` — reverting `@new_record`, `@destroyed`, `@attributes`, and the PK back to the snapshot taken in step 2.

---

### Module layering summary

```
Validations#save
  └─ Transactions#save                         ← opens/joins DB transaction
       └─ Persistence#save → create_or_update
            └─ Callbacks#create_or_update      ← _run_save_callbacks (before_save, around_save)
                 └─ Persistence#create_or_update   ← new_record? fork
                      └─ Callbacks#_update_record  ← _run_update_callbacks
                           └─ Timestamp#_update_record  ← writes updated_at
                                └─ Dirty#_update_record ← partial attr selection
                                     └─ Persistence#_update_record  ← SQL UPDATE
                      after_create/after_update callbacks:
                           └─ AutosaveAssociation  ← recurses into child saves
  committed!/rolledback! fired by connection after COMMIT/ROLLBACK
```

---

### Key points for your change

- **Before the write**: `before_save` runs inside the transaction but before `new_record?` is consulted — so if you change `@new_record` there, you redirect to create vs. update.
- **Attribute list**: by the time `persistence.rb:_update_record` executes, the list is already narrowed by dirty tracking. If you want to force an attribute into the UPDATE, `_write_attribute` it before the callback chain or add it to `changed_attribute_names_to_save` by marking it changed.
- **Transaction scope**: `after_save` still runs inside the open transaction; `after_commit` runs after COMMIT. A DB constraint violation between `after_save` and `COMMIT` will still roll back the row but `after_save` has already run.
- **Cascade timing**: `belongs_to` autosave fires as `before_save`; `has_one`/`has_many` fire as `after_create`/`after_update`. The parent's row is already written when child callbacks run.
