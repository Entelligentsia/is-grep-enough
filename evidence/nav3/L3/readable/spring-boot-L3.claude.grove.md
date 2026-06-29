# transcript: I want to instrument the full startup of a Spring Boot application from the moment SpringApplication.run is invoked until the application is reported as read...


💬 Let me load the grove tools and explore the startup sequence structurally.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__outline,mcp__grove__definition,mcp__grove__callers)

💬 Now let me explore the key files in parallel — the `SpringApplication.run` method, the run listeners, and the `EventPublishingRunListener`.
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot -name "SpringApplication.java" -o -name "SpringAppl...)
  ▸ Bash(find /home/bench/repos/spring-boot -name "SpringApplication.java" | head -5)
  ▸ Bash(find /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot -name "SpringApplicationRunListeners.java" -o -name "SpringApplica...)
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListeners.java","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListener.java","detail":0})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","detail":0})

💬 Now let me read the core methods in parallel.
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"run"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"starting"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListener.java","name":"SpringApplicationRu...)
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"prepareEnvironment"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"prepareContext"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"refreshContext"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"callRunners"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"environ...)
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"context...)
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"context...)
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"started"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"ready"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"multica...)

💬 Let me grab a few more pieces to complete the picture.
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"getRunListeners"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"createApplicationContext"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"refresh"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"callRunner"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java","name":"refresh...)
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListeners.java","name":"environmentPrepared"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListeners.java","name":"doWithListeners"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"configureEnvironment"})
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListeners.java","name":"doWithListeners","...)
  ▸ mcp__grove__source({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","name":"applyInitializers"})

💬 I have everything I need. Here is the full annotated walkthrough.  ---  ## Spring Boot startup sequence: `SpringApplication.run` to `ready`  The entire seque...

──────── RESULT (success, 155897ms, 32 turns) ────────
I have everything I need. Here is the full annotated walkthrough.

---

## Spring Boot startup sequence: `SpringApplication.run` to `ready`

The entire sequence lives in `SpringApplication.run` (line 304) and fans out through two collaborating types: `SpringApplicationRunListeners` (the fanout wrapper) and `EventPublishingRunListener` (the bridge to Spring's `ApplicationEvent` system).

---

### Phase 0 — Preamble (before any listener is called)

```
run() line 304
```

1. `Startup.create()` — picks `StandardStartup` or `CoordinatedRestoreAtCheckpointStartup`; records process start time.
2. `shutdownHook.enableShutdownHookAddition()` — arms the JVM hook, if configured.
3. `createBootstrapContext()` — builds a `DefaultBootstrapContext` and runs every `BootstrapRegistryInitializer` registered on the `SpringApplication`. This is the very early DI container for things that must exist before the real `ApplicationContext` does (e.g., config-server credential resolvers).
4. `configureHeadlessProperty()` — sets `java.awt.headless`.
5. `getRunListeners(args)` (line 453) — loads every `SpringApplicationRunListener` from `SpringFactoriesLoader` (only `EventPublishingRunListener` ships by default), appends any listener returned by a `SpringApplicationHook`, and wraps them all in `SpringApplicationRunListeners`.

`SpringApplicationRunListeners` is purely a fanout adapter: every `listeners.X()` call goes through `doWithListeners(stepName, action)`, which opens an `ApplicationStartup.StartupStep` (for metrics), iterates the list calling the action on each listener, then ends the step.

---

### Phase 1 — `starting`

```
listeners.starting(bootstrapContext, mainApplicationClass)
  → EventPublishingRunListener.starting()
    → multicastInitialEvent(new ApplicationStartingEvent(...))
```

`multicastInitialEvent` (line 135) calls `refreshApplicationListeners()` first — which syncs the `SpringApplication`'s own `ApplicationListener` set into the `initialMulticaster` — then multicasts via a bare `SimpleApplicationEventMulticaster` that knows nothing about the `ApplicationContext` yet. The `initialMulticaster` is the only event bus available until `contextLoaded` (see Phase 5).

Event fired: **`ApplicationStartingEvent`**

---

### Phase 2 — Environment preparation

```
prepareEnvironment(listeners, bootstrapContext, applicationArguments)  line 350
```

Inside `prepareEnvironment`:

1. `getOrCreateEnvironment()` (line 475) — instantiates the right `ConfigurableEnvironment` subtype: `StandardEnvironment` (NONE), `ApplicationServletEnvironment` (SERVLET), or `ApplicationReactiveWebEnvironment` (REACTIVE). System properties and OS env vars are already registered as property sources here.

2. `configureEnvironment(environment, args)` (line 498):
   - Installs `ApplicationConversionService` (type converters/formatters).
   - `configurePropertySources()` — adds `defaultProperties` and, if `addCommandLineProperties` is on, wraps the raw `args` in a `SimpleCommandLinePropertySource` at the front of the source list.
   - `configureProfiles()` — applies any profiles set directly on the `SpringApplication`.

3. `ConfigurationPropertySources.attach(environment)` — wraps all existing property sources in a `ConfigurationPropertySourcesPropertySource` so relaxed binding (kebab-case etc.) works from this point on.

4. **`listeners.environmentPrepared(bootstrapContext, environment)`** (line 69 of RunListeners) — this is where `EnvironmentPostProcessor`s run, but indirectly: `EventPublishingRunListener.environmentPrepared()` multicasts **`ApplicationEnvironmentPreparedEvent`** via `initialMulticaster`. `EnvironmentPostProcessorApplicationListener` (registered via `spring.factories`) receives it and invokes each `EnvironmentPostProcessor` in order. That includes `ConfigDataEnvironmentPostProcessor` (loads `application.properties`/`yml`, handles profiles and profile-groups), `RandomValuePropertySource`, `SpringApplicationJsonEnvironmentPostProcessor`, and others.

5. `ApplicationInfoPropertySource.moveToEnd(environment)` / `DefaultPropertiesPropertySource.moveToEnd(environment)` — push low-priority sources to the end after post-processors may have reordered things.

6. `bindToSpringApplication(environment)` (line 550) — binds the `spring.main.*` namespace back onto `this` (the `SpringApplication`), so properties like `spring.main.lazy-initialization` take effect before context creation.

7. Optional `EnvironmentConverter` pass — normalizes the environment type if it doesn't match what the web type expects.

8. `ConfigurationPropertySources.attach(environment)` again — re-attaches after any structural changes.

Event fired: **`ApplicationEnvironmentPreparedEvent`**

---

### Phase 3 — Banner

`printBanner(environment)` (line 559) — resolves and prints the banner. Returns a `Banner` that gets registered as a singleton bean later.

---

### Phase 4 — Context creation

```
context = createApplicationContext()  line 579
```

Delegates to `this.applicationContextFactory.create(webApplicationType)`. The factory (by default `DefaultApplicationContextFactory`) selects:
- `AnnotationConfigApplicationContext` for NONE
- `AnnotationConfigServletWebServerApplicationContext` for SERVLET
- `AnnotationConfigReactiveWebServerApplicationContext` for REACTIVE

`context.setApplicationStartup(this.applicationStartup)` wires in the metrics collector.

---

### Phase 5 — Context preparation

```
prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner)  line 380
```

1. `context.setEnvironment(environment)` — hands the fully-prepared environment to the context.
2. `postProcessApplicationContext(context)` (line 591) — sets custom bean name generator, resource loader, and type conversion service on the context.
3. `addAotGeneratedInitializerIfNecessary(initializers)` — injects the AOT-generated initializer if running in native/AOT mode.
4. Bean factory flags — sets `allowCircularReferences` and `allowBeanDefinitionOverriding` from `SpringApplication.properties`.
5. `applyInitializers(context)` (line 616) — iterates every `ApplicationContextInitializer` (loaded from `spring.factories`) and calls `initializer.initialize(context)`. Examples: `SharedMetadataReaderFactoryContextInitializer`, `ConfigurationWarningsApplicationContextInitializer`, `ConditionEvaluationReportLoggingListener`.

6. **`listeners.contextPrepared(context)`** → `EventPublishingRunListener.contextPrepared()` → `multicastInitialEvent(new ApplicationContextInitializedEvent(...))`

   Event fired: **`ApplicationContextInitializedEvent`**

7. `bootstrapContext.close(context)` — the bootstrap context publishes `BootstrapContextClosedEvent` and becomes inert; anything registered in it that needs to migrate to the real context must do so here.

8. Startup info logging (`logStartupInfo`, `logStartupProfileInfo`).

9. Registers `springApplicationArguments` and `springBootBanner` as well-known singletons in the bean factory.

10. Optionally adds `LazyInitializationBeanFactoryPostProcessor`, `KeepAlive` listener, and always adds `PropertySourceOrderingBeanFactoryPostProcessor`.

11. `load(context, sources)` (line 683) — creates a `BeanDefinitionLoader` over the primary sources (your `@SpringBootApplication` class) and registers their bean definitions into the context's `BeanDefinitionRegistry`. No instantiation yet — only registration.

12. **`listeners.contextLoaded(context)`** → `EventPublishingRunListener.contextLoaded()` (line 92):
    - Iterates `this.application.getListeners()` and adds each to `context` as an `ApplicationListener` (and injects the context if the listener is `ApplicationContextAware`). **This is the transfer point**: from now on these listeners live inside the context and receive events through the context's own multicaster, not `initialMulticaster`.
    - `multicastInitialEvent(new ApplicationPreparedEvent(...))` — last event to go through `initialMulticaster`.

   Event fired: **`ApplicationPreparedEvent`**

---

### Phase 6 — Refresh

```
refreshContext(context)  line 441
  → shutdownHook.registerApplicationContext(context)  [if configured]
  → refresh(context)  line 755
    → context.refresh()
```

`context.refresh()` is standard Spring Framework `AbstractApplicationContext.refresh()`. All the heavy work happens here:
- `BeanFactoryPostProcessor`s run in order (including `ConfigurationClassPostProcessor` which processes `@Configuration`, `@ComponentScan`, `@Import`, `@Bean` — triggering all auto-configuration class loading and conditional evaluation).
- The bean factory is locked.
- All non-lazy singleton beans are instantiated and dependency-injected.
- For servlet/reactive contexts, the embedded web server is created and started during `onRefresh()`.
- The context's own `ApplicationEventMulticaster` is initialized.

`afterRefresh(context, applicationArguments)` (line 764) — empty hook for subclasses; does nothing by default.

---

### Phase 7 — Started + runners

```
startup.started()          → records "started" instant, returns Duration
listeners.started(context, timeTakenToStarted)
  → EventPublishingRunListener.started()  line 103
    → context.publishEvent(new ApplicationStartedEvent(...))
    → AvailabilityChangeEvent.publish(context, LivenessState.CORRECT)
```

From this point on, `context.publishEvent()` is used — not `initialMulticaster` — so events go through the context's fully-wired `ApplicationEventMulticaster` and reach all beans that implement `ApplicationListener`.

Event fired: **`ApplicationStartedEvent`** + liveness → `CORRECT`

```
callRunners(context, applicationArguments)  line 767
```

Collects all beans of type `Runner` (the internal marker interface that `ApplicationRunner` and `CommandLineRunner` both extend), sorts them using `@Order`/`Ordered`/`PriorityOrdered` respecting factory-method order, then calls each:
- `ApplicationRunner.run(ApplicationArguments)`
- `CommandLineRunner.run(String... args)`

Any exception here propagates to `handleRunFailure`, which calls `listeners.failed(context, ex)` and rethrows.

---

### Phase 8 — Ready

```
if (context.isRunning()) {
    listeners.ready(context, startup.ready())
      → EventPublishingRunListener.ready()  line 109
        → context.publishEvent(new ApplicationReadyEvent(...))
        → AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC)
}
return context;
```

`startup.ready()` records the final instant and returns the Duration since process start. The `isRunning()` guard means that if the context was stopped between refresh and this point (e.g., by a `CommandLineRunner` that called `context.close()`), the ready signal is suppressed.

Event fired: **`ApplicationReadyEvent`** + readiness → `ACCEPTING_TRAFFIC`

---

## Summary table: listener callbacks and their events

| `SpringApplicationRunListener` callback | `EventPublishingRunListener` fires | Event bus used |
|---|---|---|
| `starting()` | `ApplicationStartingEvent` | `initialMulticaster` |
| `environmentPrepared()` | `ApplicationEnvironmentPreparedEvent` | `initialMulticaster` → triggers `EnvironmentPostProcessor`s |
| `contextPrepared()` | `ApplicationContextInitializedEvent` | `initialMulticaster` |
| `contextLoaded()` | `ApplicationPreparedEvent` | `initialMulticaster` (last use); transfers listeners to context |
| `started()` | `ApplicationStartedEvent` + `LivenessState.CORRECT` | `context.publishEvent()` |
| `ready()` | `ApplicationReadyEvent` + `ReadinessState.ACCEPTING_TRAFFIC` | `context.publishEvent()` |

---

## Key structural notes

**`initialMulticaster` vs context event bus.** Before refresh the context has no usable event infrastructure. `EventPublishingRunListener` owns a private `SimpleApplicationEventMulticaster` (`initialMulticaster`) seeded with the `SpringApplication`'s pre-registered listeners. The switch happens in `contextLoaded`: those listeners are moved into the context, so `started` and `ready` events reach all auto-configured `ApplicationListener` beans (like `HealthIndicator` adapters) — not just the bootstrap ones.

**`EnvironmentPostProcessor` indirection.** There is no direct hook in the run sequence for `EnvironmentPostProcessor`. They are invoked because `EnvironmentPostProcessorApplicationListener` is pre-registered (via `spring.factories`) and responds to `ApplicationEnvironmentPreparedEvent`. This means application-defined `EnvironmentPostProcessor`s must also be in `spring.factories`/`AutoConfiguration.imports` to participate.

**`bootstrapContext` lifetime.** It is created before any listener fires, passed into `starting` and `environmentPrepared` (so bootstrap-time services like config-server clients can register themselves), and closed in `prepareContext` → step 7 (`bootstrapContext.close(context)`), which is where bootstrap registrations can be promoted to the real context.

**`SpringApplicationRunListeners` fanout + metrics.** Every callback goes through `doWithListeners(stepName, action)` which wraps the iteration in an `ApplicationStartup.StartupStep`. If you plug in `BufferingApplicationStartup` or `FlightRecorderApplicationStartup`, every listener phase shows up as a timed span in your profiler or JFR recording.
