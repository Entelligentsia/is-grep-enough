# Spring Boot prompt rationale (offline — never seen by runtime)

Source pinned at `experiment/repos/spring-boot` (SHA e16c5d01417f5a6efc35714e83060aadc17a9321, Java
24, Spring Boot 4.0.x main). All file:line cites verified against that tree. The five levels are
drawn from five distinct areas so no level's traversal scope collides with another, mirroring the
redis anchor.

---

## L1 — local (one entity, one fact, 0 hops)

**Prompt:** "I'm adding a new option that controls how a @ConfigurationProperties type is bound, and I
keep tripping on the difference between the descriptor the binder is handed for a target and the actual
value instance that may already exist for it. I need to understand that descriptor object: what it
carries to record the type being bound versus the boxed type used for conversion, the existing or
supplied value, any annotations and binding restrictions, and how it distinguishes setter-based
JavaBean binding from constructor-based value-object binding. Help me see what that descriptor holds
and how those pieces constrain one another."

**Larger task it slices from:** adding a new binding option/annotation that changes how a
`@ConfigurationProperties` class is bound — needs a clear model of the bindable descriptor and how
`bindMethod` and an existing value interact first.

**Why this level:** The answer lives at one definition site — `Bindable<T>` in
`context/properties/bind/Bindable.java:46-62` — and is one concrete fact (the shape of one entity).
To answer well the agent must integrate the role of six adjacent final fields (`type` vs `boxedType`,
`value`, `annotations`, `bindRestrictions`, `bindMethod`) plus the invariant tying `bindMethod`
(VALUE_OBJECT) and `value` together (`withExistingValue` `:197`/`:201`, `withBindMethod` `:241`). It
never leaves that one class — 0 call hops. It is not primitive-isomorphic: it asks for the *role* of
the fields and how `type` differs from `boxedType` and how `bindMethod` constrains `value`, which must
be read off the declaration, not produced by a single "jump to definition." Exceeds nothing below
(floor).

**Ground-truth answer sketch:** see `L1.reference.md` (entity `Bindable<T>` `Bindable.java:46`;
type/boxedType/value/annotations/bindRestrictions/bindMethod spine; the value-object/existing-value
invariant).

**Neutrality check:** text — grep `class Bindable` / `private final` lands on the fields;
structural — the class declaration is one node with field members; semantic — go-to-def on `Bindable`.
All three reach the same single site; differences are only cost, not feasibility. Not isomorphic
because the *understanding* (type vs boxedType, JAVA_BEAN vs VALUE_OBJECT, the invariant) must be
read off the fields, not returned by the locate primitive itself.

---

## L2 — neighborhood (symbol + its direct sources/consumers, 1 hop)

**Prompt:** "I want to change how the process exit code is chosen when a Spring Boot application ends,
whether it finishes by failing during startup or by an explicit programmatic shutdown, and I need to
cover every place a code can come from. Walk me through the routine(s) that assemble the final exit
code, the different sources that can contribute one (a thrown exception that itself carries a code, a
mapped exception, a bean or a supplied generator), how the contributing generators are ordered and
combined, and how the chosen code is then published or returned to the caller."

**Larger task it slices from:** changing exit-code aggregation (e.g. a new generator source, a new
ordering rule, or altering what happens with the chosen code) — must first know the aggregator, all
the sources, and the two entry points.

**Why this level:** One focal aggregator — `ExitCodeGenerators` (`ExitCodeGenerators.java:42`) plus its
first-non-zero `getExitCode` rule (`:92`) — and its 1-hop neighborhood: the two exception sources
(generator-exception with cause recursion `SpringApplication.java:912`, mapper-bean via
`MappedExitCodeGenerator` `ExitCodeGenerators.java:113`), the compose step (`getExitCodeFromException`
`:894`), and the two consumers (`handleExitCode` failure path `:881`, `SpringApplication.exit`
programmatic path `:1396`). Synthesis required: the consumers do different things with the result
(failure path publishes `ExitCodeEvent` + registers with the handler; `exit` returns it to the caller
and closes the context), and the generators are `@Order`-sorted so "first non-zero" is well-defined.
Exceeds L1 because it is no longer one site/one fact — it fans out to several sources + two entry
points and relates them to one aggregation rule. It stops short of L3 because there is no ordered chain
to walk — it's a star (one aggregator, its sources + consumers), not a path.

