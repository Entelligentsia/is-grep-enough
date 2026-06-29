# transcript: I want to trace what happens to an incoming HTTP request from the moment the WSGI server hands it to Django until the matching view callable is actually invo...


💬 Let me trace this end to end using the actual source.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__definition)
  ▸ mcp__grove__outline({"file":"django/core/handlers/wsgi.py"})
  ▸ mcp__grove__outline({"file":"django/core/handlers/base.py"})
  ▸ mcp__grove__source({"id":"python:django/core/handlers/wsgi.py#__call__@120"})
  ▸ mcp__grove__source({"id":"python:django/core/handlers/wsgi.py#__init__@57"})
  ▸ mcp__grove__source({"id":"python:django/core/handlers/base.py#load_middleware@27"})
  ▸ mcp__grove__source({"id":"python:django/core/handlers/base.py#get_response@138"})
  ▸ mcp__grove__source({"id":"python:django/core/handlers/base.py#_get_response@176"})
  ▸ mcp__grove__source({"id":"python:django/core/handlers/base.py#resolve_request@302"})

💬 Now let me look at the URL resolver's `resolve` method.
  ▸ mcp__grove__outline({"file":"django/urls/resolvers.py","kind":"class"})
  ▸ mcp__grove__source({"id":"python:django/core/handlers/wsgi.py#__init__@116"})
  ▸ mcp__grove__source({"file":"django/urls/resolvers.py","name":"resolve"})
  ▸ mcp__grove__source({"id":"python:django/urls/resolvers.py#ResolverMatch@34"})
  ▸ mcp__grove__source({"id":"python:django/urls/resolvers.py#resolve@670"})

💬 Now let me check how `RoutePattern.match` does the actual pattern matching:
  ▸ mcp__grove__source({"file":"django/urls/resolvers.py","name":"match"})
  ▸ mcp__grove__source({"id":"python:django/urls/resolvers.py#match@324"})

💬 I have everything needed for a precise end-to-end walkthrough.  ---  ## Django WSGI request lifecycle: WSGI entry to view call  ### 1. The WSGI server calls ...

──────── RESULT (success, 115100ms, 17 turns) ────────
I have everything needed for a precise end-to-end walkthrough.

---

## Django WSGI request lifecycle: WSGI entry to view call

### 1. The WSGI server calls `WSGIHandler.__call__` — `wsgi.py:120`

