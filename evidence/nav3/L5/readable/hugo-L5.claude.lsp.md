# transcript: I'm planning a change to how Hugo rebuilds a site incrementally when a file changes during `hugo server`, so I need to understand the full journey of a file-...


💬 I'll trace this flow systematically using the LSP tool. Let me start by locating the key entry points.
  ▸ ToolSearch(select:LSP)

💬 Now let me explore the key entry points in parallel — the watcher, the change classifier, and the rebuild coordinator.
  ▸ LSP(fsChangeEvent)
  ▸ LSP(changeIdentity)
  ▸ LSP(partialRebuilder)

💬 Let me find a concrete file first to anchor the LSP queries.
  ▸ Bash(find /home/bench/repos/hugo/watcher -type f -name "*.go" | head -20 && find /home/bench/repos/hugo/commands -name "server.go")
  ▸ Bash(grep -rn "changeIdentity\|ChangeIdentity\|fsChangeEvent\|FsChangeEvent" /home/bench/repos/hugo --include="*.go" -l | head -20)
  ▸ Bash(grep -rn "contentChange\|ContentChange\|fileChange\|FileChange\|ChangeEvent\|changeEvent\|rebuild\|Rebuild" /home/bench/repos/hugo/hugolib --include="*.go" -...)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/watcher/batcher.go","line":1,"character":1})
  ▸ Read(/home/bench/repos/hugo/watcher/batcher.go)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","line":1,"character":1})

💬 Now I have a good overview. Let me read the key processing functions and the server's event dispatch loop in parallel.
  ▸ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)
  ▸ Read(/home/bench/repos/hugo/commands/server.go)

💬 Now let me look at the server's rebuild dispatch, `resolveAndClearStateForIdentities`, and `collectAndMarkStaleIdentities` in parallel.
  ▸ LSP(resolveAndClearStateForIdentities)
  ▸ LSP(collectAndMarkStaleIdentities)
  ▸ Bash(grep -n "Rebuild\|rebuild\|\.Build\|fileEvents\|batcher\|Events <-\|<-batcher\|watchChange\|handleEvents\|handleChange" /home/bench/repos/hugo/commands/serve...)
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page.go)
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page.go)
  ▸ Bash(grep -n "batcher\.\|\.Events\|fileEventsCh\|handleFileChange\|handleServerEvents\|watchChange\|rebuildCh\|rebuildSite\|fullRebuild\|partialRebuild\|Build(hug...)

💬 Let me find the server's watcher loop and the `Build` method's routing logic.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/commands/server.go","line":1,"character":1})
  ▸ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)

💬 Now let me look at the server's watcher loop and the `assemble` method.
  ▸ Read(/home/bench/repos/hugo/commands/server.go)
  ▸ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)

💬 Now let me find the `hugoBuilder` event loop where the batcher events are received.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/commands/hugo.go","line":1,"character":1})
  ▸ Read(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)
  ▸ Bash(find /home/bench/repos/hugo/commands -name "*.go" | xargs grep -l "hugoBuilder\|batcher\|\.Events\b" | head -10)
  ▸ LSP(hugoBuilder)

💬 Now let me read the watcher setup and event handler in `hugobuilder.go`.
  ▸ Read(/home/bench/repos/hugo/commands/hugobuilder.go)
  ▸ Read(/home/bench/repos/hugo/commands/hugobuilder.go)

💬 Now let me look at the event preprocessing functions and `WhatChanged`.
  ▸ LSP(WhatChanged)
  ▸ LSP(fileEventsApplyInfo)
  ▸ Read(/home/bench/repos/hugo/hugolib/site.go)
  ▸ Read(/home/bench/repos/hugo/hugolib/site.go)
  ▸ LSP(preparePagesForRender)
  ▸ Read(/home/bench/repos/hugo/hugolib/hugo_sites.go)
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page.go)
  ▸ Read(/home/bench/repos/hugo/hugolib/content_map_page.go)

