# transcript: I'm reasoning about how Hugo identifies a file's content type so it can pick the right markup converter, output format, and template. I need to understand th...


💬 Let me look at the `media` package directly.
  ▸ Bash(find /home/bench/repos/hugo/media -type f -name "*.go" | sort)
  ▸ Read(/home/bench/repos/hugo/media/mediaType.go)

💬 Here is the full picture of `media.Type` (`media/mediaType.go:36`):  ---  ## The `media.Type` struct  ```go type Type struct {     Type        string     `js...

──────── RESULT (success, 33594ms, 3 turns) ────────
Here is the full picture of `media.Type` (`media/mediaType.go:36`):

---

## The `media.Type` struct

```go
type Type struct {
    Type        string     `json:"-"`
    MainType    string     `json:"mainType"`
    SubType     string     `json:"subType"`
    Delimiter   string     `json:"delimiter"`
    FirstSuffix SuffixInfo `json:"-"`
    mimeSuffix  string
    SuffixesCSV string     `json:"-"`
}
```

### Identity fields

| Field | Role | Example |
|---|---|---|
| `Type` | The **full MIME string** — the authoritative identity. Carries the canonical `main/sub` form, including the `+suffix` qualifier when present. Tagged `json:"-"` so normal marshalling skips it (it gets re-emitted explicitly in `MarshalJSON`). | `"application/rss+xml"` |
| `MainType` | The **top-level type** to the left of `/`. | `"application"` |
| `SubType` | The **subtype** between `/` and an optional `+`. | `"rss"` |
| `mimeSuffix` | The **structured-syntax suffix** after `+`, unexported. Present only when the MIME type uses the `type/subtype+suffix` form. | `"xml"` |

`FromString` at line 137 shows how `Type` is decomposed: it splits on `/`, then splits the right side on `+` to separate `SubType` from `mimeSuffix`, and re-assembles `Type` as the canonical string.

### File-suffix fields

Hugo's media types can map to one or more file extensions. Those are stored separately from the MIME identity:

| Field | Role | Example |
|---|---|---|
| `SuffixesCSV` | **All** valid file extensions, comma-joined into a single string. Stored as a plain string (not a slice) so the struct remains **comparable** with `==`. Tagged `json:"-"`. | `"jpg,jpeg"` |
| `Delimiter` | The separator that goes *before* a suffix when constructing filenames. Defaults to `"."` (`DefaultDelimiter`). | `"."` |
| `FirstSuffix` | A `SuffixInfo` that pre-computes the first entry in `SuffixesCSV` — both the bare `Suffix` and the `FullSuffix` (delimiter prepended). Populated by `init()`. Tagged `json:"-"`. | `{Suffix: "jpg", FullSuffix: ".jpg"}` |

`Suffixes()` at line 170 splits `SuffixesCSV` on demand to produce a `[]string`. `HasSuffix` at line 340 does the containment check directly against the CSV string with sentinel commas to avoid false substring matches.

### Key design choice

The `Type` string field and `SuffixesCSV` are **orthogonal identities**: `Type` is the MIME wire identity used to match content type headers and select converters/templates; the suffix fields are the filesystem representation used to recognise files by extension. A single `media.Type` value binds both together in one comparable struct.
