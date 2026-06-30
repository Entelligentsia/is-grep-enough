# transcript: I'm studying how the TypeScript compiler walks a parsed file and attaches symbols to it — building the symbol tables that later type-checking will use. I nee...


💬 I'll start by loading the LSP tool and finding the key entry points in the binder.
  ▸ ToolSearch(select:LSP)

💬 Now let me find the main binder entry points in parallel.
  ▸ LSP(bindSourceFile)
  ▸ LSP(createBinder)

💬 Good. Let me now read the top-level entry point and the opening of `createBinder` in parallel.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ LSP(bind)

💬 Now let me read the four key functions in parallel — the walk entry, `bind`, `bindWorker`, `bindContainer`, and symbol-declaration functions.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ LSP(declareSymbol)

💬 Now let me read `declareSymbol`, `declareSymbolAndAddToSymbolTable`, and `bindChildren` in parallel.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Let me find and read `addDeclarationToSymbol`, `getContainerFlags`, and `createSymbol`.
  ▸ LSP(addDeclarationToSymbol)
  ▸ LSP(getContainerFlags)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Let me read one more key excerpt — `bindBlockScopedDeclaration` and how `bindWorker` handles function and variable declarations.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 I now have all the pieces. Here is a thorough walk-through of how the cooperating parts fit together.  ---  ## How the TypeScript binder works  ### 1. Entry:...

──────── RESULT (success, 135379ms, 18 turns) ────────
I now have all the pieces. Here is a thorough walk-through of how the cooperating parts fit together.

---

## How the TypeScript binder works

### 1. Entry: `bindSourceFile` → the singleton closure

```
binder.ts:499  const binder = createBinder()   // one closure per module load
binder.ts:502  export function bindSourceFile(file, options) { binder(file, options) }
```

`createBinder` (line 509) is a factory that returns a single function. **All binder state lives in that closure** — `file`, `options`, `parent`, `container`, `blockScopeContainer`, `lastContainer`, flow-analysis vars, etc. — declared with `var` to avoid TDZ cost in a hot path (the comment explains why). The exported `bindSourceFile` merely wraps performance marks around a call into that closure.

The inner `bindSourceFile` (line 571) initialises the per-file state, then calls:

```typescript
bind(file)   // line 586
```

---

### 2. The walk: `bind(node)` — parent pointers first, then dispatch

```typescript
// binder.ts:2751
function bind(node: Node | undefined): void {
    setParent(node, parent);          // ← attach parent pointer BEFORE going deeper
    bindWorker(node);                 // ← declare this node's symbol
    if (node.kind > SyntaxKind.LastToken) {
        const saveParent = parent;
        parent = node;               // ← current node becomes parent for children
        const containerFlags = getContainerFlags(node);
        if (containerFlags === ContainerFlags.None)
            bindChildren(node);       // ← plain recursive walk
        else
            bindContainer(node, containerFlags);   // ← scope-aware walk
        parent = saveParent;
    }
}
```

Key points:
- **Parent before children.** `setParent` runs on the way *in*, so that by the time any child's `bindWorker` runs, the parent chain is already wired up.
- **Terminal nodes** (`kind <= LastToken`, i.e. tokens) have no children and skip the recursion block entirely, so there is no wasted iteration over them.
- `bindChildren(node)` (line 1096) falls through to `bindEachChild(node)` → `forEachChild(node, bind, bindEach)` for the default case. For control-flow statements it substitutes a specialised traversal (separate antecedent handling for `if`, loops, `try`, `switch`, etc.).

---

### 3. How `getContainerFlags` classifies each node kind

```typescript
// binder.ts:3815 (exported so checker can also call it)
export function getContainerFlags(node: Node): ContainerFlags {
    switch (node.kind) {
        case SourceFile:
            return IsContainer | IsControlFlowContainer | HasLocals;
        case FunctionDeclaration:
        case Constructor:
            return IsContainer | IsControlFlowContainer | HasLocals | IsFunctionLike;
        case ClassDeclaration:
        case EnumDeclaration:
            return IsContainer;   // no HasLocals — children go into .exports/.members
        case Block:
            // A block directly inside a function is NOT a new block-scope container
            // (var and let must collide in the function's locals, not be siloed)
            return isFunctionLike(node.parent) ? ContainerFlags.None
                 : IsBlockScopedContainer | HasLocals;
        case ForStatement: case CatchClause: case CaseBlock:
            return IsBlockScopedContainer | HasLocals;
        ...
    }
}
```

