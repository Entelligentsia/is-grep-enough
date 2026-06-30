# transcript: I'm studying how Django turns a raw template string into rendered output, because I'm weighing adding a new kind of template construct. I need to understand ...


💬 I'll trace the full pipeline through the Django template engine. Let me load the LSP tool and start mapping the key symbols.
  ▸ ToolSearch(select:LSP)

💬 Now let me look up the key symbols in the template engine simultaneously.
  ▸ LSP(Lexer)
  ▸ LSP(Parser)
  ▸ LSP(Template)

💬 LSP needs a file path. Let me find the template engine files first.
  ▸ Bash(ls /home/bench/repos/django/django/template/)
  ▸ LSP(Lexer)
  ▸ LSP(Parser)
  ▸ LSP(Template)
  ▸ LSP(FilterExpression)

💬 All the key classes are in `django/template/base.py`. Let me read the major sections in parallel — `Template`, `Lexer`, `Parser`, `FilterExpression`, and `Va...
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)
  ▸ Read(/home/bench/repos/django/django/template/base.py)

💬 Now let me find the `Token` class definition which I haven't seen yet.
  ▸ LSP(class Token)
  ▸ LSP(Token)
  ▸ Read(/home/bench/repos/django/django/template/base.py)

💬 I have everything I need. Here is the complete picture.  ---  ## Django template pipeline: source text → tokens → node tree → rendered string  All of the cod...

──────── RESULT (success, 120189ms, 21 turns) ────────
I have everything I need. Here is the complete picture.

---

## Django template pipeline: source text → tokens → node tree → rendered string

All of the code below lives in `django/template/base.py`.

---

### Stage 0 — Entry point: `Template.__init__`

```python
# base.py:143
self.source = str(template_string)
self.nodelist = self.compile_nodelist()   # lex + parse happen here
```

```python
# base.py:169
def render(self, context):
    with context.render_context.push_state(self):
        ...
        return self._render(context)       # delegates to nodelist.render()
```

`Template` owns the two phases. `compile_nodelist` runs at construction time (once). `render` can be called many times against different `Context` objects.

---

### Stage 1 — Lexing: `Lexer.tokenize()` (base.py:419)

**Input:** the raw template string.  
**Output:** a flat `list[Token]`.

The key is a single regex:

```python
# base.py:93
tag_re = re.compile(r"({%.*?%}|{{.*?}}|{#.*?#})")
```

`tag_re.split()` splits the source at every tag boundary. The splitting regex has a capture group, so the delimiters themselves are included in the result list, alternating with the plain-text pieces between them. `in_tag` flips on every iteration to tell the loop whether the current piece is inside a tag or not:

```python
# base.py:422–431
in_tag = False
for token_string in tag_re.split(self.template_string):
    if token_string:
        result.append(self.create_token(token_string, None, lineno, in_tag))
        lineno += token_string.count("\n")
    in_tag = not in_tag
