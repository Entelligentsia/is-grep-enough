# transcript: I'm reasoning about how Hugo identifies a file's content type so it can pick the right markup converter, output format, and template. I need to understand th...


💬 Let me load the LSP tool and find the media type definition.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(Type)
  ▸ Bash(ls /home/bench/repos/hugo/media/)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/hugo/media/mediaType.go","line":1,"character":1})

💬 Now let me read the struct definitions directly.
  ▸ Read(/home/bench/repos/hugo/media/mediaType.go)

💬 Let me also check the `init` method to see how the `Type` identity string is assembled from its parts.
  ▸ Read(/home/bench/repos/hugo/media/mediaType.go)
  ▸ Read(/home/bench/repos/hugo/media/mediaType.go)

💬 Let me check how the `Type` (full identity string) field is populated — looking at `FromString` and the config loading.
  ▸ Read(/home/bench/repos/hugo/media/mediaType.go)

💬 Here is a complete walkthrough of `media.Type` (`media/mediaType.go:36`).  ---  ## The `media.Type` struct  ``` type Type struct {     Type        string    ...

──────── RESULT (success, 58190ms, 9 turns) ────────
Here is a complete walkthrough of `media.Type` (`media/mediaType.go:36`).

---

## The `media.Type` struct

```
type Type struct {
    Type        string      // json:"-"
    MainType    string      // json:"mainType"
    SubType     string      // json:"subType"
    Delimiter   string      // json:"delimiter"
    FirstSuffix SuffixInfo  // json:"-"
    mimeSuffix  string      // unexported
    SuffixesCSV string      // json:"-"
}
```

### Full identity string — `Type`

`Type string` (line 38) carries the canonical MIME string exactly as IANA writes it, e.g. `"application/rss+xml"` or `"text/html"`. This is what `String()` returns (line 166) and what `Types.Less` sorts on (line 235). It is **not** JSON-exported because it is reconstructed from the parts whenever the struct is built or decoded.

`FromString` (line 137) shows how it is assembled:

```
typ = mainType + "/" + subType          // e.g. "text/html"
typ = mainType + "/" + subType + "+" + suffix   // e.g. "application/rss+xml"
```

### Decomposed parts

| Field | Role | Example |
|---|---|---|
| `MainType` | top-level category before the `/` | `"application"` |
| `SubType` | sub-type name, the part between `/` and `+` (or end) | `"rss"` |
| `mimeSuffix` (unexported) | the structured-syntax suffix after `+` in the MIME string | `"xml"` |

`mimeSuffix` is set by `newMediaTypeWithMimeSuffix` (line 222) for types like `application/rss+xml`, where the `+xml` tells consumers the underlying serialisation format without changing the primary identity. It participates in building `Type` but is otherwise internal.

### File-suffix representation

Hugo needs to map a media type to and from file extensions. Three fields handle that:

| Field | What it holds | Example |
|---|---|---|
| `Delimiter` | separator prepended to every file suffix; default `"."` | `"."` |
| `SuffixesCSV` | all accepted file extensions, comma-joined into one string (keeps `Type` a comparable value) | `"jpg,jpeg"` |
| `FirstSuffix SuffixInfo` | pre-computed view of the first extension, eagerly set by `init()` | `{Suffix:"xml", FullSuffix:".xml"}` |

`SuffixInfo` (line 61) is a small helper:

```
type SuffixInfo struct {
    Suffix     string  // without delimiter — "xml"
    FullSuffix string  // with delimiter  — ".xml"
}
```

`init()` (line 207) populates `FirstSuffix` by splitting `SuffixesCSV` and prepending `Delimiter`. The `Suffixes()` method (line 170) does the same split on demand for the full list.

---

**In one sentence:** `Type` is the opaque identity (the full MIME string); `MainType`/`SubType`/`mimeSuffix` decompose it into its three RFC parts; and `SuffixesCSV`/`FirstSuffix`/`Delimiter` represent the file-extension side of the same type.
