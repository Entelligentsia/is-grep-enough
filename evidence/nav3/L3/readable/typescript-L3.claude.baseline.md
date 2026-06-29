# transcript: I want to trace what happens to a source file from the moment its text is handed to the compiler until a complete syntax tree exists in memory. I'm intereste...


💬 I'll read the key entry points in the scanner and parser to give you an accurate, code-grounded walkthrough.
  ▸ Bash(grep -n "export function createScanner\|export function createSourceFile\|function parseSourceFile\|function parseSourceFileWorker\|function initializeState\...)
  ▸ Bash(grep -n "export function createSourceFile\|function parseSourceFile\|function parseSourceFileWorker\|function initializeState\|nextToken\|currentToken\|parse...)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Bash(grep -n "function parseList\b\|function parseListElement\|function isListTerminator\|function isListElement\b" /home/bench/repos/typescript/src/compiler/pars...)
  ▸ Bash(grep -n "function parseStatement\b\|function parseDeclaration\b" /home/bench/repos/typescript/src/compiler/parser.ts | head -10)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Bash(grep -n "function parseVariableStatement\b\|function parseVariableDeclarationList\b\|function parseVariableDeclaration\b" /home/bench/repos/typescript/src/co...)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Bash(grep -n "function setParentRecursive\|export function setParentRecursive" /home/bench/repos/typescript/src/compiler/utilities.ts | head -5)
  ▸ Bash(grep -n "function getNodePos\b" /home/bench/repos/typescript/src/compiler/parser.ts | head -5)
  ▸ Read(/home/bench/repos/typescript/src/compiler/utilities.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)

💬 Now I have everything I need to give you a precise, code-grounded walkthrough.  ---  ## From source text to syntax tree: the full pipeline  ### 1. Entry: `cr...

──────── RESULT (success, 135631ms, 22 turns) ────────
Now I have everything I need to give you a precise, code-grounded walkthrough.

---

## From source text to syntax tree: the full pipeline

### 1. Entry: `createSourceFile` (parser.ts:1344)

Every caller (the `Program`, tests, language service) goes through `createSourceFile`. It does two things before delegating: unpacks `CreateSourceFileOptions` to get `languageVersion`, `jsDocParsingMode`, and an optional `impliedNodeFormat`; then calls `Parser.parseSourceFile`.

```
createSourceFile(fileName, sourceText, languageVersionOrOptions, setParentNodes?, scriptKind?)
  → Parser.parseSourceFile(...)
```

`Parser` is a namespace-like IIFE that closes over all shared mutable state — `currentToken`, `parseDiagnostics`, `identifiers`, the scanner itself — for the duration of one parse.

---

### 2. State setup: `initializeState` (parser.ts:1735)

`Parser.parseSourceFile` resolves `scriptKind` from the file extension if not provided, then calls `initializeState`. This function:

- Picks the right node allocator constructors (`NodeConstructor`, `IdentifierConstructor`, `SourceFileConstructor`) from `objectAllocator` — swappable so the language service can use a richer prototype.
- Clears all per-parse counters: `parseDiagnostics = []`, `nodeCount = 0`, `identifierCount = 0`, `identifiers = new Map()`.
- Sets `contextFlags` based on script kind (`.js`/`.jsx` files start with `NodeFlags.JavaScriptFile`; `.d.ts` files will later add `NodeFlags.Ambient`).
- **Hands the source string to the scanner**: `scanner.setText(sourceText)`, `scanner.setScriptTarget(languageVersion)`, `scanner.setLanguageVariant(...)`, `scanner.setJSDocParsingMode(...)`.

After `initializeState`, the scanner holds the source text but `pos = 0` and no token has been read yet. `currentToken` in the parser is still stale.

---

### 3. The scanner's internal model (scanner.ts:1022)

The scanner created by `createScanner` is a single closure over these key `var`s:

| variable | meaning |
|---|---|
| `text` | the full source string |
| `pos` | current read position (advances as characters are consumed) |
| `end` | `text.length` |
| `fullStartPos` | start of the **full** token including leading trivia |
| `tokenStart` | start of the **meaningful** token text (after trivia) |
| `token` | `SyntaxKind` of the last token scanned |
| `tokenValue` | decoded string value (strings, identifiers) |
| `tokenFlags` | bitmask: `PrecedingLineBreak`, `UnicodeEscape`, `Unterminated`, etc. |

`setText` simply resets `pos = start ?? 0` and `end = start + length ?? text.length`.

The `skipTrivia` flag passed to `createScanner` is `true` for the main parser — meaning whitespace and comments are consumed silently and the scanner loops without returning. Trivia positions are still captured via `fullStartPos` so that node positions correctly span their leading whitespace.

---

### 4. Priming: the first `nextToken()` (parser.ts:1812)

Back in `parseSourceFileWorker` (parser.ts:1803), the first act is:

```ts
nextToken();  // parser.ts:1812
```

`nextToken` (parser.ts:2207) checks for a previous keyword that had a Unicode escape (an error), then calls `nextTokenWithoutCheck` (parser.ts:2198):

```ts
currentToken = scanner.scan();
```

---

### 5. The scanner's `scan()` loop (scanner.ts:1891)

`scan()` is the heart of the scanner. Each call advances `pos` and returns one `SyntaxKind`. The structure:

```ts
function scan(): SyntaxKind {
    fullStartPos = pos;          // snapshot trivia start
    tokenFlags = TokenFlags.None;
    while (true) {
        tokenStart = pos;        // snapshot meaningful-text start
        if (pos >= end) return token = SyntaxKind.EndOfFileToken;
        const ch = codePointUnchecked(pos);
        switch (ch) {
            case CharacterCodes.lineFeed:
            case CharacterCodes.carriageReturn:
                tokenFlags |= TokenFlags.PrecedingLineBreak;
                if (skipTrivia) { pos++; continue; }  // ← loops back, not returned
                ...
            case CharacterCodes.space: ...             // ← same: advance and continue
            case CharacterCodes.slash:                 // could be comment or /
                if (next char is '/') { scanLineComment(); if (skipTrivia) continue; }
                ...
            case CharacterCodes.doubleQuote:
            case CharacterCodes.singleQuote:
                tokenValue = scanString();
                return token = SyntaxKind.StringLiteral;
            case CharacterCodes.openParen:
                pos++;
                return token = SyntaxKind.OpenParenToken;
            // ... every other character/operator
        }
    }
}
```

Key subtleties:
- **Trivia is absorbed, not returned** (when `skipTrivia = true`): the `while(true)` loop `continue`s past whitespace and comments, but the `fullStartPos` snapshot from before the loop captures the true start including all trivia.
- **`tokenFlags |= TokenFlags.PrecedingLineBreak`** is set inside the loop even when trivia is skipped, so the parser can ask `scanner.hasPrecedingLineBreak()` to handle ASI.
- Identifier/keyword scanning reads the full word, then `charCodeToSyntaxKind` maps it to a keyword kind — identifiers that happen to spell a reserved word become their keyword kind, not `Identifier`.

After `scan()` returns, `currentToken` in the parser holds the `SyntaxKind` and the scanner's position is sitting just past that token's last character.

---

### 6. The parse loop: `parseList` (parser.ts:3094)

With the first token loaded, `parseSourceFileWorker` calls:

```ts
const statements = parseList(ParsingContext.SourceElements, parseStatement);
```

`parseList` is the generic list driver:

```ts
function parseList<T extends Node>(kind: ParsingContext, parseElement: () => T): NodeArray<T> {
    const saveParsingContext = parsingContext;
    parsingContext |= 1 << kind;          // push context bit
    const list = [];
    const listPos = getNodePos();         // = scanner.getTokenFullStart()

    while (!isListTerminator(kind)) {     // stops at EOF for SourceElements
        if (isListElement(kind, false)) {
            list.push(parseListElement(kind, parseElement));
            continue;
        }
        if (abortParsingListOrMoveToNextToken(kind)) break;  // error recovery
    }

    parsingContext = saveParsingContext;
    return createNodeArray(list, listPos);
}
```

`parseListElement` first checks `currentNode(parsingContext)` — during incremental parsing a `syntaxCursor` can hand back a fully-built node from the previous parse if the position is clean, skipping re-parsing entirely. On a fresh parse this always returns `undefined`, so it falls through to `parseElement()`.

---

### 7. Statement dispatch: `parseStatement` (parser.ts:7380)

`parseStatement` is a large `switch(token())`:

```ts
function parseStatement(): Statement {
    switch (token()) {
        case SyntaxKind.VarKeyword:   return parseVariableStatement(...);
        case SyntaxKind.FunctionKeyword: return parseFunctionDeclaration(...);
        case SyntaxKind.ClassKeyword: return parseClassDeclaration(...);
        case SyntaxKind.IfKeyword:    return parseIfStatement();
        // ... all other statement-starting tokens
    }
    return parseExpressionOrLabeledStatement();
}
```

Every branch follows the same three-phase idiom:

```ts
const pos = getNodePos();          // = scanner.getTokenFullStart() — includes leading trivia
const hasJSDoc = hasPrecedingJSDocComment();
// ... recursive descent consuming tokens via nextToken() / parseXxx() ...
const node = factory.createXxx(...);
return withJSDoc(finishNode(node, pos), hasJSDoc);
```

---

### 8. A concrete example: `const x: number = 0`

**`parseVariableStatement`** (parser.ts:7727):
1. `pos = getNodePos()` — grabs `fullStartPos`, which includes any leading whitespace before `const`.
2. Calls `parseVariableDeclarationList(false)`.

**`parseVariableDeclarationList`** (parser.ts:7666):
1. Reads the keyword token (`const` → `NodeFlags.Const`), then calls `nextToken()` to advance past it.
2. Calls `parseDelimitedList(ParsingContext.VariableDeclarations, parseVariableDeclarationAllowExclamation)` — a variant of `parseList` that expects comma separators.

**`parseVariableDeclaration`** (parser.ts:7649):
1. `pos = getNodePos()`.
2. `parseIdentifierOrPattern(...)` — reads `x`, creates an `Identifier` node via `createIdentifier`, which calls `nextTokenWithoutCheck()` to advance past the identifier.
3. `parseTypeAnnotation()` — sees `:`, advances, parses `number` as a `TypeReference`.
4. `parseInitializer()` — sees `=`, advances, calls `parseAssignmentExpressionOrHigher()` which eventually reaches `parseLiteralNode()`, reads `0` as a `NumericLiteral`.
5. `factoryCreateVariableDeclaration(name, undefined, type, initializer)` assembles the node shape.
6. `finishNode(node, pos)` — see below.

Back up the call stack, `parseVariableDeclarationList` wraps the declaration array in `factoryCreateVariableDeclarationList(declarations, NodeFlags.Const)` and calls `finishNode`. Then `parseVariableStatement` calls `parseSemicolon()`, assembles the `VariableStatement`, and calls `finishNode` again.

---

### 9. How nodes are stamped: `finishNode` (parser.ts:2600)

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

- `pos` is the `fullStartPos` captured **before** parsing began — includes trivia.
- `end` defaults to `scanner.getTokenFullStart()` **now** — the start of the next token including its leading trivia, which is where the current node's text ends.
- So `node.pos` / `node.end` span the full source range of the node including its leading trivia but not the next node's trivia.
- `contextFlags` (e.g. `NodeFlags.JavaScriptFile`, `NodeFlags.Ambient`) is ORed into every node so downstream code can cheaply test parse-context.
- If a parse error was emitted since the last finished node, `NodeFlags.ThisNodeHasError` is attached and the flag is cleared, preventing error propagation onto unrelated siblings.

`getNodePos()` (parser.ts:2180) is simply `scanner.getTokenFullStart()` — the full start including trivia of the **current** (not yet consumed) token. Capturing it before calling any sub-parsers gives the outer node a `pos` that reaches back to cover all the trivia before the first token of that construct.

---

### 10. Assembling the `SourceFile` (parser.ts:1978)

After `parseList` finishes and the parser has consumed down to `EndOfFileToken`:

```ts
const sourceFile = createSourceFile(
    fileName, languageVersion, scriptKind, isDeclarationFile,
    statements, endOfFileToken, sourceFlags, setExternalModuleIndicator);
```

The internal `createSourceFile` (parser.ts:1978, distinct from the exported one) calls `factory.createSourceFile(statements, endOfFileToken, flags)` to get the node object, then stamps it:

```ts
setTextRangePosWidth(sourceFile, 0, sourceText.length);
```

The source file's range is always `[0, sourceText.length)` — the whole text. Metadata (`nodeCount`, `identifierCount`, the interned `identifiers` map, `parseDiagnostics`, `commentDirectives`) is then attached directly to the `SourceFile` object.

If the file turned out to be an external module (it has `import`/`export`) and contains top-level `await`, `reparseTopLevelAwait` is called, which creates a fresh incremental parse of the affected statements in `module` context.

---

### 11. Parent linking: `fixupParentReferences` (parser.ts:1970 → utilities.ts:10722)

The nodes as built by the parser have **no `parent` pointers** — only `pos`, `end`, `kind`, and their child references. This is intentional: the binder sets parents as part of the binding pass when semantic information is needed.

If the caller passed `setParentNodes = true` (the language service does this), `fixupParentReferences` is called:

```ts
export function fixupParentReferences(rootNode: Node) {
    setParentRecursive(rootNode, /*incremental*/ true);
}
```

`setParentRecursive` (utilities.ts:10722) does a `forEachChildRecursively` traversal, calling `setParent(child, parent)` on each node. The `incremental` flag allows it to short-circuit: if `child.parent === parent` already, it returns `"skip"` to prune that entire subtree — this makes re-parenting an already-parented tree cheap.

During a normal `tsc` compilation `setParentNodes` is `false`, and parent links are established later by the binder in a single DFS walk that also builds symbols and scopes.

---

### Summary of the sequence

```
createSourceFile(fileName, sourceText, ...)          parser.ts:1344
  └─ Parser.parseSourceFile(...)                     parser.ts:1603
       ├─ initializeState(...)                        parser.ts:1735
       │    └─ scanner.setText(sourceText)            ← text handed to scanner
       ├─ parseSourceFileWorker(...)                  parser.ts:1803
       │    ├─ nextToken()                            parser.ts:1812  ← first token loaded
       │    │    └─ scanner.scan()                    scanner.ts:1891
       │    │         while(true): skip trivia, classify char, advance pos, return SyntaxKind
       │    ├─ parseList(SourceElements, parseStatement)  parser.ts:3094
       │    │    └─ loop: parseStatement()            parser.ts:7380
       │    │         switch(currentToken) → parseXxx()
       │    │         each parseXxx():
       │    │           pos = getNodePos()            ← fullStartPos before first token
       │    │           ... recursive descent, each sub-parser calls nextToken() ...
       │    │           factory.createXxx(children)
       │    │           finishNode(node, pos)         ← stamps pos/end, flags
       │    ├─ createSourceFile(statements, eof, ...)  parser.ts:1978
       │    │    └─ setTextRangePosWidth(sf, 0, sourceText.length)
       │    └─ fixupParentReferences(sourceFile)?     parser.ts:1836 (only if setParentNodes)
       │         └─ setParentRecursive(...)           utilities.ts:10722
       └─ clearState()
```

The entire output is a `SourceFile` whose `statements` array is a tree of `Node` objects, each knowing its `pos`/`end` in the original text, its `kind`, its children, optionally its `parent`, and any flags inherited from the parse context.
