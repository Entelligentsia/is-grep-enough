# Django — contributor guide for coding agents

Django is a high-level web framework written in **Python**. The framework code
lives under `django/`; the test suite and tooling live alongside it at the repo
root. It is a library, not an application — there is nothing to "run" except the
tests.

## Layout

- `django/db/` — the ORM. `models/` (the `Model` base, fields, `Manager`,
  `QuerySet`, `Q`/`F` expressions), `backends/` (per-engine database drivers),
  and `migrations/` (autodetector, state, operations, executor).
- `django/http/` — `HttpRequest`/`HttpResponse` and friends; the heart of the
  request/response cycle.
- `django/urls/` — URL resolver and reverser (`path()`, `re_path()`,
  `resolve()`, `reverse()`).
- `django/views/` — base views, the generic class-based views, decorators.
- `django/middleware/` — built-in middleware (common, csrf, gzip, security…).
- `django/template/` — the template engine: lexer, parser, `Node`s, context,
  and the built-in tags/filters under `defaulttags.py`/`defaultfilters.py`.
- `django/forms/` — `Form`/`ModelForm`, fields, widgets, formsets.
- `django/contrib/` — optional bundled apps: `admin`, `auth`, `sessions`,
  `staticfiles`, `gis`, `postgres`, etc. Each is a self-contained app.
- `django/core/` — framework plumbing: `handlers` (WSGI/ASGI entry points),
  `management` (the `manage.py` commands), `serializers`, `cache`, `mail`,
  `checks`, `signals`, `exceptions`.
- `django/conf/` — global settings, defaults, and project/app templates.
- `django/utils/` — shared helpers (encoding, dates, translation, functional).
- `tests/` — the test suite (hundreds of app-shaped subdirectories).
- `docs/` — reStructuredText documentation; every behavior change touches it.

## Build & test

There is no build step. Install in editable mode and run the suite with the
dedicated runner, not bare pytest:

- Full suite: `python tests/runtests.py`
- One module: `python tests/runtests.py forms_tests`
- Narrower: `python tests/runtests.py forms_tests.tests.test_forms`
- Parallel/verbose: add `--parallel=auto` / `-v 2`.
- Settings/DB are controlled by `--settings` or `tests/test_sqlite.py` (the
  default); other backends need a settings module with their `DATABASES`.
- `tox` runs the suite across supported Python versions and lint environments.
- Install test deps with `python -m pip install -e .` plus
  `pip install -r tests/requirements/py3.txt`.

## Conventions

- Follow **PEP 8**; formatting is enforced by **black**, imports by **isort**,
  and lint by **flake8** (config in `setup.cfg`/`pyproject.toml`). `pre-commit`
  runs them all.
- Code must keep the existing **public API stable**; deprecations go through the
  documented `RemovedInDjangoXXWarning` cycle.
- Every change needs **tests** under `tests/` and, for anything user-facing,
  **docs** in `docs/` plus a release note in `docs/releases/`.
- Write **docstrings** and clear comments; match the surrounding style.
- Read `docs/internals/contributing/` before submitting — commit message format,
  ticket references (Trac), and the CLA all matter.

## When navigating

This is a large codebase. Prefer pinpoint, structural lookups — locate the
specific class, method, or definition you need rather than reading whole
modules end to end. ORM and template internals in particular are deep; start
from the symbol and follow references outward.
