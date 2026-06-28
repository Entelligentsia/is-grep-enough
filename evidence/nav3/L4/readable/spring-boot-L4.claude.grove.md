# transcript: I'm trying to reason about how Spring Boot decides which auto-configuration classes actually get imported, from the moment the auto-configuration import sele...


💬 I'll trace this end-to-end using grove to navigate the structural pieces. Let me load the grove tools and start exploring.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)

💬 Now let me locate the key classes. I'll search for the import selector and related pieces in parallel.
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot-autoconfigure/src","name":"AutoConfigurationImportSelector","kind":"class"})
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot-autoconfigure/src","name":"AutoConfigurationMetadataLoader","kind":"class"})
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot-autoconfigure/src","name":"OnClassCondition","kind":"class"})

💬 Let me find the key files with shell first.
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src -name "AutoConfigurationImportSelector.java" -o -name "AutoConfiguration...)
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src -name "AutoConfigurationGroup.java" -o -name "AutoConfigurationImportFil...)
  ▸ Bash(find /home/bench/repos/spring-boot -name "AutoConfigurationImportSelector.java" 2>/dev/null | head -5)
  ▸ Bash(find /home/bench/repos/spring-boot/core -name "AutoConfiguration*.java" | sort)
  ▸ Bash(find /home/bench/repos/spring-boot/core -name "OnClassCondition.java" -o -name "AutoConfigurationMetadata*.java" | sort)

💬 Good. Now let me read the central file and outline the cooperating pieces in parallel.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.ja...)
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadataLoader.ja...)
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java"})

💬 Now let me read the key method bodies in parallel — the core pipeline, the filter, and the metadata loader.
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#getAutoConfigurationEntr...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#process@467"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#selectImports@489"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#filter@399"})

💬 Now let me read the exclusions, candidate loading, and the filter superclass in parallel.
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#getCandidateConfiguratio...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#getExclusions@247"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#getConfigurationClassFil...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadataLoader.java#loadMetadata@47"})

💬 Let me find and read `FilteringSpringBootCondition` and the other supporting pieces.
  ▸ Bash(find /home/bench/repos/spring-boot/core -name "FilteringSpringBootCondition.java" | head -3)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#getAutoConfigurationImpo...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#fireAutoConfigurationImp...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#getExcludeAutoConfigurat...)

💬 Now let me read `FilteringSpringBootCondition` and key `OnClassCondition` methods.
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/FilteringSpringBootCondi...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java#getOutcomes@49"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java#getOutcomes@209"})

💬 Let me read the last few key pieces — the `match` bridge, the leaf outcome, and the sorter.
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/FilteringSpringBootCondition.java#match@52"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java#getOutcome@224"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#sortAutoConfigurations@5...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#checkExcludedClasses@212"})

