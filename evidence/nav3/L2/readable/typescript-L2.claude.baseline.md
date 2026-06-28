# transcript: To understand how the parser handles characters that can mean different things depending on where they appear — like `>` which could be a comparison, a shift...


💬 I'll explore the scanner and parser to map out how re-scanning works end to end.

  ▸ Agent(Map scanner re-scan methods and parser call sites)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/typescript -type f -name "scanner.ts" | head -20)
      ↳ Bash(grep -n "^\s*reScan\|^\s*scan[A-Z]" /home/bench/repos/typescript/src/compiler/scanner.ts | head -50)
      ↳ Bash(grep -n "^\s*function reScan\|^\s*const reScan\|^\s*reScan.*=\|^\s*reScan.*():" /home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Bash(grep -n "function scan()\|function scan (" /home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Bash(grep -n "reScan\|scanJsx\|scanJSDoc" /home/bench/repos/typescript/src/compiler/parser.ts | head -100)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -B3 -A3 "reScanGreaterToken()" /home/bench/repos/typescript/src/compiler/parser.ts | head -60)
      ↳ Bash(grep -n "reScanGreaterToken()" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "reScanSlashToken()" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "reScanTemplateToken" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "reScanLessThanToken()" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "reScanHashToken()" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "scanner.reScan" /home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "function nextToken\|function nextTokenJSDoc\|function nextTokenWithoutCheck\|nextToken()\|nextTokenJSDoc()" /home/bench/repos/typescript/src/compile...)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "GreaterThanToken\|GreaterThanGreaterThanToken\|GreaterThanEqualsToken" /home/bench/repos/typescript/src/compiler/scanner.ts | head -50)
      ↳ Bash(grep -n "scanRange" /home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
      ↳ Bash(grep -n "function parseType\|function parseTypeArguments" /home/bench/repos/typescript/src/compiler/parser.ts | head -20)
      ↳ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
      ↳ Bash(grep -n "nextTokenJSDoc\|scanJSDoc\|scanJsDoc" /home/bench/repos/typescript/src/compiler/parser.ts | head -40)
      ↳ ⟹ returned to parent


💬 Good coverage — let me verify the critical line numbers and read the actual code for the most important re-scan points.
  ▸ Bash(grep -n "reScan\|scanRange\b" /home/bench/repos/typescript/src/compiler/scanner.ts | head -80)
  ▸ Bash(grep -n "reScan\|scanJsxToken\|reScanJsx\|reScanAsterisk\|reScanQuestion\|reScanHash\|reScanInvalid" /home/bench/repos/typescript/src/compiler/parser.ts | he...)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/scanner.ts)
  ▸ Read(/home/bench/repos/typescript/src/compiler/parser.ts)

💬 Now I have everything I need to give you a precise, complete picture.  ---  ## How the parser handles ambiguous tokens via re-scanning  ### The design princi...

──────── RESULT (success, 216555ms, 14 turns) ────────
Now I have everything I need to give you a precise, complete picture.

---

## How the parser handles ambiguous tokens via re-scanning

### The design principle

The scanner is deliberately conservative: when it sees `>` at position N, it returns `GreaterThanToken` and stops at N+1, regardless of what follows. The parser calls into the scanner a second time — a *re-scan* — only at grammar points where the token's meaning is determined by context. This avoids the scanner needing to know whether it's inside a type argument list, an expression, a shift operator, etc.

