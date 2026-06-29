# transcript: I'm studying how Hugo, given a page, decides which of the many layout templates under layouts/ should render it — the so-called layout lookup rules. I need t...


💬 Let me map the template lookup system using grove's structural tools.
  ▸ ToolSearch(select:mcp__grove__map,mcp__grove__symbols,mcp__grove__outline,mcp__grove__source,mcp__grove__callers,mcp__grove__definition)

💬 Let me explore the template system structure in parallel — mapping `tpl/tplimpl` and searching for layout/lookup related symbols.
  ▸ mcp__grove__map({"dir":"tpl/tplimpl"})
  ▸ Bash(find /home/bench/repos/hugo/tpl/tplimpl -name "*.go" | sort)

💬 The key files are clear. Let me outline all of them in parallel.
  ▸ mcp__grove__outline({"file":"tpl/tplimpl/templatedescriptor.go"})
  ▸ mcp__grove__outline({"file":"tpl/tplimpl/templatestore.go"})
  ▸ mcp__grove__outline({"file":"tpl/tplimpl/templates.go"})
  ▸ mcp__grove__outline({"file":"tpl/tplimpl/template_info.go"})

💬 Now I'll read the key load-bearing symbols in parallel — the descriptor/scoring logic, the query struct, the lookup entry point, and the walk/baseof resolution.
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatedescriptor.go#TemplateDescriptor@25"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatedescriptor.go#doCompare@100"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#TemplateQuery@387"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#TemplateStore@434"})

💬 Now read the lookup entry point, walk, scoring, and baseof resolution in parallel.
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#LookupPagesLayout@584"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#findBestMatchWalkPath@858"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#findBestMatchGet@824"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#findBestMatchBaseof@328"})

💬 Now read the `bestMatch` logic, `weight` struct, `TemplInfo` struct, query init, and how a page path becomes a descriptor key.
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#isBetter@2046"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#weight@2143"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#TemplInfo@220"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#init@407"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#toKeyCategoryAndDescriptor@1783"})

