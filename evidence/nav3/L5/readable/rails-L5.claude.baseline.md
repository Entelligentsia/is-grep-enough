# transcript: I'm planning a change to what happens around persisting a record, so I need to understand the full journey of a save through the system. Starting from the po...


  ▸ Agent(Trace full ActiveRecord save flow across modules)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record -type f -name "*.rb" | grep -E "(persistence|validations|callbacks|dirty|transactions|autosave|in...)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/validations.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/callbacks.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/attribute_methods/dirty.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/callbacks.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/transactions.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/transactions.rb)
      ↳ Bash(grep -n "with_transaction_returning_status" /home/bench/repos/rails/activerecord/lib/active_record/transactions.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/autosave_association.rb)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/autosave_association.rb)
      ↳ Bash(grep -n "_insert_record\|_update_record" /home/bench/repos/rails/activerecord/lib/active_record/persistence.rb | head -20)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters -name "*.rb" | grep -E "(abstract|database_statements)" | head -5)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters -path "*/abstract/*" -name "*.rb" | head -10)
      ↳ Bash(grep -n "def insert\|def update" /home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb | head -20)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb)
      ↳ Bash(grep -n "def create_or_update\|_run_save_callbacks\|_run_create_callbacks\|_run_update_callbacks" /home/bench/repos/rails/activerecord/lib/active_record/call...)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/callbacks.rb)
      ↳ Bash(grep -n "def attributes_for_update\|def attributes_for_create\|def attributes_with_values" /home/bench/repos/rails/activerecord/lib/active_record/persistence.rb)
      ↳ Bash(find /home/bench/repos/rails/activerecord/lib -name "*.rb" -type f -exec grep -l "def attributes_for_update" {} \;)
      ↳ Bash(grep -n "def attributes_for_update\|def attributes_for_create\|def attributes_with_values" /home/bench/repos/rails/activerecord/lib/active_record/attribute_m...)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/attribute_methods.rb)
      ↳ Bash(grep -n "class InsertAll" /home/bench/repos/rails/activerecord/lib/active_record/insert_all.rb | head -1)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/insert_all.rb)
      ↳ Bash(grep -n "define_model_callbacks" /home/bench/repos/rails/activerecord/lib/active_record/callbacks.rb)
      ↳ Bash(grep -n "def record_update_timestamps" /home/bench/repos/rails/activerecord/lib/active_record -r)
      ↳ Read(/home/bench/repos/rails/activerecord/lib/active_record/timestamp.rb)
      ↳ Bash(grep -n "def with_connection" /home/bench/repos/rails/activerecord/lib/active_record -r | head -5)
      ↳ Bash(grep -n "before_save\|after_save\|after_create\|after_update\|around_save" /home/bench/repos/rails/activerecord/lib/active_record/autosave_association.rb | h...)
      ↳ ⟹ returned to parent


💬 Here's the full journey of a `save` through ActiveRecord, with the key files and methods at each stage.  ---  ## 1. Validation gate  **`activerecord/lib/acti...

──────── RESULT (success, 166461ms, 2 turns) ────────
Here's the full journey of a `save` through ActiveRecord, with the key files and methods at each stage.

---

## 1. Validation gate

**`activerecord/lib/active_record/validations.rb`**

`Validations#save` (line 47) runs `perform_validations` before calling `super`. `perform_validations` (line 90) is just:
```ruby
options[:validate] == false || valid?(options[:context])
```
`valid?` (line 69) runs in the `:create` or `:update` context depending on `new_record?`, courtesy of `default_validation_context` (line 82). If validation fails, the write never happens and `save` returns `false` (`save!` raises `RecordInvalid`).

---

## 2. Transaction wrapper — entered before callbacks

**`activerecord/lib/active_record/transactions.rb`**

`Transactions#save` (line 361) — which sits above the callback layer in the module stack — wraps everything in `with_transaction_returning_status` (line 409):
- Opens (or joins) a database transaction via `connection.transaction`
- Calls `add_to_transaction` (line 513) to register `self` with the connection so `after_commit`/`after_rollback` will fire later
- Calls `remember_transaction_record_state` (line 441) to snapshot `@new_record`, `@destroyed`, `@attributes` for rollback recovery
- Yields to `super` (the callback layer)
- If the yield returns falsy, raises `ActiveRecord::Rollback` to abort

On commit → `committed!` (line 381) runs `_run_commit_callbacks`.
On rollback → `rolledback!` (line 393) runs `_run_rollback_callbacks` then calls `restore_transaction_record_state` (line 468) to wind the record back to its pre-save snapshot.

---

## 3. Callbacks wrapping the write

**`activerecord/lib/active_record/callbacks.rb`**

Three overrides are defined (lines 440–450) that wrap the persistence methods:

