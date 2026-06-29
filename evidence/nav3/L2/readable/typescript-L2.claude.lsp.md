# typescript · L2 · lsp — readable transcript

> lsp — semantic (native Claude Code LSP tool), over **typescript** (typescript) @ `8ef3e2f3d`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `lsp` — semantic (native Claude Code LSP tool) |
| repo · rung | typescript (typescript) · L2 |
| pinned source | `8ef3e2f3d43c8c92bda9510c47f7d4d2b3aeca33` |
| status | completed |
| engagement | `lsp_tools = 21` (gate: > 0 → ✓ used its capability) |
| turns | 71 |
| wall clock | 528 s |
| context (peak) | 2,162,787 tokens |
| cost (billed) | $1.4036 |
| &nbsp;&nbsp;↳ token split | in 360 · out 28,183 · cache-create 57,959 · cache-read 2,104,468 |
| tool calls | 70 (Read×32, LSP×21, Bash×16, ToolSearch×1) |
| evidence | `evidence/nav3/L2/raw/typescript-L2.claude.lsp.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To understand how the parser handles characters that can mean different things depending on where they appear — like `>` which could be a comparison, a shift, the `=>` of an arrow function, or the closing bracket of type arguments — I need to understand the routine that produces each token from the source stream, together with the grammar-sensitive places that ask it to re-scan an already-scanned token differently and then branch on what comes back. Help me see where the parser triggers a re-scan, which tokens are ambiguous, and how each call site decides what to do with the re-scanned result.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll load the LSP tool and then trace the re-scan machinery from the scanner through every call site in the parser.

&nbsp;&nbsp;▸ `ToolSearch(select:LSP)`

💬 Now let me search for all the re-scan entry points and the scanner's main token-production routine in parallel.

&nbsp;&nbsp;▸ `LSP(reScanGreaterToken)`
&nbsp;&nbsp;▸ `LSP(reScanSlashToken)`
&nbsp;&nbsp;▸ `LSP(reScanLessThanToken)`
&nbsp;&nbsp;▸ `LSP(reScanTemplateToken)`
&nbsp;&nbsp;▸ `LSP(scanJsxToken)`

💬 Good. Let me now read the scanner interface (line 78 area) to see the full set of re-scan methods, and read each implementation in parallel.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 Good. Now let me read the remaining implementations: template, less-than, JSX, hash, question tokens, and the parser's re-scan wrappers.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Now let me find all the call sites for each re-scan function in the parser.

&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/typescript/src/compiler/parser.ts","line":2224,"character":14})`
&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/typescript/src/compiler/parser.ts","line":2228,"character":14})`
&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/typescript/src/compiler/parser.ts","line":2232,"character":14})`
&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/typescript/src/compiler/parser.ts","line":2236,"character":14})`
&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/typescript/src/compiler/parser.ts","line":2240,"character":14})`

💬 Now let me read all the call sites in parallel with enough context to understand the grammar decision at each one.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me find the call sites for `reScanAsteriskEqualsToken` and `reScanQuestionToken`, and also look at how `parseBracketedList` closes with `>`.

&nbsp;&nbsp;▸ `LSP(reScanAsteriskEqualsToken)`
&nbsp;&nbsp;▸ `LSP(reScanQuestionToken)`
&nbsp;&nbsp;▸ `LSP(reScanInvalidIdentifier)`

💬 Those three have no parser-file symbol results — let me check where they're actually called.

&nbsp;&nbsp;▸ `Bash(grep -n "reScanAsteriskEqualsToken\|reScanQuestionToken\|reScanInvalidIdentifier\|reScanJsxAttributeValue\|reScanJsxToken" /home/bench/repos/typescript/src/compiler/parser.ts | head -40)`

💬 Now let me read each of these remaining call sites with context.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Now let me check how `parseBracketedList` handles the closing `>` for type argument lists, since `reScanGreaterToken` is called explicitly before it in `parseTypeArgumentsInExpression` but not in `parseTypeArgumentsOfTypeReference`.