Every re-scan method works the same mechanical way: it inspects `pos` (the scanner's current read head, already *past* the just-scanned character) and either advances it further and returns a new merged token, or rewinds it by one byte and returns a smaller split token. The parser wrappers at `parser.ts:2224–2254` update `currentToken` with the result so `token()` reflects the re-interpretation.

---

## Ambiguous tokens and their re-scan methods

### 1. `>` — the richest case

**scanner.ts:2235–2247** — `scan()` always produces exactly `GreaterThanToken` from a `>` and advances `pos` by 1.

**scanner.ts:2438–2459** — `reScanGreaterToken()` looks at the characters currently under `pos` (the ones immediately after the already-consumed `>`) and potentially merges forward:

```
> followed by >>= → GreaterThanGreaterThanGreaterThanEqualsToken  (pos +3)
> followed by >>  → GreaterThanGreaterThanGreaterThanToken        (pos +2)
> followed by >=  → GreaterThanGreaterThanEqualsToken             (pos +2)
> followed by >   → GreaterThanGreaterThanToken                   (pos +1)
> followed by =   → GreaterThanEqualsToken                        (pos +1)
otherwise         → GreaterThanToken (unchanged)
```

The three parser call sites each want something different from the same re-scan:

**Call site 1 — `parseBinaryExpressionRest` (parser.ts:5613)**
```ts
reScanGreaterToken();
const newPrecedence = getBinaryOperatorPrecedence(token());
```
Called unconditionally at the top of the binary-expression loop, it discards the returned value and just calls `token()` afterwards. The loop needs `>>=`, `>>>=`, `>>`, `>=` to have proper precedences so the expression tree is built with the right shape. Without this, `a >> b` would be parsed as `a > (> b)`.

**Call site 2 — `parseAssignmentExpressionOrHigher` (parser.ts:5128)**
```ts
if (isLeftHandSideExpression(expr) && isAssignmentOperator(reScanGreaterToken())) {
```
Used directly in the `if` condition. The return value is passed to `isAssignmentOperator()` — a check that succeeds only for `>>=`, `>>>=` (and the standard `=`, `+=`, etc.). This is how `a >>= b` is recognized as a compound assignment rather than a comparison.

**Call site 3 — `parseTypeArgumentsInExpression` (parser.ts:6574)**
```ts
if (reScanGreaterToken() !== SyntaxKind.GreaterThanToken) {
    return undefined;  // bail, not a type argument list
}
```
Here the check is inverted: the parser accepts the attempt as a type-argument list *only* if the re-scan returns the plain `GreaterThanToken`. If the re-scan would produce `>>` or `>=`, that means the source reads `Map<K>>=…` or `Map<K>>…`, which cannot close a type argument list cleanly, so the parser abandons the type-argument interpretation entirely.

**Also at `parseTypeArgumentsOfTypeReference` (parser.ts:3792)** — `reScanLessThanToken()` is called first for the opening bracket (see §2), and then `parseBracketedList` consumes the closing `>` through normal grammar rules that expect `GreaterThanToken`.

---

### 2. `<<` — split for type arguments

**scanner.ts:3673–3679** — `reScanLessThanToken()` rewinds `pos` by 1 when `token === LessThanLessThanToken`:

```ts
pos = tokenStart + 1;   // back up over the second <
return token = SyntaxKind.LessThanToken;
```

**Call site 1 — `parseTypeArgumentsOfTypeReference` (parser.ts:3792)**
```ts
if (!scanner.hasPrecedingLineBreak() && reScanLessThanToken() === SyntaxKind.LessThanToken) {
    return parseBracketedList(…);
}
```
The scanner greedily tokenizes `<<` into a single shift-left token. In `Foo<<T>` the parser hits `<<` where only `<` is needed to open a type argument. `reScanLessThanToken()` rewinds the read head so the second `<` is the next character to scan, and the check confirms it returned a plain `LessThanToken` before committing.

**Call site 2 — `parseTypeArgumentsInExpression` (parser.ts:6568)** — same pattern, but in expression context for call-site type arguments like `f<<T>(x)`.

---

### 3. `/` or `/=` — division vs. regex

**scanner.ts:2467–2611** — `reScanSlashToken()` is only entered when the current token is `SlashToken` or `SlashEqualsToken`. It resets `pos = tokenStart + 1` (back to just after the opening `/`) and re-runs the full regex body scan, consuming character classes, escape sequences, flags, and validating via a nested `scanRange()` call at scanner.ts:2602. Returns `RegularExpressionLiteral` on success, or the original slash token if the body is invalid.

**Call site — `parsePrimaryExpression` (parser.ts:6648–6652)**
```ts
case SyntaxKind.SlashToken:
case SyntaxKind.SlashEqualsToken:
    if (reScanSlashToken() === SyntaxKind.RegularExpressionLiteral) {
        return parseLiteralNode();
    }
    break;
```
`parsePrimaryExpression` is only reached when the parser needs an operand (not an operator), so `/` here is never division — but the scanner already consumed it as `SlashToken`. The re-scan re-interprets it as a regex start. Note that `/=` can also start a regex: `/=foo/` is legal (`/=foo/` is a regex matching the literal `=foo`), which is why both token kinds are listed.

---

### 4. Template tokens — re-entry after `}`

**scanner.ts:3658–3661** — `reScanTemplateToken()` resets `pos = tokenStart` (all the way back to the start of the current token) and re-runs `scanTemplateAndSetTokenValue()`. This re-reads whatever the scanner last consumed as a plain token and re-categorizes it as one of the four template kinds:

```
NoSubstitutionTemplateLiteral   (`…`)
TemplateHead                    (`…${)
TemplateMiddle                  (}…${)
TemplateTail                    (}…`)
```

The parameter `isTaggedTemplate` controls whether invalid escape sequences are errors (they are allowed silently in tagged templates per ES2018).

**Call site — `parseLiteralOfTemplateSpan` (parser.ts:3715)**
```ts
reScanTemplateToken(isTaggedTemplate);
return parseTemplateMiddleOrTemplateTail();
```
After parsing the substitution expression inside `${…}`, the parser is positioned at the `}`. That `}` was scanned as `CloseBraceToken`. The re-scan replaces that interpretation with `TemplateMiddle` or `TemplateTail`, which include the entire `}…${` or `}…\`` span.

**Call site — `parseTaggedTemplateRest` (parser.ts:6510)** — same idea for tagged templates like `` tag`…` ``.

---

### 5. JSX token re-entry

**scanner.ts:3668–3671** — `reScanJsxToken()` resets both `pos` and `tokenStart` all the way back to `fullStartPos` (including trivia), then calls `scanJsxToken()`. JSX child scanning has an entirely different character-handling table: `<` opens a child element, `{` opens an expression, and everything else is text content (including `>`, which is valid text in JSX children).

**Call site — `parseJsxChildren` (parser.ts:6171)**
```ts
const child = parseJsxChild(openingTag, currentToken = scanner.reScanJsxToken());
```
After the `>` of an opening tag is consumed by the main scanner in expression mode, the loop re-enters JSX text mode by calling `reScanJsxToken()` and immediately dispatching on the result. The return value is passed directly to `parseJsxChild` as its dispatch key, so it doubles as both the re-scan and the parse-dispatch step.

---

### 6. JSDoc token splits

These run in the opposite direction: the scanner greedily merged characters; the re-scan *splits* them back apart.

**`reScanAsteriskEqualsToken`** (scanner.ts:2461–2465): rewinds to `tokenStart+1`, giving back `EqualsToken`. Called in JSDoc type parsing (parser.ts:4605) when `*=` should be read as the JSDoc "all types" `*` followed by a default-value `=`.

**`reScanQuestionToken`** (scanner.ts:3689–3693): rewinds to `tokenStart+1`, giving back `QuestionToken`. Called in JSDoc (parser.ts:4611) when `??` should be the JSDoc nullable `?` followed by another `?`.

**`reScanHashToken`** (scanner.ts:3681–3687): rewinds to `tokenStart+1`, giving back `HashToken`. Called in JSDoc name references (parser.ts:8828, 9337) when a private identifier `#id` should be split into `#` + identifier so JSDoc can use `#` as a standalone sigil.

---

### 7. Invalid identifier recovery

**`reScanInvalidIdentifier`** (scanner.ts:2412–2423): resets all the way back to `fullStartPos` with clean token flags, then scans with `ScriptTarget.ESNext` rules that accept more Unicode. Called via `scanner.tryScan(…)` (parser.ts:2665) in `parseIdentifier`, which is an error-recovery path — the re-scan is wrapped in `tryScan` so if it fails the scanner state is rolled back.

---

## `scanRange` — non-destructive look-aside

`scanRange` (scanner.ts:3952–3975) saves the *complete* scanner state (pos, tokenStart, fullStartPos, token, tokenValue, tokenFlags, commentDirectives), calls `setText()` to point the scanner at an arbitrary slice of the text, runs a callback, then restores everything. It is not used by the parser directly; `reScanSlashToken` uses it internally at scanner.ts:2602 to validate a regex body without disturbing the parse position.

---

## Summary map

| Ambiguous character | Minimal token scanner produces | Re-scan method | What it can become | Parser call sites |
|---|---|---|---|---|
| `>` | `GreaterThanToken` | `reScanGreaterToken` | `>>`, `>>>`, `>=`, `>>=`, `>>>=` | binary-expr loop; assignment check; type-arg closing bracket |
| `<<` | `LessThanLessThanToken` | `reScanLessThanToken` | `LessThanToken` (split) | type-arg opening bracket (type ref + expression) |
| `/` or `/=` | `SlashToken` / `SlashEqualsToken` | `reScanSlashToken` | `RegularExpressionLiteral` | primary expression |
| `` ` `` after `}` | (prior token was `CloseBraceToken`) | `reScanTemplateToken` | `TemplateMiddle`, `TemplateTail` | template span; tagged template |
| `>` in JSX children | (main-mode token) | `reScanJsxToken` | `JsxText`, `LessThanToken`, `OpenBraceToken`, `LessThanSlashToken` | JSX children loop |
| `*=` in JSDoc | `AsteriskEqualsToken` | `reScanAsteriskEqualsToken` | `EqualsToken` (split, leaving `*`) | JSDoc type parsing |
| `??` in JSDoc | `QuestionQuestionToken` | `reScanQuestionToken` | `QuestionToken` (split) | JSDoc type parsing |
| `#id` in JSDoc | `PrivateIdentifier` | `reScanHashToken` | `HashToken` (split, leaving identifier) | JSDoc name references |
| unknown char | `Unknown` | `reScanInvalidIdentifier` | `Identifier` (error recovery) | `parseIdentifier` |
