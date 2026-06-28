# transcript: I'm planning a change to how persisting a model instance interacts with the database, so I need to understand the full journey of saving a single object. Sta...


💬 I'll trace this using the LSP tool, starting from the public entry point.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(Model.save)
  ▸ LSP(Model.save)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/base.py","line":1,"character":1})

💬 Now let me read the key methods in sequence.
  ▸ Read(/home/bench/repos/django/django/db/models/base.py)

💬 Now let me follow `_update` and `_insert` down into the QuerySet layer.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/query.py","line":1,"character":1})

💬 Now let me read the `_update` and `_insert` methods from `query.py`.
  ▸ Read(/home/bench/repos/django/django/db/models/query.py)
  ▸ Read(/home/bench/repos/django/django/db/models/query.py)

💬 Now let me look at the SQL compiler layer — `UpdateQuery` and `InsertQuery`.
  ▸ Bash(ls /home/bench/repos/django/django/db/models/sql/)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/sql/subqueries.py","line":1,"character":1})
  ▸ Read(/home/bench/repos/django/django/db/models/sql/subqueries.py)

💬 Now let me look at the SQL compiler — `SQLUpdateCompiler` and `SQLInsertCompiler`.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/sql/compiler.py","line":1,"character":1})

💬 Now let me read the two key compiler methods — `SQLUpdateCompiler.execute_sql` / `execute_returning_sql` and `SQLInsertCompiler.execute_sql` — to see how the...
  ▸ Read(/home/bench/repos/django/django/db/models/sql/compiler.py)
  ▸ Read(/home/bench/repos/django/django/db/models/sql/compiler.py)

💬 Let me also read the base `SQLCompiler.execute_sql` since `SQLUpdateCompiler` delegates to it.
  ▸ Read(/home/bench/repos/django/django/db/models/sql/compiler.py)

💬 Now I have the full picture. Here's the complete walkthrough.  ---  ## The full save journey  ### Stage 1 — `Model.save()` (base.py:841): public entry point ...

──────── RESULT (success, 130827ms, 16 turns) ────────
Now I have the full picture. Here's the complete walkthrough.

---

## The full save journey

### Stage 1 — `Model.save()` (base.py:841): public entry point

This is the user-facing API. Before delegating anywhere it does three things:

1. **Validates related-object fields** via `_prepare_related_fields_for_save()` (base.py:858) — ensures FK targets are saved/have PKs.
2. **Picks the database alias** — `using or router.db_for_write(...)`.
3. **Decides whether to narrow to `update_fields`** — if the instance was loaded from the DB but some fields are deferred (not in `self.__dict__`), it automatically converts a bare `save()` into an `update_fields` save of only the fields that were loaded (base.py:889–902). This prevents overwriting columns that were never fetched.

Then it hands off to `save_base()`.

---

### Stage 2 — `Model.save_base()` (base.py:950): once-per-save bookkeeping

The docstring says explicitly: *"parts that should happen only once per save"* — signals and transaction setup. The interesting parts:

- **`pre_save` signal** is emitted here (base.py:976), before any DB work.
- **Transaction wrapping**: if the model has parents (MTI), an `atomic(savepoint=False)` block wraps everything; otherwise `mark_for_rollback_on_error` is used instead (only marks the connection, no savepoint overhead).
- **`_save_parents()`** recurses up the inheritance tree, saving each parent's table. If a parent was inserted (not updated), the child inherits that insert-flag.
- **`_save_table()`** is called for the concrete model's own table.
- After the context manager exits: `_state.db` is stamped and `_state.adding` is set to `False`.
- **`post_save` signal** fires, with `created=(not updated)` so receivers can tell insert from update.

---

### Stage 3 — `Model._save_table()` (base.py:1069): INSERT-or-UPDATE decision

This is where the branching logic lives.

**PK setup**: if the PK isn't set, `meta.pk.get_pk_value_on_save(self)` is called (base.py:1098) — this is where UUID/sequence-based PKs get their value before the query.

**Fast-insert short-circuit** (base.py:1105–1112): if the instance is flagged as `_state.adding` and every PK field has a default/db_default, `force_insert` is set to `True` and the UPDATE attempt is skipped entirely.

**UPDATE attempt** (base.py:1115–1156): when `pk_set and not force_insert`:
- Calls `field.pre_save(self, False)` on each non-PK, non-generated concrete field to get the value to write.
- Computes `returning_fields`: generated columns that reference the updated fields, plus any fields whose value is an expression (F/Value etc.) — these need to be read back after the write.
- Delegates to `_do_update()` → `filtered._update(values, returning_fields)`.
- `updated = bool(results)` — the update is considered successful only if at least one row was matched.
- If `force_update` or `update_fields` was set and zero rows matched → raises `self.NotUpdated`.

**INSERT path** (base.py:1157–1203): runs if `not updated`:
- Handles `order_with_respect_to` auto-increment (queries for `MAX(_order) + 1`).
- Builds `insert_fields` — all local concrete non-generated fields (auto-field is excluded when PK was externally set).
- Calls `field.pre_save(self, add=True)` per field (this is where `auto_now_add`, callable defaults, etc. run).
- Determines `returning_fields` from `meta.db_returning_fields`, then adds expression-valued fields. Removes fields the backend can't return if `can_return_columns_from_insert` is False.
- Calls `_do_insert(cls._base_manager, using, insert_fields, returning_fields, raw)`.
- Calls `_assign_returned_values()` to write DB-generated values (e.g. auto-PK) back onto the instance.

