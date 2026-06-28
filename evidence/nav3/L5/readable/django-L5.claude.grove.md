# transcript: I'm planning a change to how persisting a model instance interacts with the database, so I need to understand the full journey of saving a single object. Sta...


💬 I'll trace this through the ORM using grove's structural tools. Let me load them and start from the `Model` class.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition)

💬 Now let me outline the model base file and pull the key methods in parallel.
  ▸ mcp__grove__outline({"file":"django/db/models/base.py","kind":"method","detail":0})
  ▸ mcp__grove__symbols({"dir":"django/db/models","name":"save_base","kind":"method"})
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map)

💬 Now let me pull the save-related methods from `base.py` and map the SQL compiler directory simultaneously.
  ▸ mcp__grove__map({"dir":"django/db/models","name":"save_base","nameContains":true})
  ▸ mcp__grove__outline({"file":"django/db/models/base.py","kind":"method","detail":1})

💬 Let me read the key methods directly since outline returned empty.
  ▸ mcp__grove__source({"file":"django/db/models/base.py","name":"save"})
  ▸ mcp__grove__source({"id":"python:django/db/models/base.py#save_base@950"})

💬 Good. Now I need `_save_table` (the update-vs-insert branch) and then the SQL layer.
  ▸ mcp__grove__source({"file":"django/db/models/base.py","name":"_save_table"})
  ▸ mcp__grove__source({"file":"django/db/models/base.py","name":"_do_update"})

💬 Now let me trace `_do_insert` and `QuerySet._update` to hit the SQL layer.
  ▸ mcp__grove__source({"file":"django/db/models/base.py","name":"_do_insert"})
  ▸ mcp__grove__map({"dir":"django/db/models","name":"_update","nameContains":false})
  ▸ mcp__grove__source({"id":"python:django/db/models/query.py#_update@1428"})
  ▸ mcp__grove__map({"dir":"django/db/models","name":"_insert"})
  ▸ mcp__grove__source({"id":"python:django/db/models/query.py#_insert@2112"})

💬 Now let me look at the SQL compiler layer — the `execute_sql` methods for both INSERT and UPDATE compilers.
  ▸ mcp__grove__map({"dir":"django/db/models/sql","kind":"method","name":"execute_sql"})
  ▸ mcp__grove__outline({"file":"django/db/models/sql/compiler.py","kind":"class","detail":0})

💬 Good. Now let me read the key methods from both compilers in parallel.
  ▸ mcp__grove__source({"file":"django/db/models/sql/compiler.py","name":"execute_sql"})
  ▸ mcp__grove__outline({"file":"django/db/models/sql/compiler.py","kind":"method","detail":1})
  ▸ mcp__grove__source({"id":"python:django/db/models/sql/compiler.py#execute_sql@1925"})
  ▸ mcp__grove__source({"id":"python:django/db/models/sql/compiler.py#execute_sql@2114"})

💬 Now let me get the `as_sql` methods for both INSERT and UPDATE compilers.
  ▸ mcp__grove__source({"file":"django/db/models/sql/compiler.py","name":"as_sql"})
  ▸ mcp__grove__source({"id":"python:django/db/models/sql/compiler.py#as_sql@1801"})
  ▸ mcp__grove__source({"id":"python:django/db/models/sql/compiler.py#as_sql@2037"})

💬 I have all the pieces. Let me also quickly check `execute_returning_sql` since `_update` can call it.
  ▸ mcp__grove__source({"file":"django/db/models/sql/compiler.py","name":"execute_returning_sql"})

💬 Here is the full journey, stage by stage, with the exact file locations where each transition happens.  ---  ## Stage 1 — `Model.save()` — public entry point...

──────── RESULT (success, 142364ms, 26 turns) ────────
Here is the full journey, stage by stage, with the exact file locations where each transition happens.

---

## Stage 1 — `Model.save()` — public entry point (`base.py:841`)

This method is the only thing a caller touches. Before doing anything persistent it:

1. Calls `_prepare_related_fields_for_save()` — validates that FK/O2O fields point to saved objects.
2. Resolves the `using` alias via `router.db_for_write()` (the database router decides which connection to target).
3. Validates the `force_insert`/`force_update`/`update_fields` combination — mutually exclusive flags are caught here, not deeper.
4. Handles the **deferred-field shortcut**: if the instance was loaded with `.defer()` or `.only()` and you're saving back to the same DB, it auto-promotes to `update_fields` covering only the loaded (non-deferred) fields, so you never accidentally blank out columns you never fetched.
5. Hands off to `save_base()`.

---

## Stage 2 — `Model.save_base()` — once-per-save bookkeeping (`base.py:950`)

