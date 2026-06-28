# transcript: I'm planning a change to how a property set as an environment variable ends up bound into a @ConfigurationProperties bean, so I need the full journey of one ...


💬 I'll trace this end-to-end through the source. Let me load the grove tools and start mapping the binding machinery in parallel.
  ▸ ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__map,mcp__grove__definition)

💬 Now let me fan out to map all the key binding classes in parallel.
  ▸ mcp__grove__map({"dir":"spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind","kind":"class"})
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties","kind":"class"})
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot/src/main/java/org/springframework/boot/env","kind":"class"})

💬 Let me verify the paths exist first, then re-query grove.
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties -maxdepth 2 -name "*.java" | hea...)
  ▸ Bash(ls /home/bench/repos/spring-boot/ && echo "---" && find /home/bench/repos/spring-boot -maxdepth 3 -name "*.java" | head -10)

💬 The repo layout has been restructured. Let me map the actual layout.
  ▸ Bash(find /home/bench/repos/spring-boot/core /home/bench/repos/spring-boot/configuration-metadata -maxdepth 6 -name "*.java" | grep -E "(Binder|ConfigurationPrope...)
  ▸ Bash(ls /home/bench/repos/spring-boot/core/ && echo "---" && ls /home/bench/repos/spring-boot/module/ 2>/dev/null | head -20)
  ▸ Bash(find /home/bench/repos/spring-boot/core/spring-boot -maxdepth 8 -name "*.java" | grep -E "bind/" | head -40)
  ▸ Bash(find /home/bench/repos/spring-boot -maxdepth 8 -name "Binder.java" -o -name "ConfigurationPropertySources.java" -o -name "ConfigurationPropertiesBinder.java"...)
  ▸ Bash(find /home/bench/repos/spring-boot -name "Binder.java" 2>/dev/null; find /home/bench/repos/spring-boot -name "*.java" | head -5)

💬 Good. Now I have the real root. Let me map all the binding machinery in parallel.
  ▸ Bash(find /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties -name "*.java" | sort)
  ▸ Bash(find /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/env -name "*.java" | sort)

💬 Now I have the full map. Let me read all the critical classes in parallel.
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/ConfigurationPropertySources.java"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMapper.java"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySources.java"})

💬 Good skeleton. Now let me read all the load-bearing method bodies in parallel.
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java#bind@92"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java#getBinder@185"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java#getBindHandler@113"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/ConfigurationPropertySources.java#attach@89"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/ConfigurationPropertySources.java#get@120"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java#bind@365"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java#bindObject@423"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java#findProperty@476"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java#handleBindResult@384"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMapper.java#map@47"})

💬 Now let me read the remaining critical pieces - the env mapper's reverse direction, the SpringConfigurationPropertySource adapter, bindProperty, BindConverte...
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMapper.java#map@63"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMapper.java#convertName@72"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySources.java#adapt@64"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java#bindProperty@490"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySource.java"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySource.java#from@171"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySource.java#getConfigurationProperty...)
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindConverter.java"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringIterableConfigurationPropertySource.java"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/DefaultPropertyMapper.java"})

💬 Let me grab the remaining key bodies - the iterable source's cached lookup, BindConverter.convert, and the post-processor entry point.
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringIterableConfigurationPropertySource.java#getConfiguration...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringIterableConfigurationPropertySource.java#tryUpdate@258"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindConverter.java#convert@105"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/DefaultPropertyMapper.java#map@48"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBindingPostProcessor.java"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBindingPostProcessor.java#postProcessBeforeInit...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBindingPostProcessor.java#bind@93"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySource.java#getPropertySourcePropert...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java#getConfigurationPropertySources@195"})

💬 One more batch — I need `ConfigurationPropertyName.adapt` for the env-var parsing, and the `ToStringFormat` values used by `SystemEnvironmentPropertyMapper`.
  ▸ mcp__grove__symbols({"dir":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source","name":"ToStringFormat"})
  ▸ mcp__grove__source({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySource.java","name":"getSystemEnvironme...)
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringIterableConfigurationPropertySource.java#getSystemEnviron...)
  ▸ Bash(grep -n "ToStringFormat\|SYSTEM_ENVIRONMENT\|LEGACY" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties...)
  ▸ Bash(grep -n "adapt\|processElementValue\|UNDERSCORE\|separator" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/pro...)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/ConfigurationPropertyName.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/ConfigurationPropertyName.java)

💬 I now have the complete picture. Let me check the `processElementValue` in `SystemEnvironmentPropertyMapper` since it feeds into `adapt`.
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMapper.java#processElementValue@81"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringIterableConfigurationPropertySource.java#getSystemEnviron...)

💬 I have everything I need. Here is the complete journey.  ---  ## The full relaxed-binding pipeline: env var → `@ConfigurationProperties` field  ---  ### Stag...

──────── RESULT (success, 269059ms, 57 turns) ────────
I have everything I need. Here is the complete journey.

---

## The full relaxed-binding pipeline: env var → `@ConfigurationProperties` field

---

### Stage 1 — The raw property source

Spring Framework creates a `SystemEnvironmentPropertySource` backed by `System.getenv()`. Because it extends `EnumerablePropertySource`, all key names are available upfront. It lives inside the `Environment`'s `MutablePropertySources`, typically near the front of the ordered list.

---

### Stage 2 — Attaching the adapter layer

During `SpringApplication` startup, `ConfigurationPropertySources.attach(environment)` is called (`ConfigurationPropertySources.java:89`):

```java
MutablePropertySources sources = ((ConfigurableEnvironment) environment).getPropertySources();
attached = new ConfigurationPropertySourcesPropertySource(ATTACHED_PROPERTY_SOURCE_NAME,
        new SpringConfigurationPropertySources(sources));
sources.remove(ATTACHED_PROPERTY_SOURCE_NAME);
sources.addFirst(attached);   // ← inserted at position 0
```

This creates a single `ConfigurationPropertySourcesPropertySource` wrapping a `SpringConfigurationPropertySources`, then inserts it at the *head* of the list. This is important for normal Spring `Environment.getProperty` calls too — the attached source acts as a facade that re-enters the real sources through the binding mapper.

When the binder later calls `ConfigurationPropertySources.get(environment)` (`get@120`), it returns the `SpringConfigurationPropertySources` out of that attached source (falling back to `from(sources)` if attach was never called).

---

### Stage 3 — Wrapping each raw source in a `ConfigurationPropertySource`

`SpringConfigurationPropertySources.adapt(source)` (`adapt@64`) is called lazily for each `PropertySource<?>` as the binder iterates:

```java
result = SpringConfigurationPropertySource.from(source);
```

`from@171` makes two decisions:

1. **Which mapper array?** `isSystemEnvironmentPropertySource(source)` — true for `SystemEnvironmentPropertySource`. This picks `SYSTEM_ENVIRONMENT_MAPPERS = {SystemEnvironmentPropertyMapper.INSTANCE, DefaultPropertyMapper.INSTANCE}`. Non-env sources get only `DEFAULT_MAPPERS = {DefaultPropertyMapper.INSTANCE}`.

2. **Which wrapper class?** `isFullEnumerable(source)` — true for `EnumerablePropertySource`. This picks `SpringIterableConfigurationPropertySource` (a subclass that adds a pre-built cache). Non-enumerable sources get the bare `SpringConfigurationPropertySource`.

So a `SystemEnvironmentPropertySource` always becomes a `SpringIterableConfigurationPropertySource` with both mappers.

---

### Stage 4 — Triggering the bind

`ConfigurationPropertiesBindingPostProcessor.postProcessBeforeInitialization` (`postProcessBeforeInitialization@82`) intercepts every bean before initialization:

```java
bind(ConfigurationPropertiesBean.get(this.applicationContext, bean, beanName));
```

`ConfigurationPropertiesBean.get` wraps beans that carry `@ConfigurationProperties` into a descriptor. Then `ConfigurationPropertiesBinder.bind(propertiesBean)` (`bind@92`) does three things:

```java
Bindable<?> target = propertiesBean.asBindTarget();
ConfigurationProperties annotation = propertiesBean.getAnnotation();
BindHandler bindHandler = getBindHandler(target, annotation);
return getBinder().bind(annotation.prefix(), target, bindHandler);
```

**Building the handler chain** (`getBindHandler@113`) — assembled inside-out, outer wrapping inner:
1. Base: `IgnoreTopLevelConverterNotFoundBindHandler` — swallows `ConverterNotFoundException` at the root level so missing converters don't blow up the whole bean.
2. `ConfigurationPropertiesBindHandler` — marks nested types with `@ConfigurationProperties` so they participate in binding machinery.
3. Optionally `IgnoreErrorsBindHandler` (if `ignoreInvalidFields=true`).
4. Optionally `NoUnboundElementsBindHandler` (if `ignoreUnknownFields=false`) — tracks bound names and fails on extras.
5. Optionally `ValidationBindHandler` — runs JSR-303 validators on `onFinish`.
6. Any `ConfigurationPropertiesBindHandlerAdvisor` beans in the context (BoundProperties tracking, etc.).

**Building the `Binder`** (`getBinder@185`):
```java
new Binder(getConfigurationPropertySources(),
           getPropertySourcesPlaceholdersResolver(),
           getConversionServices(),
           getPropertyEditorInitializer(), null, null);
```
`getConfigurationPropertySources()` calls `ConfigurationPropertySources.from(this.propertySources)` — the `propertySources` here come from `PropertySourcesDeducer`, which resolves the environment's `MutablePropertySources`.

---

### Stage 5 — The binder's main loop

The public `bind(String name, Bindable<T>, BindHandler)` overloads funnel into the private `bind@365`:

```java
try (ConfigurationPropertyCaching.CacheOverride cacheOverride =
        this.configurationPropertyCaching.override()) {
    Bindable<T> replacementTarget = handler.onStart(name, target, context);
    // ...
    Object bound = bindObject(name, target, handler, context, allowRecursiveBinding);
    return handleBindResult(name, target, handler, context, bound, create);
}
```

The `CacheOverride` enables the iterable-source cache for the duration of this call — without it, every `getConfigurationProperty` call would re-scan the source.

**`onStart` callback**: the handler chain fires first. `ConfigurationPropertiesBindHandler.onStart` inspects nested targets: if the nested class itself carries `@ConfigurationProperties`, it annotates the `Bindable` so constructor-binding rules apply.

**`bindObject@423`** is the router:

```java
ConfigurationProperty property = findProperty(name, target, context);
if (property == null && context.depth != 0
        && containsNoDescendantOf(context.getSources(), name)) {
    return null;     // fast exit — nothing here
}
AggregateBinder<?> aggregateBinder = getAggregateBinder(target, context);
if (aggregateBinder != null) {
    return bindAggregate(...);   // Collection/Map/array
}
if (property != null) {
    return bindProperty(target, context, property);   // scalar
}
return bindDataObject(...);   // nested POJO — recurse
```

For a `@ConfigurationProperties` bean the root call always goes to `bindDataObject` (the bean itself is not a scalar). That calls `JavaBeanBinder` or `ValueObjectBinder`, which iterates over the bean's settable properties or constructor parameters, appends each field name to the current name to form a child `ConfigurationPropertyName`, and calls `binder.bind(childName, ...)` recursively. Each leaf field eventually reaches `findProperty` then `bindProperty`.

---

### Stage 6 — Name resolution: the env-var lookup

`findProperty@476` iterates every `ConfigurationPropertySource` and calls `source.getConfigurationProperty(name)`.

For the `SpringIterableConfigurationPropertySource` wrapping `SystemEnvironmentPropertySource`, `getConfigurationProperty@105` has two paths:

**Path A — mapper scan (direct)**: `super.getConfigurationProperty(name)` (the `SpringConfigurationPropertySource` implementation at `getConfigurationProperty@85`) iterates each `PropertyMapper` and asks it to produce candidate raw names:

```java
for (PropertyMapper mapper : this.mappers) {
    for (String candidate : mapper.map(name)) {
        Object value = getPropertySourceProperty(candidate);
        if (value != null) {
            return ConfigurationProperty.of(this, name, value, origin);
        }
    }
}
```

`SystemEnvironmentPropertyMapper.map(ConfigurationPropertyName)` (`map@47`) produces **up to four candidates** for a canonical name like `spring.datasource.url`:

| Format constant | Example output |
|---|---|
| `SYSTEM_ENVIRONMENT, upperCase=true` | `SPRING_DATASOURCE_URL` (dots→`_`, hyphens stripped, UPPER) |
| `LEGACY_SYSTEM_ENVIRONMENT, upperCase=true` | `SPRING_DATASOURCE_URL` (dots and hyphens→`_`, UPPER) |
| `SYSTEM_ENVIRONMENT, upperCase=false` | `spring_datasource_url` |
| `LEGACY_SYSTEM_ENVIRONMENT, upperCase=false` | `spring_datasource_url` |

The two formats differ when the config name contains hyphens (e.g., `spring.data-source.url`): `SYSTEM_ENVIRONMENT` would produce `SPRING_DATASOURCE_URL` (hyphens stripped inside element), `LEGACY_SYSTEM_ENVIRONMENT` produces `SPRING_DATA_SOURCE_URL` (hyphens become `_`). Both are tried to cover historical naming conventions.

`DefaultPropertyMapper.map(ConfigurationPropertyName)` (`map@48`) returns just the single canonical dotted form (`spring.datasource.url`), which would match a `.properties` or YAML key but not an env var.

`getPropertySourceProperty(candidate)` (`getPropertySourceProperty@106`) for a system-env source skips `SystemEnvironmentPropertySource.resolvePropertyName` (that would fold case again) and directly reads the cache snapshot:

```java
return getSystemEnvironmentProperty(
    ((SystemEnvironmentPropertySource) propertySource).getSource(), name);
// which does: return systemEnvironment.get(name)
//             ?? systemEnvironment.get(name.toLowerCase(Locale.ROOT));
```

For the `SpringIterableConfigurationPropertySource`, this goes through `Cache.getSystemEnvironmentProperty` (`getSystemEnvironmentProperty@351`) which hits the `systemEnvironmentCopy` map snapshot built during cache construction — avoiding live `System.getenv()` calls.

**Path B — cache reverse-lookup**: If all mapper candidates miss (e.g., the name came from a different mapper), `getCache().getMapped(name)` is tried. The cache (`tryUpdate@258`) is built on first access by iterating all raw property names in the source and calling `propertyMapper.map(String)` on each (the *reverse* direction):

`SystemEnvironmentPropertyMapper.map(String)` (`map@63`) → `convertName` → `ConfigurationPropertyName.adapt(propertySourceName, '_', this::processElementValue)`:
- Splits on `_` as the separator.
- `processElementValue` lowercases each segment and wraps purely-numeric segments in `[...]` to make them indexed elements. So `MY_APP_ITEMS_0_NAME` → `my.app.items[0].name`.

The result is memoized in `propertySourceNameCache`. The cache (`mappings`) accumulates the forward mapping `ConfigurationPropertyName → Set<String>` for all raw names. `getMapped(name)` returns the pre-built set, and the caller then calls `getPropertySourceProperty(candidate)` for each.

Both paths converge on the same env var entry; the cache path is faster for enumerable sources because it avoids re-computing the 4-candidate expansion on every lookup.

---

### Stage 7 — Value retrieval and placeholder resolution

Once `findProperty` returns a `ConfigurationProperty`, `bindProperty@490` takes it:

```java
context.setConfigurationProperty(property);          // for error reporting
Object result = property.getValue();                  // raw String from the map
result = this.placeholdersResolver.resolvePlaceholders(result);  // ${...}
result = context.getConverter().convert(result, target);
return result;
```

`PropertySourcesPlaceholdersResolver` resolves `${other.property.name}` references by re-entering the `PropertySources`. This happens *before* type conversion, so a placeholder like `${PORT:8080}` is expanded to `"8080"` as a String before it is converted to `int`.

---

### Stage 8 — Type conversion

`BindConverter.convert(source, Bindable<T>)` (`convert@95`) delegates to the private `convert(source, sourceType, targetType)` (`convert@105`):

```java
for (ConversionService delegate : this.delegates) {
    if (delegate.canConvert(sourceType, targetType)) {
        return delegate.convert(source, sourceType, targetType);
    }
}
```

The `delegates` list is built by `BindConverter.get(conversionServices, propertyEditorInitializer)` and contains:
- The application-context-provided `ConversionService` instances (typically `ApplicationConversionService`, which registers Spring Boot's own converters: `StringToDurationConverter`, `StringToDataSizeConverter`, `StringToFileSizeConverter`, `InetAddressConverter`, `CharsetConverter`, etc.).
- A `TypeConverterConversionService` — a `GenericConversionService` wrapping a `SimpleTypeConverter` backed by `PropertyEditor`s. This handles types that have a `PropertyEditor` registered (e.g., `java.io.File`, `java.net.URL`).

The first delegate that answers `canConvert` wins. If the value is already the target type (which happens on recursive `handleBindResult` calls), the conversion is a no-op.

---

### Stage 9 — Handler callbacks and final result

Back in `handleBindResult@384`:

```java
result = handler.onSuccess(name, target, context, result);
result = context.getConverter().convert(result, target);
// ...
handler.onFinish(name, target, context, result);
return context.getConverter().convert(result, target);
```

`onSuccess` fires up the entire handler chain. Each layer can observe or replace the value. `BoundPropertiesTrackingBindHandler` records the name here. Then conversion is applied again (idempotent if the type is already right, but needed because `onSuccess` may return a raw value).

`onFinish` is the last hook. `ValidationBindHandler` triggers JSR-303 validation here — after the full object is assembled, not during individual field binding — so validation operates on the finished state.

The final result is wrapped in `BindResult<T>`. `ConfigurationPropertiesBinder.bind` returns this `BindResult` to the post-processor; for JavaBean binding the bean was mutated in-place via setters so the `BindResult` value is the bean itself.

---

### How the stages connect — the key hand-off points

```
Environment (MutablePropertySources)
  └─ SystemEnvironmentPropertySource (raw Map<String,Object>)
       │
       │ ConfigurationPropertySources.attach()
       ▼
ConfigurationPropertySourcesPropertySource  ← inserted at head of env
  └─ SpringConfigurationPropertySources     ← lazy adapter over MutablePropertySources
       │
       │ .adapt() per source, on demand
       ▼
SpringIterableConfigurationPropertySource   ← one per raw source
  ├─ mappers: [SystemEnvironmentPropertyMapper, DefaultPropertyMapper]
  └─ Cache (built lazily): raw name → ConfigurationPropertyName, plus sys-env snapshot

ConfigurationPropertiesBindingPostProcessor (BeanPostProcessor)
  └─ ConfigurationPropertiesBinder.bind(propertiesBean)
       ├─ annotation.prefix()          → root ConfigurationPropertyName
       ├─ getBindHandler()             → handler chain (validators, error policy, advisors)
       └─ getBinder()                  → Binder(sources, placeholders, conversionServices, editors)

Binder.bind(name, target, handler)
  └─ bind(name, target, handler, context, false, false)   ← private
       ├─ handler.onStart()            → Bindable replacement / annotation
       ├─ bindObject()
       │    ├─ findProperty()          → iterates sources, calls getConfigurationProperty(name)
       │    │    └─ SpringIterableConfigurationPropertySource
       │    │         ├─ mapper.map(name) → [SPRING_DATASOURCE_URL, spring_datasource_url, ...]
       │    │         └─ Cache.getMapped(name) → reverse-lookup fallback
       │    ├─ bindProperty()          → getValue() → resolvePlaceholders() → convert()
       │    └─ bindDataObject()        → JavaBeanBinder/ValueObjectBinder → recurse per field
       └─ handleBindResult()
            ├─ handler.onSuccess()     → observer callbacks
            ├─ converter.convert()     → idempotent re-conversion
            ├─ handler.onFinish()      → JSR-303 validation
            └─ converter.convert()     → final type guarantee → BindResult<T>
```

The design decision that makes relaxed binding possible is the strict separation between the canonical name space (`ConfigurationPropertyName` in lowercase-dotted form) and the property-source key space. The `PropertyMapper` interface is the bridge in both directions: from canonical name to candidate raw keys (used during lookup), and from raw key to canonical name (used when building the cache). `SystemEnvironmentPropertyMapper` implements both directions with the four env-var patterns, so the binder only ever reasons about `spring.datasource.url` internally, and the mapping layer handles all the `SPRING_DATASOURCE_URL` / `SPRING_DATA_SOURCE_URL` variations transparently.