---

### Stage 4 — QuerySet (`_update` / `_insert`) (query.py): query object assembly

**`QuerySet._update(values, returning_fields)`** (query.py:1428):
- Chains the current queryset query into an `UpdateQuery` via `self.query.chain(sql.UpdateQuery)`.
- Calls `query.add_update_fields(values)` — populates `query.values` with `(field, model, resolved_value)` triples, resolving any expressions against the query.
- Dispatches: if `returning_fields` is `None`, calls `compiler.execute_sql(ROW_COUNT)`; otherwise calls `compiler.execute_returning_sql(returning_fields)`.

**`QuerySet._insert(objs, fields, ...)`** (query.py:2112):
- Creates an `InsertQuery(self.model)`.
- Calls `query.insert_values(fields, objs, raw=raw)` — just stores `query.fields`, `query.objs`, `query.raw`.
- Returns `query.get_compiler(using=using).execute_sql(returning_fields)`.

In both cases `query.get_compiler(using)` looks up the compiler class name stored on the query object (`"SQLUpdateCompiler"` / `"SQLInsertCompiler"`), instantiates it with the query and the database connection, and returns it.

---

### Stage 5 — SQL compilers (compiler.py): SQL generation and execution

**`SQLInsertCompiler.as_sql()`** (compiler.py:1801):
- Gets the verb from `connection.ops.insert_statement(on_conflict=...)` — normally `"INSERT INTO"`, but backends can return `"INSERT OR IGNORE INTO"` etc.
- Iterates fields × objects. Per field: calls `field.pre_save(obj, add=True)` (via `pre_save_val()`), then `field.get_db_prep_save(value, connection=...)` (via `prepare_value()`) to get a DB-ready value. Fields with `has_db_default()` that all resolve to `DatabaseDefault` are dropped from the column list.
- `assemble_as_sql()` turns field values into `%s` placeholder strings and flat param lists.
- Appends `RETURNING …` clause if `can_return_columns_from_insert`.
- Returns a list of `(sql_string, params_tuple)` — one tuple per row for row-at-a-time backends, one tuple for bulk backends.

**`SQLInsertCompiler.execute_sql(returning_fields)`** (compiler.py:1925):
- Opens `connection.cursor()`.
- Iterates `as_sql()` results, calling `cursor.execute(sql, params)` for each.
- If returning fields are wanted: uses `connection.ops.fetch_returned_rows(cursor, ...)` (backends that support `RETURNING`) or falls back to `connection.ops.last_insert_id(cursor, ...)` for single-row auto-field inserts.
- Applies value converters (e.g. type coercion) and returns the list of rows.

**`SQLUpdateCompiler.as_sql()`** (compiler.py:2037):
- Calls `pre_sql_setup()` first — if the update touches multiple tables or the backend can't self-select (MySQL), it pre-fetches the matching PKs with a SELECT and rewrites the WHERE to `pk__in` those IDs.
- Builds `UPDATE <table> SET col1 = %s, col2 = %s WHERE <pk filter>`.
- Calls `field.get_db_prep_save()` for each value; expressions are compiled inline via `self.compile(val)`.
- Appends `RETURNING …` if `returning_fields` is set.

**`SQLUpdateCompiler.execute_returning_sql()`** (compiler.py:2135): if `can_return_rows_from_update`, calls `cursor.execute(sql, params)` then `fetch_returned_rows()`; otherwise falls back to `execute_sql(ROW_COUNT)` and synthesizes `[()] * row_count` placeholders.

**`SQLCompiler.execute_sql()`** (compiler.py:1595) — base used by the non-returning update path: calls `self.as_sql()`, opens `connection.cursor()`, calls `cursor.execute(sql, params)`, returns `cursor.rowcount` for `ROW_COUNT`, a single row for `SINGLE`, or a chunked iterator for `MULTI`.

---

### How the stages connect — the chain

```
Model.save()
  └─ Model.save_base()
       ├─ pre_save signal
       ├─ [transaction/savepoint]
       ├─ Model._save_parents()       ← recurses for MTI ancestors
       │    └─ Model._save_table()    ← one call per ancestor table
       └─ Model._save_table()         ← for own concrete table
            ├─ [UPDATE path] → Model._do_update()
            │    └─ QuerySet._update(values, returning_fields)
            │         └─ UpdateQuery + SQLUpdateCompiler
            │              ├─ .as_sql()           → "UPDATE … SET … WHERE pk=%s"
            │              └─ .execute_sql() / .execute_returning_sql()
            │                   └─ cursor.execute(sql, params)
            │
            └─ [INSERT path] → Model._do_insert()
                 └─ QuerySet._insert(objs, fields, ...)
                      └─ InsertQuery + SQLInsertCompiler
                           ├─ .as_sql()           → "INSERT INTO … (cols) VALUES (%s …)"
                           └─ .execute_sql(returning_fields)
                                └─ cursor.execute(sql, params)
                                     └─ fetch returned rows / last_insert_id
       └─ post_save signal
```

The key design point is that `save_base` is the **signal and transaction fence** — everything that should happen exactly once per logical save lives there. `_save_table` is the **routing logic** — it decides INSERT vs UPDATE and owns the pre-save field value computation. The QuerySet methods (`_update`, `_insert`) are thin **query object factories**. The compilers are purely **SQL renderers + executors**: `as_sql()` produces the string, `execute_sql()` opens the cursor and fires it.
