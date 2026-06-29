# typescript · L2 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **typescript** (typescript) @ `8ef3e2f3d`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | typescript (typescript) · L2 |
| pinned source | `8ef3e2f3d43c8c92bda9510c47f7d4d2b3aeca33` |
| status | completed |
| engagement | `grove_tools = 2` (gate: > 0 → ✓ used its capability) |
| turns | 25 |
| wall clock | 387 s |
| context (peak) | 324,480 tokens |
| cost (billed) | $0.4494 |
| &nbsp;&nbsp;↳ token split | in 15 · out 12,386 · cache-create 29,036 · cache-read 295,429 |
| tool calls | 24 (Read×17, Bash×4, ToolSearch×1, mcp__grove__symbols×1, mcp__grove__source×1) |
| evidence | `evidence/nav3/L2/raw/typescript-L2.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> To understand how the parser handles characters that can mean different things depending on where they appear — like `>` which could be a comparison, a shift, the `=>` of an arrow function, or the closing bracket of type arguments — I need to understand the routine that produces each token from the source stream, together with the grammar-sensitive places that ask it to re-scan an already-scanned token differently and then branch on what comes back. Help me see where the parser triggers a re-scan, which tokens are ambiguous, and how each call site decides what to do with the re-scanned result.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me load the grove tools and then explore both the scanner's token-production routines and the parser's re-scan call sites in parallel.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition)`

💬 Now let me search for re-scan functions in both files simultaneously.

&nbsp;&nbsp;▸ `mcp__grove__symbols(reScan)`
&nbsp;&nbsp;▸ `Bash(grep -n "reScan\|rescan" /home/bench/repos/typescript/src/compiler/scanner.ts | head -80)`

💬 Now let me fetch all the re-scan implementations and the parser call sites in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(typescript:src/compiler/scanner.ts#reScanGreaterToken@2438)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Bash(grep -n "reScan\|nextTokenIs\|parseTypeArguments\|speculat" /home/bench/repos/typescript/src/compiler/parser.ts | grep "reScan" | head -80)`

💬 Good. Now let me get the full bodies of the key scanner functions and the key parser call sites.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Now let me look at the scanner's base `>` scan, the template token path, and the two hash/`??` re-scan call sites.

&nbsp;&nbsp;▸ `Bash(grep -n "greaterThan\|GreaterThan" /home/bench/repos/typescript/src/compiler/scanner.ts | grep -v "//" | head -40)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/parser.ts)`

💬 Let me read the scanner's base `>` and `<` handling, plus the `<<` token path that feeds `reScanLessThanToken`.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 Let me find where `<<` is normally produced in the scanner.

&nbsp;&nbsp;▸ `Bash(grep -n "LessThanLessThan\|lessThan" /home/bench/repos/typescript/src/compiler/scanner.ts | grep -v "//\|greaterThan\|JsxOpeningLike\|JsxAttributeName\|Closing\|lessThanToken" | head -30)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/typescript/src/compiler/scanner.ts)`

💬 Now I have the complete picture. Here's the full analysis.

---

## The core invariant

The scanner runs **greedily for most operators** but makes one deliberate exception: **`>` is always emitted as a bare `GreaterThanToken`**, regardless of what follows (`>=`, `>>`, `>>>=`, etc.). This is visible at `scanner.ts:2235-2247`:

```
case CharacterCodes.greaterThan:
    pos++;
    return token = SyntaxKind.GreaterThanToken;  // always stops here
```

`<`, by contrast, is greedy: `<<` is immediately folded into `LessThanLessThanToken` at `scanner.ts:2195-2199`.

The reason for the `>` asymmetry is generics. In `Array<Array<T>>` the two `>`s at the end are two separate closing angle brackets. If the scanner merged them into the shift operator `>>` up front, a generic-aware parser would have to split them back apart. Instead, the parser keeps `>` atomic and merges compound forms (`>>`, `>>=`, `>=`, …) **on demand** via a re-scan call.

Every re-scan function follows the same mechanical pattern:

```
reScanFoo():
  assert current token is the right prefix
  rewind pos to tokenStart (or tokenStart+1)
  re-run a narrowly scoped scanner routine
  write the new token into the shared `token` variable and return it
```

The key detail: **the call is not speculative** — it permanently advances `pos` and overwrites `token`. If the result token isn't useful the parser discards the branch (returns `undefined`, doesn't call `parseTokenNode`, etc.), but the scanner position has already moved.

