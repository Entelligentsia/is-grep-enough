# transcript: I'm tightening how user-supplied values are made safe before they end up in rendered HTML. I need to understand the helper that decides, for a given value, w...


💬 I'll look at the core escaping helper and its callers in parallel.
  ▸ Read(/home/bench/repos/django/django/utils/safestring.py)
  ▸ Read(/home/bench/repos/django/django/utils/html.py)

💬 Now let me look at how the template engine routes values through this during rendering.
  ▸ Bash(grep -n "conditional_escape\|autoescape\|SafeData\|mark_safe" /home/bench/repos/django/django/template/base.py | head -80)
  ▸ Bash(grep -rn "conditional_escape" /home/bench/repos/django/django/template/ | head -40)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/library.py)

💬 Now I have a complete picture. Here's how the whole system fits together:  ---  ## The escape-or-pass-through decision  ### The marking convention: `__html__...

──────── RESULT (success, 60161ms, 9 turns) ────────
Now I have a complete picture. Here's how the whole system fits together:

---

## The escape-or-pass-through decision

### The marking convention: `__html__` protocol

`django/utils/safestring.py:13-22` — The root of everything is the `SafeData` marker class. It declares a single method:

```python
class SafeData:
    def __html__(self):
        return self
```

`SafeString` (`str + SafeData`) is the concrete type that carries a "this is already safe" promise. The `__html__()` method is the cross-library convention — markupsafe and other third-party engines honour the same protocol, so Django's safety signal is portable. `mark_safe()` at line 64 either returns the value untouched if it already has `__html__`, or wraps it in `SafeString`.

---

### The gatekeeper: `conditional_escape()`

`django/utils/html.py:120-132` — This is the single decision point:

```python
def conditional_escape(text):
    if isinstance(text, Promise):
        text = str(text)          # materialise lazy translations first
    if hasattr(text, "__html__"):
        return text.__html__()    # already declared safe — pass through
    else:
        return escape(text)       # escape & wrap in SafeString
```

Two branches:
- **Has `__html__`** → already safe; call through and return as-is.
- **No `__html__`** → call `escape()`, which runs Python's `html.escape()` on the stringified value and wraps the result in `SafeString`.

`escape()` (line 52) always escapes, even if the value is already a `SafeString`. `conditional_escape()` is the safe version that skips double-escaping.

---

### Where callers route values through it

**1. Every `{{ variable }}` in a template — `render_value_in_context()`**
`django/template/base.py:1140-1153`

```python
def render_value_in_context(value, context):
    value = template_localtime(value, ...)
    value = localize(value, ...)
    if context.autoescape:
        if not issubclass(type(value), str):
            value = str(value)
        return conditional_escape(value)   # ← the gate
    else:
        return str(value)                  # no escaping when autoescape is off
```

`VariableNode.render()` at line 1165 resolves the filter expression and then feeds the result straight into this function. This is the last step before the value enters the output buffer for every template variable.

**2. The filter chain — `FilterExpression.resolve()`**
`django/template/base.py:821-838`

```python
for func, args in self.filters:
    if getattr(func, "needs_autoescape", False):
        new_obj = func(obj, autoescape=context.autoescape, *arg_vals)
    else:
        new_obj = func(obj, *arg_vals)
    if getattr(func, "is_safe", False) and isinstance(obj, SafeData):
        obj = mark_safe(new_obj)  # propagate safety through safe filters
    else:
        obj = new_obj
```

Filters declare `is_safe = True` (e.g. string-only transformations that can't introduce HTML) or `needs_autoescape = True` (e.g. `escape`, `linebreaks`). The `is_safe + SafeData` combo means safety propagates through a filter chain without re-escaping.

**3. Building HTML fragments — `format_html()` / `format_html_join()`**
`django/utils/html.py:135-171`

```python
def format_html(format_string, *args, **kwargs):
    args_safe = map(conditional_escape, args)
    kwargs_safe = {k: conditional_escape(v) for k, v in kwargs.items()}
    return mark_safe(format_string.format(*args_safe, **kwargs_safe))
```

Every interpolated argument goes through `conditional_escape` before substitution, and the final result is `mark_safe`d. This is how Django code that constructs HTML programmatically (widget rendering, admin, form fields) avoids double-escaping already-safe fragments while still protecting raw user strings.

**4. Simple template tags — `SimpleNode.render()`**
`django/template/library.py:347-348`

```python
if context.autoescape:
    output = conditional_escape(output)
return output
```

Tags registered with `@register.simple_tag` pass their return value through `conditional_escape` when autoescape is active, so a tag returning a `SafeString` (e.g. one built with `format_html`) goes through unmodified while a plain string gets escaped.

---

### The flow end-to-end

```
user-supplied value
        │
        ▼
FilterExpression.resolve()    ← filter chain runs; is_safe tracks safety
        │
        ▼
render_value_in_context()     ← autoescape=True ?
        │
        ├─ yes ──► conditional_escape()
        │               │
        │               ├─ has __html__? ──► return __html__()   (pass-through)
        │               └─ no __html__?  ──► escape() → SafeString (escape it)
        │
        └─ no  ──► str(value)            (no protection)
```

The `__html__` attribute is the full contract: Django's `SafeData` satisfies it with `return self`, third-party safe-string types satisfy it their own way, and `conditional_escape` treats anything lacking it as untrusted input that must be escaped.
