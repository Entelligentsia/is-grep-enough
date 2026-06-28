# TypeScript — contributor guide for coding agents

TypeScript is the compiler, language service, and standard library for the
TypeScript language. It is **self-hosted**: the codebase is written in TypeScript
and compiled with Node.js using a prior build of itself.

## Layout

- `src/compiler/` — the core. The pipeline runs scanner → parser → binder →
  checker → emitter: `scanner.ts` (text to tokens), `parser.ts` (tokens to AST,
  producing `SourceFile`/`Node`), `binder.ts` (builds `Symbol`s and scopes),
  `checker.ts` (the type checker — by far the largest file, tens of thousands of
  lines, resolves `Symbol`s and `Type`s and reports most diagnostics), and the
  emitters (`emitter.ts`, transformers under `src/compiler/transformers/`).
  Driver/orchestration lives in `program.ts` (`Program`), `types.ts` (core data
  shapes), and `utilities.ts`.
- `src/services/` — the language service powering editor features (completions,
  rename, find-all-refs, quick info, refactors, code fixes).
- `src/server/` — `tsserver`, the standalone protocol server editors talk to.
- `src/tsc/` — the `tsc` command-line entry point.
- `src/lib/` — the bundled `lib.*.d.ts` standard library declarations (DOM,
  ES20xx, etc.). `dom.generated.d.ts` is generated, not hand-edited.
- `tests/cases/` — test inputs: `compiler/`, `conformance/`, `fourslash/`
  (language-service tests with marker syntax).
- `tests/baselines/reference/` — expected outputs (`.js`, `.types`, `.symbols`,
  `.errors.txt`) that tests are diffed against.

## Build & test

- Install once with `npm ci`.
- Build with the `hereby` task runner (`npx hereby` or `npm run build`).
  Useful targets: `hereby local` (full build into `built/local/`),
  `hereby tsc`, `hereby lkg` (refresh the last-known-good compiler).
- Run tests with `hereby tests` then `hereby runtests-parallel`, or filter a
  subset via `hereby runtests --tests=<name>`.
- Tests are **baseline-driven**: a test compiles a case and diffs the result
  against `tests/baselines/reference/`. When a change intentionally alters
  output, run `hereby baseline-accept` to copy `tests/baselines/local/` over the
  reference baselines, then review the diff carefully before committing.
- Lint and format with `hereby lint` (ESLint) and the repo's `dprint` config.

## Conventions

- The compiler has **no external runtime dependencies** — do not add npm packages
  to `src/compiler/`. Use the existing internal helpers in `core.ts`/`utilities.ts`.
- Follow the project coding guidelines: prefer `undefined` over `null`,
  use the established naming and brace style, and avoid `for...in`. Match the
  surrounding code rather than introducing new patterns.
- Prefer performance-conscious code in hot paths (the checker runs constantly);
  avoid unnecessary allocations and closures in inner loops.
- New diagnostics go in `diagnosticMessages.json`; run the generator rather than
  editing generated files by hand.
- Every change should come with a test case and accepted baselines.

## When navigating

`checker.ts` alone is enormous (tens of thousands of lines), and `parser.ts`,
`utilities.ts`, and `types.ts` are also very large. Do not read these whole.
Locate the relevant function, `Symbol`/`Type` flag, or diagnostic by name and
jump straight to it; trace behavior through targeted, structural lookups rather
than scanning files end to end.
