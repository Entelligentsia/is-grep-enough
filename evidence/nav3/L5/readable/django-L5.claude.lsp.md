# transcript: I'm planning a change to how persisting a model instance interacts with the database, so I need to understand the full journey of saving a single object. Sta...


💬 Let me load the LSP tool and start from the `Model.save` entry point.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(Model.save)
  ▸ LSP(Model.save)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/base.py","line":1,"character":1})

💬 I can see all the key methods. Let me read the relevant sections in parallel.
  ▸ Read(/home/bench/repos/django/django/db/models/base.py)
  ▸ Read(/home/bench/repos/django/django/db/models/base.py)

💬 Now let me read `_save_table`, `_do_update`, and `_do_insert` in parallel.
  ▸ Read(/home/bench/repos/django/django/db/models/base.py)
  ▸ Read(/home/bench/repos/django/django/db/models/base.py)
  ▸ Read(/home/bench/repos/django/django/db/models/base.py)

💬 Now I need to follow `manager._insert` down to where the SQL is built and executed. Let me find `_insert` on the manager.
  ▸ LSP({"operation":"goToDefinition","filePath":"/home/bench/repos/django/django/db/models/base.py","line":1251,"character":20})
  ▸ LSP({"operation":"goToDefinition","filePath":"/home/bench/repos/django/django/db/models/base.py","line":1241,"character":30})

💬 Let me look at the `QuerySet._update` and `Manager._insert` directly.
  ▸ LSP(_insert)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/manager.py","line":1,"character":1})

💬 `_insert` is in `QuerySet` at `query.py:2112`. Let me read that and `_update` too.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/query.py","line":1,"character":1})

💬 Now let me read `QuerySet._insert` (line 2112) and `QuerySet._update` (line 1428) together.
  ▸ Read(/home/bench/repos/django/django/db/models/query.py)
  ▸ Read(/home/bench/repos/django/django/db/models/query.py)

💬 Both paths end at `sql.InsertQuery` / `sql.UpdateQuery` compilers. Let me find those.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/sql/subqueries.py","line":1,"character":1})
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/db/models/sql/compiler.py","line":1,"character":1})

💬 Let me read the final execution steps in both compilers.
  ▸ Read(/home/bench/repos/django/django/db/models/sql/compiler.py)
  ▸ Read(/home/bench/repos/django/django/db/models/sql/compiler.py)

💬 Here is the full journey, stage by stage.  ---  ## Stage 1 — `Model.save()` (`base.py:841`): public entry point  This is the only method users call. Before t...

──────── RESULT (success, 152672ms, 21 turns) ────────
Here is the full journey, stage by stage.

---

## Stage 1 — `Model.save()` (`base.py:841`): public entry point

This is the only method users call. Before touching the database it does three things:

1. **Validates related fields** — `_prepare_related_fields_for_save()` ensures no FK/O2O on this instance still points to an unsaved object.
2. **Resolves the database** — `router.db_for_write()` picks the alias (`using`) if the caller didn't supply one.
3. **Narrows `update_fields` for deferred instances** — if some fields were never loaded (`__dict__` is missing them) and this instance was fetched from the same DB it's being written back to, `save()` automatically restricts the update to only the loaded non-PK fields, so it doesn't wipe unloaded columns with `None`.

After those checks it hands off unconditionally to `save_base()`.

---

## Stage 2 — `Model.save_base()` (`base.py:950`): per-save bookkeeping and signals

This is the once-per-save coordination layer. Its job is lifecycle management, not SQL.

```
pre_save signal  →  [atomic savepoint if MTI]  →  _save_parents()  →  _save_table()  →  post_save signal
```

- **`pre_save`** is sent before any SQL runs (`sender=origin` keeps the proxy model as the sender).
- If the model has parent tables (multi-table inheritance), everything is wrapped in `transaction.atomic(savepoint=False)`; single-table models use the lighter `mark_for_rollback_on_error`.
- `_save_parents()` is skipped when `raw=True` (fixture loading).
- After `_save_table()` returns, `_state.db` is set and `_state.adding` is cleared.
- **`post_save`** receives `created=(not updated)` — it knows whether a row was born or just updated.

---

## Stage 3 — `Model._save_parents()` (`base.py:1022`): multi-table inheritance recursion

For MTI models, each parent's DB table gets its own row. `_save_parents()` recurses up the inheritance chain — parents before children — so that child rows can reference parent PKs. Each parent save calls `_save_table()` for that parent's table and propagates `force_insert` downward.

For single-table models this method does nothing.

---

## Stage 4 — `Model._save_table()` (`base.py:1069`): the UPDATE-or-INSERT decision

This is the heart of the logic. The key decision tree:

