# transcript: When the router finishes matching an incoming URL, it hands the rest of the request machinery a single object that captures everything known about which view...

  ▸ ToolSearch(select:LSP)
  ▸ LSP(ResolverMatch)
  ▸ LSP(ResolverMatch)
  ▸ Read(/home/bench/repos/django/django/urls/resolvers.py)

💬 `ResolverMatch` lives at `django/urls/resolvers.py:34`. Here is a full accounting of every piece it records.  ---  ## The view callable — `func`  ```python s...

──────── RESULT (success, 40804ms, 5 turns) ────────
`ResolverMatch` lives at `django/urls/resolvers.py:34`. Here is a full accounting of every piece it records.

---

## The view callable — `func`

```python
self.func = func   # line 48
```

Whatever the router resolved to: a plain function-based view, or the `view` wrapper that class-based views produce (i.e. `MyView.as_view()`). The raw object is stored unchanged so callers can invoke it directly.

For naming purposes only, the constructor immediately peeks inside it:

```python
if hasattr(func, "view_class"):   # line 64
    func = func.view_class        # unwrap CBV wrapper → the class itself
```

This local shadow is only used to build `_func_path`; `self.func` always keeps the original callable.

---

## URL-extracted arguments — `args` and `kwargs`

```python
self.args = args      # positional captures (unnamed groups)
self.kwargs = kwargs  # keyword captures (named groups)
```

These are what the URL pattern pulled out of the incoming path. `kwargs` is the merged result of both *captured* named groups and any *extra* kwargs declared on the `path()`/`re_path()` call — the two finer-grained attributes below distinguish the sources.

### Finer-grained split (added later)

```python
self.captured_kwargs = captured_kwargs   # only what the pattern matched
self.extra_kwargs    = extra_kwargs      # only what was declared in path(..., kwargs={})
```

These let introspection code (e.g. `reverse()` helpers or admin link builders) tell the difference between a dynamic segment and a static default.

---

## Naming — `url_name`, `view_name`, and `_func_path`

```python
self.url_name = url_name   # line 51 — the bare `name=` given to path()
```

`url_name` is `None` when the pattern was defined without a name.

```python
# line 70–71
self._func_path = func.__module__ + "." + func.__name__   # FBV
# or for CBV without __name__:
self._func_path = func.__class__.__module__ + "." + func.__class__.__name__
```

`_func_path` is a dotted import string built from the callable itself — the fallback identity when no `name=` was supplied.

```python
view_path = url_name or self._func_path           # line 73
self.view_name = ":".join([*self.namespaces, view_path])  # line 74
```

`view_name` is the fully-qualified name you'd pass to `reverse()`: namespace segments colon-joined with the bare name (or the dotted path if unnamed).

---

## Namespacing — `namespaces`/`namespace` and `app_names`/`app_name`

Django's `include()` supports two orthogonal namespace concepts:

| Attribute | Meaning |
|---|---|
| `app_names` | List of *application* namespaces accumulated while traversing nested `include()` calls — identifies the app regardless of deployment |
| `app_name` | `":"` join of `app_names` — the canonical app identity |
| `namespaces` | List of *instance* namespaces — identifies this particular mount of the app |
| `namespace` | `":"` join of `namespaces` — used for `reverse()` disambiguation |

Empty strings are filtered out at construction time (line 59–62) so neither list ever contains a blank segment.

---

## Pattern metadata

```python
self.route = route   # line 52 — the raw pattern string, e.g. "articles/<int:pk>/"
self.tried = tried   # line 53 — patterns tried before this match (populated on 404)
```

`route` lets you inspect what template was matched. `tried` is populated by the resolver when building a 404 response to report which patterns were attempted.

---

## The (view, args, kwargs) triple — `__getitem__`

```python
def __getitem__(self, index):           # line 76–77
    return (self.func, self.args, self.kwargs)[index]
```

This makes a `ResolverMatch` subscriptable as a 3-tuple. Code written before `ResolverMatch` was introduced could do:

```python
view, args, kwargs = resolve(path)
```

and it still works unchanged. The three-element tuple view of the object is the contract that the request handler ultimately consumes when it calls the view.

---

## Summary picture

```
ResolverMatch
├── func              ← the callable to invoke
├── args              ← positional URL captures
├── kwargs            ← keyword URL captures (captured + extra, merged)
├── captured_kwargs   ← only pattern-matched kwargs
├── extra_kwargs      ← only path(..., kwargs={...}) extras
├── url_name          ← bare name= from path()
├── view_name         ← namespace:...:name (ready for reverse())
├── _func_path        ← dotted module.class/func string
├── app_names / app_name     ← application namespace chain
├── namespaces / namespace   ← instance namespace chain
├── route             ← the matched pattern string
└── tried             ← patterns attempted before this one (for 404s)
```

`__getitem__` makes the whole object unpackable as `(func, args, kwargs)`, which is how Django's core request handler (`BaseHandler.resolve_request`) pulls out what it needs before dispatching to the view.
