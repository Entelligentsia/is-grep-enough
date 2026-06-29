# django · L2 · lsp — readable transcript

> lsp — semantic (native Claude Code LSP tool), over **django** (python) @ `7903ee10b`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `lsp` — semantic (native Claude Code LSP tool) |
| repo · rung | django (python) · L2 |
| pinned source | `7903ee10bce75e9fab36e93bb77b3cb9fbf2630d` |
| status | completed |
| engagement | `lsp_tools = 7` (gate: > 0 → ✓ used its capability) |
| turns | 19 |
| wall clock | 87 s |
| context (peak) | 253,940 tokens |
| cost (billed) | $0.2830 |
| &nbsp;&nbsp;↳ token split | in 12 · out 4,885 · cache-create 23,304 · cache-read 230,624 |
| tool calls | 18 (Read×10, LSP×7, ToolSearch×1) |
| evidence | `evidence/nav3/L2/raw/django-L2.claude.lsp.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I'm tightening how user-supplied values are made safe before they end up in rendered HTML. I need to understand the helper that decides, for a given value, whether it still needs HTML-escaping or can be emitted as-is because it already declares itself safe, what convention it leans on to tell those two cases apart, and the main places that route values through it while assembling output. Help me see where that escape-or-pass-through decision is made and how the callers depend on its result.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me load the LSP tool and start tracing the escape-or-pass-through decision.

&nbsp;&nbsp;▸ `ToolSearch(select:LSP)`
&nbsp;&nbsp;▸ `LSP(conditional_escape)`
&nbsp;&nbsp;▸ `LSP(SafeData)`
&nbsp;&nbsp;▸ `LSP(mark_safe)`
&nbsp;&nbsp;▸ `LSP(conditional_escape)`
&nbsp;&nbsp;▸ `LSP(SafeData)`

💬 Good. The core symbols are at `django/utils/html.py:120` and `django/utils/safestring.py:13`. Let me read both, and find references to `conditional_escape` in parallel.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/utils/safestring.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/utils/html.py)`

💬 Now let me find all the callers of `conditional_escape` and also look at `escape` itself.

&nbsp;&nbsp;▸ `LSP({"operation":"findReferences","filePath":"/home/bench/repos/django/django/utils/html.py","line":120,"character":5})`
&nbsp;&nbsp;▸ `LSP(escape)`

💬 Now I'll read the key non-test callers to understand how they use `conditional_escape`.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/template/base.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/template/defaultfilters.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/template/defaulttags.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/template/library.py)`

💬 Let me also read the remaining two callers in `defaultfilters.py` and the admin helper.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/template/defaultfilters.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/template/defaultfilters.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/contrib/admin/helpers.py)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/django/django/utils/html.py)`

💬 Here is the full picture of how Django decides to escape or pass through a value.

---

## The decision point: `conditional_escape`

**`django/utils/html.py:120`**

```python
def conditional_escape(text):
    if isinstance(text, Promise):
        text = str(text)
    if hasattr(text, "__html__"):
        return text.__html__()
    else:
        return escape(text)
```

The entire escape-or-pass-through decision is two branches:

- **Has `__html__`?** → call it and return what it returns. The object is declaring "I am already safe HTML."
- **No `__html__`?** → call `escape(text)`, which runs `html.escape(str(text))` and wraps the result in a `SafeString`.

Both branches produce a `SafeString`; after `conditional_escape` the caller never needs to ask again.

---

## The convention: the `__html__` protocol

Django's safety marker is a class hierarchy in **`django/utils/safestring.py`**:

| Symbol | Line | Role |
|--------|------|------|
| `SafeData` | 13 | Mixin that defines `__html__(self) → self` |
| `SafeString(str, SafeData)` | 25 | Concrete safe-string type |
| `mark_safe(s)` | 65 | Factory — if `s` already has `__html__`, returns it unchanged; otherwise wraps it in `SafeString` |

`SafeString.__add__` (line 33) preserves safety only when both operands are `SafeData`; concatenating with a plain `str` drops the marker, forcing a fresh escape at the next render boundary.

`__html__` is not Django-specific — it is the same interoperability protocol used by markupsafe/Jinja2, which is why `conditional_escape`'s docstring mentions third-party libraries.

The unconditional alternative, `escape` (`html.py:53`), always escapes — even an already-safe value — and is used only when you deliberately want to re-escape (e.g., the `|force_escape` template filter at `defaultfilters.py:476`).

---

## Where callers route values through it

### 1. `format_html` / `format_html_join` — `html.py:135,148`
The idiomatic way to build HTML fragments in Python code. Every positional and keyword argument is passed through `conditional_escape` before being interpolated into the format string; the assembled result is marked safe. This is how Django internally constructs widget HTML, error messages, and admin output.

### 2. `render_value_in_context` — `template/base.py:1140`
The final step before any `{{ variable }}` is written to template output. When `context.autoescape` is `True`, every value goes through `conditional_escape(value)`. A `SafeString` passes through; anything else is escaped. This is the central gate for all template variable rendering.

### 3. `SimpleNode.render` — `template/library.py:347`
`simple_tag`-registered functions return a value; its render method applies the same autoescape-then-`conditional_escape` pattern before emitting the output string.

### 4. `URLNode.render` — `template/defaulttags.py:521`
The `{% url %}` tag conditionally escapes its resolved URL when autoescape is on — since URLs can contain `&` (query strings) that must become `&amp;` in HTML attribute values.

### 5. Template filters — `template/defaultfilters.py`
| Filter | Line | What it does |
|--------|------|--------------|
| `\|escape` | 461 | Calls `conditional_escape` on the value (safe values pass through) |
| `\|escapeseq` | 471 | Applies `conditional_escape` to each element of a sequence |
| `\|join` | 616 | Escapes both the separator and each list element before joining |
| `\|unordered_list` | 717 | Binds `conditional_escape` as the `escaper` function when autoescape is on |

### 6. Admin helpers — `contrib/admin/helpers.py:180,301`
Field labels and readonly-field values are routed through `conditional_escape` before being handed to `format_html` or injected into HTML — since labels are user-defined strings and must not carry raw HTML into the admin UI.

---

## Summary of the invariant

Every path that produces rendered HTML either:
- calls `conditional_escape`, which delegates to `__html__()` for already-safe values and to `escape()` for everything else, or
- calls `format_html`, which does the same per-argument before interpolation.

The `__html__` method on `SafeData` is the single flag that lets a value skip escaping. Nothing is emitted raw unless it holds that marker.


## Final answer

_Result event — success, 87 s, 19 turns._

Here is the full picture of how Django decides to escape or pass through a value.

---

## The decision point: `conditional_escape`

**`django/utils/html.py:120`**

```python
def conditional_escape(text):
    if isinstance(text, Promise):
        text = str(text)
    if hasattr(text, "__html__"):
        return text.__html__()
    else:
        return escape(text)
