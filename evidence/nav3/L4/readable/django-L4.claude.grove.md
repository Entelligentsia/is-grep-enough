# transcript: I'm studying how Django turns a raw template string into rendered output, because I'm weighing adding a new kind of template construct. I need to understand ...


💬 I'll map out the template pipeline using grove's structural tools, starting with the core engine files.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map)

💬 Let me get the structural map of the template engine and outline the key files in parallel.
  ▸ mcp__grove__outline({"file":"django/template/base.py"})
  ▸ Bash(ls /home/bench/repos/django/django/template/)

💬 Good. Now I'll pull the bodies of all the key methods in parallel — tokenization, parsing, variable resolution, and rendering.
  ▸ mcp__grove__source({"id":"python:django/template/base.py#tokenize@419"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#create_token@433"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#__init__@143"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#compile_nodelist@179"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#parse@530"})

💬 Now I'll fetch the rendering and resolution methods in parallel.
  ▸ mcp__grove__source({"id":"python:django/template/base.py#render@169"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#render@1107"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#render@1165"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#render_value_in_context@1140"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#resolve@803"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#resolve@941"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#_resolve_lookup@965"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#__init__@757"})

💬 One more — `Variable.__init__` to see how the dotted path is parsed into lookup segments.
  ▸ mcp__grove__source({"id":"python:django/template/base.py#__init__@888"})
  ▸ mcp__grove__source({"id":"python:django/template/base.py#render@1127"})

💬 I now have everything needed to give you the complete picture. Here's how all the pieces fit together.  ---  ## Phase 1 — Tokenization (`Lexer`)  **Entry poi...

──────── RESULT (success, 91078ms, 19 turns) ────────
I now have everything needed to give you the complete picture. Here's how all the pieces fit together.

---

## Phase 1 — Tokenization (`Lexer`)

**Entry point:** `base.py:419` — `Lexer.tokenize()`

The core tool is a single compiled regex (`base.py:93`):

```python
tag_re = re.compile(r"({%.*?%}|{{.*?}}|{#.*?#})")
```

Because the pattern has a **capturing group**, `re.split()` returns alternating pieces — text between tags and the matched tags themselves. A boolean `in_tag` flips on every iteration to tell which kind a piece is. Each piece goes to `Lexer.create_token()` (`base.py:433`).

`create_token` looks at the first two bytes of any `in_tag=True` piece and assigns a `TokenType`:

| First 2 chars | `TokenType` | Content stored |
|---|---|---|
| `{%` | `BLOCK` | inner text, stripped of delimiters |
| `{{` | `VAR` | inner text, stripped of delimiters |
| `{#` | `COMMENT` | inner text, stripped |
| (none) | `TEXT` | the raw string as-is |

So `"Hello, {{ user.name }}!"` produces three `Token` objects:

```
Token(TEXT,  "Hello, ")
Token(VAR,   "user.name")   ← delimiters already stripped
Token(TEXT,  "!")
```

---

## Phase 2 — Compilation (`Parser` → `NodeList`)

**Entry point:** `base.py:179` — `Template.compile_nodelist()`

`compile_nodelist` feeds the token list into a `Parser` and calls `parser.parse()` (`base.py:530`). The parser walks tokens in a `while self.tokens` loop, dispatching by `token.token_type.value`:

**`TEXT` (0)** → `TextNode(token.contents)` — just wraps the raw string.

**`VAR` (1)** → calls `self.compile_filter(token.contents)` which builds a `FilterExpression`, then wraps it in `VariableNode(filter_expression)`.

**`BLOCK` (2)** → looks up the tag name (first word) in `self.tags`, calls the registered compile function (e.g., `do_for`, `do_if`). Those functions recursively call `parser.parse(parse_until=['endfor'])` to consume their body tokens — that's how block nesting works.

### Inside `FilterExpression.__init__` (`base.py:757`)

`FilterExpression` uses a verbose regex (`filter_raw_string`, `base.py:719`) to parse a token like `user.name|upper` into:
- A **variable** part: `Variable("user.name")`
- A **filter chain**: `[(upper_func, []), ...]`

### Inside `Variable.__init__` (`base.py:888`)

`Variable` classifies the string at compile time by trying a cascade:

1. Parse as **int or float** → sets `self.literal`, `self.lookups` stays `None`
2. Parse as a **quoted string** literal → sets `self.literal`
3. Otherwise it's a **real variable name** → splits on `.` and stores `self.lookups = tuple(var.split("."))`

So `Variable("user.name")` ends up with `self.lookups = ("user", "name")`.

After `parser.parse()` returns, `Template.__init__` has stored the whole tree as `self.nodelist`:

```
NodeList([
    TextNode("Hello, "),
    VariableNode(FilterExpression(var=Variable("user.name"), filters=[])),
    TextNode("!"),
])
```

---

## Phase 3 — Rendering (`NodeList` → string)

**Entry point:** `base.py:169` — `Template.render(context)`

`Template.render` pushes render-context state and calls `self._render(context)` (`base.py:166`), which calls:

```python
self.nodelist.render(context)   # base.py:1107
```

`NodeList.render` (`base.py:1107`) is one line:

```python
return SafeString("".join([node.render_annotated(context) for node in self]))
```

Every node contributes a string fragment. The `render_annotated` wrapper catches exceptions and attaches source info for debug tracebacks.

### `TextNode.render` (`base.py:1127`)

```python
return self.s
```

Literal text is already a string — nothing to do.

### `VariableNode.render` (`base.py:1165`)

```python
output = self.filter_expression.resolve(context)
return render_value_in_context(output, context)
```

#### `FilterExpression.resolve` (`base.py:803`)

1. Calls `self.var.resolve(context)` to get the raw Python object.
2. Applies each filter function in `self.filters` sequentially: `obj = func(obj, *arg_vals)`.

#### `Variable.resolve` (`base.py:941`)

- If `self.lookups is not None` → delegates to `_resolve_lookup(context)`.
- Otherwise → returns `self.literal` directly (it was already resolved at compile time).

#### `Variable._resolve_lookup` (`base.py:965`)

This is the heart of variable resolution. It starts `current = context` and walks `self.lookups` segment by segment, trying three strategies in order for each:

```
1. current[bit]          — dict-style lookup (__getitem__)
2. getattr(current, bit) — attribute lookup
3. current[int(bit)]     — list index (numeric string)
```

If any step succeeds and the result is **callable**, it calls it with no arguments (unless `do_not_call_in_templates` or `alters_data` is set). This means `{{ user.get_full_name }}` just works — the method call is automatic.

For `user.name`, the walk is:
- `current = context["user"]` → the user object
- `current = getattr(user, "name")` → `"Alice"`

#### `render_value_in_context` (`base.py:1140`)

Takes the resolved Python value and turns it into a safe string fragment:

1. Applies timezone/locale formatting (`template_localtime`, `localize`).
2. If `context.autoescape` is on: `str(value)` then `conditional_escape()` — HTML-escapes the string unless it's already a `SafeData` instance.
3. Otherwise: `str(value)`.

---

## The complete flow for `"Hello, {{ user.name }}!"`

```
Template("Hello, {{ user.name }}!")
  │
  └─ compile_nodelist()
       ├─ Lexer.tokenize()
       │    tag_re.split() → ["Hello, ", "{{ user.name }}", "!"]
       │    in_tag toggle → Token(TEXT), Token(VAR,"user.name"), Token(TEXT)
       │
       └─ Parser.parse()
            TEXT  → TextNode("Hello, ")
            VAR   → compile_filter("user.name")
                     → FilterExpression(var=Variable("user.name"), filters=[])
                          Variable.__init__: lookups=("user","name")
                     → VariableNode(filter_expression)
            TEXT  → TextNode("!")
            → NodeList([TextNode, VariableNode, TextNode])

Template.render(Context({"user": user}))
  │
  └─ NodeList.render(context)
       ├─ TextNode("Hello, ").render()   → "Hello, "
       ├─ VariableNode.render()
       │    FilterExpression.resolve(context)
       │      Variable.resolve(context)
       │        _resolve_lookup: context["user"] → user obj
       │                         getattr(user,"name") → "Alice"
       │      (no filters to apply)
       │    render_value_in_context("Alice", context)
       │      → conditional_escape("Alice") → "Alice"
       └─ TextNode("!").render()         → "!"
       → "".join(["Hello, ", "Alice", "!"]) → "Hello, Alice!"
```

---

## What this means for adding a new construct

Each token type maps to exactly one compilation path in `Parser.parse`, and each path produces a `Node` subclass. To add a new kind of construct you need to touch at least three places:

1. **Tokenizer** — if your syntax can't be expressed with `{{ }}`, `{% %}`, or `{# #}`, you need to extend `tag_re` and `create_token`. If it fits inside one of those delimiters (e.g., a new block tag), the lexer needs no change.
2. **Parser / compile function** — register a function in `parser.tags` (via `Library.tag`) that accepts `(parser, token)` and returns a `Node`. For block constructs it calls `parser.parse(parse_until=['end...'])` recursively.
3. **Node subclass** — implement `render(self, context) -> str`. Everything else (the `render_annotated` wrapper, the `NodeList.render` join) is inherited for free.

The `FilterExpression` / `Variable` / `_resolve_lookup` machinery is reusable as-is: any node that needs to evaluate a user-supplied expression calls `parser.compile_filter(token.contents)` at compile time and `filter_expression.resolve(context)` at render time.
