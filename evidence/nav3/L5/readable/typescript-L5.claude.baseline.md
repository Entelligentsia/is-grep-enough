# transcript: I'm planning a change to what happens around producing output and reported errors for a source file, so I need to understand the full journey from source tex...


💬 I'll explore the pipeline in parallel across the main stages so I can give you a grounded walkthrough.

  ▸ Agent(Explore program creation and source file parsing pipeline)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/typescript/src/compiler -name "*.ts" | head -20)
      ↳ Bash(grep -n "export.*function createProgram\|export.*const createProgram" /home/bench/repos/typescript/src/compiler/program.ts | head -5)
      ↳ Bash(grep -n "export.*function.*SourceFile\|export.*function.*parseSourceFile\|export.*function createSourceFile" /home/bench/repos/typescript/src/compiler/parser...)
      ↳ Bash(grep -n "export.*function createScanner" /home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "function processRootFile\|function findSourceFile\|function getSourceFile" /home/bench/repos/typescript/src/compiler/program.ts | head -10)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "function processSourceFile" /home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "getSourceFile.*function\|function.*getSourceFile" /home/bench/repos/typescript/src/compiler/program.ts | head -10)
      ↳ Bash(grep -n "function createCompilerHost" /home/bench/repos/typescript/src/compiler/*.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "function initializeState" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "let scanner\|const scanner\|var scanner" /home/bench/repos/typescript/src/compiler/parser.ts | head -5)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Bash(grep -n "function scan()" /home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Bash(grep -n "function parseSourceFileWorker" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "function processImportedModules" /home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "function nextToken()" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "function nextTokenWithoutCheck" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "function addFileToFilesByName" /home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ ⟹ returned to parent


  ▸ Agent(Explore binder and how it connects to checker)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/typescript/src/compiler -name "binder.ts" -o -name "checker.ts" -o -name "program.ts" | head -20)
      ↳ Bash(grep -n "function bindSourceFile\|function createTypeChecker\|function getTypeChecker" /home/bench/repos/typescript/src/compiler/binder.ts /home/bench/repos/...)
      ↳ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "getDiagnostics\|bindSourceFile\|\.getDiagnostics" /home/bench/repos/typescript/src/compiler/checker.ts | head -30)
      ↳ Bash(grep -n "getDiagnostics\|getSemanticDiagnostics" /home/bench/repos/typescript/src/compiler/program.ts | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "function bind(" /home/bench/repos/typescript/src/compiler/binder.ts)
      ↳ Bash(grep -n "file\.flowNode\|file\.flowStart\|file\.endFlowNode" /home/bench/repos/typescript/src/compiler/binder.ts | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
      ↳ Bash(grep -n "file\.\(locals\|bindDiagnostics\|flowNode\|symbolCount\|classifiableNames\)" /home/bench/repos/typescript/src/compiler/binder.ts | head -30)
      ↳ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
      ↳ Bash(grep -n "flowNode\|startFlowNode\|endFlowNode" /home/bench/repos/typescript/src/compiler/binder.ts | head -40)
      ↳ Bash(grep -n "function bindContainer\|function bindChildren" /home/bench/repos/typescript/src/compiler/binder.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
      ↳ Bash(grep -n "function checkSourceFile" /home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Bash(grep -n "function createProgram\|const program" /home/bench/repos/typescript/src/compiler/program.ts | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "initializeTypeChecker" /home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "initializeTypeChecker" /home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/checker.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "bindDiagnostics\s*=" /home/bench/repos/typescript/src/compiler/program.ts | head -20)
      ↳ Bash(grep -n "sourceFile.bindDiagnostics" /home/bench/repos/typescript/src/compiler/program.ts | head -10)
      ↳ Bash(find /home/bench/repos/typescript/src -name "*.ts" -exec grep -l "bindDiagnostics.*=" {} \; | head -10)
      ↳ Bash(grep -n "bindDiagnostics" /home/bench/repos/typescript/src/compiler/parser.ts | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "file\.bindDiagnostics\.push\|this\.bindDiagnostics\.push" /home/bench/repos/typescript/src/compiler/binder.ts | head -5)
      ↳ ⟹ returned to parent


  ▸ Agent(Explore emit pipeline and transformers)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/typescript/src/compiler -type f -name "*.ts" | grep -E "(program|emitter|transformers)" | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Bash(grep -n "emit()" /home/bench/repos/typescript/src/compiler/program.ts | head -20)
      ↳ Bash(grep -n "function emit" /home/bench/repos/typescript/src/compiler/program.ts | head -20)
      ↳ Bash(grep -n "const emit" /home/bench/repos/typescript/src/compiler/program.ts | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "function getTransformers" /home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "getEmitHost" /home/bench/repos/typescript/src/compiler/program.ts | head -10)
      ↳ Read(/home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -n "getTransformers\|getEmitTransformers" /home/bench/repos/typescript/src/compiler/program.ts)
      ↳ Bash(grep -rn "function getTransformers\|export.*getTransformers" /home/bench/repos/typescript/src/compiler/ --include="*.ts" | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/transformer.ts)
      ↳ Bash(grep -n "export function emitFiles" /home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Bash(grep -n "function transformNodes\|export.*transformNodes" /home/bench/repos/typescript/src/compiler/emitter.ts | head -5)
      ↳ Bash(grep -n "function transformNodes\|export.*transformNodes" /home/bench/repos/typescript/src/compiler/transformer.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/transformer.ts)
      ↳ Bash(grep -n "export.*transformTypeScript\|function transformTypeScript" /home/bench/repos/typescript/src/compiler/transformers/ts.ts | head -5)
      ↳ Read(/home/bench/repos/typescript/src/compiler/transformers/ts.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Bash(grep -n "function writeFile" /home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Bash(grep -n "^    function writeFile.*host" /home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Bash(grep -n "writeFile(host" /home/bench/repos/typescript/src/compiler/emitter.ts | head -5)
      ↳ Bash(grep -B 5 "^function writeFile" /home/bench/repos/typescript/src/compiler/emitter.ts | head -20)
      ↳ Bash(grep -n "^function writeFile\|writeFile.*=" /home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Bash(grep -C 3 "writeFile(host, emitterDiagnostics" /home/bench/repos/typescript/src/compiler/emitter.ts | head -40)
      ↳ Bash(grep -rn "function writeFile.*host.*emitterDiagnostics\|export.*function writeFile" /home/bench/repos/typescript/src/compiler/ --include="*.ts" | grep -v "\.js")
      ↳ Read(/home/bench/repos/typescript/src/compiler/utilities.ts)
      ↳ Bash(grep -n "export.*transformDeclarations\|function transformDeclarations" /home/bench/repos/typescript/src/compiler/transformers/declarations.ts | head -5)
      ↳ Read(/home/bench/repos/typescript/src/compiler/transformers/declarations.ts)
      ↳ Bash(grep -n "function transformRoot" /home/bench/repos/typescript/src/compiler/transformers/declarations.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/transformers/declarations.ts)
      ↳ Bash(grep -n "export.*transformES2015" /home/bench/repos/typescript/src/compiler/transformers/es2015.ts | head -1)
      ↳ Read(/home/bench/repos/typescript/src/compiler/transformers/es2015.ts)
      ↳ Bash(grep -rn "export.*function createPrinter\|export.*createPrinter" /home/bench/repos/typescript/src/compiler/ --include="*.ts" | grep -v "\.d\.ts")
      ↳ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/emitter.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/transformer.ts)
      ↳ ⟹ returned to parent


💬 Here's the full pipeline, traced through the actual code.  ---  ## Source text to output: the full compiler pipeline  ### 1. Program creation and file collec...

──────── RESULT (success, 214449ms, 4 turns) ────────
Here's the full pipeline, traced through the actual code.

---

## Source text to output: the full compiler pipeline

### 1. Program creation and file collection (`program.ts`)

Everything starts at `createProgram()` (line 1515). It doesn't parse anything immediately — it first builds a map of which files it needs by walking from the root files you passed in.

`processRootFile()` (line 3291) calls into `findSourceFileWorker()` (line 3545), which is where the caching gate lives: it checks `filesByName` (a `Map<Path, SourceFile | false | undefined>`) at line 3570 before doing any I/O. A `false` value means the file was looked for but didn't exist; on a cache hit the file is returned immediately.

On a miss, it calls `host.getSourceFile()` (line 3635), which is backed by the closure created at line 392 (`createGetSourceFile`). That closure reads raw text via `host.readFile()` (line 400), then hands it to `createSourceFile()` — the parser's public entry point. After parsing, module imports and `/// <reference>` directives are collected by `collectExternalModuleReferences()` (line 3318), then `processImportedModules()` (line 3911) resolves those references and recursively calls `findSourceFile()` for each dependency. This recursion builds the full file graph.

`tryReuseStructureFromOldProgram()` (line 1743) lets incremental builds skip the host call entirely for unchanged files by reusing `SourceFile` nodes from the old program.

---

### 2. Scanning and parsing (`scanner.ts`, `parser.ts`)

`createSourceFile()` at parser.ts:1344 dispatches to `Parser.parseSourceFile()` (line 1603), which:
1. Calls `initializeState()` (line 1735) — this configures the scanner singleton (created once at line 1444) with the source text, language version, and script kind.
2. Calls `parseSourceFileWorker()` (line 1803).

Inside `parseSourceFileWorker`, the first call is `nextToken()` (line 1812), which calls `scanner.scan()`. From that point on, parsing is a cooperative pull loop: the parser calls `nextToken()` whenever it wants the next token; the scanner advances through the text and returns a `SyntaxKind`. The main loop is `parseList(ParsingContext.SourceElements, parseStatement)` (line 1814), which builds the statement list of the `SourceFile` node.

The scanner's `scan()` (scanner.ts:1891) is a large character-code switch. It records `fullStartPos` (including trivia), advances `pos`, and returns the `SyntaxKind` of what it found. Whitespace and comments are consumed as trivia before the switch body runs.

The result of all this is a `SourceFile` node with its `.statements` array populated and `bindDiagnostics` initialized to `[]`.

---

### 3. Binding (`binder.ts`)

Binding is triggered from the checker, not the parser. The exported `bindSourceFile()` (binder.ts:502) is a thin wrapper around the `binder` closure created by `createBinder()` (line 509). The internal `bindSourceFile` (line 571) guards with `if (!file.locals)` (line 584) — so each file is bound exactly once.

The recursive walk starts at `bind(file)` (line 2751). For each node, `bindWorker()` creates a `Symbol` if the node declares something and attaches it to the appropriate symbol table: `file.locals` for block-scoped locals, the container's `.members` or `.exports` for class/interface/module members, and `file.symbol.exports` for the module itself.

Control flow analysis runs inside `bindContainer()` (line 953). When a node is a control-flow container (functions, source files, static blocks), it creates a `FlowStart` node (line 1014), threads `FlowNode` references through branches and loops as it recurses, and attaches `endFlowNode` to the SourceFile (line 1041) when done. Individual expression nodes get a `flowNode` property pointing to the active flow at their position.

Errors discovered during binding (e.g. duplicate identifiers, `break` outside a loop) land in `file.bindDiagnostics`.

---

### 4. Checker and diagnostics (`checker.ts`, `program.ts`)

The checker is created lazily: `getTypeChecker()` at program.ts:2684 does:

```typescript
return typeChecker || (typeChecker = createTypeChecker(program));
```

`createTypeChecker()` (checker.ts:1486) builds all the checker's internal state and then, at the very end, calls `initializeTypeChecker()` (line 51555). That function immediately calls `bindSourceFile(file, compilerOptions)` **for every file in the program** — so binding is not deferred per-file; it all happens up front when the checker is first created.

After binding, type checking itself is lazy per-file. Getting diagnostics goes through:

- `program.getSemanticDiagnostics()` (program.ts:2798)
  - → `getSemanticDiagnosticsForFile()` (program.ts:2858)
    - → `getBindAndCheckDiagnosticsForFile()` (program.ts:2887)
      - Returns `sourceFile.bindDiagnostics` (already collected by the binder)
      - Then calls `typeChecker.getDiagnostics(sourceFile, ...)` (checker.ts:49689)
        - → `checkSourceFile()` (line 49547), which walks the file's AST doing full type checking

So the diagnostic pipeline is: bind errors come out of the binder immediately on first checker creation; type errors are produced on demand by `checkSourceFile` when diagnostics are actually requested.

The **emit resolver** (`typeChecker.getEmitResolver()`) is a separate surface the emitter uses to ask type questions during output (e.g. "is this symbol internal?", "what is the literal type here?"). It's retrieved at emit time and does not require `getDiagnostics` to have been called.

---

### 5. Emit: transformer chain and output (`program.ts`, `transformer.ts`, `emitter.ts`)

`Program.emit()` (program.ts:2688) calls `emitWorker()` (line 2718), which:
1. Gets the emit resolver: `typeChecker.getEmitResolver()` (line 2742)
2. Builds an `EmitHost` wrapper (line 2755) that exposes `writeFile`, `getSourceFile`, etc.
3. Gets the transformer factories via `getTransformers(options, customTransformers, emitOnly)` (line 2757 — actually line 2757 in emitter.ts / transformer.ts:120)
4. Calls `emitFiles()` (emitter.ts:752)

**Transformer setup** (`transformer.ts:127`): `getScriptTransformers()` builds an ordered array of factories — custom "before" hooks, then `transformTypeScript` (strips type syntax), then decorators/JSX if enabled, then ES downleveling transforms in target order (`transformES2021`, `transformES2020`, … `transformES2015` + `transformGenerators`), then the module format transformer (CommonJS, ESM, System, etc.), then custom "after" hooks. Declaration emit gets its own list with just `transformDeclarations`.

**Transformation** (`transformer.ts:248`, `transformNodes()`): Each factory is called with a shared `TransformationContext` to produce a `Transformer<SourceFile>` function. These are then chained — the output of each feeds into the next. `TransformationContext` carries the node factory, emit resolver access, lexical environment stack, and the substitution/notification hook registries.

Individual transformers follow the pattern in `transformers/ts.ts:235`: receive a `SourceFile`, call `visitSourceFile()` which does a recursive `visitNode`/`visitEachChild` walk, return a modified `SourceFile`. Nodes that need to be erased (type annotations, `interface` declarations) return `undefined` from the visitor; nodes that need to be replaced return a new node created via `context.factory`.

**JS output** (`emitter.ts:821`, `emitJsFileOrBundle()`):
1. Runs `transformNodes()` with the script transformer chain
2. Creates a `Printer` via `createPrinter()`, wired up with the transformation result's `substituteNode` and `emitNodeWithNotification` hooks so transformers can intercept printing
3. Calls `printSourceFileOrBundle()` (line 993) which drives the printer into a `TextWriter` buffer
4. Calls `writeFile(host, emitterDiagnostics, jsFilePath, writer.getText(), ...)` which delegates to `host.writeFile()`

**Declaration output** (`emitter.ts:886`, `emitDeclarationFileOrBundle()`): same shape, but runs through `transformDeclarations` (`transformers/declarations.ts:259`). That transformer walks declarations, strips private members, adds `declare` modifiers, and reconstructs a synthetic `SourceFile` with `isDeclarationFile: true`. The printer then serializes that to a `.d.ts`.

---

### Connection map

```
createProgram()
  processRootFile() → findSourceFileWorker()
    filesByName cache hit → return cached SourceFile
    miss → host.getSourceFile()
           → host.readFile() [I/O]
           → createSourceFile() [parser entry]
             → Parser.parseSourceFile()
               → initializeState() [configures scanner]
               → parseSourceFileWorker()
                 → nextToken() → scanner.scan() ← pull loop
                 → AST built, SourceFile returned
    collectExternalModuleReferences()
    processImportedModules() → findSourceFile() [recurse for deps]

getTypeChecker()  [lazy, first call only]
  createTypeChecker()
    initializeTypeChecker()
      bindSourceFile(file) × all files   ← binding happens here
        bind(file) [recursive AST walk]
        → Symbols created, file.locals populated
        → FlowNodes threaded through control flow
        → file.bindDiagnostics populated

program.getSemanticDiagnostics()
  → file.bindDiagnostics   ← binder errors, already done
  → typeChecker.getDiagnostics()
      checkSourceFile()    ← type checker walks & checks

program.emit()
  emitWorker()
    typeChecker.getEmitResolver()
    getTransformers() → [transformTS, transformES*, transformModule, ...]
    emitFiles()
      forEachEmittedFile()
        emitJsFileOrBundle()
          transformNodes(scriptTransformers)   ← chained transform
          createPrinter()
          printSourceFileOrBundle() → TextWriter buffer
          host.writeFile(path, text)           ← actual I/O

        emitDeclarationFileOrBundle()
          transformNodes([transformDeclarations])
          printSourceFileOrBundle() → TextWriter buffer
          host.writeFile(path, text)
```

---

### Key things to keep in mind for your change

- **Binding happens once, eagerly, when the checker is first created** — not when diagnostics are requested. If you affect what goes into `file.bindDiagnostics` or `file.locals`, that fires in `initializeTypeChecker`.
- **Type-check diagnostics are lazy per-file** — `checkSourceFile()` only runs when someone calls `getDiagnostics(file)`.
- **The emit resolver is a type-checker surface consulted during emit**, not during checking — if you're changing what's knowable at emit time, that interface (`checker.ts`'s `getEmitResolver()` return value) is the bridge.
- **Each stage hands off a complete artifact**: the parser returns a `SourceFile`, the binder mutates it in place (attaches `locals`, `bindDiagnostics`, flow nodes), the checker reads from that, and the emitter receives a `SourceFile` through the transformer chain and produces text.
- **Transformers are non-destructive** — they return new nodes via `context.factory`; the original AST is preserved. The printer only sees the transformed tree.