&nbsp;&nbsp;▸ `LSP(parseBracketedList)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Now let me look at `parseExpected` to understand how it handles closing `>` in nested generics like `Map<K, Array<V>>`.

&nbsp;&nbsp;▸ `LSP(parseExpected)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 I need to see how `parseDelimitedList` terminates when the closing `>` might be a `>>` token (nested generics like `Map<K, Array<V>>`).

&nbsp;&nbsp;▸ `LSP(parseDelimitedList)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me look at `isListTerminator` for the TypeArguments context specifically.

&nbsp;&nbsp;▸ `LSP(isListTerminator)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me check whether `parseExpected` itself has any special handling for `>>`, and how nested generics actually get their closing `>` consumed.

&nbsp;&nbsp;▸ `Bash(grep -n "GreaterThanGreaterThan\|reScanGreater\|parseExpected.*Greater" /home/bench/repos/typescript/src/compiler/parser.ts | head -30)`

💬 Let me look at the full `parseExpected` function including any overloads, and also check whether there's special `>>` handling in type parsing.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Bash(grep -n "GreaterThan\b\|GreaterThanGreater\|TypeArguments" /home/bench/repos/typescript/src/compiler/parser.ts | grep -v "//\|Diagnostics\|SyntaxKind\.Greater" | head -20)`
&nbsp;&nbsp;▸ `Bash(grep -n "nextGreaterThan\|getNextGreater\|splitGreater\|speculative\|TypeArguments.*Greater\|Greater.*TypeArg" /home/bench/repos/typescript/src/compiler/parser.ts | head -20)`

💬 Let me look at what's at line 3463 and also at the `isListElement` for TypeArguments.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me trace how `number` as a keyword type actually gets parsed — specifically whether `nextToken()` is called — to settle the question of what token follows the inner `>`.

&nbsp;&nbsp;▸ `LSP(parseNonArrayType)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `LSP(parseKeywordAndNoDot)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me look at whether `parseTokenNode` does anything special, and also search for how TypeScript handles `>>` in type argument lists.

&nbsp;&nbsp;▸ `LSP(parseTokenNode)`
&nbsp;&nbsp;▸ `Bash(grep -n "GreaterThanGreaterThan\|>>.*type\|TypeArguments.*>>" /home/bench/repos/typescript/src/compiler/parser.ts | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/typescript/tests/cases/compiler -name "*.ts" | xargs grep -l "Map<.*Array<" 2>/dev/null | head -3)`

💬 Let me search for test cases and baselines specifically testing the nested `>>` in type arguments.

