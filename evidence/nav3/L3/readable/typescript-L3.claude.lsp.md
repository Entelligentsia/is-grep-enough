# typescript · L3 · lsp — readable transcript

> lsp — semantic (native Claude Code LSP tool), over **typescript** (typescript) @ `8ef3e2f3d`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `lsp` — semantic (native Claude Code LSP tool) |
| repo · rung | typescript (typescript) · L3 |
| pinned source | `8ef3e2f3d43c8c92bda9510c47f7d4d2b3aeca33` |
| status | completed |
| engagement | `lsp_tools = 13` (gate: > 0 → ✓ used its capability) |
| turns | 33 |
| wall clock | 203 s |
| context (peak) | 657,419 tokens |
| cost (billed) | $0.5577 |
| &nbsp;&nbsp;↳ token split | in 21 · out 9,346 · cache-create 38,509 · cache-read 618,889 |
| tool calls | 32 (Read×18, LSP×13, ToolSearch×1) |
| evidence | `evidence/nav3/L3/raw/typescript-L3.claude.lsp.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens to a source file from the moment its text is handed to the compiler until a complete syntax tree exists in memory. I'm interested in how the text is given to the scanner, how the parser primes the first token and drives the scan loop, how statements and expressions are built into AST nodes as tokens are consumed, and how the finished nodes are linked into a parented tree. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll trace this end to end using the LSP tool to navigate the actual code. Let me load the LSP schema and start with the top-level entry point.

&nbsp;&nbsp;▸ `ToolSearch(select:LSP)`

💬 Now let me look up the main entry points in parallel.

&nbsp;&nbsp;▸ `LSP(createSourceFile)`
&nbsp;&nbsp;▸ `LSP(createScanner)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 Now let me look at the internal `Parser.parseSourceFile` and the scanner's `setText` function.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `LSP(setText)`

💬 Now let me find the internal `Parser` namespace's `parseSourceFile` and how the scanner is primed.

&nbsp;&nbsp;▸ `LSP(parseSourceFile)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 Now let me read `parseSourceFile` (line 1603) and `parseSourceFileWorker` (line 1803).

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Now let me look at `initializeState`, `nextToken`, `parseList`, and `finishNode`.

&nbsp;&nbsp;▸ `LSP(initializeState)`
&nbsp;&nbsp;▸ `LSP(nextToken)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Now let me look at `parseList`, `parseStatement`, node creation (`createNode`/`finishNode`), and `fixupParentReferences`.

&nbsp;&nbsp;▸ `LSP(parseList)`
&nbsp;&nbsp;▸ `LSP(finishNode)`
&nbsp;&nbsp;▸ `LSP(fixupParentReferences)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Now let me look at `parseStatement`, the main `scan` function in scanner.ts, and `setParentRecursive`.

&nbsp;&nbsp;▸ `LSP(parseStatement)`
&nbsp;&nbsp;▸ `LSP(setParentRecursive)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/utilities.ts)`

💬 Now let me look at the scanner's `scan` function and `getNodePos`.

&nbsp;&nbsp;▸ `LSP(scan)`
&nbsp;&nbsp;▸ `LSP(getNodePos)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me also check how the shared scanner is created in the parser module and check `parseVariableStatement` to illustrate the node creation lifecycle.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me also check how identifiers are handled in the `scan` function's default case.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 I now have all the pieces. Here is the complete, ordered walkthrough.

---

## Phase 1 — Public entry point hands off to the Parser namespace

**`createSourceFile`** (`parser.ts:1344`) is the public API. It unpacks `languageVersionOrOptions`, then calls the internal **`Parser.parseSourceFile`** (`parser.ts:1603`), passing the raw source string along.

---

## Phase 2 — State initialization and scanner wiring

**`Parser.parseSourceFile`** (`parser.ts:1603`) calls **`initializeState`** (`parser.ts:1735`) first. That function:

1. Fetches the concrete node constructors from `objectAllocator` (so the language service can swap in its own subclasses). They are stored as module-level `var`s — `NodeConstructor`, `TokenConstructor`, `IdentifierConstructor`, etc.
2. Resets all mutable parser state: `parseDiagnostics`, `identifiers`, `nodeCount`, `parsingContext`, `contextFlags`.
3. **Hands the text to the scanner**: `scanner.setText(sourceText)` (`scanner.ts:3993`). That function stores the string in the closure-local `text`, sets `end = text.length`, and calls `resetTokenState(0)` which zeros `pos`, `fullStartPos`, `tokenStart`, and sets `token = SyntaxKind.Unknown`.

