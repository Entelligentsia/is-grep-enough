# transcript: I'm studying how Django turns a raw template string into rendered output, because I'm weighing adding a new kind of template construct. I need to understand ...


💬 I'll read the core template engine files to trace the full pipeline from source text to rendered output.
  ▸ Bash(wc -l /home/bench/repos/django/django/template/base.py && wc -l /home/bench/repos/django/django/template/engine.py && wc -l /home/bench/repos/django/django/t...)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/context.py)

💬 Now I have everything I need to explain the full pipeline clearly.  ---  ## Django template pipeline: source text → rendered string  The entire pipeline live...

──────── RESULT (success, 71233ms, 4 turns) ────────
Now I have everything I need to explain the full pipeline clearly.

---

## Django template pipeline: source text → rendered string

The entire pipeline lives in `django/template/base.py` and `django/template/context.py`. Here's how the three phases cooperate, using `Hello {{ user.name }}!` as a running example.

---

### Phase 1 — Tokenization (`Lexer`)

**Entry point:** `Template.__init__` at `base.py:158` calls `self.compile_nodelist()`, which creates a `Lexer` and calls `lexer.tokenize()`.

```python
# base.py:93
tag_re = re.compile(r"({%.*?%}|{{.*?}}|{#.*?#})")
```

`Lexer.tokenize()` (`base.py:419`) calls `tag_re.split(template_string)`. Because the regex has a capturing group, `re.split` interleaves non-tag pieces and tag pieces in the result list, alternating with a boolean `in_tag` flag:

```
"Hello "          → in_tag=False → TEXT token, contents="Hello "
"{{ user.name }}" → in_tag=True  → VAR  token, contents="user.name"
"!"               → in_tag=False → TEXT token, contents="!"
```

`create_token()` (`base.py:433`) strips the `{{`/`}}`/`{%`/`%}` delimiters (hard-coded as 2-char slices for performance) and strips surrounding whitespace from the inner content, then returns a `Token(token_type, contents, position, lineno)`.

A `Token` (`base.py:359`) is just a plain data holder: `token_type` (a `TokenType` enum), `contents` (the stripped inner string), line number, and optional source positions for debug mode.

---

### Phase 2 — Compilation (`Parser`)

**Entry point:** `compile_nodelist()` creates `Parser(tokens, ...)` then calls `parser.parse()`.

`Parser.__init__` (`base.py:503`) immediately **reverses** the token list so that `self.tokens.pop()` walks them in original order at O(1) cost.

`Parser.parse()` (`base.py:530`) loops, popping one token at a time and dispatching on `token_type.value` (raw int, small perf win):

| token_type | action |
|---|---|
| `0` TEXT | `TextNode(token.contents)` — stores the string verbatim |
| `1` VAR | `parser.compile_filter(token.contents)` → `VariableNode(filter_expression)` |
| `2` BLOCK | looks up `self.tags[command]`, calls the compile function (e.g. `do_if`) |
| `3` COMMENT | silently skipped |

For our `user.name` VAR token, the path is:

```
Parser.compile_filter("user.name")          # base.py:690
  → FilterExpression("user.name", parser)   # base.py:740
      → Variable("user.name")               # base.py:867
```

**`FilterExpression.__init__`** (`base.py:757`) uses `filter_re` to iterate over the token string. The first regex match picks out the variable or constant; subsequent matches pick out `|filter_name:arg` pairs. For `user.name` with no filters, there is exactly one match: `var="user.name"`, so it stores `self.var = Variable("user.name")` and `self.filters = []`.

**`Variable.__init__`** (`base.py:888`) classifies the string:
1. Try to parse as `int` or `float` → fails for `"user.name"`.
2. Try `_("...")` translation wrapper → no.
3. Try quoted string literal → no.
4. Otherwise: split on `.` → `self.lookups = ("user", "name")`.

All the parse work is done at compile time. `Variable` is now a compiled lookup plan, not a live lookup.

The final nodelist for `Hello {{ user.name }}!` is:
```
NodeList[
    TextNode("Hello "),
    VariableNode(FilterExpression("user.name")),
    TextNode("!"),
]
```

---

### Phase 3 — Rendering (`NodeList` → `Node` → `Variable`)

