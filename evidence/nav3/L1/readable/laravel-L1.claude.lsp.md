# transcript: I'm trying to reason about what Laravel actually carries around for a single incoming HTTP request — the object that represents one request as it moves throu...


💬 Let me load the LSP tool and locate the Request class first.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(Illuminate\Http\Request)

💬 Good, I have all the line positions. Now let me read the key sections of the file — the properties, then the critical methods.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Request.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Request.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Request.php)

💬 Now let me look at the `getAcceptableContentTypes` override and the `InteractsWithContentTypes` trait.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Request.php)
  ▸ Bash(find /home/bench/repos/laravel/src/Illuminate/Http/Concerns -name "*.php" | sort)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Concerns/InteractsWithContentTypes.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Concerns/InteractsWithInput.php)

💬 Now let me check how `input()` is implemented — specifically how it delegates through `getInputSource()`.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Concerns/InteractsWithInput.php)

💬 I have everything I need. Here's a thorough walkthrough of what the Laravel request object actually carries and why.  ---  ## The inheritance baseline  `Illu...

──────── RESULT (success, 105535ms, 11 turns) ────────
I have everything I need. Here's a thorough walkthrough of what the Laravel request object actually carries and why.

---

## The inheritance baseline

`Illuminate\Http\Request` extends `Symfony\Component\HttpFoundation\Request`, so it inherits Symfony's full set of populated bags before Laravel adds anything:

| Property | Type | What it holds |
|---|---|---|
| `$query` | `InputBag` | Parsed query string (`$_GET`) |
| `$request` | `InputBag` | Parsed form body (`$_POST`) |
| `$attributes` | `ParameterBag` | Internal/custom attributes |
| `$cookies` | `InputBag` | Cookies |
| `$files` | `FileBag` | Raw PHP-uploaded files |
| `$server` | `ServerBag` | `$_SERVER` |
| `$headers` | `HeaderBag` | HTTP headers |
| `$content` | `string\|resource` | Raw body |
| `$acceptableContentTypes` | `array` | Symfony's parsed `Accept` cache |

Laravel then owns five more properties (`src/Illuminate/Http/Request.php:38–71`).

---

## Laravel's five owned properties

### `$json` — the parsed JSON body (line 43)

Declared as `protected $json` (`InputBag|null`). Normally this is **null until first access** — `json()` at line 462 does:

```php
if (! isset($this->json)) {
    $this->json = new InputBag((array) json_decode($this->getContent() ?: '[]', true));
}
```

**There's a critical exception** in `createFromBase()` (line 537), which is the entry point for every real HTTP request. When the incoming `Content-Type` is JSON, Laravel does this eagerly during construction (lines 548–550):

```php
if ($newRequest->isJson()) {
    $newRequest->request->replace($newRequest->json()->all());
    $newRequest->setJson($newRequest->request);
}
```

It parses the JSON, pushes the result into `$request` (the form-body bag), then **points `$json` at that same `InputBag` object**. So for a real JSON request, `$json` and `$request` are the same object — no duplication. A side effect: `->post('key')` (which reads `$request`) will also see JSON keys for any request that came in through `createFromBase()`.

### `$convertedFiles` — the file cache (line 50)

Symfony's `FileBag` holds `Symfony\Component\HttpFoundation\File\UploadedFile`. Laravel's `allFiles()` wraps each one in `Illuminate\Http\UploadedFile` (which adds `store()`, `storeAs()`, etc.), and caches the converted set in `$convertedFiles`. The conversion is lazy and happens once.

### `$userResolver` — the auth callback (line 57)

A `Closure` with signature `fn(?string $guard): mixed`. It is **not set at construction** — the auth middleware installs it via `setUserResolver()` (line 742) during the middleware pipeline. `user($guard)` at line 669 just calls through:

```php
return call_user_func($this->getUserResolver(), $guard);
```

`getUserResolver()` (line 729) returns the stored closure, or a no-op that returns nothing if no auth middleware has run. Nothing about the user is stored on the request itself — the closure closes over the auth manager and only fetches when called.

### `$routeResolver` — the matched route callback (line 64)

Same pattern. The `Router` calls `setRouteResolver()` after matching, passing a closure that returns the matched `Illuminate\Routing\Route` instance. `route()` at line 681 invokes it:

```php
$route = call_user_func($this->getRouteResolver());
```

If `$param` is given, it then calls `$route->parameter($param, $default)` on the result. The route itself is not stored directly on the request — just the resolver. This is also why `__get()` (line 851) can fall back to route parameters after checking input:

```php
return Arr::get($this->all(), $key, fn () => $this->route($key));
```

### `$cachedAcceptHeader` — the header change tracker (line 71)

This one has a subtle purpose. Symfony caches the parsed `Accept` header in `$acceptableContentTypes` for performance. But Laravel allows headers to be mutated mid-request (testing, middleware, `merge()`), so Symfony's cache can go stale. Laravel's override of `getAcceptableContentTypes()` (line 370) compares the live header against `$cachedAcceptHeader`:

```php
if ($this->cachedAcceptHeader !== $currentAcceptHeader) {
    $this->acceptableContentTypes = null;   // force Symfony to re-parse
    $this->cachedAcceptHeader = $currentAcceptHeader;
}
return parent::getAcceptableContentTypes();
```

`$cachedAcceptHeader` is the last-seen raw `Accept` string. When it diverges from what `$headers->get('Accept')` returns now, Symfony's cache is nulled out and will be rebuilt on the parent call.

---

## How the input bags are unified — `getInputSource()`

This is the central dispatch (line 480):

```php
protected function getInputSource()
{
    if ($this->isJson()) {
        return $this->json();
    }
    return in_array($this->getRealMethod(), ['GET', 'HEAD']) ? $this->query : $this->request;
}
```

`isJson()` checks `Content-Type` for `/json` or `+json`. The routing:

- **JSON body** → `$json` InputBag (which, via `createFromBase`, is the same object as `$request`)
- **GET/HEAD** → `$query` (query string only)
- **POST/PUT/PATCH with form body** → `$request` (form-encoded body)

`input()` in `InteractsWithInput` (line 110) then merges query string on top regardless of method:

```php
return data_get(
    $this->getInputSource()->all() + $this->query->all(), $key, $default
);
```

The `+` means form/JSON body wins over identically-named query params.

Direct escapes that bypass this routing exist for when you need exactly one bag: `->query()` always reads `$query`, `->post()` always reads `$request`, `->json()` always reads `$json`.

---

## Trait composition

The class mixes in four Laravel traits (line 31–36):

- **`InteractsWithInput`** — the main input API (`input`, `all`, `only`, `except`, `filled`, `has`, `file`, `allFiles`, bearerToken, etc.)
- **`InteractsWithContentTypes`** — negotiation helpers (`isJson`, `wantsJson`, `expectsJson`, `accepts`, `prefers`, `format`, etc.) all driven through `getAcceptableContentTypes()` → `$cachedAcceptHeader`
- **`InteractsWithFlashData`** — `old()`, `flash()`, `flashOnly()`, `flashExcept()`, working through the session
- **`CanBePrecognitive`** — Precognition mode (validates without executing the full action)

Plus `Conditionable` (`when`/`unless`) and `Macroable` (runtime method extension).

---

## Summary picture

```
Illuminate\Http\Request
│
├── Symfony bags (inherited, always populated)
│   ├── $query      ← query string
│   ├── $request    ← form body (or JSON body promoted here)
│   ├── $cookies
│   ├── $files      ← raw Symfony UploadedFile objects
│   ├── $server / $headers / $attributes
│   └── $content    ← raw body string
│
└── Laravel additions
    ├── $json               ← InputBag (lazy parse, or alias to $request for JSON requests)
    ├── $convertedFiles     ← Illuminate UploadedFile wrappers (lazy)
    ├── $userResolver       ← Closure → auth guard lookup (installed by auth middleware)
    ├── $routeResolver      ← Closure → matched Route (installed by Router)
    └── $cachedAcceptHeader ← last raw Accept string, guards Symfony's accept-type cache
```

The design principle throughout: the request object is a **thin value envelope** — the user and route are not materialized onto it, only callbacks that know how to fetch them. JSON bodies are parsed once and promoted into the form-body bag to avoid a separate copy. Content negotiation answers are computed by Symfony but guarded by a cheap string comparison so mutations during the request lifecycle don't silently return stale answers.