💬 I now have the full picture. Let me write up the complete flow.  ---  ## Hugo incremental rebuild: end-to-end flow  The path from OS event to browser refresh...

──────── RESULT (success, 213623ms, 37 turns) ────────
I now have the full picture. Let me write up the complete flow.

---

## Hugo incremental rebuild: end-to-end flow

The path from OS event to browser refresh passes through six distinct stages.

---

### Stage 1 — OS events → batched delivery (`watcher/batcher.go`)

`watcher.Batcher` wraps `fsnotify.FileWatcher`. A goroutine accumulates raw `fsnotify.Event`s into a slice; a 500 ms `time.Ticker` fires and flushes whatever has collected onto `batcher.Events chan []fsnotify.Event`. This is the only timing boundary: a burst of disk writes collapses into one batch.

---

### Stage 2 — Pre-classification & routing (`commands/hugobuilder.go:handleEvents`)

The goroutine in `newWatcher` (line 387) reads `watcher.Events` and calls `handleEvents`. It does several things before any hugolib code is touched:

1. **Ghost/Chmod filter** (lines 705–729): Drop pure `Chmod` events. Drop `Create`/`Write` events where `os.Stat` fails (the file is already gone — this is an OS/fnotify artifact).
2. **Config-file check** (lines 732–777): If any event path is in `configSet`, call `fullRebuild()` immediately and return. This reloads the entire configuration from scratch; no partial path is taken.
3. **Mass-edit debounce** (lines 790–797): If more than 50 events arrive at once, debounce into `fullRebuild` and return.
4. **Temp/editor file filter** (lines 834–860): Drop `.swp`, `.DS_Store`, Emacs `#`-prefix, IntelliJ `jb_*`, etc.
5. **Static vs. dynamic split** (lines 886–890): `staticSyncer.isStatic()` tests whether the path lives in a static filesystem. Static events go to `staticSyncer.syncsStaticEvents()` — just a file copy, no build. Dynamic events go to `rebuildSites(dynamicEvents)` → `h.Build(BuildCfg{NoBuildLock: true, RecentlyTouched: c.visitedURLs, ...}, events...)`.

---

### Stage 3 — Build entry & routing (`hugolib/hugo_sites_build.go:Build → process`)

`Build` (line 64) checks `len(events) > 0` in `process` (line 287) and branches into `processPartialFileEvents`. This is the partial-rebuild path; the full-build path (`processFull`) is never taken during watch mode unless a config change forced it.

`processPartialFileEvents` begins with three preprocessing passes over the raw events:

- **`fileEventsFilter`** (site.go:1193): Dedup identical events, NFC-normalize paths on Darwin/HFS+, sort so structural ops (Create, Remove, Rename) come before Write.
- **`fileEventsTrim`** (site.go:1313): Collapse multiple events for the same filename to one.
- **`fileEventsApplyInfo`** (site.go:1254): Stat each file path and attach a `fileEventInfo` with boolean flags `added`, `removed`, `isChangedDir`. Rename is resolved by checking whether the file still exists on disk — if yes it's an in-place update, if no it's a move/delete.

---

### Stage 4 — Path resolution to component + `*paths.Path`

For each `fileEventInfo`, `BaseFs.ResolvePaths(ev.Name)` converts the absolute OS path to one or more `(component, virtualPath)` pairs by walking the layered virtual filesystem. Components are the named source folders: `content`, `layouts`, `assets`, `data`, `i18n`, `archetypes`.

Each pair is then parsed with `h.Configs.ContentPathParser.Parse(component, path)` into a `*paths.Path`, which carries the component, language, base path, bundle type, and extension — the structural vocabulary everything downstream depends on.

Events are sorted into four buckets: `changedFiles`, `addedFiles`, `changedDirs`, `deleted`.

---

### Stage 5 — Identity resolution per component (`handleChange` closure, lines 967–1086)

Each `*paths.Path` is dispatched by `pathInfo.Component()`. This is where "what changed" becomes a typed identity.

