# Hugo prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/hugo` (SHA d15baf53a91372843c45eef7eb5b87c25a4b6bf1, Go — the
`gohugoio/hugo` static site generator). All file:line cites verified against that tree. Hugo is a large Go
codebase (~900 .go files) organized into packages: `commands/` (CLI), `hugolib/` (the engine: pages, sites,
build), `tpl/tplimpl/` (templates + the layout-lookup store), `markup/`/`media/`/`output/` (content &
formats), `identity/`/`resources/`/`cache/` (dependency tracking + invalidation). The five levels trace a
deliberately wide arc: the data model for a media type → a per-page eligibility gate → the top-down
build-to-write execution path → the template-lookup machinery that path delegates into → the cross-cutting
incremental-rebuild flow.

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm reasoning about how Hugo identifies a file's content type so it can pick the right markup
converter, output format, and template. I need to understand the type that represents a single media (MIME)
type as Hugo models it: what field carries its full identity string versus which fields decompose that
identity into its parts, and how the same type records the file-suffix representation it can map to. Walk me
through the makeup of that type."

**Larger task it slices from:** adding/registering a new media type, or changing how an extension maps to a
converter — needs a clear mental model of the `media.Type` header first.

**Why this level:** The answer lives at a single declaration site — `media.Type` in
`media/mediaType.go:36` — and is one concrete fact (the shape of one entity). To answer well the agent must
read and integrate several adjacent fields: the full-identity `Type` (`:38`) vs its decomposition
`MainType`/`SubType` (`:41`/`:43`) plus the unexported `mimeSuffix` (`:52`), and the suffix-representation
group `Delimiter`/`FirstSuffix`/`SuffixesCSV` (`:45`/`:48`/`:57`) with `SuffixInfo` (`:61`). It never leaves
that one struct/header neighborhood — 0 call hops. It is not primitive-isomorphic: it asks for the *role* of
the fields and how `Type` (identity) differs from `MainType`/`SubType` (decomposition) and from the suffix
fields (representation), which must be read off the declaration, not produced by a single "jump to
definition." Exceeds nothing below (floor).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `media.Type`, `mediaType.go:36-57`;
Type/MainType/SubType/mimeSuffix/Delimiter/FirstSuffix/SuffixesCSV spine).

**Neutrality check:** text — grep `type Type struct` / `media.Type` lands on the struct in `media/`;
structural — the struct declaration is one node; semantic — go-to-def on `media.Type`. All three reach the
same single site; differences are only in cost, not feasibility. Not isomorphic because the *understanding*
(identity vs decomposition vs suffix representation) must be read off the fields, not produced by the locate
primitive itself.

---

## L2 — neighborhood (symbol + its direct relations, 1 hop)

**Prompt:** "I'm planning a change to Hugo's draft / future-dated / expired content filtering — the rule for
when a content page should actually be built versus silently skipped — and I need to know the per-page
eligibility check and the assembly-time places that consult it. Help me see where that check fires during
page assembly and what the different callers do when a page fails it."

**Larger task it slices from:** changing build-filtering semantics (e.g. a new publish-state, or keeping
expired pages in some context) — must first know the central gate and the access points that depend on it.

**Why this level:** One focal symbol — `(s *Site) shouldBuild` (`hugolib/site.go:1763`) plus its helper
`shouldBuild` (`:1771`) — and exactly one hop out to two real callers: the page-creation walk
(`content_map_page_assembler.go:276`) and the taxonomy-term "dates" pass (`:1088`). Synthesis is required
and real: the two callers do *materially different things* with the boolean — caller A disables the page's
`Build` config and keeps structure kinds (home/section/taxonomy) while dropping others; caller B deletes the
failing term and prefix-prunes its taxonomy subtree. "What each caller does with the outcome" can't be read
from the focal definition alone. Exceeds L1 because it is no longer one site/one fact — it fans out to two
call sites and relates them to one definition. It stops short of L3 because there is no ordered chain to
walk — it is a star (one symbol, its neighbors), not a path.

