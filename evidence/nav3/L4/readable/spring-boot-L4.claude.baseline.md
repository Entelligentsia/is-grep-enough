# transcript: I'm trying to reason about how Spring Boot decides which auto-configuration classes actually get imported, from the moment the auto-configuration import sele...


💬 I'll trace this through the source code directly. Let me look at the key classes.

  ▸ Agent(Explore AutoConfiguration import selector flow)  ⟶ subagent:
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelec...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportFilte...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadata.java)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadataLoa...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/FilteringSpringBoo...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java)
      ↳ Bash(find /home/bench/repos/spring-boot -type d -name "autoconfigure" 2>/dev/null | head -20)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportFilter.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadata.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadataLoader.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/FilteringSpringBootCondition.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java)
      ↳ ⟹ returned to parent


💬 Good overview but I need the actual source to give you precise line references. Let me read the key files directly.
  ▸ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelec...)
  ▸ Bash(find /home/bench/repos/spring-boot -name "AutoConfigurationImportSelector.java" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java)

💬 Now let me read the filter chain and metadata files.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/FilteringSpringBootCondition.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/OnClassCondition.java)

💬 Now let me read the metadata loader and the `AutoConfigurationGroup.selectImports` sorter.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationMetadataLoader.java)
  ▸ Bash(find /home/bench/repos/spring-boot -name "AutoConfigurationSorter.java" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationSorter.java)

💬 Now let me check how the filters are registered and what `ConditionEvaluationReport` does with the recorded decisions.
  ▸ Bash(find /home/bench/repos/spring-boot -name "spring.factories" | xargs grep -l "AutoConfigurationImportFilter" 2>/dev/null | head -5)
  ▸ Bash(find /home/bench/repos/spring-boot -name "ConditionEvaluationReport.java" 2>/dev/null)
  ▸ Bash(grep -A5 "AutoConfigurationImportFilter" /home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/resources/META-INF/spring.factories)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/ConditionEvaluationReport.java)

💬 I have everything I need. Here is a precise walkthrough of the entire flow.  ---  ## How Spring Boot selects auto-configuration classes  ### 1. Entry point: ...

──────── RESULT (success, 135049ms, 14 turns) ────────
I have everything I need. Here is a precise walkthrough of the entire flow.

---

## How Spring Boot selects auto-configuration classes

### 1. Entry point: `AutoConfigurationImportSelector` as a `DeferredImportSelector`

`AutoConfigurationImportSelector` implements `DeferredImportSelector`, which is key. Spring defers its processing until after all regular `@Configuration` classes have been parsed, so user beans take precedence. The work begins in `getAutoConfigurationEntry()` (line 142), called from `selectImports()` (line 119).

---

### 2. Loading the candidate list

`getCandidateConfigurations()` (line 200) delegates to:

```java
ImportCandidates.load(this.autoConfigurationAnnotation, getBeanClassLoader())
```

This scans every JAR on the classpath for `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` and concatenates all the class names found. Every line in every such file from every JAR is a candidate. The annotation used as the lookup key is `AutoConfiguration.class` by default (set at line 114).

**De-duplication** happens immediately after on line 148:

```java
configurations = removeDuplicates(configurations);
```

`removeDuplicates()` (line 305) uses a `LinkedHashSet` to eliminate duplicates while preserving insertion order — so if the same class appears in two JARs, the first occurrence wins positionally.

---

### 3. Gathering and applying exclusions

`getExclusions()` (line 247) collects names from three sources, in order:

1. The `exclude` attribute of `@EnableAutoConfiguration` / `@SpringBootApplication` — these are class literals resolved at annotation time (line 250).
2. The `excludeName` attribute — the same annotation but using string names (line 251).
3. `spring.autoconfigure.exclude` property from the `Environment` (line 253) — loaded via `Binder` for `ConfigurableEnvironment` or a direct property lookup otherwise.

All three sets are merged. Then `AutoConfigurationReplacements.replaceAll()` is called (line 254) to handle class renames across versions — if an old class name was specified but it has been replaced, the new name is substituted.

