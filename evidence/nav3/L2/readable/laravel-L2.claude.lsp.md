# transcript: To decide whether a given action should be allowed for the current user at a particular point in handling a request — and to do the right thing when it isn't...


💬 I'll load the LSP tool and then trace Laravel's authorization system from the central check outward.
  ▸ ToolSearch(select:LSP)

💬 Let me search for the core Gate class and its central `check` / `inspect` / `callAuthCallback` methods.
  ▸ LSP(Gate)
  ▸ LSP(Gate)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/laravel/src/Illuminate/Auth/Access/Gate.php","line":1,"character":1})

💬 Now let me read the key methods in sequence — `raw` (the engine), `inspect`, `authorize`, `callAuthCallback`, `resolveAuthCallback`, and the policy machinery.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Gate.php)

💬 Now let me find the primary callers: the `AuthorizesRequests` controller trait and the `authorize` middleware.
  ▸ LSP(AuthorizesRequests)
  ▸ LSP(Authorize)

💬 Now let me read the key callers in parallel.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Auth/Access/AuthorizesRequests.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Middleware/Authorize.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Response.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Auth/Access/Authorizable.php)

💬 Now let me check FormRequest's authorization path and how `AuthorizationException` is rendered by the exception handler.
  ▸ LSP(FormRequest)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/AuthorizationException.php)

💬 Let me check the FormRequest's `authorize` validation flow.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Http/FormRequest.php)
  ▸ LSP(validateResolved)
  ▸ Bash(grep -n "failedAuthorization\|passesAuthorization\|authorize" /home/bench/repos/laravel/src/Illuminate/Foundation/Http/FormRequest.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Http/FormRequest.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Validation/ValidatesWhenResolvedTrait.php)

💬 Let me also check how the exception handler converts `AuthorizationException` into an HTTP response.
  ▸ Bash(grep -n "AuthorizationException\|403\|renderHttpException" /home/bench/repos/laravel/src/Illuminate/Foundation/Exceptions/Handler.php | head -40)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Exceptions/Handler.php)

💬 I now have everything needed. Here is the complete picture.  ---  ## The central check: `Gate::raw()`  **File:** `src/Illuminate/Auth/Access/Gate.php`  `raw(...

──────── RESULT (success, 116659ms, 21 turns) ────────
I now have everything needed. Here is the complete picture.

---

## The central check: `Gate::raw()`

**File:** `src/Illuminate/Auth/Access/Gate.php`

`raw()` is the single routine that actually evaluates an ability. Every public entry point — `check`, `allows`, `denies`, `authorize`, `inspect`, `any`, `none` — eventually arrives here. It does four things in order (lines 434–458):

```
raw($ability, $arguments)
  1. resolveUser()                          — pull the current user from the resolver closure
  2. callBeforeCallbacks($user, …)          — run registered "before" filters; first non-null
                                              return short-circuits the whole check
  3. callAuthCallback($user, …)             — resolve and invoke the actual callback
  4. callAfterCallbacks($user, …, $result)  — pass result to "after" filters (can fill a null result)
  tap → dispatchGateEvaluatedEvent(…)      — fire GateEvaluated event (if Dispatcher is bound)
```

### How the callback is resolved (`resolveAuthCallback`, line 627)

Priority order when `callAuthCallback` picks what to call:

1. **Policy** — if `$arguments[0]` has a registered (or auto-discovered) policy class, `resolvePolicyCallback()` returns a closure that:
   - calls the policy's own `before($user, $ability, …)` first (line 810); a non-null return there ends evaluation,
   - otherwise calls `callPolicyMethod($policy, $method, $user, $arguments)` (line 844), which does `$policy->{$method}($user, …)`.
2. **String-form callback** (e.g. `'App\Policies\PostPolicy@update'`) stored in `$stringCallbacks` — resolved if `canBeCalledWithUser` passes.
3. **Closure/callable** stored in `$abilities` — resolved if `canBeCalledWithUser` passes.
4. **No-op closure** — returns nothing (`null`), which becomes a deny.

**Guest handling** (`canBeCalledWithUser`, line 469): if the current user is `null`, the callback is only invoked if its first parameter is nullable or has a `null` default. Otherwise the no-op fallback is used and the check denies.

---

## What `raw()` returns and how callers use it

`raw()` returns whatever the winning callback returned — a `bool`, a `Response` object, or `null`.

### `inspect($ability, $arguments)` — line 408

Wraps `raw()` into a `Response` value object. Never throws.

```php
$result = $this->raw(enum_value($ability), $arguments);
// already a Response → return as-is
// truthy bool  → Response::allow()
// falsy/null   → $this->defaultDenialResponse ?? Response::deny()
// AuthorizationException thrown inside raw() → $e->toResponse()
```

### `authorize($ability, $arguments)` — line 396

Calls `inspect(…)->authorize()`. `Response::authorize()` (line 148 of `Response.php`) **throws `AuthorizationException`** when denied, carrying the message, application code, and optional HTTP status. Otherwise it returns the `Response` object so callers can chain.

### `check($abilities, $arguments)` — line 356

