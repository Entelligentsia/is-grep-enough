# transcript: I'm planning a change to Hugo's draft / future-dated / expired content filtering — the rule for when a content page should actually be built versus silently ...


💬 Let me load the grove tools and search for the eligibility check symbols.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__map,mcp__grove__outline)

💬 Now let me search for the eligibility check — `shouldBuild` is the most likely name, plus look for `isDraft`/`isFuture`/`isExpired`.
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo","name":"shouldBuild","nameContains":true})
  ▸ Bash(grep -rn "isDraft\|isFuture\|isExpired\|ShouldBuild\|shouldBuild\|buildDrafts\|BuildDrafts\|BuildFuture\|BuildExpired" /home/bench/repos/hugo --include="*.go...)

💬 Good — there are two `shouldBuild` symbols: a method on `*Site` and a standalone function. Let me pull both bodies and their callers in parallel.
  ▸ mcp__grove__source({"id":"go:hugolib/site.go#shouldBuild@1763"})
  ▸ mcp__grove__source({"id":"go:hugolib/site.go#shouldBuild@1771"})
  ▸ mcp__grove__callers({"name":"shouldBuild","dir":"/home/bench/repos/hugo"})

💬 Two production call sites, both in `content_map_page_assembler.go`. Let me read the context around each.
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page_assembler.go)
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page_assembler.go)

💬 Let me also check `commands/list.go` — it was in the grep results, suggesting a separate filtering path for the `hugo list` subcommand.
  ▸ Bash(grep -n "shouldBuild\|BuildDrafts\|BuildFuture\|BuildExpired\|Draft\|draft\|future\|expired" /home/bench/repos/hugo/commands/list.go | head -40)
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/site.go","name":"shouldBuild"})

💬 Let me also quickly check `resource.IsFuture` / `resource.IsExpired` and the `Build.Disable()` method.
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/resources","name":"IsFuture"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/resources/page","name":"Disable","nameContains":false})
  ▸ mcp__grove__source({"id":"go:resources/resource/dates.go#IsFuture@39"})
  ▸ mcp__grove__source({"id":"go:resources/page/pagemeta/pagemeta.go#Disable@57"})

💬 Here's the complete picture:  ---  ## The eligibility check  **Pure function** — `hugolib/site.go:1771` ```go func shouldBuild(buildFuture, buildExpired, bui...

──────── RESULT (success, 76722ms, 15 turns) ────────
Here's the complete picture:

---

## The eligibility check

**Pure function** — `hugolib/site.go:1771`
```go
func shouldBuild(buildFuture, buildExpired, buildDrafts bool,
    Draft bool, publishDate, expiryDate time.Time) bool
```
Three independent gates, all must pass:
- Draft: skip if `Draft && !buildDrafts`
- Future: skip if `!buildFuture && publishDate set && publishDate.After(now)`
- Expired: skip if `!buildExpired && expiryDate set && expiryDate.Before(now)`

**Method wrapper** — `hugolib/site.go:1763`
```go
func (s *Site) shouldBuild(p page.Page) bool
```
Adds one extra gate before delegating to the pure function: `s.conf.IsKindEnabled(p.Kind())`. So disabled kinds are caught here, not in the pure function.

---

## Assembly-time call sites

### 1. `doCreatePages` — `content_map_page_assembler.go:276`

Called during initial page assembly when each page is created from its metadata source. On failure:

- **All kinds**: `Build.Disable()` is called — sets `List=Never`, `Render=Never`, `PublishResources=false` on the page's `BuildConfig`.
- **Structural kinds** (`KindHome`, `KindSection`, `KindTaxonomy`): the page stays in the tree. It must remain to preserve the content-tree structure, but with `Build` disabled it won't be listed or rendered.
- **Everything else** (regular pages, terms, etc.): the path is appended to `a.droppedPages[site]` — it is removed from the tree.

### 2. `applyAggregatesToTaxonomiesAndTerms` — `content_map_page_assembler.go:1088`

A later pass that walks the taxonomy/term tree to propagate date aggregates upward. For `KindTerm` nodes only, it re-checks `shouldBuild`. On failure:

- **Hard delete**: `pageMap.treePages.Delete(s)` and `pageMap.treeTaxonomyEntries.DeletePrefix(...)`. The term and all its taxonomy entries are physically removed from the radix trees — stronger than the disable-and-drop path above.

This second check exists because a term's effective dates can only be determined after its entries have been assembled; a term that collects only expired/future regular pages may itself end up excluded here.

---

## The `hugo list` command — separate path

`commands/list.go` doesn't go through `(*Site).shouldBuild` at build time. Instead it forces all content to load (`buildDrafts=true`, `buildFuture=true`, `buildExpired=true`), then filters output rows with a per-subcommand `shouldInclude` closure. The `list published` subcommand calls `resource.IsFuture(p)` / `resource.IsExpired(p)` and `p.Draft()` directly — these are thin helpers in `resources/resource/dates.go` that just compare `PublishDate`/`ExpiryDate` against `htime.Now()` without any build-flag consultation.

---

## Summary

| Where | When | Fail action |
|---|---|---|
| `(*Site).shouldBuild` (wrapper) | per-page, during assembly | delegates to pure fn; adds kind-enabled gate |
| pure `shouldBuild` | per-page, during assembly | returns false |
| `doCreatePages` | initial page assembly | `Build.Disable()` + drop non-structural pages |
| `applyAggregatesToTaxonomiesAndTerms` | post-assembly taxonomy pass | hard-delete term + all its entries from radix trees |
| `list` subcommands | CLI output only | custom `shouldInclude` closure, no `Build.Disable()` |