```

The entire escape-or-pass-through decision is two branches:

- **Has `__html__`?** → call it and return what it returns. The object is declaring "I am already safe HTML."
- **No `__html__`?** → call `escape(text)`, which runs `html.escape(str(text))` and wraps the result in a `SafeString`.

Both branches produce a `SafeString`; after `conditional_escape` the caller never needs to ask again.

---

## The convention: the `__html__` protocol

Django's safety marker is a class hierarchy in **`django/utils/safestring.py`**:

| Symbol | Line | Role |
|--------|------|------|
| `SafeData` | 13 | Mixin that defines `__html__(self) → self` |
| `SafeString(str, SafeData)` | 25 | Concrete safe-string type |
| `mark_safe(s)` | 65 | Factory — if `s` already has `__html__`, returns it unchanged; otherwise wraps it in `SafeString` |

`SafeString.__add__` (line 33) preserves safety only when both operands are `SafeData`; concatenating with a plain `str` drops the marker, forcing a fresh escape at the next render boundary.

`__html__` is not Django-specific — it is the same interoperability protocol used by markupsafe/Jinja2, which is why `conditional_escape`'s docstring mentions third-party libraries.

The unconditional alternative, `escape` (`html.py:53`), always escapes — even an already-safe value — and is used only when you deliberately want to re-escape (e.g., the `|force_escape` template filter at `defaultfilters.py:476`).

---

## Where callers route values through it

### 1. `format_html` / `format_html_join` — `html.py:135,148`
The idiomatic way to build HTML fragments in Python code. Every positional and keyword argument is passed through `conditional_escape` before being interpolated into the format string; the assembled result is marked safe. This is how Django internally constructs widget HTML, error messages, and admin output.

### 2. `render_value_in_context` — `template/base.py:1140`
The final step before any `{{ variable }}` is written to template output. When `context.autoescape` is `True`, every value goes through `conditional_escape(value)`. A `SafeString` passes through; anything else is escaped. This is the central gate for all template variable rendering.

### 3. `SimpleNode.render` — `template/library.py:347`
`simple_tag`-registered functions return a value; its render method applies the same autoescape-then-`conditional_escape` pattern before emitting the output string.

### 4. `URLNode.render` — `template/defaulttags.py:521`
The `{% url %}` tag conditionally escapes its resolved URL when autoescape is on — since URLs can contain `&` (query strings) that must become `&amp;` in HTML attribute values.

### 5. Template filters — `template/defaultfilters.py`
| Filter | Line | What it does |
|--------|------|--------------|
| `\|escape` | 461 | Calls `conditional_escape` on the value (safe values pass through) |
| `\|escapeseq` | 471 | Applies `conditional_escape` to each element of a sequence |
| `\|join` | 616 | Escapes both the separator and each list element before joining |
| `\|unordered_list` | 717 | Binds `conditional_escape` as the `escaper` function when autoescape is on |

### 6. Admin helpers — `contrib/admin/helpers.py:180,301`
Field labels and readonly-field values are routed through `conditional_escape` before being handed to `format_html` or injected into HTML — since labels are user-defined strings and must not carry raw HTML into the admin UI.

---

## Summary of the invariant

Every path that produces rendered HTML either:
- calls `conditional_escape`, which delegates to `__html__()` for already-safe values and to `escape()` for everything else, or
- calls `format_html`, which does the same per-argument before interpolation.

The `__html__` method on `SafeData` is the single flag that lets a value skip escaping. Nothing is emitted raw unless it holds that marker.

