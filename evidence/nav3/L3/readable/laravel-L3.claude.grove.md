# laravel · L3 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **laravel** (php) @ `2107d3d70`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | laravel (php) · L3 |
| pinned source | `2107d3d7079993fd2e82777674fae5b65d87997f` |
| status | completed |
| engagement | `grove_tools = 31` (gate: > 0 → ✓ used its capability) |
| turns | 33 |
| wall clock | 145 s |
| context (peak) | 357,247 tokens |
| cost (billed) | $0.3834 |
| &nbsp;&nbsp;↳ token split | in 22 · out 7,646 · cache-create 28,203 · cache-read 329,022 |
| tool calls | 32 (mcp__grove__source×23, mcp__grove__outline×5, mcp__grove__symbols×3, ToolSearch×1) |
| evidence | `evidence/nav3/L3/raw/laravel-L3.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens to a single incoming HTTP request from the moment the application kernel takes it until the matching controller method actually runs. I'm interested in how the request is handed off into the routing layer, how the matching route is found, how it is pushed through the route's middleware stack, and how control is finally dispatched into the controller action that invokes the method. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me load the grove tools and trace this end-to-end.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__definition,mcp__grove__map)`

💬 Let me now trace the full pipeline in parallel — kernel, router, route, and controller dispatch all at once.

&nbsp;&nbsp;▸ `mcp__grove__outline(src/Illuminate/Foundation/Http/Kernel.php)`
&nbsp;&nbsp;▸ `mcp__grove__outline(src/Illuminate/Routing/Router.php)`

💬 Good. Now let me read all the core methods in parallel — kernel entry, router dispatch chain, route matching, and middleware pipeline.

&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Foundation/Http/Kernel.php#handle@137)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Foundation/Http/Kernel.php#sendRequestThroughRouter@164)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Foundation/Http/Kernel.php#dispatchToRouter@195)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Router.php#dispatch@749)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Router.php#dispatchToRoute@762)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Router.php#findRoute@773)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Router.php#runRoute@793)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Router.php#runRouteWithinStack@811)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Router.php#gatherRouteMiddleware@832)`

💬 Now let me read the Route class — `run`, `gatherMiddleware`, and the controller dispatch path — plus RouteCollection's `match`.

&nbsp;&nbsp;▸ `mcp__grove__outline(src/Illuminate/Routing/Route.php)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(match)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Route.php#run@209)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Route.php#runController@273)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Route.php#gatherMiddleware@1065)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Route.php#controllerMiddleware@1126)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Route.php#controllerDispatcher@1387)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(match)`

💬 Now let me read the `CompiledRouteCollection::match`, `ControllerDispatcher::dispatch`, `Router::resolveMiddleware`, and the `Pipeline` class.

&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/CompiledRouteCollection.php#match@116)`
&nbsp;&nbsp;▸ `mcp__grove__outline(src/Illuminate/Routing/ControllerDispatcher.php)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Router.php#resolveMiddleware@844)`
&nbsp;&nbsp;▸ `mcp__grove__outline(src/Illuminate/Pipeline/Pipeline.php)`

💬 Almost there. Let me grab the Pipeline's execution core and the controller dispatcher.

&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Pipeline/Pipeline.php#then@128)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Pipeline/Pipeline.php#carry@192)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/ControllerDispatcher.php#dispatch@38)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Route.php#runCallable@239)`

💬 Let me check `callAction` in the base Controller and `resolveParameters` in ControllerDispatcher.

&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/ControllerDispatcher.php#resolveParameters@57)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(callAction)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Route.php#matches@350)`
&nbsp;&nbsp;▸ `mcp__grove__source(php:src/Illuminate/Routing/Controller.php#callAction@52)`

💬 Here is the complete sequence, end to end, with every hand-off traced to the exact source location.

---

## 1. `Kernel::handle` — the entry point
**`src/Illuminate/Foundation/Http/Kernel.php:137`**

The public surface. It timestamps the request, calls `enableHttpMethodParameterOverride()` so a `_method` POST field can spoof PUT/PATCH/DELETE, then hands off to `sendRequestThroughRouter`. All uncaught exceptions are caught here, rendered into a response, and a `RequestHandled` event is dispatched before returning.