---

## Each re-scan function

### 1. `reScanGreaterToken` — `scanner.ts:2438`

**Input token invariant:** must be `GreaterThanToken`.

**What it does:**

```
pos is already one past the first `>`.
If pos holds `>`:
  If pos+1 holds `>`:
    If pos+2 holds `=` → advance 3, return `>>>=`
    → advance 2, return `>>>`
  If pos+1 holds `=` → advance 2, return `>>=`
  → advance 1, return `>>`
If pos holds `=` → advance 1, return `>=`
Otherwise → return `>` unchanged (pos unchanged)
```

This is the only place any compound-`>` token is ever produced.

**Parser call sites:**

- **`parseBinaryExpressionRest` (`parser.ts:5613`)** — called unconditionally at the top of every iteration of the binary-op loop, *before* computing precedence:

  ```typescript
  reScanGreaterToken();
  const newPrecedence = getBinaryOperatorPrecedence(token());
  ```

  When it's `>>` the result has shift-operator precedence; when it's `>` alone it has relational-operator precedence; when it's `>>=` it has assignment-operator precedence. The precedence value is what decides whether the loop continues or returns.

- **`parseAssignmentExpressionOrHigher` (`parser.ts:5128`)** — after a LHS expression, checks for an assignment operator:

  ```typescript
  if (isLeftHandSideExpression(expr) && isAssignmentOperator(reScanGreaterToken()))
  ```

  This is the only path that can produce `>>=`/`>>>=` as assignment operators (the comment says "cases like `> > =` becoming `>>=`").

