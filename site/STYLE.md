# STYLE.md — is-grep-enough dashboard design tokens

The enforceable token reference for the dashboard (§9 of `docs/DASHBOARD_SPEC.md`).
This is **descriptive of the shipped implementation**, not aspirational: every
value below is the one actually in `site/style.css` (`:root`) and `site/app.mjs`
(Plot defaults). When you change a token, change it in both the code and here in
the same commit — that is the whole point of this file: prevent drift back to
design-system-template defaults.

**The neutrality test (the north star):** if this page were screenshotted into an
academic appendix it should look at home there. If it looks like a SaaS landing
page, it is wrong. No cards-with-shadows, no pills, no gradients, no rounded
chrome, no decorative motion.

## Palette

Near-monochrome canvas; **color encodes ARM IDENTITY only — never quality or
good/bad.** Status (DNF, pending, blocked) is shown by shape/fill/iconography, not
hue. The arm triad is **Okabe–Ito** (colorblind-safe, *not* traffic-light).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | `#1a1a1a` | `#e8e6e1` | primary text |
| `--ink-soft` | `#555` | `#b3b0a8` | secondary text, section headers |
| `--ink-faint` | `#888` | `#8a877f` | captions, provenance, axis labels |
| `--rule` | `#e3e1dc` | `#34322d` | hairline rules, chart frames |
| `--rule-strong` | `#cfccc4` | `#46443d` | stronger borders, control outlines |
| `--paper` | `#fbfaf7` | `#1b1a17` | page background (off-white / neutral grey, **never pure white/black**) |
| `--paper-2` | `#f3f1ec` | `#232220` | recessed fills (prompt blocks, raw json, pending cells) |
| `--baseline` | `#0072b2` | `#0072b2` | arm: baseline · text (Okabe–Ito blue) |
| `--grove` | `#e69f00` | `#e69f00` | arm: grove · structural (Okabe–Ito orange) |
| `--lsp` | `#009e73` | `#009e73` | arm: lsp · semantic (Okabe–Ito teal) |

Arm colors are identical in dark mode — identity is constant. Dark mode is a
**truly neutral warm grey**, not black (§9).

## Type

The entire type system is **one neutral sans + one mono**. Tabular figures
everywhere (`font-variant-numeric: tabular-nums`) so metric columns align.

- `--sans`: `system-ui, -apple-system, "IBM Plex Sans", Segoe UI, Roboto, sans-serif`
- `--mono`: `ui-monospace, "IBM Plex Mono", "SF Mono", Menlo, monospace` — code, cites, tool calls, **all numbers/metrics**
- Root: `html { font-size: 15px }`, `body { line-height: 1.5 }`

| Role | Size | Weight | Notes |
|---|---|---|---|
| masthead `h1` | `1.35rem` | 600 | letter-spacing `-0.01em` |
| section `h2` | `.82rem` | 600 | UPPERCASE, letter-spacing `.08em`, `--ink-soft` |
| body / `.sub` | `.92rem` | 400 | `--ink-soft`, max measure ~70ch |
| `.note` | `.85rem` | 400 | `--ink-soft`, max measure ~74ch |
| `.caveat` | `.8rem` | 400 | *italic*, `--ink-faint` |
| `.provenance` | `.78rem` | 400 | mono, `--ink-faint` |
| `code` / `.mono` | `.86em` | 400 | mono |
| metric value | `.82rem` | 400 (600 when "lowest"/"lower") | mono |
| chart labels | `11px` | — | small-multiples |
| sparkline labels | `9px` | — | drilled context curve |

## Spacing & layout

- **Content column:** `.wrap { max-width: 1060px; margin: 0 auto; padding: 2.2rem 1.4rem 5rem }`. Prose measure capped at ~70–74ch; data regions (grids/charts) may use the full column width.
- **Section rhythm:** `section { margin: 2.2rem 0 }`; `h2` underlined by a single `1px var(--rule)`.
- **Gaps:** grids/columns `1rem`; filter/legend bars `1.2–1.4rem`; intra-component `.4–.8rem`.
- **Rules, not boxes:** hairline `1px var(--rule)` (stronger: `--rule-strong`). Flat 1px-bordered panels only — **no `border-radius`, no `box-shadow`, no gradients.** "Cards" are paper with a hairline, nothing more.

## Charts (Observable Plot defaults)

Restrained, axis-honest, directly labeled. Small-multiples / dot-strip / sparkline
over big animated bars. No chart-junk, no 3D, no gradient-under-line.

- `style: { fontFamily: "system-ui, sans-serif", fontSize: "11px", background: "transparent" }`
- **Color scale:** `color: { domain: arms, range: arms.map(a => ARM_COLOR[a]) }` — categorical arm identity only; **never** a sequential/diverging ramp for status or quality.
- **Y axis:** `{ grid: true, zero: true, nice: true, tickFormat: "~s" }` — **always from zero** (no truncated baselines).
- **X / facets:** axis labels suppressed where redundant; facet header carries the honest per-rung `n` (`L4 · n=2`) so partial rungs self-report.
- **Theme-tracking strokes:** chart chrome reads CSS vars at render via `cssVar()` so it follows light/dark — `Plot.frame({ stroke: cssVar("--rule") })` and the dot hairline halo `stroke: cssVar("--paper")`. Never hardcode a hue here; it glares in the other mode (T3.2).
- **Marks vocabulary:** `Plot.frame` (theme `--rule`); one `Plot.dot` per repo (`r: 3`, `fillOpacity: 0.85`, `--paper` hairline halo); per-group median `Plot.tickY` (`strokeWidth: 2.5`); min–max `Plot.ruleX` whisker (`strokeOpacity: 0.35`) so no aggregate shows as a lone mark; DNF points as a hollow ring (`symbol: "times"`, `fill: none`) — never a clean dot.
- **Sparkline:** `width: 240, height: 62`; `areaY` `fillOpacity: 0.12` + `lineY` `strokeWidth: 1.4` in arm color; ticks minimal; y from zero, `~s`.

## Motion

Functional only — a fade on view change, chart-draw ≤200ms. Nothing decorative.
`@media (prefers-reduced-motion: reduce) { * { transition: none !important } }`.

## Accessibility invariants

- Color is **never** the sole encoder (arm identity is also labeled; status uses shape/fill/glyph).
- Semantic HTML; the coverage and metric tables remain meaningful without JS-driven charts.
- Keyboard-navigable controls; honors reduced-motion.
- All asset paths are **base-path-relative** (`data/…`, `style.css`) for the `/is-grep-enough/` project page — never a leading `/`.
