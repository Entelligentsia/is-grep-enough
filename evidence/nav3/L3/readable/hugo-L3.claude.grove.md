# hugo · L3 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **hugo** (go) @ `d15baf53a`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | hugo (go) · L3 |
| pinned source | `d15baf53a91372843c45eef7eb5b87c25a4b6bf1` |
| status | completed |
| engagement | `grove_tools = 43` (gate: > 0 → ✓ used its capability) |
| turns | 46 |
| wall clock | 181 s |
| context (peak) | 917,500 tokens |
| cost (billed) | $0.6375 |
| &nbsp;&nbsp;↳ token split | in 36 · out 9,598 · cache-create 38,151 · cache-read 879,313 |
| tool calls | 45 (mcp__grove__source×24, mcp__grove__symbols×13, mcp__grove__outline×6, ToolSearch×1, Bash×1) |
| evidence | `evidence/nav3/L3/raw/hugo-L3.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to follow what happens from invoking a Hugo build on the command line all the way to a single page being rendered and written to disk. I'm interested in how the build command reaches the site builder, how the build is split into its lifecycle phases, how the render phase drives per-page rendering, how a layout template is chosen for a page, and how the chosen template is finally executed and its result written out. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll trace the full pipeline using grove for structural lookups, loading the tools first.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)`

💬 Let me explore the entry point and commands package in parallel.

&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/hugo/main.go)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/hugo/commands/hugo.go)`
&nbsp;&nbsp;▸ `mcp__grove__source(main)`
&nbsp;&nbsp;▸ `Bash(ls /home/bench/repos/hugo/commands/)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/hugo/commands/commands.go)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/hugo/commands/hugobuilder.go)`

💬 Good structure. Let me read the key orchestration methods in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(go:commands/commands.go#Run@71)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:commands/hugobuilder.go#build@410)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:commands/hugobuilder.go#fullBuild@559)`

💬 Now let me follow `buildSites` and explore the hugolib build entry point.

&nbsp;&nbsp;▸ `mcp__grove__source(go:commands/hugobuilder.go#buildSites@440)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(Build)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/hugo/hugolib/hugo_sites_build.go)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/hugo_sites_build.go#Build@64)`

💬 The lifecycle is clear. Now let me read `process`, `assemble`, and `render` to see what each phase does.

&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/hugo_sites_build.go#process@283)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/hugo_sites_build.go#assemble@302)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/hugo_sites_build.go#render@399)`

💬 Now let me find `Site.render` (the per-site one) and `renderPages`.

&nbsp;&nbsp;▸ `mcp__grove__symbols(render)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(renderPages)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/site.go#render@1787)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/site_render.go#renderPages@71)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/hugo/hugolib/site_render.go)`

💬 Now let me read the `pageRenderer` goroutine — this is where per-page work happens.

&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/site_render.go#pageRenderer@123)`

💬 Now let me find `resolveTemplate` and `renderAndWritePage`.

&nbsp;&nbsp;▸ `mcp__grove__symbols(resolveTemplate)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(renderAndWritePage)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/page.go#resolveTemplate@630)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/site.go#renderAndWritePage@1647)`

💬 Now let me trace the template lookup, `renderForTemplate`, and `publisher.Publish` in parallel.

&nbsp;&nbsp;▸ `mcp__grove__symbols(LookupPagesLayout)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(renderForTemplate)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(Publish)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:tpl/tplimpl/templatestore.go#LookupPagesLayout@584)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/site.go#renderForTemplate@1743)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:publisher/publisher.go#Publish@94)`

💬 Two more pieces: the template matching algorithm and `ExecuteWithContext`.

&nbsp;&nbsp;▸ `mcp__grove__symbols(findBestMatchWalkPath)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(ExecuteWithContext)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:tpl/tplimpl/templatestore.go#findBestMatchWalkPath@858)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:tpl/tplimpl/templatestore.go#ExecuteWithContext@503)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(ExecuteWithContextAndKey)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(compareDescriptors)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:tpl/tplimpl/templatestore.go#ExecuteWithContextAndKey@507)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:tpl/tplimpl/templatedescriptor.go#compareDescriptors@66)`