**Entry point:** `Template.render(context)` (`base.py:169`):

```python
def render(self, context):
    with context.render_context.push_state(self):   # scope for render-local state
        with context.bind_template(self):           # attaches template to context
            return self._render(context)            # → nodelist.render(context)
```

**`NodeList.render`** (`base.py:1107`) is the main loop:

```python
def render(self, context):
    return SafeString("".join(
        [node.render_annotated(context) for node in self]
    ))
```

Each `render_annotated` call (`base.py:1061`) delegates to `node.render(context)` and wraps it in debug-mode exception annotation.

**`TextNode.render`** (`base.py:1127`) just returns `self.s` — the static string stored at compile time.

**`VariableNode.render`** (`base.py:1165`) is where a variable placeholder becomes a string:

```python
def render(self, context):
    output = self.filter_expression.resolve(context)
    return render_value_in_context(output, context)
```

**`FilterExpression.resolve`** (`base.py:803`):
1. Calls `self.var.resolve(context)` to get the raw Python value.
2. Runs each filter in `self.filters` in order, passing the output of one as the input to the next.
3. Returns the final Python object (not yet a string).

**`Variable.resolve`** (`base.py:941`): if `self.lookups` is set, calls `_resolve_lookup(context)`.

**`Variable._resolve_lookup`** (`base.py:965`) is the key mechanism. It walks `self.lookups = ("user", "name")` one segment at a time, trying three strategies on each `current` value in sequence:

```python
for bit in self.lookups:
    try:
        current = current[bit]          # 1. dict-style lookup
    except (TypeError, ...):
        try:
            current = getattr(current, bit)   # 2. attribute lookup
        except (TypeError, AttributeError):
            current = current[int(bit)]       # 3. integer-index lookup
    if callable(current):
        current = current()             # auto-call zero-arg callables
```

The starting `current` is the `Context` itself (a dict-stack), so `context["user"]` returns the user object from the context's stack, then `getattr(user_obj, "name")` returns the name string.

**Context lookup** (`BaseContext.__getitem__`, `context.py:83`): the context is a stack of dicts in `self.dicts`. Lookup searches from top to bottom via `reversed(self.dicts)`, so inner scopes shadow outer ones. The bottom layer always contains `{"True": True, "False": False, "None": None}`.

**`render_value_in_context`** (`base.py:1140`) is the final step that converts the resolved Python value to a string:

```python
def render_value_in_context(value, context):
    value = template_localtime(value, use_tz=context.use_tz)  # tz-aware datetimes
    value = localize(value, use_l10n=context.use_l10n)        # number/date formatting
    if context.autoescape:
        if not issubclass(type(value), str):
            value = str(value)
        return conditional_escape(value)   # HTML-escape unless already SafeData
    else:
        return str(value)
```

The returned string fragment is then joined with all the other node outputs by `NodeList.render`, giving the final `SafeString`.

---

### The full call graph in one view

```
Template.render(context)
  └── NodeList.render(context)
        ├── TextNode.render_annotated → "Hello "
        ├── VariableNode.render_annotated
        │     └── VariableNode.render(context)
        │           ├── FilterExpression.resolve(context)
        │           │     ├── Variable.resolve(context)
        │           │     │     └── Variable._resolve_lookup(context)
        │           │     │           ├── context["user"]          ← BaseContext.__getitem__
        │           │     │           └── getattr(user, "name")
        │           │     └── (apply filters, none here)
        │           └── render_value_in_context(value, context)
        │                 └── conditional_escape(str(value))
        └── TextNode.render_annotated → "!"
  → SafeString("Hello Jane!")
```

---

### What this means for a new construct

If you're adding a new template construct, you have two natural extension points:

- **New token type** — you'd need to touch `TokenType`, the `Lexer`, and the `Parser.parse()` dispatch. This is the deepest change and affects all templates.
- **New block tag** (`{% mytag %}`) — register a compile function in a `Library` via `@register.tag`. It receives `(parser, token)` and returns a `Node` subclass. This is the standard extension path; it requires zero changes to the tokenizer or parser core.
- **New `Node` subclass** — implement `render(self, context) -> str`. The node can call `parser.parse(['end_mytag'])` recursively to capture a child nodelist, which is how `{% if %}`/`{% for %}` work.
