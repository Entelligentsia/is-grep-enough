# transcript: I want to instrument the full startup of a Spring Boot application from the moment SpringApplication.run is invoked until the application is reported as read...


💬 I'll trace this precisely through the source using the LSP tool. Let me start by locating `SpringApplication` and its `run` method.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(SpringApplication)
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot -name "SpringApplication.java" 2>/dev/null)
  ▸ Bash(find /home/bench/repos/spring-boot -name "SpringApplication.java" 2>/dev/null | head -5)
  ▸ LSP(SpringApplication)

💬 Good, I have the file path. Now let me read the `run` method and the document symbols to get the full picture of its structure.
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","line...)

💬 Now let me read the core `run` method, then all the methods it calls.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)

💬 Now let me read the remaining key methods — `callRunners`, `afterRefresh`, and the listener class itself.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)

💬 Now let me look at the `SpringApplicationRunListeners` class and the `EventPublishingRunListener` implementation.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListeners.java)
  ▸ Bash(find /home/bench/repos/spring-boot -name "EventPublishingRunListener.java" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java)

💬 Now let me check how environment post-processors are wired in — they run in response to the `ApplicationEnvironmentPreparedEvent`.
  ▸ Bash(find /home/bench/repos/spring-boot -name "EnvironmentPostProcessorApplicationListener.java" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/support/EnvironmentPostProcessorApplicationListener.java)

💬 Let me also read `applyInitializers`, `postProcessApplicationContext`, and the `load` method to complete the picture.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)

💬 Now let me also read the `SpringApplicationRunListener` interface for completeness.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListener.java)

💬 I have everything I need. Here is the precise, source-grounded walkthrough.  ---  ## Spring Boot startup — the exact sequence in `SpringApplication.run()`  A...

──────── RESULT (success, 160094ms, 19 turns) ────────
I have everything I need. Here is the precise, source-grounded walkthrough.

---

## Spring Boot startup — the exact sequence in `SpringApplication.run()`

All line references are to `core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java` unless noted otherwise.

---

### 0. Preamble (lines 305–312)

```java
Startup startup = Startup.create();                  // wall-clock timer
shutdownHook.enableShutdownHookAddition();            // arm the JVM hook
DefaultBootstrapContext bootstrapContext = createBootstrapContext();  // L344
configureHeadlessProperty();                          // java.awt.headless=true
SpringApplicationRunListeners listeners = getRunListeners(args);      // L453
listeners.starting(bootstrapContext, mainApplicationClass);
```

**`createBootstrapContext` (L344):** Constructs a `DefaultBootstrapContext` and runs every `BootstrapRegistryInitializer` registered on the `SpringApplication`. These initializers can seed the bootstrap context with objects needed by environment post-processors before the main `ApplicationContext` even exists (e.g. a Vault token fetcher).

**`getRunListeners` (L453):** Calls `SpringFactoriesLoader` to load all `SpringApplicationRunListener` implementations from `META-INF/spring.factories`. The only built-in one is `EventPublishingRunListener`. If a `SpringApplicationHook` is installed via `withHook(...)`, its listener is appended. The list is wrapped in `SpringApplicationRunListeners`, a thin multicaster that also records `ApplicationStartup` steps.

