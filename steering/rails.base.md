# Rails — contributor guide for coding agents

Ruby on Rails is a full-stack web framework written in **Ruby**. The repository
is a monorepo: a collection of independently-versioned gems that ship together
under the `rails` umbrella. This file is the standing context for working here.

## Layout

Each top-level directory is a gem with its own `lib/`, `test/`, and `*.gemspec`.

- `activesupport/` — Ruby core extensions and utilities (`ActiveSupport`):
  `lib/active_support/core_ext/` (monkey-patches on `String`, `Hash`, `Array`,
  `Time`, etc.), `Concern`, `Callbacks`, `Notifications`, `Cache`.
- `activemodel/` — model-layer interfaces without persistence: validations,
  callbacks, `Attributes`, `Dirty`, `Serialization` (`ActiveModel`).
- `activerecord/` — the ORM (`ActiveRecord`). `ActiveRecord::Base`,
  `Relation` and `QueryMethods` (`where`/`joins`/`select`), the connection
  adapters under `lib/active_record/connection_adapters/`, migrations, and the
  schema/associations code.
- `actionpack/` — routing and controllers (`ActionController`,
  `ActionDispatch`). The router and middleware stack live in
  `lib/action_dispatch/`; controller behavior in `lib/action_controller/`.
- `actionview/` — view rendering, templates, helpers (`ActionView`).
- `actionmailer/` — email (`ActionMailer`). `activejob/` — background jobs
  (`ActiveJob`) with pluggable queue adapters.
- `actioncable/` — WebSockets. `activestorage/` — file attachments.
  `actiontext/` — rich text. `actionmailbox/` — inbound mail.
- `railties/` — the glue: app boot, `Rails::Application`, `Railtie`, the
  generators (`lib/rails/generators/`), and the `rails`/`rake` command line.
- `guides/` — the official documentation. `tools/`, `ci/` — repo tooling.

## Build & test

- Setup: `bundle install` at the repo root (a shared `Gemfile` covers all gems).
  Some suites need a running database/Redis; see each gem's `RUNNING_UNIT_TESTS`.
- Tests use **minitest**. Run a gem's whole suite from its directory:
  `cd activerecord && bin/test`, or `bundle exec rake test`.
- Narrow it down: `bin/test test/cases/finder_test.rb`, or a single test with
  `-n test_method_name` / `bin/test path:LINE`.
- ActiveRecord runs against multiple adapters: `bundle exec rake test:sqlite3`,
  `test:mysql2`, `test:postgresql`.

## Conventions

- Follow the existing style; it is enforced by **RuboCop** (`.rubocop.yml` at the
  root). Run `bundle exec rubocop` before submitting.
- Every Ruby file starts with `# frozen_string_literal: true`.
- Read `CONTRIBUTING.md` and the "Contributing to Ruby on Rails" guide. Keep PRs
  focused; add a `CHANGELOG.md` entry in the affected gem when behavior changes.
- Prefer the framework's own idioms (`ActiveSupport::Concern` for mixins,
  `class_attribute`, `delegate`, the callback/notification systems) over ad-hoc
  code. Match the patterns in the surrounding file.
- Files end with a newline; tests accompany behavior changes.

## When navigating

This is a large multi-gem monorepo with heavy metaprogramming — methods are
frequently defined dynamically (`define_method`, `method_missing`, generated
modules, `included`/`ClassMethods` blocks), so a symbol's definition is often not
where grep for `def` would suggest. Most questions are "where is X defined",
"who calls X", or "how does subsystem Y flow end to end" across gem boundaries.
Prefer pinpoint, structural lookups over reading whole files top to bottom.