This is the single layer that wraps the full save in lifecycle infrastructure. It runs exactly once per logical save, even for models with parent tables (which `_save_parents` will recurse into separately).

**Key actions in order:**

- Resolves the proxy chain: if `cls` is a proxy model, walks up to the concrete model for meta lookups, but keeps `origin` pointing at the proxy so signals are sent with the right sender.
- **Sends `pre_save` signal** (`pre_save.send(sender=origin, instance=self, raw=raw, using=using, update_fields=update_fields)`) — this is where `DateTimeField(auto_now=True)` hooks fire, and where user signal handlers run.
- Wraps in the appropriate transaction context:
  - Multi-table inheritance → `transaction.atomic(savepoint=False)` because multiple `INSERT`s must be atomic.
  - Single table → `transaction.mark_for_rollback_on_error()` (lighter; just ensures the connection is marked bad on exception, no savepoint overhead).
- Calls `_save_parents()` if not `raw` — recursively saves parent model rows for MTI before saving the child row.
- Calls `_save_table()` to do the actual row work.
- After the context manager exits, stamps `self._state.db = using` and `self._state.adding = False`.
- **Sends `post_save` signal** with `created=(not updated)`.

---

## Stage 3 — `Model._save_table()` — update-vs-insert decision (`base.py:1069`)

This is where the branch is taken. The logic is:

```
pk_set = self._is_pk_set()

if (not raw and not force_insert and not force_update
        and self._state.adding
        and all pk fields have a default):
    force_insert = True          # skip UPDATE attempt entirely

if pk_set and not force_insert:
    → try UPDATE first (_do_update)
    if rows matched → updated = True, done
    elif force_update/update_fields → raise NotUpdated
    # else: fall through to INSERT

if not updated:
    → INSERT (_do_insert)
```

The **primary signal** is `self._state.adding` — set `True` when an object is freshly constructed (`Model.__init__` sets it), cleared to `False` after the first successful save. So a round-trip through the database flips it, and subsequent saves go straight to UPDATE.

**Before calling `_do_update`**, the method:
- Calls `f.pre_save(self, False)` on every non-PK concrete field (this is where `auto_now`, `auto_now_add`, and custom field hooks run for the UPDATE path).
- Collects `returning_fields` — generated columns whose inputs are being updated, or any field holding an expression value that the DB computes.

**Before calling `_do_insert`**, the method:
- Optionally computes `_order` (for `order_with_respect_to` models) via an aggregate query.
- Calls `f.pre_save(self, add=True)` on insert fields.
- Decides whether to include each field in `returning_fields` based on backend capability (`can_return_columns_from_insert`).

---

## Stage 4 — `Model._do_update()` / `Model._do_insert()` — delegation (`base.py:1206`, `1246`)

These are thin adapter methods that cross from the model layer into the QuerySet/SQL layer.

**`_do_update`** (`base.py:1206`):
- Builds `base_qs.filter(pk=pk_val)` — a `QuerySet` scoped to this exact row.
- If `select_on_save` is set (an opt-in Meta flag for pathological multi-writer situations), it does a `filtered.exists()` check first, then calls `filtered._update(values, returning_fields)`.
- Otherwise goes straight to `filtered._update(values, returning_fields)`.
- Returns a list of result tuples (empty → no row matched → triggers INSERT fallback or `NotUpdated`).

**`_do_insert`** (`base.py:1246`):
- Calls `manager._insert([self], fields=fields, returning_fields=..., using=using, raw=raw)`.

---

## Stage 5 — `QuerySet._update()` / `QuerySet._insert()` — build the SQL query object (`query.py:1428`, `2112`)

**`QuerySet._update`** (`query.py:1428`):
```python
query = self.query.chain(sql.UpdateQuery)   # clone current query, switch type
query.add_update_fields(values)             # attach (field, model, value) triples
query.annotations = {}                      # strip annotations; not valid in SET
if returning_fields is None:
    return query.get_compiler(self.db).execute_sql(ROW_COUNT)
return query.get_compiler(self.db).execute_returning_sql(returning_fields)
```

**`QuerySet._insert`** (`query.py:2112`):
```python
query = sql.InsertQuery(self.model, ...)    # fresh query, not a clone
query.insert_values(fields, objs, raw=raw)  # pack field list + object list
return query.get_compiler(using=using).execute_sql(returning_fields)
```

Both paths end with `query.get_compiler(db)` — this returns the appropriate compiler subclass by looking up the backend's `DatabaseOperations` and instantiating either `SQLUpdateCompiler` or `SQLInsertCompiler`.

---

## Stage 6 — `SQLInsertCompiler.as_sql()` / `SQLUpdateCompiler.as_sql()` — generate SQL (`compiler.py:1801`, `2037`)

