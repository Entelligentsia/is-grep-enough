# transcript: I'm planning a change to what happens around producing output and reported errors for a source file, so I need to understand the full journey from source tex...


💬 Let me load the LSP tool and start tracing the pipeline from program creation through emit.
  ▸ ToolSearch(select:LSP)

💬 I'll trace the full pipeline by looking up the key entry points across all stages in parallel.
  ▸ LSP(createProgram)
  ▸ LSP(createSourceFile)
  ▸ LSP(bindSourceFile)
  ▸ LSP(emitFiles)

💬 Now let me read the key sections of each stage — program creation, parsing, binding, type-checking, and emit — in parallel.
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)

💬 Now let me look at how `createProgram` drives file loading and binding, how `getTypeChecker` is exposed, and how `program.emit` connects to `emitFiles`.
  ▸ LSP(processSourceFile)
  ▸ LSP(getTypeChecker)
  ▸ LSP(getDiagnosticsProducingTypeChecker)
  ▸ LSP(getSemanticDiagnostics)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)

💬 Now let me read the `findSourceFile` body, `emitWorker`'s transformer assembly, and the actual checker trigger in `getBindAndCheckDiagnosticsForFileNoCache`.
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)

💬 Let me read how `findSourceFileWorker` actually calls parse and bind, and how `getTransformers` assembles the transform chain.
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ LSP(getTransformers)
  ▸ Read(/home/bench/repos/typescript/src/compiler/transformer.ts)
  ▸ LSP(getSourceFile CompilerHost)

💬 Let me check where `bindSourceFile` is actually called from `program.ts`, and look at how `createGetSourceFile` wires up parse+bind.
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ LSP(bindSourceFile program)

💬 Let me find exactly where `bindSourceFile` is called within program.ts.
  ▸ Bash(grep -n "bindSourceFile" /home/bench/repos/typescript/src/compiler/program.ts | head -20)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Bash(grep -rn "bindSourceFile\b" /home/bench/repos/typescript/src/compiler/ | grep -v "binder.ts")
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)

💬 Now let me read more of `initializeTypeChecker` to understand what the checker does after binding, and look at the parser's internal `parseSourceFile`.
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)

💬 Let me look at how `checker.getDiagnostics` does per-file lazy checking.
  ▸ LSP(getDiagnostics TypeChecker)
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)

💬 Let me read how `emitJsFileOrBundle` applies transforms and drives the printer.
  ▸ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)

💬 I now have a complete picture of all five stages. Here's the full walkthrough.  ---  ## Source text → emitted JavaScript & diagnostics  ### Stage 0 — Entry p...

──────── RESULT (success, 201763ms, 35 turns) ────────
I now have a complete picture of all five stages. Here's the full walkthrough.

---

## Source text → emitted JavaScript & diagnostics

### Stage 0 — Entry point (`program.ts`)

Everything starts at `createProgram` (program.ts:1515). It sets up mutable state (file lists, caches, resolution maps) and a `CompilerHost`, but does not yet bind or type-check anything. The host is the only I/O boundary: `createGetSourceFile` (program.ts:392) returns a closure that reads a file from disk and hands the text to the parser.

---

### Stage 1 — Parse (`parser.ts`)

Files are discovered depth-first inside `createProgram`. For each root name, `processSourceFile` → `findSourceFile` → `findSourceFileWorker` (program.ts:3545) calls `host.getSourceFile(fileName, sourceFileOptions)`. That calls the public `createSourceFile` (parser.ts:1344), which delegates to the internal `Parser.parseSourceFile`.

The parser:
- Runs the **scanner** over the raw text, producing a token stream.
- Builds an **AST** of `Node` objects up to a `SourceFile` root. Every node carries `pos`/`end` text offsets.
- Records **syntax errors** in `sourceFile.parseDiagnostics`.
- Initialises `sourceFile.bindDiagnostics = []` (an empty array the binder will fill).
- Sets `text`, `languageVersion`, `scriptKind`, calls `setExternalModuleIndicator`, and handles a top-level-await reparse for ES modules.

