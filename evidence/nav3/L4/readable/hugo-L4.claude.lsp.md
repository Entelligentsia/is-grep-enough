# transcript: I'm studying how Hugo, given a page, decides which of the many layout templates under layouts/ should render it — the so-called layout lookup rules. I need t...


💬 I'll load the LSP tool and explore the template lookup system systematically.
  ▸ ToolSearch(select:LSP)

💬 Let me search for the key symbols in the template lookup system in parallel.
  ▸ LSP(TemplateDescriptor)
  ▸ LSP(layoutHandler)
  ▸ LSP(templateStore)
  ▸ LSP(LayoutDescriptor)

💬 Let me find the relevant files first.
  ▸ Bash(find /home/bench/repos/hugo/tpl -type f -name "*.go" | head -30 && find /home/bench/repos/hugo -type f -name "*.go" | xargs grep -l "LayoutDescriptor\|Templa...)

💬 Found the core files. Let me get the symbol outlines of all key files in parallel.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/tpl/tplimpl/templatedescriptor.go","line":1,"character":1})
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/tpl/tplimpl/templatestore.go","line":1,"character":1})
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/tpl/tplimpl/templates.go","line":1,"character":1})
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/tpl/tplimpl/legacy.go","line":1,"character":1})

💬 Now let me read the key sections of each file in parallel — the descriptor comparison, the lookup/scoring, the store walking, and baseof resolution.
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatedescriptor.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)

💬 Now let me read the core lookup logic, the `toKeyCategoryAndDescriptor` method, and the baseof resolution.
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)

💬 Now let me read the `isBetter` scoring logic, the `toKeyCategoryAndDescriptor` key builder, and the `findBestMatchBaseof` method.
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)

💬 Now let me read the `prepareTemplates` and `insertTemplate2` methods to understand how baseof is applied upfront.
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)

💬 Finally, let me read the `applyBaseTemplate` method to understand how baseof is merged with its overlay.
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templates.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templates.go)

💬 I now have all the pieces. Let me put the full picture together.  ---  ## Hugo's Layout Lookup System — How the Pieces Fit Together  The system lives almost ...

──────── RESULT (success, 154364ms, 24 turns) ────────
I now have all the pieces. Let me put the full picture together.

---

## Hugo's Layout Lookup System — How the Pieces Fit Together

The system lives almost entirely in `tpl/tplimpl/`. Four cooperating parts handle the full lifecycle.

---

### 1. The Query Descriptor (`TemplateDescriptor`)

`templatedescriptor.go:25`

```go
type TemplateDescriptor struct {
    Kind               string  // page, home, section, taxonomy, term
    LayoutFromTemplate string  // list, single, all, mycustomlayout
    LayoutFromUser     string  // layout set in front matter
    OutputFormat       string  // html, rss, json, …
    MediaType          string  // text/html, text/plain, …
    SitesHash          uint64  // language/sites-matrix identity
    Variant1, Variant2 string  // render-hook variants (e.g. "link", "go")
    IsPlainText        bool
    ...
}
```

This struct plays **double duty**: it describes what a *page* needs (a query), and it describes what a *template file* provides (a storage key). Every template file on disk and every render request for a page both produce one of these.

When a page request comes in the descriptor is built from:
- `Kind` — the page kind
- `LayoutFromTemplate` — defaults to `"single"` for `KindPage`, `"list"` for everything else; normalised by `TemplateQuery.init()` at `templatestore.go:407`
- `LayoutFromUser` — the front-matter `layout` field
- `OutputFormat` / `MediaType` — the current output format being rendered
- `SitesHash` — which site (language) is rendering

When a template *file* is indexed, `toKeyCategoryAndDescriptor()` (`templatestore.go:1783`) extracts the same fields from the file's path structure. The filename's output-format suffix, extension, kind segment, and `baseof` marker are all parsed to build this descriptor.

**Normalization** (`normalizeFromFile`, `templatestore.go:46`): after extraction, redundant fields are zeroed out — e.g. if `LayoutFromTemplate == OutputFormat`, the layout is cleared; if `LayoutFromTemplate == Kind`, it is cleared.

---

### 2. The Template Store (`TemplateStore`)

`templatestore.go:434`