The WSGI server (gunicorn, uWSGI, Django's dev server) invokes the handler as a callable:

```python
def __call__(self, environ, start_response):
    set_script_prefix(get_script_name(environ))
    signals.request_started.send(sender=self.__class__, environ=environ)
    request = self.request_class(environ)
    response = self.get_response(request)
```

Three things happen before anything else:
- `set_script_prefix` stores the `SCRIPT_NAME` in a thread-local so URL reversal works correctly.
- The `request_started` signal fires (allowing receivers to reset state — e.g. the ORM connection handler uses this).
- A `WSGIRequest` object is constructed from the raw environ dict.

---

### 2. `WSGIRequest.__init__` builds the request object — `wsgi.py:57`

`self.request_class` is `WSGIRequest`, a subclass of `HttpRequest`. Its `__init__` pulls everything it needs from the PEP 3333 `environ` dict:

```python
path_info = get_path_info(environ) or "/"
self.path_info = path_info
self.path = "%s/%s" % (script_name.rstrip("/"), path_info.replace("/", "", 1))
self.META = environ          # the raw dict is .META
self.method = environ["REQUEST_METHOD"].upper()
self._set_content_type_params(environ)
self._stream = LimitedStream(self.environ["wsgi.input"], content_length)
self.resolver_match = None   # filled in later
```

`path_info` is the URL path the router will work on; `path` is the full deployment path. The body isn't read here — `wsgi.input` is wrapped in a `LimitedStream` that enforces `CONTENT_LENGTH` but defers reading until something accesses `.read()`, `.POST`, or `.FILES`.

---

### 3. The middleware chain was already built at startup — `base.py:27`

`WSGIHandler.__init__` called `self.load_middleware()` once when the server started. This is important: the chain is a **pre-built closure chain**, not assembled per request.

`load_middleware` iterates `settings.MIDDLEWARE` **in reverse**, wrapping from the inside out:

```
_get_response                          ← innermost (the real handler)
  └─ wrapped in convert_exception_to_response
      └─ SecurityMiddleware(...)
          └─ SessionMiddleware(...)
              └─ CommonMiddleware(...)   ← outermost = first in MIDDLEWARE list
```

Each middleware is instantiated with the next callable as `get_response`:

```python
get_response = self._get_response
handler = convert_exception_to_response(get_response)
for middleware_path in reversed(settings.MIDDLEWARE):
    mw_instance = middleware(adapted_handler)   # each wraps the previous
    handler = convert_exception_to_response(mw_instance)
```

Three side-channel lists are also populated during this loop:
- `_view_middleware` — middlewares with `process_view`, inserted at index 0 so they run outermost-first.
- `_template_response_middleware` — appended so they run innermost-first.
- `_exception_middleware` — appended, innermost-first.

The final outermost callable is stored as `self._middleware_chain`.

---

### 4. `BaseHandler.get_response` pins the URL conf and enters the chain — `base.py:138`

```python
def get_response(self, request):
    set_urlconf(settings.ROOT_URLCONF)     # thread-local, can be overridden by middleware
    response = self._middleware_chain(request)
```

`set_urlconf` writes the root URL module into a thread-local. This is the default, but middleware (e.g. `LocaleMiddleware`) can set `request.urlconf` to a different module before the resolver runs, and `resolve_request` respects that.

Calling `self._middleware_chain(request)` now cascades through every middleware's `__call__`. Each one runs its request-phase logic, then calls its own `get_response(request)` to pass the request inward. The stack unwinds back with the response.

---

### 5. `BaseHandler._get_response` is the innermost handler — `base.py:176`

Once all middleware have had their say on the request, control reaches `_get_response`, which is the actual view-dispatch core:

```python
def _get_response(self, request):
    response = None
    callback, callback_args, callback_kwargs = self.resolve_request(request)

    # process_view middleware (outermost-first)
    for middleware_method in self._view_middleware:
        response = middleware_method(request, callback, callback_args, callback_kwargs)
        if response:
            break

    if response is None:
        wrapped_callback = self.make_view_atomic(callback)
        if iscoroutinefunction(wrapped_callback):
            wrapped_callback = async_to_sync(wrapped_callback)
        try:
            response = wrapped_callback(request, *callback_args, **callback_kwargs)
        except Exception as e:
            response = self.process_exception_by_middleware(e, request)
            if response is None:
                raise
```

The flow inside here:
1. Resolve the URL to a view callable.
2. Run `process_view` hooks — any middleware can inspect or short-circuit at this point (CSRF enforcement happens here, for example).
3. Optionally wrap the view in a database transaction via `make_view_atomic`.
4. If the view is a coroutine function, wrap it with `async_to_sync` so it runs synchronously.
5. **Call the view.**

---

### 6. `BaseHandler.resolve_request` drives URL resolution — `base.py:302`

```python
def resolve_request(self, request):
    if hasattr(request, "urlconf"):
        urlconf = request.urlconf
        set_urlconf(urlconf)
        resolver = get_resolver(urlconf)
    else:
        resolver = get_resolver()
    resolver_match = resolver.resolve(request.path_info)
    request.resolver_match = resolver_match
    return resolver_match
```

`get_resolver()` returns a cached `URLResolver` rooted at the `ROOT_URLCONF` module (or the per-request override). The result, a `ResolverMatch`, is assigned to `request.resolver_match` — making it available to views and middleware. `ResolverMatch` supports `__getitem__` so it can be unpacked as `(callback, args, kwargs)`.

---

### 7. `URLResolver.resolve` walks the URL tree recursively — `resolvers.py:670`

The root `URLResolver` (whose pattern is typically the empty string `""`) calls itself recursively through the nested `include()` structure:

```python
def resolve(self, path):
    match = self.pattern.match(path)       # strip the prefix this resolver owns
    if match:
        new_path, args, kwargs = match
        for pattern in self.url_patterns:  # try every child
            try:
                sub_match = pattern.resolve(new_path)
            except Resolver404 as e:
                ...
            else:
                if sub_match:
                    # merge kwargs from outer resolver + inner match
                    sub_match_dict = {**kwargs, **self.default_kwargs}
                    sub_match_dict.update(sub_match.kwargs)
                    return ResolverMatch(sub_match.func, sub_match_args, sub_match_dict, ...)
        raise Resolver404({"tried": tried, "path": new_path})
```

Each level strips its own prefix and passes `new_path` down. kwargs accumulate bottom-up — captured groups from nested resolvers are merged into parent kwargs.

---

### 8. `URLPattern.resolve` and `RoutePattern.match` do the leaf matching — `resolvers.py:471` / `resolvers.py:324`

At leaf nodes, `URLPattern.resolve` delegates to its pattern object's `match`:

```python
# URLPattern.resolve
def resolve(self, path):
    match = self.pattern.match(path)
    if match:
        new_path, args, captured_kwargs = match
        kwargs = {**captured_kwargs, **self.default_args}
        return ResolverMatch(self.callback, args, kwargs, ...)
```

`RoutePattern.match` (used by `path()`) handles three cases:
- **With converters** (`<int:pk>`, `<slug:name>`): compiles a regex, captures groups, then calls `converter.to_python()` on each value to get typed Python objects. A `ValueError` from the converter returns `None`, causing this pattern to be skipped.
- **Endpoint without converters**: pure string equality check (`self._route == path`).
- **Prefix without converters**: `path.startswith(route)` with the remainder returned for sub-resolution.

`RegexPattern` (used by `re_path()`) uses `regex.fullmatch` for endpoints and `regex.search` for prefixes, with named groups becoming kwargs and unnamed groups becoming positional args.

---

### 9. `ResolverMatch` carries the result back up — `resolvers.py:34`

```python
class ResolverMatch:
    def __init__(self, func, args, kwargs, url_name=None, ...):
        self.func = func          # the raw view callable
        self.args = args
        self.kwargs = kwargs
        self.url_name = url_name
        self.app_name = ...
        self.namespace = ...

    def __getitem__(self, index):
        return (self.func, self.args, self.kwargs)[index]
```

For a CBV registered as `MyView.as_view()`, `func` is the closure returned by `as_view()`, not the class itself — though `func.view_class` is set so introspection can find the class. For an FBV it's the function directly.

---

### 10. The view is called — `base.py:210`

Back in `_get_response`, assuming no `process_view` middleware short-circuited:

```python
response = wrapped_callback(request, *callback_args, **callback_kwargs)
```

- **FBV**: this is the direct function call, e.g. `my_view(request, pk=42)`.
- **CBV**: this calls the `as_view()` closure, which instantiates the class, sets `self.request`/`self.args`/`self.kwargs`, then calls `self.dispatch(request, *args, **kwargs)`, which routes to `self.get(...)`, `self.post(...)`, etc. based on `request.method`.

---

### Summary of the call chain

```
WSGI server
  → WSGIHandler.__call__          build WSGIRequest, fire request_started signal
      → WSGIRequest.__init__      parse environ → path_info, method, META, LimitedStream
      → BaseHandler.get_response  set thread-local urlconf, enter middleware chain
          → _middleware_chain(request)   cascade through each middleware.__call__
              → BaseHandler._get_response          innermost handler
                  → resolve_request                URL resolution
                      → URLResolver.resolve        recursive tree walk, strip prefixes
                          → URLPattern.resolve     leaf: match + unpack
                              → RoutePattern.match path equality / converter.to_python()
                          → ResolverMatch(func, args, kwargs)
                  → process_view middleware        (CSRF check etc.)
                  → make_view_atomic / async_to_sync
                  → callback(request, *args, **kwargs)   THE VIEW
```

The key design insight is that the middleware chain is a **static closure chain built once at startup**; the URL resolver is a **cached recursive tree** also built once; and `_get_response` is the seam that connects them, sitting at the bottom of the middleware stack and at the top of the resolver call.
