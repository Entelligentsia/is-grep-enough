# Laravel prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/laravel` (SHA
2107d3d7079993fd2e82777674fae5b65d87997f, PHP — the `laravel/framework` repo). All
file:line cites verified against that tree. This is a recent Laravel (13.x-line, per the
pinned HEAD "Merge branch '12.x' into 13.x"); entities are taken from that tree as-is.

Leveling is calibrated against the approved redis anchor at
`experiment/prompts/redis/` (read in full) so the traversal-depth bar matches.

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm trying to reason about what Laravel actually carries around for a single
incoming HTTP request — the object that represents one request as it moves through the
application. I need to understand what that request object holds beyond the raw PHP/Symfony
input bags it inherits: how it separates the parsed JSON body from the form and query
inputs, what lazily-resolved callbacks it stashes for the authenticated user and the
matched route, and what else it caches for content negotiation. Walk me through the makeup
of that request object."

**Larger task it slices from:** writing middleware that needs to know which representation
of the body it is reading, or adding a request-level cached field (e.g. a new content-type
hint) — needs a clear mental model of `Illuminate\Http\Request`'s shape first.

**Why this level:** The answer lives at a single declaration site — `Illuminate\Http\Request`
in `src/Illuminate/Http/Request.php:29` and its field block (`:43`-`:71`) — and is one
concrete fact (the shape of one entity). To answer well the agent must integrate the meaning
of several adjacent fields (`$json`, `$convertedFiles`, `$userResolver`, `$routeResolver`,
`$cachedAcceptHeader`), the trait composition (`:31-36`), the inherited Symfony bags (via
`extends SymfonyRequest` at `:29`), and the JSON-vs-form/query selector `getInputSource()`
(`:480`) backed by `json()` (`:462`) — but it never leaves that one class neighborhood,
0 call hops. It is not primitive-isomorphic: it asks for the *role* of the fields and how the
JSON body representation differs from the form/query bags, which must be read off the
declarations and `getInputSource`, not produced by a single "jump to definition." Exceeds
nothing below (floor).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `Illuminate\Http\Request`,
`Request.php:29`; `$json` `:43` + `getInputSource` `:480` distinction; `$userResolver`
`:57`, `$routeResolver` `:64`, `$convertedFiles` `:50`, `$cachedAcceptHeader` `:71`;
inherited Symfony bags).

**Neutrality check:** text — grep `class Request` / `protected $json` lands on the file;
structural — the class declaration node; semantic — go-to-def on `Request`/`$this->json`.
All three reach the same single site; differences are cost only, not feasibility. Not
isomorphic because the *understanding* (JSON bag vs form/query bags, what the resolver
closures are for) must be read off the fields and `getInputSource`, not produced by the
locate primitive itself.

---

## L2 — neighborhood (a focal routine + its direct callers, 1 hop)

**Prompt:** "To decide whether a given action should be allowed for the current user at a
particular point in handling a request — and to do the right thing when it isn't — I need to
understand the routine that actually evaluates an ability and returns the verdict, together
with the places that call it to either get a plain yes/no answer, branch on that answer, or
abort with an authorization error. Help me see how that central check is reached during a
request and what the various callers do with its outcome."

**Larger task it slices from:** changing authorization semantics (e.g. a new verdict shape, a
listener on every check, or a context that suppresses the throw) — must first know the
central routine and how callers consume its outcome.

**Why this level:** One focal routine — `Gate::inspect($ability, $arguments)`
(`src/Illuminate/Auth/Access/Gate.php:408`), built on `raw` (`:434`) and producing a
`Response` (`src/Illuminate/Auth/Access/Response.php:8`) — plus its direct callers, exactly
one hop out. The callers are a real cluster the agent must gather and read: `check` (`:356`,
bool via `allowed()`), `authorize` (`:396`, throw via `authorize()`), and the boolean wrappers
`allows`/`denies`/`any`/`none` (`:332`/`:344`/`:370`/`:380`). Synthesis is required: the
callers consume the *same* `Response` verdict in different ways (return bool, negate, throw),
so "what they do with the outcome" can't be read from the focal definition alone. Exceeds L1
because it is no longer one site/one fact — it fans out to several callers and relates them
to one routine. It stops short of L3 because there is no ordered chain to walk — it is a star
(one routine, its callers), not a path.

