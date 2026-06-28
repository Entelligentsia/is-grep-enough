# Hugo — contributor guide for coding agents

Hugo is a static site generator written in **Go** (module `github.com/gohugoio/hugo`). A single
binary reads content (Markdown, etc.), applies templates, and renders a static site. The codebase
is large; orient yourself before diving in.

## Layout

- `main.go` — tiny entry point; delegates to the `commands` package.
- `commands/` — the CLI, built on **cobra**. `hugo.go` wires the root command; subcommands live in
  their own files (`server.go`, `new.go`, `build.go`, `mod.go`, `convert.go`, etc.).
- `hugolib/` — the core build engine. `HugoSites` orchestrates one or more `Site`s; this is where
  page assembly, the content tree, taxonomies, and the build pipeline live. The heaviest package.
- `tpl/` — template functions and the template execution layer (`tpl/tplimpl`), one subpackage per
  namespace (`strings`, `collections`, `math`, `os`, `images`, …).
- `resources/` — the asset/resource pipeline: images, minify, fingerprinting, bundling, and
  `resources/page` (the `Page` interface and related types).
- `markup/` — content format converters: `goldmark` (Markdown), `asciidocext`, `org`, `pandoc`,
  highlighting via `chroma`.
- `config/` — configuration loading, merging, and the `allconfig` assembly.
- `common/` — shared low-level helpers (`hugio`, `maps`, `paths`, `types`, `loggers`, `text`).
- `deploy/`, `modules/`, `langs/`, `output/`, `media/`, `navigation/`, `parser/`, `source/`,
  `tpl/`, `transform/`, `watcher/` — focused supporting packages.
- `hugofs/` — the layered virtual filesystem (afero-based) used throughout the build.

## Build & test

- Requires a recent Go toolchain (see `go.mod` for the minimum version). Standard Go modules.
- Build: `go build` (or `go install`) produces the `hugo` binary. The **extended** build adds SCSS
  support via the WebAssembly/`dartsass` integration and CGO image features; build with the
  appropriate tags (e.g. `go build -tags extended`) plus a configured Dart Sass binary.
- Tests: `go test ./...` runs the suite; `go test ./hugolib/...` for the engine alone. Tests are
  table-driven and many use `qt` (quicktest) assertions and integration test builders.
- `mage` targets exist (`mage -l`) for common workflows (build, test, check, vet) — see `magefile.go`.
- Run `gofmt`/`go vet` and `mage check` before sending changes.

## Conventions

- Code is `gofmt`-formatted; keep imports grouped and the build vet-clean.
- Prefer table-driven tests; name tests `TestXxx` and put them beside the code under test.
- Errors are wrapped with context; avoid panics in library code.
- Keep public API stable — `hugolib`, `tpl`, and `resources/page` are widely depended on.
- Commit messages follow the conventional style used in `git log` (e.g. `tpl/strings: …`).

## When navigating

This is a large codebase with deep packages (`hugolib/` especially). Avoid reading whole files
end to end. Locate the exact type, method, or template namespace you need (e.g. `HugoSites`,
`Site.process`, a specific `tpl` function) with a pinpoint structural lookup, then read only that
region and its immediate callers.