💬 Last two pieces: how the page builds its template descriptor, and what `processFull` does.

&nbsp;&nbsp;▸ `mcp__grove__symbols(GetInternalTemplateBasePathAndDescriptor)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/hugo_sites_build.go#processFull@1274)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/page.go#GetInternalTemplateBasePathAndDescriptor@616)`
&nbsp;&nbsp;▸ `mcp__grove__source(go:hugolib/hugo_sites_build.go#processFiles@1346)`

💬 I now have everything needed for a complete walkthrough. Here it is:

---

## Hugo build pipeline: CLI to disk

### 1. CLI entry point

**`main.go:26`** — `main()` calls `commands.Execute(os.Args[1:])`. That's all it does.

The CLI is built on **simplecobra**. `newExec()` in `commands/commands.go:23` wires the root command, which embeds a `hugoBuilder`. When the user types `hugo` (no subcommand) it hits:

**`commands/commands.go:71` — `hugoBuildCommand.Run`**
```go
func (c *hugoBuildCommand) Run(...) error {
    return c.rootCmd.Run(ctx, cd, args)
}
```
Which delegates to **`hugobuilder.go:410` — `hugoBuilder.build`**: sets up any profiling, then calls `fullBuild(false)`.

---

### 2. `fullBuild`: static copy + site build in parallel

**`hugobuilder.go:559` — `hugoBuilder.fullBuild`**

Launches two goroutines concurrently (serialized only if `cleanDestinationDir` is set):

- `copyStatic()` — mirrors `static/` into `public/`
- `buildSites()` — the real build

**`hugobuilder.go:440` — `buildSites`** gets (or creates) the `HugoSites` instance and calls:
```go
h.Build(hugolib.BuildCfg{NoBuildLock: noBuildLock})
```

---

### 3. `HugoSites.Build`: the main lifecycle

**`hugo_sites_build.go:64`** — this is the master sequencer. After setup (build lock, error collector, metrics reset) it runs four named phases in order, each timed and logged via `logg.TimeTrackf`:

```
process  →  assemble  →  render  →  renderDeferred  →  postProcess
```

#### Phase 1 — `process` (`hugo_sites_build.go:283`)

For a fresh build routes to **`processFull` → `processFiles`** (`line 1274/1346`), which creates a `pagesCollector` and calls `Collect()`. This reads every content file from the virtual FS (`hugofs`), parses frontmatter and body, and populates `pageMap` — the radix-tree content store — with raw `pageState` nodes.

#### Phase 2 — `assemble` (`hugo_sites_build.go:302`)

Creates one `sitePagesAssembler` per site, then runs three passes:

1. **`createAllPages()`** — instantiates all page nodes in the tree from the populated `pageMap`.
2. **`assemblePagesStep1()`** — parallel per-site: resolves dates, cascade, section metadata.
3. **`assemblePagesStep2()`** — serial: wires up taxonomy terms, cross-site relations.
4. **`assemblePagesStepFinal()`** — initialises `renderFormats` for each site (which output formats each page will be rendered into — HTML, RSS, JSON, etc.).

Between each pass, any identity changes (e.g. lastMod bubbling up) are drained via `resolveAndClearStateForIdentities` so the right pages are marked dirty.

#### Phase 3 — `render` (`hugo_sites_build.go:399`)

Outer loop over **sites × output formats**. For each combination calls `preparePagesForRender` on all sites (sets per-output data), then:
```go
s.render(siteRenderContext)   // full build
// or
s.renderPages(siteRenderContext) // partial re-render
```

After `render`, the build writes `buildStats`, then runs **`renderDeferred`** for any templates that were deferred during the main pass, then **`postProcess`** for resource pipelines and post-build transforms.

---

### 4. `Site.render` → `renderPages`: the page worker pool

**`site.go:1787` — `Site.render`** is thin — clears cached page state then calls `renderPages`.

**`site_render.go:71` — `Site.renderPages`**