The scanner itself (`parser.ts:1444`) is a **single shared instance** created once at module load:

```ts
var scanner = createScanner(ScriptTarget.Latest, /*skipTrivia*/ true);
```

`skipTrivia: true` is the key flag — the parser's scanner silently skips whitespace and comments rather than surfacing them as tokens, so the parser never sees trivia.

---

## Phase 3 — Priming the first token

**`parseSourceFileWorker`** (`parser.ts:1803`) is called next. Before touching any grammar, it calls **`nextToken()`** (`parser.ts:2207`):

```ts
// Prime the scanner.
nextToken();
```

`nextToken` checks whether the *current* token (still `Unknown` at this point) is an escaped keyword — it isn't — then delegates to:

```ts
function nextTokenWithoutCheck() {
    return currentToken = scanner.scan();
}
```

This loads the very first real token into `currentToken` and into the scanner's `token` variable. All subsequent parser code reads `token()` (which just returns `currentToken`) without advancing the scanner until it explicitly calls `nextToken()` again.

---

## Phase 4 — Inside `scanner.scan()`: text → token

**`scan`** (`scanner.ts:1891`) is where characters become tokens. Each call:

1. **Snapshots positions**: `fullStartPos = pos` (start of any leading trivia), `tokenFlags = TokenFlags.None`.
2. **Inner loop begins**: `tokenStart = pos` (start of the actual token text).
3. **Trivia absorption**: Because `skipTrivia` is true, whitespace (`space`, `tab`, non-breaking space, and a dozen Unicode spaces), newline characters, and comments all set `pos` forward and `continue` the inner loop — they update `tokenFlags` (e.g., `TokenFlags.PrecedingLineBreak`) but never return. The next `tokenStart = pos` assignment at the top of the loop therefore positions `tokenStart` at the first non-trivia character.
4. **Character dispatch** on `codePointUnchecked(pos)`:
   - Single-character punctuation (`(`, `)`, `{`, `;`, …): `pos++; return token = SyntaxKind.OpenParenToken` etc.
   - Multi-character operators (`!`, `&&`, `||`, `**`, …): peek `charCodeUnchecked(pos + 1)` and `+2` to decide between `!=`, `!==`, `!`; advance `pos` by 1/2/3 accordingly.
   - String literals: delegate to `scanString()` which walks until the closing quote, recording the value in `tokenValue`.
   - Template literals: `scanTemplateAndSetTokenValue()`.
   - Numbers: `scanNumber()`.
   - Default — identifiers and keywords: `scanIdentifier(ch, languageVersion)` (`scanner.ts:2425`) walks forward while `isIdentifierPart` is true, producing the raw text `text.substring(tokenStart, pos)`. It then looks that text up in the keyword table; if it matches a keyword the kind is the keyword token, otherwise it is `SyntaxKind.Identifier`. The text value is stored in `tokenValue`.

After `scan` returns, the parser's `currentToken` holds the kind, and the scanner's internal variables hold the three positions:
- `fullStartPos` — where trivia before this token started  
- `tokenStart` — where the token text itself starts  
- `pos` — one past the last character consumed (the end)

---

## Phase 5 — The statement parse loop

Back in `parseSourceFileWorker`:

```ts
const statements = parseList(ParsingContext.SourceElements, parseStatement);
```

**`parseList`** (`parser.ts:3094`) is the outer driver for any homogeneous list of nodes:

```ts
function parseList<T extends Node>(kind: ParsingContext, parseElement: () => T): NodeArray<T> {
    parsingContext |= 1 << kind;   // record we're inside SourceElements
    const list = [];
    const listPos = getNodePos();  // = scanner.getTokenFullStart()

    while (!isListTerminator(kind)) {           // stops on EndOfFileToken
        if (isListElement(kind, false)) {
            list.push(parseListElement(kind, parseElement));
            continue;
        }
        if (abortParsingListOrMoveToNextToken(kind)) break;
    }
    return createNodeArray(list, listPos);
}
```