The store holds two radix trees:

```go
treeMain       *doctree.SimpleTree[map[nodeKey]*TemplInfo]
treeShortcodes *doctree.SimpleTree[map[string]map[TemplateDescriptor]*TemplInfo]
```

`treeMain` is indexed by **directory path** (the page's content path, or the template's directory). Each node holds a `map[nodeKey]*TemplInfo` where `nodeKey = {Category, TemplateDescriptor}`. Multiple templates with the same directory key but different descriptors (different output formats, kinds, etc.) all live in the same map at that tree node.

The **category** (`templatestore.go:64`) tags each template's role: `CategoryLayout`, `CategoryBaseof`, `CategoryMarkup`, `CategoryShortcode`, `CategoryPartial`.

**Key derivation** happens in `toKeyCategoryAndDescriptor` (`templatestore.go:1783`):
- The template's directory path becomes the tree key.
- `/_default` is stripped so `layouts/_default/` becomes the root node `""`.
- Shortcode paths are split at `/_shortcodes/` to separate the context key from the name.
- Render-hook paths strip `/_markup` and decode `render-<variant1>[-<variant2>]` into `Variant1`/`Variant2`.

**Initialization** in `NewStore` (`templatestore.go:116`) runs a fixed pipeline:

```
insertTemplates → insertEmbedded → parseTemplates
  → extractInlinePartials → transformTemplates
  → createPrototypes → prepareTemplates
```

`parseTemplates` (`templatestore.go:1630`) is the critical step where both parsing and baseof matching happen (see §4 below).

---

### 3. Scoring: How Candidates Are Compared

`templatedescriptor.go:66` and `templatestore.go:2143`

#### `weight` struct

```go
type weight struct {
    w1       int  // primary match score
    w2       int  // layout specificity group
    w3       int  // output-format/media-type bonus
    wsm      int  // sites-matrix precision
    distance int  // path distance (lower = closer to page)
}
```

#### `doCompare` — scoring one candidate

`templatedescriptor.go:100`. First it applies **hard gates** (any one fails → `weightNoMatch`):
- `other.IsPlainText && !this.IsPlainText` → reject (never render plain text into HTML)
- `other.Kind != "" && other.Kind != this.Kind` → reject
- `other.LayoutFromTemplate` set and not matching (either user custom layout or template layout) → reject
- Sites matrix mismatch → reject
- Output format mismatch with incompatible media type → reject
- Variant1/Variant2 mismatch → reject

Then it accumulates `w1` from matched fields with fixed weights:

| Field matched | Points |
|---|---|
| `Kind` | +5 |
| Standard layout (`single`/`list`) | +4 |
| `all` wildcard layout | +2 |
| Custom user layout (`LayoutFromUser`) | +6 |
| `OutputFormat` | +4 |
| `MediaType` | +1 |
| `Variant1` | +6 |
| `Variant2` | +4 |
| Sites matrix | +1 (or weighted) |
| Any match (baseline) | +1 |

`w2` is set to `weight2Group2` (2) if a custom layout matched, or `weight2Group1` (1) for kind/standard layout — it distinguishes how specific the layout axis is.

#### `bestMatch.isBetter` — the tiebreaker

`templatestore.go:2046`. Called for every candidate. Decision order:

1. If no current best → accept anything.
2. If new weight is non-positive (`w1 <= 0`) and current is positive → reject.
3. **Embedded vs user**: for non-markup categories, user-provided templates beat embedded ones unconditionally, but a more specific embedded markup template can beat a less specific one.
4. If new candidate is **closer** (lower `distance`): accept unless it has a lower `wsm`, `w2`, or `w3` (a closer-but-less-specific template loses to a more specific one further up the tree).
5. If same or farther distance: reject if `w1` is lower.
6. On perfectly **equal weights**: user > embedded, then lower `distance`, then alphabetically smaller path as tiebreaker.

---

### 4. The Walk — `LookupPagesLayout`

`templatestore.go:584`

