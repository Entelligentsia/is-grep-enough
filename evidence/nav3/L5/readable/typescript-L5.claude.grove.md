# transcript: I'm planning a change to what happens around producing output and reported errors for a source file, so I need to understand the full journey from source tex...


💬 I'll use grove to map the pipeline stages structurally across the key modules.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__map,mcp__grove__source)

💬 Let me map the pipeline orchestration in `program.ts` and the entry points of each stage in parallel.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/typescript/src/compiler/program.ts","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/typescript/src/compiler/scanner.ts","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/typescript/src/compiler/parser.ts","detail":0})

💬 Now let me read the key orchestration function and the stage entry points in parallel.
  ▸ mcp__grove__source({"file":"/home/bench/repos/typescript/src/compiler/program.ts","name":"createProgram"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","name":"createSourceFile"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","name":"bindSourceFile"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/typescript/src/compiler/program.ts","name":"createProgram"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","name":"bindSourceFile","refs":true})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","name":"createTypeChecker"})
  ▸ mcp__grove__source({"id":"typescript:src/compiler/program.ts#createProgram@1514"})
  ▸ Bash(grep -n "bindSourceFile\|createTypeChecker\|createSourceFile\|getTypeChecker\|emit\b" /home/bench/repos/typescript/src/compiler/program.ts | head -80)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)

💬 Good. Now let me look at file loading, binder connection, and semantic diagnostics.
  ▸ Bash(grep -n "processSourceFile\|findSourceFile\|processRootFile\|bindSourceFile\|getSemanticDiagnosticsForFile\|getSyntacticDiagnosticsForFile\|processImportedMo...)
  ▸ Bash(grep -n "export function bindSourceFile\|export function bind\b" /home/bench/repos/typescript/src/compiler/binder.ts | head -20)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)

💬 Now let me look at the parse call in `findSourceFileWorker` and the emit pipeline entry.
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Bash(grep -n "export function emitFiles\|function emitFiles\|export function createPrinter\|getTransformers\|createTransformationContext" /home/bench/repos/typesc...)
  ▸ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
  ▸ Bash(grep -n "export function createSourceFile\|parseSourceFile\|parseNodeFactory\|function parseSourceFileWorker" /home/bench/repos/typescript/src/compiler/parse...)

💬 Now let me look at the binder entry and how it's called from the checker, plus the transformation phase.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Bash(grep -n "bindSourceFile\|import.*binder\|from.*binder" /home/bench/repos/typescript/src/compiler/checker.ts | head -20)
  ▸ Bash(grep -n "export function transformNodes\|function transformNodes\|scriptTransformers\|declarationTransformers\|getTransformers" /home/bench/repos/typescript/...)
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
  ▸ Bash(grep -n "function getDiagnostics\b\|getDiagnostics(" /home/bench/repos/typescript/src/compiler/checker.ts | head -20)
  ▸ Bash(grep -n "getTransformers\b" /home/bench/repos/typescript/src/compiler/transformer.ts /home/bench/repos/typescript/src/compiler/emitter.ts 2>/dev/null | head -20)
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/transformer.ts)

💬 Let me check how the printer is invoked after transformation, and confirm where `host.getSourceFile` calls the parser.
  ▸ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)

💬 I now have enough information to give you a complete, accurate walkthrough. Here it is:  ---  ## The full TypeScript compiler pipeline  ### 1. Program creati...

──────── RESULT (success, 165270ms, 33 turns) ────────
I now have enough information to give you a complete, accurate walkthrough. Here it is:

---

## The full TypeScript compiler pipeline

### 1. Program creation (`program.ts`)

Everything starts with `createProgram()` (line 1515). It accepts root file names, `CompilerOptions`, and a `CompilerHost`. The host is the I/O abstraction — `getSourceFile`, `writeFile`, `fileExists`, etc. The program is the central object that all later stages operate on.

`createProgram` does not eagerly do parsing or type checking. Its main job during construction is **discovering all files** and **parsing them**. It processes root files and follows the graph:

```
processRootFile → processSourceFile → findSourceFile → findSourceFileWorker
```

Inside `findSourceFileWorker` (line 3545), the key step is:

```ts
const file = host.getSourceFile(fileName, sourceFileOptions, onError, shouldCreateNewSourceFile);
```

The default `CompilerHost.getSourceFile` (line 410) reads the file from disk and calls `createSourceFile(fileName, text, languageVersionOrOptions, setParentNodes)` from the parser. After each file is loaded, `processImportedModules` recurses into its imports, then `processReferencedFiles` and `processTypeReferenceDirectives` follow `/// <reference>` directives. This continues depth-first until the whole reachable graph is materialized.

---

### 2. Scanning & parsing (`scanner.ts`, `parser.ts`)

`createSourceFile` (parser.ts:1344) calls `Parser.parseSourceFile` (line 1603) → `parseSourceFileWorker` (line 1803).

The **scanner** (`scanner.ts`) is a cursor over text. It maintains a position and exposes `scan()`, which advances through characters and returns a `SyntaxKind` token. The scanner is not a standalone pass — the parser drives it token by token.

The **parser** (`parseSourceFile` and the inner `Parser` namespace) is a hand-written recursive descent that calls `scanner.scan()` on demand. It builds `Node` objects (all typed in `types.ts`) and assembles them into a `SourceFile` — the root of the AST. Every node carries `pos`/`end` byte offsets into the original text.

**Parse-time errors** are collected into `sourceFile.parseDiagnostics` as the parser runs. These are the syntactic diagnostics; `program.getSyntacticDiagnosticsForFile` (line 2831) simply returns this array directly (plus `additionalSyntacticDiagnostics` for JS files).

The scanner also captures `commentDirectives` (e.g., `// @ts-ignore`) on `sourceFile.commentDirectives`, which the checker later consults.

---

### 3. Binding (`binder.ts`)

The binder is **not called during `createProgram`**. It is called lazily the first time the type checker is instantiated.

`program.getTypeChecker()` (line 2684):
```ts
return typeChecker || (typeChecker = createTypeChecker(program));
```

`createTypeChecker` (in `checker.ts`) calls `initializeTypeChecker()` (line 51555), which immediately loops over every source file and calls:
```ts
bindSourceFile(file, compilerOptions);
```

`bindSourceFile` (`binder.ts:502`) wraps `binder(file, options)` — a closure created by `createBinder()`. The binder does a second tree walk:

- Creates `Symbol` objects and links them to their declaring nodes via `node.symbol` and to their container's `symbol.members`/`symbol.exports`/`file.locals`.
- Builds the **control flow graph** (flow nodes encoding reachability for `strictNullChecks` and `definitelyAssigned` analysis).
- Emits **bind-time diagnostics** into `sourceFile.bindDiagnostics` — things like duplicate identifiers and illegal `use strict` placements that are diagnosable without type information.

After binding all files, `initializeTypeChecker` also merges globals: script-mode files have their `file.locals` merged into `globals`, ambient module augmentations are collected, etc.

---

### 4. Type checking & diagnostics (`checker.ts`)

The checker is one enormous module (~55k lines). It is fully lazy per-file: it does not check a `SourceFile` unless asked.

When `program.getSemanticDiagnosticsForFile(sourceFile, ...)` is called (line 2858), it calls:

```
getBindAndCheckDiagnosticsForFileNoCache
  → typeChecker.getDiagnostics(sourceFile, cancellationToken)
    → getDiagnosticsWorker
      → checkSourceFileWithEagerDiagnostics
        → checkSourceFile(sourceFile)
```

