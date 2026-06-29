# transcript: I'm planning a change to how Hugo rebuilds a site incrementally when a file changes during `hugo server`, so I need to understand the full journey of a file-...


💬 I'll map out the full incremental rebuild flow by exploring the watcher, event classification, cache invalidation, and partial render stages. This spans seve...

  ▸ Agent(Map Hugo incremental rebuild flow)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/hugo -type f -name "*.go" | grep -E "(watcher|server|hugo\.go|change|cache|rebuild|batcher)" | head -30)
      ↳ Bash(find /home/bench/repos/hugo -type f -name "*.go" -path "*/hugolib/*" | grep -E "(build|change|watch)" | head -20)
      ↳ Bash(find /home/bench/repos/hugo -type f -name "*change*.go" -o -name "*stale*.go" | head -20)
      ↳ Bash(grep -r "contentChangeMap\|stalePages\|invalidate" /home/bench/repos/hugo --include="*.go" | head -30)
      ↳ Read(/home/bench/repos/hugo/commands/server.go)
      ↳ Bash(grep -n "newWatcher\|handleEvents\|rebuild" /home/bench/repos/hugo/commands/server.go | head -40)
      ↳ Bash(grep -n "type hugoBuilder\|func (c \*hugoBuilder)" /home/bench/repos/hugo/commands/server.go | head -40)
      ↳ Bash(grep -r "type hugoBuilder" /home/bench/repos/hugo --include="*.go")
      ↳ Read(/home/bench/repos/hugo/commands/hugobuilder.go)
      ↳ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)
      ↳ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)
      ↳ Bash(grep -n "type WhatChanged\|type.*Change" /home/bench/repos/hugo/hugolib/hugo_sites_build.go | head -20)
      ↳ Bash(grep -r "type WhatChanged" /home/bench/repos/hugo --include="*.go")
      ↳ Bash(grep -A 30 "type WhatChanged struct" /home/bench/repos/hugo/hugolib/site.go)
      ↳ Bash(grep -n "processPartialFileEvents\|processPartialRebuild" /home/bench/repos/hugo/hugolib/hugo_sites_build.go)
      ↳ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)
      ↳ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)
      ↳ Bash(grep -r "collectAndMarkStaleIdentities\|Reset\|resetBuildState" /home/bench/repos/hugo/hugolib --include="*.go" | head -20)
      ↳ Bash(grep -B 5 -A 50 "func.*collectAndMarkStaleIdentities" /home/bench/repos/hugo/hugolib/content_map*.go)
      ↳ Bash(grep -B 5 -A 20 "func.*markStale\|cnh.markStale" /home/bench/repos/hugo/hugolib/content_map_page_contentnode.go | head -60)
      ↳ Bash(grep -B 5 -A 30 "func (s \*Site) renderPages\|func (s \*Site) render(" /home/bench/repos/hugo/hugolib/site.go | head -80)
      ↳ Bash(grep -n "func (s \*Site) renderPages" /home/bench/repos/hugo/hugolib/*.go)
      ↳ Read(/home/bench/repos/hugo/hugolib/site_render.go)
      ↳ Bash(grep -B 5 -A 30 "func.*shouldRender\|type BuildCfg struct" /home/bench/repos/hugo/hugolib/hugo_sites_build.go | head -100)
      ↳ Bash(grep -r "type BuildCfg struct" /home/bench/repos/hugo --include="*.go")
      ↳ Bash(grep -A 50 "type BuildCfg struct" /home/bench/repos/hugo/hugolib/hugo_sites.go)
      ↳ Bash(grep -B 5 -A 50 "func.*resolveAndClearStateForIdentities" /home/bench/repos/hugo/hugolib/hugo_sites_build.go | head -100)
      ↳ Bash(grep -r "resolveAndClearStateForIdentities" /home/bench/repos/hugo --include="*.go" | head -5)
      ↳ Bash(grep -B 5 -A 80 "func (h \*HugoSites) resolveAndClearStateForIdentities" /home/bench/repos/hugo/hugolib/content_map_page.go)
      ↳ Read(/home/bench/repos/hugo/watcher/batcher.go)
      ↳ Bash(grep -r "type.*Identity" /home/bench/repos/hugo/identity --include="*.go" | head -20)
      ↳ Read(/home/bench/repos/hugo/identity/identity.go)
      ↳ Bash(grep -B 5 -A 20 "func (p \*pageState) skipRender" /home/bench/repos/hugo/hugolib/page__output.go)
      ↳ Bash(grep -r "skipRender" /home/bench/repos/hugo/hugolib --include="*.go" -A 5 | head -40)
      ↳ Bash(grep -r "ClearOnRebuild\|MemCache" /home/bench/repos/hugo/hugolib/hugo_sites_build.go | head -20)
      ↳ Bash(grep -B 5 -A 20 "renderState\|renderOnce" /home/bench/repos/hugo/hugolib/page__output.go | head -80)
      ↳ Bash(grep -B 5 -A 15 "resetRenderState\|renderState = 0" /home/bench/repos/hugo/hugolib/*.go | head -80)
      ↳ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)
      ↳ Read(/home/bench/repos/hugo/hugolib/site_render.go)
      ↳ Bash(grep -r "incrRenderState" /home/bench/repos/hugo --include="*.go")
      ↳ Bash(grep -B 10 "p.incrRenderState()" /home/bench/repos/hugo/hugolib/site.go | head -30)
      ↳ Bash(grep -r "type BuildState\|BuildState.IsRebuild\|IsRebuild()" /home/bench/repos/hugo/hugolib --include="*.go" | head -20)
      ↳ ⟹ returned to parent


💬 Let me spot-check a few of the key call sites the agent found to make sure the details are accurate.
  ▸ Bash(grep -n "handleEvents\|rebuildSites\|changesFromBuild\|partitionDynamic" /home/bench/repos/hugo/commands/hugobuilder.go | head -40)
  ▸ Bash(grep -n "processPartialFileEvents\|needsPagesAssembly\|resolveAndClearState\|collectAndMarkStale\|WhatChanged" /home/bench/repos/hugo/hugolib/hugo_sites_buil...)
  ▸ Bash(grep -n "renderState\|renderOnce\|shouldRender\|incrRenderState\|resetPo\|MarkStale\|ClearOnRebuild" /home/bench/repos/hugo/hugolib/content_map_page.go | hea...)
  ▸ Bash(grep -n "ComponentFolder\|handleChange\|isContent\|isLayout\|isAsset\|isData\|isI18n" /home/bench/repos/hugo/hugolib/hugo_sites_build.go | head -50)
  ▸ Bash(grep -n "shouldRender\|renderState\|renderOnce\|fastRenderMode\|incrRenderState" /home/bench/repos/hugo/hugolib/hugo_sites.go /home/bench/repos/hugo/hugolib/...)
  ▸ Bash(sed -n '864,1000p' /home/bench/repos/hugo/hugolib/hugo_sites_build.go)
  ▸ Bash(sed -n '900,970p' /home/bench/repos/hugo/hugolib/content_map_page.go)
  ▸ Bash(sed -n '1033,1090p' /home/bench/repos/hugo/hugolib/hugo_sites_build.go)

💬 Good — details confirmed. Here is the full picture:  ---  ## Hugo incremental rebuild: full flow walkthrough  ### Stage 1 — Watcher batching and handoff  **`...

──────── RESULT (success, 248273ms, 10 turns) ────────
Good — details confirmed. Here is the full picture:

---

## Hugo incremental rebuild: full flow walkthrough

### Stage 1 — Watcher batching and handoff

**`watcher/batcher.go`** wraps `fsnotify` and accumulates raw `fsnotify.Event` values into a slice over a ~500ms timer window, then flushes the whole batch at once to a `Events` channel. This smooths over rapid multi-file saves.

In **`commands/hugobuilder.go:314`**, `newWatcher()` spawns a goroutine that selects on two channels:
- `watcher.Events` — the batched `[]fsnotify.Event` from the filesystem
- `c.r.changesFromBuild` — programmatic identity changes injected by the build itself (used when a template or shortcode regenerates pages that reference it)

The filesystem path leads to `handleEvents()` (line 691). The programmatic path leads to `rebuildSitesForChanges()` (line 1150), which skips file classification entirely and feeds identities directly into the assemble/render phases.

---

### Stage 2 — Event classification in `handleEvents`

`handleEvents` (hugobuilder.go:691) does a first-pass split:

1. **Config files** → immediate `fullRebuild()` — no partial path.
2. **Static files** (content under a static component) → `staticSyncer.syncsStaticEvents()`, bypasses the build pipeline.
3. **Dynamic files** → `rebuildSites(dynamicEvents)` → `h.Build(BuildCfg{...}, events...)`.

Inside `Build`, `processPartialFileEvents` (hugo_sites_build.go:865) does the real per-file classification. It runs the events through three pre-processing steps:

- `fileEventsFilter` — drops ghost events (Chmod-only, missing files)
- `fileEventsTrim` — merges rename pairs into a single logical write
- `fileEventsApplyInfo` — attaches added/removed/isDir flags

Then for each surviving event, `h.BaseFs.ResolvePaths(ev.Name)` maps the absolute filesystem path back to one or more `(Component, Path)` pairs — because a path can appear in multiple overlay layers.

The **`handleChange`** closure (line 967) then switches on the component:

| Component | What happens |
|---|---|
| `ComponentFolderContent` | `pageTrees.collectAndMarkStaleIdentities(pathInfo)` — locates nodes, calls `MarkStale`, returns their identities. Sets `needsPagesAssemble = true`. Content-data files (`.yaml`/`.json` front-matter sources) take a separate branch that evicts `PagesFromTemplate` entries. |
| `ComponentFolderLayouts` | For a new template: adds a path identity (or `GenghisKhan` for `_markup` files, or a glob like `/_shortcodes/foo*` for shortcodes). For a changed template: looks up the template store's own registered identity for that path. Sets `tmplChanged`. |
| `ComponentFolderAssets` | Appends the path itself as an identity. |
| `ComponentFolderData` | Appends `siteidentities.Data` (a coarse sentinel) and calls `h.init.data.Reset()` to drop the data-load lazy init. |
| `ComponentFolderI18n` | Appends `identity.GenghisKhan` — invalidates everything — and sets `i18nChanged`. |

Structural add/remove events also append `identity.StructuralChangeAdd` / `StructuralChangeRemove` regardless of component. The output of this entire stage is `changes []identity.Identity` and the boolean flags.

---

### Stage 3 — Cache invalidation and stale-marking

`WhatChanged.Add(changes...)` accumulates the identities. They flow into `resolveAndClearStateForIdentities` (content_map_page.go:900), which is called in three places during the assemble phase (lines 309, 364, 378 of hugo_sites_build.go) — once per assemble sub-step so that changes discovered during assembly are also processed.

`resolveAndClearStateForIdentities` executes in a defined order:

1. **`MarkStale()` pass** — iterates `changes`; for any identity that implements `resource.Staler`, calls `MarkStale()` on it directly. This covers `*pageState` nodes and resource objects.

2. **`MemCache.ClearOnRebuild(predicate, changes...)`** — walks the dynamic cache (`dynacache`) and evicts entries whose stored dependency identities intersect with `changes`, using `identity.WalkIdentitiesDeep` to traverse the dependency graph transitively. The `predicate` also handles cache-buster patterns from `BuildConfig.MatchCacheBuster` (for asset fingerprinting). Evicted entries push their own identities onto an eviction stack, which is drained and appended to `changes` — so invalidation cascades.

3. **`pageOutput` reset pass** — walks `treePages` and `treeResources` again, using `identity.SearchIdentities` to find outputs that depended on any changed identity. For each affected `pageOutput`:
   - `po.pco.Reset()` if it was a content change (clears the rendered Markdown/HTML cache)
   - `po.renderState = 0` — marks it for re-render
   - `po.renderOnce = false` if the finder result was `FinderFoundOneOfMany` (i.e., a coarse match that touched many pages)

---

### Stage 4 — Partial assembly

`Build` runs three sequenced phases (hugo_sites_build.go:171–197):

**Process** — `processPartialFileEvents` (already described). Output: `WhatChanged` populated, `needsPagesAssemble` set.

**Assemble** — gated by `needsPagesAssemble`:
- If false: `resolveAndClearStateForIdentities` runs on the pre-accumulated changes immediately, then skips full page-tree assembly.
- If true: `createAllPages()` does a full walk of the content tree, re-parses changed files, inserts/removes nodes. The tree walk itself may discover more changes (e.g. a new file's bundle context affects siblings), which are drained and pushed through another `resolveAndClearStateForIdentities` call at lines 364 and 378.

**Render** — `renderPages()` (site_render.go:71) walks `pageMap.treePages` concurrently (up to `numWorkers` goroutines). For each page, `BuildCfg.shouldRender(p)` (hugo_sites.go:633) decides:

```go
if !p.renderOnce {
    return true   // never rendered at all yet
}
shouldRender := p.renderState == 0   // was invalidated
if !shouldRender { return false }
if !fastRenderMode || !h.BuildState.IsRebuild() {
    return shouldRender
}
// fast-render-mode: additional RecentlyTouched check...
```

After a page renders, `po.incrRenderState()` (page__output.go:152) increments `renderState` and sets `renderOnce = true`, so the page is skipped on the next cycle unless it gets reset again.

---

### How the stages connect — summary

```
fsnotify.Event batch
  │
  ▼ commands/hugobuilder.go:handleEvents
  │  partitionDynamicEvents → rebuildSites
  │
  ▼ hugolib/hugo_sites_build.go:processPartialFileEvents
  │  fileEventsFilter → fileEventsTrim → fileEventsApplyInfo
  │  BaseFs.ResolvePaths → (Component, Path) pairs
  │  handleChange switch:
  │    content  → pageTrees.collectAndMarkStaleIdentities → changes[]
  │    layouts  → template store identity or glob → changes[]
  │    assets   → path identity → changes[]
  │    data     → siteidentities.Data + init.data.Reset()
  │    i18n     → identity.GenghisKhan
  │  → WhatChanged.Add(changes...)
  │
  ▼ hugolib/hugo_sites_build.go:assemble phase
  │  (needsPagesAssemble?) createAllPages → rebuild page tree
  │  resolveAndClearStateForIdentities (×3 drain points):
  │    MarkStale() on resource.Staler ids
  │    MemCache.ClearOnRebuild → cascade evictions
  │    resetPo: po.pco.Reset(), po.renderState=0, po.renderOnce=false
  │
  ▼ hugolib/site_render.go:renderPages
     shouldRender: skip if renderState > 0
     render → po.incrRenderState()
```

---

### Key intervention points for your change

| What you want to change | Where to touch |
|---|---|
| How events are batched or filtered before classification | `watcher/batcher.go`, `hugobuilder.go:handleEvents` pre-filter |
| What identity is emitted for a given file type | `processPartialFileEvents/handleChange` switch (hugo_sites_build.go:967) |
| What triggers `needsPagesAssemble` | Same switch; the flag is set in the content arm |
| How the dependency graph is walked during cache eviction | `dynacache` + `identity.WalkIdentitiesDeep` |
| Which `pageOutput`s get their `renderState` reset | `resolveAndClearStateForIdentities` reset pass (content_map_page.go:1086) |
| Which pages are actually re-rendered | `BuildCfg.shouldRender` (hugo_sites.go:633) |

The two most important coupling points are the `changes []identity.Identity` slice (it is the single shared currency between classification and invalidation) and `po.renderState` (it is the single gate between invalidation and rendering). Everything else is bookkeeping around those two.