- **`parseTypeArgumentsInExpression` (`parser.ts:6574`)** — after speculatively parsing a comma-separated type arg list, expects the list to end with exactly `>`:

  ```typescript
  if (reScanGreaterToken() !== SyntaxKind.GreaterThanToken) {
      return undefined;  // not a type argument list
  }
  ```

  If the source has `f<T>>0`, after parsing `T` the current token is `>` but `pos` points to another `>`. `reScanGreaterToken` merges them into `>>`, the check fails, and the whole call is rejected as not a type argument list. (Compare with `parseTypeArgumentsOfTypeReference` in type position, which uses `parseBracketedList` — that consumes `>`s one at a time via `parseExpected`, so re-scanning isn't needed there.)

---

### 2. `reScanLessThanToken` — `scanner.ts:3673`

**Input token invariant:** `LessThanLessThanToken` (`<<`).

**What it does:** `pos = tokenStart + 1; return LessThanToken`. Peels off the first `<` and leaves `pos` pointing at the second one, which will be re-scanned as `LessThanToken` on the next `nextToken()` call.

**Why `<<` needs splitting:** the scanner eagerly produces `<<` for left-shift, but a source like `a<<string>()` should parse as `a < <string>()` — a cast — in the right syntactic context.

**Parser call sites:**

- **`parseTypeArgumentsOfTypeReference` (`parser.ts:3792`)** — in type position:

  ```typescript
  if (!scanner.hasPrecedingLineBreak() && reScanLessThanToken() === SyntaxKind.LessThanToken) {
      return parseBracketedList(TypeArguments, parseType, LessThanToken, GreaterThanToken);
  }
  ```

  Also guards against a preceding newline (because `A\n<B>` should not open a type argument list — that `<` starts a new expression).

- **`parseTypeArgumentsInExpression` (`parser.ts:6568`)** — same guard, in call-expression context.

---

### 3. `reScanSlashToken` — `scanner.ts:2467`

**Input token invariant:** `SlashToken` or `SlashEqualsToken`.

**What it does:** re-positions to `tokenStart + 1` (just past the `/`) and runs the full regex body scanner, consuming `[...]`, `\x`, and the closing `/flags`. Returns `RegularExpressionLiteral`, or leaves the token unchanged if regex scanning fails.

**Why deferred:** `/` is division or regex depending on what syntactic position it appears in. The scanner can't know which without context. It always produces `SlashToken`.

**Parser call site:**

- **`parsePrimaryExpression` (`parser.ts:6648-6653`):**

  ```typescript
  case SyntaxKind.SlashToken:
  case SyntaxKind.SlashEqualsToken:
      if (reScanSlashToken() === SyntaxKind.RegularExpressionLiteral) {
          return parseLiteralNode();
      }
      break;
  ```

  The `SlashEqualsToken` arm handles `/=` that appears where a regex is expected: `foo(/=/,x)` — the scanner produced `/=`, but re-scanning produces `/=/` as a regex with body `=` and no flags.

---

### 4. `reScanTemplateToken` — `scanner.ts:3658`

**Input token invariant:** any token produced after a `}` that closes a template expression.

**What it does:** `pos = tokenStart; scanTemplateAndSetTokenValue(!isTaggedTemplate)`. Re-scans from the `}` using the template scanner, which produces `TemplateMiddle` (if `}` is followed by more template content and `${`) or `TemplateTail` (if followed by the closing backtick).

**Why deferred:** After parsing the expression inside `${...}`, the `}` was scanned as `CloseBraceToken`. The template context needs to re-enter template scanning to consume the `}` as the start of the next template chunk.

**Parser call sites:**

- **`parseLiteralOfTemplateSpan` (`parser.ts:3714`):**

  ```typescript
  if (token() === SyntaxKind.CloseBraceToken) {
      reScanTemplateToken(isTaggedTemplate);
      return parseTemplateMiddleOrTemplateTail();
  }
  ```

- **`parsePrimaryExpression` (`parser.ts:6611`):** for `NoSubstitutionTemplateLiteral` with `TokenFlags.IsInvalid`, re-scans with `isTaggedTemplate=false` to re-emit without the error flag.

- **`parseTaggedTemplateExpression` (`parser.ts:6510`):** re-scans with `isTaggedTemplate=true` (tagged templates accept invalid escape sequences that are rejected in untagged ones).

---

### 5. `reScanAsteriskEqualsToken` — `scanner.ts:2461`

**Input token invariant:** `AsteriskEqualsToken` (`*=`).

**What it does:** `pos = tokenStart + 1; return EqualsToken`. Backs up past the `*`, making `=` the next character to be scanned.

**Call site:** JSDoc type parser (`parser.ts:4603-4608`):

```typescript
case SyntaxKind.AsteriskEqualsToken:
    scanner.reScanAsteriskEqualsToken();
    // falls through
case SyntaxKind.AsteriskToken:
    return parseJSDocAllType();
```

In `/** @type {*=} */`, the `*=` is a JSDoc "all" type (`*`) with a spurious `=`; the re-scan splits them so `*` is consumed by `parseJSDocAllType()` and `=` is left for recovery.

---

### 6. `reScanQuestionToken` — `scanner.ts:3689`

**Input token invariant:** `QuestionQuestionToken` (`??`).

**What it does:** `pos = tokenStart + 1; return QuestionToken`.

**Call site:** JSDoc type parser (`parser.ts:4609-4614`):

```typescript
case SyntaxKind.QuestionQuestionToken:
    scanner.reScanQuestionToken();
    // falls through
case SyntaxKind.QuestionToken:
    return parseJSDocUnknownOrNullableType();
```

In `/** @type {??T} */`, both `?`s are prefix nullable markers in JSDoc; the re-scan splits `??` into `?` consumed by `parseJSDocUnknownOrNullableType()`, leaving the second `?` for the next call.

---

### 7. `reScanHashToken` — `scanner.ts:3681`

**Input token invariant:** `PrivateIdentifier` (`#name`).

**What it does:** `pos = tokenStart + 1; return HashToken`. The scanner consumed `#name` as a single `PrivateIdentifier`; this resets `pos` to just past `#`, returning only `HashToken`.

**Call sites:** JSDoc member name parsing (`parser.ts:8828`, `9337`):

```typescript
while (token() === SyntaxKind.PrivateIdentifier) {
    reScanHashToken();  // splits #id into # and id
    nextTokenJSDoc();   // skips the #
    entityName = factory.createJSDocMemberName(entityName, parseIdentifier());
}
```

`{@link Foo#bar}` in JSDoc refers to a class member. The `#bar` is scanned as a `PrivateIdentifier`; the re-scan extracts `#` as the separator token so the parser can stitch together `Foo` and `bar` as a `JSDocMemberName`.

---

### 8. `reScanJsxToken` — `scanner.ts:3668`

**What it does:** `pos = tokenStart = fullStartPos; scanJsxToken(allowMultilineJsxText)`. Unlike other re-scans, this backs all the way to `fullStartPos` (the pre-trivia position) and uses a completely different scanning routine — `scanJsxToken` — which yields JSX-specific tokens: `JsxText`, `LessThanSlashToken`, `OpenBraceToken`, `EndOfFileToken`. In normal expression mode these characters would produce different tokens or errors.

**Call site:** `parseJsxChildren` (`parser.ts:6171`):

```typescript
while (true) {
    const child = parseJsxChild(openingTag, currentToken = scanner.reScanJsxToken());
    ...
}
```

Between JSX children, the scanner's state could be anything (it was in expression mode for `{expr}` spans). `reScanJsxToken` re-enters JSX text mode unconditionally before dispatching on what kind of child to parse.

---

### 9. `reScanInvalidIdentifier` — `scanner.ts:2412`

**Input token invariant:** `Unknown`.

**What it does:** Resets all the way to `fullStartPos` (trivia start), re-runs `scanIdentifier` with `ScriptTarget.ESNext` (which accepts broader Unicode identifiers). Used for error recovery — if a character was rejected under the current language target but would be valid at a higher target, emit a helpful error instead of a cryptic one.

**Call site:** the `parseIdentifier` error path (`parser.ts:2665`), inside a `tryScan`:

```typescript
if (token() === SyntaxKind.Unknown && scanner.tryScan(() =>
        scanner.reScanInvalidIdentifier() === SyntaxKind.Identifier)) {
```

`tryScan` wraps the re-scan speculatively (saves/restores state), so if it succeeds the token is accepted; otherwise everything is rolled back.

---

## Summary table

| re-scan function | Scanner always emits | Re-scan may produce | Why deferred |
|---|---|---|---|
| `reScanGreaterToken` | `>` | `>=` `>>` `>>=` `>>>` `>>>=` | `>>` in generics is two `>`s |
| `reScanLessThanToken` | `<<` | `<` (first half) | `<<` in generic context is a `<` opening type args |
| `reScanSlashToken` | `/` `/=` | `RegularExpressionLiteral` | `/` is division or regex depending on position |
| `reScanTemplateToken` | `}` (CloseBrace) | `TemplateMiddle` `TemplateTail` | `}` closes both object literals and template expressions |
| `reScanAsteriskEqualsToken` | `*=` | `=` (leaves `*` consumed) | JSDoc `*` type followed by `=` |
| `reScanQuestionToken` | `??` | `?` | JSDoc prefix-`?` can double up |
| `reScanHashToken` | `#name` | `#` | JSDoc member paths use `#` as a separator |
| `reScanJsxToken` | expression-mode token | JSX-mode token | JSX children use a different tokenizer |
| `reScanInvalidIdentifier` | `Unknown` | `Identifier` | Error recovery: character valid at ESNext but not current target |

The pattern running through all of these: **the scanner picks the single most common or most conservative interpretation** (bare `>`, bare `/`, `}` as punctuation, `#foo` as a private field), and **the parser re-interprets when grammar position makes a different reading unambiguous**. Re-scanning mutates `token` and `pos` in place; the calling parser site then either acts on the new token or returns `undefined` to signal the speculative interpretation was wrong.


## Final answer

_Result event — success, 387 s, 25 turns._

Now I have the complete picture. Here's the full analysis.

---

## The core invariant

The scanner runs **greedily for most operators** but makes one deliberate exception: **`>` is always emitted as a bare `GreaterThanToken`**, regardless of what follows (`>=`, `>>`, `>>>=`, etc.). This is visible at `scanner.ts:2235-2247`:

```
case CharacterCodes.greaterThan:
    pos++;
    return token = SyntaxKind.GreaterThanToken;  // always stops here
```

`<`, by contrast, is greedy: `<<` is immediately folded into `LessThanLessThanToken` at `scanner.ts:2195-2199`.

The reason for the `>` asymmetry is generics. In `Array<Array<T>>` the two `>`s at the end are two separate closing angle brackets. If the scanner merged them into the shift operator `>>` up front, a generic-aware parser would have to split them back apart. Instead, the parser keeps `>` atomic and merges compound forms (`>>`, `>>=`, `>=`, …) **on demand** via a re-scan call.

Every re-scan function follows the same mechanical pattern:

```
reScanFoo():
  assert current token is the right prefix
  rewind pos to tokenStart (or tokenStart+1)
  re-run a narrowly scoped scanner routine
  write the new token into the shared `token` variable and return it
```

The key detail: **the call is not speculative** — it permanently advances `pos` and overwrites `token`. If the result token isn't useful the parser discards the branch (returns `undefined`, doesn't call `parseTokenNode`, etc.), but the scanner position has already moved.