---

## 2. `Kernel::sendRequestThroughRouter` — bootstrap + global middleware pipeline
**`Kernel.php:164`**

```php
$this->app->instance('request', $request);  // bind into container
$this->bootstrap();                          // load env, config, providers, etc.

return (new Pipeline($this->app))
    ->send($request)
    ->through($this->middleware)             // global middleware array
    ->then($this->dispatchToRouter());       // terminal destination
```

Three things happen here in order:

1. The request is registered into the container as `'request'`.
2. The application is bootstrapped (if not already): loads env, registers config, sets up exception handling, registers service providers, boots them.
3. A `Pipeline` is constructed. The global middleware stack (`$this->middleware` on the kernel — things like `TrustProxies`, `PreventRequestsDuringMaintenance`, `ValidatePostSize`, `TrimStrings`, etc.) is fed in as `$pipes`, and the router dispatcher is the terminal destination (`$destination`).

---

## 3. How the `Pipeline` executes middleware
**`src/Illuminate/Pipeline/Pipeline.php:128` and `:192`**

`then()` calls `array_reduce(array_reverse($pipes), $this->carry(), $destination)`. `carry()` returns a reducer that wraps each middleware around the next one, building an **onion** of closures. The innermost layer is `$destination`; the outermost is the first middleware.

When the reduction is complete, `$pipeline($request)` is called and control flows inward. Each middleware receives `($request, $next)` and calls `$next($request)` to pass control inward. `carry()` resolves each string pipe from the container via `$this->container->make($name)`, then calls `$pipe->handle($request, $next)` (the default `$method` is `'handle'`).

The exact same `Pipeline` mechanic is used twice — once for global middleware here, and again later for route middleware.

---

## 4. `Kernel::dispatchToRouter` — terminal destination for global pipeline
**`Kernel.php:195`**

```php
return function ($request) {
    $this->app->instance('request', $request);
    return $this->router->dispatch($request);
};
```

This is the innermost destination of the global middleware pipeline — called once all global middleware have passed the request inward. It re-binds the (possibly mutated) request into the container and hands to `Router::dispatch`.

---

## 5. `Router::dispatch` → `Router::dispatchToRoute`
**`src/Illuminate/Routing/Router.php:749` and `:762`**

```php
public function dispatch(Request $request)
{
    $this->currentRequest = $request;
    return $this->dispatchToRoute($request);
}

public function dispatchToRoute(Request $request)
{
    return $this->runRoute($request, $this->findRoute($request));
}
```

Thin pass-through. `findRoute` is called first, then the result is piped into `runRoute`.

---

## 6. `Router::findRoute` — route matching
**`Router.php:773`**

```php
$this->events->dispatch(new Routing($request));  // fires Routing event
$this->current = $route = $this->routes->match($request);
$route->setContainer($this->container);
$this->container->instance(Route::class, $route);
return $route;
```

`$this->routes` is a `CompiledRouteCollection` at runtime.

**`CompiledRouteCollection::match`** (`src/Illuminate/Routing/CompiledRouteCollection.php:116`):

```php
$matcher = new CompiledUrlMatcher($this->compiled, ...);
if ($result = $matcher->matchRequest($trimmedRequest)) {
    $route = $this->getByName($result['_route']);
}
```

This uses Symfony's `CompiledUrlMatcher`, which works off a pre-compiled prefix tree / static array — O(1) for static paths, regex-based for parameterised ones. If the matcher throws `ResourceNotFoundException` or `MethodNotAllowedException`, it falls back to the uncompiled `RouteCollection::match()`, which iterates routes and calls `Route::matches()` (validators for method, scheme, host, URI) on each.

After a match, `handleMatchedRoute` is called which:
- binds captured URI segments onto `$route->parameters`
- performs model binding via `substituteBindings` / `substituteImplicitBindings` (Eloquent model lookup by route key)
- verifies domain and scheme constraints

Back in `findRoute`, the matched route is stored as `$this->current` and bound as a singleton in the container.

---

## 7. `Router::runRoute` — attach resolver, fire event, wrap response
**`Router.php:793`**