`parseListElement` first asks the incremental syntax cursor whether a node from a prior parse can be reused (only relevant for `updateSourceFile`); on a cold parse the cursor is `undefined`, so it falls through to `parseElement()` — i.e. `parseStatement`.

---

## Phase 6 — `parseStatement` dispatches on the current token

**`parseStatement`** (`parser.ts:7380`) is a large `switch (token())`. A few examples:

| `token()` | Action |
|---|---|
| `VarKeyword` | `parseVariableStatement(getNodePos(), …)` |
| `FunctionKeyword` | `parseFunctionDeclaration(getNodePos(), …)` |
| `IfKeyword` | `parseIfStatement()` |
| anything else | `parseExpressionOrLabeledStatement()` |

The first thing each handler does is capture **`pos = getNodePos()`** (`parser.ts:2180`):

```ts
function getNodePos(): number {
    return scanner.getTokenFullStart();   // = fullStartPos in the scanner
}
```

That is the position *including any leading whitespace/comments*, which is what the node's `pos` should be.

---

## Phase 7 — Building an AST node: the create/fill/finish lifecycle

Taking `parseVariableStatement` as a concrete example (`parser.ts:7727`):

```ts
function parseVariableStatement(pos: number, hasJSDoc: boolean, modifiers): VariableStatement {
    const declarationList = parseVariableDeclarationList(false);
    parseSemicolon();
    const node = factoryCreateVariableStatement(modifiers, declarationList);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
}
```

**Node creation** goes through `baseNodeFactory` (`parser.ts:1462`):

```ts
createBaseNode: kind => countNode(new NodeConstructor(kind, /*pos*/ 0, /*end*/ 0)),
```

The constructor is called with `pos=0, end=0` — the real span is not known yet. `countNode` just increments `nodeCount` and returns the object.

The factory then assigns child properties (e.g. `node.declarationList = declarationList`, `node.modifiers = modifiers`). Children are already fully built nodes at this point — parsing is recursive descent, so sub-nodes are complete before the parent is finished.

**`finishNode`** (`parser.ts:2600`) stamps the span and flags:

```ts
function finishNode<T extends Node>(node: T, pos: number, end?: number): T {
    setTextRangePosEnd(node, pos, end ?? scanner.getTokenFullStart());
    if (contextFlags) (node as Mutable<T>).flags |= contextFlags;
    if (parseErrorBeforeNextFinishedNode) {
        parseErrorBeforeNextFinishedNode = false;
        (node as Mutable<T>).flags |= NodeFlags.ThisNodeHasError;
    }
    return node;
}
```

- `pos` is what was captured by `getNodePos()` before any tokens were consumed for this node — it includes leading trivia.
- `end` defaults to `scanner.getTokenFullStart()` at the moment `finishNode` is called, which is where the *next* token's full start is (i.e., right after the last character of this node).
- `contextFlags` carries ambient/yield/await/strict context into the node's `flags` field for cheap downstream queries.
- If a parse error was emitted while building this node, `ThisNodeHasError` is set and the flag is cleared so subsequent nodes start clean.

**Node arrays** are stamped the same way by `createNodeArray` (`parser.ts:2594`), which calls `setTextRangePosEnd(array, pos, end ?? scanner.getTokenFullStart())` after collecting all elements.

---

## Phase 8 — Assembling the `SourceFile` node

After `parseList` returns all top-level statements, `parseSourceFileWorker` reads the EOF token and calls the inner `createSourceFile` (`parser.ts:1978`):

```ts
let sourceFile = factory.createSourceFile(statements, endOfFileToken, flags);
setTextRangePosWidth(sourceFile, 0, sourceText.length);   // pos=0, end=text.length
```

Then `setFields` attaches everything the checker and other phases need:
- `sourceFile.text = sourceText` — the raw string is kept alive on the node
- `languageVersion`, `fileName`, `scriptKind`, `languageVariant`, `isDeclarationFile`
- `bindDiagnostics = []` — the binder will populate this later

Back in `parseSourceFileWorker`, pragmas are extracted, comment directives are copied from the scanner, and then `nodeCount`/`identifierCount`/`identifiers`/`parseDiagnostics` are all attached to the source file. The `identifiers` map is a string-interning table: every identifier text is deduplicated so the same string object is shared across all `Identifier` nodes with the same text.