---

## Each re-scan function

### 1. `reScanGreaterToken` — `scanner.ts:2438`

**Input token invariant:** must be `GreaterThanToken`.

**What it does:**

```
pos is already one past the first `>`.
If pos holds `>`:
  If pos+1 holds `>`:
    If pos+2 holds `=` → advance 3, return `>>>=`
    → advance 2, return `>>>`
  If pos+1 holds `=` → advance 2, return `>>=`
  → advance 1, return `>>`
If pos holds `=` → advance 1, return `>=`
Otherwise → return `>` unchanged (pos unchanged)
```

This is the only place any compound-`>` token is ever produced.

**Parser call sites:**

- **`parseBinaryExpressionRest` (`parser.ts:5613`)** — called unconditionally at the top of every iteration of the binary-op loop, *before* computing precedence:

  ```typescript
  reScanGreaterToken();
  const newPrecedence = getBinaryOperatorPrecedence(token());
  ```

  When it's `>>` the result has shift-operator precedence; when it's `>` alone it has relational-operator precedence; when it's `>>=` it has assignment-operator precedence. The precedence value is what decides whether the loop continues or returns.

- **`parseAssignmentExpressionOrHigher` (`parser.ts:5128`)** — after a LHS expression, checks for an assignment operator:

  ```typescript
  if (isLeftHandSideExpression(expr) && isAssignmentOperator(reScanGreaterToken()))
  ```

  This is the only path that can produce `>>=`/`>>>=` as assignment operators (the comment says "cases like `> > =` becoming `>>=`").