**Ground-truth answer sketch:** see `L2.reference.md` (focal `inspect` `Gate.php:408` +
`raw` `:434` → `Response`; callers `check` `:356`, `authorize` `:396`, `allows/denies/any/none`
`:332`/`:344`/`:370`/`:380`; `Response::allow/deny/authorize` `Response.php:59/71/148`).

**Neutrality check:** text — grep `function inspect`/`function authorize`/`function check`
inside `Gate.php` yields the focal routine and the callers directly; structural — the method
nodes plus the reference set from `inspect`; semantic — find-refs on `inspect`. Each reaches
the same neighborhood; cost differs (grep returns raw hits to be read; structural/semantic
give the reference set), feasibility does not. Not isomorphic: a single find-refs lists the
callers but does not tell you *what each does with the `Response`* (bool vs throw vs negate) —
that needs reading and integrating each site.

---

## L3 — path (a directed chain across files, multi-hop, one path)

**Prompt:** "I want to trace what happens to a single incoming HTTP request from the moment
the application kernel takes it until the matching controller method actually runs. I'm
interested in how the request is handed off into the routing layer, how the matching route is
found, how it is pushed through the route's middleware stack, and how control is finally
dispatched into the controller action that invokes the method. Walk me through that sequence
in order, end to end."

**Larger task it slices from:** adding per-request instrumentation across the dispatch
pipeline, or changing routing/middleware/controller-dispatch behavior — needs the precise
kernel → router → route → controller spine.

**Why this level:** A single directed chain threaded through `Foundation/Http/Kernel.php`,
`Routing/Router.php`, `Routing/Route.php`, and `Routing/ControllerDispatcher.php`, multiple
hops, followed in order: `Kernel::handle` → `sendRequestThroughRouter` (global-middleware
`Pipeline`) → `dispatchToRouter` → `Router::dispatch` → `dispatchToRoute` → `findRoute` →
`runRoute` → `runRouteWithinStack` (route-middleware `Pipeline`) → `Route::run` →
`runController` → `ControllerDispatcher::dispatch` → `Controller::callAction` →
`$this->{$method}(...)`. Each step names the next; the agent must follow them as a sequence,
not collect neighbors. Entry ambiguity is real: the hand-off is a closure
(`dispatchToRouter`, `Kernel.php:195`) that calls `Router::dispatch`, and the terminal step is
nested two `Pipeline`s deep, so the agent must pick the live path through both onion layers.
Exceeds L2 because it is an ordered multi-file traversal (a path), not a one-hop star; stays
below L4 because it is one linear path, not a cluster of interrelating paths forming a
subsystem.

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `Kernel::handle`
`Kernel.php:137` → `sendRequestThroughRouter` `:164` → `dispatchToRouter` `:195` →
`Router::dispatch` `Router.php:749` → `dispatchToRoute` `:762` → `findRoute` `:770` →
`runRoute` `:793` → `runRouteWithinStack` `:811` → `Route::run` `Route.php:209` →
`runController` `:273` → `ControllerDispatcher::dispatch` `ControllerDispatcher.php:38` →
`Controller::callAction` `Controller.php:52` → `$this->{$method}(...)` `:54`).

**Neutrality check:** text — grep the method names and follow the calls between them;
structural — call-graph edges from `Kernel::handle` down to `callAction`; semantic —
go-to-def chained call by call. All three can walk the chain; grep must read each body to
find the next callee (higher cost), structural/semantic surface callees directly. Feasible
for all. Not isomorphic: no single primitive yields a ~9-hop ordered path through two
`Pipeline` layers; the agent must decide the order and the right branch at each step
(controller vs callable at `Route::run`).

---

## L4 — subsystem (a bounded cooperating cluster, one area)

**Prompt:** "I'm studying how Laravel keeps pulling jobs off a queue and running them in a
long-lived worker process without blocking the caller and without losing jobs when they
fail. I need to understand how the worker loop decides whether it should keep running at all,
how it obtains the next job, how a job is fired and what events are raised around it, and how
an exception thrown while running a job is turned into either a delayed retry or a permanent
failure. Show me how these cooperating pieces fit together."

**Larger task it slices from:** changing worker behavior (new stop condition, different
backoff, a new event around job lifecycle, or altering failure marking) — needs the whole
queue-worker subsystem and how its parts coordinate via events and the `release`/`delete`/
`fail` state machine.

