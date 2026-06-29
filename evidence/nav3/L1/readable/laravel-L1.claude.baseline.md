# transcript: I'm trying to reason about what Laravel actually carries around for a single incoming HTTP request — the object that represents one request as it moves throu...


💬 Let me read the Laravel `Request` class directly.
  ▸ Bash(find /home/bench/repos/laravel/src/Illuminate/Http -name "Request.php" | head -5)
  ▸ Bash(wc -l /home/bench/repos/laravel/src/Illuminate/Http/Request.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Request.php)

💬 Now let me look at the traits mixed into it, particularly `InteractsWithInput` and `InteractsWithContentTypes`.
  ▸ Bash(ls /home/bench/repos/laravel/src/Illuminate/Http/Concerns/)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Concerns/InteractsWithContentTypes.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Concerns/InteractsWithInput.php)

💬 Good. Let me quickly check `CanBePrecognitive` and how `userResolver`/`routeResolver` get wired in.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Http/Concerns/CanBePrecognitive.php)
  ▸ Bash(grep -n "setUserResolver\|setRouteResolver\|routeResolver\|userResolver" /home/bench/repos/laravel/src/Illuminate/Routing/Router.php | head -20)
  ▸ Bash(grep -n "setUserResolver" /home/bench/repos/laravel/src/Illuminate/Auth/AuthServiceProvider.php /home/bench/repos/laravel/src/Illuminate/Auth/Middleware/Auth...)
  ▸ Bash(grep -rn "setUserResolver" /home/bench/repos/laravel/src/Illuminate/ | head -15)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/AuthServiceProvider.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Routing/Router.php)

💬 Now I have everything I need to give you a complete picture. Here's the breakdown:  ---  ## What `Illuminate\Http\Request` carries beyond Symfony's inherited...

──────── RESULT (success, 91216ms, 13 turns) ────────
Now I have everything I need to give you a complete picture. Here's the breakdown:

---

## What `Illuminate\Http\Request` carries beyond Symfony's inherited bags

The class (`src/Illuminate/Http/Request.php:29`) extends Symfony's `Request`, which means it inherits six `InputBag`/`ParameterBag` instances (`$query`, `$request`, `$cookies`, `$files`, `$server`, `$headers`), a raw `$content` string, and Symfony's own `$acceptableContentTypes` array. On top of all that, Laravel adds five properties of its own.

---

### 1. `$json` — lazy-parsed JSON body (line 43)

```php
protected $json; // InputBag|null
```

Starts `null`. On the first call to `json()` (line 464), the raw body string is `json_decode`'d and wrapped in a fresh `InputBag`. There's a subtle shortcut in `createFromBase()` (line 548): when the incoming request already has a JSON `Content-Type`, it pre-populates `$request` (the normal POST body bag) with the decoded JSON and then **sets `$json` to point at the same `$request` bag**, unifying them rather than maintaining two separate copies.

The key routing decision lives in `getInputSource()` (line 480):

```php
if ($this->isJson()) {
    return $this->json(); // <-- the $json InputBag
}
return in_array($this->getRealMethod(), ['GET', 'HEAD'])
    ? $this->query
    : $this->request;
```

So `input()` (line 111 of `InteractsWithInput.php`) reads from `getInputSource()->all() + $this->query->all()`, meaning:

- **JSON requests** → `$json` bag, with query string merged in behind it
- **GET/HEAD** → `$query` bag only
- **POST with form data** → `$request` (POST body) bag, with `$query` merged in behind it (form body wins on duplicate keys)

---

### 2. `$convertedFiles` — lazy-converted file array (line 50)

```php
protected $convertedFiles; // array|null
```

Symfony's `$files` bag holds `Symfony\...\UploadedFile` instances. `allFiles()` (line 183 of `InteractsWithInput.php`) wraps each one in `Illuminate\Http\UploadedFile` using `??=` on first access — so the conversion only happens once, and the result is cached here. Subsequent calls to `file()` and `all()` reuse it.