💬 Almost complete. Let me grab the final pieces: `normalizeFromFile`, `TemplWithBaseApplied`, the Category constants, and `needsBaseTemplate`.
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatedescriptor.go#normalizeFromFile@46"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#TemplWithBaseApplied@377"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templates.go#needsBaseTemplate@225"})
  ▸ mcp__grove__source({"id":"go:tpl/tplimpl/templatestore.go#updateValues@2108"})
  ▸ Bash(grep -n "Category\|CategoryLayout\|CategoryBaseof\|CategoryShortcode\|CategoryPartial\|CategoryMarkup\|CategoryHugo\|CategoryServer\|SubCategoryEmbedded\|lay...)

💬 I now have everything needed to give a complete, precise picture. Here's how the pieces fit together.  ---  ## Hugo's Layout Lookup: How the Pieces Fit  ### ...

──────── RESULT (success, 142407ms, 26 turns) ────────
I now have everything needed to give a complete, precise picture. Here's how the pieces fit together.

---

## Hugo's Layout Lookup: How the Pieces Fit

### 1. The Descriptor — turning a page into a matchable query

**`TemplateDescriptor`** (`templatedescriptor.go:25`) is the shared vocabulary used for both sides of the match. A page produces one at query time; every template file produces one at insertion time.

Fields:
```
Kind               — page/home/section/taxonomy/term
LayoutFromTemplate — the layout implied by the template's filename (single, list, all, custom)
LayoutFromUser     — explicit .Layout from front matter (only on the query side)
OutputFormat       — rss, html, json, …
MediaType          — text/html, text/plain, …
Variant1/Variant2  — for render hooks (e.g. "link" or "codeblock"/"go")
IsPlainText        — whether the output format is plain text
```

**`TemplateQuery`** (`templatestore.go:387`) wraps a descriptor with the path to walk from, the category to look in, a site-variant matrix, and an optional `Consider` filter predicate.

**`TemplateQuery.init()`** (`templatestore.go:407`) normalises the query before any lookup: invalid or temporary kinds are cleared; and if `LayoutFromTemplate` wasn't explicitly set, it defaults to `"single"` for `KindPage` and `"list"` for everything else.

---

### 2. The Store — a two-level radix tree

`TemplateStore` (`templatestore.go:434`) holds two radix trees from the `doctree` package:

```
treeMain        SimpleTree[map[nodeKey]*TemplInfo]
treeShortcodes  SimpleTree[map[string]map[TemplateDescriptor]*TemplInfo]
```

**Each node in `treeMain` is a `map[nodeKey]*TemplInfo`**, where `nodeKey` embeds a `TemplateDescriptor`. A single directory path can have many templates mapped under different descriptors (different kinds, output formats, layouts, language-matrix bits).

**`toKeyCategoryAndDescriptor()`** (`templatestore.go:1783`) is what converts a template file path into its tree key and descriptor at insertion time:

1. Strips `/_default` prefix from the directory part → the tree key is just the content section path.
2. Derives `Category` from path type: `_partials/` → `CategoryPartial`, shortcodes directory → `CategoryShortcode`, `_markup/` → `CategoryMarkup`, `baseof` in name → `CategoryBaseof`, everything else → `CategoryLayout`.
3. Builds a `TemplateDescriptor` from path components: kind, layout, output format (from the identifier in the filename), media type (from extension).
4. Calls `normalizeFromFile()` to strip redundant values — e.g. if `LayoutFromTemplate == Kind` or `LayoutFromTemplate == OutputFormat`, it's cleared to `""`.

`CategoryLayout` and `CategoryBaseof` have the two lowest enum values; all others are higher. Templates with `category > CategoryLayout` get `noBaseOf = true` at insertion, meaning partials, shortcodes, and markup templates never go through baseof resolution.

---

### 3. The Lookup entry point — `LookupPagesLayout`

```
templatestore.go:584
```

```
LookupPagesLayout(q) *TemplInfo:
  q.init()
  key = s.key(q.Path)          // lowercase, normalised path
  findBestMatchWalkPath(q, key, slashCount, best)   // phase 1
  if no match → nil
  if match.noBaseOf → return match (partials/shortcodes)
  match.findBestMatchBaseof(s, q.Desc, q.Sites, key, slashCount, best)  // phase 2
  return best.templ
```

It runs in two distinct phases: find the best layout template, then find the best baseof for it.

---

### 4. The Walk — `findBestMatchWalkPath`

```
templatestore.go:858
```

`treeMain.WalkPath` is called with the page's key. The radix tree walks from most-specific to least-specific: first the exact directory path (e.g., `/posts/my-article`), then `/posts`, then `/`, then `""`. At each node it:

1. Checks `inPath(k1, k2)` — guards against partial prefix collisions in the radix tree.
2. Computes `distance = slashCount(page_key) − slashCount(node_key)` — a zero distance means the template lives in the exact same section as the page; larger means it's a parent/global template.
3. For every `(nodeKey, TemplInfo)` pair at this node: skips the wrong category and the `Consider` predicate, then calls `compareDescriptors` and asks `isBetter`.

---

### 5. Scoring — `doCompare`

```
templatedescriptor.go:100
```

**Hard rejections** (return `weightNoMatch` immediately):
- Kind mismatch (`other.Kind != "" && other.Kind != this.Kind`)
- Layout mismatch (respects the `"all"` wildcard which matches any layout)
- Sites-matrix mismatch (language/version/role)
- Output format mismatch *unless* the media types match (AMP-fallback logic: an AMP page can fall back to a plain HTML template when no AMP-specific one exists)
- Media type mismatch

**Additive weights** (`w1`) on a successful match:

| Matched dimension | w1 | group bonus |
|---|---|---|
| Kind | +5 | w2=1 |
| Custom layout (user-set in front matter) | +6 | w2=2 |
| Standard layout match (single/list) | +4 | w2=1 |
| `"all"` layout wildcard | +2 | w2=1 |
| Output format | +4 | w3+1 |
| Media type | +1 | w3+1 |
| Sites matrix | +1 | wsm=weight from matrix |
| Variant1 (render hook type) | +6 | — |
| Variant2 (render hook sub-type) | +4 | — |

The `weight` struct (`templatestore.go:2143`) is `{w1, w2, w3, wsm, distance}`:
- `w1` is the primary relevance score.
- `w2` separates custom-layout matches (w2=2) from standard/kind matches (w2=1) — it prevents a globally-placed custom layout from being beaten by a closer standard layout.
- `w3` counts output-format / media-type bonuses.
- `wsm` tracks language-matrix specificity.
- `distance` is path depth from page to template.

---

### 6. Comparing candidates — `isBetter`

```
templatestore.go:2046
```

The key tiebreaking order:

1. **Embedded vs user-provided**: user templates (`SubCategoryMain`) always beat embedded Hugo templates (`SubCategoryEmbedded`) unless the embedded template has a more specific descriptor (e.g. a render hook variant).
2. **Proximity wins — conditionally**: if the new candidate is *closer* (smaller `distance`), it wins *unless* the current best has a higher `w2`, `wsm`, or `w3` — this prevents a vague global template from beating a specific parent one just because it's nearer.
3. **Higher `w1` wins** when distance is the same or worse.
4. **Equal weights**: prefer user over embedded, then closer distance, then lexicographically smaller path.

---

### 7. Baseof resolution — `findBestMatchBaseof`

```
templatestore.go:328
```

Once the overlay template (the matched layout) is identified, if `!noBaseOf`:

- `TemplInfo` holds a `baseVariants *doctree.SimpleTree[map[TemplateDescriptor]*TemplWithBaseApplied]`, populated during `insertTemplates` with every `baseof.html` variant that is compatible with this overlay template.
- `TemplWithBaseApplied` (`templatestore.go:377`) groups three things: `Overlay` (*the layout template*), `Base` (*the baseof template*), and `Template` (*the pre-composed Go template that merges both via `{{ define }}` / `{{ block }}`*).
- `findBestMatchBaseof` walks this `baseVariants` tree using the *same page descriptor and path key*, but scores with `CategoryBaseof`. The same `compareDescriptors`/`isBetter` machinery picks the closest, most-specific baseof.
- `needsBaseTemplate()` (`templates.go:225`) detects whether a template's first non-comment action is a `{{ define … }}` block — that's the signal that the template is an overlay that needs a baseof rather than a standalone template.

---

### Data-flow summary

```
Page characteristics
        │
        ▼
  TemplateQuery { Path, Category, Sites, Desc{Kind, Layout, OutputFormat, MediaType, …} }
        │ init() normalises kind → layout default
        │
        ▼
  LookupPagesLayout
        │
        ├─ Phase 1: findBestMatchWalkPath
        │       WalkPath (deep → shallow in treeMain)
        │         for each node: compareDescriptors → weight
        │                        isBetter? → updateValues
        │       → best overlay TemplInfo
        │
        └─ Phase 2: findBestMatchBaseof   (skipped if noBaseOf)
                WalkPath on overlay.baseVariants (deep → shallow)
                  for each entry: compareDescriptors(CategoryBaseof) → weight
                                  isBetter? → updateValues
                → best TemplWithBaseApplied { Overlay, Base, Template }
                  Template is returned as the final executable template
```

The `TemplateStore` is the root organiser: it owns both trees, the `descriptorHandler` that scores comparisons, the `templateNamespace` that compiles Go `text/template` instances, and the pool of reusable `bestMatch` objects. The two lookup phases — layout then baseof — use identical scoring machinery; only the `Category` flag and the tree being walked differ.