```php
$request->setRouteResolver(fn () => $route);       // makes $request->route() work
$this->events->dispatch(new RouteMatched($route, $request));

return $this->prepareResponse($request,
    $this->runRouteWithinStack($route, $request)
);
```

The `RouteMatched` event fires here — this is the hook used by things like Telescope and Debugbar. The return value is wrapped in `prepareResponse`, which normalises whatever `run()` returns into a proper `Response` object.

---

## 8. `Router::runRouteWithinStack` — route middleware pipeline
**`Router.php:811`**

```php
$middleware = $shouldSkipMiddleware ? [] : $this->gatherRouteMiddleware($route);

return (new Pipeline($this->container))
    ->send($request)
    ->through($middleware)
    ->then(fn ($request) => $this->prepareResponse(
        $request, $route->run()
    ));
```

This is the **second pipeline** — same `Pipeline` mechanics, but now carrying route-specific middleware. The destination is `$route->run()`.

---

## 9. `Route::gatherMiddleware` → `Router::resolveMiddleware` — assembling the middleware list
**`Route.php:1065`, `Router.php:844`**

`gatherMiddleware` merges two sources:
- `$this->middleware()` — middleware declared directly on the route definition (e.g. `->middleware('auth')`)
- `$this->controllerMiddleware()` — middleware declared on the controller class

**`controllerMiddleware`** (`Route.php:1126`) handles three cases:
1. Controller implements `HasMiddleware` → calls `static::middleware()` on the controller class (modern style).
2. Controller has `getMiddleware()` → calls `ControllerDispatcher::getMiddleware()` (legacy style).
3. Neither → only picks up any `#[Middleware]` PHP 8 attributes via `attributeProvidedControllerMiddleware`.

`Router::resolveMiddleware` then:
1. Expands alias names and group names via `MiddlewareNameResolver::resolve` (e.g. `'auth'` → `Authenticate::class`, `'web'` → the full `web` group array).
2. Removes any middleware listed in `withoutMiddleware()` / `excludedMiddleware()`, including subclass exclusions via reflection.
3. Sorts the final list by `$middlewarePriority` using `sortMiddleware` — this enforces that, e.g., `SubstituteBindings` always runs after `Authenticate`, regardless of declaration order.

---

## 10. `Route::run` — controller action or closure
**`Route.php:209`**

```php
if ($this->isControllerAction()) {
    return $this->runController();
}
return $this->runCallable();
```

`isControllerAction()` checks whether `$this->action['uses']` is a string (a `ControllerClass@method` pair) rather than a `Closure`.

**Closure route** (`runCallable`, `Route.php:239`): Deserialises the closure if needed, then delegates to `CallableDispatcher::dispatch`, which resolves the closure's type-hinted parameters from the container and calls it.

---

## 11. `Route::runController` — resolving the controller
**`Route.php:273`**

```php
return $this->controllerDispatcher()->dispatch(
    $this, $this->getController(), $this->getControllerMethod()
);
```

`getController()` (`Route.php:287`) resolves the controller class out of the container: `$this->container->make($class)` — full constructor injection applies here.

`getControllerMethod()` extracts the method name from the `ClassName@method` string.

`controllerDispatcher()` (`Route.php:1387`) resolves `ControllerDispatcherContract` from the container (falling back to `new ControllerDispatcher`).

---

## 12. `ControllerDispatcher::dispatch` — final method invocation
**`src/Illuminate/Routing/ControllerDispatcher.php:38`**

```php
$parameters = $this->resolveParameters($route, $controller, $method);

if (method_exists($controller, 'callAction')) {
    return $controller->callAction($method, $parameters);
}

return $controller->{$method}(...array_values($parameters));
```

`resolveParameters` calls `resolveClassMethodDependencies` (a trait from `RoutesRequests`), which uses reflection on `$controller::$method` to:
- match route segment values (from `$route->parametersWithoutNulls()`) to parameters by name
- resolve remaining type-hinted parameters (like `Request`, injected services) from the container

`callAction` on the base `Controller` class (`src/Illuminate/Routing/Controller.php:52`) is just:

```php
return $this->{$method}(...array_values($parameters));
```

That is the final call. The controller method runs with all its dependencies injected.

---

## Summary map

```
Kernel::handle
  └─ Kernel::sendRequestThroughRouter
       ├─ bootstrap()
       └─ Pipeline [global middleware: TrustProxies, etc.]
            └─ destination: Kernel::dispatchToRouter closure
                 └─ Router::dispatch
                      └─ Router::dispatchToRoute
                           ├─ Router::findRoute
                           │    └─ CompiledRouteCollection::match
                           │         └─ Symfony CompiledUrlMatcher (fast prefix/regex)
                           │              └─ handleMatchedRoute (bind params, model binding)
                           └─ Router::runRoute
                                ├─ request->setRouteResolver(...)
                                ├─ event: RouteMatched
                                └─ Router::runRouteWithinStack
                                     ├─ gatherRouteMiddleware → resolveMiddleware (expand, exclude, sort)
                                     └─ Pipeline [route middleware: auth, throttle, etc.]
                                          └─ destination: Route::run
                                               └─ Route::runController
                                                    └─ ControllerDispatcher::dispatch
                                                         ├─ resolveParameters (reflection + container)
                                                         └─ controller->callAction($method, $params)
                                                              └─ $this->{$method}(...$params)  ← your action
```

Two key structural observations worth knowing:

- **Two nested pipelines**: global kernel middleware wraps everything; route middleware is a second, inner pipeline that wraps only `$route->run()`. Both use exactly the same `Pipeline` reduce-and-carry mechanism.
- **Model binding happens before middleware**: `substituteBindings` / `substituteImplicitBindings` run inside `handleMatchedRoute` during `findRoute`, before the route middleware pipeline is entered. So by the time `auth` middleware sees the request, the route parameters are already resolved Eloquent models.


## Final answer

_Result event — success, 145 s, 33 turns._

Here is the complete sequence, end to end, with every hand-off traced to the exact source location.

---

## 1. `Kernel::handle` — the entry point
**`src/Illuminate/Foundation/Http/Kernel.php:137`**

The public surface. It timestamps the request, calls `enableHttpMethodParameterOverride()` so a `_method` POST field can spoof PUT/PATCH/DELETE, then hands off to `sendRequestThroughRouter`. All uncaught exceptions are caught here, rendered into a response, and a `RequestHandled` event is dispatched before returning.

---

## 2. `Kernel::sendRequestThroughRouter` — bootstrap + global middleware pipeline
**`Kernel.php:164`**

```php
$this->app->instance('request', $request);  // bind into container
$this->bootstrap();                          // load env, config, providers, etc.

return (new Pipeline($this->app))
    ->send($request)
    ->through($this->middleware)             // global middleware array
    ->then($this->dispatchToRouter());       // terminal destination
```

Three things happen here in order:

1. The request is registered into the container as `'request'`.
2. The application is bootstrapped (if not already): loads env, registers config, sets up exception handling, registers service providers, boots them.
3. A `Pipeline` is constructed. The global middleware stack (`$this->middleware` on the kernel — things like `TrustProxies`, `PreventRequestsDuringMaintenance`, `ValidatePostSize`, `TrimStrings`, etc.) is fed in as `$pipes`, and the router dispatcher is the terminal destination (`$destination`).

---

## 3. How the `Pipeline` executes middleware
**`src/Illuminate/Pipeline/Pipeline.php:128` and `:192`**

`then()` calls `array_reduce(array_reverse($pipes), $this->carry(), $destination)`. `carry()` returns a reducer that wraps each middleware around the next one, building an **onion** of closures. The innermost layer is `$destination`; the outermost is the first middleware.

When the reduction is complete, `$pipeline($request)` is called and control flows inward. Each middleware receives `($request, $next)` and calls `$next($request)` to pass control inward. `carry()` resolves each string pipe from the container via `$this->container->make($name)`, then calls `$pipe->handle($request, $next)` (the default `$method` is `'handle'`).

The exact same `Pipeline` mechanic is used twice — once for global middleware here, and again later for route middleware.

---

