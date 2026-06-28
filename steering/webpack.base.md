# webpack — contributor guide for coding agents

webpack is a JavaScript (Node.js) module bundler. The core engine lives in `lib/`,
is built around the [tapable](https://github.com/webpack/tapable) hook system, and
is extended almost entirely through plugins that tap into those hooks.

## Layout

- `lib/` — the engine. Key entry points:
  - `Compiler.js` — top-level orchestrator; owns the run/watch lifecycle and the
    main hooks. `Compilation.js` — a single build pass; holds modules, chunks,
    assets, and most of the interesting hooks.
  - `NormalModule.js` (+ `Module.js`, `NormalModuleFactory.js`) — how source files
    become modules, run through loaders, and are parsed.
  - `ModuleGraph.js` / `ChunkGraph.js` — the two graphs that relate modules,
    dependencies, and chunks; most analysis and codegen reads from these.
  - `dependencies/` — one class per dependency kind (e.g. `HarmonyImportDependency`,
    `CommonJsRequireDependency`), each with a matching `*Template` for codegen.
  - `optimize/` — chunk/module optimization plugins (SplitChunksPlugin,
    minimizers, concatenation, tree-shaking helpers).
- `lib/<topic>/` — feature areas (`web`, `node`, `wasm`, `esm`, `cache`, `stats`,
  `runtime`, `library`) each providing plugins composed by `WebpackOptionsApply.js`.
- `schemas/` — JSON schemas for configuration (validated at runtime).
- `declarations/` and `types.d.ts` — generated/maintained TypeScript declarations.
- `test/` — the test suites (see below). `bin/` — the CLI shim. `hot/`, `buildin/`,
  `runtime/` — code shipped into bundles.

## Build & test

- Node.js + `yarn`. Install with `yarn` (uses the committed lockfile).
- `yarn test` — full Jest suite. It is large and slow; prefer targeting a suite:
  - `test/cases/` — runtime behavior cases compiled and executed.
  - `test/configCases/` — full config fixtures asserting build output.
  - `test/*.unittest.js` — unit tests. `test/__snapshots__/` — stats/output snapshots.
  - Run a subset with `yarn jest <pattern>` or `yarn jest -t "<name>"`.
  - Update snapshots deliberately with `yarn jest -u` only when output truly changed.
- `yarn lint` — ESLint + Prettier + spelling + schema/type checks. `yarn fix` autofixes.
- `yarn type-check` — validates JSDoc-driven TypeScript types; `yarn special-lint`
  regenerates `types.d.ts` and code-generated files.

## Conventions

- Plain JavaScript with rich JSDoc type annotations — no `.ts` source; types come
  from JSDoc and are checked via `tsc`. Keep annotations accurate when editing.
- Extend behavior with a plugin: a class exposing `apply(compiler)` that taps
  hooks (`compiler.hooks.*`, `compilation.hooks.*`) via tapable
  (`.tap`/`.tapAsync`/`.tapPromise`). Register it in `WebpackOptionsApply.js` if it
  is part of the default pipeline. Avoid reaching into internals across modules.
- Formatting/style is enforced — run `yarn lint` before finishing; commits should
  be lint- and type-clean. Add tests under the matching `test/` suite.
- Dependencies come in pairs: the `Dependency` subclass plus its `Template`.

## When navigating

This is a large codebase with deep plugin/hook indirection — a single feature is
often spread across a plugin that taps a hook, the hook's declaration on
`Compiler`/`Compilation`, and the dependency/template that does the actual work.
Prefer pinpoint structural lookups (find the hook name, the plugin that taps it,
the specific class/method) over reading whole files top to bottom. Start from the
hook or symbol name and follow the `apply`/`tap` chain rather than scanning `lib/`.
