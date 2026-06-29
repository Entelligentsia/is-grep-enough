# transcript: I'm planning a change to what happens around producing output and reported errors for a source file, so I need to understand the full journey from source tex...


💬 I'll navigate this with the LSP tool, tracing each stage in order. Let me load it and start finding the key entry points across all five modules.
  ▸ ToolSearch(select:LSP)

💬 Now let me find the key entry points across all five pipeline stages in parallel.
  ▸ LSP(createProgram)
  ▸ LSP(createScanner)
  ▸ LSP(bindSourceFile)
  ▸ LSP(createTypeChecker)
  ▸ LSP(emitFiles)

💬 Good. Now I'll read focused sections of each stage's entry point in parallel.
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)

💬 Now I need to trace how `createProgram` wires everything together — file loading, binding, checker creation, and emit. Let me look at those connection points.
  ▸ LSP(processRootFile)
  ▸ LSP(getTypeChecker)
  ▸ LSP(createSourceFile)
  ▸ LSP(getEmitResolver)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ LSP(emit program)

💬 Now let me read the `emitWorker` (how emit creates the resolver and calls `emitFiles`), how `processSourceFile` calls the parser and binder, and `getEmitReso...
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ LSP(processSourceFile)
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ LSP(getSemanticDiagnosticsForFile)
  ▸ LSP(transformNodes)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/transformer.ts)

💬 Now I need to see where binding happens after parsing, how the host's `getSourceFile` chain works, and how the printer runs after transforms.
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)
  ▸ LSP(getDiagnostics checker)
  ▸ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)

💬 Let me look at the checker's `getDiagnostics` to understand lazy type-checking, and where `bindSourceFile` gets called in the program creation flow.
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/program.ts)

💬 I need to find where `bindSourceFile` is called during program construction. Let me check the call sites.
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/typescript/src/compiler/binder.ts","line":502,"character":17})

💬 `bindSourceFile` is called from within `checker.ts`. Let me see those call sites — both the import alias and the usage in `initializeTypeChecker`.
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)

💬 Now I need to see how `initializeTypeChecker` is called — whether it's immediate or lazy — and how `createTypeChecker` sets up the checker object.
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/typescript/src/compiler/checker.ts","line":51555,"character":14})
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)

💬 Now let me look at the internal `Parser.parseSourceFile` to see how it uses the scanner, and how the `checkSourceFile` function works.
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ LSP(checkSourceFile)
  ▸ Read(/home/bench/repos/typescript/src/compiler/checker.ts)

💬 Now I have everything I need. Here's the complete picture of how all five stages connect:  ---  ## TypeScript compiler pipeline: source text → JS + diagnosti...

──────── RESULT (success, 218548ms, 42 turns) ────────
Now I have everything I need. Here's the complete picture of how all five stages connect:

---

## TypeScript compiler pipeline: source text → JS + diagnostics

### Stage 1 — Program construction (`program.ts:createProgram`, line 1515)

`createProgram` is the orchestrator. It accepts root file names and `CompilerOptions`, then recursively discovers every file the program needs:

```
createProgram
  → forEach(rootNames, processRootFile)         # line 1782
  → processSourceFile → findSourceFileWorker    # line 3486, 3545
  → host.getSourceFile(fileName, options)       # line 3635
      → readFile(fileName)                      # I/O
      → createSourceFile(fileName, text, ...)   # parser.ts:1344 — parses
  → collectExternalModuleReferences             # line 3318 — extracts imports
  → processImportedModules                      # recurse for each import
```

After the full file graph is walked, `program.files` is the complete `SourceFile[]`. **Binding and type-checking are not done yet** — only I/O and parsing.

---

### Stage 2 — Scanning + parsing (`scanner.ts:1022`, `parser.ts:1344`)

`createSourceFile` calls `Parser.parseSourceFile` (the `Parser` namespace is a module-level singleton). The parser creates one `Scanner` (via `createScanner`), which it drives via demand:

- The scanner holds `pos`, `end`, `token`, `tokenValue`, `tokenFlags` as local `var`s for speed. Each call to `scan()` advances `pos` and returns the next `SyntaxKind`.
- The parser is a **recursive-descent, one-token lookahead** parser. Each `parseXxx` function reads tokens by calling `nextToken()` (which calls `scanner.scan()`), builds an `AST Node` with `pos`/`end` into the source text, and returns it.
- The returned `SourceFile` carries `.text` (raw source), `.statements` (top-level AST), `.parseDiagnostics` (syntax errors), and `.bindDiagnostics` initialized to `[]` (to be filled by the binder).

The scanner never produces a full token stream up front; tokens are consumed on demand as the parser descends.

---

### Stage 3 — Binding (`binder.ts:571`, called from `checker.ts:51558`)

**Binding is deferred until the type checker is first created.** `program.getTypeChecker()` is lazy (program.ts:2684):

```ts
typeChecker || (typeChecker = createTypeChecker(program))
```

`createTypeChecker` runs immediately to completion, and the last thing it does before returning `checker` is call `initializeTypeChecker()` (checker.ts:2410). That function immediately binds **all** source files in a single pass:

```ts
// checker.ts:51557
for (const file of host.getSourceFiles()) {
    bindSourceFile(file, compilerOptions);   // binder.ts:502
}
```

The binder (`createBinder` returns a closure, binder.ts:509) walks every AST node and:

- Creates `Symbol` objects for every declaration and installs them into `file.locals` (or into the enclosing container's symbol table).
- Builds the **control flow graph** (`FlowNode` objects) used for type narrowing.
- Fills `file.bindDiagnostics` with binding-phase errors (duplicate identifiers, illegal `use strict`, etc.).

After the per-file loop, `initializeTypeChecker` merges non-module files' `locals` into the `globals` symbol table (line 51577) and processes module augmentations — so the global symbol table is coherent before any type-checking begins.

---

### Stage 4 — Type checking + diagnostics (`checker.ts`, `program.ts:2858`)

Type checking is **lazy per file** — it runs on demand when someone calls `program.getSemanticDiagnostics(file)`:

```
program.getSemanticDiagnosticsForFile(file)       # program.ts:2858
  → getBindAndCheckDiagnosticsForFile             # line 2869, cached per file
      → typeChecker.getDiagnostics(file)          # checker.ts:49689
          → getDiagnosticsWorker
              → checkSourceFileWithEagerDiagnostics
                  → checkSourceFile               # line 49547
                      → checkSourceFileWorker     # line 49578
                          → forEach(node.statements, checkSourceElement)
  → concatenate(bindDiagnostics, checkDiagnostics, programDiagnostics)