💬 I have enough to give a thorough answer. Let me also quickly check the `AutoConfigurationGroup` field declarations and `AutoConfigurationReplacements` for co...
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java)
  ▸ mcp__grove__source({"id":"java:core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java#getAutoConfigurationRepl...)

💬 I have everything I need. Here is the full walkthrough.  ---  ## How Spring Boot auto-configuration import selection works  There are six cooperating classes...

──────── RESULT (success, 178928ms, 34 turns) ────────
I have everything I need. Here is the full walkthrough.

---

## How Spring Boot auto-configuration import selection works

There are six cooperating classes. Read them in this order to follow the data.

---

### 1. Why `DeferredImportSelector` matters

`AutoConfigurationImportSelector` implements `DeferredImportSelector`, not the simpler `ImportSelector`. That single choice drives the entire two-phase structure: Spring finishes processing all regular `@Configuration` classes first, then asks the deferred selector for its imports. This is what makes user beans able to override auto-configured ones.

Because it is deferred, Spring calls `getImportGroup()` (`AutoConfigurationImportSelector.java:158`) which returns `AutoConfigurationGroup.class`. All selector invocations within the same context share one `AutoConfigurationGroup` instance, so multiple `@EnableAutoConfiguration` annotations are collected and reconciled together.

---

### 2. Phase 1 — `AutoConfigurationGroup.process()` calls `getAutoConfigurationEntry()`

For each `@EnableAutoConfiguration` source, Spring calls `process()` (`line 467`), which immediately delegates to `getAutoConfigurationEntry(annotationMetadata)` (`line 142`). That method is the central pipeline and runs these steps in sequence:

#### Step A — Load the raw candidate list

```java
List<String> configurations = getCandidateConfigurations(annotationMetadata, attributes);
```

`getCandidateConfigurations()` (`line 200`) calls `ImportCandidates.load(AutoConfiguration.class, classLoader)`, which enumerates every `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` file reachable via the classloader. Every JAR on the classpath contributes its own copy; the classloader aggregates them all. The result is a flat `List<String>` of fully-qualified class names, in classpath-enumeration order.

Immediately after:

```java
configurations = removeDuplicates(configurations);
```

This passes through a `LinkedHashSet` round-trip (`line 305`), which collapses duplicates while preserving the order of first occurrence. If two JARs both register the same auto-configuration, the one found first survives.

#### Step B — Gather exclusions

`getExclusions(metadata, attributes)` (`line 247`) collects from three independent sources:

1. **`exclude` on the annotation** — class literals from `@SpringBootApplication(exclude=…)` or `@EnableAutoConfiguration(exclude=…)`
2. **`excludeName` on the annotation** — string names, for cases where the class cannot be a compile-time reference
3. **`spring.autoconfigure.exclude` property** (`line 263`) — bound via `Binder.get(environment)` for `ConfigurableEnvironment` or via `environment.getProperty()` otherwise

After those three are merged into a `LinkedHashSet`, the whole set is passed through `AutoConfigurationReplacements.replaceAll()` (`line 295`). Replacements are loaded from `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.replacements`, a properties file mapping old canonical names to new ones. This makes an exclusion of a renamed class still work without user action.

#### Step C — Validate exclusions

`checkExcludedClasses(configurations, exclusions)` (`line 212`) checks: for each excluded name, if the class *is* present on the classpath but is *not* in the candidate list, that exclusion names something that is not an auto-configuration class. Those are collected and passed to `handleInvalidExcludes()`, which throws `IllegalStateException`. If a class is absent from the classpath entirely, the exclusion is silently ignored — the user may have conditionally excluded something that wasn't there to begin with.

#### Step D — Apply exclusions

```java
configurations.removeAll(exclusions);
```

Plain list removal. The candidate list now holds only classes the user has not explicitly excluded.

#### Step E — Fast class-level filter (the key pruning step)

```java
configurations = getConfigurationClassFilter().filter(configurations);
```

`getConfigurationClassFilter()` (`line 282`) is lazy-initialized. On first call it loads all `AutoConfigurationImportFilter` implementations via `SpringFactoriesLoader`, calls `invokeAwareMethods()` on each (injecting `BeanFactory`, `ClassLoader`, `ResourceLoader`), and wraps them in a `ConfigurationClassFilter`. The standard registrations are `OnClassCondition`, `OnBeanCondition`, and `OnWebApplicationCondition`.

**Inside `ConfigurationClassFilter.filter()`** (`line 399`):

The list is converted to a `String[]` where position is the stable identity. Each filter is called in turn:

```java
boolean[] match = filter.match(candidates, this.autoConfigurationMetadata);
for (int i = 0; i < match.length; i++) {
    if (!match[i]) {
        candidates[i] = null;  // tombstone
    }
}
```

Null slots accumulate tombstones across multiple filters. At the end, a pass over the array collects only non-null entries. The original list is returned unchanged if no tombstones were set (fast path).

**Inside `FilteringSpringBootCondition.match()`** (the bridge method, `FilteringSpringBootCondition.java:52`):

This is the method on the `AutoConfigurationImportFilter` interface. It:
1. Fetches the `ConditionEvaluationReport` from the `BeanFactory`
2. Calls the abstract `getOutcomes(autoConfigurationClasses, autoConfigurationMetadata)` — the hook each subclass overrides
3. Converts outcomes to `boolean[]`: a `null` outcome means "no constraint, pass it", a non-null outcome is queried via `outcome.isMatch()`
4. For every rejection, calls `logOutcome()` and **`report.recordConditionEvaluation()`** — this is how `ConditionEvaluationReport` (the data behind `/actuator/conditions`) gets populated at this early stage, before the class is ever loaded

**Inside `OnClassCondition.getOutcomes()`** (`OnClassCondition.java:49`):

If there is more than one candidate and more than one available processor, the array is split in half. The upper half goes to a `ThreadedOutcomesResolver` (a fresh `Thread` wrapping a `StandardOutcomesResolver`), and the current thread resolves the lower half directly. The thread is joined before the results are merged. The comment in the source is explicit: one additional thread is optimal; more threads make things worse.

`StandardOutcomesResolver.getOutcomes()` (`line 209`) iterates its slice:

```java
String candidates = autoConfigurationMetadata.get(autoConfigurationClass, "ConditionalOnClass");
if (candidates != null) {
    outcomes[i - start] = getOutcome(candidates);
}
```

**The `autoConfigurationMetadata` lookup is what makes this fast.** It reads from a `Properties` object loaded from `META-INF/spring-autoconfigure-metadata.properties` (`AutoConfigurationMetadataLoader.java:47`). That file is generated at build time by `AutoConfigureAnnotationProcessor`, which reads each `@AutoConfiguration` class's `@ConditionalOnClass` annotations and writes entries like:

```
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration.ConditionalOnClass=\
  javax.sql.DataSource,org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType
```

No bytecode loading, no annotation parsing at runtime. It is a plain properties lookup followed by a classloader presence check. This is why `filter()` can prune hundreds of candidates in a few milliseconds before the context parser has looked at any of them.

`getOutcome(String candidates)` (`line 224`) splits on comma and tests each class name with `ClassNameFilter.isPresent()` (which attempts `Class.forName()` and catches `ClassNotFoundException`/`NoClassDefFoundError`). The first absent class produces a negative `ConditionOutcome` with a descriptive message; all classes present produces `null` (pass). Exceptions during the check are swallowed — the class will get another chance during full condition evaluation later.

#### Step F — Fire events

```java
fireAutoConfigurationImportEvents(configurations, exclusions);
```

(`line 314`) Loads `AutoConfigurationImportListener` implementations via `SpringFactoriesLoader` and fires an `AutoConfigurationImportEvent` carrying the final surviving configuration list and the full exclusion set. The built-in `ConditionEvaluationReportAutoConfigurationImportListener` uses this to record the complete picture into the report.

#### Return value

`getAutoConfigurationEntry()` returns `new AutoConfigurationEntry(configurations, exclusions)` — a simple value object.

Back in `process()` (`line 467`):
- The entry is appended to `this.autoConfigurationEntries`
- Each surviving class name is registered in `this.entries` via `putIfAbsent(importClassName, annotationMetadata)`, tracking which `@EnableAutoConfiguration`'s metadata first introduced each class

---

### 3. Phase 2 — `AutoConfigurationGroup.selectImports()` sorts and returns

Called once after all `process()` invocations complete (`line 489`):

```java
Set<String> allExclusions = this.autoConfigurationEntries.stream()
    .map(AutoConfigurationEntry::getExclusions)
    .flatMap(Collection::stream)
    .collect(Collectors.toSet());

Set<String> processedConfigurations = this.autoConfigurationEntries.stream()
    .map(AutoConfigurationEntry::getConfigurations)
    .flatMap(Collection::stream)
    .collect(Collectors.toCollection(LinkedHashSet::new));

processedConfigurations.removeAll(allExclusions);
```

This is a second-pass reconciliation. If `@EnableAutoConfiguration` source A produced class X and source B excluded class X, the per-entry `removeAll` in Phase 1 only removed it from B's own list. This cross-entry removal handles the case where exclusions from one source must suppress configurations from another.

Then:

```java
return sortAutoConfigurations(processedConfigurations, getAutoConfigurationMetadata())
    .stream()
    .map(this::getEntry)
    .toList();
```

`AutoConfigurationSorter.getInPriorityOrder()` reads `@AutoConfigureOrder`, `@AutoConfigureBefore`, and `@AutoConfigureAfter` — first from the pre-built metadata properties (fast path), falling back to bytecode via `MetadataReaderFactory` when absent. The replacements map is consulted so that ordering declarations referencing renamed classes still resolve correctly.

`getEntry(importClassName)` wraps each sorted name in a `DeferredImportSelector.Group.Entry` paired with the `AnnotationMetadata` of the `@EnableAutoConfiguration` that first registered it. Spring uses that metadata to set up the configuration class's import context correctly.

---

### The full data flow

```
META-INF/spring/…AutoConfiguration.imports  ←── classpath-aggregated
  │
  ▼
ImportCandidates.load()
  │  removeDuplicates() via LinkedHashSet
  ▼
raw candidate list
  │
  ├── @annotation exclude/excludeName  ┐
  ├── spring.autoconfigure.exclude     ├── getExclusions()
  └── AutoConfigurationReplacements   ┘
  │  checkExcludedClasses() → throw if invalid
  │  removeAll(exclusions)
  ▼
post-exclusion list
  │
  └── ConfigurationClassFilter.filter()
        ├── AutoConfigurationMetadata   ←── META-INF/spring-autoconfigure-metadata.properties
        │     (build-time extracted @ConditionalOnClass values)
        └── for each filter (OnClassCondition, OnBeanCondition, OnWebApplicationCondition):
              FilteringSpringBootCondition.match()
                ├── getOutcomes() → metadata lookup + Class.forName() check
                │     OnClassCondition splits work across 2 threads when beneficial
                └── record rejections → ConditionEvaluationReport
  │
  fireAutoConfigurationImportEvents()  → ConditionEvaluationReport (full picture)
  │
  AutoConfigurationEntry(configurations, exclusions)
         collected per process() call into autoConfigurationEntries
  │
  ▼  (selectImports, once, after all process() calls)
  merge + dedup across all entries (LinkedHashSet)
  removeAll(all exclusions)            ← cross-entry reconciliation
  AutoConfigurationSorter              ← @AutoConfigureBefore/After/Order
  map each name → Group.Entry
  └── returned to Spring, which registers them as configuration classes
```

---

### Key design choices to notice

- **The metadata properties file is the performance lever.** Without `spring-autoconfigure-metadata.properties`, `OnClassCondition` would have to load and parse every `@AutoConfiguration` class to read its `@ConditionalOnClass` — thousands of class loads before the application even starts. The build-time annotation processor eliminates that entirely.

- **`null`-as-tombstone in the filter array** lets multiple filters compose without reallocation: each pass only nulls out its rejections; surviving entries remain in their original positions.

- **Two-level deduplication:** first within a single `getAutoConfigurationEntry()` call (via `removeDuplicates()`), then again across multiple `process()` calls (via `LinkedHashSet` collection in `selectImports()`). The cross-entry removal is also where multi-source exclusions fully take effect.

- **`ConditionEvaluationReport` is populated by the filter, not by condition evaluation.** The fast filter records its decisions into the report before the configuration classes are even loaded. Full `@Conditional` evaluation (which happens later when Spring parses the config classes) adds to the same report. The `/actuator/conditions` endpoint reflects both layers.
