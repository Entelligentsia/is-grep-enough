# django · L2 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **django** (python) @ `7903ee10b`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | django (python) · L2 |
| pinned source | `7903ee10bce75e9fab36e93bb77b3cb9fbf2630d` |
| status | completed |
| engagement | `grove_tools = 13` (gate: > 0 → ✓ used its capability) |
| turns | 15 |
| wall clock | 62 s |
| context (peak) | 194,918 tokens |
| cost (billed) | $0.1868 |
| &nbsp;&nbsp;↳ token split | in 15 · out 2,697 · cache-create 15,297 · cache-read 179,606 |
| tool calls | 14 (mcp__grove__source×8, mcp__grove__symbols×3, ToolSearch×1, mcp__grove__outline×1, mcp__grove__callers×1) |
| evidence | `evidence/nav3/L2/raw/django-L2.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I'm tightening how user-supplied values are made safe before they end up in rendered HTML. I need to understand the helper that decides, for a given value, whether it still needs HTML-escaping or can be emitted as-is because it already declares itself safe, what convention it leans on to tell those two cases apart, and the main places that route values through it while assembling output. Help me see where that escape-or-pass-through decision is made and how the callers depend on its result.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me load the grove tools and explore Django's escape-or-pass-through mechanism structurally.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__outline)`

💬 Now let me look at the core escape utilities and the `SafeData` type simultaneously.

&nbsp;&nbsp;▸ `mcp__grove__symbols(conditional_escape)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(SafeData)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(mark_safe)`
&nbsp;&nbsp;▸ `mcp__grove__source(python:django/utils/safestring.py#SafeData@13)`
&nbsp;&nbsp;▸ `mcp__grove__source(python:django/utils/html.py#conditional_escape@120)`
&nbsp;&nbsp;▸ `mcp__grove__source(python:django/utils/safestring.py#mark_safe@65)`

💬 Now let me see the full `safestring.py` outline and get the callers of `conditional_escape`.

&nbsp;&nbsp;▸ `mcp__grove__outline(django/utils/safestring.py)`
&nbsp;&nbsp;▸ `mcp__grove__callers(conditional_escape)`

💬 Let me pull the three most load-bearing callers and `SafeString.__add__` to see how the safe/unsafe path flows end-to-end.

&nbsp;&nbsp;▸ `mcp__grove__source(render_value_in_context)`
&nbsp;&nbsp;▸ `mcp__grove__source(format_html)`
&nbsp;&nbsp;▸ `mcp__grove__source(python:django/utils/safestring.py#__add__@33)`

💬 Let me also pull `format_html_join` and `escape` to complete the picture.

&nbsp;&nbsp;▸ `mcp__grove__source(format_html_join)`
&nbsp;&nbsp;▸ `mcp__grove__source(escape)`

💬 Here is a precise map of the mechanism:

---

## The `__html__` convention

The entire escape-or-pass-through decision rests on a single protocol: does the value have an `__html__` method?

**`django/utils/safestring.py`**

```
SafeData               (base class, mixin)
  __html__(self) → self       ← "I am already safe, return me as-is"

SafeString(str, SafeData)     ← the actual concrete type used everywhere
  __add__(self, rhs)          ← safe + safe → SafeString; safe + plain str → plain str
                                (concatenation loses safety if the rhs is untrusted)
mark_safe(s)                  ← wraps s in SafeString, or returns it unchanged
                                if it already has __html__
```

`SafeData.__html__` is the *declaration*. Any object — not just Django's own — that carries `__html__()` returning itself is treated as already-safe. That's intentional interop with Markupsafe and other libraries.

---

## The decision point: `conditional_escape` (`django/utils/html.py:120`)

```python
def conditional_escape(text):
    if isinstance(text, Promise):          # lazy translation → force to str first
        text = str(text)
    if hasattr(text, "__html__"):          # already declared safe
        return text.__html__()             #   → return it unchanged
    else:
        return escape(text)                # untrusted → HTML-encode & wrap in SafeString
```

`escape()` (line 53) always HTML-encodes and always returns a `SafeString`, so after `conditional_escape` the caller always has a `SafeString` regardless of path.

---

## Main call sites

**1. Template rendering — `django/template/base.py:1151` `render_value_in_context`**

The root of every `{{ variable }}` substitution. When `context.autoescape` is on:

```python
if context.autoescape:
    if not issubclass(type(value), str):
        value = str(value)          # non-strings stringified first
    return conditional_escape(value)
else:
    return str(value)               # autoescape off → raw, no check
```

This is the gate every template variable passes through.

**2. HTML fragment builder — `django/utils/html.py:135` `format_html`**

```python
args_safe   = map(conditional_escape, args)
kwargs_safe = {k: conditional_escape(v) for k, v in kwargs.items()}
return mark_safe(format_string.format(*args_safe, **kwargs_safe))
```

Every interpolated argument is run through `conditional_escape` individually, then the assembled string is promoted to `SafeString`. This is the intended API for building HTML in Python code (as opposed to templates).

**3. Joined fragments — `django/utils/html.py:148` `format_html_join`**

Applies `conditional_escape` to the separator as well, delegates each row to `format_html`, then `mark_safe`s the joined result.

**4. Template `{% url %}` and `{% static %}` tags**

