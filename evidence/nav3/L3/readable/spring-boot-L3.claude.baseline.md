# transcript: I want to instrument the full startup of a Spring Boot application from the moment SpringApplication.run is invoked until the application is reported as read...


💬 I'll trace through the actual source code to give you a precise, grounded walkthrough. Let me find the key files first.
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java -name "SpringApplication.java" -o -name "SpringApplicationRunListeners.java"...)
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java -name "EnvironmentPostProcessorApplicationListener.java" -o -name "ConfigDat...)
  ▸ Bash(find /home/bench/repos/spring-boot -name "SpringApplication.java" 2>/dev/null | head -5)
  ▸ Bash(find /home/bench/repos/spring-boot/core/spring-boot/src/main/java -name "*.java" | grep -E "SpringApplicationRunListener|EventPublishingRunListener|Environme...)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)

💬 Now let me read the listener files in parallel.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListeners.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/event/EventPublishingRunListener.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/support/EnvironmentPostProcessorApplicationListener.java)

💬 Now let me check the `SpringApplicationRunListener` interface and the `Runner` types.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationRunListener.java)
  ▸ Bash(find /home/bench/repos/spring-boot/core/spring-boot/src/main/java -name "Runner.java" -o -name "ApplicationRunner.java" -o -name "CommandLineRunner.java" | h...)

💬 I now have everything I need. Here is a precise walkthrough grounded in the actual source.  ---  ## Spring Boot startup sequence  All of this runs inside `Sp...

──────── RESULT (success, 138138ms, 11 turns) ────────
I now have everything I need. Here is a precise walkthrough grounded in the actual source.

---

## Spring Boot startup sequence

All of this runs inside `SpringApplication.run(String... args)` at `SpringApplication.java:304`.

---

### Phase 0 — Pre-flight and bootstrap context (lines 305–313)

```
Startup.create()                         // captures start time (System.currentTimeMillis)
shutdownHook.enableShutdownHookAddition()
createBootstrapContext()                 // line 344
  new DefaultBootstrapContext()
  BootstrapRegistryInitializer.initialize(ctx)  // one per spring.factories entry
configureHeadlessProperty()             // sets java.awt.headless
```

`createBootstrapContext` (line 344) creates a `DefaultBootstrapContext` and runs every `BootstrapRegistryInitializer` loaded from `spring.factories`. This bootstrap context is a **temporary registry** that exists only until the application context is ready; it is the mechanism by which things like config server clients can register secrets before any beans exist.

---

### Phase 1 — Run listeners acquired; `starting` fires (lines 312–313)

```
getRunListeners(args)                    // line 453
  SpringFactoriesLoader.load(SpringApplicationRunListener.class, ...)
  // → ships EventPublishingRunListener as the only default
listeners.starting(bootstrapContext, mainApplicationClass)
```

`SpringApplicationRunListeners` (the wrapper at `SpringApplicationRunListeners.java`) is a thin loop: every phase call iterates all `SpringApplicationRunListener`s and wraps the whole thing in a named `StartupStep` for `ApplicationStartup` instrumentation.

`EventPublishingRunListener.starting()` (line 76 of that file) **multicasts `ApplicationStartingEvent`** using a private `SimpleApplicationEventMulticaster` it owns. This multicaster is pre-populated with all `ApplicationListener`s that were registered on the `SpringApplication` constructor via `spring.factories`. This private multicaster is what makes events reachable before the application context exists.

---

### Phase 2 — Environment preparation (line 316 → `prepareEnvironment`, lines 350–368)

```
getOrCreateEnvironment()                 // line 475
  applicationContextFactory.createEnvironment(webApplicationType)
  // Servlet → StandardServletEnvironment
  // Reactive → StandardReactiveWebEnvironment
  // None → ApplicationEnvironment

configureEnvironment(environment, args)  // line 498
  environment.setConversionService(new ApplicationConversionService())
  configurePropertySources(environment, args)   // line 513
    // adds DefaultPropertiesPropertySource if set
    // adds SimpleCommandLinePropertySource from args at top
    // adds ApplicationInfoPropertySource at bottom
  configureProfiles(environment, args)   // no-op in base class

ConfigurationPropertySources.attach(environment)
  // wraps existing sources in SpringConfigurationPropertySources
  // enables relaxed binding during the next step

listeners.environmentPrepared(bootstrapContext, environment)
```

**`listeners.environmentPrepared`** (line 356) fires `ApplicationEnvironmentPreparedEvent` through the private multicaster. The critical listener responding to this is `EnvironmentPostProcessorApplicationListener` (`EnvironmentPostProcessorApplicationListener.java:119`), registered via `spring.factories`. Its handler:

```
onApplicationEnvironmentPreparedEvent(event)   // line 130
  postProcessors = getEnvironmentPostProcessors(resourceLoader, bootstrapContext)
    // loads EnvironmentPostProcessor impls from spring.factories
    // key one: ConfigDataEnvironmentPostProcessor
  for each postProcessor:
    postProcessor.postProcessEnvironment(environment, application)
```

