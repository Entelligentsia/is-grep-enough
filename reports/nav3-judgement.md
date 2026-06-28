# nav-3way — Judgement of the completed cells (L1/L4/L5 · redis, django, bitcoin, typescript, spring-boot)

**Scope.** The eight completed (rung,repo) cells — `L1-redis`, `L1-django`,
`L4-redis`, `L5-redis`, `L5-django`, `L5-bitcoin`, `L5-typescript`, `L5-spring-boot`
— each across all three arms (**baseline** = bash/text, **grove** = structural MCP,
**lsp** = Claude Code native LSP tool). 24 arm-cells, **n=1 per arm-cell
(descriptive, not statistical)**. Format is locked — see
[`REPORT_FORMAT.md`](REPORT_FORMAT.md). L2/L3 not yet run.

**Method.** Each answer was graded **blind** against its offline reference key
(`experiment/prompts/<repo>/<rung>.reference.md`) by an independent judge, with
**every sampled citation re-verified against the pinned source**
(`experiment/repos/<repo>`). Two axes, each 0–1:
- **completeness** — fraction of the key's required-spine elements correctly hit
  (Full = 1.00).
- **grounding** — fraction of the answer's `file:line` cites that resolve exactly in
  pinned source (cite *accuracy*, not density).

**Provenance.**
- Model **sonnet**; base = frozen all-language `grove-testbench/base:latest`.
- **grove arm: grove v0.1.11** across all grove cells (image
  `grove-testbench/grove:v0.1.11`, the route-by-task steering); redis/django L1/L4/L5
  re-run + judged on v0.1.11, bitcoin/typescript run natively on v0.1.11.
- **baseline + lsp arms: original runs** (neither uses the grove binary). lsp = native
  LSP via `--plugin-dir experiment/lsp-plugin`: **clangd** (redis C, bitcoin C++),
  **pyright** (django), **typescript-language-server** (typescript). Per-repo lsp
  setup cost varies wildly — clangd needs a real compile DB (`bear -- make` for redis,
  `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS` for bitcoin), whereas typescript needs **no
  per-repo config or warm-cache baking** (the repo ships solution-style tsconfigs;
  cold definition resolves line-exact in ~0.6 s) — the cheapest lsp repo. See
  `setup[lsp/<repo>]` in the ledger.
- Repo pins: per-repo SHAs in `repos.manifest` (typescript `8ef3e2f3…`). Evidence:
  `evidence/nav3/`. Judge records: `experiment/state.json` → `judge.*`.

---

## Scoreboard

