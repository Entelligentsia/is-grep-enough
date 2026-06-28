# Django prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/django` (SHA 7903ee10bce75e9fab36e93bb77b3cb9fbf2630d,
Python). All `file:line` cites verified against that tree; paths are relative to the `django/`
package dir. This is a modern Django (composite-pk / async-handler / `ModelSignal` era), so
entities differ from older releases. Python specifics (metaclasses on `Model`, descriptors,
decorators) were avoided as load-bearing answer points — every spine element is derivable from
static source text, not runtime resolution.

Each level targets a deliberately distinct subsystem to avoid scope collision:
L1 URL match result · L2 output-escaping safety · L3 request handling · L4 template engine ·
L5 ORM model write. Where two levels touch the same file (L2 and L4 both reference
`render_value_in_context`), the scope split is documented below and in the keys, mirroring the
redis L2/L5 split (lazy expiry vs propagation).

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "When the router finishes matching an incoming URL, it hands the rest of the request
machinery a single object that captures everything known about which view was selected. Before I
touch how a view gets invoked, I need a clear picture of that match-result object: what it
records about the chosen view callable and the arguments pulled out of the URL, how it represents
the view's name and any namespacing, and how it makes the core (view, args, kwargs) triple
conveniently available to whatever consumes it. Walk me through the makeup of that object."

**Larger task it slices from:** changing how views are dispatched/instrumented, or adding data to
the URL-match result — needs a clear model of the match object first.

**Why this level:** The answer lives at a single definition site — `class ResolverMatch`
(`urls/resolvers.py:34-105`) — and is one concrete fact (the shape of one object). Answering well
means integrating the meaning of adjacent attributes (`func`; `args`/`kwargs` vs the
`captured_kwargs`/`extra_kwargs` split; `url_name`/`route`; the `app_name(s)`/`namespace(s)`/
`view_name` naming triplet) and the `__getitem__` access contract — but it never leaves that one
class, 0 call hops. Not primitive-isomorphic: it asks for the *role* of the fields and how the
triple is exposed, which must be read off the body, not produced by a locate primitive. Floor
level (exceeds nothing).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `ResolverMatch`,
`urls/resolvers.py:34`; func/args/kwargs/url_name/route/namespacing/`__getitem__` spine).

**Neutrality check:** text — grep `ResolverMatch`/`class ResolverMatch` lands on the class;
structural — the class declaration is one node; semantic — go-to-def on `ResolverMatch`. All
three reach the same single site; differences are only cost. Not isomorphic because the
understanding (what each attribute is for, the triple contract) is read off the body.

---

## L2 — neighborhood (focal routine + direct callers, 1 hop)

**Prompt:** "I'm tightening how user-supplied values are made safe before they end up in rendered
HTML. I need to understand the helper that decides, for a given value, whether it still needs
HTML-escaping or can be emitted as-is because it already declares itself safe, what convention it
leans on to tell those two cases apart, and the main places that route values through it while
assembling output. Help me see where that escape-or-pass-through decision is made and how the
callers depend on its result."

**Larger task it slices from:** changing the auto-escaping policy or the safe-string contract —
must first know the central decision routine, the `__html__` convention, and every place output
is routed through it.

**Why this level:** One focal routine — `conditional_escape` (`utils/html.py:120`) — plus exactly
one hop in two directions: down to the `__html__`/`SafeData`/`SafeString`/`escape` convention it
branches on (`utils/safestring.py:16-25`, `utils/html.py:52`), and out to its direct callers
(`format_html` `utils/html.py:135`, `format_html_join` `:148`, `render_value_in_context`
`template/base.py:1140`). Synthesis required: the callers depend on the result differently — the
auto-escape boundary vs the no-double-escape interpolation helpers — which can't be read from the
definition alone. Exceeds L1 (no longer one site/one fact; must gather the convention + several
call sites and relate them). Stops short of L3 — it's a star (one symbol, its neighbors), not an
ordered chain.

**Ground-truth answer sketch:** see `L2.reference.md` (focal `conditional_escape`
`utils/html.py:120`; `__html__` branch `:127-131`; `SafeData.__html__` `safestring.py:16`;
`escape` `utils/html.py:52`; callers `format_html` `:135`, `format_html_join` `:148`,
`render_value_in_context` `template/base.py:1140`).