The returned `SourceFile` has a full AST but **no symbols, no control-flow graph, no type information**.

After `findSourceFileWorker` returns the file it recursively processes triple-slash references, `/// <reference types="…"/>` directives, and imported modules — each of which triggers another `findSourceFile` call. The `processingOtherFiles` / `processingDefaultLibFiles` arrays grow until the whole closure is covered; then they are assembled into the final `files` array at `onProgramCreateComplete` (program.ts:1725 area).

---

### Stage 2 — Bind (`binder.ts`)

Binding does **not** happen at `createProgram` time. It is deferred until the first call to `getTypeChecker()` (program.ts:2684):

```ts
function getTypeChecker() {
    return typeChecker || (typeChecker = createTypeChecker(program));
}
```

`createTypeChecker` (checker.ts) ends with a call to `initializeTypeChecker` (checker.ts:51555), which loops over every source file and calls `bindSourceFile(file, compilerOptions)` (binder.ts:502) for each.

The binder (`createBinder`) is a single shared closure. For each file it:
- Walks the AST depth-first, maintaining a stack of **container** nodes (functions, namespaces, source files, class bodies) and **block-scope containers**.
- Creates `Symbol` objects for every declaration and attaches them to the container's `locals` (or to the file's own `symbol.exports` for module-level exports).
- **Merges** multiple declarations of the same name into a single `Symbol` (e.g. function overloads, declaration merging).
- Builds the **control-flow graph**: `FlowNode` objects linked by antecedent pointers across branches, loops, `return`/`throw`, and exceptions. This graph drives narrowing in the checker.
- Emits binder errors into `file.bindDiagnostics` — duplicate identifiers, illegal uses in strict mode, etc.

After all files are bound, `initializeTypeChecker` does a second pass to merge global-scope symbols: for every non-module file, `mergeSymbolTable(globals, file.locals!)` (checker.ts:51577). Module augmentations are merged in a third pass.

---

### Stage 3 — Type checking (`checker.ts`)

The checker is a single large object created by `createTypeChecker`. It operates **per-file lazily**: `checkSourceFile` runs only when diagnostics for that file are requested.

The call chain for "give me semantic errors for file F":

```
program.getSemanticDiagnostics(F)
  → getDiagnosticsHelper(F, getSemanticDiagnosticsForFile)
      → getSemanticDiagnosticsForFile(F)
          → getBindAndCheckDiagnosticsForFile(F)          ← cached in cachedBindAndCheckDiagnosticsForFile
              → getBindAndCheckDiagnosticsForFileNoCache(F)
                  reads: F.bindDiagnostics             (from binder)
                  calls: typeChecker.getDiagnostics(F)
                      → getDiagnosticsWorker(F)
                          → checkSourceFileWithEagerDiagnostics(F)
                              → checkSourceFile(F)       ← the big traversal
          → getProgramDiagnostics(F)                     (option-level / file-inclusion errors)
```

Inside `checkSourceFile`, the checker walks every node. It resolves `Symbol` → `Type` mappings on demand — types are created lazily the first time a symbol or expression is asked about. Errors (wrong number of arguments, incompatible types, etc.) go into a `DiagnosticCollection` keyed by file name.

After getting the raw diagnostics, `getMergedBindAndCheckDiagnostics` (program.ts:2923) applies **comment directives**: any diagnostic on the line immediately after a `// @ts-ignore` or `// @ts-expect-error` is suppressed; unused `@ts-expect-error` directives produce their own errors.

Syntactic diagnostics (`program.getSyntacticDiagnostics`) come purely from `sourceFile.parseDiagnostics` — the parser fills them; the checker is not involved.

---

### Stage 4 — Emit (`emitter.ts`, `transformer.ts`)