`ConfigDataEnvironmentPostProcessor` is what reads `application.properties`, `application.yml`, profile-specific files, config server data, etc. All of this happens **inside the environmentPrepared event**, before `prepareEnvironment` returns.

Back in `prepareEnvironment` after the event:

```
ApplicationInfoPropertySource.moveToEnd(environment)
DefaultPropertiesPropertySource.moveToEnd(environment)
bindToSpringApplication(environment)           // line 550
  Binder.get(environment).bind("spring.main", Bindable.ofInstance(this.properties))
  // spring.main.web-application-type, spring.main.lazy-initialization, etc.
  // can retroactively change the app's configuration at this point
environmentConverter.convertEnvironmentIfNecessary(...)  // ensures correct type
ConfigurationPropertySources.attach(environment)         // reattach after conversion
```

---

### Phase 3 — Banner (line 317)

```
printBanner(environment)
  // resolves banner.txt / banner.gif / banner.jpg from classpath
  // prints to stdout or logger based on spring.main.banner-mode
```

---

### Phase 4 — Context creation (lines 319–320)

```
createApplicationContext()               // line 579
  applicationContextFactory.create(webApplicationType)
  // Servlet  → AnnotationConfigServletWebServerApplicationContext
  // Reactive → AnnotationConfigReactiveWebServerApplicationContext
  // None     → AnnotationConfigApplicationContext
context.setApplicationStartup(this.applicationStartup)
```

The context is created but **not yet refreshed**. Its bean factory is empty.

---

### Phase 5 — Context preparation (line 320 → `prepareContext`, lines 380–419)

```
context.setEnvironment(environment)

postProcessApplicationContext(context)   // line 591
  // registers beanNameGenerator if set
  // sets resourceLoader / classloader on context
  // sets conversionService on bean factory

addAotGeneratedInitializerIfNecessary(initializers)
  // for native images: prepends <Main>__ApplicationContextInitializer

beanFactory.setAllowCircularReferences(...)
beanFactory.setAllowBeanDefinitionOverriding(...)

applyInitializers(context)              // line 616
  // calls ApplicationContextInitializer.initialize(context) for each
  // loaded from spring.factories — e.g.:
  //   SharedMetadataReaderFactoryContextInitializer
  //   ConditionEvaluationReportLoggingListener

listeners.contextPrepared(context)
```

`EventPublishingRunListener.contextPrepared()` fires `ApplicationContextInitializedEvent` — still through the private multicaster.

```
bootstrapContext.close(context)         // line 395
  // fires BootstrapContextClosedEvent on the bootstrap context
  // releases any bootstrap-only registrations (e.g. config server client)

logStartupInfo / logStartupProfileInfo

beanFactory.registerSingleton("springApplicationArguments", applicationArguments)
beanFactory.registerSingleton("springBootBanner", printedBanner)

// add post-processors to the context (not yet run):
LazyInitializationBeanFactoryPostProcessor  (if lazy-init=true)
KeepAlive listener                          (if keep-alive=true)
PropertySourceOrderingBeanFactoryPostProcessor  // reorders DefaultProperties

load(context, sources)                  // line 683
  BeanDefinitionLoader.load()
  // reads each primary source (@SpringBootApplication class)
  // AnnotatedBeanDefinitionReader registers the class as a bean definition
  // also calls AnnotationConfigUtils.registerAnnotationConfigProcessors()
  // → registers ConfigurationClassPostProcessor (the key BFPP)

listeners.contextLoaded(context)        // line 418
```

`EventPublishingRunListener.contextLoaded()` does two things (lines 93–99):