The bitmask has three orthogonal axes:
- `IsContainer` — a full function/class/module scope (updates `container`)
- `IsBlockScopedContainer` — a narrower block (`let`/`const` go here, updates `blockScopeContainer`)
- `HasLocals` — the container should eagerly get a `.locals` symbol table (for block containers it's lazy and starts undefined)

---

### 4. Tracking the active scope: `bindContainer`

```typescript
// binder.ts:953
function bindContainer(node, containerFlags) {
    const saveContainer          = container;
    const savedBlockScopeContainer = blockScopeContainer;
    // ...

    if (containerFlags & IsContainer) {
        container = blockScopeContainer = node;     // full container ⟹ updates BOTH
        if (containerFlags & HasLocals)
            container.locals = createSymbolTable(); // eagerly initialised
    }
    else if (containerFlags & IsBlockScopedContainer) {
        blockScopeContainer = node;                 // only the block-scope pointer moves
        if (containerFlags & HasLocals)
            blockScopeContainer.locals = undefined; // reset (incremental safety)
    }

    // ... control-flow node handling elided ...
    bindChildren(node);   // recurse with updated container state

    // restore on the way out
    container          = saveContainer;
    blockScopeContainer = savedBlockScopeContainer;
}
```

This is a classic save/recurse/restore stack. Because `bind` is synchronous and TypeScript is single-threaded, the closure variables act as an implicit call stack for scope tracking.

Two separate pointers serve different purposes:
| Variable | Updated by | Used for |
|---|---|---|
| `container` | `IsContainer` nodes | Where `var`, parameters, function-scoped names, exports, members go |
| `blockScopeContainer` | either flag | Where `let`/`const` go |

---

### 5. Dispatching by kind: `bindWorker`

```typescript
// binder.ts:2846
function bindWorker(node: Node) {
    switch (node.kind) {
        case FunctionDeclaration:   bindFunctionDeclaration(node); break;
        case VariableDeclaration:   bindVariableDeclarationOrBindingElement(node); break;
        case Parameter:             bindParameter(node); break;
        case ClassDeclaration:      bindClassLikeDeclaration(node); break;
        case EnumDeclaration:       bindEnumDeclaration(node); break;
        case ModuleDeclaration:     bindModuleDeclaration(node); break;
        // ... ~100 more cases ...
    }
}
```

Each per-kind handler applies kind-specific logic (e.g., strict-mode checks, async flag recording) and then routes to one of two declaration helpers depending on whether scoping is block-level or function-level:

```typescript
// binder.ts:3709
function bindFunctionDeclaration(node) {
    if (inStrictMode)
        bindBlockScopedDeclaration(node, SymbolFlags.Function, FunctionExcludes);
    else
        declareSymbolAndAddToSymbolTable(node, SymbolFlags.Function, FunctionExcludes);
}

// binder.ts:3663
function bindVariableDeclarationOrBindingElement(node) {
    if (isBlockOrCatchScoped(node))       // let / const
        bindBlockScopedDeclaration(node, BlockScopedVariable, BlockScopedVariableExcludes);
    else                                  // var
        declareSymbolAndAddToSymbolTable(node, FunctionScopedVariable, FunctionScopedVariableExcludes);
}
```

---

### 6. Routing to the right symbol table: `declareSymbolAndAddToSymbolTable`

```typescript
// binder.ts:2264
function declareSymbolAndAddToSymbolTable(node, symbolFlags, symbolExcludes) {
    switch (container.kind) {
        case SourceFile:
            return declareSourceFileMember(node, ...);   // → file.locals or module exports
        case ModuleDeclaration:
            return declareModuleMember(node, ...);       // → locals or symbol.exports
        case ClassDeclaration:
        case ClassExpression:
            return declareClassMember(node, ...);        // → symbol.exports (static)
                                                         //   or symbol.members (instance)
        case EnumDeclaration:
            return declareSymbol(container.symbol.exports!, ...);
        case InterfaceDeclaration:
        case TypeLiteral:
        case ObjectLiteralExpression:
            return declareSymbol(container.symbol.members!, ...);
        case FunctionDeclaration:
        case ArrowFunction:
        case MethodDeclaration:
        // ... all function-like containers:
            return declareSymbol(container.locals!, ...); // lexically scoped
    }
}
```

`declareModuleMember` further distinguishes: an exported value declaration gets **two** symbols — a local with `ExportValue` flags and an export symbol hanging off `container.symbol.exports` — so that the checker can resolve identifiers locally but also expose them through the module's export table.

`bindBlockScopedDeclaration` (line 2437) is parallel: it switches on `blockScopeContainer.kind` and calls `declareSymbol(blockScopeContainer.locals!, ...)`, lazily creating `.locals` if needed.

---

### 7. The core: `declareSymbol` — merge or conflict

```typescript
// binder.ts:749
function declareSymbol(symbolTable, parent, node, includes, excludes): Symbol {
    const name = getDeclarationName(node);  // escaped identifier text, or special names
                                            // like "__constructor", "__call", "default"

    let symbol = symbolTable.get(name);

    if (!symbol) {
        // ── FRESH: name not seen before ──────────────────────────────────────────
        symbolTable.set(name, symbol = createSymbol(SymbolFlags.None, name));
        // Note: created with None flags — so the excludes check below can't fire
        // on the very symbol we just inserted.

    } else if (symbol.flags & excludes) {
        // ── CONFLICT: existing symbol's kind is incompatible with this declaration ─
        // e.g. a `class Foo` where there's already a `var Foo` that can't merge
        file.bindDiagnostics.push( /* "Duplicate identifier 'Foo'" */ );
        symbol = createSymbol(SymbolFlags.None, name);   // isolated fresh symbol
        // (NOT re-inserted; the node gets its own unreachable symbol)

    }
    // else: MERGE — existing symbol is compatible (multiple `var`, namespace+value,
    //               function overloads, interface augmentation, etc.)
    //   → fall through to addDeclarationToSymbol which ORs in the new flags

    addDeclarationToSymbol(symbol, node, includes);
    symbol.parent = parent;
    return symbol;
}
```

`addDeclarationToSymbol` (line 635) does three things:

```typescript
function addDeclarationToSymbol(symbol, node, symbolFlags) {
    symbol.flags |= symbolFlags;                        // accumulate flags (merge)
    node.symbol = symbol;                               // back-pointer: node → symbol
    symbol.declarations = appendIfUnique(symbol.declarations, node); // forward list

    if (symbolFlags & (Class|Enum|Module|Variable) && !symbol.exports)
        symbol.exports = createSymbolTable();   // lazily create export table
    if (symbolFlags & (Class|Interface|TypeLiteral|ObjectLiteral) && !symbol.members)
        symbol.members = createSymbolTable();   // lazily create member table
    if (symbolFlags & Value)
        setValueDeclaration(symbol, node);      // canonical value-producing declaration
}
```

The `excludes` bitmask encodes the type theory: for example `SymbolFlags.FunctionScopedVariableExcludes` does *not* exclude another `FunctionScopedVariable` (so two `var x` merge), but `BlockScopedVariableExcludes` excludes everything including itself (so `let x; let x;` is always a conflict).

---

### How the pieces compose — end-to-end trace for `function foo() { let x = 1 }`

```
bind(SourceFile)
  setParent(SourceFile, undefined)
  bindWorker(SourceFile)  → bindSourceFileIfExternalModule
  getContainerFlags → IsContainer | IsControlFlowContainer | HasLocals
  bindContainer(SourceFile):
    container = blockScopeContainer = SourceFile
    SourceFile.locals = createSymbolTable()
    bindChildren(SourceFile):
      bind(FunctionDeclaration "foo"):
        setParent(FunctionDecl, SourceFile)         // parent pointer
        bindWorker → bindFunctionDeclaration:
          declareSymbolAndAddToSymbolTable(FunctionDecl, Function, FunctionExcludes)
            → declareSourceFileMember → declareSymbol(SourceFile.locals, ...)
               symbolTable.get("foo") → undefined
               → createSymbol, insert, addDeclarationToSymbol
               FunctionDecl.symbol = <Symbol "foo" Function>
        getContainerFlags(FunctionDecl) → IsContainer | IsControlFlowContainer | HasLocals
        bindContainer(FunctionDecl):
          container = blockScopeContainer = FunctionDecl  // ← scope pushed
          FunctionDecl.locals = createSymbolTable()
          bindChildren(FunctionDecl):
            bind(VariableDeclaration "x"):
              setParent(VarDecl, FunctionDecl.body.statements[0].declarationList)
              bindWorker → bindVariableDeclarationOrBindingElement:
                isBlockOrCatchScoped? YES (let)
                → bindBlockScopedDeclaration(VarDecl, BlockScopedVariable, ...)
                    blockScopeContainer.kind === FunctionDeclaration → default branch
                    blockScopeContainer.locals already exists
                    → declareSymbol(FunctionDecl.locals, undefined, VarDecl, ...)
                       symbolTable.get("x") → undefined → createSymbol, insert
                       VarDecl.symbol = <Symbol "x" BlockScopedVariable>
          container = SourceFile   // ← scope popped
          blockScopeContainer = SourceFile
```

The upshot: `foo` lands in `SourceFile.locals`; `x` lands in `FunctionDeclaration.locals`. The checker later walks up the scope chain through those `.locals` tables to resolve names.
