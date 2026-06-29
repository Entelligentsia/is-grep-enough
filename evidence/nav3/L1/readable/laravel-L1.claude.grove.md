# transcript: I'm trying to reason about what Laravel actually carries around for a single incoming HTTP request — the object that represents one request as it moves throu...


💬 Let me load grove and outline the Request class to get a precise structural view.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source)
  ▸ mcp__grove__outline({"file":"src/Illuminate/Http/Request.php","detail":1})

💬 Now let me read the key fields and the most important methods in parallel.
  ▸ mcp__grove__source({"file":"src/Illuminate/Http/Request.php","name":"json"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#getInputSource@480"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#user@669"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#route@681"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#getAcceptableContentTypes@370"})

💬 Let me get the `json()` method body, the resolver getters, the field docblocks, and the `createFrom` method.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#json@462"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#getUserResolver@729"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#getRouteResolver@754"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#createFrom@496"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#capture@78"})

💬 Let me read the class header and trait use declarations, and also check which traits the Request mixes in.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Request.php)

💬 Let me quickly check how `convertedFiles` is used in `filterFiles` and also get the `InteractsWithInput` trait outline.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Http/Request.php#filterFiles@573"})
  ▸ mcp__grove__outline({"file":"src/Illuminate/Http/Concerns/InteractsWithInput.php","detail":0})
  ▸ mcp__grove__source({"file":"src/Illuminate/Http/Concerns/InteractsWithInput.php","name":"convertUploadedFiles"})
  ▸ mcp__grove__source({"file":"src/Illuminate/Http/Concerns/InteractsWithInput.php","name":"allFiles"})

💬 Now I have everything needed. Here's a precise walkthrough of what the Laravel `Request` object carries beyond the inherited Symfony bags.  ---  ## The five ...

──────── RESULT (success, 99226ms, 18 turns) ────────
Now I have everything needed. Here's a precise walkthrough of what the Laravel `Request` object carries beyond the inherited Symfony bags.

---

## The five fields Laravel adds on top of Symfony

`Illuminate\Http\Request` (`src/Illuminate/Http/Request.php:29`) extends `SymfonyRequest`, which already owns `$query`, `$request`, `$files`, `$cookies`, `$headers`, and `$server` as `ParameterBag`/`InputBag` instances. Laravel grafts exactly five properties on top:

```
$json             line 43   — lazy InputBag for a decoded JSON body
$convertedFiles   line 50   — lazy array of Laravel-wrapped UploadedFile instances
$userResolver     line 57   — Closure that resolves the authenticated user
$routeResolver    line 64   — Closure that returns the matched Route
$cachedAcceptHeader line 71 — raw Accept header string for cache invalidation
```

---

## JSON body vs. form vs. query: `getInputSource` is the switch

```php
// src/Illuminate/Http/Request.php:480
protected function getInputSource()
{
    if ($this->isJson()) {
        return $this->json();
    }
    return in_array($this->getRealMethod(), ['GET', 'HEAD']) ? $this->query : $this->request;
}
```

Everything in `InteractsWithInput` — `input()`, `all()`, `post()` — routes through this method. So from the caller's perspective there's one unified input surface, but internally three completely separate bags feed it:

| Condition | Source bag |
|---|---|
| `Content-Type: application/json` | `$json` (Laravel's own field) |
| GET or HEAD | `$query` (Symfony's query string bag) |
| POST/PATCH/PUT form body | `$request` (Symfony's body bag) |

`$json` is populated lazily by `json()` (line 462) on first access:

```php
$this->json = new InputBag((array) json_decode($this->getContent() ?: '[]', true));
```

It reads the raw body string via Symfony's `getContent()`, decodes it once, and stores the result as an `InputBag`. Subsequent calls just return the cached bag. You can also manually inject a pre-decoded bag with `setJson()` (line 717) — `createFrom()` uses this when cloning a request so it doesn't re-decode.

---

## The user resolver: a deferred closure, not a stored user

```php
// line 57
protected $userResolver;  // starts null

// line 669
public function user($guard = null)
{
    return call_user_func($this->getUserResolver(), $guard);
}

// line 729
public function getUserResolver()
{
    return $this->userResolver ?: function () { /* returns null */ };
}
```

The auth system (via middleware or a service provider) calls `setUserResolver(Closure $callback)` (line 742) and wires in a closure that captures whatever guard-aware auth logic it needs. The Request object never holds the authenticated user directly — it holds the *recipe* for resolving one. Calling `$request->user()` dispatches that closure fresh each time, passing the guard name through. Until a resolver is registered, `getUserResolver()` returns a no-op that returns `null`.

---

## The route resolver: same pattern, different payload

```php
// line 64
protected $routeResolver;  // starts null

// line 681
public function route($param = null, $default = null)
{
    $route = call_user_func($this->getRouteResolver());

    if (is_null($route) || is_null($param)) {
        return $route;
    }
    return $route->parameter($param, $default);
}
```

The Router calls `setRouteResolver(Closure $callback)` (line 767) after matching completes. The closure returns the matched `Route` instance. `route()` with no argument gives you the whole Route; with a name it calls `$route->parameter($param, $default)` to extract one URI segment. Before routing has run the resolver returns `null`, which is why `routeIs()` guards itself: it bails out if `route()` returns null.

---

## The `Accept` header cache: invalidation, not storage

```php
// line 370
public function getAcceptableContentTypes(): array
{
    $currentAcceptHeader = $this->headers->get('Accept');

    if ($this->cachedAcceptHeader !== $currentAcceptHeader) {
        $this->acceptableContentTypes = null;   // flush Symfony's cache
        $this->cachedAcceptHeader = $currentAcceptHeader;
    }

    return parent::getAcceptableContentTypes();
}
```

Symfony parses the `Accept` header once and stores the result in `$this->acceptableContentTypes` (on the parent). The problem is that `headers->replace()` can swap in a different `Accept` value mid-request (which happens in `createFrom` and during tests). Symfony has no hook for that, so its cached parse goes stale. Laravel's override stores the raw header string it last parsed against; if the string has changed it nullifies `$acceptableContentTypes` to force Symfony to re-parse before delegating to `parent::`. It's a cache-busting sentinel, not the parsed content itself.

---

## Converted files: lazy re-wrapping of Symfony UploadedFile

```php
// InteractsWithInput.php:183
public function allFiles()
{
    $files = $this->files->all();              // Symfony UploadedFile instances
    return $this->convertedFiles ??= $this->convertUploadedFiles($files);
}
```

`$this->files` (Symfony) holds raw `Symfony\Component\HttpFoundation\UploadedFile` objects. `$convertedFiles` is a parallel array, populated once on first call to `allFiles()`, where every Symfony file is re-wrapped by `Illuminate\Http\UploadedFile::createFromBase()`. Laravel's wrapper adds `store()`, `storeAs()`, `hashName()`, and other filesystem-aware methods. The `??=` ensures this only happens once per request lifetime.

---

## Lifecycle summary

1. `Request::capture()` (line 78) calls `SymfonyRequest::createFromGlobals()` then `createFromBase()` — all five Laravel fields are `null` at this point.
2. `createFrom()` (line 496) — used when promoting a Symfony request to a Laravel one — manually copies query/body/cookies/files/headers, then calls `setJson()`, `setLaravelSession()`, `setUserResolver()`, and `setRouteResolver()` to preserve any already-resolved state.
3. The Router populates `$routeResolver` after matching.
4. Auth middleware (or `Auth::setRequest()`) populates `$userResolver`.
5. The JSON bag, converted files, and accept-header cache are all allocated lazily on first read.