## 4. `Kernel::dispatchToRouter` — terminal destination for global pipeline
**`Kernel.php:195`**

```php
return function ($request) {
    $this->app->instance('request', $request);
    return $this->router->dispatch($request);
};
```

This is the innermost destination of the global middleware pipeline — called once all global middleware have passed the request inward. It re-binds the (possibly mutated) request into the container and hands to `Router::dispatch`.

---

## 5. `Router::dispatch` → `Router::dispatchToRoute`
**`src/Illuminate/Routing/Router.php:749` and `:762`**

```php
public function dispatch(Request $request)
{
    $this->currentRequest = $request;
    return $this->dispatchToRoute($request);
}

public function dispatchToRoute(Request $request)
{
    return $this->runRoute($request, $this->findRoute($request));
}
```

Thin pass-through. `findRoute` is called first, then the result is piped into `runRoute`.

---

## 6. `Router::findRoute` — route matching
**`Router.php:773`**

```php
$this->events->dispatch(new Routing($request));  // fires Routing event
$this->current = $route = $this->routes->match($request);
$route->setContainer($this->container);
$this->container->instance(Route::class, $route);
return $route;
```

`$this->routes` is a `CompiledRouteCollection` at runtime.

**`CompiledRouteCollection::match`** (`src/Illuminate/Routing/CompiledRouteCollection.php:116`):

```php
$matcher = new CompiledUrlMatcher($this->compiled, ...);
if ($result = $matcher->matchRequest($trimmedRequest)) {
    $route = $this->getByName($result['_route']);
}
```

This uses Symfony's `CompiledUrlMatcher`, which works off a pre-compiled prefix tree / static array — O(1) for static paths, regex-based for parameterised ones. If the matcher throws `ResourceNotFoundException` or `MethodNotAllowedException`, it falls back to the uncompiled `RouteCollection::match()`, which iterates routes and calls `Route::matches()` (validators for method, scheme, host, URI) on each.

After a match, `handleMatchedRoute` is called which:
- binds captured URI segments onto `$route->parameters`
- performs model binding via `substituteBindings` / `substituteImplicitBindings` (Eloquent model lookup by route key)
- verifies domain and scheme constraints

Back in `findRoute`, the matched route is stored as `$this->current` and bound as a singleton in the container.

---

## 7. `Router::runRoute` — attach resolver, fire event, wrap response
**`Router.php:793`**

```php
$request->setRouteResolver(fn () => $route);       // makes $request->route() work
$this->events->dispatch(new RouteMatched($route, $request));

return $this->prepareResponse($request,
    $this->runRouteWithinStack($route, $request)
);
```

The `RouteMatched` event fires here — this is the hook used by things like Telescope and Debugbar. The return value is wrapped in `prepareResponse`, which normalises whatever `run()` returns into a proper `Response` object.

---

## 8. `Router::runRouteWithinStack` — route middleware pipeline
**`Router.php:811`**

```php
$middleware = $shouldSkipMiddleware ? [] : $this->gatherRouteMiddleware($route);

return (new Pipeline($this->container))
    ->send($request)
    ->through($middleware)
    ->then(fn ($request) => $this->prepareResponse(
        $request, $route->run()
    ));
```

This is the **second pipeline** — same `Pipeline` mechanics, but now carrying route-specific middleware. The destination is `$route->run()`.

---

## 9. `Route::gatherMiddleware` → `Router::resolveMiddleware` — assembling the middleware list
**`Route.php:1065`, `Router.php:844`**

`gatherMiddleware` merges two sources:
- `$this->middleware()` — middleware declared directly on the route definition (e.g. `->middleware('auth')`)
- `$this->controllerMiddleware()` — middleware declared on the controller class

**`controllerMiddleware`** (`Route.php:1126`) handles three cases:
1. Controller implements `HasMiddleware` → calls `static::middleware()` on the controller class (modern style).
2. Controller has `getMiddleware()` → calls `ControllerDispatcher::getMiddleware()` (legacy style).
3. Neither → only picks up any `#[Middleware]` PHP 8 attributes via `attributeProvidedControllerMiddleware`.

