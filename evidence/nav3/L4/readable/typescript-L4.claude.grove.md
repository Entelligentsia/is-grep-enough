# transcript: I'm studying how the TypeScript compiler walks a parsed file and attaches symbols to it — building the symbol tables that later type-checking will use. I nee...


💬 Let me load the grove tools and then explore the binder's structure systematically.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map)

💬 Now let me get the binder's skeleton and locate the key entry points in parallel.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/typescript/src/compiler/binder.ts","detail":0})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","kind":"function","name":"bindSourceFile"})

💬 The outline only found 2 interfaces — binder.ts likely uses function expressions inside a closure. Let me search by name for the key entry points.
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","name":"bindSourceFile","nameContains":true})
  ▸ Bash(grep -n "function bind\|function createBinder\|function bindSourceFile\|function bind(\|function bind " /home/bench/repos/typescript/src/compiler/binder.ts |...)

💬 Now I can see the structure. Let me read the key functions in parallel — the public entry, the inner binder, the main walk, bindWorker dispatch, and bindCont...
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Now let me read the rest of `bindSourceFile`, then `declareSymbol` and `getContainerFlags`.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Bash(grep -n "function declareSymbol\|function getContainerFlags\|function addToContainerChain\|function createSymbol\b\|function declareSymbolWorker" /home/bench...)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Let me get `bindChildren` and `bindBlockScopedDeclaration` to complete the picture.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Let me also get the `ContainerFlags` enum definition.
  ▸ Bash(grep -n "const enum ContainerFlags\|IsContainer\|IsBlockScopedContainer\|HasLocals\|IsControlFlowContainer\|IsFunctionLike\|IsFunctionExpression\|IsInterface...)

💬 Now I have everything. Here is a complete walkthrough of how these pieces cooperate.  ---  ## The TypeScript Binder: How the Pieces Fit Together  ### 1. The ...

──────── RESULT (success, 123613ms, 20 turns) ────────
Now I have everything. Here is a complete walkthrough of how these pieces cooperate.

---

## The TypeScript Binder: How the Pieces Fit Together

### 1. The Closure Architecture

The binder is built by `createBinder()` (line 509), which returns a single inner `bindSourceFile` function. Every mutable state variable — `file`, `parent`, `container`, `blockScopeContainer`, `lastContainer`, `inStrictMode`, control-flow state, etc. — is a `var`-declared closure variable shared by all the inner functions. (`var` is intentional: it avoids temporal dead zone checks that would slow down hot paths at runtime.)

The public entry point is the exported `bindSourceFile` at line 502:

```
export function bindSourceFile(file, options) {
    binder(file, options);   // binder = createBinder() called once at module load
}
```

`binder` is the one instance of the closure, reused across files (its state is reset at the end of each call).

---

### 2. Starting the Walk: Inner `bindSourceFile` (line 571)

```
function bindSourceFile(f, opts) {
    file = f;
    inStrictMode = bindInStrictMode(file, opts);
    Symbol = objectAllocator.getSymbolConstructor();  // hot-swappable for debug builds

    if (!file.locals) {       // idempotency guard for incremental re-use
        bind(file);           // <-- single recursive entry
        file.symbolCount = symbolCount;
        delayedBindJSDocTypedefTag();
        bindJSDocImports();
    }
    // ... null out all closure vars so the next file starts clean
}
```

The entire walk is kicked off by a single call to `bind(file)`. After that, the closure vars are nulled out to avoid retaining memory between files.

---

### 3. The Walk: `bind` (line 2751)

`bind` is the recursive heart:

```
function bind(node) {
    if (!node) return;

    setParent(node, parent);       // (A) stamp parent pointer BEFORE descending

    bindWorker(node);              // (B) per-kind work: create/link symbol if needed

    if (node.kind > SyntaxKind.LastToken) {  // non-terminal: has children
        const saveParent = parent;
        parent = node;             // (C) push: children will see this node as their parent
        const containerFlags = getContainerFlags(node);
        if (containerFlags === ContainerFlags.None)
            bindChildren(node);    // plain recursion via forEachChild
        else
            bindContainer(node, containerFlags);  // scope-aware recursion
        parent = saveParent;       // (C) pop
    }
    else {
        bindJSDoc(node);           // terminal tokens get JSDoc attached
    }
}
```

**Parent pointer stamping (A):** Every node gets `node.parent = parent` before anything else. The closure variable `parent` is pushed/popped around each non-terminal node, so by the time children are visited, their parent has already been set. This is what lets the checker later call `node.parent` anywhere in the tree.

**Recursion (C):** `parent = node` before descending, restored after. This is a manual stack frame around child traversal.

**Terminal optimization:** Tokens (`kind <= LastToken`) have no children so `forEachChild` is skipped entirely.

---

### 4. Per-Kind Dispatch: `bindWorker` (line 2846)

`bindWorker` is a large `switch (node.kind)` that maps each syntax kind to its specific binding action. A few representative cases:

```
case SyntaxKind.VariableDeclaration:
    return bindVariableDeclarationOrBindingElement(node);  // → declareSymbolAndAddToSymbolTable

case SyntaxKind.FunctionDeclaration:
    // handled by bindContainer flagging it IsContainer | HasLocals | IsFunctionLike
    // the symbol is declared via declareSymbolAndAddToSymbolTable inside bindWorker
    ...

case SyntaxKind.BinaryExpression:
    // checks for JS-specific assignment declarations (exports.x=, this.x=, etc.)
    bindSpecialPropertyDeclaration / bindExportsPropertyAssignment / ...
```

Kinds that need no symbol (pure flow nodes like `IfStatement`, strict-mode checks like `WithStatement`) still go through `bindWorker` to attach `flowNode` or emit a diagnostic, then fall through to let `bindContainer`/`bindChildren` recurse into their children.

---

### 5. Container Scope Tracking: `getContainerFlags` + `bindContainer`

**`getContainerFlags` (line 3815)** classifies every node kind into a bitmask of `ContainerFlags`:

| Flag | Meaning |
|------|---------|
| `IsContainer` | Full lexical scope — advances `container` and `blockScopeContainer` both |
| `IsBlockScopedContainer` | Block scope only — advances `blockScopeContainer` alone |
| `HasLocals` | Eagerly allocate `.locals` (symbol table for this scope) |
| `IsControlFlowContainer` | Gets its own flow graph |
| `IsFunctionLike` | Function body — also a `HasLocals` container |

Examples from the source:
```
SourceFile          → IsContainer | IsControlFlowContainer | HasLocals
FunctionDeclaration → IsContainer | IsControlFlowContainer | HasLocals | IsFunctionLike
Block (non-fn)      → IsBlockScopedContainer | HasLocals   (lazily creates .locals)
Block inside fn     → ContainerFlags.None  ← so var in a block goes into the fn's locals
CatchClause/ForStatement → IsBlockScopedContainer | HasLocals
InterfaceDeclaration → IsContainer | IsInterface
```

**`bindContainer` (line 953)** is called when `bind` detects non-zero `containerFlags`. It saves the outer `container`/`blockScopeContainer`/`lastContainer`, adjusts them for the new scope, recurses via `bindChildren`, then restores:

```
function bindContainer(node, containerFlags) {
    const saveContainer = container;
    const savedBlockScopeContainer = blockScopeContainer;
    ...

    if (containerFlags & ContainerFlags.IsContainer) {
        container = blockScopeContainer = node;          // both pointers advance
        if (containerFlags & ContainerFlags.HasLocals) {
            container.locals = createSymbolTable();      // eager allocation
            addToContainerChain(container);              // link into lastContainer chain
        }
    }
    else if (containerFlags & ContainerFlags.IsBlockScopedContainer) {
        blockScopeContainer = node;                      // only block pointer advances
        if (containerFlags & ContainerFlags.HasLocals)
            blockScopeContainer.locals = undefined;      // cleared for incremental safety
    }

    // ... control-flow bookkeeping for IsControlFlowContainer ...
    bindChildren(node);
    // ... restore ...
    container = saveContainer;
    blockScopeContainer = savedBlockScopeContainer;
}
```

Two pointers are maintained separately:
- `container` — the nearest full lexical scope (`SourceFile`, `FunctionDeclaration`, `ClassDeclaration`, `ModuleDeclaration`, …). This is where `function`-scoped locals and `export`s live.
- `blockScopeContainer` — the nearest block scope (`Block`, `CatchClause`, `ForStatement`, …). This is where `let`/`const`/`class` declarations live.

`addToContainerChain` (line 2256) stitches every `HasLocals` container into a singly-linked `nextContainer` list so the checker can walk all containers without traversing the whole AST.

---

### 6. Routing to the Right Symbol Table: `declareSymbolAndAddToSymbolTable` (line 2264)

When `bindWorker` decides a node is a declaration, it calls `declareSymbolAndAddToSymbolTable`, which dispatches on the *current container kind* to pick the right table:

```
switch (container.kind) {
    case SourceFile:        → declareSourceFileMember   (locals or module exports)
    case ModuleDeclaration: → declareModuleMember        (locals or .exports)
    case ClassDeclaration/Expression:
                            → declareClassMember         (static → .exports, instance → .members)
    case EnumDeclaration:   → container.symbol.exports  (enum members always exported)
    case InterfaceDeclaration / TypeLiteral / ObjectLiteralExpression / JsxAttributes:
                            → container.symbol.members  (structural members)
    case FunctionDeclaration / FunctionExpression / ArrowFunction / MethodDeclaration / …:
                            → container.locals           (lexically scoped locals)
}
```

For `let`/`const`/class declarations, `bindBlockScopedDeclaration` (line 2437) redirects to `blockScopeContainer.locals` instead (lazily creating the table if needed).

For exported module members, `declareModuleMember` (line 887) creates *two* symbols: a local in `container.locals` (flagged `ExportValue`) that points to an export symbol in `container.symbol.exports`. `node.localSymbol` holds the local; the checker returns the export symbol when the identifier is used in an exported context.

---

### 7. Symbol Creation, Merge, and Conflict: `declareSymbol` (line 749)

`declareSymbol` is the lowest-level insertion point. It receives the target `symbolTable`, a `parent` symbol, the declaration `node`, `includes` (flags the new symbol gains), and `excludes` (flags that conflict with the new symbol):

```
symbol = symbolTable.get(name);

if (!symbol) {
    symbolTable.set(name, symbol = createSymbol(SymbolFlags.None, name));
    // Note: starts with no flags to avoid spurious excludes conflicts
}
else if (symbol.flags & excludes) {
    // CONFLICT branch
    if (symbol.isReplaceableByMethod) {
        symbolTable.set(name, symbol = createSymbol(...)); // JS constructor props lose to prototype methods
    }
    else {
        // Report "Duplicate identifier" / "Cannot redeclare block-scoped variable" on all prior declarations
        file.bindDiagnostics.push(...);
        symbol = createSymbol(SymbolFlags.None, name);     // error-recovery: fresh symbol
    }
}
// MERGE branch: symbol exists AND flags don't conflict — falls through here

addDeclarationToSymbol(symbol, node, includes);
```

**Merge** happens silently when `symbol.flags & excludes === 0`. Classic case: two `interface Foo { }` declarations — interfaces don't exclude each other, so they accumulate into one symbol with two entries in `symbol.declarations`. The checker later merges their members.

**Conflict** happens when the existing symbol's flags overlap with `excludes`. For example, `var x` has `SymbolFlags.FunctionScopedVariable`; if a `class x` (which excludes `FunctionScopedVariable`) appears in the same scope, `symbol.flags & excludes` is non-zero → conflict diagnostic emitted on every prior declaration site, then a fresh orphan symbol is created for error recovery.

**`addDeclarationToSymbol` (line 635)** does the cross-linking:
```
symbol.flags |= symbolFlags;
node.symbol = symbol;                            // node → symbol
symbol.declarations = appendIfUnique(symbol.declarations, node);  // symbol → [nodes]
if (symbolFlags & (Class|Enum|Module|Variable) && !symbol.exports)
    symbol.exports = createSymbolTable();        // allocate child tables on first use
if (symbolFlags & (Class|Interface|TypeLiteral|ObjectLiteral) && !symbol.members)
    symbol.members = createSymbolTable();
```

---

### How It All Connects: One Full Pass

```
bindSourceFile(f)
└─ bind(SourceFile)
   ├─ setParent(file, undefined)
   ├─ bindWorker(SourceFile)           ← no-op (SourceFile has no symbol itself)
   └─ bindContainer(SourceFile, IsContainer|IsControlFlowContainer|HasLocals)
      ├─ container = blockScopeContainer = file
      ├─ file.locals = createSymbolTable()   ← the top-level symbol table
      ├─ addToContainerChain(file)
      └─ bindChildren(file) → forEachChild → bind(stmt1), bind(stmt2), …
         └─ bind(FunctionDeclaration "foo")
            ├─ setParent(foo, file)
            ├─ bindWorker(foo) → declareSymbolAndAddToSymbolTable
            │   └─ declareSourceFileMember → declareSymbol(file.locals, …, foo, Function, FunctionExcludes)
            │       ├─ lookup "foo" in file.locals → not found
            │       ├─ create symbol {flags:None, name:"foo"} → insert into file.locals
            │       └─ addDeclarationToSymbol: symbol.flags |= Function, node.symbol = symbol
            └─ bindContainer(foo, IsContainer|IsControlFlowContainer|HasLocals|IsFunctionLike)
               ├─ container = blockScopeContainer = foo
               ├─ foo.locals = createSymbolTable()
               └─ bindChildren(foo) → bind parameters, bind body statements …
```

The key invariant: by the time `bindWorker` runs on a node, `container` and `blockScopeContainer` already reflect the correct enclosing scope, because `bindContainer` pushed them before recursing. And by the time a node is visited, `parent` has already been set by the containing `bind` call.
