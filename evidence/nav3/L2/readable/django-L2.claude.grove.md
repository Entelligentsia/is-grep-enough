# transcript: I'm tightening how user-supplied values are made safe before they end up in rendered HTML. I need to understand the helper that decides, for a given value, w...


💬 Let me load the grove tools and explore Django's escape-or-pass-through mechanism structurally.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__outline)

💬 Now let me look at the core escape utilities and the `SafeData` type simultaneously.
  ▸ mcp__grove__symbols({"dir":"django/utils","name":"conditional_escape"})
  ▸ mcp__grove__symbols({"dir":"django/utils","name":"SafeData"})
  ▸ mcp__grove__symbols({"dir":"django/utils","name":"mark_safe"})
  ▸ mcp__grove__source({"id":"python:django/utils/safestring.py#SafeData@13"})
  ▸ mcp__grove__source({"id":"python:django/utils/html.py#conditional_escape@120"})
  ▸ mcp__grove__source({"id":"python:django/utils/safestring.py#mark_safe@65"})

💬 Now let me see the full `safestring.py` outline and get the callers of `conditional_escape`.
  ▸ mcp__grove__outline({"file":"django/utils/safestring.py"})
  ▸ mcp__grove__callers({"name":"conditional_escape","dir":"django"})

💬 Let me pull the three most load-bearing callers and `SafeString.__add__` to see how the safe/unsafe path flows end-to-end.
  ▸ mcp__grove__source({"file":"django/template/base.py","name":"render_value_in_context"})
  ▸ mcp__grove__source({"file":"django/utils/html.py","name":"format_html"})
  ▸ mcp__grove__source({"id":"python:django/utils/safestring.py#__add__@33"})

💬 Let me also pull `format_html_join` and `escape` to complete the picture.
  ▸ mcp__grove__source({"file":"django/utils/html.py","name":"format_html_join"})
  ▸ mcp__grove__source({"file":"django/utils/html.py","name":"escape"})

💬 Here is a precise map of the mechanism:  ---  ## The `__html__` convention  The entire escape-or-pass-through decision rests on a single protocol: does the v...

──────── RESULT (success, 61919ms, 15 turns) ────────
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