---

## Phase 9 — Linking the tree: parent references

If `setParentNodes` was `true` in the original call (or if called via `fixupParentReferences` explicitly), `parseSourceFileWorker` calls:

```ts
fixupParentReferences(sourceFile);
```

(`parser.ts:1970`) which delegates to **`setParentRecursive`** (`utilities.ts:10722`):

```ts
export function setParentRecursive<T extends Node>(rootNode: T, incremental: boolean): T {
    forEachChildRecursively(rootNode, bindParentToChild);
    return rootNode;

    function bindParentToChild(child: Node, parent: Node) {
        if (incremental && child.parent === parent) return "skip";  // subtree unchanged
        setParent(child, parent);
    }
}
```

`forEachChildRecursively` does a depth-first walk using each node's `forEachChild` implementation (generated from the AST shape) to visit all children. Each child gets `child.parent = parent` set. Returning `"skip"` from the callback short-circuits the subtree — used in the incremental path to avoid re-walking unchanged branches.

Note: when the full compiler pipeline runs (not just parsing), the **binder** (`binder.ts`) does this parent-linking itself as a byproduct of building `Symbol` tables, so `setParentNodes` can be left `false` in that path.

---

## Summary: the full chain

```
createSourceFile(fileName, sourceText, options)          parser.ts:1344
  └─ Parser.parseSourceFile(...)                          parser.ts:1603
       ├─ initializeState(...)                            parser.ts:1735
       │    └─ scanner.setText(sourceText)                scanner.ts:3993
       │         └─ resetTokenState(0)   pos=fullStartPos=tokenStart=0
       │
       ├─ parseSourceFileWorker(...)                      parser.ts:1803
       │    ├─ nextToken()                                parser.ts:2207
       │    │    └─ currentToken = scanner.scan()         scanner.ts:1891
       │    │         ├─ fullStartPos = pos (trivia start)
       │    │         ├─ consume trivia (loop/continue)
       │    │         ├─ tokenStart = pos (real token)
       │    │         └─ dispatch on char → advance pos, return SyntaxKind
       │    │
       │    ├─ parseList(SourceElements, parseStatement)  parser.ts:3094
       │    │    └─ loop until EndOfFileToken:
       │    │         └─ parseStatement()                 parser.ts:7380
       │    │              └─ switch(token()) → parse*()
       │    │                   ├─ pos = getNodePos()     = fullStartPos
       │    │                   ├─ ... consume tokens via nextToken() ...
       │    │                   │    each nextToken() → scanner.scan() → new token
       │    │                   ├─ factory.create*Node(children)
       │    │                   │    → new NodeConstructor(kind, 0, 0)
       │    │                   └─ finishNode(node, pos)
       │    │                        → node.pos = pos
       │    │                        → node.end = scanner.getTokenFullStart()
       │    │                        → node.flags |= contextFlags | errorFlag
       │    │
       │    ├─ createSourceFile(...)                      parser.ts:1978
       │    │    → factory.createSourceFile(statements, eof, flags)
       │    │    → setTextRangePosWidth(sf, 0, sourceText.length)
       │    │    → sf.text = sourceText, attach metadata
       │    │
       │    └─ fixupParentReferences(sourceFile)          parser.ts:1970
       │         └─ setParentRecursive(root, incremental) utilities.ts:10722
       │              └─ forEachChildRecursively → child.parent = parent
       │
       └─ clearState()  (nulls all parser-local state)
```

Every node in the finished tree carries `pos`/`end` (byte offsets into `sourceText`, with `pos` including leading trivia), `kind`, `flags`, and `parent`. The raw `text` string lives on the `SourceFile` and all position arithmetic is done against it — nodes themselves hold no substring copies.


## Final answer

_Result event — success, 203 s, 33 turns._

I now have all the pieces. Here is the complete, ordered walkthrough.

---

## Phase 1 — Public entry point hands off to the Parser namespace

**`createSourceFile`** (`parser.ts:1344`) is the public API. It unpacks `languageVersionOrOptions`, then calls the internal **`Parser.parseSourceFile`** (`parser.ts:1603`), passing the raw source string along.

---

## Phase 2 — State initialization and scanner wiring

