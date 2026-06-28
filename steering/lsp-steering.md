<!-- lsp:start -->
## INVARIANT — code navigation goes through the LSP tool

Every where-is / who-calls / what-is-the-type action in this project goes through
Claude Code's built-in **`LSP`** tool (a real language server — clangd/pyright/etc —
resolving symbols through the compiler's own type model). This is not a preference.
`grep`, `rg`, `cat`, and `sed` on a source file are FALLBACKS, allowed only after
the LSP tool has been tried and returned insufficient content. Running
`grep -rn '<symbol>'` as your first action on a code question is a steering violation.

The `LSP` tool is a **deferred** tool — the moment a code question arrives, load its
schema with ToolSearch (`select:LSP`) and use it; do not default to a search agent
or grep.

**Operations** (pass `operation` plus its arguments):
- `workspaceSymbol` (`query`) — find a symbol by name across the project. Start here
  when you have a name but not a location.
- `goToDefinition` (`filePath`, `line`, `character`) — jump from a position to the
  canonical definition.
- `references` (`filePath`, `line`, `character`) — every use site of the symbol at
  that position, type-resolved.
- `hover` (`filePath`, `line`, `character`) — the resolved type / signature / doc at
  a position.
- `documentSymbol` (`filePath`) — the symbol outline of one file.

**Trigger — check before every tool call.** If the prompt contains any of — a file
path, a function / type / struct / macro name, or the words "where is", "what does X
define", "who calls", "show me", "find", "list" — your FIRST tool call MUST be an
`LSP` operation. Otherwise the LSP tool is optional.

**Procedure.**
1. Symbol by name → `LSP workspaceSymbol` with `query`. It returns the symbol's
   file + position.
2. "where is this defined" → `LSP goToDefinition` at a position where the symbol
   appears. "who calls / where used" → `LSP references`. "what type is this" →
   `LSP hover`.
3. The position-based operations need a `filePath:line:character`. To anchor one,
   you may `read` the relevant file (reading code to find the line you mean is the
   normal editor workflow) or use `workspaceSymbol`/`documentSymbol` to get a
   location — then call the LSP operation for the authoritative, type-resolved
   answer. Do NOT `grep -rn` to build the picture instead — grep returns string
   matches; the LSP tool returns the compiler-resolved definition/references,
   disambiguating overloads, shadowing, and same-named symbols in different scopes.

**Recovery (empty / not-found).** A single LSP miss does NOT justify switching to
grep for later questions. If `workspaceSymbol` comes back empty (the index may still
be warming), `read` a file where the symbol occurs and call `goToDefinition` /
`references` at that position instead, then continue using LSP.

`read` on a 1700-line file floods context with content you don't need; `grep` misses
struct/function boundaries and conflates same-named symbols. The LSP tool answers
from the compiler's type model — precise, line-exact, and cross-file.
<!-- lsp:end -->