- **`parseTypeArgumentsInExpression` (`parser.ts:6574`)** — after speculatively parsing a comma-separated type arg list, expects the list to end with exactly `>`:

  ```typescript
  if (reScanGreaterToken() !== SyntaxKind.GreaterThanToken) {
      return undefined;  // not a type argument list
  }
  ```

  If the source has `f<T>>0`, after parsing `T` the current token is `>` but `pos` points to another `>`. `reScanGreaterToken` merges them into `>>`, the check fails, and the whole call is rejected as not a type argument list. (Compare with `parseTypeArgumentsOfTypeReference` in type position, which uses `parseBracketedList` — that consumes `>`s one at a time via `parseExpected`, so re-scanning isn't needed there.)

---

### 2. `reScanLessThanToken` — `scanner.ts:3673`

**Input token invariant:** `LessThanLessThanToken` (`<<`).

**What it does:** `pos = tokenStart + 1; return LessThanToken`. Peels off the first `<` and leaves `pos` pointing at the second one, which will be re-scanned as `LessThanToken` on the next `nextToken()` call.

**Why `<<` needs splitting:** the scanner eagerly produces `<<` for left-shift, but a source like `a<<string>()` should parse as `a < <string>()` — a cast — in the right syntactic context.

**Parser call sites:**

- **`parseTypeArgumentsOfTypeReference` (`parser.ts:3792`)** — in type position:

  ```typescript
  if (!scanner.hasPrecedingLineBreak() && reScanLessThanToken() === SyntaxKind.LessThanToken) {
      return parseBracketedList(TypeArguments, parseType, LessThanToken, GreaterThanToken);
  }
  ```

  Also guards against a preceding newline (because `A\n<B>` should not open a type argument list — that `<` starts a new expression).

- **`parseTypeArgumentsInExpression` (`parser.ts:6568`)** — same guard, in call-expression context.

---

### 3. `reScanSlashToken` — `scanner.ts:2467`

**Input token invariant:** `SlashToken` or `SlashEqualsToken`.

**What it does:** re-positions to `tokenStart + 1` (just past the `/`) and runs the full regex body scanner, consuming `[...]`, `\x`, and the closing `/flags`. Returns `RegularExpressionLiteral`, or leaves the token unchanged if regex scanning fails.

**Why deferred:** `/` is division or regex depending on what syntactic position it appears in. The scanner can't know which without context. It always produces `SlashToken`.

**Parser call site:**

- **`parsePrimaryExpression` (`parser.ts:6648-6653`):**

  ```typescript
  case SyntaxKind.SlashToken:
  case SyntaxKind.SlashEqualsToken:
      if (reScanSlashToken() === SyntaxKind.RegularExpressionLiteral) {
          return parseLiteralNode();
      }
      break;
  ```

  The `SlashEqualsToken` arm handles `/=` that appears where a regex is expected: `foo(/=/,x)` — the scanner produced `/=`, but re-scanning produces `/=/` as a regex with body `=` and no flags.

---

### 4. `reScanTemplateToken` — `scanner.ts:3658`

**Input token invariant:** any token produced after a `}` that closes a template expression.

**What it does:** `pos = tokenStart; scanTemplateAndSetTokenValue(!isTaggedTemplate)`. Re-scans from the `}` using the template scanner, which produces `TemplateMiddle` (if `}` is followed by more template content and `${`) or `TemplateTail` (if followed by the closing backtick).

**Why deferred:** After parsing the expression inside `${...}`, the `}` was scanned as `CloseBraceToken`. The template context needs to re-enter template scanning to consume the `}` as the start of the next template chunk.

**Parser call sites:**

- **`parseLiteralOfTemplateSpan` (`parser.ts:3714`):**

  ```typescript
  if (token() === SyntaxKind.CloseBraceToken) {
      reScanTemplateToken(isTaggedTemplate);
      return parseTemplateMiddleOrTemplateTail();
  }
  ```

- **`parsePrimaryExpression` (`parser.ts:6611`):** for `NoSubstitutionTemplateLiteral` with `TokenFlags.IsInvalid`, re-scans with `isTaggedTemplate=false` to re-emit without the error flag.

- **`parseTaggedTemplateExpression` (`parser.ts:6510`):** re-scans with `isTaggedTemplate=true` (tagged templates accept invalid escape sequences that are rejected in untagged ones).

---

### 5. `reScanAsteriskEqualsToken` — `scanner.ts:2461`

**Input token invariant:** `AsteriskEqualsToken` (`*=`).

**What it does:** `pos = tokenStart + 1; return EqualsToken`. Backs up past the `*`, making `=` the next character to be scanned.

**Call site:** JSDoc type parser (`parser.ts:4603-4608`):

```typescript
case SyntaxKind.AsteriskEqualsToken:
    scanner.reScanAsteriskEqualsToken();
    // falls through
case SyntaxKind.AsteriskToken:
    return parseJSDocAllType();
```

In `/** @type {*=} */`, the `*=` is a JSDoc "all" type (`*`) with a spurious `=`; the re-scan splits them so `*` is consumed by `parseJSDocAllType()` and `=` is left for recovery.

---

### 6. `reScanQuestionToken` — `scanner.ts:3689`

**Input token invariant:** `QuestionQuestionToken` (`??`).

**What it does:** `pos = tokenStart + 1; return QuestionToken`.

**Call site:** JSDoc type parser (`parser.ts:4609-4614`):

```typescript
case SyntaxKind.QuestionQuestionToken:
    scanner.reScanQuestionToken();
    // falls through
case SyntaxKind.QuestionToken:
    return parseJSDocUnknownOrNullableType();
```

In `/** @type {??T} */`, both `?`s are prefix nullable markers in JSDoc; the re-scan splits `??` into `?` consumed by `parseJSDocUnknownOrNullableType()`, leaving the second `?` for the next call.

---

### 7. `reScanHashToken` — `scanner.ts:3681`

**Input token invariant:** `PrivateIdentifier` (`#name`).

**What it does:** `pos = tokenStart + 1; return HashToken`. The scanner consumed `#name` as a single `PrivateIdentifier`; this resets `pos` to just past `#`, returning only `HashToken`.

**Call sites:** JSDoc member name parsing (`parser.ts:8828`, `9337`):

```typescript
while (token() === SyntaxKind.PrivateIdentifier) {
    reScanHashToken();  // splits #id into # and id
    nextTokenJSDoc();   // skips the #
    entityName = factory.createJSDocMemberName(entityName, parseIdentifier());
}
```

`{@link Foo#bar}` in JSDoc refers to a class member. The `#bar` is scanned as a `PrivateIdentifier`; the re-scan extracts `#` as the separator token so the parser can stitch together `Foo` and `bar` as a `JSDocMemberName`.

---

### 8. `reScanJsxToken` — `scanner.ts:3668`

**What it does:** `pos = tokenStart = fullStartPos; scanJsxToken(allowMultilineJsxText)`. Unlike other re-scans, this backs all the way to `fullStartPos` (the pre-trivia position) and uses a completely different scanning routine — `scanJsxToken` — which yields JSX-specific tokens: `JsxText`, `LessThanSlashToken`, `OpenBraceToken`, `EndOfFileToken`. In normal expression mode these characters would produce different tokens or errors.

**Call site:** `parseJsxChildren` (`parser.ts:6171`):

```typescript
while (true) {
    const child = parseJsxChild(openingTag, currentToken = scanner.reScanJsxToken());
    ...
}
```

Between JSX children, the scanner's state could be anything (it was in expression mode for `{expr}` spans). `reScanJsxToken` re-enters JSX text mode unconditionally before dispatching on what kind of child to parse.

---

### 9. `reScanInvalidIdentifier` — `scanner.ts:2412`

**Input token invariant:** `Unknown`.

**What it does:** Resets all the way to `fullStartPos` (trivia start), re-runs `scanIdentifier` with `ScriptTarget.ESNext` (which accepts broader Unicode identifiers). Used for error recovery — if a character was rejected under the current language target but would be valid at a higher target, emit a helpful error instead of a cryptic one.

**Call site:** the `parseIdentifier` error path (`parser.ts:2665`), inside a `tryScan`:

```typescript
if (token() === SyntaxKind.Unknown && scanner.tryScan(() =>
        scanner.reScanInvalidIdentifier() === SyntaxKind.Identifier)) {
```

`tryScan` wraps the re-scan speculatively (saves/restores state), so if it succeeds the token is accepted; otherwise everything is rolled back.

---

## Summary table

| re-scan function | Scanner always emits | Re-scan may produce | Why deferred |
|---|---|---|---|
| `reScanGreaterToken` | `>` | `>=` `>>` `>>=` `>>>` `>>>=` | `>>` in generics is two `>`s |
| `reScanLessThanToken` | `<<` | `<` (first half) | `<<` in generic context is a `<` opening type args |
| `reScanSlashToken` | `/` `/=` | `RegularExpressionLiteral` | `/` is division or regex depending on position |
| `reScanTemplateToken` | `}` (CloseBrace) | `TemplateMiddle` `TemplateTail` | `}` closes both object literals and template expressions |
| `reScanAsteriskEqualsToken` | `*=` | `=` (leaves `*` consumed) | JSDoc `*` type followed by `=` |
| `reScanQuestionToken` | `??` | `?` | JSDoc prefix-`?` can double up |
| `reScanHashToken` | `#name` | `#` | JSDoc member paths use `#` as a separator |
| `reScanJsxToken` | expression-mode token | JSX-mode token | JSX children use a different tokenizer |
| `reScanInvalidIdentifier` | `Unknown` | `Identifier` | Error recovery: character valid at ESNext but not current target |

The pattern running through all of these: **the scanner picks the single most common or most conservative interpretation** (bare `>`, bare `/`, `}` as punctuation, `#foo` as a private field), and **the parser re-interprets when grammar position makes a different reading unambiguous**. Re-scanning mutates `token` and `pos` in place; the calling parser site then either acts on the new token or returns `undefined` to signal the speculative interpretation was wrong.