```go
func (s *TemplateStore) LookupPagesLayout(q TemplateQuery) *TemplInfo {
    q.init()           // normalize descriptor (defaults, kind cleanup)
    key := s.key(q.Path)  // derive tree key from page path
    slashCountKey := strings.Count(key, "/")

    best1 := s.getBest()
    s.findBestMatchWalkPath(q, key, slashCountKey, best1)  // Phase 1: find overlay
    if best1.w.w1 <= 0 { return nil }

    m := best1.templ
    if m.noBaseOf { return m }     // no baseof needed (e.g. partials, or already applied)

    best1.reset()
    m.findBestMatchBaseof(s, q.Desc, q.Sites, key, slashCountKey, best1)  // Phase 2: pick baseof variant
    if best1.w.w1 <= 0 { return nil }

    return best1.templ   // this is the pre-merged overlay+base
}
```

**Phase 1** — `findBestMatchWalkPath` (`templatestore.go:858`):

Uses `treeMain.WalkPath(k1, ...)` — a radix-tree walk from the page's specific path up to the root. At each node visited, the slash-count difference between the page path and the node key is the **distance**. Every template in the node map whose `Category` matches the query is scored. The closest+highest-scoring one wins as the overlay.

**Phase 2** — `findBestMatchBaseof` (`templatestore.go:328`):

Once the winning overlay is known, the same path-walk pattern runs *within* the overlay's pre-built `baseVariants` tree. Each entry in `baseVariants` is a `TemplWithBaseApplied` (overlay + base already merged). The descriptor of the **base** template drives scoring. The closest+best-matching merged template is returned.

The returned `TemplInfo.Template` is a ready-to-execute Go template — no further cloning or parsing is needed at render time.

---

### 5. Baseof Resolution — Pre-computation at Build Time

`templates.go:143`, `templatestore.go:1644`

Hugo used to apply base templates lazily (during rendering), which required careful clone management. The current design does it **upfront** during `parseTemplates()`.

**Detection**: `needsBaseTemplate()` (`templates.go:225`) inspects the raw template source. If the first non-comment token is `{{define ...}}`, the template needs a base. The regex `^{{-?\s*define` handles trim-whitespace variants.

**Candidate collection**: `FindAllBaseTemplateCandidates()` (`templatestore.go:475`) walks the entire `treeMain`, collecting every `CategoryBaseof` template whose descriptor is compatible (using `compareDescriptors` + `isKindInLayout`). This returns all *possible* baseof files — not just the best one.

**Merging** — `applyBaseTemplate()` (`templates.go:143`):

For each (overlay, base-candidate) pair:

1. Clone the shared parse namespace (`parseHTML` or `parseText`).
2. Parse the **base** content first into the clone — this establishes the outer structure.
3. Parse the **overlay** content second — `{{define}}` blocks override named blocks in the base.
4. Wrap in `TemplWithBaseApplied{Overlay, Base, Template}`.
5. Store in `overlay.baseVariants` — a `SimpleTree[map[TemplateDescriptor]*TemplWithBaseApplied]` keyed by the *base template's directory path* and indexed by the *base's descriptor*.

This tree is what `findBestMatchBaseof` walks in Phase 2: same path-walk + distance + score, but now over baseof variants instead of plain templates.

---

### Data Flow Summary

```
Page render request
        │
        ▼
   TemplateQuery{Path, Desc{Kind, Layout, OutputFormat, …}, Sites}
        │
        ▼
   LookupPagesLayout
        │
        ├─ Phase 1: findBestMatchWalkPath
        │       treeMain.WalkPath(pageKey → root)
        │       for each node: compareDescriptors → weight{w1,w2,w3,wsm,distance}
        │       bestMatch.isBetter picks closest+highest-scoring overlay
        │
        └─ Phase 2: findBestMatchBaseof  (skipped if noBaseOf)
                overlay.baseVariants.WalkPath(pageKey → root)
                same scoring over pre-merged {overlay+base} entries
                returns TemplInfo.Template = ready Go template
```

The key design decisions are: (a) `distance` in the weight allows *closer* templates to win over *more specifically described* ones further up — e.g. `layouts/posts/single.html` beats `layouts/single.html` even if the latter has a better `w1`; (b) baseof pre-computation eliminates all runtime cloning; (c) the `nodeKey = {Category, TemplateDescriptor}` map at each tree node lets multiple templates with different output formats or kinds live at the same directory level without conflict.
