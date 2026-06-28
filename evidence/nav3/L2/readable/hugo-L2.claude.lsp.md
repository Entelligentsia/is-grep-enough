# transcript: I'm planning a change to Hugo's draft / future-dated / expired content filtering — the rule for when a content page should actually be built versus silently ...


💬 I'll load the LSP tool and start hunting for the eligibility check.
  ▸ ToolSearch(select:LSP)

💬 Now let me search for the eligibility/build-filter symbols.
  ▸ LSP(shouldBuild)
  ▸ LSP(isDraft)

💬 I need a file path to anchor. Let me find the right file first.
  ▸ Bash(grep -rl "shouldBuild\|isDraft\|isFuture\|isExpired\|BuildFuture\|BuildDrafts\|BuildExpired" /home/bench/repos/hugo --include="*.go" -l | head -20)

💬 Good candidates. Let me now use LSP to find the specific symbols and then explore the key files.
  ▸ LSP(shouldBuild)
  ▸ LSP(BuildDrafts)

💬 Found it. `Site.shouldBuild` lives at `hugolib/site.go:1763` and the package-level `shouldBuild` at line 1771. Let me read those and find their callers in pa...
  ▸ Read(/home/bench/repos/hugo/hugolib/site.go)
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/hugo/hugolib/site.go","line":1763,"character":15})
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/hugo/hugolib/site.go","line":1763,"character":16})
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/hugo/hugolib/site.go","line":1771,"character":6})

💬 `Site.shouldBuild` is called at two places in `content_map_page_assembler.go`. Let me read both call sites with enough context.
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page_assembler.go)
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page_assembler.go)

💬 Now let me get more context around the first call site — what function it's in and how the drop list is used.
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page_assembler.go)
  ▸ LSP(droppedPages)

💬 Let me check the `allPagesAssembler` struct definition and how `droppedPages` is consumed after page assembly.
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page_assembler.go)
  ▸ LSP({"operation":"findReferences","filePath":"/home/bench/repos/hugo/hugolib/content_map_page_assembler.go","line":58,"character":25})

