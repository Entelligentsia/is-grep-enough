# transcript: I'm planning a change to how persisting a model instance interacts with the database, so I need to understand the full journey of saving a single object. Sta...


💬 I'll trace this flow through the ORM source, reading the key files in parallel.
  ▸ Bash(grep -n "def save\|def save_base\|def _save_table\|def _do_insert\|def _do_update" /home/bench/repos/django/django/db/models/base.py)
  ▸ Bash(grep -n "def execute_sql\|def as_sql\|class SQLInsertCompiler\|class SQLUpdateCompiler" /home/bench/repos/django/django/db/models/sql/compiler.py | head -40)
  ▸ Read(/home/bench/repos/django/django/db/models/base.py)

💬 Now let me look at how `manager._insert` leads to the compiler, and how `_update` works on the queryset.
  ▸ Bash(grep -n "def _insert\|def _update" /home/bench/repos/django/django/db/models/manager.py /home/bench/repos/django/django/db/models/query.py 2>/dev/null | head...)
  ▸ Read(/home/bench/repos/django/django/db/models/sql/compiler.py)
  ▸ Read(/home/bench/repos/django/django/db/models/query.py)
  ▸ Read(/home/bench/repos/django/django/db/models/query.py)

💬 Now let me check the `SQLUpdateCompiler.execute_sql` and `execute_returning_sql` briefly.
  ▸ Read(/home/bench/repos/django/django/db/models/sql/compiler.py)

💬 I have everything I need. Here's the complete flow:  ---  ## Django model save flow  ### Stage 1: `Model.save()` — public entry point (`base.py:841`)  This i...

──────── RESULT (success, 109265ms, 9 turns) ────────
I have everything I need. Here's the complete flow:

---

## Django model save flow

### Stage 1: `Model.save()` — public entry point (`base.py:841`)

This is the user-facing method. It does three things before handing off:

1. **Validates the flags**: `force_insert` and `force_update`/`update_fields` are mutually exclusive; it raises immediately if both are set.
2. **Resolves the database alias**: `router.db_for_write(self.__class__, instance=self)` picks which connection to use (falls back to `"default"`).
3. **Handles deferred-field promotion**: if the instance was loaded with `defer()`/`only()` and has a PK set, any unloaded fields are absent from `self.__dict__`. Rather than silently overwriting those columns with `None`, `save()` detects the missing attributes and converts the call into an `update_fields` save limited to the loaded columns only.

After that preparation it calls `save_base()`.

---

### Stage 2: `Model.save_base()` — once-per-save lifecycle (`base.py:950`)

This is the "do this exactly once per user-initiated save" layer. It runs regardless of inheritance depth.