**Validation**: `checkExcludedClasses()` (line 212) guards against typos — if an exclusion names a class that is actually present on the classpath but is not in the candidate list, it throws `IllegalStateException`. Classes that are genuinely absent from the classpath are silently ignored (they can't be loaded, so they couldn't have matched anyway).

The exclusions are then removed from `configurations` at line 151:

```java
configurations.removeAll(exclusions);
```

---

### 4. The fast class-level filter

Line 152 is the pivot point:

```java
configurations = getConfigurationClassFilter().filter(configurations);
```

`getConfigurationClassFilter()` (line 282) is lazily initialized. It:
1. Calls `getAutoConfigurationImportFilters()` (line 278), which uses `SpringFactoriesLoader` to load all `AutoConfigurationImportFilter` implementations registered in `spring.factories`. The three registered implementations are `OnBeanCondition`, `OnClassCondition`, and `OnWebApplicationCondition` — in that order.
2. Calls `invokeAwareMethods()` on each filter so they receive the `BeanFactory`, `ClassLoader`, etc.
3. Constructs a `ConfigurationClassFilter` (line 289) which also immediately loads `AutoConfigurationMetadata` via `AutoConfigurationMetadataLoader.loadMetadata()` (line 395).

**The metadata file** (`META-INF/spring-autoconfigure-metadata.properties`) is a compile-time-generated properties file that encodes the conditions of every auto-configuration class as plain string key-value pairs, keyed as `ClassName.ConditionType`. For example:

```
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration.ConditionalOnClass=javax.sql.DataSource,...
```

This is the secret to the filter's speed — it never loads auto-configuration classes, it just reads pre-extracted strings.

**`ConfigurationClassFilter.filter()`** (line 399) works on a `String[]` of candidate names:

```java
for (AutoConfigurationImportFilter filter : this.filters) {
    boolean[] match = filter.match(candidates, this.autoConfigurationMetadata);
    for (int i = 0; i < match.length; i++) {
        if (!match[i]) {
            candidates[i] = null;   // null-sentinel: this slot is eliminated
            skipped = true;
        }
    }
}
```

Each filter runs over the full (still surviving) array. A slot nulled by filter 1 is still passed to filter 2, but `OnClassCondition.getOutcomes()` (line 49) skips null slots at line 214:

```java
if (autoConfigurationClass != null) { ... }
```

After all filters run, the non-null slots are collected into the result list (lines 415–420).

---

### 5. How `OnClassCondition` uses the metadata (the core of the fast filter)

`OnClassCondition` extends `FilteringSpringBootCondition`, which implements `AutoConfigurationImportFilter`. Its `match()` method (line 52 of `FilteringSpringBootCondition`) calls the abstract `getOutcomes()`.

`OnClassCondition.getOutcomes()` (line 49) optionally splits the work across two threads when there are many candidates and multiple processors — the first half goes to a background thread via `ThreadedOutcomesResolver` (line 67), the second half runs on the calling thread (line 69), then results are joined (line 71–72).

`StandardOutcomesResolver.getOutcomes()` (line 209) loops over its slice. For each candidate it does:

```java
String candidates = autoConfigurationMetadata.get(autoConfigurationClass, "ConditionalOnClass");
```

`PropertiesAutoConfigurationMetadata.get()` (line 110) resolves this as `ClassName + ".ConditionalOnClass"` from the properties — a pure map lookup. If the property is absent, the class has no `@ConditionalOnClass` and the slot returns `null` (meaning "passes, no restriction").

If a value is present, `getOutcome(candidates)` (line 224) checks each comma-separated class name by trying `Class.forName()` via `ClassNameFilter.MISSING.matches()`. The first missing class short-circuits and returns a `noMatch` outcome. Importantly, any `Exception` during this check returns `null` (passes), because a full `@Condition` evaluation will get another chance later (line 237).

---

### 6. How the filter records its decisions

Back in `FilteringSpringBootCondition.match()` (line 51), when `getOutcomes()` returns a non-null outcome for a slot and it is a no-match, two things happen:

```java
logOutcome(autoConfigurationClass, outcome);          // DEBUG log
if (report != null) {
    report.recordConditionEvaluation(autoConfigurationClass, this, outcome);
}
```

