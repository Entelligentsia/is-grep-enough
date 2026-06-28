# Laravel Framework — contributor guide for coding agents

This is the source for `laravel/framework`, the core PHP framework powering Laravel
applications. It is a monorepo: the public package `laravel/framework` is split at
release time into the read-only `illuminate/*` components (Container, Database, etc.).

## Layout

- `src/Illuminate/` — every component lives in its own subdir, each a standalone package:
  - `Container/` — the service container (IoC), dependency injection, binding/resolution.
  - `Foundation/` — the `Application` itself, the HTTP and Console kernels, bootstrappers,
    service-provider registration, exception handling.
  - `Database/` — query builder, schema/migrations, connections, and `Database/Eloquent/`
    (the ORM: `Model`, the Eloquent query `Builder`, relations, collections, casts).
  - `Routing/` — the `Router`, `Route`, route matching, controllers, middleware binding.
  - `Http/` — `Request`, `Response`, `RedirectResponse`, the middleware pipeline.
  - `Support/` — helpers, `Collection`, `Str`, `Arr`, fluent helpers, and the `Facades/`
    (static proxies that resolve real instances out of the container).
  - `Console/` — Artisan commands, scheduling, command I/O.
  - `Queue/`, `Events/`, `Validation/`, `View/`, plus `Cache/`, `Auth/`, `Mail/`, `Bus/`,
    `Filesystem/`, `Session/`, `Notifications/`, `Broadcasting/`, and more.
- `tests/` — mirrors the component layout (`tests/Database/`, `tests/Routing/`, …).
- `composer.json` — the aggregate package; `replace` lists every `illuminate/*` subpackage.

## Build & test

- Install deps: `composer install`.
- Run the suite: `vendor/bin/phpunit` (or the bundled `./phpunit` wrapper).
- Target one area: `vendor/bin/phpunit tests/Database` or `--filter SomeTest`.
- Some integration tests need extensions/services (Redis, PDO drivers); those are skipped
  when the backing service is unavailable.
- Match the framework's minimum supported PHP version declared in `composer.json`.

## Conventions

- Code style is PSR-12; formatting is enforced by StyleCI (php-cs-fixer rules) on every PR,
  so do not hand-fight whitespace — follow the existing style of the file.
- Add or update tests under `tests/` for any behavior change; keep them deterministic.
- Bug-fix PRs target the current stable branch; new features target the next (`master`).
- Open PRs against `laravel/framework` itself — not the `illuminate/*` mirrors (read-only)
  nor the `laravel/laravel` application skeleton. Read `CONTRIBUTING.md` first.

## When navigating

This is a large codebase that leans heavily on the container, facades, and PHP magic
methods (`__call`, `__get`, `__callStatic`), so behavior is often indirected through
runtime binding rather than direct calls — a `Facade` resolves a bound singleton, and
methods may be forwarded or macro'd in. Prefer pinpoint structural lookups (find the
class, the binding in a service provider, the resolved accessor on a facade) over reading
whole files top to bottom, and trace from the facade or container binding to the concrete
implementation.