**Content** (`ComponentFolderContent`):
- `pageTrees.collectAndMarkStaleIdentities(pathInfo)` (content_map_page.go:143) walks both `treePages` and `treeResources` radix trees, finding every node whose key matches (across all language dimensions). It calls `cnh.markStale(n)` on each matching node, then collects one representative `identity.Identity` per dimension by calling `n.ForEeachIdentity(...)`. This identity is what the dependency graph is later diffed against.
- For `_content.gotmpl` adapter files: the `treePagesFromTemplateAdapters` is queried, and if the file was deleted all pages/resources under its prefix are pruned from the trees.
- For newly **added** content: `collectIdentitiesSurrounding(p.Base(), 10)` finds up to 10 adjacent entries in the radix tree (neighbors at the same section level) and marks those identities as changed — a targeted way to invalidate list pages that would now have a different entry, without blowing up everything.
- `needsPagesAssemble = true` is set.
- The `pathChange` struct records whether the change is `structural` (delete, or add of a leaf bundle), which gates whether the assemble step re-creates the page tree.

**Layouts** (`ComponentFolderLayouts`):
- If the template is new (`!TemplateStore.HasTemplate()`): coarse identity. Templates in `_markup` folders get `identity.GenghisKhan` (total invalidation — render hooks affect arbitrary content). Shortcodes get both their own `pathInfo` and a glob identity `/_shortcodes/<name>*`.
- If existing: `TemplateStore.GetIdentity(path)` retrieves the template's registered identity object, which has already tracked which pages rendered through it.

**Assets** (`ComponentFolderAssets`): The `pathInfo` itself becomes the identity. Asset consumers tracked this path as a dependency when they called `resources.Get`.

**Data** (`ComponentFolderData`): The coarse `siteidentities.Data` identity, and `h.init.data.Reset()` clears the data lazy-init so it reloads next build.

**i18n**: `identity.GenghisKhan` — full invalidation; no fine-grained tracking exists yet.

A parallel concern: for each resolved component path, `BuildConfig.MatchCacheBuster(np)` computes a glob predicate. These are OR-ed together into a `cacheBusterOr func(string) bool` used in the next stage.

---

### Stage 6 — Cache and state clearing (`resolveAndClearStateForIdentities`, content_map_page.go:900)

This is the core invalidation engine. It receives `[]identity.Identity` (everything from Stage 5) and:

1. **Direct stale marking** (lines 936–945): Any identity that implements `resource.Staler` (notably `*pageState`) gets `MarkStale()` called immediately.

2. **Dynacache GC** (`h.MemCache.ClearOnRebuild(predicate, changes...)`): The in-memory distributed cache (used for partials, resources, processed assets) is swept. Each cache entry's dependency chain is compared to `changes` using the identity finder; if any change is a dependency of the entry, the entry is evicted. The `cacheBusterOr` predicate handles asset-path-based busting (e.g., a JS file imported by a bundle). Evicted identities are drained — if fewer than 200 were evicted they're appended to `changes` (transitive propagation); if more, `GenghisKhan` replaces the whole set.

3. **Content adapter staleness** (lines 1020–1045): Walk `treePagesFromTemplateAdapters`; for each adapter use `depsFinder.Contains(id, adapter.DependencyManager, depth=2)` — if any change overlaps, `adapter.MarkStale()`.

4. **Page output reset** (`resolveAndResetDependentPageOutputs`, line 1064): Walk all `pageState`s in parallel workers. For each page:
   - Check `depsFinder.Contains(id, p.dependencyManager, depth=2)` against all changes. A match resets all output formats: `po.pco.Reset()` (clears the rendered content cache), `po.renderState = 0`, and `po.renderOnce = false` if the match is one-of-many (forces re-render even in fast render mode).
   - If no top-level match, check each output format's finer `po.dependencyManagerOutput` (depth=50). A match here resets only that output format without clearing the content cache.

---

### Stage 7 — Template and i18n reload; content adapters re-execute

Back in `processPartialFileEvents`, after state clearing:

- `tmplChanged`: `TemplateStore.RefreshFiles()` reloads only those template files whose `PathInfo` was found in `changes2` by the finder.
- `i18nChanged`: `Deps.Compile()` rebuilds i18n bundles for all sites.
- `processContentAdaptersOnRebuild()`: Walks adapters whose `StaleVersion() > 0`, re-executes them via `PagesFromTemplate.Execute()`, then calls `handleContentAdapterChanges()` which pushes any newly discovered changed/deleted page identities back into `WhatChanged`.

---

### Stage 8 — Assemble (`assemble`, hugo_sites_build.go:302)

`assemble` checks `WhatChanged.needsPagesAssembly`:

**If true** (content was added/changed/deleted):
1. `apa.createAllPages()` — re-walks the `treePages`/`treeResources` trees, rebuilding the section hierarchy and page collections.
2. `assemblePagesStep1()` per site (parallel) — attaches front matter, cascade, dates, taxonomies. Aggregate date changes (a child page newer than its section) emit additional identities into `WhatChanged` as a side effect.
3. `resolveAndClearStateForIdentities` again — for those assembly-emitted changes.
4. `assemblePagesStep2()` — taxonomy term pages, menu entries.
5. Another `resolveAndClearStateForIdentities`.
6. `assemblePagesStepFinal()` — finalizes render format assignments.
7. Stores the walk context in `h.previousPageTreesWalkContext` for cascade-change detection on the next rebuild.

**If false** (template/asset-only change): skips all tree rebuilding, just runs one `resolveAndClearStateForIdentities` pass directly.

---

### Stage 9 — Render (`render`, hugo_sites_build.go:399)

For each site × output format:
1. `preparePagesForRender()` — calls `shiftToOutputFormat()` on every page, activating the per-output render context.
2. If `config.PartialReRender` (fast render mode): `s.renderPages()` re-renders only pages whose `renderState == 0` (those reset in Stage 6).
3. Otherwise: `s.render()` — full site render.

**Fast render mode detail**: `RecentlyTouched` is a `*visited.URLs` set. Pages visited by the browser since the last build are tracked. `handleChange` adds changed pages to this set (line 1003). The server's `partialReRender` handler (server.go:847–863) uses a separate `Build(PartialReRender: true)` path that skips assemble entirely and re-renders only the touched URLs.

---

### Connecting summary

```
Batcher.Events  (500ms batching ticker)
    ↓
handleEvents    (config/static/dynamic split; temp file filter)
    ↓
rebuildSites → h.Build(events...)
    ↓
process → processPartialFileEvents
    ├── fileEventsFilter / Trim / ApplyInfo   (normalize, classify op type)
    ├── BaseFs.ResolvePaths → paths.Parse     (OS path → (component, *paths.Path))
    ├── handleChange per component            (component → identity + markStale)
    │     content → collectAndMarkStaleIdentities (radix tree walk, multi-lang)
    │     layouts → TemplateStore.GetIdentity
    │     assets  → pathInfo as identity
    │     data    → siteidentities.Data (coarse)
    │     i18n    → GenghisKhan (full)
    ├── resolveAndClearStateForIdentities
    │     MarkStale on pageState objects
    │     MemCache.ClearOnRebuild (dynacache GC, transitive eviction)
    │     resolveAndResetDependentPageOutputs (parallel dep-graph walk)
    ├── TemplateStore.RefreshFiles / i18n recompile
    └── processContentAdaptersOnRebuild (re-exec stale adapters)
    ↓
assemble  (needsPagesAssembly: tree rebuild, cascade, taxonomies; 3× resolve pass)
    ↓
render    (preparePagesForRender; partial or full render)
    ↓
livereload.ForceRefresh / NavigateToPath / RefreshPath
```

The key design invariant is that `WhatChanged` accumulates identities throughout — it's a set that grows as each stage discovers more downstream effects — and `resolveAndClearStateForIdentities` is called multiple times (after process, after each assemble step) so that cascade effects discovered during assembly still trigger correct re-renders.