---

### 3. `$userResolver` — auth lookup closure (line 57)

```php
protected $userResolver; // Closure|null
```

A `Closure` with signature `function ($guard = null)`. It's **not set at construction**; the `AuthServiceProvider` installs it via a container `rebinding` hook (`AuthServiceProvider.php:87`):

```php
$request->setUserResolver(function ($guard = null) use ($app) {
    return call_user_func($app['auth']->userResolver(), $guard);
});
```

Every call to `$request->user($guard)` (line 669) just invokes this closure. There's no memoization on the request — the `Guard` itself caches the resolved user internally. If no resolver has been installed yet (before auth bootstrap), `getUserResolver()` (line 729) returns a no-op closure that returns `null`.

---

### 4. `$routeResolver` — matched route closure (line 64)

```php
protected $routeResolver; // Closure|null
```

A `Closure` installed by the Router in `Router::runRoute()` (line 795 of `Router.php`):

```php
$request->setRouteResolver(fn () => $route);
```

This is set **after** matching but before the middleware pipeline runs — so anything in the middleware stack (or the controller itself) that calls `$request->route()` gets the matched `Route`. Like the user resolver, every call to `route()` (line 681) reinvokes the closure; there's no caching here either, though the closure captures the resolved `Route` object by reference so it's effectively free.

The same resolver powers `$request['key']` via `ArrayAccess`, `__get()`, and `fingerprint()`.

---

### 5. `$cachedAcceptHeader` — Accept header change sentinel (line 71)

```php
protected $cachedAcceptHeader; // string|null
```

The purpose is subtle. Symfony caches its parsed `$acceptableContentTypes` array indefinitely. Laravel's `getAcceptableContentTypes()` override (line 370) compares the current raw `Accept` header against this sentinel:

```php
if ($this->cachedAcceptHeader !== $currentAcceptHeader) {
    $this->acceptableContentTypes = null; // flush Symfony's cache
    $this->cachedAcceptHeader = $currentAcceptHeader;
}
```

If something mutates `$headers` mid-request (middleware swapping Accept, for instance), the stale parsed list gets flushed and recalculated. All of `wantsJson()`, `acceptsHtml()`, `prefers()`, and `format()` in `InteractsWithContentTypes` flow through `getAcceptableContentTypes()`, so they all benefit.

---

### Session slot (inherited, but Laravel-typed)

Symfony's `Request` has a `$session` property. Laravel sets it via `setLaravelSession()` (line 636), which wraps an `Illuminate\Contracts\Session\Session` in a `SymfonySessionDecorator`. The `hasSession()` override (line 596) checks `instanceof SymfonySessionDecorator` — so until the `StartSession` middleware runs and calls `setLaravelSession()`, the session slot holds nothing. Calling `$request->session()` (line 621) reads `$this->session->store` to unwrap the Laravel store from the decorator.

---

### `CanBePrecognitive` adds no stored state

It reads `$this->headers` for the `Precognition` and `Precognition-Validate-Only` headers, and `$this->attributes` (the Symfony bag of internal routing markers) for the `precognitive` key. No additional properties.

---

### The full picture in one place

| Property | Type | When populated | What it is |
|---|---|---|---|
| `$json` | `InputBag\|null` | First call to `json()` | Decoded JSON body, or null if not JSON |
| `$convertedFiles` | `array\|null` | First call to `allFiles()` | Symfony UploadedFiles converted to Laravel's subclass |
| `$userResolver` | `Closure\|null` | Auth service provider boot | Closure that calls `auth()->userResolver()($guard)` |
| `$routeResolver` | `Closure\|null` | `Router::runRoute()` | Closure that returns the matched `Route` |
| `$cachedAcceptHeader` | `string\|null` | First call to `getAcceptableContentTypes()` | Sentinel to detect Accept header mutation |
| `$session` (inherited) | `SymfonySessionDecorator\|null` | `StartSession` middleware | Wraps the Laravel session store |