**Why this level:** A cohesive feature cluster in `src/Illuminate/Queue/Worker.php` and
`src/Illuminate/Queue/Jobs/Job.php`, with several interrelating paths rather than one line:
(a) the `daemon` loop with its keep-running/stop decisions, (b) the per-job `process`→`fire`
run path and the events raised around it, (c) the `handleJobException` retry-vs-fail path
with backoff, (d) the permanent-failure marking + `JobFailed` event. The agent must
understand how these cooperate (the loop calls `runJob`→`process`→`fire`; `process`'s
try/catch/finally routes exceptions to `handleJobException`, whose `finally` releases for
retry unless the job is already deleted/released/failed; the events are the coordination
channel), not just trace one call. Entry ambiguity: "turned into either a delayed retry or a
permanent failure" spans *both* `handleJobException`'s `finally` (release+backoff) and the
`markJobAsFailed*` checks (`Worker.php:659/680/706/721`) plus `Job::failed` (`Job.php:247`),
distinct mechanisms the agent must discover and join. Exceeds L3 because it is a bounded
module with multiple cooperating paths (not a single ordered chain); stays below L5 because
it is one feature/area (the queue worker), not a concern threaded across multiple
subsystems.

**Ground-truth answer sketch:** see `L4.reference.md` (four pieces: loop `daemon` `Worker.php:194`
+ `daemonShouldRun` `:344` + `stopIfNecessary` `:379` + `getNextJob` `:425`; run path
`runJob` `:494` → `process` `:534` → `Job::fire` `Job.php:96` with `JobProcessing`/`JobProcessed`
(`:805/819`); exception path `handleJobException` `:578` → `markJobAsFailed*` `:659/680/706`
→ `calculateBackoff` `:747` → `release` `:623` + `JobReleasedAfterException` `:625`; failure
`Job::failed` `Job.php:247` + `JobFailed`).

**Neutrality check:** text — grep `daemon`/`process`/`handleJobException`/`markJobAsFailed`/
`calculateBackoff`/`failed` and stitch the module; structural — the call cluster around
`daemon` plus the `Job::fire`/`failed` references; semantic — refs/defs across the two files.
All feasible; the run-vs-exception branching and the three terminal states
(`release`/`delete`/`fail`) defeat a naive single-call trace for every regime equally — each
must reason about the try/catch/finally control flow — so none is uniquely advantaged. Not
isomorphic: spans multiple methods and an event-coordination channel; no single primitive
returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to how a dispatched event reaches its handlers, so I need
to understand the full journey of an event through the system. Starting from firing the
event, then how its listeners are resolved, how a listener that should run on a queue is
detected and handed off to a queue connection as a serializable job, and finally how that job
is later picked up by a queue worker and turned back into the actual listener method call —
walk me through that whole flow and how the stages connect. I also want to know where
broadcasting an event fits in alongside the listener path."

**Larger task it slices from:** modifying event-delivery semantics (e.g. how/when queued
listeners are serialized, a new delivery sink, or filtering which listeners queue) —
requires the end-to-end event → listener-resolution → queue-handoff → worker-execution spine
across subsystems, plus the broadcasting sibling.

**Why this level:** A concern that threads at least three subsystems — the Event dispatcher
(`Illuminate\Events\Dispatcher`), the Queue transport (`Queue::pushOn`/`createObjectPayload`),
and the Bus/queue-job execution path (`Illuminate\Queue\CallQueuedHandler` +
`Illuminate\Bus\Dispatcher` + `Illuminate\Queue\Jobs\Job`), with Broadcasting as a sibling
sink (`BroadcastFactory::queue`). It is whole-system: the agent integrates "fire the event"
(`dispatch`), "resolve listeners and decide sync-vs-queued" (`getListeners` →
`handlerShouldBeQueued`), "serialize and hand to the queue" (`CallQueuedListener` +
`pushOn`), and "on a worker, re-hydrate and run the listener method"
(`Job::fire` → `CallQueuedHandler::call` → Bus `dispatchNow` → `CallQueuedListener::handle`)
— distinct modules that only make sense together. Entry ambiguity is high: a queued listener
is *not* executed by the event dispatcher at all; it is serialized into a
`CallQueuedListener` job whose worker payload is `Illuminate\Queue\CallQueuedHandler@call`
(set in `Queue.php:175`), so the agent must discover the Event→Queue→Bus indirection and the
`CallQueuedListener`/`CallQueuedHandler` bridge across the queue boundary, plus the parallel
broadcasting sink in `invokeListeners`. Exceeds L4 because it crosses subsystem boundaries
(Events ↔ Queue ↔ Bus, with Broadcasting) instead of staying inside one feature module.

