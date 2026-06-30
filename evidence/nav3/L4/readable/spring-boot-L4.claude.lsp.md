# transcript: I'm trying to reason about how Spring Boot decides which auto-configuration classes actually get imported, from the moment the auto-configuration import sele...


💬 I'll start by loading the LSP tool and locating the key classes.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(AutoConfigurationImportSelector)
  ▸ Bash(find /home/bench/repos/spring-boot -name "AutoConfigurationImportSelector.java" 2>/dev/null)
  ▸ LSP(AutoConfigurationImportSelector)

💬 Good, found the file. Let me read it fully, then pull in the supporting classes.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java)

💬 Now let me read the key supporting classes in parallel.
  ▸ LSP(AutoConfigurationMetadataLoader)
  ▸ LSP(AutoConfigurationReplacements)
  ▸ LSP(AutoConfigurationSorter)
  ▸ LSP(AutoConfigurationImportFilter)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadataLoader.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationReplacements.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportFilter.java)

💬 Now let me find the concrete filter implementations and the sorter.
  ▸ LSP(OnClassCondition)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationSorter.java)

💬 Now let me read `OnClassCondition` and find the `ImportCandidates` loader.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java)
  ▸ LSP(ImportCandidates)
  ▸ Bash(find /home/bench/repos/spring-boot -name "ImportCandidates.java" 2>/dev/null)
  ▸ LSP(FilteringSpringBootCondition)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/annotation/ImportCandidates.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/FilteringSpringBootCondition.java)