**Ground-truth answer sketch:** see `L2.reference.md` (`ExitCodeGenerators` `:42`, `getExitCode` `:92`,
sort `:79`; generator-exception `SpringApplication.java:912-919`; mapper-bean
`getExitCodeFromMappedException` `:902-909` + `MappedExitCodeGenerator` `:113`; `handleExitCode` `:881`;
`exit` `:1396`; SPIs `ExitCodeGenerator` `:29`/`ExitCodeExceptionMapper` `:27`).

**Neutrality check:** text — grep `ExitCodeGenerator(s)` / `handleExitCode` / `SpringApplication.exit`
yields the aggregator + both entry points directly; structural — the class node + its method/field
edges + the call sites; semantic — find-refs on `ExitCodeGenerator`/`getExitCode` across
`SpringApplication`. Each reaches the same neighborhood; cost differs (grep returns raw hits to read;
structural/semantic give the reference set), feasibility does not. Not isomorphic: a find-refs on the
SPI lists the sources but does not explain the *first-non-zero ordered* rule or *what each consumer
does* — that needs reading and integrating each site.

---

## L3 — path (directed chain across files, multi-hop, one path)

**Prompt:** "I want to instrument the full startup of a Spring Boot application from the moment
SpringApplication.run is invoked until the application is reported as ready, so I need the precise
sequence of phases it goes through. Walk me through, in order, how run prepares the environment and
gets environment post-processors to run, creates the application context, prepares and loads it,
refreshes it, invokes the run-time runners, and signals started and ready. Help me see how the run
listeners are woven into those phases and where control is handed off across the involved classes."

**Larger task it slices from:** adding cross-cutting startup instrumentation, or changing a phase of
the run lifecycle — needs the precise run → environment → context → refresh → runners → ready spine
and how the listener composite wires into it.

**Why this level:** A single directed chain threaded through `SpringApplication.java`,
`SpringApplicationRunListeners.java` (composite), `EventPublishingRunListener.java` (the built-in run
listener that publishes `SpringApplicationEvent`s), `EnvironmentPostProcessorApplicationListener.java`
(consumes the environment-prepared event to run `EnvironmentPostProcessor`s), and the runner
interfaces. Multiple hops, followed in order: run → starting → prepareEnvironment → (event hop to env
post-processors) → createApplicationContext → prepareContext(contextPrepared/load/contextLoaded) →
refreshContext → afterRefresh → started → callRunners → ready. Entry ambiguity is real: the listener
composite is a separate class from the event publisher, and the environment-prepared phase only
reaches the post-processors *through* the event (composite → `EventPublishingRunListener` →
`EnvironmentPostProcessorApplicationListener`), so the agent must pick that live path. Exceeds L2
because it is an ordered multi-file traversal (a path), not a one-hop star; stays below L4 because it
is one linear lifecycle path, not a cluster of interrelating paths forming a subsystem.

**Ground-truth answer sketch:** see `L3.reference.md` (ordered chain `run` `SpringApplication.java:304`
→ `getRunListeners` `:312`/`:453` + `starting` `:313` → `prepareEnvironment` `:316`/`:350` +
`environmentPrepared` `:356` → `EventPublishingRunListener.environmentPrepared` `:80-83` →
`EnvironmentPostProcessorApplicationListener` `:118`/`:130`/`:136-137` → `createApplicationContext`
`:318`/`:579` → `prepareContext` `:320`/`:380` → `refreshContext` `:321`/`:441` → `afterRefresh`
`:322` → `started` `:327` → `callRunners` `:328`/`:767`/`:786` → `ready` `:335`).

**Neutrality check:** text — grep the method names and follow calls between them; structural —
call-graph edges from `run` through the listener composite into `EventPublishingRunListener` and the
listener; semantic — go-to-def chained call by call. All three can walk the chain; grep must read each
body to find the next callee and the event hop (higher cost), structural/semantic surface callees
directly. Feasible for all. Not isomorphic: no single primitive yields an 11-hop *ordered path* across
five classes; the agent must decide the order and the right branch at the composite/event boundary.

---

## L4 — subsystem (a bounded cooperating cluster, multi-hop, one area)

