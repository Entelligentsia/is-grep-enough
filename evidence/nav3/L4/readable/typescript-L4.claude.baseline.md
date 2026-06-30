# transcript: I'm studying how the TypeScript compiler walks a parsed file and attaches symbols to it — building the symbol tables that later type-checking will use. I nee...


💬 I'll read the key sections of `binder.ts` to trace how all these pieces fit together.
  ▸ Bash(wc -l /home/bench/repos/typescript/src/compiler/binder.ts && grep -n "^function \|^export function \|^    function " /home/bench/repos/typescript/src/compile...)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Now let me read the core `bind` dispatcher and `bindChildren`.
  ▸ Bash(grep -n "^    function bind\b" /home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Now let me read the declaration and symbol-table insertion machinery.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Now let me read `declareModuleMember` and `bindBlockScopedDeclaration`, plus the `getContainerFlags` function.
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Bash(grep -n "getContainerFlags\|ContainerFlags\." /home/bench/repos/typescript/src/compiler/binder.ts | head -50)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 Now let me check the `ContainerFlags` enum definition.
  ▸ Bash(grep -n "const enum ContainerFlags\|ContainerFlags {" /home/bench/repos/typescript/src/compiler/binder.ts | head -5)
  ▸ Read(/home/bench/repos/typescript/src/compiler/binder.ts)

💬 I have everything I need. Here's a thorough explanation of how these cooperating pieces fit together.  ---  ## How the TypeScript binder works  ### 1. Entry ...

──────── RESULT (success, 141775ms, 16 turns) ────────
I have everything I need. Here's a thorough explanation of how these cooperating pieces fit together.

---

## How the TypeScript binder works

### 1. Entry point and closure state

`bindSourceFile` (line 502) is the public entry — it just times and delegates to `binder`, which is the singleton returned by `createBinder()` (line 499).

`createBinder()` (line 509) is a factory that returns an inner `bindSourceFile` closure. All mutable walk-state lives as `var` declarations in that closure (explicitly `var` rather than `let`/`const` to avoid temporal dead-zone checks in the runtime hot path — see the comment at line 510):

```
var parent: Node;                          // current node's parent
var container: IsContainer;                // nearest symbol-owning scope
var blockScopeContainer: IsBlockScopedContainer;  // nearest block scope
var lastContainer: HasLocals;              // tail of container linked list
var thisParentContainer: IsContainer;      // container one level above (skips arrow fns)
```

The inner `bindSourceFile(f, opts)` (line 571) initialises those vars and calls `bind(file)` — the root of the recursive walk. If `file.locals` is already set, the whole body is skipped (incremental reuse).

---

### 2. The walk: `bind(node)`  *(line 2751)*

Every node passes through `bind`. The structure is:

```
bind(node):
  1. setParent(node, parent)           ← attach parent pointer
  2. bindWorker(node)                  ← pre-order, per-kind work
  3. if node is non-terminal:
       saveParent = parent; parent = node
       flags = getContainerFlags(node)
       if flags == None:  bindChildren(node)   ← plain recursion
       else:              bindContainer(node, flags)  ← scope push/pop + recurse
       parent = saveParent
     else (leaf token):
       bindJSDoc(node)
```

So `bind` does three things on every node: stamp the parent, do pre-order symbol work, then recurse — restoring parent when done. There is no explicit stack; the call stack is the stack.

---

### 3. Container tracking: `bindContainer`  *(line 953)*

`bindContainer` is the save/restore mechanism around any node that opens a new scope:

```
save: container, thisParentContainer, blockScopeContainer

if IsContainer:
    container = blockScopeContainer = node      ← both pointers advance
    if HasLocals:
        container.locals = createSymbolTable()  ← eagerly allocated
        addToContainerChain(container)          ← append to linked list

else if IsBlockScopedContainer:
    blockScopeContainer = node                  ← only block-scope pointer advances
    if HasLocals:
        blockScopeContainer.locals = undefined  ← NOT yet allocated (lazy)

if IsControlFlowContainer:
    ... save/restore currentFlow, create fresh FlowStart node, recurse ...
else:
    bindChildren(node)

restore: container, thisParentContainer, blockScopeContainer
```

Two pointers serve two different purposes:
- **`container`** tracks the nearest node whose `symbol.members` / `symbol.exports` / `locals` table is where function-scoped locals belong. This advances only for `IsContainer` nodes.
- **`blockScopeContainer`** tracks the nearest node where `let`/`const` declarations live. It advances for both `IsContainer` and `IsBlockScopedContainer` nodes.

`HasLocals` is the third bit: it controls whether the scope node gets a `locals` table. Functions get it eagerly (parameters almost certainly go there). `Block` nodes skip eager allocation because most blocks have zero block-scoped variables.

The `addToContainerChain` call (line 2256) links every `HasLocals` container to the previous one via `nextContainer`. The type checker later walks this chain with `getLocalNameOfContainer` to validate that container names are unique.

**What gets which flags** (from `getContainerFlags`, line 3815):

| Node kind | Flags |
|---|---|
| `SourceFile` | `IsContainer \| IsControlFlowContainer \| HasLocals` |
| `FunctionDeclaration`, `Constructor` | `IsContainer \| IsControlFlowContainer \| HasLocals \| IsFunctionLike` |
| `FunctionExpression` | + `IsFunctionExpression` |
| `ArrowFunction` | + `IsFunctionExpression \| PropagatesThisKeyword` |
| `ModuleDeclaration`, `TypeAliasDeclaration` | `IsContainer \| HasLocals` |
| `ClassDeclaration`, `EnumDeclaration`, `ObjectLiteralExpression` | `IsContainer` (no `HasLocals` — members use `symbol.members`/`symbol.exports`) |
| `CatchClause`, `ForStatement`, `CaseBlock` | `IsBlockScopedContainer \| HasLocals` |
| `Block` inside function | `ContainerFlags.None` (deliberately! see the comment at line 3882) |
| `Block` elsewhere | `IsBlockScopedContainer \| HasLocals` |

The `Block`-inside-function special case is important: it prevents `var x` and `let x` inside the same function from appearing in different symbol tables and escaping the duplicate-declaration check.

---

### 4. Per-kind dispatch: `bindWorker`  *(line 2846)*

`bindWorker` is a large `switch(node.kind)`. It does the *pre-order* work before any child is visited — predominantly:

- **Flow nodes**: attaches the current `currentFlow` to `Identifier`, `PropertyAccessExpression`, `SuperKeyword`, etc.
- **Special JS patterns**: `BinaryExpression` checks `getAssignmentDeclarationKind` to catch `exports.foo =`, `module.exports =`, `Foo.prototype.bar =`, `this.x =` and routes each to a dedicated handler.
- **Declaration nodes**: many kinds ultimately call `declareSymbolAndAddToSymbolTable`.

---

### 5. Recursing into children: `bindChildren`  *(line 1096)*

`bindChildren` is *also* a dispatch switch. For most nodes the default case is:

```ts
bindEachChild(node)   →   forEachChild(node, bind, bindEach)
```

But it overrides for nodes with nontrivial child-visit order:

- **`SourceFile` and `Block`**: call `bindEachFunctionsFirst` (line 1079), which visits `FunctionDeclaration` children in one pass and everything else in a second pass — mirroring JavaScript hoisting semantics so that a function is visible throughout the block even if textually below its use.
- **Control-flow statements** (`if`, `while`, `for`, `try`, `switch`, `return`, `throw`, etc.): wire up the flow graph before/after visiting branches, so `currentFlow` is threaded correctly when `bind` is eventually called on each child expression.

---

### 6. Routing a declaration to the right symbol table: `declareSymbolAndAddToSymbolTable`  *(line 2264)*

When `bindWorker` processes a declaration node, it calls `declareSymbolAndAddToSymbolTable(node, symbolFlags, symbolExcludes)`. This function switches on `container.kind` to decide which table to use:

```
ModuleDeclaration  →  declareModuleMember   (exports or locals, see below)
SourceFile         →  declareSourceFileMember  (global file.locals, or module route)
ClassDeclaration   →  declareClassMember    (static → symbol.exports, instance → symbol.members)
EnumDeclaration    →  container.symbol.exports!
TypeLiteral /
ObjectLiteral /
InterfaceDeclaration  →  container.symbol.members!
FunctionDeclaration /
FunctionExpression /
ArrowFunction / etc.  →  container.locals!
```

**`declareModuleMember`** (line 887) has an important extra step for exported declarations. A node with an `export` modifier gets *two* symbols:

```ts
const local = declareSymbol(container.locals, /*parent*/ undefined, node,
                            SymbolFlags.ExportValue, symbolExcludes);
local.exportSymbol = declareSymbol(container.symbol.exports!, container.symbol, node,
                                   symbolFlags, symbolExcludes);
node.localSymbol = local;
```

The local symbol (with the `ExportValue` flag) sits in `container.locals` so the binder can detect duplicate local-vs-export names. The export symbol (with the full flags) goes in `container.symbol.exports`. The checker later calls `getExportSymbolOfValueSymbolIfExported` on the local to get the exported type, which is how it knows not to qualify the name in emit.

**`bindBlockScopedDeclaration`** (line 2437) does the same routing but uses `blockScopeContainer` instead of `container`. If `blockScopeContainer.locals` is `undefined` (lazily skipped during `bindContainer`), it creates it here on first use.

---

### 7. The core: `declareSymbol` — merge or conflict  *(line 749)*

`declareSymbol(symbolTable, parent, node, includes, excludes)` is where symbols are born or merged:

```
name = getDeclarationName(node)       ← escapes the identifier text
symbol = symbolTable.get(name)

if no existing symbol:
    symbol = createSymbol(SymbolFlags.None, name)   ← fresh, no flags yet
    symbolTable.set(name, symbol)

else if (symbol.flags & excludes):    ← CONFLICT
    if symbol.isReplaceableByMethod:
        replace with fresh symbol     ← JS constructor props lose to prototype methods
    else:
        report Duplicate_identifier (or Cannot_redeclare_block_scoped_variable etc.)
        on every existing declaration AND on the new node
        symbol = createSymbol(SymbolFlags.None, name)   ← orphaned fresh symbol

// merge (compatible, or fresh):
addDeclarationToSymbol(symbol, node, includes)
symbol.parent = parent
```

`addDeclarationToSymbol` (line 635) does the actual merge bookkeeping:
```ts
symbol.flags |= symbolFlags                             // accumulate flags
node.symbol = symbol                                    // node → symbol
symbol.declarations = appendIfUnique(symbol.declarations, node)  // symbol → nodes
if (symbolFlags & Value): setValueDeclaration(symbol, node)
// lazily create .exports or .members if this kind of symbol needs them
```

The `includes`/`excludes` pair encodes what each declaration kind can coexist with. `SymbolFlags.FunctionExcludes` excludes `Class` (two classes with the same name is illegal) but not `Module` — that's how `function Foo() {}` and `namespace Foo {}` can legally share a symbol (`Foo` gets both `Function` and `Module` flags, with both declarations in `symbol.declarations`). The checker later reads those accumulated flags to know that `Foo` is simultaneously callable and has a namespace shape.

---

### Summary: the complete data flow for one declaration

```
bind(FunctionDeclaration "foo")
│
├─ setParent(node, parent)
│
├─ bindWorker(node)
│     └─ bindFunctionDeclaration (via switch)
│           └─ declareSymbolAndAddToSymbolTable(node, Function, FunctionExcludes)
│                 └─ (container is FunctionDeclaration) → declareSymbol(container.locals!, ...)
│                       ├─ look up "foo" in locals
│                       ├─ if absent: create Symbol(None, "foo"), insert
│                       ├─ if present & compatible: merge (symbol.flags |= Function,
│                       │                                   symbol.declarations.push(node))
│                       └─ if present & conflicting: error on all decls, make orphan symbol
│
├─ saveParent = parent; parent = node
├─ containerFlags = IsContainer|IsControlFlowContainer|HasLocals|IsFunctionLike
├─ bindContainer(node, flags)
│     ├─ save container, blockScopeContainer
│     ├─ container = blockScopeContainer = node
│     ├─ container.locals = createSymbolTable()
│     ├─ addToContainerChain(container)   ← link into lastContainer chain
│     ├─ save/reset currentFlow
│     ├─ bindChildren(node)              ← recurse; params/body locals go into container.locals
│     └─ restore container, blockScopeContainer, currentFlow
└─ parent = saveParent
```