| cell | arm | ctx (tok) | wall_s | turns | tool calls | capability calls | bash | read | compl | grnd |
|---|---|--:|--:|--:|--:|--:|--:|--:|:--:|:--:|
| **L1-redis** | baseline | 126,393 | 61 | 7 | 6 | – | 5 | 1 | 1.00 | 0.93 |
|  | grove | 267,978 | 84 | 13 | 12 | 3 | 7 | 1 | 1.00 | **1.00** |
|  | lsp | 192,777 | 70 | 9 | 8 | 1 | 5 | 1 | 1.00 | 0.95 |
| **L1-django** | baseline | 72,102 | 34 | 3 | 2 | – | 1 | 1 | 1.00 | 0.95 |
|  | grove | 101,968 | 65 | 4 | 3 | 2 | 0 | 0 | 1.00 | **1.00** |
|  | lsp | 127,173 | 42 | 5 | 4 | 2 | 0 | 1 | 1.00 | 1.00 |
| **L4-redis** | baseline | 309,894 | 113 | 19 | 18 | – | 7 | 11 | 1.00 | 0.98 |
|  | grove | 359,299 | 119 | 23 | 22 | 21 | 0 | 0 | 1.00 | 0.98 |
|  | lsp | 566,133 | 153 | 29 | 28 | 13 | 3 | 11 | 1.00 | 0.97 |
| **L5-redis** | baseline | **1,578,920** | 191 | 2 | 51 | – | 27 | 23 | 1.00 | 0.88 |
|  | grove | 387,167 | 189 | 24 | 23 | 18 | 1 | 3 | 1.00 | **1.00** |
|  | lsp | 398,131 | 128 | 22 | 21 | 10 | 0 | 10 | 1.00 | 0.93 |
| **L5-django** | baseline | 182,567 | 110 | 9 | 8 | – | 3 | 5 | 1.00 | 1.00 |
|  | grove | 515,693 | 143 | 26 | 25 | 23 | 0 | 0 | 1.00 | 1.00 |
|  | lsp | 621,281 | 132 | 16 | 15 | 6 | 1 | 7 | 1.00 | 1.00 |
| **L5-bitcoin** | baseline | **1,670,994** | 252 | 2 | 53 | – | 32 | 20 | 0.95 | 0.80 |
|  | grove | 546,658 | 375 | 27 | 26 | 23 | 0 | 2 | 0.97 | **0.95** |
|  | lsp | 1,441,623 | 269 | 44 | 43 | 2 | 22 | 18 | 1.00 | 0.90 |
| **L5-typescript** | baseline | **2,427,126** | 214 | 4 | 114 | – | 57 | 54 | 1.00 | 0.98 |
|  | grove | 569,597 | 165 | 33 | 32 | 10 | 9 | 12 | 1.00 | **1.00** |
|  | lsp | 773,286 | 202 | 35 | 34 | 12 | 2 | 19 | 1.00 | 1.00 |
| **L5-spring-boot** | baseline | 396,900 | 173 | 15 | 36 | – | 14 | 21 | 1.00 | 1.00 |
|  | grove | 877,060 | 269 | 57 | 56 | 42 | 11 | 2 | 1.00 | **1.00** |
|  | lsp | 558,939 | 184 | 25 | 24 | 3 | 7 | 13 | 1.00 | 1.00 |

22 of 24 arm-cells are **Full** on completeness; the two exceptions are both in
L5-bitcoin (baseline 0.95, grove 0.97). grove grounding is exact (1.00) on six of
eight cells and ≥0.95 on the rest — the tightest-grounding arm throughout.
(The L5-spring-boot lsp row is a **re-run**: the first attempt DNF'd mid-synthesis on
a transient API error the original gate missed — see Caveats.)

---

## Per-cell judgement

### L1-redis — the `redisObject` value container
All Full. **grove (g 1.00):** struct at `object.h:100`, type/encoding constants
`75-88`, all six spine fields with the type-vs-encoding distinction; every cite
exact. **lsp (0.95):** grep+Read-anchored after a cold clangd index, type constants
at `server.h:856`. **baseline (0.93):** complete, a couple of loose lines.

### L1-django — the `ResolverMatch` URL match object
All Full. **grove (g 1.00):** `ResolverMatch` at `resolvers.py:34` exact, the
namespacing chain and `__getitem__` triple verbatim-correct — line-number-light but
every cite resolves (up from 0.80 on the v0.1.9 run, which was docked for cite
density; grounding scores accuracy, not density). **lsp (1.00):** most line-precise.
**baseline (0.95):** accurate ranges, full spine.

### L4-redis — non-blocking RDB snapshot (background save)
All Full. **grove (g 0.98):** all four pieces (launch/fork → child `rdbSave` →
childinfo progress pipe → reap+finalize); pure-grove navigation (21 calls), every
cite exact bar one loose extra-credit (`dismissKvstoreBucketsMemory` labelled 1913,
actual 1904). **baseline (0.98):** cheapest (310k); best on the progress throttle
(`rdb.c:1855`). **lsp (0.97):** strong child-write depth. Deep-dive:
[`nav3-L4-redis-judgement.md`](nav3-L4-redis-judgement.md).