```
pk not set?  →  get_pk_value_on_save() (e.g. generate a UUID)

_state.adding AND all pk fields have defaults?
    →  force_insert = True  (skip the UPDATE probe entirely)

pk is set AND not force_insert?
    →  attempt _do_update()
       updated == True?  →  done
       updated == False AND force_update?  →  raise NotUpdated
       updated == False AND update_fields?  →  raise NotUpdated
       updated == False otherwise?  →  fall through to INSERT

not updated?
    →  handle order_with_respect_to  (auto-populate _order)
    →  _do_insert()
```

Field values for the UPDATE path go through `field.pre_save(self, add=False)` (applying `auto_now`, transforms, etc.) and for the INSERT path through `field.pre_save(self, add=True)` (applying `auto_now_add`).

**Returning fields** — both paths build a list of fields whose values need to come back from the DB: generated columns (`GeneratedField`) and any field whose pre-save value is a SQL expression rather than a Python literal. After either path executes, `_assign_returned_values()` writes those DB-computed values back onto `self.__dict__`.

---

## Stage 5a — `Model._do_update()` → `QuerySet._update()` (`base.py:1206`, `query.py:1428`): the UPDATE path

`_do_update` filters `base_qs` to `pk=pk_val` and calls `filtered._update(values, returning_fields)`.

Edge cases handled here:
- **No values** (pure-PK model, or `update_fields` targets no columns in this table): returns `[()]` if the row exists, `[]` if not, without issuing an UPDATE.
- **`select_on_save`**: first checks `exists()`, then calls `_update()`, then checks `exists()` again if 0 rows returned — to distinguish "row was concurrently deleted" from "DB returned 0 despite success."

`QuerySet._update()` chains the existing queryset query as an `sql.UpdateQuery`, calls `query.add_update_fields(values)`, then dispatches to the compiler:
- **With returning fields** → `get_compiler(db).execute_returning_sql(returning_fields)`
- **Without** → `get_compiler(db).execute_sql(ROW_COUNT)`

---

## Stage 5b — `Model._do_insert()` → `QuerySet._insert()` (`base.py:1246`, `query.py:2112`): the INSERT path

`_do_insert` calls `manager._insert(...)`, which is a queryset method proxied onto the manager via `_get_queryset_methods`. `QuerySet._insert()` (`query.py:2112`):

```python
query = sql.InsertQuery(self.model, ...)
query.insert_values(fields, objs, raw=raw)
return query.get_compiler(using=using).execute_sql(returning_fields)
```

`insert_values` stores the field list and object list on the query object; the compiler will iterate them when building SQL.

---

## Stage 6 — Compiler `as_sql()` + `execute_sql()`: turning the query into actual SQL

**`SQLInsertCompiler.as_sql()`** (`compiler.py:1801`) builds the `INSERT INTO table (col1, col2, ...) VALUES (%s, %s, ...)` string. It:
- Iterates the query's fields; for each field+object pair calls `field_as_sql()` → `field.get_db_prep_save()` → the connection's value preparation.
- Handles DB defaults (`DEFAULT` keyword), bulk inserts, and any ON CONFLICT suffix for `update_conflicts`.

**`SQLInsertCompiler.execute_sql()`** (`compiler.py:1925`) fires the cursor:

```python
with self.connection.cursor() as cursor:
    for sql, params in self.as_sql():
        cursor.execute(sql, params)      # ← actual DB call
```

Then fetches returned values:
- PostgreSQL (`can_return_columns_from_insert`): `connection.ops.fetch_returned_rows(cursor, ...)` reads the `RETURNING` clause result.
- Older/simpler backends: `connection.ops.last_insert_id(cursor, db_table, column)` for auto-increment PKs.

**`SQLUpdateCompiler.as_sql()`** (`compiler.py:2037`) builds `UPDATE table SET col=%s WHERE pk=%s`.

**`SQLUpdateCompiler.execute_returning_sql()`** (`compiler.py:2135`) covers the case where the backend supports `RETURNING` on UPDATE (PostgreSQL): appends the `RETURNING` clause to the UPDATE SQL and fetches rows. On backends that don't support it, it falls back to `execute_sql(ROW_COUNT)` and synthesizes `[()] * row_count` so that the caller can at least know the UPDATE hit some rows.

---

## The connection chain, summarised

```
Model.save()
 └─ save_base()          [pre_save, transaction, post_save]
     └─ _save_parents()  [MTI recursion]
     └─ _save_table()    [UPDATE or INSERT decision, field.pre_save()]
         ├─ _do_update()
         │   └─ QuerySet._update()
         │       └─ sql.UpdateQuery  →  SQLUpdateCompiler.as_sql()  →  cursor.execute()
         └─ _do_insert()
             └─ QuerySet._insert()
                 └─ sql.InsertQuery  →  SQLInsertCompiler.as_sql()  →  cursor.execute()
```

The two cleanest seam points for intercepting the flow: `save_base()` (receives the signals and owns the transaction boundary) and `_save_table()` (owns the INSERT/UPDATE branch and all field value preparation). Everything below `_save_table()` is SQL assembly and cursor execution, with no further model-level decisions.
