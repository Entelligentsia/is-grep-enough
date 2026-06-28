# nav-3way — Judgement of L4-redis (non-blocking RDB snapshot)

**Scope:** one cell — `L4-redis`, across all three arms (**baseline** = bash/text,
**grove** = structural MCP, **lsp** = Claude Code native LSP tool). n=1 (descriptive,
not statistical). Companion to `reports/nav3-judgement.md` (the L1+L5 batch).

**Task (L4 = subsystem rung).** "How Redis produces a point-in-time snapshot to disk
without blocking the server" — the background-save (BGSAVE) subsystem: a bounded
cluster across `rdb.c`, `server.c`, `childinfo.c` around a fork boundary.

**Method.** Each answer was graded blind against the offline reference key
(`experiment/prompts/redis/L4.reference.md`), with every sampled citation re-verified
against the pinned source (`experiment/repos/redis`, SHA d2d3390d…). Two axes, each 0–1:
- **completeness** — fraction of the key's four required-spine pieces correctly hit:
  (1) launch + fork, (2) child `rdbSave`, (3) child→parent progress over the
  child-info pipe, (4) parent reap + finalize.
- **grounding** — fraction of the answer's `file:line` citations that resolve exactly
  in the pinned source.

Process metrics (context tokens, wall seconds) come from `side-metrics.sh` over the
stream-json transcripts. Tooling: frozen all-language base, **grove v0.1.10**, native
LSP via `--plugin-dir experiment/lsp-plugin` (clangd), model **sonnet**. Judge record:
`experiment/state.json` → `judge.L4-redis`; raw + readable transcripts in
`evidence/nav3/L4/`.

---

## Scoreboard

| cell | arm | completeness | grounding | context (tok) | run_s | turns | tool calls |
|---|---|---|---|---|---|---|---|
| **L4-redis** | baseline | 1.00 | **0.98** | **309,894** | 113 | 19 | 18 (11 read / 7 bash) |
|  | grove | 1.00 | **0.98** | 559,941 | 209 | 38 | 37 (36 grove) |
|  | lsp | 1.00 | 0.97 | 566,133 | 153 | 29 | 28 (13 lsp / 11 read / 3 bash) |

All three arms are **Full** on completeness. No key revisions required (the key's
cites re-verified accurate against source).

---

## Per-arm judgement

All three answers hit every spine piece and connected the **fork + copy-on-write**
rationale for non-blocking plus the `dirty_before_bgsave` bookkeeping. This is the
**cleanest-grounded cell measured so far**: *every* sampled citation from *all three*
arms resolves exactly against the pinned source.

- **baseline (g 0.98):** grep → targeted Reads. Full spine with the tightest account
  of the **progress mechanism** — cited the throttle block `rdb.c:1855` and described
  the 1024-key & ≥1 s gate before `sendChildInfo` exactly as written. All cites exact
  (`bgsaveCommand` 4833, `rdbSaveBackground` 2070, `redisFork` server.c:7428,
  `openChildInfoPipe` childinfo.c:25, `rdbSave` 2027, rename 2041, `sendChildInfoGeneric`
  childinfo.c:49, `receiveChildInfo` childinfo.c:150 @cron server.c:1694,
  `checkChildrenDone` server.c:1416, `backgroundSaveDoneHandler` 4605 / Disk 4544,
  `updateSlavesWaitingBgsave` 4628). Also nailed `dirty -= dirty_before_bgsave` and the
  SIGUSR1 clean-abort. **Cheapest arm (310k / 19 turns).**
- **grove (g 0.98):** structural fan-out (36 symbol/source calls). Richest design
  rationale — copy-on-write, atomic rename, dirty bookkeeping, SIGUSR1 polite-kill —
  and every cite exact (def lines plus childinfo helpers 25/49/102/123/150, call site
  server.c:1695). Tightest structured navigation; a couple of childinfo helpers carried
  by name rather than inline line in prose, but nothing loose. **Most expensive
  (560k / 38 turns).**
- **lsp (g 0.97):** native LSP (13 calls) + a few grep/Read anchors. Strongest depth on
  the child write path (`rdbSave` 2027 → `rdbSaveInternal` 1956 → `rdbSaveRio`, temp
  file 2032, rename 2041, rio/incremental-fsync detail) and the post-handler dispatcher
  (`rdb.c:4622`). All cites exact; carried one fewer distinct childinfo-helper line than
  baseline. **566k / 29 turns.**

---

## Findings

1. **Answer quality does not separate the tools — again.** All three arms are Full on
   all four spine pieces, consistent with every L1/L5 cell. Text, structural, and
   semantic navigation each reach the complete, correct subsystem account.
2. **Grounding is a near-perfect three-way tie (0.97–0.98).** Unlike L1/L5-redis
   (where grove was tightest and baseline loosest), here *every* sampled cite from
   *every* arm resolves exactly. On a bounded, well-named C subsystem there is no cite-
   precision gap to exploit.
3. **The cost ordering INVERTS L5-redis.** At L5 (a sprawling write→replication trace)
   baseline blew up to **1.58 M** tokens vs grove 300 k / lsp 398 k. At L4 (a bounded
   3-file cluster) **baseline is the cheapest** — 310 k / 19 turns — while grove
   (560 k / 38) and lsp (566 k / 29) fan out across many symbols for **~1.8×** the
   context to reach the same Full answer.
4. **Why the inversion:** L4's subsystem lives in only `rdb.c` / `server.c` /
   `childinfo.c` with self-describing names. A few targeted greps + Reads land directly
   on the spine; the structural/semantic tools instead pull full function bodies for
   ~36 (grove) / ~13 (lsp) symbols — thorough, but the per-call source payloads
   dominate the token bill when the search space is already small.
5. **Baseline was also the most cite-precise on the progress pipe** (the one piece
   arms most often fumble), pinning the `rdb.c:1855` throttle and its 1024-key/≥1 s gate
   — text search rewards a reader who lands on the exact loop.

**Takeaway:** the cost advantage of structural/semantic tooling is *not* universal —
it pays off on dense, cross-cutting traces (L5-redis) but reverses on bounded,
well-named subsystems (L4-redis), where plain grep+Read is both fully correct and
cheapest. Correctness never separated the arms.

---

## Caveats

- **n=1** — directional only; one repo, one rung.
- **grove version is v0.1.10** here (the L1/L5 batch was v0.1.9) — cross-batch token
  comparisons carry that version delta.
- **Byte-watchdog (1.5 MB jsonl) was active** and did not fire; no arm approached the
  cutoff (largest jsonl ~215 KB). Note the L5-redis caveat still stands — byte size and
  token cost diverge, so the watchdog would not have caught an L5-style token blowup.
- **lsp engagement** is measured by the native LSP tool (`lsp_tools`=13), not MCP — the
  lsp arm does not route through MCP in the current harness.
- **Blind grading, objective criteria:** cites verified against the pinned source, not
  taken from the answers or the key.

Evidence: `evidence/nav3/L4/{raw,readable}/`. Judge record:
`experiment/state.json` → `judge.L4-redis`.