**INSERT** (`as_sql@1801`):
- Calls `connection.ops.insert_statement()` to get `"INSERT INTO"` (or `"INSERT OR REPLACE INTO"` for SQLite `on_conflict`).
- Iterates fields, calls `field.pre_save_val()` and `prepare_value()` per object per field.
- Handles `DatabaseDefault` (fields with `db_default`) — drops them from the column list if all rows use the default, or expands them into their expression SQL.
- Calls `assemble_as_sql()` to produce placeholder rows and param rows.
- Produces different SQL shapes depending on backend capabilities:
  - `can_return_columns_from_insert` (PostgreSQL) → single `VALUES (...)` + `RETURNING ...`.
  - `has_bulk_insert` → `bulk_insert_sql()` which produces `VALUES (...), (...), (...)`.
  - Otherwise → one `(sql, params)` tuple per object row.
- Returns a **list** of `(sql, params)` tuples (INSERT is the one compiler that can return multiple statements).

**UPDATE** (`as_sql@2037`):
- Calls `pre_sql_setup()` (resolves table aliases).
- Iterates `query.values`; for each field: if the value has `resolve_expression()` it's compiled inline; if it has `as_sql()` it's compiled as a subexpression; otherwise it becomes a `%s` placeholder.
- Calls `field.get_db_prep_save()` on plain values to apply DB-level type coercion.
- Builds `UPDATE <table> SET col = %s, ... WHERE pk = %s`.
- If `returning_fields` are set (backend supports `RETURNING`), appends that clause.
- Returns a single `(sql, params)` tuple.

---

## Stage 7 — `execute_sql()` — run against the database cursor

**INSERT path** — `SQLInsertCompiler.execute_sql` (`compiler.py:1925`):
- Opens `connection.cursor()`.
- Loops over the list of `(sql, params)` from `as_sql()`, calling `cursor.execute()` for each.
- If `returning_fields` were requested and the backend supports `RETURNING` (PostgreSQL, MariaDB 10.5+, etc.), calls `connection.ops.fetch_returned_rows()` to pull the auto-generated values.
- For backends that don't support `RETURNING` but do expose an auto-increment via `last_insert_id()` (MySQL, SQLite), calls `connection.ops.last_insert_id()` instead.
- Runs converters on raw DB values before returning them.
- Returns a list of row tuples (one per inserted object).

**UPDATE path** — `SQLUpdateCompiler.execute_sql` (`compiler.py:2114`) delegates to `SQLCompiler.execute_sql` (`compiler.py:1595`):
- Calls `self.as_sql()` to get `(sql, params)`.
- Gets a cursor via `connection.cursor()`.
- Calls `cursor.execute(sql, params)` — the parameterised query goes to the DB driver.
- With `result_type=ROW_COUNT`, immediately reads `cursor.rowcount` and closes the cursor.
- The rowcount flows back up: 0 means no row matched → `_save_table` interprets it as a miss and falls through to INSERT; >0 means a row was updated → `updated = True`.
- If `returning_fields` were requested, `execute_returning_sql` (`compiler.py:2135`) is used instead — it sets `self.returning_fields` so `as_sql()` appends the `RETURNING` clause, then fetches and converts those rows from the cursor.

---

## How the stages connect — a single-object save

```
Model.save()
  └─ resolves `using`, normalises update_fields/force_insert
     └─ Model.save_base()
          ├─ pre_save signal
          ├─ [transaction.atomic or mark_for_rollback_on_error]
          │    ├─ _save_parents()   (MTI only, recursive)
          │    └─ _save_table()
          │         ├─ pk set + not force_insert?
          │         │    └─ _do_update()
          │         │         └─ QuerySet._update()
          │         │              └─ SQLUpdateCompiler
          │         │                   ├─ as_sql()  →  "UPDATE … SET … WHERE pk=%s"
          │         │                   └─ execute_sql() / execute_returning_sql()
          │         │                        └─ cursor.execute(sql, params)
          │         │                             └─ rowcount → 0 or >0
          │         └─ not updated?
          │              └─ _do_insert()
          │                   └─ QuerySet._insert()
          │                        └─ SQLInsertCompiler
          │                             ├─ as_sql()  →  "INSERT INTO … VALUES (…)"
          │                             └─ execute_sql()
          │                                  ├─ cursor.execute(sql, params)
          │                                  └─ fetch RETURNING / last_insert_id
          └─ post_save signal  (created=True if inserted, False if updated)
```

The returned values (auto-generated PK, `RETURNING` columns, generated fields) flow back through `_assign_returned_values()` in `_save_table`, so by the time `save()` returns the instance's `pk` and any DB-side computed fields are populated in memory.