**Neutrality check:** text — grep `conditional_escape` / `__html__` yields def + call sites
directly; structural — the function node plus its reference set; semantic — find-refs on the
symbol. Each reaches the same neighborhood; cost differs, feasibility does not. Not isomorphic: a
single find-refs lists call sites but does not explain the `__html__` convention or *how each
caller relies on the result* — that needs reading and integrating the sites.

---

## L3 — path (directed chain across files, multi-hop, one path)

**Prompt:** "I want to trace what happens to an incoming HTTP request from the moment the WSGI
server hands it to Django until the matching view callable is actually invoked. I'm interested in
how the request object gets built and pushed into the middleware stack, how it reaches the inner
handler that turns a URL into a view, how the request path is resolved into a view plus the
arguments to pass it, and how control is finally handed off to that view. Walk me through that
sequence in order, end to end."

**Larger task it slices from:** adding cross-cutting per-request behavior, or changing dispatch —
needs the precise WSGI→middleware→resolve→view spine.

**Why this level:** A single directed chain threaded through `core/handlers/wsgi.py`,
`core/handlers/base.py`, and into `urls/resolvers.py`, multiple hops, followed in order: WSGI
`__call__`/request build → `get_response` → `_middleware_chain` → inner `_get_response` →
`resolve_request` → `resolver.resolve` → view invocation. Each step names the next. Entry
ambiguity is real: `get_response` does not call `_get_response` directly — the link runs through
`_middleware_chain`, whose innermost layer is `convert_exception_to_response(self._get_response)`
assembled in `load_middleware` (`core/handlers/base.py:39`); and an async twin exists, so the
agent must pick the live sync path. Exceeds L2 because it is an ordered multi-file traversal (a
path), not a one-hop star; stays below L4 because it is one linear path, not a cluster of
interrelating paths forming a subsystem.

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `WSGIHandler.__call__`
`wsgi.py:120`/124 → `get_response` `base.py:138`/142 → `_middleware_chain`/inner
`convert_exception_to_response(_get_response)` `base.py:39` → `_get_response` `base.py:176` →
`resolve_request` `base.py:302`/315 → view call `base.py:199`).

**Neutrality check:** text — grep the handler/method names and follow the calls between them;
structural — call-graph edges from `__call__` down to the view call; semantic — go-to-def chained
call by call. All three can walk it; grep must read each body to find the next callee (higher
cost), structural/semantic surface callees directly. Feasible for all. Not isomorphic: no single
primitive yields a multi-hop ordered path through the middleware indirection.

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm studying how Django turns a raw template string into rendered output, because
I'm weighing adding a new kind of template construct. I need to understand how the source text is
first broken into tokens, how those tokens are compiled into a tree of node objects, and then how
that tree produces the final string when handed a context — including how a single variable
placeholder's value gets turned into part of the output. Show me how these cooperating pieces fit
together, from source text through compilation to a rendered string."

**Larger task it slices from:** adding a template construct (a new tag/node type) or changing how
rendering works — needs the whole compile+render subsystem and how its parts coordinate.

**Why this level:** A cohesive feature cluster in `template/base.py` with two interrelating phases
rather than one line: (a) compile kicked off at construction (`Template.__init__` →
`compile_nodelist`), (b) lex (`Lexer.tokenize`/`create_token`, token classification), (c) parse
(`Parser.parse` building a `NodeList` of typed nodes), (d) render traversal (`Template.render` →
`NodeList.render` → per-node `render_annotated`/`render`, with `VariableNode` resolving an
expression). The agent must understand how the node-type hierarchy and the two phases cooperate,
not trace one call. Entry ambiguity: "compile" and "render" are separate entry points on the same
object, and the token type determines which node class results — the agent must discover and join
both phases. Exceeds L3 because it's a bounded module with multiple cooperating paths (compile +
render + node hierarchy), not a single ordered chain; stays below L5 because it is one
feature/area (the template engine), not a concern threaded across multiple subsystems.

**Ground-truth answer sketch:** see `L4.reference.md` (four pieces: `Template.__init__`/
`compile_nodelist` `base.py:143`/179; `Lexer.tokenize`/`create_token` `:419`/433; `Parser.parse`
→ `NodeList` `:530`/541; `Template.render`→`NodeList.render`→`render_annotated`/`VariableNode.render`
`:169`/1107/1061/1165).