```

`create_token` (base.py:433) inspects the first two characters to classify each matched tag:

| first two chars | `token_type` |
|---|---|
| `{%` | `TokenType.BLOCK` |
| `{{` | `TokenType.VAR` |
| `{#` | `TokenType.COMMENT` |
| anything else | `TokenType.TEXT` |

For `{{ name }}` the delimiters are stripped and the content is stored as `"name"` (stripped). For plain text it is stored verbatim. Each `Token` object (base.py:359) carries `token_type`, `contents`, `lineno`, and optionally `position` (only the debug `DebugLexer` subclass sets `position`).

So the string `"Hello, {{ name }}!"` produces three tokens:
```
[Token(TEXT, "Hello, "), Token(VAR, "name"), Token(TEXT, "!")]
```

---

### Stage 2 — Parsing: `Parser.parse()` (base.py:530)

**Input:** the flat token list (reversed internally so `pop()` gives the next token in O(1)).  
**Output:** a `NodeList` — a `list` subclass whose elements are `Node` objects.

The parser loops over tokens and dispatches on `token_type`:

```python
# base.py:547–609
token_type = token.token_type.value
if token_type == 0:           # TEXT
    self.extend_nodelist(nodelist, TextNode(token.contents), token)
elif token_type == 1:         # VAR
    filter_expression = self.compile_filter(token.contents)   # → FilterExpression
    var_node = VariableNode(filter_expression)
    self.extend_nodelist(nodelist, var_node, token)
elif token_type == 2:         # BLOCK
    command = token.contents.split()[0]
    compile_func = self.tags[command]   # e.g. do_if, do_for …
    compiled_result = compile_func(self, token)
    self.extend_nodelist(nodelist, compiled_result, token)
# COMMENT tokens are silently dropped
```

**How a `{{ name }}` VAR token becomes a `VariableNode`:**

`compile_filter("name")` (base.py:690) is just `FilterExpression("name", self)`.

`FilterExpression.__init__` (base.py:757) applies `filter_re` — a regex that captures a leading variable or constant, then zero or more `|filter_name:arg` segments. For plain `"name"` with no filters it finds one match: the `var` group. It constructs `Variable("name")` and stores it as `self.var`; `self.filters` is an empty list.

`Variable.__init__` (base.py:888) decides how to treat the string:
- If it parses as an `int` or `float`, it stores the value in `self.literal`.
- If it is quoted, it stores the unescaped string in `self.literal`.
- Otherwise it splits on `.` and stores the parts as `self.lookups = ("name",)`.

So `Variable("name")` ends up with `lookups = ("name",)` — a one-element path meaning "look up `name` in the context."

`Variable("article.section")` gets `lookups = ("article", "section")` — a two-step path.

---

### Stage 3 — Rendering: `NodeList.render(context)` (base.py:1107)

```python
def render(self, context):
    return SafeString("".join([node.render_annotated(context) for node in self]))
```

Every node's `render_annotated` is called in order, each returning a string, and they are all joined together. The result is a `SafeString` (a `str` subclass that the HTML escaping machinery understands).

**How `VariableNode` turns a context value into a string:**

`VariableNode.render` (base.py:1165):

```python
def render(self, context):
    output = self.filter_expression.resolve(context)
    return render_value_in_context(output, context)
```

`FilterExpression.resolve` (base.py:803):

```python
def resolve(self, context, ignore_failures=False):
    if self.is_var:
        obj = self.var.resolve(context)   # Variable.resolve()
    else:
        obj = self.var                    # already a literal Python value
    for func, args in self.filters:       # apply each filter in turn
        arg_vals = [arg.resolve(context) if lookup else mark_safe(arg)
                    for lookup, arg in args]
        new_obj = func(obj, *arg_vals)
        obj = mark_safe(new_obj) if func.is_safe and isinstance(obj, SafeData) else new_obj
    return obj
```

`Variable.resolve` (base.py:941) hands off to `_resolve_lookup` when `self.lookups` is set:

```python
def _resolve_lookup(self, context):
    current = context                       # start at the Context object itself
    for bit in self.lookups:               # walk each segment of "a.b.c"
        try:
            current = current[bit]          # 1. dict key lookup
        except (TypeError, KeyError, ...):
            try:
                current = getattr(current, bit)  # 2. attribute lookup
            except (TypeError, AttributeError):
                current = current[int(bit)]      # 3. list-index lookup
        if callable(current):
            current = current()             # call zero-arg callables automatically
    return current
```

The three-tier fallback (dict → attribute → integer index) is what lets a single `{{ foo.bar }}` work against a dict, a model instance, or a list, without the template author needing to know which one it is.

Finally, `render_value_in_context` (base.py:1140) handles timezone localisation, locale-aware number/date formatting, and HTML auto-escaping before returning the final `str` fragment.

---

### How the pieces fit together (one-sentence per stage)

```
Template source string
        │
        ▼  tag_re.split() + create_token()
  list[Token]          ← TEXT | VAR | BLOCK | COMMENT
        │
        ▼  Parser.parse()
     NodeList          ← TextNode | VariableNode | IfNode | ForNode | …
        │
        ▼  NodeList.render(context)
  SafeString           ← each node renders itself; results are joined
```

For a variable specifically, the chain through render is:

```
NodeList.render()
  → VariableNode.render()
    → FilterExpression.resolve()       # applies any | filters
      → Variable.resolve()
        → Variable._resolve_lookup()   # dict / attr / index, step by step
          → render_value_in_context()  # escape + localize → final str fragment
```

The key design decision worth knowing if you're adding a new construct: **the Parser dispatches on token type for TEXT/VAR/COMMENT, and on a string command name for BLOCK.** A new syntactic construct that uses `{% %}` markers registers a compile function in `parser.tags[command]`; one that needs its own delimiters (like `{{ }}`'s `{{` and `}}`) would require changes to `tag_re`, `TokenType`, `Lexer.create_token`, and the `Parser.parse` dispatch switch — the `VAR` path is essentially hard-wired to produce `VariableNode`.