&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/typescript/tests -name "*.ts" | xargs grep -l "Array<number>>" 2>/dev/null | head -5)`
&nbsp;&nbsp;▸ `Bash(ls /home/bench/repos/typescript/tests/cases/compiler/ | grep -i "generic\|typeArg\|nested" | head -20)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/typescript/tests -name "*.ts" -newer /home/bench/repos/typescript/src/compiler/parser.ts 2>/dev/null | head -5; find /home/bench/repos/typescript/tests/cases/compiler -name "generic*.ts" | head -10)`

💬 Let me look at the full `parseType` chain to see if any wrapper does a rescan of `>>` before returning.

&nbsp;&nbsp;▸ `LSP(parseArrayTypeOrHigher)`
&nbsp;&nbsp;▸ `Bash(grep -n "function parseType\b\|function parseArrayType\|function parseTypeWorker\|function parseTypeOrTypePredicate" /home/bench/repos/typescript/src/compiler/parser.ts | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/typescript/tests/cases -name "*.ts" | xargs grep -l "Map<string.*Array\|Array<.*Array<" 2>/dev/null | head -5)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/typescript/tests/cases/compiler -name "*.ts" | xargs grep -l ">>" 2>/dev/null | head -5)`
&nbsp;&nbsp;▸ `Bash(grep -c "error" /home/bench/repos/typescript/tests/baselines/reference/mappedTypeGenericInstantiationPreservesInlineForm.errors.txt 2>/dev/null || echo "no errors file"; head -5 /home/bench/repos/typescript/tests/cases/compiler/mappedTypeGenericInstantiationPreservesInlineForm.ts)`
&nbsp;&nbsp;▸ `Bash(grep ">>" /home/bench/repos/typescript/tests/cases/compiler/mappedTypeGenericInstantiationPreservesInlineForm.ts | head -5)`

💬 I need to look at what the scanner's `scan()` actually does with `>` — does it eagerly produce `>>`, or always just `>`?

&nbsp;&nbsp;▸ `Bash(grep -n "greaterThan\|GreaterThan" /home/bench/repos/typescript/src/compiler/scanner.ts | grep -v "//\|reScan\|JSX\|lessThan\|LessThan" | head -30)`

💬 Let me read the scanner's `scan()` function at the section that handles `>`.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 This is the key insight. Let me now confirm the `<` behavior the same way.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Bash(grep -n "CharacterCodes.lessThan" /home/bench/repos/typescript/src/compiler/scanner.ts | grep "case\|scan\|return" | grep -v "//\|JSX\|jsx\|reScan\|Comment\|trivia\|Trivia" | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 Now I have the complete picture. Let me compile the full explanation.

---

## How the TypeScript parser handles ambiguous tokens

### The foundational asymmetry: `>` vs `<`

The single most important fact is in `scan()` (scanner.ts:2184–2247):

- **`<` is eagerly greedy**: the scanner immediately looks ahead and produces `LessThanLessThanToken` (`<<`), `LessThanEqualsToken` (`<=`), or `LessThanSlashToken` (`</` in JSX).
- **`>` is never greedy**: every bare `>` always comes out as `GreaterThanToken`. The scanner's `case CharacterCodes.greaterThan` (line 2235) increments `pos` by 1 and returns `GreaterThanToken`, period — it never peeks ahead.

All compound `>` tokens (`>>`, `>>>`, `>=`, `>>=`, `>>>=`) are produced only when the parser explicitly calls `reScanGreaterToken()`. This design makes `Map<string, Array<number>>` parse correctly without any special mechanism — the scanner returns two separate `>` tokens, so `parseBracketedList` consuming one `>` at each closing level just works.

---

### The re-scan API

The `Scanner` interface (scanner.ts:80–96) exposes these re-scan methods, each a parser-callable escape hatch. Every one rewrites the scanner's `token` field and adjusts `pos` in place, making the next `token()` call see the new result.

---

### `reScanGreaterToken()` — scanner.ts:2438

```
if (token === GreaterThanToken) {
    peek pos+0 for '>'  → GreaterThanGreaterThanToken
    peek pos+1 for '>'  → GreaterThanGreaterThanGreaterThanToken
    peek pos+1 for '='  → GreaterThanGreaterThanEqualsToken
    peek pos+2 for '='  → GreaterThanGreaterThanGreaterThanEqualsToken
    peek pos+0 for '='  → GreaterThanEqualsToken
}
```

This is the merger. The scanner already consumed one `>` and left `pos` pointing at the character immediately after it. `reScanGreaterToken` then optionally consumes more characters to build the compound token.

**Call sites:**

| Location | Why |
|---|---|
| `parseBinaryExpressionRest` (5613) — unconditional, top of loop | In binary operator position, the parser always wants the maximal `>` token (`>=`, `>>`, etc.). Runs before `getBinaryOperatorPrecedence` to ensure `a > >= b` is read as `a` `>>=` `b`. |
| `parseAssignmentExpressionOrHigher` (5128) — before `isAssignmentOperator` | Same reason: `> > =` must produce `>>=` so it can be recognized as an assignment operator and cause `makeBinaryExpression`. |
| `parseTypeArgumentsInExpression` (6574) — after `parseDelimitedList`, inside `tryParse` | In expression-level type arguments like `f<T>()`, after the type list is parsed, calls `reScanGreaterToken()` and checks `!== GreaterThanToken`. If the result is `>=` or `>>`, the `>` is not a pure closer — this is evidence it's a comparison, not a type arg list, so the whole `tryParse` returns `undefined`. |

---

### `reScanLessThanToken()` — scanner.ts:3673

```
if (token === LessThanLessThanToken) {
    pos = tokenStart + 1   // back up one, leave the second '<' unread
    token = LessThanToken
}
```

The inverse of above. Because `<` is eager, `<<` must be split apart when the parser enters a type context.

**Call sites:**

| Location | Why |
|---|---|
| `parseTypeArgumentsOfTypeReference` (3792) — guards `parseBracketedList` | Type references like `A<<T>>` have `<<` scanned; split it to open the type argument list with `<`. |
| `parseTypeArgumentsInExpression` (6568) — inside `tryParse` | Same, at expression level: speculatively try to interpret `f<<T>>` as `f<T>`. |

---

### `reScanSlashToken()` — scanner.ts:2467

The scanner sees `/` and produces `SlashToken` (division). In primary-expression position, the same `/` could start a regex. `reScanSlashToken` rewinds `pos` to `tokenStart + 1` and re-scans the rest of the regex body, producing `RegularExpressionLiteral`.

**Call site:**

| Location | Why |
|---|---|
| `parsePrimaryExpression` (6650) — cases `SlashToken`/`SlashEqualsToken` | Context makes it unambiguous that we're parsing a primary expression, so `/` must be regex. Calls `reScanSlashToken()` and if it returns `RegularExpressionLiteral`, parses the literal; otherwise falls through to an error. |

---

### `reScanTemplateToken(isTaggedTemplate)` — scanner.ts:3658

Template literals are lexically structured as `TemplateHead`...`CloseBrace` expression `TemplateMiddle`...`TemplateMiddle`... `TemplateTail`. When the expression inside `${ }` ends, the scanner's current token is `CloseBraceToken`. But that `}` is also the opening of the next template chunk. Rescan from `tokenStart` with template rules produces `TemplateMiddle` or `TemplateTail`.

The `isTaggedTemplate` flag controls whether invalid escape sequences (`\u{...}` etc.) produce errors (`false` = report errors) or are silently allowed (`true` = tagged templates may contain raw invalid escapes, per spec).

**Call sites:**

| Location | Why |
|---|---|
| `parseLiteralOfTemplateSpan` (3715) — when token is `CloseBraceToken` | After parsing the expression in `${...}`, the `}` needs to become the next template chunk. |
| `parseTemplateHead` (3741) — when `TokenFlags.IsInvalid` is set | Rescans for error-reporting when a non-tagged template head has invalid escape sequences. |
| `parseTaggedTemplateRest` (6510) — `NoSubstitutionTemplateLiteral` branch | Rescans with `isTaggedTemplate=true` so the template literal body doesn't report invalid-escape errors. |
| `parsePrimaryExpression` (6612) — `NoSubstitutionTemplateLiteral` + `IsInvalid` | Top-level template literal that has an invalid escape: rescan with `isTaggedTemplate=false` to force error reporting. |

---

### `reScanJsxToken()` — scanner.ts:3668

JSX text mode uses a completely different scanner path (`scanJsxToken`, line 3695) that recognizes `<`, `{`, and raw text between them. After parsing a JSX child, the scanner is in normal mode; `reScanJsxToken` rewinds all the way to `fullStartPos` (the full start before trivia) and runs the JSX scanner over that stretch, delivering the correct JSX token.

**Call site:**

| Location | Why |
|---|---|
| `parseJsxChildren` (6171) — top of each child iteration, inline into `currentToken` | The main loop re-enters JSX mode for every child by calling `currentToken = scanner.reScanJsxToken()` directly on the scanner object (bypassing the parser wrapper). |

---

### `reScanHashToken()` — scanner.ts:3681

```
if (token === PrivateIdentifier) {   // e.g. #foo
    pos = tokenStart + 1             // back up past #
    token = HashToken
}
```

`#foo` is scanned as `PrivateIdentifier`. In JSDoc member names like `{@link Foo#bar}`, `#` is a separator, not a class-private marker. Split it so the `#` can be skipped and the bare identifier parsed.

**Call sites:** `parseJSDocNameReference` (8828) and `parseJSDocLinkName` (9337) — both follow the same pattern: rescan, skip the `#` with `nextTokenJSDoc()`, then parse the identifier.

---

### `reScanAsteriskEqualsToken()` — scanner.ts:2461 (JSDoc only)

`*=` (AsteriskEqualsToken) is rescanned to `EqualsToken` with `pos` rolled back to just after the `*`. In JSDoc type syntax, `*` is the "all types" wildcard, so `*=` is `*` + `=` not a compound assignment. The call at line 4605 rescans and falls through to `parseJSDocAllType`.

---

### `reScanQuestionToken()` — scanner.ts:3689 (JSDoc only)

`??` (QuestionQuestionToken) is rescanned to `QuestionToken` at `tokenStart + 1`. In JSDoc, `?` is a prefix for nullable types (`?string`); `??` appearing here should be split so the first `?` is consumed and the second left. The call at line 4611 rescans and falls through to `parseJSDocUnknownOrNullableType`.

---

### `reScanInvalidIdentifier()` — scanner.ts:2412 (error recovery)

When the scanner returns `Unknown` (character it didn't recognize), this tries to re-lex it as an identifier. Used inside `tryScan` at `parseIdentifier` (line 2665) — the scanner has already reported the "Invalid character" error, so the parser just accepts the result without adding its own diagnostic.

---

### Summary: who decides what, and how

```
token()          ← what the scanner last produced
reScanXxx()      ← parser tells scanner "that context was wrong, re-read"
nextToken()      ← advance: run scan() fresh from pos

Ambiguous tokens and their resolution strategy:

  >   always GreaterThanToken from scan()
      → expression level: ALWAYS call reScanGreaterToken() first
        to possibly extend into >=, >>, >>>, >>=, >>>=
      → type level: never rescan; >> appears as two GreaterThanToken calls

  <<  eagerly LessThanLessThanToken from scan()
      → type level: call reScanLessThanToken() to split into single <
      → expression level: leave as LessThanLessThanToken (shift op)

  /   SlashToken from scan()
      → primary expression slot: reScanSlashToken() → RegularExpressionLiteral
      → anywhere else: division operator

  }   CloseBraceToken from scan()
      → template span boundary: reScanTemplateToken() → TemplateMiddle | TemplateTail
      → everywhere else: close-brace

  #id PrivateIdentifier from scan()
      → JSDoc member separator: reScanHashToken() → HashToken, id left
      → class body: PrivateIdentifier

  *=  AsteriskEqualsToken from scan()
      → JSDoc type: reScanAsteriskEqualsToken() → EqualsToken, * left
      → expression: compound assignment operator

  ??  QuestionQuestionToken from scan()
      → JSDoc type: reScanQuestionToken() → QuestionToken, ? left
      → expression: nullish-coalescing operator
```

The pattern throughout is the same: the scanner is a simple greedy lexer that makes the locally most-obvious token, then the parser — which has grammar context — rewinds and re-lexes when the grammar says the token has a different meaning at that position.


## Final answer

_Result event — success, 528 s, 71 turns._

Now I have the complete picture. Let me compile the full explanation.

---

## How the TypeScript parser handles ambiguous tokens

### The foundational asymmetry: `>` vs `<`

The single most important fact is in `scan()` (scanner.ts:2184–2247):

- **`<` is eagerly greedy**: the scanner immediately looks ahead and produces `LessThanLessThanToken` (`<<`), `LessThanEqualsToken` (`<=`), or `LessThanSlashToken` (`</` in JSX).
- **`>` is never greedy**: every bare `>` always comes out as `GreaterThanToken`. The scanner's `case CharacterCodes.greaterThan` (line 2235) increments `pos` by 1 and returns `GreaterThanToken`, period — it never peeks ahead.

All compound `>` tokens (`>>`, `>>>`, `>=`, `>>=`, `>>>=`) are produced only when the parser explicitly calls `reScanGreaterToken()`. This design makes `Map<string, Array<number>>` parse correctly without any special mechanism — the scanner returns two separate `>` tokens, so `parseBracketedList` consuming one `>` at each closing level just works.

---

### The re-scan API

The `Scanner` interface (scanner.ts:80–96) exposes these re-scan methods, each a parser-callable escape hatch. Every one rewrites the scanner's `token` field and adjusts `pos` in place, making the next `token()` call see the new result.

---

### `reScanGreaterToken()` — scanner.ts:2438

```
if (token === GreaterThanToken) {
    peek pos+0 for '>'  → GreaterThanGreaterThanToken
    peek pos+1 for '>'  → GreaterThanGreaterThanGreaterThanToken
    peek pos+1 for '='  → GreaterThanGreaterThanEqualsToken
    peek pos+2 for '='  → GreaterThanGreaterThanGreaterThanEqualsToken
    peek pos+0 for '='  → GreaterThanEqualsToken
}
```

This is the merger. The scanner already consumed one `>` and left `pos` pointing at the character immediately after it. `reScanGreaterToken` then optionally consumes more characters to build the compound token.

**Call sites:**

| Location | Why |
|---|---|
| `parseBinaryExpressionRest` (5613) — unconditional, top of loop | In binary operator position, the parser always wants the maximal `>` token (`>=`, `>>`, etc.). Runs before `getBinaryOperatorPrecedence` to ensure `a > >= b` is read as `a` `>>=` `b`. |
| `parseAssignmentExpressionOrHigher` (5128) — before `isAssignmentOperator` | Same reason: `> > =` must produce `>>=` so it can be recognized as an assignment operator and cause `makeBinaryExpression`. |
| `parseTypeArgumentsInExpression` (6574) — after `parseDelimitedList`, inside `tryParse` | In expression-level type arguments like `f<T>()`, after the type list is parsed, calls `reScanGreaterToken()` and checks `!== GreaterThanToken`. If the result is `>=` or `>>`, the `>` is not a pure closer — this is evidence it's a comparison, not a type arg list, so the whole `tryParse` returns `undefined`. |

---

### `reScanLessThanToken()` — scanner.ts:3673

```
if (token === LessThanLessThanToken) {
    pos = tokenStart + 1   // back up one, leave the second '<' unread
    token = LessThanToken
}
```

The inverse of above. Because `<` is eager, `<<` must be split apart when the parser enters a type context.

**Call sites:**

| Location | Why |
|---|---|
| `parseTypeArgumentsOfTypeReference` (3792) — guards `parseBracketedList` | Type references like `A<<T>>` have `<<` scanned; split it to open the type argument list with `<`. |
| `parseTypeArgumentsInExpression` (6568) — inside `tryParse` | Same, at expression level: speculatively try to interpret `f<<T>>` as `f<T>`. |

---

### `reScanSlashToken()` — scanner.ts:2467

The scanner sees `/` and produces `SlashToken` (division). In primary-expression position, the same `/` could start a regex. `reScanSlashToken` rewinds `pos` to `tokenStart + 1` and re-scans the rest of the regex body, producing `RegularExpressionLiteral`.

**Call site:**

| Location | Why |
|---|---|
| `parsePrimaryExpression` (6650) — cases `SlashToken`/`SlashEqualsToken` | Context makes it unambiguous that we're parsing a primary expression, so `/` must be regex. Calls `reScanSlashToken()` and if it returns `RegularExpressionLiteral`, parses the literal; otherwise falls through to an error. |

---

### `reScanTemplateToken(isTaggedTemplate)` — scanner.ts:3658

Template literals are lexically structured as `TemplateHead`...`CloseBrace` expression `TemplateMiddle`...`TemplateMiddle`... `TemplateTail`. When the expression inside `${ }` ends, the scanner's current token is `CloseBraceToken`. But that `}` is also the opening of the next template chunk. Rescan from `tokenStart` with template rules produces `TemplateMiddle` or `TemplateTail`.

The `isTaggedTemplate` flag controls whether invalid escape sequences (`\u{...}` etc.) produce errors (`false` = report errors) or are silently allowed (`true` = tagged templates may contain raw invalid escapes, per spec).

**Call sites:**

| Location | Why |
|---|---|
| `parseLiteralOfTemplateSpan` (3715) — when token is `CloseBraceToken` | After parsing the expression in `${...}`, the `}` needs to become the next template chunk. |
| `parseTemplateHead` (3741) — when `TokenFlags.IsInvalid` is set | Rescans for error-reporting when a non-tagged template head has invalid escape sequences. |
| `parseTaggedTemplateRest` (6510) — `NoSubstitutionTemplateLiteral` branch | Rescans with `isTaggedTemplate=true` so the template literal body doesn't report invalid-escape errors. |
| `parsePrimaryExpression` (6612) — `NoSubstitutionTemplateLiteral` + `IsInvalid` | Top-level template literal that has an invalid escape: rescan with `isTaggedTemplate=false` to force error reporting. |

---

### `reScanJsxToken()` — scanner.ts:3668

JSX text mode uses a completely different scanner path (`scanJsxToken`, line 3695) that recognizes `<`, `{`, and raw text between them. After parsing a JSX child, the scanner is in normal mode; `reScanJsxToken` rewinds all the way to `fullStartPos` (the full start before trivia) and runs the JSX scanner over that stretch, delivering the correct JSX token.

**Call site:**

| Location | Why |
|---|---|
| `parseJsxChildren` (6171) — top of each child iteration, inline into `currentToken` | The main loop re-enters JSX mode for every child by calling `currentToken = scanner.reScanJsxToken()` directly on the scanner object (bypassing the parser wrapper). |

---

### `reScanHashToken()` — scanner.ts:3681

```
if (token === PrivateIdentifier) {   // e.g. #foo
    pos = tokenStart + 1             // back up past #
    token = HashToken
}
```

`#foo` is scanned as `PrivateIdentifier`. In JSDoc member names like `{@link Foo#bar}`, `#` is a separator, not a class-private marker. Split it so the `#` can be skipped and the bare identifier parsed.

**Call sites:** `parseJSDocNameReference` (8828) and `parseJSDocLinkName` (9337) — both follow the same pattern: rescan, skip the `#` with `nextTokenJSDoc()`, then parse the identifier.

---

### `reScanAsteriskEqualsToken()` — scanner.ts:2461 (JSDoc only)

`*=` (AsteriskEqualsToken) is rescanned to `EqualsToken` with `pos` rolled back to just after the `*`. In JSDoc type syntax, `*` is the "all types" wildcard, so `*=` is `*` + `=` not a compound assignment. The call at line 4605 rescans and falls through to `parseJSDocAllType`.

---

### `reScanQuestionToken()` — scanner.ts:3689 (JSDoc only)

`??` (QuestionQuestionToken) is rescanned to `QuestionToken` at `tokenStart + 1`. In JSDoc, `?` is a prefix for nullable types (`?string`); `??` appearing here should be split so the first `?` is consumed and the second left. The call at line 4611 rescans and falls through to `parseJSDocUnknownOrNullableType`.

---

### `reScanInvalidIdentifier()` — scanner.ts:2412 (error recovery)

When the scanner returns `Unknown` (character it didn't recognize), this tries to re-lex it as an identifier. Used inside `tryScan` at `parseIdentifier` (line 2665) — the scanner has already reported the "Invalid character" error, so the parser just accepts the result without adding its own diagnostic.

---

### Summary: who decides what, and how

```
token()          ← what the scanner last produced
reScanXxx()      ← parser tells scanner "that context was wrong, re-read"
nextToken()      ← advance: run scan() fresh from pos

Ambiguous tokens and their resolution strategy:

  >   always GreaterThanToken from scan()
      → expression level: ALWAYS call reScanGreaterToken() first
        to possibly extend into >=, >>, >>>, >>=, >>>=
      → type level: never rescan; >> appears as two GreaterThanToken calls

  <<  eagerly LessThanLessThanToken from scan()
      → type level: call reScanLessThanToken() to split into single <
      → expression level: leave as LessThanLessThanToken (shift op)

  /   SlashToken from scan()
      → primary expression slot: reScanSlashToken() → RegularExpressionLiteral
      → anywhere else: division operator

  }   CloseBraceToken from scan()
      → template span boundary: reScanTemplateToken() → TemplateMiddle | TemplateTail
      → everywhere else: close-brace

  #id PrivateIdentifier from scan()
      → JSDoc member separator: reScanHashToken() → HashToken, id left
      → class body: PrivateIdentifier

  *=  AsteriskEqualsToken from scan()
      → JSDoc type: reScanAsteriskEqualsToken() → EqualsToken, * left
      → expression: compound assignment operator

  ??  QuestionQuestionToken from scan()
      → JSDoc type: reScanQuestionToken() → QuestionToken, ? left
      → expression: nullish-coalescing operator
```

The pattern throughout is the same: the scanner is a simple greedy lexer that makes the locally most-obvious token, then the parser — which has grammar context — rewinds and re-lexes when the grammar says the token has a different meaning at that position.

