# django · L3 · baseline — readable transcript

> baseline — text search (bash + coreutils), over **django** (python) @ `7903ee10b`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `baseline` — text search (bash + coreutils) |
| repo · rung | django (python) · L3 |
| pinned source | `7903ee10bce75e9fab36e93bb77b3cb9fbf2630d` |
| status | completed |
| engagement | `bash_calls = 1` (gate: > 0 → ✓ used its capability) |
| turns | 7 |
| wall clock | 70 s |
| context (peak) | 151,929 tokens |
| cost (billed) | $0.1705 |
| &nbsp;&nbsp;↳ token split | in 4,313 · out 3,286 · cache-create 11,105 · cache-read 136,511 |
| tool calls | 6 (Read×5, Bash×1) |
| evidence | `evidence/nav3/L3/raw/django-L3.claude.baseline.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens to an incoming HTTP request from the moment the WSGI server hands it to Django until the matching view callable is actually invoked. I'm interested in how the request object gets built and pushed into the middleware stack, how it reaches the inner handler that turns a URL into a view, how the request path is resolved into a view plus the arguments to pass it, and how control is finally handed off to that view. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me read the relevant source files to give you a code-grounded walkthrough.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/core/handlers/wsgi.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/core/handlers/base.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/urls/resolvers.py)`
&nbsp;&nbsp;▸ `Bash(grep -n "def resolve" /home/bench/repos/django/django/urls/resolvers.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/urls/resolvers.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/urls/resolvers.py)`

💬 Now I have everything I need. Here's the complete sequence, keyed to the exact source locations.

---

## Django WSGI request lifecycle, end to end

### 1. WSGI server calls `WSGIHandler.__call__`
`django/core/handlers/wsgi.py:120`

The WSGI server calls `WSGIHandler` as a callable, passing the standard `(environ, start_response)` pair. Three things happen immediately before anything else:

- `set_script_prefix(get_script_name(environ))` — stores `SCRIPT_NAME` in a thread-local so `reverse()` can prefix URLs correctly.
- `signals.request_started.send(...)` — fires the `request_started` signal (used by, e.g., the database connection opener).
- `request = self.request_class(environ)` — constructs the `WSGIRequest`.

### 2. `WSGIRequest.__init__` builds the request object
`django/core/handlers/wsgi.py:57`

`WSGIRequest` subclasses `HttpRequest`. The constructor does only the cheap work:

- Decodes `PATH_INFO` and `SCRIPT_NAME` from ISO-8859-1 bytes (WSGI spec) back to UTF-8 via `get_path_info` / `get_script_name`.
- Sets `self.path` (full path including script name) and `self.path_info` (the part after the script prefix).
- Copies the whole `environ` dict into `self.META`.
- Sets `self.method`.
- Wraps `wsgi.input` in `LimitedStream` (capped at `CONTENT_LENGTH` bytes) and stores it as `self._stream` — the body is **not** read yet.
- Sets `self.resolver_match = None` (filled later during URL resolution).

`GET`, `COOKIES`, `POST`, and `FILES` are all lazy (`@cached_property` or `property` delegating to `_load_post_and_files`) — none of them parse anything until first access.

### 3. `WSGIHandler.__call__` hands the request to `get_response`
`django/core/handlers/wsgi.py:124` → `django/core/handlers/base.py:138`

```python
response = self.get_response(request)
```

`BaseHandler.get_response` does two things then steps aside:

```python
set_urlconf(settings.ROOT_URLCONF)   # establishes thread-local URL config
response = self._middleware_chain(request)
```

`_middleware_chain` is the outermost callable of the middleware stack, assembled at startup by `load_middleware`.

### 4. The middleware chain (assembled at startup by `load_middleware`)
`django/core/handlers/base.py:27`

`load_middleware` is called once in `WSGIHandler.__init__`. It iterates `settings.MIDDLEWARE` **in reverse** so that the first middleware listed ends up outermost. For each middleware class it:

1. Instantiates it with the next callable in the chain as `get_response`.
2. Side-loads `process_view`, `process_template_response`, and `process_exception` hooks into three separate lists (`_view_middleware`, `_template_response_middleware`, `_exception_middleware`) — these are called explicitly later, not through the chain.
3. Wraps each layer in `convert_exception_to_response` (from `handlers/exception.py`) so that any unhandled exception becomes a proper HTTP error response.

The innermost callable in the chain is `_get_response` (the actual view dispatcher), also wrapped in `convert_exception_to_response`. So the chain looks like:

```
convert(mw1) → convert(mw2) → … → convert(mwN) → convert(_get_response)
```

Each middleware's `__call__` typically calls `self.get_response(request)` to pass control inward.

### 5. `_get_response` — the inner handler
`django/core/handlers/base.py:176`