**Prompt:** "I'm trying to reason about how Spring Boot decides which auto-configuration classes
actually get imported, from the moment the auto-configuration import selector is asked for imports
until the surviving set is returned. I need to understand how the candidate list is loaded and
de-duplicated, how exclusions are gathered and applied, how the fast class-level filter prunes
candidates before their conditions are even evaluated, how that filter records its decisions, and how
the surviving result is grouped and surfaced. Walk me through how these cooperating pieces fit
together."

**Larger task it slices from:** changing auto-configuration selection (e.g. a new exclusion source, a
new fast filter, or altering what the filter records) — needs the whole import→filter→record→surface
subsystem and how its parts coordinate across the import/condition/report boundary.

**Why this level:** A cohesive feature cluster spanning `AutoConfigurationImportSelector.java`,
`AutoConfigurationImportFilter.java`, `AutoConfigurationMetadataLoader.java`,
`condition/FilteringSpringBootCondition.java`, `condition/OnClassCondition.java`,
`condition/ConditionEvaluationReport.java`, and the `META-INF/spring/...AutoConfiguration.imports`
resource, with several interrelating paths rather than one line: (a) candidate loading from the
imports file, (b) de-dup + exclusions, (c) the fast `AutoConfigurationImportFilter` +
`AutoConfigurationMetadata` pruning, (d) the `FilteringSpringBootCondition`→`ConditionEvaluationReport`
recording bridge, (e) the event + deferred `AutoConfigurationGroup` surfacing. The agent must
understand how these cooperate across the import/condition boundary (a metadata properties file so the
filter can decide without loading bytecode, and a report that records the outcome), not just trace one
call. Entry ambiguity: "how it's recorded" spans the `match` call site AND the report, two distinct
objects the agent has to join. Exceeds L3 because it's a bounded module with multiple cooperating paths
(not a single ordered chain); stays below L5 because it is one feature/area (auto-configuration
selection), not a concern threaded across multiple subsystems.

**Ground-truth answer sketch:** see `L4.reference.md` (five pieces: candidate loading
`AutoConfigurationImportSelector.java:200-202` via `ImportCandidates.java:81` reading
`META-INF/spring/...AutoConfiguration.imports`; de-dup+exclusions `:148-151`; fast filter
`ConfigurationClassFilter` `:392`/`:399` + `AutoConfigurationImportFilter.java:59` +
`AutoConfigurationMetadataLoader.java:43`; recording `FilteringSpringBootCondition.java:52-65` →
`ConditionEvaluationReport.java:82` via `OnClassCondition.java:46`; event/deferred group `:153`/
`:431`/`:467`).

**Neutrality check:** text — grep `selectImports`/`getAutoConfigurationEntry`/`AutoConfigurationImportFilter`
/`recordConditionEvaluation` and stitch the module; structural — the call cluster around
`getAutoConfigurationEntry` plus the `AutoConfigurationImportFilter` reference set; semantic —
refs/defs across the selector + condition files. All feasible; the bytecode-free metadata boundary
means *no* tool auto-links the filter to the candidate classes — every regime must reason about the
metadata file + the report, so none is uniquely advantaged. Not isomorphic: spans multiple
classes/files and a metadata resource; no single primitive returns "the subsystem."

---

## L5 — cross-cutting (a concern threading multiple subsystems, whole-system)

**Prompt:** "I'm planning a change to how a property set as an environment variable ends up bound into
a @ConfigurationProperties bean, so I need the full journey of one relaxed property value through the
binding machinery. Starting from a raw property source held in the environment, how it gets attached
and adapted so the binder can read it, how a configuration name is mapped back to the underlying
property name (including the environment-variable name forms), how the binder resolves the property
and runs the bind-handler callbacks, how the value is converted, and finally how a bound result is
produced. Walk me through that whole flow and how the stages connect."

**Larger task it slices from:** modifying relaxed binding (e.g. new env-var name forms, a new handler,
or conversion changes) — requires the end-to-end env-var → adapted source → name mapping → binder →
handler → converter → bound result spine across subsystems.

