# transcript: I'm studying how Hugo, given a page, decides which of the many layout templates under layouts/ should render it — the so-called layout lookup rules. I need t...


  ▸ Agent(Hugo template layout lookup deep dive)  ⟶ subagent:
      ↳ Bash(find /home/bench/repos/hugo -type f -name "*.go" | grep -E "(tpl|layout|template|lookup|finder|descriptor)" | head -50)
      ↳ Bash(find /home/bench/repos/hugo/tpl/tplimpl -type f -name "*.go" 2>/dev/null)
      ↳ Bash(find /home/bench/repos/hugo/hugolib -type f -name "*.go" | grep -E "(layout|page|render)" | head -20)
      ↳ Read(/home/bench/repos/hugo/tpl/tplimpl/templatedescriptor.go)
      ↳ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
      ↳ Read(/home/bench/repos/hugo/tpl/tplimpl/template_info.go)
      ↳ Read(/home/bench/repos/hugo/tpl/tplimpl/templates.go)
      ↳ Bash(find /home/bench/repos/hugo/hugolib -type f -name "*render*.go" | head -10)
      ↳ Read(/home/bench/repos/hugo/hugolib/site_render.go)
      ↳ Bash(grep -r "LookupPagesLayout\|TemplateDescriptor\|TemplateQuery" /home/bench/repos/hugo/hugolib --include="*.go" | head -30)
      ↳ Bash(grep -A 15 "func (po \*pageOutput) GetInternalTemplateBasePathAndDescriptor" /home/bench/repos/hugo/hugolib/page.go)
      ↳ Bash(grep -B 5 -A 20 "q := tplimpl.TemplateQuery" /home/bench/repos/hugo/hugolib/page__per_output.go | head -60)
      ↳ Read(/home/bench/repos/hugo/hugolib/page__per_output.go)
      ↳ Bash(grep -B 3 -A 30 "func (ps \*pageState) resolveTemplate" /home/bench/repos/hugo/hugolib/page__per_output.go)
      ↳ Bash(grep -n "func (ps \*pageState) resolveTemplate" /home/bench/repos/hugo/hugolib/*.go)
      ↳ Bash(grep -n "resolveTemplate" /home/bench/repos/hugo/hugolib/page*.go | grep "func ")
      ↳ Read(/home/bench/repos/hugo/hugolib/page.go)
      ↳ Bash(grep -n "func (s \*TemplateStore) LookupPagesLayout\|func (s \*TemplateStore) findBestMatch" /home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
      ↳ Read(/home/bench/repos/hugo/tpl/tplimpl/legacy.go)
      ↳ Bash(grep -n "layoutAll\|layoutList\|layoutSingle" /home/bench/repos/hugo/tpl/tplimpl/*.go | head -30)
      ↳ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
      ↳ Bash(find /home/bench/repos/hugo -type f -name "doctree.go" | head -3)
      ↳ Bash(find /home/bench/repos/hugo -path "*doctree*" -name "*.go" | head -10)
      ↳ Read(/home/bench/repos/hugo/hugolib/doctree/simpletree.go)
      ↳ ⟹ returned to parent


💬 Let me verify the key pieces directly to make sure the agent's findings are accurate before synthesizing.
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatedescriptor.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templatestore.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templates.go)
  ▸ Read(/home/bench/repos/hugo/tpl/tplimpl/templates.go)

💬 Now I have the full picture from the actual code. Here's how all the pieces fit together:  ---  ## Hugo's template layout lookup — how the pieces cooperate  ...

──────── RESULT (success, 182513ms, 10 turns) ────────
Now I have the full picture from the actual code. Here's how all the pieces fit together:

---

## Hugo's template layout lookup — how the pieces cooperate

### 1. `TemplateDescriptor` — the query object

**`tpl/tplimpl/templatedescriptor.go:25-44`**

When Hugo needs to render a page it builds a `TemplateDescriptor` that captures everything the lookup engine needs:

```
Kind               → "page", "home", "section", "taxonomy", "term"
LayoutFromTemplate → "single", "list", "all", or a user-named layout
LayoutFromUser     → layout override from front matter
OutputFormat       → "html", "rss", …
MediaType          → "text/html", "text/plain", …
Variant1/Variant2  → for render hooks ("link", "image", "codeblock"; language)
```

The descriptor also doubles as the **key** under which templates are stored in the tree (see below), so comparing a query descriptor against a stored descriptor is a uniform operation.

The `query.init()` method (`templatestore.go:407`) fills in defaults before searching: if the kind is `page` and no layout was specified, `LayoutFromTemplate` is set to `"single"`; for every other kind it defaults to `"list"`.

---

### 2. `TemplateStore` — the indexed store

**`tpl/tplimpl/templatestore.go:434-460`**

```go
type TemplateStore struct {
    treeMain       *doctree.SimpleTree[map[nodeKey]*TemplInfo]
    treeShortcodes *doctree.SimpleTree[map[string]map[TemplateDescriptor]*TemplInfo]
    templatesByPath *hmaps.Cache[string, *TemplInfo]
    ...
}
```

`treeMain` is a radix tree keyed by **directory path** (e.g. `/posts`, `/_default`, `/`). At each node there is a `map[nodeKey]*TemplInfo` where:

```go
type nodeKey struct {
    c Category           // CategoryLayout, CategoryBaseof, CategoryPartial, …
    d TemplateDescriptor // the descriptor the template was parsed from
}
```

So the tree's directory path is the coarse key; the fine key is `(category, descriptor)`. A template such as `layouts/posts/single.html` is stored at node `/posts` with a `nodeKey` whose descriptor has `{Kind:"", LayoutFromTemplate:"single", OutputFormat:"html", ...}`.

`TemplInfo` (`templatestore.go:220`) holds the parsed `tpl.Template`, its `TemplateDescriptor`, optional `matrix` (language/role dimensions), and a nested `baseVariants` tree for baseof combinations (explained below).

---

### 3. The matching algorithm — `LookupPagesLayout`

**`templatestore.go:584-606`** (outer), **`templatestore.go:858-887`** (inner walk)

```go
func (s *TemplateStore) LookupPagesLayout(q TemplateQuery) *TemplInfo {
    q.init()
    key := s.key(q.Path)              // page's content path → tree key

    best1 := s.getBest()
    s.findBestMatchWalkPath(q, key, strings.Count(key, "/"), best1)
    if best1.w.w1 <= 0 { return nil }

    m := best1.templ
    if m.noBaseOf { return m }        // template self-contained — done

    best1.reset()
    m.findBestMatchBaseof(s, q.Desc, q.Sites, key, ..., best1)
    if best1.w.w1 <= 0 { return nil }
    return best1.templ
}
```

`findBestMatchWalkPath` does a **radix-tree walk from the specific path up to the root**. At each visited node it scores every candidate whose `Category` matches:

```go
weight := s.dh.compareDescriptors(category, q.Desc, k.d, q.Sites, vv.matrix)
weight.distance = slashCountKey - slashCountNode   // 0 = exact directory match
if best.isBetter(weight, vv) { best.updateValues(...) }
```

#### Scoring (`doCompare`, `templatedescriptor.go:100-244`)

Each attribute that matches adds to `w1`:

| Attribute | `w1` points |
|-----------|-------------|
| Kind matches | +5 |
| Custom layout (front matter `Layout`) | +6 |
| Standard layout (`single`/`list`) | +4 |
| `all` layout (catch-all) | +2 |
| Output format | +4 |
| Media type | +1 |
| Sites-matrix (language/role) | +1 |
| Variant1 (hook type) | +6 |
| Variant2 (language in code block) | +4 |

Matching also sets secondary weights:
- `w2 = 1` for kind/standard-layout matches (Group 1)
- `w2 = 2` for custom-layout matches (Group 2 — wins a tiebreak)
- `w3` accumulates for output-format and media-type matches

A stored template with an empty field (e.g. no Kind) matches any query value for that field — it's a wildcard. A non-empty field must match exactly or the candidate is rejected immediately (return `weightNoMatch`).

#### Picking the winner (`isBetter`, `templatestore.go:2046-2106`)

The tiebreak chain is:

1. **Distance first** (`w.distance < best.w.distance`) — a template in `/posts/` beats one in `/_default/` for a page at `/posts/foo.md`
2. **`w1`** (primary score) — more specific descriptor beats less specific
3. **`w2`, `w3`, `wsm`** — break ties when distance is equal
4. **User templates over embedded** — Hugo's own embedded templates lose if the user provides one
5. **Lexicographic path** — deterministic final tiebreak

---

### 4. Base template resolution

**`templates.go:143-199`** (apply at startup), **`templatestore.go:328-351`** (lookup at render)

Hugo resolves base templates **at store initialization** rather than at render time — this avoids a tricky clone-dance with Go's HTML template engine (which cannot be reparsed after first execution).

During `transformTemplates()`, for every layout template that starts with a `{{define ...}}` block (`needsBaseTemplate` check at `templates.go:225`), Hugo calls `FindAllBaseTemplateCandidates` to collect every compatible `CategoryBaseof` template. Then `applyBaseTemplate` merges each pair by:

1. Cloning the HTML/text template prototype
2. Parsing the **baseof content first** (defines the outer structure with `{{block ...}}` slots)
3. Parsing the **overlay content second** (its `{{define ...}}` blocks override the slots)

The result is stored in `overlay.baseVariants` — another per-`TemplInfo` radix tree keyed by the baseof's directory path, with `TemplateDescriptor → TemplWithBaseApplied` at each node.

At render time, `findBestMatchBaseof` (`templatestore.go:328`) walks that `baseVariants` tree exactly like the main walk: path-upward, distance-aware, descriptor-scored. The winning `TemplWithBaseApplied.Template` is a fully merged `TemplInfo` with `base` set for error-message attribution.

---

### How the pieces chain together end-to-end

```
Page.render()
  └─ GetInternalTemplateBasePathAndDescriptor()   hugolib/page.go:620
       builds TemplateDescriptor from Kind/Layout/OutputFormat/…
       
  └─ TemplateStore.LookupPagesLayout(TemplateQuery)
       q.init()  — fill "single"/"list" default
       findBestMatchWalkPath()
         treeMain.WalkPath(contentPath → root)
           for each node: compareDescriptors() → weight
           isBetter() — distance wins over score, score wins over w2/w3
       → best main TemplInfo
       
       (if needs baseof)
       findBestMatchBaseof()
         overlayTemplInfo.baseVariants.WalkPath(contentPath → root)
           compareDescriptors() against baseof's descriptor → weight
           isBetter() — same ordering
       → best TemplWithBaseApplied.Template
       
  └─ ExecuteWithContext(ctx, finalTemplInfo, writer, pageData)
```

The key insight is that `TemplateDescriptor` is both the **storage key** (what a file on disk describes about itself) and the **query** (what a page asks for), and `compareDescriptors` bridges them with a multi-dimensional weight so the most specific match wins regardless of whether it lives at a generic (`/_default`) or specific (`/posts`) path.