1. Transfers all `ApplicationListener`s from the `SpringApplication` into the context — including making `ApplicationContextAware` ones context-aware.
2. Fires `ApplicationPreparedEvent` through the private multicaster (last time it's used for normal flow).

`EnvironmentPostProcessorApplicationListener` responds to `ApplicationPreparedEvent` by calling `deferredLogs.switchOverAll()`, which replays any log output that was suppressed during environment processing (before logging was configured).

---

### Phase 6 — Refresh (line 321 → `refreshContext`, lines 441–446)

```
shutdownHook.registerApplicationContext(context)
context.refresh()   // → AbstractApplicationContext.refresh()
```

This is the Spring Framework container initialization, not Boot-specific. The key sub-phases inside `refresh()`:

| Step | What happens |
|---|---|
| `prepareRefresh()` | Sets active flag; initializes early application events set |
| `obtainFreshBeanFactory()` | Returns the `DefaultListableBeanFactory` |
| `prepareBeanFactory()` | Registers `ApplicationContextAwareProcessor`, `ApplicationListenerDetector`, adds spEL resolver, env/classpath resources |
| `postProcessBeanFactory()` | Subclass hook — e.g., for servlet context: registers `WebApplicationContextServletContextAwareProcessor` |
| **`invokeBeanFactoryPostProcessors()`** | **Runs `ConfigurationClassPostProcessor`**, which parses `@SpringBootApplication` → `@EnableAutoConfiguration` → loads all auto-configs from `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, evaluates every `@ConditionalOnClass`, `@ConditionalOnMissingBean`, `@ConditionalOnProperty`, etc., registers surviving bean definitions |
| `registerBeanPostProcessors()` | Collects, orders, and installs all `BeanPostProcessor`s |
| `initMessageSource()` | Sets up `MessageSource` |
| `initApplicationEventMulticaster()` | Creates the **real** `ApplicationEventMulticaster` (replaces the private one) |
| `onRefresh()` | For `ServletWebServerApplicationContext`: creates the embedded server (`TomcatServletWebServerFactory` etc.) but doesn't start it yet |
| `registerListeners()` | Moves listeners from context's list to the real multicaster; fires any early application events |
| `finishBeanFactoryInitialization()` | **Instantiates all non-lazy singletons**; this is where `@Autowired`, `@PostConstruct`, etc. fire |
| `finishRefresh()` | Calls `lifecycle.start()` (starts `SmartLifecycle` beans); for web: starts the embedded server, publishes `WebServerInitializedEvent`; publishes `ContextRefreshedEvent` |

After `context.refresh()` returns, the embedded server is listening, all singletons are wired, and the real event multicaster is in place.

---

### Phase 7 — After refresh (line 322)

```
afterRefresh(context, applicationArguments)   // line 764
  // empty template method — extension point only
```

---

### Phase 8 — Started signal (lines 323–327)

```
startup.started()                        // captures timeTakenToStarted
StartupInfoLogger.logStarted(...)        // "Started X in Y.ZZZ seconds"
listeners.started(context, timeTakenToStarted)
```

`EventPublishingRunListener.started()` (line 103):

```java
context.publishEvent(new ApplicationStartedEvent(...));
AvailabilityChangeEvent.publish(context, LivenessState.CORRECT);
```

Now using the **real** context multicaster. `LivenessState.CORRECT` means the application considers itself alive.

---

### Phase 9 — Run runners (line 328)

```
callRunners(context, applicationArguments)   // line 767
  beanFactory.getBeanNamesForType(Runner.class)
  // Runner is the common marker interface for ApplicationRunner and CommandLineRunner
  sort by @Order / Ordered
  for each runner (in order):
    ApplicationRunner.run(ApplicationArguments)
    CommandLineRunner.run(String[] sourceArgs)
```

Both `ApplicationRunner` and `CommandLineRunner` extend the `Runner` marker interface, so a single query fetches both. Each bean that implements both interfaces is called twice.

---

### Phase 10 — Ready signal (lines 333–339)

```
if (context.isRunning()):
  listeners.ready(context, startup.ready())
```

`EventPublishingRunListener.ready()` (line 109):

```java
context.publishEvent(new ApplicationReadyEvent(...));
AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC);
```

`ReadinessState.ACCEPTING_TRAFFIC` is the final availability state — this is what a load balancer health check looks at via Actuator's `/actuator/health/readiness`.

`run()` returns the live `ConfigurableApplicationContext`.

---

## How the two listener planes are woven together

There are two separate event-delivery systems in play:

**`SpringApplicationRunListener`** (`SpringApplicationRunListener.java`) is a Boot-specific callback interface. It receives named phase callbacks directly from `SpringApplicationRunListeners`, which wraps every call in a `StartupStep` for `ApplicationStartup` instrumentation. The only implementation that ships with Boot is `EventPublishingRunListener`.

**`ApplicationListener`** is the standard Spring event system. Before `contextLoaded()` fires, `EventPublishingRunListener` delivers events through its own private `SimpleApplicationEventMulticaster` initialized in its constructor (`EventPublishingRunListener.java:62–67`). This multicaster is seeded with listeners from `SpringApplication.getListeners()` on every event dispatch (`refreshApplicationListeners()`, line 140). After `contextLoaded()`, all those same `ApplicationListener`s are added directly to the context (line 93), so from `started()` onward `EventPublishingRunListener` calls `context.publishEvent(...)` and the real context multicaster delivers them.

The crossover moment is `contextLoaded()` → `bootstrapContext.close(context)` → `refresh()`. Before that: private multicaster. After that: context multicaster.

**`EnvironmentPostProcessorApplicationListener`** exemplifies this: it is loaded as an `ApplicationListener` via `spring.factories`, lives in the private multicaster, catches `ApplicationEnvironmentPreparedEvent` to drive all `EnvironmentPostProcessor`s (including `ConfigDataEnvironmentPostProcessor` for property files), then catches `ApplicationPreparedEvent` to switch deferred logs to real logs — and that's the last thing it needs to do before the context is live.