```ruby
def create_or_update(**)
  _run_save_callbacks { super }          # before_save / after_save
end

def _create_record
  _run_create_callbacks { super }        # before_create / after_create
end

def _update_record
  _run_update_callbacks { record_update_timestamps { super } }  # before_update / after_update
end
```

So the nesting is: `save_callbacks { create_callbacks { actual_write } }`. Timestamps are injected inside the update callback wrapper.

---

## 4. INSERT vs UPDATE decision + attribute filtering

**`activerecord/lib/active_record/persistence.rb`**

The base `create_or_update` (line 893) is the decision point:
```ruby
new_record? ? _create_record(&block) : _update_record(&block)
```
`@new_record` is the flag; it's set to `false` after a successful insert (line 940).

Before issuing SQL, the instance methods filter attributes:
- `_create_record` (line 922) calls `attributes_for_create` — strips virtual columns, strips primary key if auto-generated
- `_update_record` (line 902) calls `attributes_for_update` — additionally strips readonly columns and counter cache columns. If no attributes remain dirty, it skips SQL entirely and sets `@_trigger_update_callback = true` directly (line 907)

---

## 5. Arel SQL build and adapter write

**`activerecord/lib/active_record/persistence.rb` (ClassMethods)**

The instance methods delegate to class methods that own the Arel layer:

**`_insert_record`** (line 238) — builds an `Arel::InsertManager`, handles sequence prefetch for databases like PostgreSQL, then calls `connection.insert`.

**`_update_record`** (line 265) — builds an `Arel::UpdateManager` with `WHERE` constraints derived from `_query_constraints_hash` (the primary key, or composite key if configured) then calls `connection.update`.

**`activerecord/lib/active_record/connection_adapters/abstract/database_statements.rb`**

`insert` (line 195) → `to_sql_and_binds` → `exec_insert` (adapter-specific).
`update` (line 206) → `to_sql_and_binds` → `exec_update` (adapter-specific).

After `_create_record` gets back the new ID (or RETURNING values), it writes them onto the record with `_write_attribute` (line 935) and flips `@new_record = false`.

---

## 6. Association cascading (autosave)

**`activerecord/lib/active_record/autosave_association.rb`**

Autosave callbacks are registered during association definition by `add_autosave_association_callbacks` (line 189). The direction matters:

- **`belongs_to`** — registers a `before_save` callback so the parent is written first, then the child's FK is populated
- **`has_one` / `has_many`** — registers `after_create` and `after_update` callbacks so the child is written after the parent's PK exists

`save_collection_association` (line 375) loops over the association's loaded records: destroys any marked for destruction, then calls `association.insert_record(record)` (which recursively calls `record.save`) for the rest. All of this happens inside the already-open transaction.

`changed_for_autosave?` (line 273) is the guard — it checks `new_record?`, `has_changes_to_save?`, `marked_for_destruction?`, and recurses into nested associations before deciding whether to bother.

---

## How the stages connect — full call chain for a new record

```
Validations#save
  └─ perform_validations → valid? (context: :create)
  └─ super →
Transactions#save
  └─ with_transaction_returning_status
      ├─ connection.transaction
      ├─ add_to_transaction
      ├─ remember_transaction_record_state
      └─ super →
Callbacks#create_or_update
  └─ _run_save_callbacks { super } →
Persistence#create_or_update (line 893)
  └─ new_record? → _create_record →
Callbacks#_create_record
  └─ _run_create_callbacks { super } →
Persistence#_create_record (instance, line 922)
  ├─ attributes_for_create → attributes_with_values
  └─ Class._insert_record(connection, values, returning)
      └─ Arel::InsertManager → connection.insert → exec_insert
  ← @new_record = false, id written back
  ← after_create callbacks fire
      └─ autosave_associated_records_for_X (after_create)
          └─ association.insert_record → child.save (recursively)
  ← after_save callbacks fire
  ← transaction commits
  ← committed! → after_commit callbacks fire
```

---

## Key interplay to be aware of for your change

- **Callback order relative to the transaction**: `after_save` fires *inside* the transaction; `after_commit` fires *outside* after the DB confirms. If you're adding logic that needs to observe the final persisted state, `after_commit` is the safe hook.
- **`@_trigger_update_callback`** (set in `_update_record`, line 908) is what `transaction_include_any_action?(:update)` reads to filter `after_commit on: :update` — if your change bypasses `_update_record` it needs to set this flag manually.
- **Autosave callbacks run inside `after_create`/`after_update`**, which are inside `_run_save_callbacks`, which is inside the transaction — so any exception in an autosave cascade causes the whole transaction to roll back.
- **`restore_transaction_record_state`** (line 468) resets `@attributes` to the pre-save snapshot on rollback, not just dirty tracking — any in-memory writes your code makes inside the callback chain will be undone if the transaction rolls back.