**Why this level:** A concern that threads four subsystems — the environment/property-source layer
(`ConfigurationPropertySources.attach`), the source-adaptation + name-mapping layer
(`SpringConfigurationPropertySource` + `SystemEnvironmentPropertyMapper`/`PropertyMapper`), the
binder + `BindHandler` layer (`Binder.bind` + `onStart`/`onSuccess`/`onFinish`), and conversion
(`BindConverter`). It is whole-system: the agent integrates "attach & adapt," "name-form resolution,"
"resolve + handler callbacks," and "convert + produce result" — distinct modules that only make sense
together. Entry ambiguity is high: the binder does not read the env var directly; the value is
surfaced through an adapter that maps a `ConfigurationPropertyName` to several env-string candidates,
so the agent must discover that indirection (`getConfigurationProperty` → `mapper.map` →
`getPropertySourceProperty` → `ConfigurationProperty.of`) rather than find a direct read. Exceeds L4
because it crosses subsystem boundaries (env ↔ source-adaptation ↔ binder ↔ conversion) instead of
staying inside one feature module.

**Ground-truth answer sketch:** see `L5.reference.md` (`ConfigurationPropertySources.attach`
`SpringApplication.java:355`/`ConfigurationPropertySources.java:89` →
`SpringConfigurationPropertySource.getConfigurationProperty` `:85` + `SystemEnvironmentPropertyMapper.map`
`SystemEnvironmentPropertyMapper.java:47` → `ConfigurationProperty.of` `ConfigurationProperty.java:79`
→ `Binder.bind` `Binder.java:287`/`:365` `onStart` `:369` → `findProperty` `:476`/`:482` →
`bindProperty` `:490` → `handleBindResult` `:384` `onSuccess`/`onFinish` + `BindConverter` `:388`/
`BindConverter.java:58` → `BindResult.of` `:289`).

**Neutrality check:** text — grep `ConfigurationPropertySources.attach`,
`SystemEnvironmentPropertyMapper`, `getConfigurationProperty`, `Binder.bind`,
`context.getConverter().convert` and assemble across files; structural — call edges from `bind` into
`findProperty` into `getConfigurationProperty` into `mapper.map`; semantic — refs/defs chaining the
same. All feasible. The adapter + name-mapping indirection defeats a naive single-read trace for every
regime equally — each must reason about name→candidate-string→value→convert — so none is uniquely
required. Not isomorphic: the flow spans ~6 classes across `source/`, `bind/`, and `bind/validation/`
plus a property-source adaptation, well beyond any one primitive.

---

## Calibration notes for the reviewer

- **L1 and L5 both touch the binding domain, at very different scopes.** L1 is scoped to the *shape of
  one descriptor class* (`Bindable`, 0 hops, one fact); L5 is the *end-to-end flow* across env,
  source-adaptation, binder, and conversion (whole-system). The L1 subject is not a component of the
  L5 spine's *concern* (the descriptor is consumed by the binder but the L5 prompt is about the journey
  from env var to bound result, not about the descriptor's shape), so there is no scope collision — this
  mirrors the redis anchor where `robj` (the value container, L1) is the unit the L5 write-path begins
  from, yet the two levels ask about different traversal scopes. The L4 subject (auto-configuration
  selection) is a different area again, so no level overlaps another.
- **L2/L3 both touch the run lifecycle, different concerns.** L2 is the exit-code aggregation star
  (shutdown); L3 is the forward run sequence (startup). Different concerns and different scopes
  (1-hop neighborhood vs ordered multi-hop chain), analogous to redis L2 (on-access expiry) vs L3
  (request path) both touching request handling.
- **L3 cross-file hop:** the environment-prepared phase only reaches the `EnvironmentPostProcessor`s
  through the published event (`EventPublishingRunListener` → `EnvironmentPostProcessorApplicationListener`).
  That is the load-bearing multi-file link; judges should accept answers that also name the active
  background sweep... (N/A here) — accept answers that mention the `SpringApplicationHook` listener or
  AOT short-circuit but should not require them.
- **L4 bytecode-free filter:** the fast `AutoConfigurationImportFilter` pass (with
  `spring-autoconfigure-metadata.properties`) is distinct from Spring's later `@Conditional`
  `ConditionEvaluator` pass inside `refresh`. The prompt is deliberately about the fast pre-bytecode
  filter; a complete answer may mention the later condition pass as contrast but must centre the fast
  filter. This mirrors the redis L4 distinction between disk-bgsave and diskless variants.
- Every file:line above was opened and confirmed against the pinned SHA.
