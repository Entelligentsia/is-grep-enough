# TypeScript prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/typescript` (SHA 8ef3e2f3d43c8c92bda9510c47f7d4d2b3aeca33,
TypeScript). All file:line cites verified against that tree. The compiler core lives in
`src/compiler/` (`types.ts`, `scanner.ts`, `parser.ts`, `binder.ts`, `checker.ts`, `program.ts`,
`emitter.ts`, `transformer.ts`); the levels range across the front-end and emit spine because that is
the most structurally legible part of the compiler and lets the traversal ladder escalate cleanly
within one cohesive area.

Calibrated against the approved anchor set at `experiment/prompts/redis`. Traversal depth per level is
held comparable to the redis bar (L1 one-site/one-fact; L2 one routine + a star of internal callers;
L3 an ordered multi-file chain; L4 a bounded cooperating cluster; L5 a concern threading multiple
subsystems).

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm trying to reason about how the TypeScript compiler represents a single piece of syntax
in memory once it's been parsed — the base object that every AST node is built on, separate from any
specific kind of declaration or expression. I need to understand what that container carries: how it
records what kind of syntactic construct it is versus a separate set of bit-flags that categorize it
for binding and transforms, how it knows where it sits in the source text and in the parent tree, and
the extra slots the binder and transformer attach to it as they process it. Walk me through the makeup
of that container."

**Larger task it slices from:** adding a new node flag/attached slot, reasoning about per-node memory
overhead, or changing how the binder/transformer annotate nodes — needs a clear mental model of the
`Node` base first.