- **`pre_save` signal** is sent first (unless `meta.auto_created` — i.e. hidden through-tables don't get signals). Receivers can still mutate the instance here.
- **Transaction scope**: if the model has parent tables (multi-table inheritance, MTI), it wraps everything in `transaction.atomic(savepoint=False)`. A single-table model gets the cheaper `mark_for_rollback_on_error` instead — it doesn't open a new transaction, just arranges for rollback if an exception propagates out.
- **`_save_parents()`** is called (not `raw`) to recursively save ancestor tables in MTI chains, walking up the `meta.parents` dict. Each ancestor is handled by `_save_table()` at the parent's level, and the resulting PKs are written back onto `self` so the child row's FK pointer is correct.
- **`_save_table()`** is called for the model's own table.
- On return it stamps `self._state.db = using` and `self._state.adding = False`.
- **`post_save` signal** is sent with `created=(not updated)` so receivers know whether a new row was born.

---

### Stage 3: `Model._save_table()` — insert vs. update decision (`base.py:1069`)

This is where the choice between SQL paths is made.

**Setup:**
- Collects `non_pks_non_generated` — the concrete local fields that aren't PKs and aren't computed by the DB. These are the fields that go into the write.
- If `update_fields` was passed, filters that list down to the named fields.
- If no PK value exists yet, calls `meta.pk.get_pk_value_on_save(self)` — this is where `AutoField` returns `None` (letting the DB assign it) and `UUIDField` with `default=uuid4` generates a value now.

**Shortcut to INSERT**: if the instance is new (`_state.adding`) and every PK field has either a Python default or a DB default, it sets `force_insert = True` and skips the UPDATE attempt entirely. This avoids an always-failing UPDATE round-trip.

**UPDATE attempt** — runs when `pk_set and not force_insert`:
- Calls `f.pre_save(self, False)` on each non-PK field (this is where `auto_now` on `DateTimeField` fires for updates, `F()` expressions are passed through as-is, etc.).
- Collects any generated columns that depend on fields being written, and any expression values, into `returning_fields` — columns whose DB-computed value needs to be read back.
- Calls `_do_update()`. If it returns a non-empty list, `updated = True` and returned values are assigned back onto the instance.
- If zero rows were matched and `force_update`/`update_fields` was set, raises `Model.NotUpdated`. Otherwise falls through to INSERT.

**INSERT path** — runs when `not updated`:
- Handles `order_with_respect_to` auto-population (a COUNT+MAX aggregate query to set `_order`).
- Calls `f.pre_save(self, add=True)` on each insert field — `auto_now_add` fires here, as does `auto_now`, UUID generation, etc.
- Checks `connection.features.can_return_columns_from_insert` to decide which fields need to be in `returning_fields` (some backends can't return inserted values, so those fields' post-insert values have to be skipped or fetched separately).
- Calls `_do_insert()`.
- Returned values are assigned back (notably the auto-generated PK).

Returns the boolean `updated` up to `save_base`.

---

### Stage 4a: The UPDATE path — `_do_update()` → `QuerySet._update()` → `SQLUpdateCompiler`

**`_do_update()`** (`base.py:1206`):
- Creates `filtered = base_qs.filter(pk=pk_val)` — a queryset scoped to this one row.
- If the model has `select_on_save = True`, it does a `filtered.exists()` pre-check to distinguish "row was concurrently deleted" from "UPDATE succeeded but returned 0 rows" (a rare but real edge case).
- Calls `filtered._update(values, returning_fields)`.

**`QuerySet._update()`** (`query.py:1428`):
- Chains `self.query` into an `sql.UpdateQuery` (same WHERE clause, new operation type).
- Calls `query.add_update_fields(values)` to record which columns get which values.
- Gets `SQLUpdateCompiler` via `query.get_compiler(self.db)`.
- If `returning_fields`: calls `compiler.execute_returning_sql(returning_fields)` which emits `UPDATE … RETURNING …` on supporting backends (PostgreSQL), or falls back to a row-count approach.
- Otherwise calls `compiler.execute_sql(ROW_COUNT)` and returns the count.

**`SQLUpdateCompiler.as_sql()`** (`compiler.py:2037`) builds:
```sql
UPDATE "table" SET "col" = %s [, …] WHERE "table"."pk" = %s
```
On backends where `UPDATE … WHERE pk IN (SELECT …)` is needed (e.g. MySQL for self-referential joins), `pre_sql_setup()` (`compiler.py:2167`) first runs a SELECT to collect PKs, then replaces the WHERE.

**`SQLUpdateCompiler.execute_sql()`** delegates to the base `SQLCompiler.execute_sql()` which opens a cursor, calls `cursor.execute(sql, params)`, and returns the row count.

---

### Stage 4b: The INSERT path — `_do_insert()` → `QuerySet._insert()` → `SQLInsertCompiler`

**`_do_insert()`** (`base.py:1246`) immediately calls `manager._insert([self], fields=..., returning_fields=..., using=..., raw=...)`.

**`QuerySet._insert()`** (`query.py:2112`):
- Creates `sql.InsertQuery(self.model)`.
- Calls `query.insert_values(fields, objs, raw=raw)` to bind the object list and field list onto the query object.
- Gets `SQLInsertCompiler` via `query.get_compiler(using=using)`.
- Calls `compiler.execute_sql(returning_fields)`.

**`SQLInsertCompiler.as_sql()`** (`compiler.py:1801`) is where the SQL text is assembled:
1. Picks the INSERT verb from `connection.ops.insert_statement()` — this is how `INSERT OR REPLACE` / `INSERT OR IGNORE` / `ON CONFLICT DO UPDATE` variations are handled.
2. For each field × object: calls `pre_save_val()` (which re-calls `field.pre_save(obj, add=True)` unless raw) then `prepare_value()` → `field.get_db_prep_save(value, connection)`. This is where Python values are converted to DB-safe types.
3. `assemble_as_sql()` turns the prepared values into `(placeholder_string, params_list)` pairs — geo fields get special `get_placeholder_sql()` treatment; expression values get compiled recursively; plain values become `%s`.
4. If `returning_fields` and the backend supports it (`can_return_columns_from_insert`), appends a `RETURNING` clause via `connection.ops.returning_columns()`.
5. Returns a list of `(sql_string, params_tuple)` — one entry per object when not bulk-inserting.

**`SQLInsertCompiler.execute_sql()`** (`compiler.py:1925`):
- Opens `connection.cursor()`.
- Loops over `self.as_sql()` calling `cursor.execute(sql, params)` for each statement.
- After execution, retrieves returned values via one of three paths depending on backend capability:
  - `connection.ops.fetch_returned_rows()` for `RETURNING`-capable backends.
  - `connection.ops.last_insert_id(cursor, table, column)` for backends that expose the last auto-increment ID (SQLite, MySQL).
  - Nothing, for cases where the PK was already set on the Python side.
- Runs field-level converters (`get_converters()` / `apply_converters()`) on the raw DB values.
- Returns the converted rows up the call stack to `_save_table`, which writes them back onto `self`.

---

### How the stages connect — the data handoff

```
save()
  └─ save_base()               # signals, transaction, state
       ├─ _save_parents()      # MTI ancestors, recursive
       └─ _save_table()        # the actual decision point
            ├─ _do_update()    # UPDATE attempt
            │    └─ QuerySet._update()
            │         └─ SQLUpdateCompiler.execute_sql() / execute_returning_sql()
            │              └─ cursor.execute(sql, params)
            └─ _do_insert()    # INSERT if update missed
                 └─ QuerySet._insert()
                      └─ SQLInsertCompiler.execute_sql()
                           ├─ as_sql() → [(sql, params), …]
                           └─ cursor.execute(sql, params)
```

The key state the stages pass to each other:

- `save()` → `save_base()`: resolved `using`, possibly narrowed `update_fields`.
- `save_base()` → `_save_table()`: the `force_insert` flag may be widened by MTI parent results (`parent_inserted`).
- `_save_table()` → `_do_update()` / `_do_insert()`: the `(field, model, value)` triples where each value has already had `field.pre_save()` called.
- `_do_update()` / `_do_insert()` → `_save_table()`: a list of rows (possibly empty tuples `[()]` for a matched-but-nothing-to-return update) which `_assign_returned_values()` writes back onto the instance — this is how DB-generated PKs, `auto_now` timestamps, and computed columns land on `self` after the write.