**`listeners.starting()`:** Calls `listener.starting(bootstrapContext)` on each listener. `EventPublishingRunListener` multicasts `ApplicationStartingEvent` through its own private `SimpleApplicationEventMulticaster` (because the `ApplicationContext` doesn't exist yet). Listeners registered on the `SpringApplication` — including `EnvironmentPostProcessorApplicationListener` — are subscribed to that internal multicaster.

---

### 1. Environment preparation — `prepareEnvironment` (lines 350–368)

```java
ConfigurableEnvironment environment = getOrCreateEnvironment();      // L475
configureEnvironment(environment, args);                             // L498
ConfigurationPropertySources.attach(environment);
listeners.environmentPrepared(bootstrapContext, environment);        // KEY
ApplicationInfoPropertySource.moveToEnd(environment);
DefaultPropertiesPropertySource.moveToEnd(environment);
bindToSpringApplication(environment);                                // L550
// optionally convert env type to match web app type
ConfigurationPropertySources.attach(environment);
```

**`getOrCreateEnvironment` (L475):** Delegates to `applicationContextFactory.createEnvironment(webApplicationType)`. For a servlet app this returns `ApplicationServletEnvironment`; for reactive, `ApplicationReactiveWebEnvironment`; for none, `ApplicationEnvironment`. These extend the Spring Framework's standard environment types and pre-populate the well-known property sources (system properties, system env).

**`configureEnvironment` (L498):** Installs a `ApplicationConversionService`, then `configurePropertySources` which adds `DefaultPropertiesPropertySource` (from `setDefaultProperties`), a `SimpleCommandLinePropertySource` if args are present, and `ApplicationInfoPropertySource` at the end. `configureProfiles` is a no-op hook for subclasses.

**`listeners.environmentPrepared()`** — this is where environment post-processors run.

`EventPublishingRunListener.environmentPrepared` multicasts `ApplicationEnvironmentPreparedEvent` via the same internal multicaster. `EnvironmentPostProcessorApplicationListener` (in `spring-boot/src/main/java/org/springframework/boot/support/`) receives it and does:

```java
// EnvironmentPostProcessorApplicationListener.java:130
List<EnvironmentPostProcessor> postProcessors =
    getEnvironmentPostProcessors(application.getResourceLoader(), event.getBootstrapContext());
for (EnvironmentPostProcessor postProcessor : postProcessors) {
    postProcessor.postProcessEnvironment(environment, application);
}
```

The post-processors are loaded from `spring.factories` (key `EnvironmentPostProcessor`). The most important one is `ConfigDataEnvironmentPostProcessor`, which drives the `application.properties` / `application.yaml` loading and profile activation. Others include `RandomValuePropertySourceEnvironmentPostProcessor` (for `${random.*}`), `SystemEnvironmentPropertySourceEnvironmentPostProcessor`, and `SpringApplicationJsonEnvironmentPostProcessor`. They all run before `prepareEnvironment` returns, so by the time we reach context creation the environment is fully populated with config files, active profiles, and all external property sources.

**`bindToSpringApplication` (L550):** Binds `spring.main.*` properties from the now-fully-prepared environment back onto the `SpringApplication` object itself (lazy-init, allow-circular-references, etc.).

---

### 2. Banner (L317)

`printBanner(environment)` — trivially reads `spring.banner.*` and prints to stdout. No listener callbacks.

---

### 3. Context creation — `createApplicationContext` (lines 579–584)

```java
context = applicationContextFactory.create(properties.getWebApplicationType());
context.setApplicationStartup(this.applicationStartup);
```

`ApplicationContextFactory.DEFAULT` is a `DefaultApplicationContextFactory` that matches on `WebApplicationType`:
- `SERVLET` → `AnnotationConfigServletWebServerApplicationContext`
- `REACTIVE` → `AnnotationConfigReactiveWebServerApplicationContext`
- `NONE` → `AnnotationConfigApplicationContext`

The context is **created but not refreshed**. It has a `DefaultListableBeanFactory` inside but no beans registered yet.

---

### 4. Context preparation — `prepareContext` (lines 380–419)

This is the richest phase. In order:

```java
context.setEnvironment(environment);          // wire the env in
postProcessApplicationContext(context);       // L591 — BeanNameGenerator, ResourceLoader, ConversionService
addAotGeneratedInitializerIfNecessary(...);   // L421 — AOT path only
// set allowCircularReferences / allowBeanDefinitionOverriding on the BeanFactory
applyInitializers(context);                   // L616
listeners.contextPrepared(context);           // LISTENER CALLBACK
bootstrapContext.close(context);              // publishes BootstrapContextClosedEvent to bootstrap listeners
// log startup info
beanFactory.registerSingleton("springApplicationArguments", applicationArguments);
beanFactory.registerSingleton("springBootBanner", printedBanner);
// optional: LazyInitializationBeanFactoryPostProcessor, KeepAlive listener
context.addBeanFactoryPostProcessor(new PropertySourceOrderingBeanFactoryPostProcessor(context));
load(context, sources.toArray());             // L683 — registers bean definitions
listeners.contextLoaded(context);             // LISTENER CALLBACK
```

**`postProcessApplicationContext` (L591):** If a custom `BeanNameGenerator` was set, registers it as a singleton so `ConfigurationClassPostProcessor` will pick it up. Wires in the custom `ResourceLoader` and the `ConversionService`.

**`applyInitializers` (L616):** Iterates over all `ApplicationContextInitializer` instances registered on the `SpringApplication` (loaded from `spring.factories`). Key built-in ones: `DelegatingApplicationContextInitializer`, `SharedMetadataReaderFactoryContextInitializer`, `ConditionEvaluationReportLoggingListener`. Each calls `initializer.initialize(context)` — this is a hook to manipulate the `ConfigurableApplicationContext` before any beans are defined.

**`listeners.contextPrepared()`:** `EventPublishingRunListener` multicasts `ApplicationContextInitializedEvent` (the "context initialized" event) via the internal multicaster. The `ApplicationContext` is not yet the publisher because it hasn't been refreshed.

**`bootstrapContext.close(context)`:** Closes the `DefaultBootstrapContext` and publishes `BootstrapContextClosedEvent` to any listeners registered directly on the bootstrap context. This is the handoff point — objects seeded in the bootstrap context (Vault clients, etc.) can transfer themselves into the main context here.

**`load(context, sources)` (L683):** Creates a `BeanDefinitionLoader` and calls `loader.load()`. This reads your primary source classes (`@SpringBootApplication`) and registers them as bean definitions — **this is the moment the root `@Configuration` class enters the registry**. (In AOT mode this step is skipped; an `AotApplicationContextInitializer` already loaded everything in `applyInitializers`.)

**`listeners.contextLoaded()`:** `EventPublishingRunListener.contextLoaded` does two things (L92–99): first, it injects the `ApplicationContext` into any `ApplicationContextAware` `ApplicationListener`s registered on the `SpringApplication`, then moves all those listeners into `context.addApplicationListener`. After this the context itself will be the event publisher. Then it multicasts `ApplicationPreparedEvent` — still via the internal multicaster, because `refresh` hasn't been called yet.

---

### 5. Refresh — `refreshContext` → `refresh` (lines 441–757)

```java
shutdownHook.registerApplicationContext(context);  // registers for graceful shutdown
refresh(context);                                  // → context.refresh()
```

`context.refresh()` is a `AbstractApplicationContext.refresh()` call — this is the entire Spring Framework context lifecycle:
- `prepareRefresh()` — activate context, init property sources
- `obtainFreshBeanFactory()` — returns the already-configured `DefaultListableBeanFactory`
- `prepareBeanFactory()` — registers `ApplicationContextAwareProcessor`, `ApplicationListenerDetector`, etc.
- `postProcessBeanFactory()` — type-specific subclass hook (e.g. `AnnotationConfigServletWebServerApplicationContext` registers a `WebApplicationContextServletContextAwareProcessor`)
- `invokeBeanFactoryPostProcessors()` — **this is where `ConfigurationClassPostProcessor` runs**: it processes `@Configuration`, `@ComponentScan`, `@Import`, `@Bean`; auto-configuration is discovered via `@EnableAutoConfiguration` → `AutoConfigurationImportSelector` → reads `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`; all conditional evaluation happens here
- `registerBeanPostProcessors()` — registers `AutowiredAnnotationBeanPostProcessor`, etc.
- `initMessageSource()`, `initApplicationEventMulticaster()` — sets up the `SimpleApplicationEventMulticaster` that will be the context's own event system from now on
- `onRefresh()` — in web apps, this creates and starts the embedded server (Tomcat/Jetty/Undertow/Netty)
- `registerListeners()` — moves all pre-registered `ApplicationListener`s into the now-initialized multicaster
- `finishBeanFactoryInitialization()` — instantiates all non-lazy singleton beans
- `finishRefresh()` — publishes `ContextRefreshedEvent`, starts lifecycle beans

After `refresh` returns, all beans are live and the embedded server is accepting requests.

**`afterRefresh` (L764):** An empty template method — hook for subclasses, not used by the framework itself.

---

### 6. Started signal (lines 323–328)

```java
Duration timeTakenToStarted = startup.started();
new StartupInfoLogger(...).logStarted(getApplicationLog(), startup);  // "Started X in Y seconds"
listeners.started(context, timeTakenToStarted);
```

**`listeners.started()`:** Unlike the pre-refresh callbacks, `EventPublishingRunListener.started` now calls `context.publishEvent(...)` — the context is the publisher because it has been refreshed. It publishes two things:
1. `ApplicationStartedEvent`
2. `AvailabilityChangeEvent` with `LivenessState.CORRECT` — this is when the liveness probe goes green

---

### 7. Runners — `callRunners` (lines 767–800)

```java
String[] beanNames = beanFactory.getBeanNamesForType(Runner.class);
// collect all ApplicationRunner and CommandLineRunner beans, sort by @Order / Ordered
instancesToBeanNames.keySet().stream().sorted(comparator).forEach(runner -> callRunner(runner, args));
```

`callRunner` dispatches to:
- `ApplicationRunner.run(ApplicationArguments)` — receives the structured `ApplicationArguments`
- `CommandLineRunner.run(String...)` — receives the raw args array

Both runner types on the same bean are called separately (a class can implement both). Exceptions propagate immediately and are wrapped in `handleRunFailure`.

---

### 8. Ready signal (lines 333–340)

```java
if (context.isRunning()) {
    listeners.ready(context, startup.ready());
}
```

**`listeners.ready()`:** `EventPublishingRunListener.ready` publishes via the context:
1. `ApplicationReadyEvent`
2. `AvailabilityChangeEvent` with `ReadinessState.ACCEPTING_TRAFFIC` — readiness probe goes green

This is the last step. `run()` returns the live `ConfigurableApplicationContext`.

---

### How the listener callbacks map across classes

```
SpringApplication.run()
  │
  ├─ getRunListeners()  →  SpringApplicationRunListeners (multicaster)
  │                              │
  │                              └─ EventPublishingRunListener (the only built-in impl)
  │                                    │ pre-refresh: uses SimpleApplicationEventMulticaster
  │                                    │ post-refresh: uses context.publishEvent()
  │
  ├─ listeners.starting()         → ApplicationStartingEvent
  │
  ├─ prepareEnvironment()
  │    └─ listeners.environmentPrepared()  → ApplicationEnvironmentPreparedEvent
  │                                              └─ EnvironmentPostProcessorApplicationListener
  │                                                   └─ runs all EnvironmentPostProcessors
  │                                                        (ConfigDataEPP loads config files here)
  │
  ├─ createApplicationContext()
  │
  ├─ prepareContext()
  │    ├─ applyInitializers()       (ApplicationContextInitializers run here)
  │    ├─ listeners.contextPrepared()   → ApplicationContextInitializedEvent
  │    ├─ bootstrapContext.close()      → BootstrapContextClosedEvent (bootstrap-level)
  │    ├─ load()                    (primary @Configuration classes registered)
  │    └─ listeners.contextLoaded()    → ApplicationPreparedEvent
  │                                         (listeners migrate into context here)
  │
  ├─ refreshContext()               → context.refresh() — full Spring context lifecycle
  │                                       └─ auto-configuration evaluated
  │                                       └─ singletons instantiated
  │                                       └─ embedded server started
  │
  ├─ listeners.started()            → ApplicationStartedEvent
  │                                 → AvailabilityChangeEvent(LivenessState.CORRECT)
  │
  ├─ callRunners()                  → ApplicationRunner / CommandLineRunner beans
  │
  └─ listeners.ready()              → ApplicationReadyEvent
                                    → AvailabilityChangeEvent(ReadinessState.ACCEPTING_TRAFFIC)
```

---

### Key design points

- **Two-phase multicasting:** Before `contextLoaded`, `EventPublishingRunListener` uses its own private `SimpleApplicationEventMulticaster` because the context isn't available yet. After `contextLoaded`, it calls `context.publishEvent()` directly. This is why `ApplicationListener` beans (defined with `@Bean`) only receive events from `ApplicationStartedEvent` onward, while listeners registered on the `SpringApplication` instance receive all events from `ApplicationStartingEvent` onward.

- **`SpringApplicationRunListener` vs `ApplicationListener`:** `SpringApplicationRunListener` is a coarser infrastructure hook (loaded via `spring.factories`, one instance per run). `ApplicationListener` is the fine-grained Spring event bus (registered in the context). `EventPublishingRunListener` is the bridge between them.

- **Environment post-processors are not beans.** They run entirely within `prepareEnvironment` before the `ApplicationContext` exists. They receive the `BootstrapContext` so they can share objects (e.g. HTTP clients for config servers) without going through the bean factory.

- **`afterRefresh` is intentionally empty.** It was previously used for runners; runners were moved to a dedicated phase to give `listeners.started()` a precise and unambiguous timestamp.