Spins up `N = config.GetNumWorkerMultiplier()` worker goroutines. A walker traverses `s.pageMap.treePages` (the radix tree of content nodes) and feeds every `*pageState` that passes `cfg.shouldRender()` into a buffered `pages` channel. Each worker runs `pageRenderer`.

---

### 5. `pageRenderer`: per-page work

**`site_render.go:123` — `pageRenderer`** consumes from the `pages` channel. For each page:

1. If `p.m.pageConfig.Build.PublishResources` — render associated page resources.
2. If alias redirects are enabled — call `renderAliasesForPage`.
3. Call **`p.resolveTemplate()`** — template lookup (below).
4. If no template found — log and skip.
5. Call **`s.renderAndWritePage(..., templ)`** — execute + write (below).
6. If the page has a paginator — call `renderPaginator` for subsequent pages.

---

### 6. Template selection: `resolveTemplate` → `LookupPagesLayout`

**`page.go:616` — `pageOutput.GetInternalTemplateBasePathAndDescriptor`**

Builds the query inputs from the page's own state:
```go
base := p.PathInfo().BaseReTyped(p.m.pageConfig.Type) // content path, retyped by front-matter `type:`
TemplateDescriptor{
    Kind:           p.Kind(),           // "page", "home", "section", "taxonomy", …
    LayoutFromUser: p.Layout(),         // front-matter `layout:` if set
    OutputFormat:   f.Name,             // "html", "rss", "json", …
    MediaType:      f.MediaType.Type,
    IsPlainText:    f.IsPlainText,
}
```

**`page.go:630` — `pageState.resolveTemplate`** wraps this into a `TemplateQuery{Path: base, Category: CategoryLayout, Sites: siteVector, Desc: …}` and calls:

**`tpl/tplimpl/templatestore.go:584` — `TemplateStore.LookupPagesLayout`** — two-phase match:

**Phase 1 — content path walk** (`findBestMatchWalkPath`, line 858):  
Walks the radix tree (`treeMain`) upward from the full content path toward the root — so a page at `posts/2024/my-post` tries nodes at that path, then `posts/2024`, then `posts`, then root. At each level it scores every `CategoryLayout` candidate using **`compareDescriptors`** (`templatedescriptor.go:66`):

- Hard reject if `LayoutFromUserMustMatch` and the template's declared layout doesn't match.
- `doCompare` assigns a weighted score across: kind match, explicit layout name match, output format match, media type match.
- Also factors in **distance** (how many path segments away from the content file the template lives) — closer wins.
- Keeps a running `bestMatch`.

**Phase 2 — baseof lookup** (`findBestMatchBaseof`):  
If the winner is not `noBaseOf`, the same radix-walk is repeated to find the best-matching `baseof.html` (or `baseof.<outputformat>.html`) to use as the base template.

Returns `*TemplInfo` — a handle that carries both the inner template and its baseof.

---

### 7. Template execution: `renderAndWritePage` → `ExecuteWithContext`

**`site.go:1647` — `renderAndWritePage`**

1. Fetches a pooled `bytes.Buffer` (`bp.GetBuffer()`).
2. Calls `s.TemplateStore.PrepareTopLevelRenderCtx(ctx, p)` — installs the page as the top-level dot.
3. Calls **`renderForTemplate`** (`site.go:1743`):
   ```go
   s.GetTemplateStore().ExecuteWithContext(ctx, templ, renderBuffer, d)
   ```

**`templatestore.go:507` — `ExecuteWithContextAndKey`**

- Pushes a `CurrentTemplateInfo` frame onto `ctx` (parent/level chain — template call stack, capped at depth 999 to catch infinite recursion).
- Records a metrics timer if `Metrics` is configured.
- Calls the inner executer:
  ```go
  t.storeSite.executer.ExecuteWithContext(ctx, ti, wr, data)
  ```
  The executer is Go's standard `html/template` engine (or `text/template` for plain-text output formats). This recursively expands partials, shortcodes, and `{{ block }}` calls via the same `ExecuteWithContext` path — each nesting increments `level`.

The result accumulates in `renderBuffer`.

---

### 8. Write to disk: `publisher.Publish`

Back in `renderAndWritePage`, with `renderBuffer` full:

**`publisher/publisher.go:94` — `DestinationPublisher.Publish`**

1. **Transformer chain** (`createTransformerChain`): pipes the buffer through any applicable transforms — URL relativization/canonicalization, live-reload `<script>` injection, Hugo generator `<meta>` tag injection (home page only), RSS URL absolutization.
2. **Open output file**:
   ```go
   f, err := helpers.OpenFileForWriting(p.fs, d.TargetPath)
   ```
   `p.fs` is the publish filesystem (an afero layer rooted at `public/`). `d.TargetPath` is already the final relative path, e.g. `posts/2024/my-post/index.html`.
3. If `htmlElementsCollector` is active (for CSS purging / build stats), wraps `f` in `io.MultiWriter` to tee into the collector.
4. `io.Copy(w, src)` — streams the transformed buffer to disk.
5. Atomically increments `*statCounter` (the page count shown in the build summary).

---

### Summary map

```
main()
└─ commands.Execute
   └─ hugoBuildCommand.Run
      └─ hugoBuilder.build
         └─ hugoBuilder.fullBuild
            ├─ copyStatic()                          (goroutine)
            └─ buildSites()                          (goroutine)
               └─ HugoSites.Build(BuildCfg)
                  ├─ process        read content files → pageMap
                  ├─ assemble       build page tree, wire taxonomy, set renderFormats
                  ├─ render
                  │  └─ (sites × output formats)
                  │     └─ Site.render
                  │        └─ Site.renderPages       worker pool over pageMap
                  │           └─ pageRenderer        per page:
                  │              ├─ resolveTemplate
                  │              │  └─ TemplateStore.LookupPagesLayout
                  │              │     ├─ findBestMatchWalkPath  (radix walk + score)
                  │              │     └─ findBestMatchBaseof
                  │              └─ renderAndWritePage
                  │                 ├─ renderForTemplate
                  │                 │  └─ ExecuteWithContextAndKey
                  │                 │     └─ html/template.Execute → renderBuffer
                  │                 └─ publisher.Publish
                  │                    ├─ transformer chain (URLs, live-reload, …)
                  │                    └─ OpenFileForWriting → io.Copy → public/
                  ├─ renderDeferred  deferred template passes
                  └─ postProcess     resource post-processing
```


## Final answer

_Result event — success, 181 s, 46 turns._

I now have everything needed for a complete walkthrough. Here it is:

---

## Hugo build pipeline: CLI to disk

### 1. CLI entry point

**`main.go:26`** — `main()` calls `commands.Execute(os.Args[1:])`. That's all it does.

The CLI is built on **simplecobra**. `newExec()` in `commands/commands.go:23` wires the root command, which embeds a `hugoBuilder`. When the user types `hugo` (no subcommand) it hits:

**`commands/commands.go:71` — `hugoBuildCommand.Run`**
```go
func (c *hugoBuildCommand) Run(...) error {
    return c.rootCmd.Run(ctx, cd, args)
}
```
Which delegates to **`hugobuilder.go:410` — `hugoBuilder.build`**: sets up any profiling, then calls `fullBuild(false)`.

---

### 2. `fullBuild`: static copy + site build in parallel

**`hugobuilder.go:559` — `hugoBuilder.fullBuild`**

Launches two goroutines concurrently (serialized only if `cleanDestinationDir` is set):

- `copyStatic()` — mirrors `static/` into `public/`
- `buildSites()` — the real build

**`hugobuilder.go:440` — `buildSites`** gets (or creates) the `HugoSites` instance and calls:
```go
h.Build(hugolib.BuildCfg{NoBuildLock: noBuildLock})
```

---

### 3. `HugoSites.Build`: the main lifecycle

**`hugo_sites_build.go:64`** — this is the master sequencer. After setup (build lock, error collector, metrics reset) it runs four named phases in order, each timed and logged via `logg.TimeTrackf`:

```
process  →  assemble  →  render  →  renderDeferred  →  postProcess
```

#### Phase 1 — `process` (`hugo_sites_build.go:283`)