### L5-redis — write → replication journey (cross-cutting)
All Full. **grove (g 1.00):** the full `call`→dirty→deferred `alsoPropagate`→
`afterCommand`/`postExec`/`propagatePendingCommands`→`propagateNow`→
`replicationFeedSlaves` chain, every sampled cite exact — tightest grounding here.
**lsp (0.93):** full chain, a couple approximate ranges. **baseline (0.88):** equally
complete but **1.58 M context tokens** (grep+read sprawl) and two loose cites.

### L5-django — model save journey (cross-cutting)
All Full, grove/lsp/baseline all 1.00 grounding. **grove:** `save`→`save_base`→
`_save_table` update-first/insert-fallback → `_do_insert`/`_insert`→
`compiler.execute_sql`→`cursor.execute`, with the insert-vs-update compiler split
confirmed; every cite exact.

### L5-bitcoin — submitted tx → peer announcement (cross-cutting)
All three threaded `sendrawtransaction`→`BroadcastTransaction`→`ProcessTransaction`/
`AcceptToMemoryPool`(`CheckTransaction`/`IsStandardTx`/`CheckInputScripts`)→
`InitiateTxBroadcastToAll`→per-peer `m_tx_inventory_to_send` queue→`SendMessages`
flush emitting `CInv`/`NetMsgType::INV`, each naming the **queue-then-flush deferred
indirection** that is the crux. **grove (c 0.97 / g 0.95):** tightest, lowest context
(547k) — accurate specific cites (`rpc/mempool.cpp:47`→`node/transaction.cpp:32`→
`validation.cpp:4455`/`1323`, `net_processing.cpp:2272`/`5792`); docked only for a few
omitted sub-line numbers and not naming `CheckInputScripts`/`:1150` outright.
**lsp (c 1.00 / g 0.90):** fully complete; minor looseness (`CheckInputScripts` ~`:1139`
vs `:1150`, a few unverified `net.cpp` extras); honest cold-index cost (lsp_tools=2 +
22 bash grep-anchoring) at 1.44M. **baseline (c 0.95 / g 0.80):** the one wrong turn —
routes the relay trigger through the `validationinterface` `TransactionAddedToMempool`
signal instead of `BroadcastTransaction` calling `node.peerman->InitiateTxBroadcastToAll`
directly (`node/transaction.cpp:137`); two unsupported cites; highest cost (1.67M, ~3×
grove).

### L5-typescript — source → bind → check → emit pipeline (cross-cutting)
All Full. Each traces parse (`createProgram` `program.ts:1515`→`processSourceFile`/
`findSourceFileWorker:3545`→`createSourceFile` `parser.ts:1344`, call at `:410`) → bind
(`getTypeChecker:2684`→`createTypeChecker`→`initializeTypeChecker` `checker.ts:51555`→
`bindSourceFile` `binder.ts:502`) → check (`getSemanticDiagnosticsForFile:2858`→
`checkSourceFile` `checker.ts:49547`, lazy+cached) → emit (`emit:2688`→`emitWorker:2718`→
`emitFiles` `emitter.ts:752`→`getTransformers` `transformer.ts:120`→`transformNodes:248`),
with the three load-bearing indirections (bind is checker-driven, check is lazy, emit
transforms-then-writes). **grove (g 1.00):** every sampled cite line-exact (incl.
`getSyntacticDiagnosticsForFile:2831`, `getPreEmitDiagnostics:634`) at the lowest
context (570k). **lsp (1.00):** same chain line-exact (`createGetSourceFile:392`,
`getMergedBindAndCheckDiagnostics:2923`, `emitJsFileOrBundle:821`), one self-flagged
approximate (`onProgramCreateComplete ~1725`); read-anchored (19 reads). **baseline
(0.98):** most line-dense (~45 cites, incl. exact call-sites `nextToken:1812`,
`parseList:1814`, `bind:2751`, `bindContainer:953`, `printSourceFileOrBundle:993`); one
label conflation (`getBindAndCheckDiagnosticsForFile` cited at `:2887`, which is the
`…NoCache` variant; plain is `:2869`) — at **2.43 M context** (3 Explore subagents, 114
tool calls), the highest in the experiment. *Note: the reference key anchors steps at
call-sites (`initializeTypeChecker` call `checker.ts:2410`, `emitWorker` call
`program.ts:2699`, `getDiagnostics` call `:2906`) while the arms cite the definitions
(`51555`, `2718`, `49689`) — both valid; no key revision.*