**Neutrality check:** text — grep `Lexer`/`Parser`/`NodeList`/`compile_nodelist`/`render` and
stitch the module; structural — the call cluster around `Template` plus the `Node`/`NodeList`
class hierarchy; semantic — refs/defs across the classes. All feasible; the two-phase split means
no tool auto-links compile-time to render-time — every regime must connect them, so none is
uniquely advantaged. Not isomorphic: spans several classes and two phases; no single primitive
returns "the subsystem."

**Scope note (L2 vs L4):** both reference `render_value_in_context` (`template/base.py:1140`). L2
owns the escape *decision* (`conditional_escape` and the `__html__` convention); L4 treats
`render_value_in_context` only as the tail of `VariableNode.render` and lists escaping as an
acceptable extra, not spine. No collision (mirrors redis L2/L5 split).

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to how persisting a model instance interacts with the database,
so I need to understand the full journey of saving a single object. Starting from the public save
entry point, through the once-per-save bookkeeping where lifecycle notifications are emitted, then
how it decides between updating an existing row and inserting a new one, and finally how that
choice is turned into an actual SQL statement run against the database connection — walk me
through that whole flow and how the stages connect."

**Larger task it slices from:** changing save semantics (new lifecycle hook, altered
insert/update decision, custom SQL emission) — requires the end-to-end model→signal→query→
compiler→backend spine across subsystems.

**Why this level:** A concern threading three subsystems — the model layer (`db/models/base.py`
`save`/`save_base`/`_save_table`/`_do_insert`/`_do_update`), the signal layer
(`db/models/signals.py` `pre_save`/`post_save`), and the SQL/query + backend layer
(`db/models/query.py` `_insert`/`_update`, `db/models/sql/compiler.py` `execute_sql` →
`cursor.execute`). It is whole-system: the agent integrates "announce" (signals), "decide"
(update-first-then-insert in `_save_table`), and "emit + run" (queryset → compiler → DB cursor) —
distinct modules that only make sense together. Entry ambiguity is high: the model layer never
emits SQL directly; the write is deferred through manager→queryset→`InsertQuery`→compiler, and the
update path is a parallel mirror, so the agent must discover the hand-off rather than find a
direct DB call. Exceeds L4 because it crosses subsystem boundaries (model ↔ signals ↔ query/SQL ↔
backend) instead of staying inside one feature module.

**Ground-truth answer sketch:** see `L5.reference.md` (`save` `base.py:841`→`save_base` `:904`/950
with `pre_save.send` `:976` / `post_save.send` `:1011`; `_save_table` `:1069` update-first `:1140`
else insert `:1199`; `_do_insert` `:1246`→`QuerySet._insert` `query.py:2112`→`get_compiler().
execute_sql` `:2137`→`SQLInsertCompiler.execute_sql` `compiler.py:1925`→`cursor.execute` `:1936`;
update mirror `_do_update` `:1206`→`QuerySet._update` `query.py:1428`).

**Neutrality check:** text — grep `save_base`, `_save_table`, `_do_insert`, `_insert`,
`execute_sql` and assemble across files; structural — call edges from `save` through the model
write funcs into the compiler; semantic — refs/defs chaining the same. All feasible. The
manager→query→compiler deferral defeats a naive single-call trace for every regime equally — each
must reason about the hand-off — so none is uniquely required. Not isomorphic: the flow spans ~8
functions across base.py/query.py/compiler.py/signals.py plus the update/insert branch, well
beyond any one primitive.

---

## Calibration notes for the reviewer

- **L2/L4 file overlap:** handled above — `render_value_in_context` is L2 spine (escape decision)
  and L4 extra (render tail). No scope collision.
- **L1/L3 overlap:** L1 is the *shape* of `ResolverMatch`; L3 traverses the request path and only
  *produces/unpacks* it at one hop (`resolve_request`). Different scope (one object's makeup vs an
  end-to-end chain). The L3 key lists `ResolverMatch` only as the resolver's return, not spine
  detail.
- **L5/signals:** L5 centers the data path; the `ModelSignal.send` dispatch *mechanism* is left as
  an acceptable extra so it could be reused as a focal neighborhood elsewhere without collision.
- **Async twins:** L3 and L5 both have async variants (`*_async`, async-capable signals). The sync
  spine in each key is load-bearing and correct; judges should accept mention of the async path
  but not require it.
- Every `file:line` above was opened and confirmed against the pinned SHA.