`checkSourceFile` walks the AST, resolves names to `Symbol`s (using the binder's symbol tables), infers and checks `Type`s, and adds diagnostics to the checker's internal `DiagnosticCollection` keyed by file name.

The checker has its own internal laziness: `addLazyDiagnostic` can defer callbacks, and `ensurePendingDiagnosticWorkComplete` flushes them. In language-service mode diagnostics can be even more granular, but for `tsc` the eager path is taken.

Back in `program.getSemanticDiagnosticsForFile` the final result is:
```ts
concatenate(
  filterSemanticDiagnostics(getBindAndCheckDiagnosticsForFile(...), options),  // bindDiagnostics + checkDiagnostics
  getProgramDiagnostics(sourceFile),  // option-level diagnostics recorded during createProgram
)
```

Results are cached in `cachedBindAndCheckDiagnosticsForFile` so a second call for the same file is free.

`getPreEmitDiagnostics` (exported from program.ts, line 634) is the convenience function callers like `tsc` use — it collects global checker diagnostics, options diagnostics, and per-file syntactic + semantic diagnostics all at once.

---

### 5. Emit (`emitter.ts`, `transformer.ts`, `transformers/`)

`program.emit(sourceFile?, ...)` → `emitWorker` (line 2718).

The first thing `emitWorker` does is:
```ts
const typeChecker = getTypeChecker();
const emitResolver = typeChecker.getEmitResolver(sourceFile, cancellationToken, ...);
```

`getEmitResolver()` returns an `EmitResolver` — a bundle of query functions that give the emitter access to checker state (e.g., "is this symbol referenced?", "what is the constant value of this enum member?", "is this import type-only?"). Calling it also ensures the file is bound and partially checked.

Then:
```ts
emitFiles(emitResolver, getEmitHost(writeFileCallback), sourceFile, getTransformers(options, ...))
```

**`getTransformers`** (transformer.ts:120) returns two sets:
- **`scriptTransformers`** (for `.js` output): always starts with `transformTypeScript` (strips type annotations, `declare`, `namespace`, etc.), then conditionally `transformLegacyDecorators`, `transformJsx`, then a chain of ES-version downgrade transformers (`transformESNext` → ... → `transformES2015` + `transformGenerators`), and finally the **module transformer** (`transformCommonJSModule`, `transformESModule`, etc.). Custom `before`/`after` transforms bracket this chain.
- **`declarationTransformers`** (for `.d.ts` output): just `transformDeclarations`, which is where the `EmitResolver` is heavily used to decide which declarations survive into the `.d.ts`.

**`emitFiles`** (emitter.ts:752) iterates source files via `forEachEmittedFile`, calling `emitSourceFileOrBundle` for each, which splits into:

**JS path (`emitJsFileOrBundle`):**
1. `transformNodes(resolver, host, factory, options, [sourceFile], scriptTransformers)` — runs all script transformers in sequence. Each transformer gets the result of the previous one; together they progressively rewrite the AST from TypeScript-plus-ESNext down to the target dialect.
2. `createPrinter(printerOptions, { onEmitNode, substituteNode, ... })` — the printer is wired back to the transformation context via hooks so transformers can inject substitutions during printing.
3. `printSourceFileOrBundle(jsFilePath, ..., transform, printer, ...)` — the printer walks the transformed AST and writes text into a `TextWriter`, with source-map bookkeeping along the way.
4. `host.writeFile(jsFilePath, text, ...)` — the text is handed to the host for I/O.

**Declaration path (`emitDeclarationFileOrBundle`):**
1. `transformNodes(..., declarationTransformers)` — `transformDeclarations` rebuilds a `.d.ts` AST using the `EmitResolver` to filter unexported/private members.
2. Same printer mechanism → `host.writeFile(declarationFilePath, ...)`.

---

### How the stages connect: the key seams

| Seam | Data crossing it |
|---|---|
| Parser → everything downstream | `SourceFile` (AST) + `sourceFile.parseDiagnostics` |
| Program → binder | `createTypeChecker(program)` triggers `bindSourceFile` on all files |
| Binder → checker | `Symbol` tables on nodes/files; `sourceFile.bindDiagnostics` |
| Checker → program (diagnostics) | `typeChecker.getDiagnostics(file)` pulled by `getSemanticDiagnosticsForFile` |
| Checker → emitter | `EmitResolver` returned by `typeChecker.getEmitResolver()` |
| Transformer → printer | Transformed AST nodes + `onEmitNode`/`substituteNode` hooks |
| Emitter → host | `host.writeFile(path, text, ...)` |

The critical laziness points are: **binding is triggered by the first `getTypeChecker()` call**, and **checking of an individual file happens only when diagnostics for that file are requested** (or when emit needs the resolver). This is what allows the language service to check files incrementally and on-demand.
