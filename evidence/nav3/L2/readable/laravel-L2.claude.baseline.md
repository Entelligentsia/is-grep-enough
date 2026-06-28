# transcript: To decide whether a given action should be allowed for the current user at a particular point in handling a request — and to do the right thing when it isn't...


💬 I'll explore Laravel's authorization system to trace the central check and its callers.

  ▸ Agent(Trace Laravel authorization flow)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/laravel/src/Illuminate/Auth/Access -type f -name "*.php" | head -20)
      ↳ Bash(find /home/bench/repos/laravel/src/Illuminate/Foundation/Auth -type f -name "*.php" 2>/dev/null)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Gate.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Response.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/AuthorizationException.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/HandlesAuthorization.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Events/GateEvaluated.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Auth/Access/Authorizable.php)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Auth/Access/AuthorizesRequests.php)
      ↳ Bash(find /home/bench/repos/laravel -type f -name "*.php" | xargs grep -l "class Gate" | grep -i facade)
      ↳ Read(/home/bench/repos/laravel/src/Illuminate/Support/Facades/Gate.php)
      ↳ Bash(grep -n "public function raw\|public function inspect\|public function check\|public function allows\|public function denies\|public function any\|public fun...)
      ↳ ⟹ returned to parent


💬 Let me verify the key line numbers directly.
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Gate.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Response.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Auth/Access/Gate.php)
  ▸ Read(/home/bench/repos/laravel/src/Illuminate/Foundation/Auth/Access/AuthorizesRequests.php)

💬 Here's how the authorization system is structured, traced from the core outward.  ---  ## The central check: `Gate::raw()`  `src/Illuminate/Auth/Access/Gate....

──────── RESULT (success, 152021ms, 6 turns) ────────
Here's how the authorization system is structured, traced from the core outward.

---

## The central check: `Gate::raw()`

`src/Illuminate/Auth/Access/Gate.php:434`

This is the single point through which every ability evaluation passes. It:

1. Resolves the current user (`resolveUser()`)
2. Runs **before-callbacks** — any non-`null` return short-circuits the rest
3. Falls through to `callAuthCallback()` — dispatches to the registered closure, a `Policy` method, or a guessed policy method
4. Runs **after-callbacks** (logging, side-effects; their return value replaces the result)
5. Fires the `GateEvaluated` event and returns whatever was produced (`bool`, a `Response` object, or `null`)

`raw()` is `public` but is not the typical entry point — callers go through `inspect()`.

---

## The normalizing adapter: `Gate::inspect()`

`Gate.php:408`

Wraps `raw()` and **always** returns a `Response` object:

```
raw() returns bool   →  Response::allow()  or  $defaultDenialResponse / Response::deny()
raw() returns Response →  passed through as-is
raw() throws AuthorizationException  →  $e->toResponse()
```

Every higher-level public method is built on top of `inspect()`.

---

## Public callers and what they do with the verdict

| Method | File:line | Returns | Throws? | Logic |
|---|---|---|---|---|
| `inspect($ability)` | `Gate.php:408` | `Response` | never | normalizes `raw()` → `Response` |
| `authorize($ability)` | `Gate.php:396` | `Response` (allowed only) | yes — `AuthorizationException` | calls `inspect()->authorize()` |
| `check($abilities)` | `Gate.php:356` | `bool` | no | `every` ability passes `inspect()->allowed()` (AND) |
| `allows($ability)` | `Gate.php:332` | `bool` | no | alias for `check()` |
| `denies($ability)` | `Gate.php:344` | `bool` | no | `!allows()` |
| `any($abilities)` | `Gate.php:370` | `bool` | no | `contains` ability passes `check()` (OR) |
| `none($abilities)` | `Gate.php:382` | `bool` | no | `!any()` |
| `allowIf($condition)` | `Gate.php:146` | `Response` | yes | `authorizeOnDemand(…, allowWhen=true)` |
| `denyIf($condition)` | `Gate.php:161` | `Response` | yes | `authorizeOnDemand(…, allowWhen=false)` |

`allowIf`/`denyIf` bypass `raw()` entirely — they evaluate a bare `bool` or `Closure` directly in `authorizeOnDemand()` (`Gate.php:177`) and wrap the result in a `Response`, then call `->authorize()` on it.

---

## Where `AuthorizationException` is actually thrown

`Response::authorize()` at `Response.php:148` — that is the single throw site. Every path that needs to abort-on-deny ultimately calls this method:

```
Gate::authorize()  →  inspect()->authorize()           (on the Response)
AuthorizesRequests::authorize()  →  Gate::authorize()  (controller trait)
allowIf / denyIf  →  authorizeOnDemand()->authorize()
```

The exception carries the `Response` (and optional HTTP status), so the exception handler can inspect it.

---

## Controller-level entry points (`AuthorizesRequests` trait)

`src/Illuminate/Foundation/Auth/Access/AuthorizesRequests.php`

Controllers use this trait, which adds two throwing wrappers:

- `authorize($ability, $arguments)` — resolves `Gate` from the container, calls `Gate::authorize()`, throws on denial (:21)
- `authorizeForUser($user, $ability, $arguments)` — same, but scoped to an explicit user via `Gate::forUser()` (:38)
- `authorizeResource($model, …)` — does **not** call `raw()`; it registers `can:ability,model` middleware for every resourceful route (:87)

---

## User model entry points (`Authorizable` trait)

`src/Illuminate/Foundation/Auth/Access/Authorizable.php`

The `User` model gets boolean helpers that scope the gate to `$this`:

- `$user->can($ability)` → `Gate::forUser($this)->check()`
- `$user->canAny($abilities)` → `Gate::forUser($this)->any()`
- `$user->cant()` / `cannot()` → `!can()`

These never throw; they return plain booleans and are the right choice for branching logic in business code.

---

## Summary of the call chain

```
Controller $this->authorize()          $user->can()         Gate::allows/check/any
           ↓                              ↓                         ↓
    Gate::authorize()              Gate::check()             Gate::check()
           ↓                              ↓                         ↓
    Gate::inspect()  ←────────────────────┴─────────────────────────┘
           ↓
       Gate::raw()          ← THE CORE (before → authCallback → after → event)
           ↓
    Response object
           ↓
  authorize() on Response   ← only throw site
```

The key design rule: **`raw()` produces the verdict; `inspect()` normalizes it; `Response::authorize()` enforces it.** Whether a caller wants a boolean, a `Response`, or an exception is entirely determined by which layer it stops at.