Once the request has passed through every middleware's pre-processing, it arrives here. This is where URL resolution, view middleware, and view dispatch happen.

### 6. URL resolution — `resolve_request`
`django/core/handlers/base.py:302`

```python
callback, callback_args, callback_kwargs = self.resolve_request(request)
```

`resolve_request` does:

1. Checks if the middleware stack attached a `request.urlconf` attribute (any middleware can override the URL config per-request). If so, uses that; otherwise falls back to the global `ROOT_URLCONF`.
2. Calls `get_resolver(urlconf)` — this returns a **cached** `URLResolver` instance (`@functools.cache` on `_get_cached_resolver` at `resolvers.py:115`), so the URL tree is only parsed once per process.
3. Calls `resolver.resolve(request.path_info)` and stores the result as `request.resolver_match`.

`resolve_request` then returns the `ResolverMatch`, which supports `__getitem__` unpacking into `(func, args, kwargs)`.

### 7. `URLResolver.resolve` — walking the URL tree
`django/urls/resolvers.py:670`

The root resolver's pattern is `r"^/"`. It matches the leading slash off `path_info`, then iterates `self.url_patterns` (the list from the `urlpatterns` variable in the root URLconf — loaded lazily via `urlconf_module` at first access).

For each entry in `url_patterns`, which is either a `URLPattern` (a leaf) or a nested `URLResolver` (an `include()`):

- **`URLPattern.resolve`** (`resolvers.py:471`): runs `self.pattern.match(path)`. For `path()` routes this uses a `RoutePattern` that calls converters on each captured segment; for `re_path()` it uses a `RegexPattern` that applies the compiled regex. On a match it immediately returns a `ResolverMatch(self.callback, args, kwargs, …)`.
- **Nested `URLResolver.resolve`**: recursively strips its own prefix from the path, then repeats the inner loop.

The first match wins. If nothing matches, `Resolver404` propagates up.

The `ResolverMatch` returned carries:
- `func` — the view callable (already imported; stored as `URLPattern.callback` after being resolved via `get_callable` at pattern registration time).
- `args` / `kwargs` — positional and keyword captures from the URL pattern.
- `url_name`, `app_names`, `namespaces`, `route` — for `reverse()` and debugging.

`request.resolver_match` is set to this object.

### 8. View middleware hooks
`django/core/handlers/base.py:186`

Before calling the view, `_get_response` gives each `process_view` hook a chance to intercept:

```python
for middleware_method in self._view_middleware:
    response = middleware_method(request, callback, callback_args, callback_kwargs)
    if response:
        break
```

The `_view_middleware` list is in MIDDLEWARE order (outermost first — they were `insert(0, …)` during `load_middleware`). Any hook returning a non-`None` response short-circuits the view entirely.

### 9. Atomic wrapping and async adaptation
`django/core/handlers/base.py:194`

```python
wrapped_callback = self.make_view_atomic(callback)
```

`make_view_atomic` (`base.py:347`) checks every database alias for `ATOMIC_REQUESTS = True` and wraps the view in `transaction.atomic(using=alias)` if needed. Async views can't use this (raises `RuntimeError`).

If the view is an `async def` function and we're in the sync path, it's additionally wrapped with `async_to_sync` so it runs in its own event loop.

### 10. View invocation
`django/core/handlers/base.py:199`

```python
response = wrapped_callback(request, *callback_args, **callback_kwargs)
```

This is the actual call. The view receives the fully-built `WSGIRequest` object plus whatever positional and keyword arguments the URL pattern captured. From this point on, control belongs to application code.

---

### Summary diagram

```
WSGI server
    │  (environ, start_response)
    ▼
WSGIHandler.__call__                  wsgi.py:120
    set_script_prefix()
    request_started.send()
    WSGIRequest(environ)              wsgi.py:57   ← lazy body, lazy GET/POST/COOKIES
    │
    ▼
BaseHandler.get_response              base.py:138
    set_urlconf(ROOT_URLCONF)
    │
    ▼
_middleware_chain(request)            built by load_middleware (base.py:27)
    mw1.__call__(request)
      mw2.__call__(request)
        …
          mwN.__call__(request)
            │
            ▼
          _get_response(request)      base.py:176
              resolve_request()       base.py:302
                URLResolver.resolve() resolvers.py:670  ← walks url_patterns
                  URLPattern.resolve()  resolvers.py:471 ← pattern.match() + callback
                request.resolver_match = ResolverMatch(func, args, kwargs)
              │
              ▼
              process_view hooks      base.py:186   (may short-circuit)
              make_view_atomic()      base.py:194
              │
              ▼
              view(request, *args, **kwargs)   ← your code
```

A few subtleties worth noting:

- **The URL tree is cached globally** (`@functools.cache` on `_get_cached_resolver`), so the import and compilation of all URL patterns happens once per process, not per request.
- **`path_info` vs `path`**: resolution uses `request.path_info` (the part after `SCRIPT_NAME`), not `request.path`, so that mounted sub-apps work correctly under a URL prefix.
- **`process_view` is separate from the middleware chain**: regular middleware `__call__` wraps the whole response; `process_view` runs only after URL resolution and only before view dispatch, giving it access to the resolved callback and its arguments.
- **Exception handling is layered**: `convert_exception_to_response` wraps every link in the chain, but `process_exception` hooks (in `_exception_middleware`) are called explicitly inside `_get_response` before the exception propagates outward.


## Final answer

_Result event — success, 70 s, 7 turns._

Now I have everything I need. Here's the complete sequence, keyed to the exact source locations.

---

## Django WSGI request lifecycle, end to end

### 1. WSGI server calls `WSGIHandler.__call__`
`django/core/handlers/wsgi.py:120`

The WSGI server calls `WSGIHandler` as a callable, passing the standard `(environ, start_response)` pair. Three things happen immediately before anything else:

- `set_script_prefix(get_script_name(environ))` — stores `SCRIPT_NAME` in a thread-local so `reverse()` can prefix URLs correctly.
- `signals.request_started.send(...)` — fires the `request_started` signal (used by, e.g., the database connection opener).
- `request = self.request_class(environ)` — constructs the `WSGIRequest`.

### 2. `WSGIRequest.__init__` builds the request object
`django/core/handlers/wsgi.py:57`

`WSGIRequest` subclasses `HttpRequest`. The constructor does only the cheap work:

- Decodes `PATH_INFO` and `SCRIPT_NAME` from ISO-8859-1 bytes (WSGI spec) back to UTF-8 via `get_path_info` / `get_script_name`.
- Sets `self.path` (full path including script name) and `self.path_info` (the part after the script prefix).
- Copies the whole `environ` dict into `self.META`.
- Sets `self.method`.
- Wraps `wsgi.input` in `LimitedStream` (capped at `CONTENT_LENGTH` bytes) and stores it as `self._stream` — the body is **not** read yet.
- Sets `self.resolver_match = None` (filled later during URL resolution).

`GET`, `COOKIES`, `POST`, and `FILES` are all lazy (`@cached_property` or `property` delegating to `_load_post_and_files`) — none of them parse anything until first access.

### 3. `WSGIHandler.__call__` hands the request to `get_response`
`django/core/handlers/wsgi.py:124` → `django/core/handlers/base.py:138`

```python
response = self.get_response(request)
```

`BaseHandler.get_response` does two things then steps aside:

```python
set_urlconf(settings.ROOT_URLCONF)   # establishes thread-local URL config
response = self._middleware_chain(request)
```

`_middleware_chain` is the outermost callable of the middleware stack, assembled at startup by `load_middleware`.

### 4. The middleware chain (assembled at startup by `load_middleware`)
`django/core/handlers/base.py:27`

`load_middleware` is called once in `WSGIHandler.__init__`. It iterates `settings.MIDDLEWARE` **in reverse** so that the first middleware listed ends up outermost. For each middleware class it:

1. Instantiates it with the next callable in the chain as `get_response`.
2. Side-loads `process_view`, `process_template_response`, and `process_exception` hooks into three separate lists (`_view_middleware`, `_template_response_middleware`, `_exception_middleware`) — these are called explicitly later, not through the chain.
3. Wraps each layer in `convert_exception_to_response` (from `handlers/exception.py`) so that any unhandled exception becomes a proper HTTP error response.

The innermost callable in the chain is `_get_response` (the actual view dispatcher), also wrapped in `convert_exception_to_response`. So the chain looks like:

```
convert(mw1) → convert(mw2) → … → convert(mwN) → convert(_get_response)
```

Each middleware's `__call__` typically calls `self.get_response(request)` to pass control inward.

### 5. `_get_response` — the inner handler
`django/core/handlers/base.py:176`

Once the request has passed through every middleware's pre-processing, it arrives here. This is where URL resolution, view middleware, and view dispatch happen.

### 6. URL resolution — `resolve_request`
`django/core/handlers/base.py:302`

```python
callback, callback_args, callback_kwargs = self.resolve_request(request)
```

`resolve_request` does:

1. Checks if the middleware stack attached a `request.urlconf` attribute (any middleware can override the URL config per-request). If so, uses that; otherwise falls back to the global `ROOT_URLCONF`.
2. Calls `get_resolver(urlconf)` — this returns a **cached** `URLResolver` instance (`@functools.cache` on `_get_cached_resolver` at `resolvers.py:115`), so the URL tree is only parsed once per process.
3. Calls `resolver.resolve(request.path_info)` and stores the result as `request.resolver_match`.