**Ground-truth answer sketch:** see `L5.reference.md` (dispatch `Dispatcher.php:280` →
`invokeListeners` `:320` → `shouldBroadcast` `:372`/`broadcastEvent` `:398` broadcasting sink;
`getListeners` `:409` → `makeListener` `:484` → `createClassListener` `:510` →
`createClassCallable` `:529` → `handlerShouldBeQueued` `:570` → `createQueuedHandlerCallable`
`:588` → `queueHandler` `:660` → `createListenerAndJob` `:706`/`CallQueuedListener` `:711` →
`pushOn`/`laterOn` `:690-691` queue sink; worker terminal `Job::fire` `Job.php:96` with
`CallQueuedHandler@call` from `Queue.php:175` → `CallQueuedHandler::call`
`CallQueuedHandler.php:67` → `getCommand` `:111` → `dispatchThroughMiddleware` `:131` →
`Bus\Dispatcher::dispatchNow` `Bus/Dispatcher.php:118` → `CallQueuedListener::handle`
`CallQueuedListener.php:133` → `$handler->{$method}(...$data)` `:140-141`).

**Neutrality check:** text — grep `dispatch`/`handlerShouldBeQueued`/`CallQueuedListener`/
`CallQueuedHandler`/`pushOn`/`broadcastEvent` and assemble across the Events, Queue, and Bus
files; structural — call edges from `Dispatcher::dispatch` through the listener factory into
the queue push, plus the `CallQueuedHandler::call` cluster on the worker side; semantic —
refs/defs chaining the same, including the `CallQueuedListener`↔`CallQueuedHandler` bridge.
All feasible. The queue-boundary indirection (a serialized job whose worker entry is a
different class than the pushed object) defeats a naive single-call trace for every regime
equally — each must reason about the serialize-on-dispatch / re-hydrate-on-worker split — so
none is uniquely required. Not isomorphic: the flow spans ~10 functions across
Events/Queue/Bus and a data-structure handoff (`CallQueuedListener`), well beyond any one
primitive.

---

## Calibration notes for the reviewer

- **L1 vs L3 share the request entity but not the scope.** L1 is the *shape* of
  `Illuminate\Http\Request` (one declaration site, 0 hops); L3 is the *dispatch path* through
  the kernel/router/controller (a multi-hop chain). The redis anchor likewise keeps entity
  and path distinct (robj vs the command path); here the request object is the input to the
  L3 path but the L1 question is about its field makeup, not its traversal. Scopes strictly
  increase L1→L3.
- **L4 vs L5 share the queue worker terminal.** L4 is the *worker subsystem* self-contained
  in `Worker.php`/`Job.php`; L5 is the *event-delivery concern* that crosses Events→Queue→Bus
  and re-enters the worker (`Job::fire`/`CallQueuedHandler`) as its terminal stage. This
  mirrors the redis anchor where L5 (replication) reuses `call` from L3 (dispatch) as a
  stage; the L5 prompt steers to the event→listener flow and treats the worker execution as
  the terminal, not the subject, so there is no scope collision. L4's subject (the loop,
  retry/fail state machine, worker events) is not the L5 subject (the cross-subsystem
  handoff and the `CallQueuedListener` bridge).
- **L5 broadcasting breadth.** The prompt explicitly asks where broadcasting fits, so a
  complete answer must note the `shouldBroadcast`/`broadcastEvent` → `BroadcastFactory::queue`
  sibling sink; the required spine is the listener path (sync + queued), with broadcasting as
  a required-but-secondary sink.
- **Bus vs Event dispatcher.** Two distinct `Dispatcher` classes appear in L5
  (`Illuminate\Events\Dispatcher` and `Illuminate\Bus\Dispatcher`); the key flags this so the
  judge penalizes answers that conflate them.
- Every file:line above was opened and confirmed against the pinned SHA (laravel/framework @
  2107d3d7…).