**`Parser.parseSourceFile`** (`parser.ts:1603`) calls **`initializeState`** (`parser.ts:1735`) first. That function:

1. Fetches the concrete node constructors from `objectAllocator` (so the language service can swap in its own subclasses). They are stored as module-level `var`s — `NodeConstructor`, `TokenConstructor`, `IdentifierConstructor`, etc.
2. Resets all mutable parser state: `parseDiagnostics`, `identifiers`, `nodeCount`, `parsingContext`, `contextFlags`.
3. **Hands the text to the scanner**: `scanner.setText(sourceText)` (`scanner.ts:3993`). That function stores the string in the closure-local `text`, sets `end = text.length`, and calls `resetTokenState(0)` which zeros `pos`, `fullStartPos`, `tokenStart`, and sets `token = SyntaxKind.Unknown`.

The scanner itself (`parser.ts:1444`) is a **single shared instance** created once at module load:

```ts
var scanner = createScanner(ScriptTarget.Latest, /*skipTrivia*/ true);
```

`skipTrivia: true` is the key flag — the parser's scanner silently skips whitespace and comments rather than surfacing them as tokens, so the parser never sees trivia.

---

## Phase 3 — Priming the first token

**`parseSourceFileWorker`** (`parser.ts:1803`) is called next. Before touching any grammar, it calls **`nextToken()`** (`parser.ts:2207`):

```ts
// Prime the scanner.
nextToken();
```

`nextToken` checks whether the *current* token (still `Unknown` at this point) is an escaped keyword — it isn't — then delegates to:

```ts
function nextTokenWithoutCheck() {
    return currentToken = scanner.scan();
}
```

This loads the very first real token into `currentToken` and into the scanner's `token` variable. All subsequent parser code reads `token()` (which just returns `currentToken`) without advancing the scanner until it explicitly calls `nextToken()` again.

---

## Phase 4 — Inside `scanner.scan()`: text → token

**`scan`** (`scanner.ts:1891`) is where characters become tokens. Each call:

1. **Snapshots positions**: `fullStartPos = pos` (start of any leading trivia), `tokenFlags = TokenFlags.None`.
2. **Inner loop begins**: `tokenStart = pos` (start of the actual token text).
3. **Trivia absorption**: Because `skipTrivia` is true, whitespace (`space`, `tab`, non-breaking space, and a dozen Unicode spaces), newline characters, and comments all set `pos` forward and `continue` the inner loop — they update `tokenFlags` (e.g., `TokenFlags.PrecedingLineBreak`) but never return. The next `tokenStart = pos` assignment at the top of the loop therefore positions `tokenStart` at the first non-trivia character.
4. **Character dispatch** on `codePointUnchecked(pos)`:
   - Single-character punctuation (`(`, `)`, `{`, `;`, …): `pos++; return token = SyntaxKind.OpenParenToken` etc.
   - Multi-character operators (`!`, `&&`, `||`, `**`, …): peek `charCodeUnchecked(pos + 1)` and `+2` to decide between `!=`, `!==`, `!`; advance `pos` by 1/2/3 accordingly.
   - String literals: delegate to `scanString()` which walks until the closing quote, recording the value in `tokenValue`.
   - Template literals: `scanTemplateAndSetTokenValue()`.
   - Numbers: `scanNumber()`.
   - Default — identifiers and keywords: `scanIdentifier(ch, languageVersion)` (`scanner.ts:2425`) walks forward while `isIdentifierPart` is true, producing the raw text `text.substring(tokenStart, pos)`. It then looks that text up in the keyword table; if it matches a keyword the kind is the keyword token, otherwise it is `SyntaxKind.Identifier`. The text value is stored in `tokenValue`.

After `scan` returns, the parser's `currentToken` holds the kind, and the scanner's internal variables hold the three positions:
- `fullStartPos` — where trivia before this token started  
- `tokenStart` — where the token text itself starts  
- `pos` — one past the last character consumed (the end)

---

## Phase 5 — The statement parse loop

Back in `parseSourceFileWorker`:

```ts
const statements = parseList(ParsingContext.SourceElements, parseStatement);
```

**`parseList`** (`parser.ts:3094`) is the outer driver for any homogeneous list of nodes:

```ts
function parseList<T extends Node>(kind: ParsingContext, parseElement: () => T): NodeArray<T> {
    parsingContext |= 1 << kind;   // record we're inside SourceElements
    const list = [];
    const listPos = getNodePos();  // = scanner.getTokenFullStart()

    while (!isListTerminator(kind)) {           // stops on EndOfFileToken
        if (isListElement(kind, false)) {
            list.push(parseListElement(kind, parseElement));
            continue;
        }
        if (abortParsingListOrMoveToNextToken(kind)) break;
    }
    return createNodeArray(list, listPos);
}
```

`parseListElement` first asks the incremental syntax cursor whether a node from a prior parse can be reused (only relevant for `updateSourceFile`); on a cold parse the cursor is `undefined`, so it falls through to `parseElement()` — i.e. `parseStatement`.

---

## Phase 6 — `parseStatement` dispatches on the current token

**`parseStatement`** (`parser.ts:7380`) is a large `switch (token())`. A few examples:

| `token()` | Action |
|---|---|
| `VarKeyword` | `parseVariableStatement(getNodePos(), …)` |
| `FunctionKeyword` | `parseFunctionDeclaration(getNodePos(), …)` |
| `IfKeyword` | `parseIfStatement()` |
| anything else | `parseExpressionOrLabeledStatement()` |

The first thing each handler does is capture **`pos = getNodePos()`** (`parser.ts:2180`):

```ts
function getNodePos(): number {
    return scanner.getTokenFullStart();   // = fullStartPos in the scanner
}
```

That is the position *including any leading whitespace/comments*, which is what the node's `pos` should be.

---

## Phase 7 — Building an AST node: the create/fill/finish lifecycle

Taking `parseVariableStatement` as a concrete example (`parser.ts:7727`):

```ts
function parseVariableStatement(pos: number, hasJSDoc: boolean, modifiers): VariableStatement {
    const declarationList = parseVariableDeclarationList(false);
    parseSemicolon();
    const node = factoryCreateVariableStatement(modifiers, declarationList);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
}
```

**Node creation** goes through `baseNodeFactory` (`parser.ts:1462`):

```ts
createBaseNode: kind => countNode(new NodeConstructor(kind, /*pos*/ 0, /*end*/ 0)),
```

The constructor is called with `pos=0, end=0` — the real span is not known yet. `countNode` just increments `nodeCount` and returns the object.

The factory then assigns child properties (e.g. `node.declarationList = declarationList`, `node.modifiers = modifiers`). Children are already fully built nodes at this point — parsing is recursive descent, so sub-nodes are complete before the parent is finished.

**`finishNode`** (`parser.ts:2600`) stamps the span and flags:

```ts
function finishNode<T extends Node>(node: T, pos: number, end?: number): T {
    setTextRangePosEnd(node, pos, end ?? scanner.getTokenFullStart());
    if (contextFlags) (node as Mutable<T>).flags |= contextFlags;
    if (parseErrorBeforeNextFinishedNode) {
        parseErrorBeforeNextFinishedNode = false;
        (node as Mutable<T>).flags |= NodeFlags.ThisNodeHasError;
    }
    return node;
}
```

- `pos` is what was captured by `getNodePos()` before any tokens were consumed for this node — it includes leading trivia.
- `end` defaults to `scanner.getTokenFullStart()` at the moment `finishNode` is called, which is where the *next* token's full start is (i.e., right after the last character of this node).
- `contextFlags` carries ambient/yield/await/strict context into the node's `flags` field for cheap downstream queries.
- If a parse error was emitted while building this node, `ThisNodeHasError` is set and the flag is cleared so subsequent nodes start clean.

**Node arrays** are stamped the same way by `createNodeArray` (`parser.ts:2594`), which calls `setTextRangePosEnd(array, pos, end ?? scanner.getTokenFullStart())` after collecting all elements.

---

## Phase 8 — Assembling the `SourceFile` node

After `parseList` returns all top-level statements, `parseSourceFileWorker` reads the EOF token and calls the inner `createSourceFile` (`parser.ts:1978`):

```ts
let sourceFile = factory.createSourceFile(statements, endOfFileToken, flags);
setTextRangePosWidth(sourceFile, 0, sourceText.length);   // pos=0, end=text.length
```

