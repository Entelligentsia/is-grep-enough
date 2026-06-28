# transcript: When the router finishes matching an incoming URL, it hands the rest of the request machinery a single object that captures everything known about which view...


💬 Let me look at the resolver match object directly.
  ▸ Bash(grep -n "class ResolverMatch" /home/bench/repos/django/django/urls/resolvers.py)
  ▸ Read(/home/bench/repos/django/django/urls/resolvers.py)

💬 Here's a complete walkthrough of `ResolverMatch` (`django/urls/resolvers.py:34`):  ---  ## The view callable — `func`, `_func_path`  `self.func` holds the **...

──────── RESULT (success, 32847ms, 3 turns) ────────
Here's a complete walkthrough of `ResolverMatch` (`django/urls/resolvers.py:34`):

---

## The view callable — `func`, `_func_path`

`self.func` holds the **actual callable** that will be invoked — exactly as registered in `urlpatterns`. For a function-based view this is the function itself; for a class-based view it is the bound `View.as_view()` closure (which has a `.view_class` attribute pointing back to the class).

`_func_path` is computed once at construction for display purposes (lines 64–71):

```python
if hasattr(func, "view_class"):
    func = func.view_class          # peel back to the class for CBVs
if not hasattr(func, "__name__"):   # callable instance without __name__
    self._func_path = func.__class__.__module__ + "." + func.__class__.__name__
else:
    self._func_path = func.__module__ + "." + func.__name__
```

---

## URL-extracted arguments — `args`, `kwargs`, `captured_kwargs`, `extra_kwargs`

| attribute | what it holds |
|---|---|
| `args` | positional captures from unnamed regex groups |
| `kwargs` | keyword captures — merged from named URL groups and any `kwargs=` dict on the route |
| `captured_kwargs` | the subset of `kwargs` that came purely from the URL pattern (not injected by `kwargs=`) |
| `extra_kwargs` | the subset injected by the `kwargs=` dict on the route |

The split between `captured_kwargs` and `extra_kwargs` is diagnostic: in normal use the router merges them into `kwargs` before handing the match off.

---

## Naming — `url_name`, `view_name`

`url_name` is the bare `name=` string given to `path()` / `re_path()`, e.g. `"article-detail"`. It is `None` when the route has no name.

`view_name` (line 73–74) is the **fully namespace-qualified** name used by `reverse()`:

```python
view_path = url_name or self._func_path   # fall back to dotted import path
self.view_name = ":".join([*self.namespaces, view_path])
# e.g. "blog:articles:article-detail"
```

---

## Namespace stacks — `namespaces`/`namespace`, `app_names`/`app_name`

Django distinguishes two independent namespace axes:

- **`app_names` / `app_name`** — the *application* namespace (`app_name=` on the `include()`), identifying which app the URLs belong to. Multiple levels are colon-joined: `"blog:articles"`.
- **`namespaces` / `namespace`** — the *instance* namespace (`namespace=` on the `include()`), scoping a particular deployment of that app. Also colon-joined.

Both are stored as ordered lists (outermost → innermost include) so that `reverse()` can walk them correctly for namespace resolution. Empty strings are filtered out (line 59, 61) so the join never produces a spurious leading colon.

---

## The `(func, args, kwargs)` triple — `__getitem__`

```python
def __getitem__(self, index):
    return (self.func, self.args, self.kwargs)[index]
```

This single method makes `ResolverMatch` behave like a 3-tuple. Code that pre-dates the class (or just prefers brevity) can do:

```python
func, args, kwargs = resolve("/some/url/")
```

or index directly with `match[0]`, `match[1]`, `match[2]`. The request handler in `django/core/handlers/base.py` uses this unpacking to extract what it needs before calling the view.

---

## Ancillary fields

- `route` — the raw pattern string (e.g. `"articles/<int:pk>/"`) retained for debugging and `__repr__`.
- `tried` — populated only on a failed match; it records all the patterns that were attempted before raising `Resolver404`, so the error page can report them.

---

## Summary

`ResolverMatch` is essentially a named tuple with namespace logic bolted on. Its core is the `(func, args, kwargs)` triple, exposed both as attributes and via `__getitem__` for backward-compatible unpacking. On top of that it carries two parallel namespace stacks (app vs. instance), a qualified `view_name` for `reverse()`, and enough diagnostic state (`route`, `tried`, the kwargs split) to support error reporting and introspection.
