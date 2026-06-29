# transcript: I'm planning a change to how Hugo rebuilds a site incrementally when a file changes during `hugo server`, so I need to understand the full journey of a file-...


💬 I'll map the relevant packages structurally with grove before reading any code, then trace the flow end-to-end.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__map)
  ▸ mcp__grove__map({"dir":"/home/bench/repos/hugo/watcher"})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/hugo/commands/server.go","detail":0})
  ▸ Bash(ls /home/bench/repos/hugo/hugolib/*.go | head -30)
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/commands/server.go","name":"serve"})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/hugo/hugolib/content_map.go","detail":0})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/commands/server.go","name":"Run"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","name":"processPartialFileEvents"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","name":"processPartialRebuildChanges"})

💬 Good, I can see the core of `processPartialFileEvents`. Now let me read the surrounding stages — the watcher dispatch loop, `resolveAndClearStateForIdentitie...
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/commands","name":"newWatcher"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","name":"initRebuild"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/hugolib","name":"resolveAndClearStateForIdentities"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/commands/hugobuilder.go","name":"newWatcher"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/content_map_page.go","name":"resolveAndClearStateForIdentities"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/commands","name":"handleEvents"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/commands","name":"rebuildSitesForChanges"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/hugolib","name":"resolveAndResetDependententPageOutputs"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/hugolib","name":"collectAndMarkStaleIdentities"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/commands/hugobuilder.go","name":"handleEvents"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/commands/hugobuilder.go","name":"rebuildSitesForChanges"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/content_map_page.go","name":"collectAndMarkStaleIdentities"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/content_map_page.go","name":"resolveAndResetDependententPageOutputs"})

💬 Now let me read the `Build` method and `rebuildSites` to see how everything connects into assemble/render.
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","name":"Build"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/commands","name":"rebuildSites"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/hugolib","name":"WhatChanged"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/commands/hugobuilder.go","name":"rebuildSites"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/site.go","name":"WhatChanged"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","name":"assemble"})

💬 Now let me check `process`, `render`, and the event pre-processing functions for completeness.
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","name":"process"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/hugo_sites_build.go","name":"render"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/hugolib","name":"fileEventsFilter"})
  ▸ mcp__grove__symbols({"dir":"/home/bench/repos/hugo/hugolib","name":"fileEventsApplyInfo"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/site.go","name":"fileEventsFilter"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/hugolib/site.go","name":"fileEventsApplyInfo"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/hugo/commands/server.go","name":"partialReRender"})

💬 I now have everything I need to walk through the full flow. Here's the end-to-end trace.  ---  ## Full file-change → partial render pipeline  ### 1. Batching...

──────── RESULT (success, 201334ms, 37 turns) ────────
I now have everything I need to walk through the full flow. Here's the end-to-end trace.

---

## Full file-change → partial render pipeline

### 1. Batching: `watcher/`

`watcher.New` creates a `Batcher` wrapping either an `fsnotify` inotify/kqueue watcher or a polling `filePoller`. Raw `fsnotify.Event`s are collected over a 500 ms accumulation window; the batch is emitted as `[]fsnotify.Event` on `Batcher.Events`. This decouples filesystem noise (rapid succession of writes from editors) from the build loop.

---

### 2. Dispatch: `commands/hugobuilder.go — newWatcher` goroutine

A single goroutine selects on `watcher.Events`. On each batch it acquires `h.LockBuild()` then calls `handleEvents`. Two pre-filters happen before anything domain-specific:

- **Drop**: CHMOD-only events, ghost writes (Create/Write with no file on disk), editor temp files (Vim swaps, JetBrains `jb_tmp`, Emacs `#foo`, etc.), and paths matching `IgnoreFile`.
- **Config check**: if any path is in `configSet` → `fullRebuild()`, return. Config changes can't be incrementally patched.
- **Mass-edit guard**: `len(evs) > 50` → debounce into a `fullRebuild()`.

Surviving events are partitioned into **static** (files under static source dirs) vs **dynamic** (content, layouts, i18n, assets, data). Static events go straight to `staticSyncer.syncsStaticEvents` and a targeted `livereload.RefreshPath`; they never enter the Hugo build engine.

Dynamic events enter: `c.rebuildSites(dynamicEvents)` → `h.Build(BuildCfg{NoBuildLock: true, ...}, events...)`.

---

### 3. Build dispatch: `hugolib/hugo_sites_build.go — Build / process`

`Build` delegates to `process`, which makes a three-way decision:

```
events present          → processPartialFileEvents   (filesystem-triggered rebuild)
WhatChanged.Changes()   → processPartialRebuildChanges  (remote/programmatic trigger)
neither                 → processFull               (fresh build)
```

---

### 4. Event enrichment: `processPartialFileEvents`

Three sequential transformations on the raw event slice before any domain logic:

**a. `fileEventsFilter`** — dedup, NFC-normalize on macOS (HFS+ gives NFD paths), sort by op ordinal (Create < Remove < Rename < Write) so structural changes are processed first.

**b. `fileEventsTrim`** — coalesces redundant events (e.g. Remove+Create on the same path becomes Write).

**c. `fileEventsApplyInfo`** — `stat`s each file to produce `fileEventInfo{added, removed, isChangedDir}`. Handles the Vim rename idiom: a `Rename` event where the file still exists on disk is treated as a Write, not a delete. Directory events that are redundantly covered by a child file event are dropped.

---

### 5. Resolve to virtual paths + component classification

For each `fileEventInfo`, `h.BaseFs.ResolvePaths(ev.Name)` maps the OS path into one or more `(Component, Path)` pairs, one per module overlay layer. Each pair is then parsed by `h.Configs.ContentPathParser.Parse(component, path)` into a `*paths.Path` carrying the component tag.

A parallel **cache-buster predicate** is compiled for each path via `BuildConfig.MatchCacheBuster` — a glob function used later to evict matching cache keys even without a direct identity link.

Events are bucketed into `changedFiles / addedFiles / deleted / changedDirs`, then fed into `handleChange`, which switches on `pathInfo.Component()`:

| Component | Identity produced |
|-----------|------------------|
| `content/` | `collectAndMarkStaleIdentities` (see §6); also `StructuralChangeAdd/Remove` for add/delete |
| `layouts/` | Template's registered `identity.Identity` from `TemplateStore.GetIdentity`; new shortcode → glob like `/_shortcodes/foo*`; new render hook / `_markup` addition → `identity.GenghisKhan` (full invalidation) |
| `assets/` | The `*paths.Path` itself |
| `data/` | `siteidentities.Data` sentinel; also resets `h.init.data` lazy loader |
| `i18n/` | `identity.GenghisKhan` (too coarse-grained to be precise) |

For deleted directories, a `PredicateIdentity` is built: it matches any identity whose `IdentifierBase()` starts with the deleted prefix, so entire subtrees are invalidated.

For newly added content files, `pageTrees.collectIdentitiesSurrounding(p.Base(), 10)` collects the 10 nearest neighbors from the page tree (adjacent sibling pages) — they need re-render because their `.Prev`/`.Next` relations change. Fallback to `GenghisKhan` if the tree is empty.

---

### 6. Stale-marking in the content tree: `collectAndMarkStaleIdentities`

Called for every content path change. It walks `pageTrees.treePages` and `treeResources` (a radix tree keyed by cleaned path) at the exact key, looking across all build dimensions (language × output format via `ForEeachInAllDimensions`). For each matching `contentNode`:

- Calls `cnh.markStale(n)` — sets a dirty flag on the node so it is re-assembled.
- Collects one identity sample per dimension from `toForEachIdentityProvider(n).ForEeachIdentity` — these are the identity objects that downstream pages and cache entries have recorded as dependencies.

For bundles, also checks the content-resource sub-path. The returned identity slice is what propagates through the rest of the invalidation graph.

---

### 7. `initRebuild` (called via the `init` closure)

Before cache GC, resets transient build state on every node:

- Walks all of `treePagesResources` and calls `resetBuildState` on every content node (clears ephemeral fields like rendered content, but not the stale flag).
- Calls `s.resetBuildState(needsPagesAssembly)` on each `Site`.

---

### 8. Cache and page-output invalidation: `resolveAndClearStateForIdentities`

This is the core of incremental correctness. It runs in three ordered sub-steps:

**a. Direct `MarkStale()`** — for each `identity.Identity` in `changes` that also implements `resource.Staler`, call `MarkStale()`. This is the direct path: if a `pageState` is itself in `changes`, it gets marked stale immediately.

**b. Dynacache GC** (`MemCache.ClearOnRebuild`) — walks the in-memory cache. Each entry carries the identity of whatever produced it. For each cache entry, `identity.Finder.Contains(changeId, entryIdentity)` is evaluated. Cache entries whose identity graph intersects `changes` are evicted. The evicted entries' own identities are then appended to `changes` — cascading invalidation through cache dependencies. If ≥200 entries evict, assume GenghisKhan (mass invalidation).

**c. Resolve page output change set** (`resolveAndResetDependentPageOutputs`) — parallel scan across all `pageState` objects that have been rendered at least once. Two-level check:

1. Check `p.dependencyManager` at depth 2 — if the page's top-level dependency graph contains a change, reset *all* `pageOutput` entries for that page: set `renderState = 0`, call `pco.Reset()` (invalidates the content/Markdown cache), clear `renderOnce` if result was `FinderFoundOneOfMany`.
2. If not matched at the page level, check each `po.dependencyManagerOutput` at depth 50 for per-output-format precision — a page can have its HTML output reset without resetting its JSON feed if only the HTML-specific template changed.

Pages whose dependency graph has no intersection with `changes` keep their `renderState` intact and will be skipped during render.

---

### 9. Template / i18n refresh

If any layout file changed: `TemplateStore.RefreshFiles(predicate)` — re-parses only templates whose `PathInfo` is contained in `changes2` (as determined by `identity.Finder.Contains`). Unchanged templates are left in place.

If i18n changed: re-compiles all `Deps` translation tables across all sites.

---

### 10. Content re-processing: `processFiles` / `processContentAdaptersOnRebuild`

If any content files were added or changed, `processFiles` re-reads them from the source filesystem and re-registers them into `treePages` / `treeResources`.

If template adapters (`.gotmpl` content adapters) are stale, `processContentAdaptersOnRebuild` re-executes them to re-populate their derived page subtrees.

---

### 11. Assemble: `hugolib/hugo_sites_build.go — assemble`

Back in `Build`, after `process` returns:

If `!needsPagesAssembly` (only templates, assets, or data changed): calls `resolveAndClearStateForIdentities` once more with any changes generated during process, then returns early. No page tree walk needed.

If `needsPagesAssembly`:

1. `createAllPages()` — walks `treePages`, creates `pageState` objects for any newly registered content nodes.
2. `assemblePagesStep1()` — cascade resolution, front matter merging, taxonomy assignment. Runs per-site in parallel.
3. **Drain + re-invalidate**: assembly can produce new changes (e.g. a `lastMod` date aggregate bubbled up from an edited child). Drain `WhatChanged`, call `resolveAndClearStateForIdentities` again.
4. `assemblePagesStep2()` — builds taxonomy term pages.
5. Drain + re-invalidate again for any new terms.
6. `assemblePagesStepFinal()` — sets render formats, output paths, initializes `pageOutput` slots.

Each drain→invalidate cycle is important: assembly-time discoveries (date changes, new taxonomy terms) must propagate to page outputs before render.

---

### 12. Render: `hugolib/hugo_sites_build.go — render`

For each site × output format:

- `preparePagesForRender` — populates output-format-specific page data.
- **Normal rebuild**: `s.render(siteRenderContext)` — renders all page kinds. Individual pages consult `po.renderState`: pages whose state was reset to `0` in §8c are re-rendered; pages with a non-zero state (untouched by the change set) may be skipped.
- **`PartialReRender` mode**: `s.renderPages(...)` — only pages whose `renderOnce` flag permits it and that appear in `RecentlyTouched` are rendered. Used by the fast-render-mode navigation path.

After render: `writeBuildStats` → `renderDeferred` (deferred/partial template execution) → `printUnusedTemplatesOnce` → `postProcess`.

---

### 13. Live reload

Back in `handleEvents`, after `rebuildSites` returns:

- `changeDetector.changed()` diffs old vs new output files.
- CSS-only changes: `livereload.RefreshPath` per file (hot-swap, no reload).
- Single content page, `navigateToChanged` enabled: `livereload.NavigateToPathForPort`.
- Everything else: `livereload.ForceRefresh`.

---

### Key design choices to understand for your change

- **Identity graph** (`identity.Finder.Contains`): the dependency recording happens at render time — templates record which identities they consulted. On rebuild, `Contains` checks whether a changed identity is anywhere in the recorded dependency subgraph. Depth limits (2 for page-level, 50 for output-level) are a perf trade-off.
- **Two-level invalidation**: the page's `dependencyManager` tracks what the Markdown/front-matter parser touches; each `pageOutput.dependencyManagerOutput` tracks what the template execution touches. These are checked separately so format-specific invalidation is possible.
- **`GenghisKhan`**: a sentinel identity that compares equal to everything — used as a nuclear option when invalidation scope is unknowable (i18n, render hooks, mass eviction).
- **`WhatChanged.needsPagesAssembly`**: the gating flag that controls whether the full page tree walk in `assemble` runs. Only content-component changes set it; template/asset/data changes skip straight to the cache GC and render.