Then `setFields` attaches everything the checker and other phases need:
- `sourceFile.text = sourceText` — the raw string is kept alive on the node
- `languageVersion`, `fileName`, `scriptKind`, `languageVariant`, `isDeclarationFile`
- `bindDiagnostics = []` — the binder will populate this later

Back in `parseSourceFileWorker`, pragmas are extracted, comment directives are copied from the scanner, and then `nodeCount`/`identifierCount`/`identifiers`/`parseDiagnostics` are all attached to the source file. The `identifiers` map is a string-interning table: every identifier text is deduplicated so the same string object is shared across all `Identifier` nodes with the same text.

---

## Phase 9 — Linking the tree: parent references

If `setParentNodes` was `true` in the original call (or if called via `fixupParentReferences` explicitly), `parseSourceFileWorker` calls:

```ts
fixupParentReferences(sourceFile);
```

(`parser.ts:1970`) which delegates to **`setParentRecursive`** (`utilities.ts:10722`):

```ts
export function setParentRecursive<T extends Node>(rootNode: T, incremental: boolean): T {
    forEachChildRecursively(rootNode, bindParentToChild);
    return rootNode;

    function bindParentToChild(child: Node, parent: Node) {
        if (incremental && child.parent === parent) return "skip";  // subtree unchanged
        setParent(child, parent);
    }
}
```

`forEachChildRecursively` does a depth-first walk using each node's `forEachChild` implementation (generated from the AST shape) to visit all children. Each child gets `child.parent = parent` set. Returning `"skip"` from the callback short-circuits the subtree — used in the incremental path to avoid re-walking unchanged branches.

Note: when the full compiler pipeline runs (not just parsing), the **binder** (`binder.ts`) does this parent-linking itself as a byproduct of building `Symbol` tables, so `setParentNodes` can be left `false` in that path.

---

## Summary: the full chain

```
createSourceFile(fileName, sourceText, options)          parser.ts:1344
  └─ Parser.parseSourceFile(...)                          parser.ts:1603
       ├─ initializeState(...)                            parser.ts:1735
       │    └─ scanner.setText(sourceText)                scanner.ts:3993
       │         └─ resetTokenState(0)   pos=fullStartPos=tokenStart=0
       │
       ├─ parseSourceFileWorker(...)                      parser.ts:1803
       │    ├─ nextToken()                                parser.ts:2207
       │    │    └─ currentToken = scanner.scan()         scanner.ts:1891
       │    │         ├─ fullStartPos = pos (trivia start)
       │    │         ├─ consume trivia (loop/continue)
       │    │         ├─ tokenStart = pos (real token)
       │    │         └─ dispatch on char → advance pos, return SyntaxKind
       │    │
       │    ├─ parseList(SourceElements, parseStatement)  parser.ts:3094
       │    │    └─ loop until EndOfFileToken:
       │    │         └─ parseStatement()                 parser.ts:7380
       │    │              └─ switch(token()) → parse*()
       │    │                   ├─ pos = getNodePos()     = fullStartPos
       │    │                   ├─ ... consume tokens via nextToken() ...
       │    │                   │    each nextToken() → scanner.scan() → new token
       │    │                   ├─ factory.create*Node(children)
       │    │                   │    → new NodeConstructor(kind, 0, 0)
       │    │                   └─ finishNode(node, pos)
       │    │                        → node.pos = pos
       │    │                        → node.end = scanner.getTokenFullStart()
       │    │                        → node.flags |= contextFlags | errorFlag
       │    │
       │    ├─ createSourceFile(...)                      parser.ts:1978
       │    │    → factory.createSourceFile(statements, eof, flags)
       │    │    → setTextRangePosWidth(sf, 0, sourceText.length)
       │    │    → sf.text = sourceText, attach metadata
       │    │
       │    └─ fixupParentReferences(sourceFile)          parser.ts:1970
       │         └─ setParentRecursive(root, incremental) utilities.ts:10722
       │              └─ forEachChildRecursively → child.parent = parent
       │
       └─ clearState()  (nulls all parser-local state)
```

Every node in the finished tree carries `pos`/`end` (byte offsets into `sourceText`, with `pos` including leading trivia), `kind`, `flags`, and `parent`. The raw `text` string lives on the `SourceFile` and all position arithmetic is done against it — nodes themselves hold no substring copies.