**Ground-truth answer sketch:** see `L2.reference.md` (focal `shouldBuild` `site.go:1763` + helper `:1771`;
inner kind gate `IsKindEnabled` `allconfig.go:559`; callers `assembler.go:276` keep-structure/drop and
`:1088` delete-term + prefix-prune).

**Neutrality check:** text — grep `shouldBuild` yields the definition and the two call sites directly;
structural — the function node plus its reference set; semantic — find-refs on the symbol. Each reaches the
same neighborhood; cost differs (grep returns raw hits to read; structural/semantic give the reference set),
feasibility does not. Not isomorphic: a single find-refs lists call sites but does not tell you *what each
caller does with the result* (keep-vs-drop vs delete-and-prune) — that needs reading and integrating each
site.

---

## L3 — path (directed chain across files, multi-hop, one path)

**Prompt:** "I want to follow what happens from invoking a Hugo build on the command line all the way to a
single page being rendered and written to disk. I'm interested in how the build command reaches the site
builder, how the build is split into its lifecycle phases, how the render phase drives per-page rendering,
how a layout template is chosen for a page, and how the chosen template is finally executed and its result
written out. Walk me through that sequence in order, end to end."

**Larger task it slices from:** adding cross-cutting per-build or per-page instrumentation, or changing the
build phase order / dispatch — needs the precise command→build→render→write spine.

**Why this level:** A single directed chain threaded through `commands/` and `hugolib/`, multiple hops,
followed in order: command entry → builder dispatch → `HugoSites.Build` phase orchestration (process →
assemble → render → renderDeferred → postProcess) → per-site/per-format render → `renderPages` workers →
`pageRenderer` → `resolveTemplate` → `renderAndWritePage` → `renderForTemplate` → `ExecuteWithContext` →
`publisher.Publish`. Each step names the next; the agent must follow them as a sequence, not just collect
neighbors. Entry ambiguity is real: `rootCommand.Run` builds a `hugoBuilder` and the chain goes
`build`→`fullBuild`→`buildSites`→`h.Build` (not a direct `h.Build` from the command), and `Build` runs five
phases of which only `render` is on the requested spine — the agent must pick the live full-build path and
not wander into the rebuild branch (that is L5). The template choice (`resolveTemplate`) is deliberately
treated as a black box returning a `TemplInfo`; its internals are the L4 subsystem. Exceeds L2 because it is
an ordered multi-file traversal (a path), not a one-hop star; stays below L4 because it is one linear path
that delegates into (but does not open) the lookup subsystem.

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `hugoBuildCommand.Run` `commands.go:71`
→ `rootCommand.Run` `commandeer.go:393` → `b.build` `hugobuilder.go:410` → `fullBuild` `:422` → `buildSites`
`:440` → `h.Build` `:450` → `HugoSites.Build` `hugo_sites_build.go:64` phases `:171/177/197/212/221` →
`Site.render` `site.go:1787` → `renderPages` `site_render.go:71` → `pageRenderer` `:123` → `resolveTemplate`
`page.go:630`/`LookupPagesLayout` `:645` → `renderAndWritePage` `site_render.go:212`/`site.go:1647` →
`renderForTemplate` `site.go:1658`/`1743` → `ExecuteWithContext` `:1753` → `publisher.Publish` `:1695`).

**Neutrality check:** text — grep the function names and follow the calls between them across `commands/`
and `hugolib/`; structural — call-graph edges from `hugoBuildCommand.Run` down through `Build` to
`publisher.Publish`; semantic — go-to-def chained call by call. All three can walk the chain; grep must read
each body to find the next callee (higher cost), structural/semantic surface callees directly. Feasible for
all. Not isomorphic: no single primitive yields a ~12-hop ordered path crossing two packages; the agent must
decide the order and the right branch at each step (full-build vs rebuild; which phase is on the spine).

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm studying how Hugo, given a page, decides which of the many layout templates under layouts/
should render it — the so-called layout lookup rules. I need to understand how the page's characteristics are
turned into a query descriptor, how the template store walks its tree of candidate templates and scores them
to pick the best match, how the matching base template (baseof) is then resolved for that match, and how all
of this is organized as a store. Show me how these cooperating pieces fit together."