### L5-spring-boot — env var → `@ConfigurationProperties` binding (cross-cutting)
The full relaxed-binding journey: `ConfigurationPropertySources.attach` → source
adaptation (`SpringConfigurationPropertySource` + `SystemEnvironmentPropertyMapper`
four env-var name forms) → `Binder.bind`/`onStart` → `findProperty`/`bindProperty`
(placeholders + convert) → `handleBindResult` (`onSuccess`/`onFinish`,
`BindConverter`) → `BindResult`. **grove (g 1.00):** all 6 spine elements + extras
across 9 stages; every sampled cite line-exact vs the actual tree
(`bindObject@423`, `findProperty@476`, `bindProperty@490`, `attach@89`,
`getConfigurationProperty@85`/`getPropertySourceProperty@106`, `map@47`/`@63`,
`convertName@72`, `processElementValue@81`, `BindConverter@58`/`@126`) — even found
the cache reverse-lookup path beyond the key; heaviest navigation of the bench (42
grove calls) at 877k. **baseline (g 1.00):** also Full and uniquely called out the
`attach()`-vs-`from()` two-path nuance; **line-light** (names classes/methods, few
`file:line`) but no wrong cites, so grounding is not docked — and **cheapest of the
triple at 397k** (1 Explore subagent) despite the repo restructure. **lsp (g 1.00,
re-run):** the **most line-precise** of the three — an 11-stage walkthrough, every
sampled cite line-exact (`attach:89`, `from:171`, `getConfigurationProperty:85`,
`getPropertySourceProperty:106`, `map:47`/`:63`, `SpringIterable…:105`/`tryUpdate:258`,
`PostProcessor:82`, `ConfigurationPropertiesBinder.bind:92`/`getBindHandler:113`/
`getBinder:185`/`onStart:239`, `Binder:201`/`:248`/`:365`/`bindObject:423`/
`findProperty:476`/`bindProperty:490`/`bindDataObject:498`, `BindConverter:64`/`:95`),
uniquely tracing the `NO_DIRECT_PROPERTY` short-circuit and the forward+reverse cache
mapping; 3 jdtls calls, read-anchored, 559k. *The lsp run is a **re-run**: its first
attempt DNF'd mid-synthesis on a transient `Connection closed mid-response` API error
the original gate missed — see Caveats.* *Note: the pinned repo was restructured to
the `core/spring-boot/` layout vs the key's legacy `spring-boot-project/` paths
(logged in `judge.L5-spring-boot.key_revisions`); all arms navigated the actual tree,
verified line-exact.*

---

## Findings

1. **Answer quality rarely separates the tools.** Completeness is at ceiling (Full)
   for 22 of 24 arm-answers, including all six L5 cross-cutting chains. With a capable
   model, text / structural / semantic navigation almost always reach the complete
   answer. The lone separation is **L5-bitcoin**, the hardest trace: baseline took a
   wrong turn (relay via the `validationinterface` signal, c 0.95) and grove omitted
   one check name (c 0.97) — only lsp was a clean 1.00 there. (L5-spring-boot lsp also
   reads Full, but only on a **re-run** after a transient API-error DNF — see Caveats.)
2. **Grounding is high everywhere and tightest for grove** — 1.00 on five of seven
   cells, ≥0.95 on the other two. On the v0.1.11 steering grove gives fewer but exact
   cites; the old grove weak spot (L1-django 0.80) was a cite-*density* artifact, not
   inaccuracy. baseline is the loosest tail (L5-redis 0.88, L5-bitcoin 0.80) — text
   search both costs the most and drifts the most on dense cross-cutting traces.