`resolve_request` then returns the `ResolverMatch`, which supports `__getitem__` unpacking into `(func, args, kwargs)`.

### 7. `URLResolver.resolve` — walking the URL tree
`django/urls/resolvers.py:670`

The root resolver's pattern is `r"^/"`. It matches the leading slash off `path_info`, then iterates `self.url_patterns` (the list from the `urlpatterns` variable in the root URLconf — loaded lazily via `urlconf_module` at first access).

For each entry in `url_patterns`, which is either a `URLPattern` (a leaf) or a nested `URLResolver` (an `include()`):

- **`URLPattern.resolve`** (`resolvers.py:471`): runs `self.pattern.match(path)`. For `path()` routes this uses a `RoutePattern` that calls converters on each captured segment; for `re_path()` it uses a `RegexPattern` that applies the compiled regex. On a match it immediately returns a `ResolverMatch(self.callback, args, kwargs, …)`.
- **Nested `URLResolver.resolve`**: recursively strips its own prefix from the path, then repeats the inner loop.

The first match wins. If nothing matches, `Resolver404` propagates up.

The `ResolverMatch` returned carries:
- `func` — the view callable (already imported; stored as `URLPattern.callback` after being resolved via `get_callable` at pattern registration time).
- `args` / `kwargs` — positional and keyword captures from the URL pattern.
- `url_name`, `app_names`, `namespaces`, `route` — for `reverse()` and debugging.

`request.resolver_match` is set to this object.

### 8. View middleware hooks
`django/core/handlers/base.py:186`

Before calling the view, `_get_response` gives each `process_view` hook a chance to intercept:

```python
for middleware_method in self._view_middleware:
    response = middleware_method(request, callback, callback_args, callback_kwargs)
    if response:
        break
```

The `_view_middleware` list is in MIDDLEWARE order (outermost first — they were `insert(0, …)` during `load_middleware`). Any hook returning a non-`None` response short-circuits the view entirely.

### 9. Atomic wrapping and async adaptation
`django/core/handlers/base.py:194`

```python
wrapped_callback = self.make_view_atomic(callback)
```

`make_view_atomic` (`base.py:347`) checks every database alias for `ATOMIC_REQUESTS = True` and wraps the view in `transaction.atomic(using=alias)` if needed. Async views can't use this (raises `RuntimeError`).

If the view is an `async def` function and we're in the sync path, it's additionally wrapped with `async_to_sync` so it runs in its own event loop.

### 10. View invocation
`django/core/handlers/base.py:199`

```python
response = wrapped_callback(request, *callback_args, **callback_kwargs)
```

This is the actual call. The view receives the fully-built `WSGIRequest` object plus whatever positional and keyword arguments the URL pattern captured. From this point on, control belongs to application code.

---

### Summary diagram

```
WSGI server
    │  (environ, start_response)
    ▼
WSGIHandler.__call__                  wsgi.py:120
    set_script_prefix()
    request_started.send()
    WSGIRequest(environ)              wsgi.py:57   ← lazy body, lazy GET/POST/COOKIES
    │
    ▼
BaseHandler.get_response              base.py:138
    set_urlconf(ROOT_URLCONF)
    │
    ▼
_middleware_chain(request)            built by load_middleware (base.py:27)
    mw1.__call__(request)
      mw2.__call__(request)
        …
          mwN.__call__(request)
            │
            ▼
          _get_response(request)      base.py:176
              resolve_request()       base.py:302
                URLResolver.resolve() resolvers.py:670  ← walks url_patterns
                  URLPattern.resolve()  resolvers.py:471 ← pattern.match() + callback
                request.resolver_match = ResolverMatch(func, args, kwargs)
              │
              ▼
              process_view hooks      base.py:186   (may short-circuit)
              make_view_atomic()      base.py:194
              │
              ▼
              view(request, *args, **kwargs)   ← your code
```

A few subtleties worth noting:

- **The URL tree is cached globally** (`@functools.cache` on `_get_cached_resolver`), so the import and compilation of all URL patterns happens once per process, not per request.
- **`path_info` vs `path`**: resolution uses `request.path_info` (the part after `SCRIPT_NAME`), not `request.path`, so that mounted sub-apps work correctly under a URL prefix.
- **`process_view` is separate from the middleware chain**: regular middleware `__call__` wraps the whole response; `process_view` runs only after URL resolution and only before view dispatch, giving it access to the resolved callback and its arguments.
- **Exception handling is layered**: `convert_exception_to_response` wraps every link in the chain, but `process_exception` hooks (in `_exception_middleware`) are called explicitly inside `_get_response` before the exception propagates outward.

