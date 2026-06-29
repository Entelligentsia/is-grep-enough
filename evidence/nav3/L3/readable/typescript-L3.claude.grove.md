# transcript: I want to trace what happens to a source file from the moment its text is handed to the compiler until a complete syntax tree exists in memory. I'm intereste...


💬 Let me load the grove tools and then trace through the scanner and parser systematically.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition)

💬 Let me get the outlines of scanner.ts and parser.ts simultaneously to map the terrain before diving in.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/typescript/src/compiler/scanner.ts","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/typescript/src/compiler/parser.ts","detail":0})

💬 The outline of parser.ts is sparse because it's one giant namespace. Let me look up the key entry points directly.
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","name":"createSourceFile"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/typescript/src/compiler","name":"createScanner"})
  ▸ Bash(grep -n "export function createScanner\|export function createSourceFile\|function parseSourceFile\|function parseSourceFileWorker" /home/bench/repos/typescr...)

💬 Good. Now let me read the four key functions that form the backbone of this pipeline.
  ▸ mcp__grove__source({"file":"/home/bench/repos/typescript/src/compiler/parser.ts","name":"createSourceFile"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/typescript/src/compiler/scanner.ts","name":"createScanner"})
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)

💬 Now let me read `Parser.parseSourceFile`, `parseSourceFileWorker`, and the scanner's `setText` and `scan` functions.
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)

💬 Now let me find `initializeState`, `nextToken`, the scanner's `setText`, and `scan`.
  ▸ Bash(grep -n "function initializeState\|function nextToken\|function setText\b\|function scan\b\|function resetTokenState\|function finishNode\|function createNod...)
  ▸ Bash(grep -n "function setText\b\|function scan\b\|function resetTokenState\b" /home/bench/repos/typescript/src/compiler/scanner.ts | head -20)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)

💬 Now let me read the scanner's `setText`, `resetTokenState`, and the main `scan` function.
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)

💬 Let me get the identifier path in `scan`, the `finishNode` function, `parseList`, and `fixupParentReferences`.
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)

💬 Now let me read `parseList`, the identifier arm of `scan`, `fixupParentReferences`, and the internal `createSourceFile` that builds the SourceFile node.
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Bash(grep -n "function scanIdentifier\|function getIdentifierToken\|function scanIdentifierParts" /home/bench/repos/typescript/src/compiler/scanner.ts | head -10)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)

💬 Let me also check how `getNodePos` and a typical node creation work, plus how `parseStatement` dispatches.
  ▸ Bash(grep -n "function getNodePos\b\|function token()\b\|function parseStatement\b" /home/bench/repos/typescript/src/compiler/parser.ts | head -15)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)

💬 I now have all the pieces. Here is the complete sequence.  ---  ## Source text to AST: the full pipeline  ### 1. Entry: `createSourceFile` (parser.ts:1344)  ...

──────── RESULT (success, 192735ms, 30 turns) ────────
I now have all the pieces. Here is the complete sequence.

---

## Source text to AST: the full pipeline

### 1. Entry: `createSourceFile` (parser.ts:1344)

The public entry point receives the raw string and language version. It unpacks options, then delegates entirely to the `Parser` namespace:

```
Parser.parseSourceFile(fileName, sourceText, languageVersion, ...)
```

Everything below lives inside that namespace (a module-level IIFE whose shared mutable state persists for one parse and is cleared when it finishes).

---

### 2. `initializeState` (parser.ts:1735) — installing the text into the scanner

Before a single character is consumed, `initializeState` resets all parser-local variables (diagnostic list, context flags, identifier intern table, node/identifier counts) and then calls five scanner setters in sequence:

```ts
scanner.setText(sourceText);        // hands over the string
scanner.setOnError(scanError);
scanner.setScriptTarget(languageVersion);
scanner.setLanguageVariant(languageVariant);
scanner.setScriptKind(scriptKind);
scanner.setJSDocParsingMode(...);
```

**`scanner.setText`** (scanner.ts:3993):

```ts
function setText(newText, start, length) {
    text = newText || "";
    end = length === undefined ? text.length : start! + length;
    resetTokenState(start || 0);
}
```

`text` is the one closed-over string the scanner reads for the entire parse. `end` bounds how far it can go. Then:

**`resetTokenState`** (scanner.ts:4019) zeros out the five mutable scan-state variables:

```ts
pos = fullStartPos = tokenStart = position;   // all start at 0
token = SyntaxKind.Unknown;
tokenValue = undefined!;
tokenFlags = TokenFlags.None;
```

The three position cursors have distinct meanings that matter throughout parsing:
- `fullStartPos` — byte offset of the start of the current token's **leading trivia** (whitespace, comments).
- `tokenStart` — byte offset of the first non-trivia character of the token.
- `pos` — byte offset one past the **end** of the current token (the scanner's write head).

---

### 3. `Parser.parseSourceFile` dispatches to `parseSourceFileWorker` (parser.ts:1626–1632)

```ts
initializeState(...);
const result = parseSourceFileWorker(...);
clearState();
return result;
```

`clearState` is the mirror of `initializeState`: it wipes the scanner and all parser locals after the tree is built, so nothing leaks.

---

### 4. `parseSourceFileWorker` (parser.ts:1803) — priming the scanner, then the statement loop

```ts
sourceFlags = contextFlags;         // e.g. NodeFlags.Ambient for .d.ts

// Prime the scanner.
nextToken();

const statements = parseList(ParsingContext.SourceElements, parseStatement);
```

The comment says it exactly: before touching any grammar rule, the parser must load the first real token into `currentToken`. That is what "priming" means.

---

### 5. `nextToken` → `scanner.scan()` — producing one token

**`nextToken`** (parser.ts:2207) is a thin wrapper that checks for escaped keywords, then calls:

```ts
currentToken = scanner.scan();
```

`currentToken` is the parser's private copy of what the scanner just produced. Every subsequent call to the parser's `token()` accessor just returns this variable—no re-scan.

**`scan()`** (scanner.ts:1891) is the core loop. Each call produces exactly one token:

```ts
function scan(): SyntaxKind {
    fullStartPos = pos;          // include any trivia we're about to skip
    tokenFlags = TokenFlags.None;
    while (true) {
        tokenStart = pos;        // non-trivia start, updated each inner iteration
        if (pos >= end) return token = SyntaxKind.EndOfFileToken;

        const ch = codePointUnchecked(pos);
        switch (ch) {
            // Whitespace and line breaks:
            case CharacterCodes.lineFeed:
            case CharacterCodes.carriageReturn:
                tokenFlags |= TokenFlags.PrecedingLineBreak;
                if (skipTrivia) { pos++; continue; }   // <-- inner loop restart
                ...
            case CharacterCodes.space: /* etc. */
                if (skipTrivia) { pos++; continue; }
                ...
            // Punctuation — single or compound operators:
            case CharacterCodes.openParen:
                pos++; return token = SyntaxKind.OpenParenToken;
            case CharacterCodes.ampersand:
                // peek two chars ahead to distinguish &, &&, &=, &&=
                ...
            // Strings:
            case CharacterCodes.doubleQuote:
            case CharacterCodes.singleQuote:
                tokenValue = scanString();
                return token = SyntaxKind.StringLiteral;
            // Default: identifiers and keywords
            default:
                const identifierKind = scanIdentifier(ch, languageVersion);
                if (identifierKind) return token = identifierKind;
                ...
        }
    }
}
```

Key design points:
- The `while(true)` / `continue` pattern skips trivia without leaving the function: `fullStartPos` stays anchored at the start of the skipped whitespace, but `tokenStart` jumps on each inner iteration, so the returned token's span excludes the trivia even though the trivia's extent is recorded in `fullStartPos`.
- The parser was created with `skipTrivia = true`, so whitespace and comments are consumed silently inside `scan`.
- **Preceding line-break tracking**: when whitespace contains `\n`/`\r`, the flag `TokenFlags.PrecedingLineBreak` is ORed into `tokenFlags` before the `continue`. The next real token then inherits that flag, so `scanner.hasPrecedingLineBreak()` lets the parser implement ASI without re-reading the source.

**Scanning an identifier** (`scanIdentifier`, scanner.ts:2425):

```ts
function scanIdentifier(ch, languageVersion) {
    if (isIdentifierStart(ch, languageVersion)) {
        pos += charSize(ch);
        while (pos < end && isIdentifierPart(ch = codePointUnchecked(pos), languageVersion))
            pos += charSize(ch);
        tokenValue = text.substring(tokenStart, pos);   // O(1) slice
        if (ch === CharacterCodes.backslash) tokenValue += scanIdentifierParts(); // Unicode escapes
        return getIdentifierToken();
    }
}
```

`getIdentifierToken` (scanner.ts:1815) checks `tokenValue` against a pre-built `textToKeyword` Map (all 2–12 character lowercase keywords). If found, the token is the keyword's `SyntaxKind`; otherwise it is `SyntaxKind.Identifier`. The raw text is already in `tokenValue`, ready for the parser to intern.

After `scan()` returns, the scanner's state is:
- `token` = the kind just produced
- `tokenValue` = text of string/identifier/numeric literals
- `fullStartPos` = start of leading trivia
- `tokenStart` = start of the token proper
- `pos` = one past the token's end (ready for the next call)

---

### 6. `parseList` (parser.ts:3094) — the statement loop

```ts
function parseList<T>(kind: ParsingContext, parseElement: () => T): NodeArray<T> {
    const listPos = getNodePos();   // = scanner.getTokenFullStart()
    const list: T[] = [];

    while (!isListTerminator(kind)) {
        if (isListElement(kind, /*inErrorRecovery*/ false)) {
            list.push(parseListElement(kind, parseElement));
            continue;
        }
        if (abortParsingListOrMoveToNextToken(kind)) break;
    }

    return createNodeArray(list, listPos);
}
```

`getNodePos()` returns `scanner.getTokenFullStart()`—the position including any leading trivia. This is intentional: node spans in the TypeScript AST **do** include their leading trivia (spaces, comments), so `node.pos` sits before the first whitespace before the node, while `node.end` sits after the last character of the node's text.

`isListTerminator` for `SourceElements` returns `true` only on `EndOfFileToken`. `isListElement` returns `true` for anything that can start a statement.

---

### 7. `parseStatement` (parser.ts:7380) — grammar dispatch

`parseStatement` is a big `switch` on `token()` (the cached `currentToken`). Each arm captures the start position and calls a specialized parser:

```ts
case SyntaxKind.VarKeyword:
    return parseVariableStatement(getNodePos(), hasPrecedingJSDocComment(), /*modifiers*/ undefined);
case SyntaxKind.FunctionKeyword:
    return parseFunctionDeclaration(getNodePos(), hasPrecedingJSDocComment(), ...);
// ... dozens more
```

Notice `getNodePos()` is called **before** consuming the keyword token. This anchors `pos` to the start of the node including its leading trivia.

---

### 8. Node construction: the `pos` / `finishNode` bracket

Every parse function follows the same bracket:

```ts
function parseSomething(): SomeNode {
    const pos = getNodePos();              // record start (includes trivia)
    // consume keyword(s):
    parseExpected(SyntaxKind.SomeKeyword); // calls nextToken() internally
    // recurse into sub-nodes
    const name = parseIdentifier();
    const body = parseBlock();
    // stamp and return:
    return finishNode(factory.createSomething(name, body), pos);
}
```

**`parseExpected`** (parser.ts:~2490) checks `token() === expected`, calls `nextToken()` to advance past it, and emits a parse diagnostic if the token is missing—but still returns so recovery continues.

**`finishNode`** (parser.ts:2600):

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

`end` defaults to `scanner.getTokenFullStart()`, which is the start of the **next** token (including its trivia). That means a finished node's span ends where the next token begins—so the text range of consecutive nodes is contiguous with no gaps.

The `contextFlags` stamp propagates ambient/JSX/generator context from the enclosing parser state down into every node without needing a parameter.

The `parseErrorBeforeNextFinishedNode` flag is set whenever a parse error is emitted and cleared here: exactly the first node closed after an error gets `ThisNodeHasError`, which prevents incremental reuse of that subtree.

---

### 9. `createNodeArray` (parser.ts:2594) — sealing a list

When a grammar rule finishes collecting a sequence of nodes (parameters, statements, type members, …) it calls:

```ts
function createNodeArray<T>(elements: T[], pos: number, end?: number, hasTrailingComma?: boolean): NodeArray<T> {
    const array = factoryCreateNodeArray(elements, hasTrailingComma);
    setTextRangePosEnd(array, pos, end ?? scanner.getTokenFullStart());
    return array;
}
```

`NodeArray` is an ordinary JavaScript array with `pos`, `end`, and `hasTrailingComma` properties bolted on. The span works the same way as individual nodes.

---

### 10. Assembling the `SourceFile` node (parser.ts:1978–2016)

Back in `parseSourceFileWorker`, once `parseList` returns:

```ts
const endOfFileToken = withJSDoc(parseTokenNode<EndOfFileToken>(), endHasJSDoc);
const sourceFile = createSourceFile(fileName, languageVersion, ..., statements, endOfFileToken, sourceFlags, ...);
```

The private `createSourceFile` (parser.ts:1978) calls the factory:

```ts
let sourceFile = factory.createSourceFile(statements, endOfFileToken, flags);
setTextRangePosWidth(sourceFile, 0, sourceText.length);   // always covers the whole file
setFields(sourceFile);   // .text, .fileName, .languageVersion, .scriptKind, ...
```

After this, the metadata gathered during the parse is attached:

```ts
sourceFile.commentDirectives = scanner.getCommentDirectives();
sourceFile.nodeCount = nodeCount;
sourceFile.identifierCount = identifierCount;
sourceFile.identifiers = identifiers;     // the intern table
sourceFile.parseDiagnostics = attachFileToDiagnostics(parseDiagnostics, sourceFile);
```

---

### 11. `fixupParentReferences` (parser.ts:1970) — wiring the `.parent` chain

Parent pointers are **not set during parsing**. They are normally set later by the binder (`src/compiler/binder.ts`), which does a full tree walk as part of binding. If the caller passed `setParentNodes = true` (as editors often do for a syntax-only tree), the parser itself calls:

```ts
export function fixupParentReferences(rootNode: Node) {
    setParentRecursive(rootNode, /*incremental*/ true);
}
```

`setParentRecursive` (in `utilities.ts`) does a post-order walk of every child via `forEachChild` and stamps `child.parent = node`. The `incremental` flag lets it short-circuit on subtrees that already have correct parents (reused incremental nodes).

Without `setParentNodes`, `node.parent` is `undefined` on every node until the binder runs.

---

### Summary of the data flow

```
"let x = 1;"    (string)
      │
      ▼
scanner.setText()        – text/end/pos set; token state zeroed
      │
      ▼ nextToken() ──→ scanner.scan()
                           fullStartPos ← pos
                           inner while: skip whitespace (continue)
                           tokenStart ← pos of 'l'
                           scanIdentifier → "let" → textToKeyword → LetKeyword
                           pos ← past 'l','e','t'
                           return SyntaxKind.LetKeyword
      │
      ▼ parseList(SourceElements, parseStatement)
          while not EOF:
            parseStatement():
              switch(LetKeyword) → parseVariableStatement
                pos = getNodePos()         ← fullStartPos (0)
                parseExpected(Let)         ← nextToken()  pos → past "let "
                parseVariableDeclarationList
                  parseVariableDeclaration
                    pos2 = getNodePos()    ← fullStartPos of 'x'
                    parseIdentifier()
                      nextToken()          ← pos past 'x '
                      finishNode(Identifier("x"), pos2)   end = fullStartPos of '='
                    parseExpected(Equals)  ← nextToken()
                    parseInitializer
                      parseAssignmentExpression
                        parseLiteralNode()
                          pos3 = getNodePos()
                          nextToken()      ← pos past '1'
                          finishNode(NumericLiteral("1"), pos3)
                  finishNode(VariableDeclaration, pos2)
                createNodeArray([decl], pos2)
              parseSemicolon()             ← nextToken()
              finishNode(VariableStatement, pos)   end = fullStartPos of EOF
      │
      ▼ createSourceFile(statements, endOfFileToken)
          SourceFile { pos:0, end:10, text:"let x = 1;",
                       statements:[VariableStatement], ... }
      │
      ▼ [if setParentNodes] fixupParentReferences
          every node.parent ← its containing node
```

The scanner and parser share no data structure at all—only the six mutable variables inside `createScanner`'s closure. The parser reads them through the `Scanner` interface methods (`getTokenFullStart`, `getTokenText`, `hasPrecedingLineBreak`, …) and drives forward by calling `scanner.scan()` (via `nextToken()`) exactly once per token consumed. The positions on every node come from two reads of `getTokenFullStart()`: one at the start of each parse function and one inside `finishNode` for the end. That is the complete machine.