`Router::resolveMiddleware` then:
1. Expands alias names and group names via `MiddlewareNameResolver::resolve` (e.g. `'auth'` → `Authenticate::class`, `'web'` → the full `web` group array).
2. Removes any middleware listed in `withoutMiddleware()` / `excludedMiddleware()`, including subclass exclusions via reflection.
3. Sorts the final list by `$middlewarePriority` using `sortMiddleware` — this enforces that, e.g., `SubstituteBindings` always runs after `Authenticate`, regardless of declaration order.

---

## 10. `Route::run` — controller action or closure
**`Route.php:209`**

```php
if ($this->isControllerAction()) {
    return $this->runController();
}
return $this->runCallable();
```

`isControllerAction()` checks whether `$this->action['uses']` is a string (a `ControllerClass@method` pair) rather than a `Closure`.

**Closure route** (`runCallable`, `Route.php:239`): Deserialises the closure if needed, then delegates to `CallableDispatcher::dispatch`, which resolves the closure's type-hinted parameters from the container and calls it.

---

## 11. `Route::runController` — resolving the controller
**`Route.php:273`**

```php
return $this->controllerDispatcher()->dispatch(
    $this, $this->getController(), $this->getControllerMethod()
);
```

`getController()` (`Route.php:287`) resolves the controller class out of the container: `$this->container->make($class)` — full constructor injection applies here.

`getControllerMethod()` extracts the method name from the `ClassName@method` string.

`controllerDispatcher()` (`Route.php:1387`) resolves `ControllerDispatcherContract` from the container (falling back to `new ControllerDispatcher`).

---

## 12. `ControllerDispatcher::dispatch` — final method invocation
**`src/Illuminate/Routing/ControllerDispatcher.php:38`**

```php
$parameters = $this->resolveParameters($route, $controller, $method);

if (method_exists($controller, 'callAction')) {
    return $controller->callAction($method, $parameters);
}

return $controller->{$method}(...array_values($parameters));
```

`resolveParameters` calls `resolveClassMethodDependencies` (a trait from `RoutesRequests`), which uses reflection on `$controller::$method` to:
- match route segment values (from `$route->parametersWithoutNulls()`) to parameters by name
- resolve remaining type-hinted parameters (like `Request`, injected services) from the container

`callAction` on the base `Controller` class (`src/Illuminate/Routing/Controller.php:52`) is just:

```php
return $this->{$method}(...array_values($parameters));
```

That is the final call. The controller method runs with all its dependencies injected.

---

## Summary map

```
Kernel::handle
  └─ Kernel::sendRequestThroughRouter
       ├─ bootstrap()
       └─ Pipeline [global middleware: TrustProxies, etc.]
            └─ destination: Kernel::dispatchToRouter closure
                 └─ Router::dispatch
                      └─ Router::dispatchToRoute
                           ├─ Router::findRoute
                           │    └─ CompiledRouteCollection::match
                           │         └─ Symfony CompiledUrlMatcher (fast prefix/regex)
                           │              └─ handleMatchedRoute (bind params, model binding)
                           └─ Router::runRoute
                                ├─ request->setRouteResolver(...)
                                ├─ event: RouteMatched
                                └─ Router::runRouteWithinStack
                                     ├─ gatherRouteMiddleware → resolveMiddleware (expand, exclude, sort)
                                     └─ Pipeline [route middleware: auth, throttle, etc.]
                                          └─ destination: Route::run
                                               └─ Route::runController
                                                    └─ ControllerDispatcher::dispatch
                                                         ├─ resolveParameters (reflection + container)
                                                         └─ controller->callAction($method, $params)
                                                              └─ $this->{$method}(...$params)  ← your action
```

Two key structural observations worth knowing:

- **Two nested pipelines**: global kernel middleware wraps everything; route middleware is a second, inner pipeline that wraps only `$route->run()`. Both use exactly the same `Pipeline` reduce-and-carry mechanism.
- **Model binding happens before middleware**: `substituteBindings` / `substituteImplicitBindings` run inside `handleMatchedRoute` during `findRoute`, before the route middleware pipeline is entered. So by the time `auth` middleware sees the request, the route parameters are already resolved Eloquent models.

