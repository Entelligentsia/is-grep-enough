# transcript: To decide whether a given action should be allowed for the current user at a particular point in handling a request — and to do the right thing when it isn't...


💬 Let me load the grove tools and map the authorization system structurally.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__map)

💬 Now let me map the Auth/Access directory and find the central `check`/`inspect` methods in parallel.
  ▸ mcp__grove__map({"dir":"src/Illuminate/Auth/Access"})
  ▸ mcp__grove__symbols({"dir":"src/Illuminate/Auth/Access","kind":"method","name":"inspect"})

💬 Now let me read the core evaluation methods in parallel — `raw`, `inspect`, `authorize`, `check`, and `resolveAuthCallback`.
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Auth/Access/Gate.php#raw@434"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Auth/Access/Gate.php#inspect@408"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Auth/Access/Gate.php#authorize@396"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Auth/Access/Gate.php#check@356"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Auth/Access/Gate.php#resolveAuthCallback@627"})

💬 Now let me find the callers of `authorize`/`check`/`inspect` across the broader codebase, and read the remaining pieces of the evaluation chain in parallel.
  ▸ mcp__grove__callers({"name":"authorize","dir":"src/Illuminate"})
  ▸ mcp__grove__callers({"name":"inspect","dir":"src/Illuminate"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Auth/Access/Gate.php#callBeforeCallbacks@564"})
  ▸ mcp__grove__source({"id":"php:src/Illuminate/Auth/Access/Gate.php#resolvePolicyCallback@774"})

💬 Now let me read the three key external callers — the middleware, the controller trait, and the FormRequest — in parallel.
  ▸ mcp__grove__source({"file":"src/Illuminate/Auth/Middleware/Authorize.php","name":"handle"})
  ▸ mcp__grove__source({"file":"src/Illuminate/Foundation/Auth/Access/AuthorizesRequests.php","name":"authorize"})
  ▸ mcp__grove__source({"file":"src/Illuminate/Foundation/Http/FormRequest.php","name":"passesAuthorization"})
  ▸ mcp__grove__source({"file":"src/Illuminate/Auth/Access/Response.php","name":"authorize"})

💬 Let me grab one more piece — `getGateArguments` from the middleware and the `Authorizable` trait used on models.
  ▸ mcp__grove__source({"file":"src/Illuminate/Auth/Middleware/Authorize.php","name":"getGateArguments"})
  ▸ mcp__grove__callers({"name":"check","dir":"src/Illuminate"})

💬 I have everything needed. Here is the complete picture.  ---  ## The authorization evaluation chain  ### The single engine: `Gate::raw()`  Every public autho...

──────── RESULT (success, 108468ms, 19 turns) ────────
I have everything needed. Here is the complete picture.

---

## The authorization evaluation chain

### The single engine: `Gate::raw()`

Every public authorization check ultimately flows through `Gate::raw()` (`Gate.php:434`). It is the only place that actually evaluates an ability:

```
raw($ability, $arguments)
  │
  ├─ resolveUser()                       resolve the acting user from the user-resolver closure
  │
  ├─ callBeforeCallbacks()               run registered before-callbacks in order;
  │   └─ if any returns non-null ────►   short-circuit: that value IS the result
  │
  ├─ callAuthCallback()                  if no early result, find and call the right callback:
  │    └─ resolveAuthCallback()
  │         ├─ 1. arguments[0] has a policy? → resolvePolicyCallback()
  │         │       ├─ callPolicyBefore()  (policy's own before() — another short-circuit)
  │         │       └─ callPolicyMethod()  (the specific ability method, e.g. update())
  │         ├─ 2. string callback (Class@method)?
  │         └─ 3. closure ability?
  │              └─ else: empty closure (implicitly null → deny)
  │
  ├─ callAfterCallbacks()                run after-callbacks with the result (logging/auditing)
  │
  └─ dispatchGateEvaluatedEvent()        fire GateEvaluated event
```

`canBeCalledWithUser()` gates every step: if the user is a guest (null) the callback is only invoked when its first parameter is nullable or has a default — otherwise it is silently skipped.

---

### The three public faces of `raw()`

All three live in `Gate.php` and differ only in how they package the result.

#### `inspect()` → `Response` (Gate.php:408)

The first public wrapper. Calls `raw()` and normalises whatever it returns into a rich `Response` object:

```php
public function inspect($ability, $arguments = [])
{
    try {
        $result = $this->raw(enum_value($ability), $arguments);

        if ($result instanceof Response) {
            return $result;           // policy returned a Response directly
        }

        return $result
            ? Response::allow()
            : ($this->defaultDenialResponse ?? Response::deny());
    } catch (AuthorizationException $e) {
        return $e->toResponse();      // exception → Response (doesn't re-throw here)
    }
}
```

`inspect()` **never throws** — it always returns a `Response`. This is the right call when the caller needs the full verdict object (message, HTTP status, code) rather than a bare bool.

#### `check()` → `bool` (Gate.php:356)

```php
public function check($abilities, $arguments = [])
{
    return (new Collection($abilities))->every(
        fn ($ability) => $this->inspect($ability, $arguments)->allowed()
    );
}
```

Iterates abilities, calls `inspect()` on each, extracts `.allowed()`. Returns `true` only when **all** pass. The helpers `allows()`, `denies()`, `any()`, `none()` all route through here:

| Method | Logic |
|---|---|
| `allows($a)` | `check([$a])` |
| `denies($a)` | `!allows($a)` |
| `any($abilities)` | `check(…)->contains(true)` |
| `none($abilities)` | `!any(…)` |

#### `authorize()` → throws or `Response` (Gate.php:396)

```php
public function authorize($ability, $arguments = [])
{
    return $this->inspect($ability, $arguments)->authorize();
}
```

Calls `inspect()` and then invokes `Response::authorize()` on the result, which is **the actual throw point**:

```php
// Response.php:148
public function authorize()
{
    if ($this->denied()) {
        throw (new AuthorizationException($this->message(), $this->code()))
            ->setResponse($this)
            ->withStatus($this->status);   // carries HTTP status when denyWithStatus() was used
    }
    return $this;   // allowed: returns Response to caller
}
```

The `AuthorizationException` carries the full `Response` so the exception handler can convert it to a proper HTTP 403 (or 404 via `denyAsNotFound()`).

---

### The callers and what they do with the verdict

#### 1. `Authorize` middleware — route-level guard (`Auth/Middleware/Authorize.php:55`)

```php
public function handle($request, Closure $next, $ability, ...$models)
{
    $this->gate->authorize($ability, $this->getGateArguments($request, $models));
    return $next($request);
}
```

Calls `Gate::authorize()` directly. If denied, the `AuthorizationException` propagates to the framework's exception handler and becomes an HTTP 403/404. If allowed, the request continues down the pipeline. `getGateArguments()` resolves `$models` strings to actual Eloquent model instances from the route bindings.

#### 2. `AuthorizesRequests` trait — controller-level guard (`Foundation/Auth/Access/AuthorizesRequests.php:25`)

```php
public function authorize($ability, $arguments = [])
{
    [$ability, $arguments] = $this->parseAbilityAndArguments($ability, $arguments);
    return app(Gate::class)->authorize($ability, $arguments);
}

public function authorizeForUser($user, $ability, $arguments = [])
{
    return app(Gate::class)->forUser($user)->authorize($ability, $arguments);
}
```

A thin wrapper used in controller action methods. Calls `Gate::authorize()`, so denied → exception, allowed → returns the `Response`. `authorizeForUser()` first scopes the gate to a specific user via `forUser()` before checking.

#### 3. `FormRequest::passesAuthorization()` — request-lifecycle guard (`Foundation/Http/FormRequest.php:317`)

```php
protected function passesAuthorization()
{
    if (method_exists($this, 'authorize')) {
        $result = $this->container->call([$this, 'authorize']);
        return $result instanceof Response ? $result->authorize() : $result;
    }
    return true;
}
```

Called automatically when the FormRequest is resolved from the container. It calls the user-defined `authorize()` method on the form request class (which typically calls `$this->user()->can(…)` or the Gate directly). The result can be either a plain `bool` or a `Response` — if it is a `Response` it calls `.authorize()` on it (which throws). If the method returns `false` (or the exception is thrown), the framework raises an `HttpResponseException` with a 403.

#### 4. `allowIf()` / `denyIf()` — inline demand checks (`Gate.php:146,161`)

```php
public function allowIf($condition, $message = null, $code = null)
{
    return $this->authorizeOnDemand($condition, $message, $code, true);
}
public function denyIf($condition, $message = null, $code = null)
{
    return $this->authorizeOnDemand($condition, $message, $code, false);
}
```

`authorizeOnDemand()` resolves the condition (which may be a closure or a `Responsable`), then calls `->authorize()` on the resulting Response — same throw-or-return path as everywhere else. Used for imperative one-off checks without registering a named ability.

---

### Summary of the flow

```
Route middleware (Authorize)          ──┐
Controller trait (AuthorizesRequests) ──┤──► Gate::authorize()
allowIf / denyIf                      ──┘         │
                                                   ▼
FormRequest (passesAuthorization)          Gate::inspect()
Gate::check / allows / denies / any ──►        │
                                               ▼
                                          Gate::raw()          ← the engine
                                         /    │     \
                                  before  auth   after
                                  hooks  callback  hooks
                                         │
                                   resolveAuthCallback()
                                   ├─ policy (+ policy before)
                                   ├─ string Class@method
                                   └─ closure

inspect() → Response object (never throws)
  └─ .allowed()  → bool   (check / allows / denies / any)
  └─ .authorize() → throws AuthorizationException on deny
                    returns Response on allow
```

The key design point: **`raw()` is the engine, `inspect()` is the safe normaliser, and `Response::authorize()` is the single throw site.** All the various entry points (middleware, controller helpers, form requests, demand checks) converge on `inspect()` and then either extract a bool or call `.authorize()` depending on whether they want a silent false or an exception.