💬 I have everything I need. Let me also quickly check what other `AutoConfigurationImportFilter` implementations exist (besides `OnClassCondition`).
  ▸ Bash(grep -rl "AutoConfigurationImportFilter" /home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java --include="*.java" | grep -v "AutoConfigu...)
  ▸ Bash(grep -n "AutoConfigurationImportFilter" /home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/resources/META-INF/spring.factories 2>/dev/null...)
  ▸ Bash(grep -A 5 "AutoConfigurationImportFilter" /home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/resources/META-INF/spring.factories)

💬 I now have the complete picture. Here's the full walkthrough.  ---  ## How Spring Boot Auto-Configuration Import Selection Works  The whole mechanism is spli...

──────── RESULT (success, 175404ms, 24 turns) ────────
I now have the complete picture. Here's the full walkthrough.

---

## How Spring Boot Auto-Configuration Import Selection Works

The whole mechanism is split across two cooperating objects: `AutoConfigurationImportSelector` (which does per-annotation-site work) and its inner `AutoConfigurationGroup` (which aggregates, re-filters, and sorts). Because the selector implements `DeferredImportSelector`, Spring parks it and calls it only after all regular `@Configuration` classes have been processed.

---

### 1. Candidate Loading (`getCandidateConfigurations`)

`AutoConfigurationImportSelector.java:200`

```
ImportCandidates.load(AutoConfiguration.class, beanClassLoader)
```

`ImportCandidates` (`ImportCandidates.java:81`) calls `ClassLoader.getResources(...)` for the path:

```
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

Because it uses `getResources` (plural), it finds every matching file across all JARs on the classpath — each starter contributes its own `.imports` file. Lines starting with `#` are stripped, blank lines skipped, and each remaining line is a fully-qualified class name. The result is a flat `List<String>` assembled in classpath order.

---

### 2. De-duplication (`removeDuplicates`)

`AutoConfigurationImportSelector.java:305`

```java
new ArrayList<>(new LinkedHashSet<>(list))
```

The round-trip through `LinkedHashSet` is the entire de-dup implementation. It preserves insertion order (classpath order) while collapsing any class name that appeared in more than one `.imports` file. The result stays a `List` so positional semantics are intact for the filter step below.

---

### 3. Exclusion Gathering and Application (`getExclusions`)

`AutoConfigurationImportSelector.java:247`

Three sources are unioned into a `LinkedHashSet`:

1. `@EnableAutoConfiguration(exclude={...})` — class literals, resolved to names by Spring's annotation attribute reader
2. `@EnableAutoConfiguration(excludeName={...})` — explicit string names
3. `spring.autoconfigure.exclude` property — read via `Binder` on a `ConfigurableEnvironment`, or plain `environment.getProperty` otherwise

Then the entire exclusion set is passed through `AutoConfigurationReplacements.replaceAll()`:

`AutoConfigurationReplacements.java:55`

The replacements file lives at:
```
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.replacements
```

It is a Java `Properties` file mapping old (deprecated/moved) class names to their successors. This means if user code excludes an old name that has been relocated, the exclusion still lands on the right target. The replacements object is lazily initialised and cached on the selector.

After replacement, `checkExcludedClasses` validates the set: if any exclusion names a class that is present on the classpath but is not in the candidate list (i.e., it is not an auto-configuration at all), the method throws `IllegalStateException` immediately. Only after that guard does `configurations.removeAll(exclusions)` execute.

---

### 4. Fast Class-Level Filter (`ConfigurationClassFilter`)

`AutoConfigurationImportSelector.java:282` and the inner class at `AutoConfigurationImportSelector.java:388`

This is the pre-condition pass — it eliminates candidates before their bytecode is ever loaded by the context.

**`ConfigurationClassFilter` is lazily built and cached** on the selector. Construction does two things:

- Loads `AutoConfigurationMetadata` via `AutoConfigurationMetadataLoader.loadMetadata(classLoader)`:

  `AutoConfigurationMetadataLoader.java:43`
  
  Reads `META-INF/spring-autoconfigure-metadata.properties` from every JAR. This file is generated at build time by Spring Boot's annotation processor. Each entry looks like:
  ```
  com.example.FooAutoConfiguration.ConditionalOnClass=com.example.FooLibrary,com.example.Bar
  com.example.FooAutoConfiguration.AutoConfigureOrder=0
  com.example.FooAutoConfiguration.AutoConfigureBefore=com.example.OtherAutoConfiguration
  ```
  The key schema is `ClassName.AnnotationAttributeKey`. The `PropertiesAutoConfigurationMetadata` wrapper exposes typed getters (`get`, `getSet`, `getInteger`) that reconstruct typed values from the flat properties.

- Loads the filter instances via `SpringFactoriesLoader.loadFactories(AutoConfigurationImportFilter.class, ...)`. Three are registered in `spring.factories` (in this order):
  1. `OnBeanCondition`
  2. `OnClassCondition` (`@Order(HIGHEST_PRECEDENCE)`)
  3. `OnWebApplicationCondition`
  
  Each filter also has `invokeAwareMethods` called on it, injecting the `BeanClassLoader`, `BeanFactory`, `Environment`, and `ResourceLoader`.

**The filter pass itself** (`ConfigurationClassFilter.filter`, line 399):

The list is converted to a `String[]` so that positional nulling works. For each filter in the list:

```java
boolean[] match = filter.match(candidates, autoConfigurationMetadata);
for (int i = 0; i < match.length; i++) {
    if (!match[i]) {
        candidates[i] = null;  // null = eliminated
        skipped = true;
    }
}
```

Slots already nulled by a prior filter are still passed to subsequent filters (the contract says implementations must tolerate null entries), which is fine because `StandardOutcomesResolver` guards on `if (autoConfigurationClass != null)`.

**Inside `OnClassCondition`** (`OnClassCondition.java:49`):

`OnClassCondition` extends `FilteringSpringBootCondition`, which is both a `Condition` and an `AutoConfigurationImportFilter`. The `match()` bridge in `FilteringSpringBootCondition.match` (`FilteringSpringBootCondition.java:52`) calls abstract `getOutcomes()`, converts nulls to pass and non-null outcomes to the boolean array, and — critically — **records failures into `ConditionEvaluationReport`**:

```java
report.recordConditionEvaluation(autoConfigurationClass, this, outcome);
```

This is how `/actuator/conditions` (the condition evaluation endpoint) gets its "not matched" entries for auto-configurations that were rejected at this early fast-filter stage, not just those rejected during full condition evaluation later.

`OnClassCondition.getOutcomes()` (`OnClassCondition.java:49`) has a threading optimization: if there are more than one candidate and more than one CPU, it splits the array in half and delegates the first half to a background `Thread` (`ThreadedOutcomesResolver`), resolving the second half on the calling thread simultaneously. The thread is joined before results are merged. Using exactly one extra thread was found to be the sweet spot — more threads make it slower.

The actual check per candidate (`StandardOutcomesResolver`, line 209):

```java
String candidates = autoConfigurationMetadata.get(autoConfigurationClass, "ConditionalOnClass");
```

If the metadata has no entry for this key (i.e., the auto-config has no `@ConditionalOnClass`), the method returns `null` outcome — pass. Otherwise it splits the comma-delimited class list and for each name calls:

```java
ClassNameFilter.MISSING.matches(className, classLoader)
```

which does a plain `Class.forName(className, false, classLoader)` — no class initialization, just a presence probe. A single missing class yields a `noMatch` outcome; any exception is swallowed and treated as pass (the full condition evaluation will catch it later).

After all filters run, the surviving non-null slots are collected into a new list. If nothing was skipped the original list is returned as-is (avoiding allocation).

---

### 5. Event Notification

`AutoConfigurationImportSelector.java:314`

`fireAutoConfigurationImportEvents` loads `AutoConfigurationImportListener` implementations from `spring.factories` and fires an `AutoConfigurationImportEvent` carrying both the survivors and the exclusions. `ConditionEvaluationReportAutoConfigurationImportListener` is the standard listener; it writes the exclusions into the `ConditionEvaluationReport` so the Actuator endpoint can surface them.

---

### 6. `AutoConfigurationEntry` — the per-call result

`AutoConfigurationImportSelector.java:541`

A simple value holder wrapping the surviving `List<String> configurations` and the `Set<String> exclusions`. It is stored in `AutoConfigurationGroup.autoConfigurationEntries`.

---

### 7. `AutoConfigurationGroup.process()` — accumulation

`AutoConfigurationImportSelector.java:467`

Spring's `ConfigurationClassParser` calls `process()` once per `@EnableAutoConfiguration` annotation site (usually exactly one). For each call it invokes `getAutoConfigurationEntry()` (the full pipeline above) and accumulates the result. It also verifies that all calls to `process()` share the same `AutoConfigurationReplacements` object (they must be identical across calls). The `entries` map (`LinkedHashMap<String, AnnotationMetadata>`) records which annotation metadata site introduced each configuration class name; `putIfAbsent` means the first-seen site wins.

---

### 8. `AutoConfigurationGroup.selectImports()` — final merge, re-exclusion, and sorting

`AutoConfigurationImportSelector.java:489`

When Spring is ready to actually import, it calls `selectImports()`:

**Merge and second exclusion pass:**

```java
Set<String> allExclusions = entries.stream()
    .map(AutoConfigurationEntry::getExclusions)
    .flatMap(Collection::stream)
    .collect(Collectors.toSet());

Set<String> processedConfigurations = entries.stream()
    .map(AutoConfigurationEntry::getConfigurations)
    .flatMap(Collection::stream)
    .collect(Collectors.toCollection(LinkedHashSet::new)); // order-preserving dedup

processedConfigurations.removeAll(allExclusions);
```

This second exclusion pass is necessary because with multiple `process()` calls, one call's exclusion list might need to suppress a configuration introduced by another call's contribution. The per-call `getAutoConfigurationEntry` already removed exclusions for its own list, but not for entries contributed by sibling calls.

**Sorting** (`AutoConfigurationSorter.getInPriorityOrder`, line 65):

The sorter receives:
- A shared `MetadataReaderFactory` (obtained from the `BeanFactory` if `SharedMetadataReaderFactoryContextInitializer` registered one, else a fresh `CachingMetadataReaderFactory`)
- The same `AutoConfigurationMetadata` (re-loaded lazily in the group, from the same properties file)
- The `AutoConfigurationReplacements::replace` function as a `UnaryOperator<String>` for resolving deprecated names in `@AutoConfigureBefore`/`@AutoConfigureAfter` references

The sort is three-phase:

1. **Alphabetical baseline** — `Collections.sort` gives a stable, deterministic starting point.
2. **`@AutoConfigureOrder`** — re-sorted by integer order value. The value is read from `autoConfigurationMetadata.getInteger(className, "AutoConfigureOrder", DEFAULT_ORDER)` if the class was processed by the annotation processor (no bytecode load), otherwise by reading the annotation directly via `MetadataReader`. Lower values sort earlier (default is `Ordered.LOWEST_PRECEDENCE`).
3. **Topological sort by `@AutoConfigureBefore`/`@AutoConfigureAfter`** (`sortByAnnotation`, line 84): builds an `AutoConfigurationClasses` map that also eagerly pulls in classes mentioned in `@AutoConfigureBefore`/`@AutoConfigureAfter` that weren't in the surviving set (so the graph is complete even for excluded nodes). `getClassesRequestedAfter(current)` collects both the explicit `@AutoConfigureAfter` edges of `current` and any other class that declared `@AutoConfigureBefore(current)` (i.e., both directions resolve to the same "must come after" constraint). The DFS accumulates into a `LinkedHashSet` in post-visit order; cycle detection throws `IllegalStateException`. The final sorted set is then intersected back with only the survivors (referenced-but-excluded nodes fall out).

**Final result:**

Each class name in the sorted list is mapped to a `DeferredImportSelector.Group.Entry(annotationMetadata, importClassName)` and returned. Spring then processes these as regular `@Configuration` imports — running the full condition framework (`@ConditionalOnBean`, `@ConditionalOnProperty`, etc.) on each class. Everything that passed the fast filter but fails a full condition is excluded at that later stage and also recorded in the `ConditionEvaluationReport`.

---

### Summary — the pipeline at a glance

```
ImportCandidates.load()          ← scans ALL .imports files across classpath JARs
    │
    ▼
removeDuplicates()               ← LinkedHashSet round-trip, order preserved
    │
    ▼
getExclusions()                  ← annotation + excludeName + property, then .replacements
checkExcludedClasses()           ← guard: exclusion must refer to an actual auto-config
removeAll(exclusions)
    │
    ▼
ConfigurationClassFilter.filter()  ← reads spring-autoconfigure-metadata.properties
  ├─ OnClassCondition               ← split-threaded classpath probe via Class.forName
  ├─ OnBeanCondition
  └─ OnWebApplicationCondition      ← each records failures into ConditionEvaluationReport
    │
    ▼
AutoConfigurationEntry(survivors, exclusions)
    │ (stored in AutoConfigurationGroup.autoConfigurationEntries)
    ▼
AutoConfigurationGroup.selectImports()
  ├─ union all entries, removeAll(union of all exclusions)
  └─ AutoConfigurationSorter
       ├─ alphabetical baseline
       ├─ @AutoConfigureOrder (from metadata properties or annotation bytecode)
       └─ DFS topological sort for @AutoConfigureBefore / @AutoConfigureAfter
    │
    ▼
List<Group.Entry> → Spring processes as @Configuration imports
    └─ full condition evaluation phase (@ConditionalOnBean, @ConditionalOnProperty, …)
```

The key design insight threading through all of this: the `spring-autoconfigure-metadata.properties` file is what makes the fast filter genuinely fast. By pre-recording `ConditionalOnClass`, `AutoConfigureOrder`, and ordering annotations at build time, the entire filter pass and the sort can run without loading a single auto-configuration `.class` file. Bytecode is only touched if an auto-configuration was NOT processed by the annotation processor (unusual) or during full condition evaluation of the survivors.