`program.emit(sourceFile?, writeFileCallback?, …)` (program.ts:2688) calls `emitWorker` (program.ts:2718).

**First**, `emitWorker` calls `getTypeChecker()` to ensure the checker is initialised, then gets an `EmitResolver`:
```ts
const emitResolver = typeChecker.getEmitResolver(sourceFile, cancellationToken, …);
```
The `EmitResolver` is the narrow interface the emitter uses to query type-system facts without holding a reference to the full checker: "is this import elided?", "what is the value of this `const enum` member?", "is this declaration internal?".

**Second**, `getTransformers` (transformer.ts:120) assembles the ordered transformer lists. Script transformers run in this order (each conditional on options/target):

| Transformer | What it strips/rewrites |
|---|---|
| `transformTypeScript` | type annotations, `as` casts, `interface`/`type`, `const enum` |
| `transformLegacyDecorators` | `experimentalDecorators` syntax |
| `transformJsx` | JSX → `React.createElement` / `_jsx` |
| `transformESNext` … `transformES2015` | successively lower language features |
| `transformGenerators` | `function*` → state machines |
| `getModuleTransformer(moduleKind)` | `import`/`export` → CommonJS, AMD, ESM, etc. |

Custom transformers (from `customTransformers.before` / `.after`) are spliced in around the built-ins.

Declaration transformers run separately: just `transformDeclarations` (plus any `afterDeclarations`).

**Third**, `emitFiles` (emitter.ts:752) iterates over the output file set via `forEachEmittedFile`. For each pair (source file, output file names):

- **JS emit** (`emitJsFileOrBundle`, line 821):
  1. `transformNodes(…, scriptTransformers)` — runs the transform chain, producing a new transformed AST.
  2. `createPrinter(printerOptions, { onEmitNode, substituteNode })` — the printer has callbacks back into the transform layer for emit notifications and node substitution.
  3. `printSourceFileOrBundle` drives the printer over the transformed tree, node-by-node, writing text to a `TextWriter`. Source map information is collected alongside if enabled.
  4. `host.writeFile(jsFilePath, text)` writes the result to disk.

- **Declaration emit** (`emitDeclarationFileOrBundle`, line 886) runs the declaration transform chain. Errors produced by the declaration transformer (e.g., a type that can't be expressed in the public surface) are returned as `emitterDiagnostics` on the `EmitResult`.

- **Build info** (`emitBuildInfo`) writes `tsbuildinfo` JSON for incremental builds.

The `EmitResult` returned by `emitFiles` contains `{ emitSkipped, diagnostics, emittedFiles, sourceMaps }`.

---

### How the stages connect — the key joints

| Boundary | Mechanism |
|---|---|
| Parse → Bind | `bindDiagnostics = []` and `locals = undefined` on SourceFile; binder fills both. No AST mutation; new Symbol nodes are attached via `node.symbol`. |
| createProgram → Checker | `typeChecker` is `undefined` on the `Program` until first access; `getTypeChecker()` creates it lazily and `initializeTypeChecker` eagerly binds all files in that one shot. |
| Bind → Checker | The binder's `Symbol` graph and control-flow `FlowNode` graph live on AST nodes and in `file.locals`; the checker reads them directly. `file.bindDiagnostics` is read and merged in `getBindAndCheckDiagnosticsForFileNoCache`. |
| Checker → Emitter | `typeChecker.getEmitResolver()` — the resolver is the only channel; the emitter never calls `getTypeChecker()` directly. |
| Transform → Printer | `transformNodes` returns `{ transformed, emitNodeWithNotification, substituteNode }`; the printer calls these hooks for each node rather than owning emit logic itself. |
| Diagnostics assembly | `getSemanticDiagnosticsForFile` = bind diagnostics ∪ checker diagnostics ∪ program diagnostics, then filtered through `commentDirectives`. Declaration diagnostics live separately on `EmitResult`. |
