# transcript: When the router finishes matching an incoming URL, it hands the rest of the request machinery a single object that captures everything known about which view...


💬 Let me load grove and look up `ResolverMatch` structurally.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__outline)
  ▸ mcp__grove__symbols({"dir":"django/urls","name":"ResolverMatch"})
  ▸ mcp__grove__source({"id":"python:django/urls/resolvers.py#ResolverMatch@34"})

💬 Here is a full walkthrough of `ResolverMatch` (`django/urls/resolvers.py:34`).  ---  ## The view callable — `func`  `self.func` is stored exactly as the reso...

──────── RESULT (success, 63059ms, 4 turns) ────────
Here is a full walkthrough of `ResolverMatch` (`django/urls/resolvers.py:34`).

---

## The view callable — `func`

`self.func` is stored exactly as the resolver found it: either a plain function or, for class-based views, the bound callable returned by `View.as_view()` (a `functools.partial`-wrapped or plain function that closes over `view_class`). The object is not unwrapped; it is what the dispatcher will actually call.

For naming purposes only, `__init__` peeks inside:

```python
if hasattr(func, "view_class"):
    func = func.view_class          # unwrap CBV for path computation
if not hasattr(func, "__name__"):
    self._func_path = func.__class__.__module__ + "." + func.__class__.__name__
else:
    self._func_path = func.__module__ + "." + func.__name__
```

This gives `_func_path` a dotted string like `myapp.views.ArticleDetailView` — used in `__repr__` and as a fallback for `view_name`.

---

## URL arguments — `args` and `kwargs`

- `self.args` — positional captures (from unnamed groups in a regex pattern).
- `self.kwargs` — keyword captures (from named groups / `<converter:name>` path segments).

These are the raw values extracted from the URL, already converted by any registered path converters.

Two finer-grained companions are also stored:

- `self.captured_kwargs` — only the kwargs that actually came from the URL pattern (as opposed to extras injected by the route definition).
- `self.extra_kwargs` — kwargs passed via the optional third element of a `path()`/`include()` tuple, not from any capture group.

The split lets code that cares (e.g. `reverse()`) distinguish "what the user typed" from "what the developer hardwired."

---

## Naming and namespacing

**`url_name`** is the bare `name=` argument to `path()` or `re_path()`, e.g. `"article-detail"`. It has no namespace prefix.

**`app_names` / `app_name`** track the *application* namespace stack (the stable, per-app identifier set on `include()`). Empty strings are filtered out. `app_name` is the colon-joined string of the whole stack.

**`namespaces` / `namespace`** track the *instance* namespace stack (the per-`include` deployment identifier). Same filtering and joining logic.

**`view_name`** combines everything into the string you would pass to `reverse()`:

```python
view_path = url_name or self._func_path
self.view_name = ":".join([*self.namespaces, view_path])
```

So for a URL named `"detail"` nested inside instance namespace `"blog"`, `view_name` becomes `"blog:detail"`.

---

## Diagnostic fields

- `self.route` — the pattern string (`"articles/<int:pk>/"`) that matched. Useful for debugging and in `__repr__`.
- `self.tried` — the list of patterns the resolver attempted before finding a match (populated on 404 paths, used to build informative error pages).

---

## The (func, args, kwargs) triple

`__getitem__` makes the object subscriptable as a 3-tuple:

```python
def __getitem__(self, index):
    return (self.func, self.args, self.kwargs)[index]
```

This is the convenience contract for consumers. Code that only needs to dispatch can do:

```python
func, args, kwargs = match          # unpacking
callback, callback_args, callback_kwargs = match   # named unpacking
```

without caring about any of the naming or diagnostic state. The handler in `django/core/handlers/base.py` uses exactly this pattern — it unpacks the triple and calls `func(*args, **kwargs)` (after middleware wrapping), ignoring everything else on the object.

---

## Pickle guard

`__reduce_ex__` unconditionally raises `PicklingError`. `ResolverMatch` holds a live callable which is not safely serializable; the guard makes the failure explicit rather than silent or corrupted.

---

**In summary:** `ResolverMatch` is a small value object with three concerns — the callable (`func`), the extracted URL arguments (`args`/`kwargs`, with the captured/extra split), and the fully-qualified name (`url_name`, `namespaces`, `app_names`, all composed into `view_name`). The `__getitem__` triple is the primary interface for dispatch; everything else is metadata for naming, reversal, and debugging.