**Why this level:** The answer lives at a single definition site — `interface Node` in
`src/compiler/types.ts:942` — and is one concrete fact (the shape of one entity). To answer well the
agent must integrate the meaning of several adjacent fields (`kind`/`flags`/`pos`/`end`/`parent` and
the attached `id`/`transformFlags`/`original`/`emitNode`) and the `kind` vs `flags` distinction
(SyntaxKind = parse-time identity vs NodeFlags = a bitset partly parse-time, partly binder-initialized,
per the comments at `types.ts:782-803`), but it never leaves that one interface — 0 call hops. It is
not primitive-isomorphic: it asks for the *role* of the fields (kind vs flags, what each attached slot
is for, pos/end vs parent), which requires reading and synthesizing the declaration, not a single
"jump to definition." Exceeds nothing below (floor). Directly analogous to redis L1's `struct
redisObject` (one container, its fields, the type-vs-encoding distinction) and rails L1's
`ActiveModel::Attribute`.

**Ground-truth answer sketch:** see `L1.reference.md` (entity `Node` `types.ts:942` extending
`ReadonlyTextRange` `:33` (pos/end `:34-35`); `kind: SyntaxKind` `:943` (enum `:40`); `flags: NodeFlags`
`:944` (enum `:782`); `parent` `:948`; attached slots `id` `:947`/`modifierFlagsCache` `:945`/
`transformFlags` `:946`/`original` `:949`/`emitNode` `:950`).

**Neutrality check:** text — grep `interface Node extends` / `readonly kind: SyntaxKind` lands on the
interface; structural — the interface declaration is one node; semantic — go-to-def on a `Node` type.
All three reach the same single site; differences are only in cost. Not isomorphic because the
*understanding* (kind vs flags, what the attached slots are for) must be read off the fields, not
produced by the locate primitive itself.

---

## L2 — neighborhood (a routine + its direct callers, 1 hop)

**Prompt:** "To understand how the parser handles characters that can mean different things depending
on where they appear — like `>` which could be a comparison, a shift, the `=>` of an arrow function, or
the closing bracket of type arguments — I need to understand the routine that produces each token from
the source stream, together with the grammar-sensitive places that ask it to re-scan an already-scanned
token differently and then branch on what comes back. Help me see where the parser triggers a re-scan,
which tokens are ambiguous, and how each call site decides what to do with the re-scanned result."

**Larger task it slices from:** changing lexical disambiguation (e.g. a new `??`/`?.`-style operator,
or altering when `>` is re-scanned for arrows/type-args) — must first know the scanner's `scan`/re-scan
routines and the parser positions that trigger them.

**Why this level:** One focal routine — `scan()` (`scanner.ts:1891`) — plus the re-scan family
(`reScanGreaterToken`/`reScanSlashToken`/`reScanLessThanToken`/`reScanQuestionToken`/
`reScanAsteriskEqualsToken`/`reScanTemplateToken`) and the small, real cluster of parser call sites
that branch on the re-scanned `SyntaxKind` (arrow `=>` `parser.ts:5128`, regex `:6650`, JSX `<` `:3792`,
type-args `>` `:6574`). Exactly one hop out (parser → scanner), and synthesis is required: the same
characters yield *different* tokens depending on grammar position, and each call site does a distinct
thing with the re-scanned result (detect arrow, detect regex, detect JSX, peel type-arg brackets) —
which cannot be read from `scan()`'s definition alone. Exceeds L1 because it is no longer one site/one
fact — it requires fanning out to several re-scan methods and their parser branch sites and relating
them to one routine. It stops short of L3 because there is no ordered end-to-end chain to walk — it is
a star (one scanner focal + its re-scan handlers + the parser sites that trigger them), not a path.
Directly analogous to redis L2's `expireIfNeeded` + on-access callers branching on the expiry outcome
and rails L2's `load` + accessors branching on `loaded?` (all are on-access routines with a star of
callers that branch on a result/state).

**Ground-truth answer sketch:** see `L2.reference.md` (focal `scan()` `scanner.ts:1891`;
`nextToken`/`nextTokenWithoutCheck` `parser.ts:2207`/`:2198` → `scanner.scan()` `:2200`; re-scan family
`scanner.ts:2438`/`:2467`/`:3673`/`:3689`/`:2461`/`:3658`; parser branch sites `parser.ts:5128`
(arrow `=>`), `:6650` (regex), `:3792` (JSX `<`), `:6574`/`:6568` (type-args)).

**Neutrality check:** text — grep `function scan` / `reScanGreaterToken` / `reScanLessThanToken` yields
the focal + the re-scan methods + the parser call sites (the parser wrappers and branch sites all
mention `reScan*`); structural — the method nodes plus their reference set across scanner.ts/parser.ts;
semantic — find-refs on `scan`/`reScan*`. Each reaches the same neighborhood; cost differs (grep returns
raw hits to be read; structural/semantic give the reference set), feasibility does not. Not isomorphic:
a single find-refs lists call sites but does not tell you *which characters are ambiguous and how each
site branches* — that needs reading and integrating each site's `SyntaxKind` comparison.

---

## L3 — path (a directed chain across files, multi-hop, one path)

**Prompt:** "I want to trace what happens to a source file from the moment its text is handed to the
compiler until a complete syntax tree exists in memory. I'm interested in how the text is given to the
scanner, how the parser primes the first token and drives the scan loop, how statements and expressions
are built into AST nodes as tokens are consumed, and how the finished nodes are linked into a parented
tree. Walk me through that sequence in order, end to end."

**Larger task it slices from:** adding parse-time instrumentation, changing scanner/parser hand-off,
or altering parent-linking — needs the precise text → scanner → parser → parented-tree spine.

**Why this level:** A single directed chain threaded through `parser.ts` and `scanner.ts`, multiple
hops, followed in order: `createSourceFile` → `parseSourceFile`/`initializeState`+`scanner.setText` →
`parseSourceFileWorker`/`nextToken`+`parseList` → `parseStatement`/`scan` build nodes →
`fixupParentReferences` → return `SourceFile`. Each step names the next; the agent must follow them as a
sequence, not just collect neighbors. Entry ambiguity is real: there is a JSON branch (`parseSourceFile`
`parser.ts:1614`) alongside the TS/JS path, and `fixupParentReferences` only runs when `setParentNodes`
is set, so the agent must pick the live TS/JS path and note the conditional parent step. Exceeds L2
because it is an ordered multi-file traversal (a path), not a one-hop star; stays below L4 because it is
one linear path, not a cluster of interrelating paths forming a subsystem. Directly analogous to redis
L3's socket-bytes → handler chain (a raw-input → processed-structure chain of comparable hop count).

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `createSourceFile` `parser.ts:1344`
→ `Parser.parseSourceFile` `:1362` → `parseSourceFile` `:1603` → `initializeState`/`scanner.setText`
`:1735`/`:1772`/`scanner.ts:3993` → `parseSourceFileWorker` `:1803` → `nextToken`/`scan` `:1812`/
`scanner.ts:1891` → `parseList`/`parseStatement` `:3094`/`:7380` → `fixupParentReferences` `:1970` →
`SourceFile` `:1839`).

**Neutrality check:** text — grep the function names and follow the calls between them across
parser.ts/scanner.ts; structural — call-graph edges from `createSourceFile` down to `parseStatement`/
`scan`; semantic — go-to-def chained call by call. All three can walk the chain; grep must read each
body to find the next callee (higher cost), structural/semantic surface callees directly. Feasible for
all. Not isomorphic: no single primitive yields a 6-hop ordered path with a branch choice (JSON vs TS)
and a conditional final step; the agent must decide the order and the right branch at each step.

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm studying how the TypeScript compiler walks a parsed file and attaches symbols to it —
building the symbol tables that later type-checking will use. I need to understand how binding is
started for a source file, how the walk sets each node's parent and then dispatches by node kind to a
per-kind handler, how a declaration's symbol gets inserted into the right symbol table and what happens
when a name is already taken (merge versus conflict), and how the walk tracks which container scope it's
currently inside so that locals go into the right table. Show me how these cooperating pieces fit
together."

**Larger task it slices from:** changing binding semantics (e.g. a new declaration kind, a new merge
rule, or altering scope tracking) — needs the whole binder subsystem and how its parts coordinate.

**Why this level:** A cohesive feature cluster in `binder.ts`, with several interrelating paths rather
than one line: (a) per-file entry + state (`bindSourceFile`/`createBinder`), (b) the focal `bind` walk
(setParent + bindWorker + recurse), (c) `bindWorker` kind-dispatch to per-kind handlers, (d)
`declareSymbolAndAddToSymbolTable`/`declareSymbol` symbol-table insert with merge/conflict branching,
(e) container-scope tracking (`getContainerFlags` + `bindChildren`/`bindEach` + the
`container`/`blockScopeContainer` variables). The agent must understand how these cooperate — the walk
drives the dispatch, the dispatch calls the insert, the insert consults the current container to pick
the table, and the merge/conflict branching decides whether a same-named declaration merges or errors —
not just trace one call. Entry ambiguity: "the right symbol table" spans `locals`/`members`/`exports`/
`file.locals` chosen by container kind, and "merge versus conflict" is internal branching in
`declareSymbol` the agent has to discover and join. Exceeds L3 because it is a bounded module with
multiple cooperating paths (not a single ordered chain); stays below L5 because it is one feature/area
(binding), not a concern threaded across multiple subsystems. Directly analogous to redis L4's bgsave
cluster (four cooperating pieces) and rails L4's connection-pool cluster.

**Ground-truth answer sketch:** see `L4.reference.md` (`bindSourceFile` `binder.ts:502`/`:571`,
`createBinder` `:509`; `bind` `:2751` (setParent `:2755` + bindWorker `:2779` + `getContainerFlags`
`:2788` + `bindChildren` `:2790`); `bindWorker` `:2846` (switch on kind `:2847`) →
`bindBlockScopedDeclaration` `:2437`/`bindFunctionDeclaration` `:3709`;
`declareSymbolAndAddToSymbolTable` `:2264` → `declareSymbol` `:749` (create `:786-788` /
replaceable `:790-792` / conflict+error `:793+` / merge); `getContainerFlags` `:3815`,
`bindChildren`/`bindEach` `:1096`/`:1084`).

**Neutrality check:** text — grep `function bind`/`bindWorker`/`declareSymbol`/`getContainerFlags`/
`bindChildren` and stitch the module; structural — the call cluster around `bind`/`bindWorker` plus
`declareSymbol` references; semantic — refs/defs across the file. All feasible; the scope-table
selection (which table a local goes into) means *no* tool auto-links a declaration to "the right table"
— every regime must reason about `getContainerFlags` + the `container` variables, so none is uniquely
advantaged. Not isomorphic: spans multiple functions and a stateful scope stack with internal
merge/conflict branching; no single primitive returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to what happens around producing output and reported errors for a
source file, so I need to understand the full journey from source text to emitted JavaScript and
diagnostics. Starting from how the program reads and parses files into syntax trees, then how those
trees get bound to symbols, then how the type checker lazily checks them and produces diagnostics, and
finally how emit runs transforms and writes out JavaScript or declaration files — walk me through that
whole flow and how the stages connect across the modules involved."

**Larger task it slices from:** modifying the compile pipeline (e.g. a new emit target, changing when
binding/checking runs, or new diagnostic gating) — requires the end-to-end parse → bind → check → emit
spine across subsystems.

**Why this level:** A concern that threads four subsystems — parse (parser + scanner), bind (binder),
check (checker), emit (emitter + transformer) — coordinated by the `Program` (holds source files) and
the `TypeChecker` (hub for bind+check). It is whole-system: the agent integrates "text → AST" (parse),
"AST → symbols/flow" (bind), "symbols → types + diagnostics" (check), and "AST → transformed → written
JS/.d.ts" (emit). Entry ambiguity is high: binding is *not* driven by `createProgram` directly but by
the checker's `initializeTypeChecker` (`checker.ts:2410`/`:51557`); checking is lazy and cached per
file, fired only by `getSemanticDiagnostics`/`emit`; emit runs `transformNodes` before the printer
(`transformer.ts:248`). Each of these indirections the agent must discover rather than assume a linear
`createProgram does everything`. Exceeds L4 because it crosses subsystem boundaries (parse ↔ bind ↔
check ↔ emit) instead of staying inside one feature module; L3 and L4 are focused sub-paths of this
integration (L3 = the parse path; L4 = the bind subsystem), and L5 is how they connect across all four.
Directly analogous to redis L5's write → propagation → replication flow (a write's effect threading
execution, propagation, and transport subsystems via deferred indirection) and rails L5's save flow
across validations/callbacks/persistence/associations/transactions.

**Ground-truth answer sketch:** see `L5.reference.md` (parse `createProgram` `program.ts:1515` →
`processSourceFile` `:3486` → `findSourceFile` `:3522` → `createSourceFile` `parser.ts:1344` (via
`program.ts:410`); bind `createTypeChecker` `checker.ts:1486` → `initializeTypeChecker` `:2410` →
`bindSourceFile` `:51557`/`binder.ts:502`; check `getSemanticDiagnostics` `program.ts:2798` →
`getSemanticDiagnosticsForFile` `:2858` → `getBindAndCheckDiagnosticsForFile` `:2869` →
`getBindAndCheckDiagnosticsForFileNoCache` `:2887` → `typeChecker.getDiagnostics` `:2906` →
`checkSourceFile` `checker.ts:49547`; emit `emit` `program.ts:2688` → `emitWorker` `:2699` →
`emitFiles` `emitter.ts:752` (at `:2753`) with `getTransformers` `:2757` → `transformNodes`
`transformer.ts:248`).

**Neutrality check:** text — grep `createProgram`/`processSourceFile`/`bindSourceFile`/
`initializeTypeChecker`/`getSemanticDiagnostics`/`checkSourceFile`/`emitFiles`/`transformNodes` and
assemble across six files; structural — call/super edges from `createProgram` through the checker into
emit; semantic — refs/defs chaining the same. All feasible. The checker-driven-binding and
lazy-cached-checking indirections defeat a naive single-call trace for every regime equally — each must
reason about "bind is triggered by the checker, check is deferred until requested" — so none is uniquely
required. Not isomorphic: the flow spans ~10 functions across six files and two hub objects (`Program`,
`TypeChecker`), well beyond any one primitive.

---

## Calibration notes for the reviewer

- **Cohesion:** L1–L5 escalate within the compiler front-end + emit spine (types → scanner/parser →
  binder → checker → emitter/transformer), holding traversal depth comparable to the redis anchor
  (whose L1–L5 stayed within the server core). The ladder is one cohesive area, like redis.
- **L1↔L2↔L3↔L4↔L5 escalation is by scope, not topic:** L1 is one interface's fields (0 hops); L2 is
  one scanner routine + its re-scan callers (1-hop star); L3 is one ordered path (text → AST); L4 is
  one whole subsystem (binder); L5 is the concern across all four subsystems (parse+bind+check+emit).
  L3 and L4 are deliberately focused sub-paths of the L5 integration — L5 is *how they connect across
  modules*, which strictly exceeds L4's one subsystem.
- **L2↔L3 overlap guard:** both touch scanner+parser, but disjoint in scope — L2 is the re-tokenization
  *neighborhood* (scan + re-scan family + parser branch sites, a star), L3 is the *end-to-end parse
  path* (createSourceFile → … → parented SourceFile, an ordered chain). They share files but not
  scope (neighborhood vs path), mirroring how rails L2 (relation.rb `load`) and L3 (the query chain
  through relation.rb) shared a file but differed in scope.
- **L3 JSON caveat:** the TS/JS path is the required spine; the JSON branch in `parseSourceFile`
  (`parser.ts:1614`) is an acceptable extra, mirroring how redis L3's iothread pre-parse and rails L3's
  eager-load branch were treated (correct main spine, optional parallel path).
- **L5 indirection is the load-bearing point:** binding is driven by `createTypeChecker`'s
  `initializeTypeChecker` (not `createProgram`), and checking is lazy/cached — an answer that says
  "createProgram parses, binds, and checks everything up front" is the canonical wrong turn and should
  score as partial-at-best. The `emit` stage must include the `transformNodes` step (emit is
  transform-then-write, not straight-print).
- Every file:line above was opened and confirmed against the pinned SHA.