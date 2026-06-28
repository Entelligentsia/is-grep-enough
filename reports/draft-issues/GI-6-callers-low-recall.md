# GI-6 — `callers` under-covers common symbols (precision-first, low recall)

## Summary

For "list every call site / reference," grove's `callers` returns only the
name-resolved cross-refs its tags query captures, missing the long tail of real
textual references a `grep -rn` finds. For common, heavily-used symbols it returns
**nothing at all** (`[]`). Precision is high; recall is low — grove looks complete
but silently omits most sites, and several of grove's "context wins" are cheap
*because* it read less. Confirmed in **≥3 repos** (spring-boot, hugo, django) on the
L2 call-sites task.

## Reproduction

- **grove:** `0.1.5` @ `fd949ad`, `grove serve` MCP to Claude (`sonnet`).
- **spring-boot** — `spring-projects/spring-boot` @ `e16c5d01417f5a6efc35714e83060aadc17a9321`
  - prompt: *Where is `SpringApplication` defined, and list every place it is
    referenced or called across the source tree, with file and line.*
- **hugo** — `gohugoio/hugo` @ `d15baf53a91372843c45eef7eb5b87c25a4b6bf1`
  - prompt: *Where is `Site` defined, and list every place it is referenced or
    called across the source tree, with file and line.*
- **django** — `django/django` @ `7903ee10bce75e9fab36e93bb77b3cb9fbf2630d`
  - prompt: *Where is `QuerySet` defined, and list every place it is referenced or
    called across the source tree, with file and line.*

## Measured impact (L2 call-sites, blind-judged, verified vs pinned source)

| repo | quality winner | grove `callers` result | coverage |
|---|---|---|---|
| spring-boot | **baseline** | `[]` (empty) | dg covered **<25%** of real `SpringApplication` references; precision-perfect but near-zero recall |
| django | **baseline** | `[]` (empty) | dg undercounted ~3×; fabricated `query.py:304` (PreventQuerySetCloning ≠ QuerySet) trying to fill the gap |
| hugo | **baseline** | 1,518 chars (partial) | dg undercounted ~3× vs the baseline's accurate ~497; both 6/6 precision |

4 of grove's 5 L2 quality losses were recall/target failures like this, not
precision failures.

## Offending behavior (from the transcript)

**spring-boot** — grove's `callers` returned an empty array for a symbol with
hundreds of real references:

```
mcp__grove__callers  dir=/home/bench/repos/spring-boot name=SpringApplication
  -> "[]"        (2 chars)
```

**django** — same:

```
mcp__grove__callers  dir=/home/bench/repos/django name=QuerySet
  -> "[]"        (2 chars)
```
With `callers` empty, the agent had no structural recall to ground on, and
fabricated a line (`query.py:304`) that did not match the real `QuerySet`.

**hugo** — `callers` returned *some* real method-call refs (`p.Site().ServerPort()`,
`firstPage.Site().Current()`, `m.Match(p...)`) but a small fraction of the ~497
the baseline enumerated.

## Hypothesis

`callers` resolves only directly-named, tag-resolved call sites. Common symbols
that are referenced textually (string names, dynamic dispatch, generic-name
collisions, un-tagged references) are missed; very common names can return `[]`
when the tagger finds no resolved cross-refs in scope. There is no breadth budget
and no textual fallback.

## Proposed fix

1. **A recall mode** for `callers`/`find-references`: union structural
   (name-resolved) results with textual (`grep -rn`-style) matches, deduped, with
   a flag distinguishing the two so precision stays available.
2. **Steering** should tell the agent: for exhaustive "every reference" asks, use
   the recall mode (or fall back to `grep`); `callers` alone is precision-first.
3. Investigate why heavily-used symbols return `[]` (a result cap / a tagger
   scope bug?) — empty results for `SpringApplication`/`QuerySet` look like a
   defect, not just low recall.

## Fix verification (Tier-1, agent-free, zero tokens)

The probe rig (`Dockerfile.probe` + `scripts/run-probes.sh`) asserts grove's raw
output with no agent. The fix should make these PASS; on current grove (0.1.5)
spring-boot and django FAIL because `callers` returns `[]`.

```bash
scripts/build-probe.sh                                 # once: bake grammars into the probe image
GROVE_BIN=../grove/target/release/grove \
  scripts/run-probes.sh --label gi6 --spec probes/callers-recall.tsv
# expect: PASS 3 · FAIL 0   (current grove: spring-boot & django FAIL — callers returns [])
```

Spec (`probes/callers-recall.tsv`):

```
# kind<TAB>sym<TAB>dir<TAB>min-count
# min-count=1 is the non-empty regression gate; the real target is parity with `grep -rn`.
callersmin  SpringApplication  /home/bench/repos/spring-boot  1
callersmin  QuerySet           /home/bench/repos/django       1
callersmin  Site                /home/bench/repos/hugo         1
```

Each row runs `grove callers <sym> -d <dir> --json` and asserts ≥ min-count call
sites. min-count=1 is the non-empty regression gate that catches the `[]` bug;
the real success criterion is **recall parity with `grep -rn <sym> <dir>`**,
measured by the Tier-2 agent re-run below. `run-probes.sh` exits non-zero on any
FAIL (CI gate) and writes `evidence/probes.gi6.json`. Binary under test is
bind-mounted, so the fix loop is `cargo build` + the script.

### Tier-2 (agent re-run, recall parity)

```bash
GROVE_BIN=../grove/target/release/grove scripts/build-grove.sh
MAXP=4 scripts/run-rung-parallel.sh L2_callsites sonnet spring-boot django hugo
# metrics: out/opt-<repo>-L2_callsites.claude.metrics.json  (context sums all models)
# blind quality: re-judge vs pinned source — dg should no longer under-cover / fabricate
```

## Evidence

- Transcripts: `out/opt-spring-boot-L2_callsites.claude.dg.jsonl`,
  `out/opt-hugo-L2_callsites.claude.dg.jsonl`, `out/opt-django-L2_callsites.claude.dg.jsonl`
- Blind quality verdicts: `evidence/L2.quality.json`
- Full report: `reports/L2-callsites.md` (GI-6)