`ConditionEvaluationReport` (line 53) is a `SortedMap<String, ConditionAndOutcomes>` stored as a singleton bean in the `BeanFactory` under the name `autoConfigurationReport`. Every rejection at this early filter stage is recorded there with the condition instance and the `ConditionOutcome` message — exactly the same structure as full `@Condition` evaluations during bean registration. This is what powers `/actuator/conditions` and the `ConditionEvaluationReportLoggingListener` that prints the conditions report on startup failure.

`ConditionEvaluationReport.find()` (called at line 54 of `FilteringSpringBootCondition`) retrieves this report from the `BeanFactory` — or returns `null` if none exists yet, in which case filter decisions are logged but not stored.

---

### 7. Events after filtering

After filtering, line 153 fires `AutoConfigurationImportEvent` to all `AutoConfigurationImportListener` implementations (loaded from `spring.factories`). `ConditionEvaluationReportAutoConfigurationImportListener` is the built-in listener — it records the final exclusion set into the `ConditionEvaluationReport` so the report shows exclusions as a distinct category from condition failures.

---

### 8. The `DeferredImportSelector.Group`: sorting and surfacing

Because `AutoConfigurationImportSelector` returns `AutoConfigurationGroup.class` from `getImportGroup()` (line 158), Spring's config-class parser calls `AutoConfigurationGroup.process()` (line 467) for each `@EnableAutoConfiguration`-annotated class it encounters. `process()` calls `getAutoConfigurationEntry()` on the selector and accumulates the resulting `AutoConfigurationEntry` objects in `autoConfigurationEntries`, and the per-class metadata mappings in `entries`.

`AutoConfigurationGroup.selectImports()` (line 489) is called once after all `process()` invocations. It:

1. **Union-exclusion pass** (lines 493–501): collects all exclusions from all processed entries (handling the case of multiple `@EnableAutoConfiguration` annotations in a hierarchy), then removes them from the union of all processed configurations. This is a second exclusion pass that guards against cross-entry leakage.

2. **Sorting** (line 502): calls `sortAutoConfigurations()`, which constructs an `AutoConfigurationSorter`. The sorter:
   - First sorts alphabetically (line 67 of `AutoConfigurationSorter`) to create a stable baseline.
   - Then sorts by `@AutoConfigureOrder` (lines 73–78), reading it from the metadata properties file (fast path) or from annotation metadata via `MetadataReaderFactory` (fallback, no class loading).
   - Then applies `@AutoConfigureBefore` / `@AutoConfigureAfter` topological ordering (line 80) via a recursive DFS that respects `@AutoConfigureBefore` by inverting it into `@AutoConfigureAfter` edges (line 161 of `AutoConfigurationSorter`).

3. The final sorted list is wrapped into `DeferredImportSelector.Group.Entry` objects (line 503) — each carrying the originating `AnnotationMetadata` and the class name — and returned to the framework, which then processes them as imports.

---

### Summary of the pipeline

```
ImportCandidates.load()          ← reads .imports files from all JARs
  → removeDuplicates()           ← LinkedHashSet, preserves first-occurrence order
  → getExclusions()              ← annotation attrs + property + replacements
  → checkExcludedClasses()       ← validates exclusions are known auto-configs
  → removeAll(exclusions)        ← first exclusion pass (per-selector)
  → ConfigurationClassFilter     ← fast filter using metadata properties, NO class loading
      OnBeanCondition.match()    ┐
      OnClassCondition.match()   ├─ each reads pre-extracted metadata, checks classpath
      OnWebApplicationCondition  ┘  records rejections into ConditionEvaluationReport
  → fireAutoConfigurationImportEvents()
                                 ← records exclusions in ConditionEvaluationReport
  ↓ (per AutoConfigurationGroup)
  → union of all entries, second exclusion pass
  → AutoConfigurationSorter      ← alphabetical → @AutoConfigureOrder → before/after DAG
  → Group.Entry iterable         ← returned to Spring for actual import processing
```

The two-phase design — fast metadata-based filter now, full `@Condition` evaluation later when the class is actually loaded — is what keeps startup fast. The fast filter eliminates the majority of candidates (any auto-config whose required classes aren't on the classpath) at property-lookup cost, deferring the expensive reflective condition checks to only the survivors.