```

`checkSourceFileWorker` guards against re-checking via `NodeCheckFlags.TypeChecked` (line 49580). It recursively calls `checkSourceElement` on every statement, which fans out to type-specific checkers (`checkVariableStatement`, `checkFunctionDeclaration`, etc.). Each of those calls `resolveSymbol` / `getTypeOfSymbol` / `checkAssignability` and accumulates diagnostics in the checker's `diagnostics` collection.

Some diagnostics are deferred via `addLazyDiagnostic` callbacks (e.g., `noUnusedLocals` at line 49611) — those are flushed by `ensurePendingDiagnosticWorkComplete` before `getDiagnosticsWorker` returns.

The program merges three sources into the final per-file diagnostic list (program.ts:2863–2866):
- `sourceFile.bindDiagnostics` — from Stage 3
- `typeChecker.getDiagnostics(file)` — from Stage 4
- `getProgramDiagnostics(file)` — options errors, unresolved references, config issues

`ts-ignore` / `ts-expect-error` directives are processed by `getDiagnosticsWithPrecedingDirectives` (program.ts:2947) which suppresses or converts diagnostics in the merged list.

---

### Stage 5 — Emit (`program.ts:2688`, `emitter.ts:752`, `transformer.ts:248`)

`program.emit()` calls `emitWorker` (program.ts:2718), which does two things before touching the emitter:

1. **Get the emit resolver** — `typeChecker.getEmitResolver(file, ...)` (checker.ts:2506). This first calls `getDiagnostics(file)` (unless `skipDiagnostics` is set) to ensure the checker has walked the file, then returns the `emitResolver` object (created at checker.ts:1550 via `createResolver()`). The resolver answers questions the emitter will ask — "is this import type-only?", "does this variable need to be preserved?", "what is the constant value of this expression?"

2. **Call `emitFiles`** (emitter.ts:752) with the resolver, an `EmitHost`, the transformers, and the target file.

`emitFiles` calls `forEachEmittedFile` to iterate outputs, then for each calls `emitSourceFileOrBundle`, which splits into two sub-paths:

**JS output** (`emitJsFileOrBundle`, emitter.ts:821):
```
transformNodes(resolver, host, factory, options, [sourceFile], scriptTransformers)
  # transformer.ts:248 — builds TransformationContext, chains transformers
  # transformers run in order: ts.ts (strip types) → decorators → es2015/etc. → modules
  # each transformer returns a new/modified subtree; they compose via the context's onEmitNode hook
→ createPrinter(printerOptions, { onEmitNode, substituteNode, ... })
→ printSourceFileOrBundle(jsFilePath, ...)
    → pipelineEmit → pipelineEmitWithHint → pipelineEmitWithHintWorker
        → dispatch to emitSourceFile / emitFunctionDeclaration / etc.
        → writes tokens via TextWriter
→ writeFile(host, emitterDiagnostics, jsFilePath, outputText)
```

**Declaration output** (`emitDeclarationFileOrBundle`, emitter.ts:886):
Same transform/print pipeline but using `declarationTransformers` (primarily `transformers/declarations.ts`), which strips all implementation details and synthesizes the `.d.ts` AST.

---

### How the stages connect — data flows

| What | Produced by | Consumed by |
|------|-------------|-------------|
| `SourceFile.text` | host I/O | scanner |
| `SourceFile.statements` (AST) | parser | binder, checker, emitter |
| `SourceFile.parseDiagnostics` | parser | program (getSyntacticDiagnostics) |
| `SourceFile.locals`, `Symbol` objects | binder | checker (symbol resolution) |
| `SourceFile.bindDiagnostics` | binder | program (merged with check diags) |
| Control flow graph (`FlowNode`) | binder | checker (narrowing) |
| `diagnostics` collection (per-file) | checker | program (getSemanticDiagnostics) |
| `EmitResolver` | checker | emitter (answers resolver questions) |
| Transformed AST | transformers | printer |
| Output text | printer | host.writeFile |

### Laziness boundaries

- **Parsing** is eager during `createProgram` — every file is read and parsed to find its imports.
- **Binding** is deferred until the first `getTypeChecker()` call, then runs eagerly across **all** files at once (because the global symbol table requires all files to be bound before it can be coherent).
- **Type checking** is lazy per-file — each `SourceFile` is type-checked the first time diagnostics are requested for it, with results cached in `cachedBindAndCheckDiagnosticsForFile`.
- **Emit** is on-demand and always triggers at least the emit resolver (which triggers type-checking) unless `emitResolverSkipsTypeChecking` is true.