For a fresh build routes to **`processFull` → `processFiles`** (`line 1274/1346`), which creates a `pagesCollector` and calls `Collect()`. This reads every content file from the virtual FS (`hugofs`), parses frontmatter and body, and populates `pageMap` — the radix-tree content store — with raw `pageState` nodes.

#### Phase 2 — `assemble` (`hugo_sites_build.go:302`)

Creates one `sitePagesAssembler` per site, then runs three passes:

1. **`createAllPages()`** — instantiates all page nodes in the tree from the populated `pageMap`.
2. **`assemblePagesStep1()`** — parallel per-site: resolves dates, cascade, section metadata.
3. **`assemblePagesStep2()`** — serial: wires up taxonomy terms, cross-site relations.
4. **`assemblePagesStepFinal()`** — initialises `renderFormats` for each site (which output formats each page will be rendered into — HTML, RSS, JSON, etc.).

Between each pass, any identity changes (e.g. lastMod bubbling up) are drained via `resolveAndClearStateForIdentities` so the right pages are marked dirty.

#### Phase 3 — `render` (`hugo_sites_build.go:399`)

Outer loop over **sites × output formats**. For each combination calls `preparePagesForRender` on all sites (sets per-output data), then:
```go
s.render(siteRenderContext)   // full build
// or
s.renderPages(siteRenderContext) // partial re-render
```

After `render`, the build writes `buildStats`, then runs **`renderDeferred`** for any templates that were deferred during the main pass, then **`postProcess`** for resource pipelines and post-build transforms.

---

### 4. `Site.render` → `renderPages`: the page worker pool

**`site.go:1787` — `Site.render`** is thin — clears cached page state then calls `renderPages`.

**`site_render.go:71` — `Site.renderPages`**

Spins up `N = config.GetNumWorkerMultiplier()` worker goroutines. A walker traverses `s.pageMap.treePages` (the radix tree of content nodes) and feeds every `*pageState` that passes `cfg.shouldRender()` into a buffered `pages` channel. Each worker runs `pageRenderer`.

---

### 5. `pageRenderer`: per-page work

**`site_render.go:123` — `pageRenderer`** consumes from the `pages` channel. For each page:

1. If `p.m.pageConfig.Build.PublishResources` — render associated page resources.
2. If alias redirects are enabled — call `renderAliasesForPage`.
3. Call **`p.resolveTemplate()`** — template lookup (below).
4. If no template found — log and skip.
5. Call **`s.renderAndWritePage(..., templ)`** — execute + write (below).
6. If the page has a paginator — call `renderPaginator` for subsequent pages.

---

### 6. Template selection: `resolveTemplate` → `LookupPagesLayout`

**`page.go:616` — `pageOutput.GetInternalTemplateBasePathAndDescriptor`**

Builds the query inputs from the page's own state:
```go
base := p.PathInfo().BaseReTyped(p.m.pageConfig.Type) // content path, retyped by front-matter `type:`
TemplateDescriptor{
    Kind:           p.Kind(),           // "page", "home", "section", "taxonomy", …
    LayoutFromUser: p.Layout(),         // front-matter `layout:` if set
    OutputFormat:   f.Name,             // "html", "rss", "json", …
    MediaType:      f.MediaType.Type,
    IsPlainText:    f.IsPlainText,
}
```

**`page.go:630` — `pageState.resolveTemplate`** wraps this into a `TemplateQuery{Path: base, Category: CategoryLayout, Sites: siteVector, Desc: …}` and calls:

**`tpl/tplimpl/templatestore.go:584` — `TemplateStore.LookupPagesLayout`** — two-phase match:

**Phase 1 — content path walk** (`findBestMatchWalkPath`, line 858):  
Walks the radix tree (`treeMain`) upward from the full content path toward the root — so a page at `posts/2024/my-post` tries nodes at that path, then `posts/2024`, then `posts`, then root. At each level it scores every `CategoryLayout` candidate using **`compareDescriptors`** (`templatedescriptor.go:66`):