**Larger task it slices from:** changing template lookup behavior (a new lookup dimension, altering the
scoring weights, custom baseof resolution) — needs the whole lookup subsystem and how its parts coordinate,
not just one function.

**Why this level:** A cohesive feature cluster spanning `tpl/tplimpl/templatestore.go` and
`tpl/tplimpl/templatedescriptor.go` (plus the page-side descriptor builder in `hugolib/page.go`), with several
interrelating pieces rather than one line: (a) query/descriptor construction (page kind/layout/output
format → `TemplateDescriptor`/`TemplateQuery`), (b) the store tree (`treeMain`) and the
`LookupPagesLayout` entry, (c) the path-walk scoring (`findBestMatchWalkPath` + `compareDescriptors` + a
`weight.distance` path-proximity term + `bestMatch` tracking), (d) the separate baseof pass
(`findBestMatchBaseof` over `baseVariants`). The agent must understand how these cooperate — descriptor
match is combined with path distance, and layout-lookup is followed by a distinct baseof-lookup — not just
trace one call. Entry ambiguity: the "best match" is a weighted combination of descriptor fields *and*
path proximity, and `noBaseOf` short-circuits the baseof pass, so the agent must discover both passes and the
scoring composite. Exceeds L3 because it is a bounded module with multiple cooperating pieces (not a single
ordered chain that delegates to it as a black box); stays below L5 because it is one feature/area (template
lookup), not a concern threaded across multiple subsystems.

**Ground-truth answer sketch:** see `L4.reference.md` (four pieces: descriptor/query `page.go:616`/`:630` →
`TemplateDescriptor` `templatedescriptor.go:25` + categories `templatestore.go:65-72`; store `treeMain`
`templatestore.go:439`/`:128` + `TemplInfo` `:220`/`baseVariants` `:244`; entry `LookupPagesLayout` `:584` +
walk scoring `findBestMatchWalkPath` `:858` + `compareDescriptors` `templatedescriptor.go:66` +
`weight.distance` `:877` + `bestMatch` `:2016`/`weight` `:2143`; baseof `findBestMatchBaseof` `:328`).

**Neutrality check:** text — grep `LookupPagesLayout`/`findBestMatchWalkPath`/`findBestMatchBaseof`/
`compareDescriptors` and stitch the module; structural — the call cluster around `LookupPagesLayout` plus the
`treeMain`/`baseVariants` references; semantic — refs/defs across the two `tplimpl` files + `page.go`. All
feasible; the weighted-scoring + two-pass structure means *no* tool auto-summarizes the subsystem — every
regime must reason about descriptor-match-plus-distance and the layout-vs-baseof distinction, so none is
uniquely advantaged. Not isomorphic: spans multiple functions/structs and a scoring composite; no single
primitive returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to how Hugo rebuilds a site incrementally when a file changes during `hugo
server`, so I need to understand the full journey of a file-change event through the system. Starting from
the filesystem watcher handing off a set of events, how those events are classified per source component into
change identities, how the affected pages and resources are marked stale and their cached state invalidated,
and finally how that feeds back into the partial assemble and render phases — walk me through that whole flow
and how the stages connect."

**Larger task it slices from:** modifying incremental-rebuild semantics (e.g. finer/ coarser invalidation, a
new change kind, or consistency changes to partial rebuilds) — requires the end-to-end event→identity→stale→
rebuild spine across subsystems.

**Why this level:** A concern that threads at least four subsystems — the filesystem watcher (fsnotify
events), the hugolib build phase machinery (`processPartialFileEvents`, `WhatChanged`, the `assemble`
`needsPagesAssembly` gate), the `identity` dependency-tracking package (`identity.NewFinder`/`Finder`, `WalkIdentitiesDeep`,
`StructuralChangeAdd/Remove`, `GenghisKhan`, `NewPredicateIdentity`, `Finder`), and the resource/cache
invalidation layer (`resource.Staler.MarkStale`, `MemCache.DrainEvictedIdentities`/`ClearOnRebuild`, `TemplateStore.RefreshFiles`,
`Deps.OnChangeListeners`). It is whole-system: the agent integrates "what changed on disk" → "which
identities represent that" → "what gets marked stale / evicted / reloaded" → "how that gates the partial
assemble and render." Entry ambiguity is high: a file event does not directly re-render anything; it is
translated into identity changes, bundled in `WhatChanged`, used to mark stale + evict caches, optionally
refresh templates, and *then* the normal `assemble`/`render` phases run with `needsPagesAssembly` deciding
full vs partial — so the agent must discover the indirection (events → identities → `WhatChanged` →
invalidation → phase gate) rather than find a direct "rebuild this file" call. Exceeds L4 because it crosses
subsystem boundaries (watcher ↔ build phases ↔ identity ↔ resource/cache ↔ templates) instead of staying
inside one feature module.