Returns a plain `bool`. Iterates each ability through `inspect()`, testing `->allowed()`. Used when you need a yes/no without throwing.

### `allows` / `denies` — lines 332 / 344

Thin wrappers: `allows` delegates to `check`; `denies` negates it.

---

## Where callers reach `raw()` during a request

### 1. `Authorize` middleware — `src/Illuminate/Auth/Middleware/Authorize.php`

The `can:ability,model` route middleware. `handle()` (line 55) calls `Gate::authorize()` directly:

```php
$this->gate->authorize($ability, $this->getGateArguments($request, $models));
return $next($request);
```

`getGateArguments` resolves model names to actual Eloquent instances from the route (via `$request->route($model)`), or accepts a class name or quoted string literal. If `authorize` throws, the pipeline stops there.

`authorizeResource()` in the `AuthorizesRequests` trait (line 87) uses this middleware path: it registers `can:viewAny,App\Models\Post`, `can:update,post`, etc. for each resource action rather than calling `authorize()` inline.

### 2. `AuthorizesRequests` trait — `src/Illuminate/Foundation/Auth/Access/AuthorizesRequests.php`

Mixed into the base controller. `authorize($ability, $arguments)` (line 21) resolves the `Gate` contract from the container and calls `Gate::authorize()`. It also detects when the passed ability is a model class name — in that case it infers the ability from the calling controller method name via `debug_backtrace` and swaps the arguments accordingly (`parseAbilityAndArguments`, line 52).

`authorizeForUser($user, …)` (line 38) does the same through `Gate::forUser($user)->authorize(…)`, creating a scoped gate copy with a fixed user resolver.

### 3. `Authorizable` trait — `src/Illuminate/Foundation/Auth/Access/Authorizable.php`

Mixed into the `User` model (and any other authenticatable). `$user->can($abilities, $arguments)` (line 16) calls:

```php
app(Gate::class)->forUser($this)->check($abilities, $arguments)
```

Returns `bool`, never throws. This is the branch used in Blade (`@can`), policy expressions, or any code that needs to branch rather than abort.

### 4. `FormRequest` — `src/Illuminate/Foundation/Http/FormRequest.php`

A different path altogether. When the router resolves a `FormRequest` from the container, `ValidatesWhenResolvedTrait::validateResolved()` runs (line 17 of the trait). It calls `passesAuthorization()` **before** running validation rules. `FormRequest::passesAuthorization()` (line 317) calls the user-defined `authorize()` method via the container:

```php
$result = $this->container->call([$this, 'authorize']);
return $result instanceof Response ? $result->authorize() : $result;
```

If the method returns a `Response` object, `->authorize()` is called on it, which may throw `AuthorizationException`. If it returns a falsy non-`Response`, `passesAuthorization()` returns `false`, then `failedAuthorization()` (line 335) throws a bare `AuthorizationException` with no message.

Note: `FormRequest::authorize()` does **not** call `Gate::authorize()` automatically — it runs the user-supplied `authorize()` body, which typically calls `$this->user()->can(…)` or `Gate::allows(…)` explicitly.

---

## What happens to `AuthorizationException`

`Handler::prepareException()` (line 764 of `src/Illuminate/Foundation/Exceptions/Handler.php`) maps it to an HTTP exception before rendering:

```php
$e instanceof AuthorizationException && $e->hasStatus()
    => new HttpException($e->status(), …)          // e.g. 404 from Response::denyAsNotFound()

$e instanceof AuthorizationException && ! $e->hasStatus()
    => new AccessDeniedHttpException($e->getMessage(), $e)   // → 403
```

The HTTP status on the exception comes from `Response::withStatus()` / `Response::denyWithStatus()` / `denyAsNotFound()`, which flows through `Response::authorize()` → `AuthorizationException::withStatus()`.

---

## End-to-end summary

```
request
  │
  ├─ Authorize middleware (route-level "can:…")
  │    └─ Gate::authorize()
  │
  ├─ Controller calls $this->authorize() [AuthorizesRequests trait]
  │    └─ Gate::authorize()
  │
  ├─ FormRequest resolved from container
  │    └─ validateResolved() → passesAuthorization() → user's authorize()
  │         (may call Gate internally, or just return bool/Response)
  │
  └─ $user->can() [Authorizable trait, e.g. in Blade or business logic]
       └─ Gate::forUser($this)->check()   ← returns bool, no throw
              │
              ▼
         Gate::inspect()   ← always returns Response, never throws
              │
              ▼
         Gate::raw()       ← THE ENGINE
           1. callBeforeCallbacks   (registered via Gate::before())
           2. callAuthCallback
                └─ resolveAuthCallback
                     ├─ policy?  → resolvePolicyCallback
                     │              → callPolicyBefore  (policy::before())
                     │              → callPolicyMethod  (policy::{ability}())
                     └─ closure/string-callback in $abilities
           3. callAfterCallbacks    (registered via Gate::after())
           4. dispatchGateEvaluatedEvent
              │
              ▼
         Response object → ->allowed() bool or ->authorize() throw

AuthorizationException
  └─ Handler::prepareException()
       ├─ has status  → HttpException(status)
       └─ no status   → AccessDeniedHttpException → 403
```