- Hard reject if `LayoutFromUserMustMatch` and the template's declared layout doesn't match.
- `doCompare` assigns a weighted score across: kind match, explicit layout name match, output format match, media type match.
- Also factors in **distance** (how many path segments away from the content file the template lives) — closer wins.
- Keeps a running `bestMatch`.

**Phase 2 — baseof lookup** (`findBestMatchBaseof`):  
If the winner is not `noBaseOf`, the same radix-walk is repeated to find the best-matching `baseof.html` (or `baseof.<outputformat>.html`) to use as the base template.

Returns `*TemplInfo` — a handle that carries both the inner template and its baseof.

---

### 7. Template execution: `renderAndWritePage` → `ExecuteWithContext`

**`site.go:1647` — `renderAndWritePage`**

1. Fetches a pooled `bytes.Buffer` (`bp.GetBuffer()`).
2. Calls `s.TemplateStore.PrepareTopLevelRenderCtx(ctx, p)` — installs the page as the top-level dot.
3. Calls **`renderForTemplate`** (`site.go:1743`):
   ```go
   s.GetTemplateStore().ExecuteWithContext(ctx, templ, renderBuffer, d)
   ```

**`templatestore.go:507` — `ExecuteWithContextAndKey`**

- Pushes a `CurrentTemplateInfo` frame onto `ctx` (parent/level chain — template call stack, capped at depth 999 to catch infinite recursion).
- Records a metrics timer if `Metrics` is configured.
- Calls the inner executer:
  ```go
  t.storeSite.executer.ExecuteWithContext(ctx, ti, wr, data)
  ```
  The executer is Go's standard `html/template` engine (or `text/template` for plain-text output formats). This recursively expands partials, shortcodes, and `{{ block }}` calls via the same `ExecuteWithContext` path — each nesting increments `level`.

The result accumulates in `renderBuffer`.

---

### 8. Write to disk: `publisher.Publish`

Back in `renderAndWritePage`, with `renderBuffer` full:

**`publisher/publisher.go:94` — `DestinationPublisher.Publish`**

1. **Transformer chain** (`createTransformerChain`): pipes the buffer through any applicable transforms — URL relativization/canonicalization, live-reload `<script>` injection, Hugo generator `<meta>` tag injection (home page only), RSS URL absolutization.
2. **Open output file**:
   ```go
   f, err := helpers.OpenFileForWriting(p.fs, d.TargetPath)
   ```
   `p.fs` is the publish filesystem (an afero layer rooted at `public/`). `d.TargetPath` is already the final relative path, e.g. `posts/2024/my-post/index.html`.
3. If `htmlElementsCollector` is active (for CSS purging / build stats), wraps `f` in `io.MultiWriter` to tee into the collector.
4. `io.Copy(w, src)` — streams the transformed buffer to disk.
5. Atomically increments `*statCounter` (the page count shown in the build summary).

---

### Summary map

```
main()
└─ commands.Execute
   └─ hugoBuildCommand.Run
      └─ hugoBuilder.build
         └─ hugoBuilder.fullBuild
            ├─ copyStatic()                          (goroutine)
            └─ buildSites()                          (goroutine)
               └─ HugoSites.Build(BuildCfg)
                  ├─ process        read content files → pageMap
                  ├─ assemble       build page tree, wire taxonomy, set renderFormats
                  ├─ render
                  │  └─ (sites × output formats)
                  │     └─ Site.render
                  │        └─ Site.renderPages       worker pool over pageMap
                  │           └─ pageRenderer        per page:
                  │              ├─ resolveTemplate
                  │              │  └─ TemplateStore.LookupPagesLayout
                  │              │     ├─ findBestMatchWalkPath  (radix walk + score)
                  │              │     └─ findBestMatchBaseof
                  │              └─ renderAndWritePage
                  │                 ├─ renderForTemplate
                  │                 │  └─ ExecuteWithContextAndKey
                  │                 │     └─ html/template.Execute → renderBuffer
                  │                 └─ publisher.Publish
                  │                    ├─ transformer chain (URLs, live-reload, …)
                  │                    └─ OpenFileForWriting → io.Copy → public/
                  ├─ renderDeferred  deferred template passes
                  └─ postProcess     resource post-processing
```