**Ground-truth answer sketch:** see `L5.reference.md` (`processPartialFileEvents` `hugo_sites_build.go:865`
→ `handleChange` `:990` classifying per component into `changes []identity.Identity` (StructuralChangeAdd/
Remove `:944`, GenghisKhan, NewPredicateIdentity `:1131`, collectAndMarkStaleIdentities
`content_map_page.go:143`) → `WhatChanged` `site.go:1133` + `changed.Add` `:1177-1182` → `OnChangeListeners.Notify`
`:1201` → `resolveAndClearStateForIdentities` `content_map_page.go:900` (drain MemCache `:906`, Staler.MarkStale
`:943`/`resourcetypes.go:220`, `MemCache.ClearOnRebuild` `:962` + evicted-identity `identity.NewFinder` `:977-1005`) → `TemplateStore.RefreshFiles`
`:1212` / i18n recompile `:1235` → `assemble` `needsPagesAssembly` gate `hugo_sites_build.go:306` → `render`).

**Neutrality check:** text — grep `processPartialFileEvents`/`resolveAndClearStateForIdentities`/
`WhatChanged`/`MarkStale`/`MemCache.ClearOnRebuild`/`identity.NewFinder` and assemble across packages; structural — call edges from the
event intake through the identity/invalidation funcs into the build phases; semantic — refs/defs chaining
the same across `hugolib`/`identity`/`resources`. All feasible. The events→identities→`WhatChanged`→stale→
phase-gate indirection defeats a naive single-call trace for every regime equally — each must reason about
the translate-then-invalidate-then-rebuild pattern — so none is uniquely required. Not isomorphic: the flow
spans ~7 functions across `hugolib`/`identity`/`resources` and a data-structure handoff (`WhatChanged`), well
beyond any one primitive.

---

## Calibration notes for the reviewer

- **L3 vs L4 boundary:** L3's chain treats `resolveTemplate` → `LookupPagesLayout` as a black box that
  returns a `TemplInfo` (it names the call site `page.go:645` but does not open the store). L4 opens exactly
  that black box. This mirrors the redis L3/L4 split, where L3's `call` invokes the handler as a black box
  and other levels examine specific subsystems. The two are at different abstraction levels and share only
  the delegation edge, so there is no scope collision.
- **L3 vs L5 boundary:** L3 is the **full-build** branch of `process` (`processFull`,
  `hugo_sites_build.go:297`, taken when there are no file events). L5 is the **rebuild** branch
  (`len(events) > 0` → `processPartialFileEvents`, `:287`). Both flow through the same `Build` phase loop,
  but they are disjoint branches — no collision.
- **L2 vs L5 assembly overlap:** L2's two `shouldBuild` callers are in the *full* assembly path
  (page creation / the taxonomy "dates" walk). L5's `assemble` interaction is the *partial* rebuild path
  (`needsPagesAssembly` gate). The eligibility predicate (L2) and the change-event→invalidation flow (L5) are
  different concerns even though both touch assembly.
- **Hugo version notes:** this is a recent Hugo (the `pageState`/`pageCommon`/`pageMeta`/`pageConfigSource`
  layout, `doctree`-based page trees, `sitesmatrix` dimension matching, `identity.GenghisKhan`). Cites are to
  this pinned tree only; classic Hugo (pre-v0.62 kind renaming, or pre-template-store refactor) differs.
- Every file:line above was opened and confirmed against the pinned SHA.