💬 Let me find all `droppedPages` usages in the assembler and also check the `Build.Disable()` path for structure-type pages.
  ▸ Bash(grep -n "droppedPages\|Build.Disable\|Disable()" /home/bench/repos/hugo/hugolib/content_map_page_assembler.go | head -40)
  ▸ Bash(grep -n "droppedPages\|Build.Disable\|\.Disable()" /home/bench/repos/hugo/hugolib/*.go | head -40)
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page_assembler.go)

💬 Now let me check what `Build.Disable()` does and also look at the `isKindEnabled` check in `Site.shouldBuild`.
  ▸ LSP(BuildConfig Disable)
  ▸ Bash(grep -n "func.*Disable\|IsKindEnabled" /home/bench/repos/hugo/resources/page/pagemeta/*.go /home/bench/repos/hugo/config/allconfig/*.go /home/bench/repos/hug...)
  ▸ Read(/home/bench/repos/hugo/resources/page/pagemeta/pagemeta.go)
  ▸ Read(/home/bench/repos/hugo/config/allconfig/allconfig.go)

💬 Let me also quickly check the deprecation path for `BuildDrafts` on `Site` and the `BuildFuture`/`BuildExpired` config methods.
  ▸ Read(/home/bench/repos/hugo/hugolib/site.go)
  ▸ Read(/home/bench/repos/hugo/config/allconfig/configlanguage.go)

💬 Now I have the complete picture. Here's the full breakdown:  ---  ## The eligibility check  **`Site.shouldBuild(p page.Page) bool`** — `hugolib/site.go:1763`...

──────── RESULT (success, 117120ms, 26 turns) ────────
Now I have the complete picture. Here's the full breakdown:

---

## The eligibility check

**`Site.shouldBuild(p page.Page) bool`** — `hugolib/site.go:1763`

Two-layer gate:

1. **Kind gate** (`line 1764`): `s.conf.IsKindEnabled(p.Kind())` — returns false if the kind (page, section, home, etc.) is listed in `DisabledKinds` in config. This is the blunt per-kind switch.

2. **Per-page gate** (`line 1767`): delegates to the package-level `shouldBuild` function at line 1771 with three independent boolean tests:

```go
func shouldBuild(buildFuture, buildExpired, buildDrafts bool,
    Draft bool, publishDate, expiryDate time.Time) bool {
    if !(buildDrafts || !Draft) { return false }             // draft gate
    if !buildFuture && !publishDate.IsZero() && publishDate.After(htime.Now()) { return false }  // future gate
    if !buildExpired && !expiryDate.IsZero() && expiryDate.Before(htime.Now()) { return false }  // expired gate
    return true
}
```

`buildFuture`, `buildExpired`, and `buildDrafts` come from `s.Conf.BuildFuture()` / `.BuildExpired()` / `.BuildDrafts()` — the per-language config accessors in `config/allconfig/configlanguage.go:261-267`, which read `RootConfig` fields. (Note: `Site.BuildDrafts()` at `hugolib/site.go:729` is a separate, deprecated template-facing accessor that wraps the same value with a deprecation warning since v0.156.0.)

---

## The two call sites in `content_map_page_assembler.go`

### Call site 1 — `line 276`, inside `doTransformPages` → `handlePageMetaSource`

This fires during the main tree walk over all pages. For every per-site page that fails `shouldBuild`:

- **Always**: `(&p.m.pageConfig.Build).Disable()` is called — sets `List = "never"`, `Render = "never"`, `PublishResources = false`. The page still exists in the tree, its build config just marks it inert.

- **Structure kinds** (`KindHome`, `KindSection`, `KindTaxonomy`): **kept in the tree**. These are needed so the content tree still has valid parent nodes for children that do pass the check. Disabling the build config is the only action.

- **All other kinds** (`KindPage`, `KindTerm`, etc.): the path string `s` is appended to `a.droppedPages` (a `ConcurrentMap[*Site, []string]`).

The flush happens in the deferred cleanup at `createAllPages():104`:
```go
defer func() {
    for site, dropped := range a.droppedPages.All() {
        for _, s := range dropped {
            site.pageMap.treePages.Delete(s)
            site.pageMap.resourceTrees.DeletePrefix(paths.AddTrailingSlash(s))
        }
    }
}()
```
So the actual node deletion and resource-subtree pruning happen **after** the full tree walk completes.

### Call site 2 — `line 1088`, inside `handlePlural` (the taxonomy-term walk)

This is a second, taxonomy-specific sweep over `KindTerm` nodes. When a term fails `shouldBuild`, the action is **immediate and synchronous** (not deferred):

```go
if !p.s.shouldBuild(p) {
    sa.s.pageMap.treePages.Delete(s)
    sa.s.pageMap.treeTaxonomyEntries.DeletePrefix(paths.AddTrailingSlash(s))
}
```

It directly prunes both the term node from `treePages` and all its weighted taxonomy-entry children from `treeTaxonomyEntries`, and it **skips the date-propagation event** for that term so parent taxonomy nodes don't inherit dates from filtered-out terms.

---

## Summary of what a failing page causes

| Page kind | Call site | Immediate effect | Tree fate |
|---|---|---|---|
| `KindHome`, `KindSection`, `KindTaxonomy` | CS1 | `Build.Disable()` | Kept — structural skeleton preserved |
| `KindPage`, `KindTerm` (and others) | CS1 | `Build.Disable()` + appended to `droppedPages` | Deleted from `treePages` + resources after walk |
| `KindTerm` | CS2 | Direct `treePages.Delete` + taxonomy entries delete | Deleted immediately; date events suppressed |

The practical result: an ineligible leaf page (`KindPage`) is fully pruned — it won't appear in any page collection, won't render, and its resources are removed. An ineligible structural page (section, home) stays as a skeleton node — its own output is suppressed but it doesn't orphan its children.