`URLNode.render` (`django/template/defaulttags.py:521`) and `StaticNode.render` (`django/templatetags/static.py:118`) both call `conditional_escape(url)` before injecting the URL into output, ensuring a URL containing `&` or `"` is encoded.

**5. Template filters — `django/template/defaultfilters.py`**

- `escape_filter` (line 461) calls `conditional_escape` directly — so `{{ val|escape }}` is idempotent on already-safe values.
- `escapeseq` (line 471) maps it over a sequence.
- `join` (line 616) applies it to both the separator and each list element.

**6. Admin helpers — `django/contrib/admin/helpers.py`**

`AdminField.label_tag` (line 180) and `AdminReadonlyField.contents` (line 301) both call `conditional_escape` before inserting field labels and readonly values into rendered HTML.

---

## Summary of the data-flow invariant

```
user-supplied value
      │
      ▼
conditional_escape()
      │
      ├─ has __html__? ──yes──► __html__() → SafeString (already safe, returned as-is)
      │
      └─ no ──────────────────► escape() → SafeString (HTML-encoded, then wrapped)
                                               │
                                               ▼
                                      always a SafeString
```

Once a value is `SafeString`, `SafeString.__add__` enforces that concatenating it with a plain `str` loses the safe flag — so safety can't accidentally propagate from a safe string to one formed by appending untrusted content.


## Final answer

_Result event — success, 62 s, 15 turns._

Here is a precise map of the mechanism:

---

## The `__html__` convention

The entire escape-or-pass-through decision rests on a single protocol: does the value have an `__html__` method?

**`django/utils/safestring.py`**

```
SafeData               (base class, mixin)
  __html__(self) → self       ← "I am already safe, return me as-is"

SafeString(str, SafeData)     ← the actual concrete type used everywhere
  __add__(self, rhs)          ← safe + safe → SafeString; safe + plain str → plain str
                                (concatenation loses safety if the rhs is untrusted)
mark_safe(s)                  ← wraps s in SafeString, or returns it unchanged
                                if it already has __html__
```

`SafeData.__html__` is the *declaration*. Any object — not just Django's own — that carries `__html__()` returning itself is treated as already-safe. That's intentional interop with Markupsafe and other libraries.

---

## The decision point: `conditional_escape` (`django/utils/html.py:120`)

```python
def conditional_escape(text):
    if isinstance(text, Promise):          # lazy translation → force to str first
        text = str(text)
    if hasattr(text, "__html__"):          # already declared safe
        return text.__html__()             #   → return it unchanged
    else:
        return escape(text)                # untrusted → HTML-encode & wrap in SafeString
```

`escape()` (line 53) always HTML-encodes and always returns a `SafeString`, so after `conditional_escape` the caller always has a `SafeString` regardless of path.

---

## Main call sites

**1. Template rendering — `django/template/base.py:1151` `render_value_in_context`**

The root of every `{{ variable }}` substitution. When `context.autoescape` is on:

```python
if context.autoescape:
    if not issubclass(type(value), str):
        value = str(value)          # non-strings stringified first
    return conditional_escape(value)
else:
    return str(value)               # autoescape off → raw, no check
```

This is the gate every template variable passes through.

**2. HTML fragment builder — `django/utils/html.py:135` `format_html`**

```python
args_safe   = map(conditional_escape, args)
kwargs_safe = {k: conditional_escape(v) for k, v in kwargs.items()}
return mark_safe(format_string.format(*args_safe, **kwargs_safe))
```

Every interpolated argument is run through `conditional_escape` individually, then the assembled string is promoted to `SafeString`. This is the intended API for building HTML in Python code (as opposed to templates).

**3. Joined fragments — `django/utils/html.py:148` `format_html_join`**

Applies `conditional_escape` to the separator as well, delegates each row to `format_html`, then `mark_safe`s the joined result.

**4. Template `{% url %}` and `{% static %}` tags**

`URLNode.render` (`django/template/defaulttags.py:521`) and `StaticNode.render` (`django/templatetags/static.py:118`) both call `conditional_escape(url)` before injecting the URL into output, ensuring a URL containing `&` or `"` is encoded.

**5. Template filters — `django/template/defaultfilters.py`**

- `escape_filter` (line 461) calls `conditional_escape` directly — so `{{ val|escape }}` is idempotent on already-safe values.
- `escapeseq` (line 471) maps it over a sequence.
- `join` (line 616) applies it to both the separator and each list element.

**6. Admin helpers — `django/contrib/admin/helpers.py`**

`AdminField.label_tag` (line 180) and `AdminReadonlyField.contents` (line 301) both call `conditional_escape` before inserting field labels and readonly values into rendered HTML.

---

## Summary of the data-flow invariant

```
user-supplied value
      │
      ▼
conditional_escape()
      │
      ├─ has __html__? ──yes──► __html__() → SafeString (already safe, returned as-is)
      │
      └─ no ──────────────────► escape() → SafeString (HTML-encoded, then wrapped)
                                               │
                                               ▼
                                      always a SafeString
```

Once a value is `SafeString`, `SafeString.__add__` enforces that concatenating it with a plain `str` loses the safe flag — so safety can't accidentally propagate from a safe string to one formed by appending untrusted content.