3. **The real differentiator is COST, and on big cross-cutting traces it is large and
   one-directional.** The three densest L5 traces blow baseline context to the top of
   the table while grove stays 3–4× cheaper:
   - **L5-typescript baseline = 2.43 M tokens** (114 tool calls, 3 parallel Explore
     subagents, 57 bash + 54 read) vs grove 570 k / lsp 773 k — **~4.3× / 3.1×**.
   - **L5-bitcoin baseline = 1.67 M** vs grove 547 k (~3×); **L5-redis baseline =
     1.58 M** vs grove 387 k (~4×).
   - Inverted only on small/well-named targets: **L1 and L5-django** baseline is
     *cheapest* (72 k, 183 k) — a few greps suffice; the tools fan out for more.
4. **grove combines opportunistically under v0.1.11 — variably.** L5-typescript grove
   used 9 bash + 12 read alongside 10 grove calls; L5-redis 1 bash + 3 read; but
   L4-redis, L5-django and L5-bitcoin grove runs went near-pure-grove (0 shell). The
   shell-combine is available and used when it is the shortest path, not uniformly —
   n=1 stochastic.
5. **lsp consistently read-/grep-anchors** to get a position before each semantic
   query, and its cost tracks the per-repo index: cheap where the toolchain is warm,
   but **L5-bitcoin lsp = 1.44 M** with 22 bash calls — the honest cost of grep-anchoring
   a cold clangd index on a large C++ tree. typescript, by contrast, was the cheapest
   lsp *setup* (no per-repo config; ~0.6 s cold resolve).
6. **`turns` can mislead** — L5-redis and L5-bitcoin baseline show 2 turns / 51–53 tool
   calls (huge parallel grep+read fans); L5-typescript baseline 4 turns / 114 calls via
   3 Explore subagents. Read `tool calls`, not `turns`, for effort.

---

## Caveats

- **n=1 per arm-cell** — directional, not statistical; four repos, three rungs.
- **Engagement gate ≠ completeness** — the run gate only confirms the arm used its
  capability + no harness error; quality is the judging above.
- **Mixed provenance** — grove rows are v0.1.11 (redis/django re-run + re-judged;
  bitcoin/typescript run natively); baseline/lsp rows are original runs (neither uses
  grove, so version is moot for them, but they were not re-executed).
- **Byte-watchdog is byte-based** (1.5 MB jsonl) and did **not** catch the baseline
  token blow-ups (L5-typescript 2.43 M, L5-bitcoin 1.67 M, L5-redis 1.58 M — all with
  jsonl well under the cap); token cost and output bytes diverge, so a token-based
  guard would be needed to bound that.
- **Per-repo lsp setup cost is uneven and real** — clangd repos need a built compile DB
  (redis ~46 min `bear -- make`, bitcoin ~148 s cmake-export); typescript needs none.
  This setup asymmetry is the lsp arm's defining cost and is recorded in
  `setup[lsp/<repo>]`, not in the scoreboard.
- **Mid-response API errors are DNFs (gate hardened).** L5-spring-boot lsp's first
  run ended with a result event carrying `is_error: true` / text "Connection closed
  mid-response" — but `subtype: "success"`, so the original gate (`has_result =
  result-event-exists`) passed it and it was harvested as a clean run. `side-metrics.sh`
  now reports `is_error` and defines `has_result = exists && !is_error`; the runarm
  gate rejects `is_error == true`. The cell was re-run (the row above is the re-run);
  a scan of all harvested evidence found this was the only affected cell.
- **Blind grading, objective criteria** — cites verified against pinned source, not
  taken from the answers or the key.

---

Evidence: `evidence/nav3/{L1,L4,L5}/{raw,readable}/`.
Judge records: `experiment/state.json` → `judge.{L1,L4,L5}-{redis,django,bitcoin,typescript}`.
