# transcript: When the router finishes matching an incoming URL, it hands the rest of the request machinery a single object that captures everything known about which view...

  ▸ ToolSearch(select:LSP)
  ▸ LSP(ResolverMatch)
  ▸ Bash(find /home/bench/repos/django/django/urls -type f -name "*.py")
  ▸ LSP(ResolverMatch)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/django/django/urls/resolvers.py","line":1,"character":1})

💬 Now let me read the `ResolverMatch` class itself.
  ▸ Read(/home/bench/repos/django/django/urls/resolvers.py)

💬 Let me also look at how `URLPattern.resolve()` constructs a `ResolverMatch` to understand how `captured_kwargs` and `extra_kwargs` are populated.
  ▸ Read(/home/bench/repos/django/django/urls/resolvers.py)
  ▸ Read(/home/bench/repos/django/django/urls/resolvers.py)

💬 Now I have the full picture. Here's a thorough walkthrough of `ResolverMatch` (`django/urls/resolvers.py:34`).  ---  ## `ResolverMatch` — the match-result ob...

──────── RESULT (success, 70261ms, 9 turns) ────────
Now I have the full picture. Here's a thorough walkthrough of `ResolverMatch` (`django/urls/resolvers.py:34`).

---

## `ResolverMatch` — the match-result object

### The view callable: `func`

`self.func` holds the raw callable handed to `URLPattern` — a function-based view, or the `as_view()` bound method for a class-based view. It is **not** unwrapped; you get exactly what was registered in `urlpatterns`. Two internal derived pieces are computed from it immediately in `__init__`:

- **`_func_path`** (line 64–71): a dotted-module string like `"myapp.views.ArticleDetailView"`. For a CBV whose callable has a `view_class` attribute, the class itself is used for the name; for anything with a `__name__`, the function's module and name are used; otherwise (a generic callable instance) it falls back to the instance's class.
- **`view_name`** (line 73–74): the full namespaced name used by `reverse()`. It is `":".join([*self.namespaces, url_name or _func_path])`, e.g. `"admin:myapp:article-detail"`. If no `url_name` was given, the dotted path fills in.

---

### URL-extracted arguments: `args`, `kwargs`, `captured_kwargs`, `extra_kwargs`

These four fields record where each argument came from:

| Field | Contents |
|---|---|
| `captured_kwargs` | Only what the URL pattern's regex/path actually captured by name from the URL string |
| `extra_kwargs` | The `kwargs` dict passed to `path()`/`re_path()` as defaults, merged up through nested includes |
| `kwargs` | `{**captured_kwargs, **extra_kwargs}` — the merged dict a view receives |
| `args` | Positional (unnamed) captures, only populated when there are no named groups |

`URLPattern.resolve()` (line 471–485) makes the split explicit:
```python
kwargs = {**captured_kwargs, **self.default_args}
return ResolverMatch(self.callback, args, kwargs, ...,
                     captured_kwargs=captured_kwargs,
                     extra_kwargs=self.default_args)
```
When a `URLResolver` wraps a match (line 700–714), it layers in its own `default_kwargs` on top, accumulating both fields outward through the nesting chain.

---

### Naming and namespacing

Three parallel pairs handle the identity of the matched URL:

**`url_name`** — the plain unqualified name from `path(..., name="article-detail")`. A single string, or `None`.

**`namespaces` / `namespace`**
- `namespaces` is a *list* built by each `URLResolver` prepending its own `namespace` string as the match bubbles up (line 705–706: `[self.namespace, *sub_match.namespaces]`).
- `namespace` is those joined with `":"` — the instance namespace chain (e.g., `"polls:v2"`).

**`app_names` / `app_name`**
- Same structure but carries the *application* namespace (`app_name` on the include), which identifies the app regardless of the instance namespace.
- Useful when you have two mounted instances of the same app and need to distinguish "which app" from "which instance".

Empty strings in either list are filtered out in `__init__` (line 59–62) so sparse nesting doesn't leave gaps.

---

### The `(view, args, kwargs)` triple via `__getitem__`

```python
def __getitem__(self, index):
    return (self.func, self.args, self.kwargs)[index]
```

This lets consumers index the object as if it were a three-tuple. Django's own request handler does exactly that:

```python
callback, callback_args, callback_kwargs = resolver_match
```

The object is a full-fidelity record but presents as the minimal triple any caller needs.

---

### Diagnostic/debug fields

- **`route`**: the joined route string (e.g., `"articles/<int:pk>/"`) — the full pattern from outer + inner resolver, assembled by `_join_route`. Used in `__repr__` and 404 debug pages.
- **`tried`**: the list of all URL patterns attempted before this one matched (or before failure), passed through from `URLResolver.resolve()`. Powers the "tried these patterns" section of Django's 404 debug view.

---

### What's intentionally excluded

`ResolverMatch` is **not picklable** — `__reduce_ex__` raises `PicklingError` (line 104–105). It captures live Python objects (the view callable) that can't safely serialize, so this is blocked explicitly rather than silently broken.

---

### Summary map

```
ResolverMatch
├── func                   # the view callable (raw, as registered)
├── _func_path             # "module.ClassName" for repr/view_name
│
├── args                   # positional URL captures (tuple)
├── kwargs                 # merged: captured + defaults (dict)
├── captured_kwargs        # URL captures only
├── extra_kwargs           # path()/include() defaults only
│
├── url_name               # bare name ("article-detail")
├── namespaces / namespace # instance namespace list + joined string
├── app_names / app_name   # application namespace list + joined string
├── view_name              # "ns1:ns2:url_name" — used by reverse()
│
├── route                  # full joined pattern string
├── tried                  # patterns attempted before this match
│
└── __getitem__            # makes it unpackable as (func, args, kwargs)
```

The design separates *what was captured from the URL* (`captured_kwargs`) from *what was injected by the URL conf* (`extra_kwargs`), while `kwargs` hands their union to the view. The namespace lists are built outward through the resolver chain so a single object carries the complete namespacing context without the caller needing to re-walk the resolver tree.
