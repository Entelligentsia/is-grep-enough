# transcript: I'm planning a change to how a property set as an environment variable ends up bound into a @ConfigurationProperties bean, so I need the full journey of one ...


💬 I'll map the full binding pipeline by exploring the key classes across the machinery.

  ▸ Agent(Trace Spring Boot property binding pipeline from environment to @ConfigurationProperties)  ⟶ subagent:
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBindingPostPro...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/source/ConfigurationPropertySources.java)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySou...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySou...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMappe...)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindConverter.java)
      ↳ Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindResult.java)
      ↳ Bash(ls -la /home/bench/repos/spring-boot/)
      ↳ Bash(find /home/bench/repos/spring-boot -type d -name "spring-boot-project" 2>/dev/null | head -5)
      ↳ Bash(find /home/bench/repos/spring-boot -type f -name "ConfigurationPropertiesBindingPostProcessor.java" 2>/dev/null)
      ↳ Bash(find /home/bench/repos/spring-boot -type f \( -name "ConfigurationPropertiesBindingPostProcessor.java" -o -name "ConfigurationPropertiesBinder.java" -o -name...)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBindingPostProcessor.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/ConfigurationPropertySources.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySources.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SpringConfigurationPropertySource.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMapper.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindConverter.java)
      ↳ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindResult.java)
      ↳ ⟹ returned to parent


💬 Let me verify the actual file paths and a few key implementation details before synthesizing.
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties -name "SystemEnvironmentProperty...)
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind -name "Binder.java" -o -nam...)
  ▸ Bash(find /home/bench/repos/spring-boot -name "SystemEnvironmentPropertyMapper.java" 2>/dev/null | head -5)
  ▸ Bash(ls /home/bench/repos/spring-boot/)
  ▸ Bash(grep -n "map\|candidate\|legac\|format\|LEGACY\|addIfMissing\|UPPER\|underscore" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframe...)
  ▸ Bash(grep -n "findProperty\|bindObject\|bindProperty\|bindDataObject\|onStart\|onSuccess\|onFailure\|handler\." /home/bench/repos/spring-boot/core/spring-boot/src...)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/source/SystemEnvironmentPropertyMapper.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java)
  ▸ Bash(grep -n "ToStringFormat\|SYSTEM_ENVIRONMENT\|LEGACY" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties...)
  ▸ Bash(grep -n "getBinder\|getConfigurationPropertySources\|from(this\|propertySources\|BindHandler\|getBindHandler\|validat" /home/bench/repos/spring-boot/core/spr...)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/ConfigurationPropertiesBinder.java)
  ▸ Bash(grep -n "SYSTEM_ENVIRONMENT\|LEGACY_SYSTEM_ENVIRONMENT\|buildSimpleToString\|buildLegacy" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/sp...)
  ▸ Bash(grep -n "Form\b\|UNIFORM\|ORIGINAL\|DASHED\|enum Form" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properti...)

💬 Now I have everything I need. Here is the complete picture:  ---  ## The full binding pipeline: env var → `@ConfigurationProperties` bean  The journey has si...

──────── RESULT (success, 173463ms, 15 turns) ────────
Now I have everything I need. Here is the complete picture:

---

## The full binding pipeline: env var → `@ConfigurationProperties` bean

The journey has six distinct stages. Each is owned by a specific class in `core/spring-boot/src/main/java/org/springframework/boot/context/properties/`.

---

### Stage 1 — Bean post-processing trigger

**`ConfigurationPropertiesBindingPostProcessor`**

During the Spring bean lifecycle, `postProcessBeforeInitialization()` fires for every bean. If the bean is annotated with `@ConfigurationProperties` it is wrapped in a `ConfigurationPropertiesBean` descriptor and handed to `ConfigurationPropertiesBinder.bind()`. Nothing about property lookup happens here; this is purely the entry point that translates "bean being initialized" into "start binding."

---

### Stage 2 — Orchestration and source wiring

**`ConfigurationPropertiesBinder`** (`bind()` → `getBinder()`)

This class owns two jobs:

**a) Build the handler chain.** `getBindHandler()` wraps a base `IgnoreTopLevelConverterNotFoundBindHandler` in a decorator stack: `ConfigurationPropertiesBindHandler` (always), `IgnoreErrorsBindHandler` (when `ignoreInvalidFields=true`), `NoUnboundElementsBindHandler` (strict mode), `ValidationBindHandler` (when `@Validated` or a JSR-303 provider is present), and any `ConfigurationPropertiesBindHandlerAdvisor` beans from the context. This chain is the extension point — every `onStart`/`onSuccess`/`onFailure`/`onFinish` callback in later stages flows through it.

**b) Build the `Binder`.** `getBinder()` (lazy, volatile-cached) calls:
```
new Binder(
    getConfigurationPropertySources(),   // wraps Spring PropertySources
    getPropertySourcesPlaceholdersResolver(),
    getConversionServices(),             // from ApplicationContext
    getPropertyEditorInitializer(),      // BeanFactory editors
    null, null)
```

`getConfigurationPropertySources()` is the key wiring call — it calls `ConfigurationPropertySources.from(this.propertySources)`, converting Spring's `PropertySources` into the binder's own abstraction.

Then `getBinder().bind(annotation.prefix(), target, bindHandler)` kicks off the actual binding.

---

### Stage 3 — Adapting property sources

**`ConfigurationPropertySources.from()`** → **`SpringConfigurationPropertySources`** → **`SpringConfigurationPropertySource.from()`**

`ConfigurationPropertySources.from(propertySources)` returns a `SpringConfigurationPropertySources`, which is a lazy `Iterable<ConfigurationPropertySource>`. Its inner `SourcesIterator` walks the Spring `PropertySource` list depth-first (flattening nested `ConfigurableEnvironment` instances) and for each source calls `adapt()`.

`adapt()` caches results in a `ConcurrentReferenceHashMap` keyed by identity. For a new or changed source it delegates to `SpringConfigurationPropertySource.from(source)`.

**`SpringConfigurationPropertySource.from()`** is where the environment-variable case is detected:

```java
// selects mappers based on source type
PropertyMapper[] mappers = isSystemEnvironmentSource(source)
    ? new PropertyMapper[]{ SystemEnvironmentPropertyMapper.INSTANCE, DefaultPropertyMapper.INSTANCE }
    : new PropertyMapper[]{ DefaultPropertyMapper.INSTANCE };
```

`isSystemEnvironmentSource` checks whether the source is a `SystemEnvironmentPropertySource` (or one wrapping it). If it is, `SystemEnvironmentPropertyMapper` is placed *first* so its candidate names are tried before the default dot-separated ones.

For enumerable sources (`EnumerablePropertySource`) the result is a `SpringIterableConfigurationPropertySource`, which can support `containsDescendantOf` checks. For non-enumerable sources it's a plain `SpringConfigurationPropertySource`.

---

### Stage 4 — Name mapping: configuration name → env-var candidates

**`SystemEnvironmentPropertyMapper.map(ConfigurationPropertyName)`**

When the binder asks `source.getConfigurationProperty(name)` for a `ConfigurationPropertyName` like `server.port`, the source iterates its mappers and calls `mapper.map(name)` on each to get a list of candidate property-key strings to try against the underlying `PropertySource`.

`SystemEnvironmentPropertyMapper.map()` calls `ConfigurationPropertyName.toString()` four times with different format/case combinations and de-duplicates with `addIfMissing`:

```java
addIfMissing(mapped, name.toString(SYSTEM_ENVIRONMENT, true));         // SERVER_PORT   (uniform form, uppercase)
addIfMissing(mapped, name.toString(LEGACY_SYSTEM_ENVIRONMENT, true));  // SERVER_PORT   (original form, uppercase — often same)
addIfMissing(mapped, name.toString(SYSTEM_ENVIRONMENT, false));        // server_port   (uniform form, lowercase)
addIfMissing(mapped, name.toString(LEGACY_SYSTEM_ENVIRONMENT, false)); // server_port   (original form, lowercase)
```

The two **formats** differ in what they do with dashed elements:

- `SYSTEM_ENVIRONMENT` — `buildSimpleToString('_', i -> getElement(i, Form.UNIFORM))` — each element is lowercased and stripped of dashes (`camel-case` → `camelcase`), joined with `_`.
- `LEGACY_SYSTEM_ENVIRONMENT` — `buildSimpleToString('_', i -> getElement(i, Form.ORIGINAL).replace('-', '_'))` — preserves original casing but replaces `-` with `_`, then optionally uppercased.

So for a name with a dashed element like `spring.data-source.url` the two formats diverge and you get up to four distinct strings. Numeric elements become `[N]` bracket form in the reverse direction (when mapping env-var names *back* to `ConfigurationPropertyName`).

Each candidate string is then tried against the underlying `SystemEnvironmentPropertySource.getProperty()` (which also applies a case-insensitive lookup internally), and the first non-null hit wins.

---

### Stage 5 — Core binder: property lookup, handler callbacks, and recursive descent

**`Binder`**

The entry-point call `bind(prefix, target, handler)` resolves the prefix string to a `ConfigurationPropertyName`, creates a `Context`, and calls the private recursive `bind()`.

Every call to the private `bind()` wraps its work in `ConfigurationPropertyCaching.CacheOverride` (so repeated lookups during one bind are fast) and follows this sequence:

```
handler.onStart(name, target, context)   // can replace the Bindable
    ↓
bindObject(name, target, handler, context, ...)
    ↓
handleBindResult / handleBindError
    ↓
handler.onSuccess / handler.onCreate / handler.onFinish   (or handler.onFailure)
```

**`bindObject`** is the heart of the decision tree:

1. `findProperty(name, target, context)` — iterates all `ConfigurationPropertySource`s and calls `source.getConfigurationProperty(name)`. This is where stage 4's mapper fires.
2. `getAggregateBinder(target)` — if the target is a `Map`, `Collection`, or array, delegates to the corresponding aggregate binder (which recursively binds each element).
3. If a direct property was found: calls `bindProperty()`.
4. If not, or if the target is a data object: calls `bindDataObject()`, which builds a `DataObjectPropertyBinder` lambda that recurses — `bind(name.append(propertyName), ...)` — for each field/constructor parameter.

**`bindProperty()`** extracts the raw value, runs placeholder resolution, and delegates to `BindConverter`:

```java
Object result = property.getValue();
result = this.placeholdersResolver.resolvePlaceholders(result);  // ${...} expansion
result = context.getConverter().convert(result, target);         // String → target type
```

**`handleBindResult()`** (after `bindObject` returns) calls `handler.onSuccess()` and then `context.getConverter().convert(result, target)` again, which is the moment the `ValidationBindHandler` in the chain runs JSR-303 validation.

**`bindDataObject()`** selects a `DataObjectBinder` — either `ValueObjectBinder` (for `@ConstructorBinding` / records) or `JavaBeanBinder` (for mutable beans with setters) — via `BindMethod`. For value objects the binder identifies the binding constructor and recursively binds each parameter. For Java beans it instantiates the type and calls setters.

---

### Stage 6 — Type conversion

**`BindConverter`**

The converter holds a chain of `ConversionService` delegates assembled at `Binder` construction time:

1. `TypeConverterConversionService` — wraps Spring's `PropertyEditor` mechanism; handles `String → Resource[]`, `String → Collection`, etc.
2. User-supplied `ConversionService` beans from the `ApplicationContext` (registered via `@Bean ConversionService`).
3. `ApplicationConversionService.getSharedInstance()` — the default, which includes all standard Spring converters (string-to-number, string-to-duration, string-to-data-size, string-to-enum, etc.).

`convert(source, target)` iterates delegates in order; for each it checks `canConvert()` before calling `convert()`, so the first delegate that can handle the pair wins. If none can, it throws `ConverterNotFoundException`.

---

### Stage 7 — Result delivery

**`BindResult`**

`Binder.bind()` returns a `BindResult<T>` — essentially an `Optional` with a binding-specific API (`isBound()`, `get()`, `orElse()`, `map()`, `orElseThrow()`). The factory method `BindResult.of(value)` returns the shared `UNBOUND` singleton when value is `null`.

`ConfigurationPropertiesBinder.bind()` receives this and Spring applies the fully-populated object back onto the bean instance.

---

### How the stages connect — the abbreviated call graph

```
ConfigurationPropertiesBindingPostProcessor.postProcessBeforeInitialization()
  └─ ConfigurationPropertiesBinder.bind(bean)
       ├─ getBindHandler()            → builds decorator chain (validation, ignore-errors, ...)
       └─ getBinder().bind(prefix, target, handler)
            │  [Binder]
            ├─ handler.onStart()
            ├─ bindObject()
            │    ├─ findProperty()
            │    │    └─ SpringConfigurationPropertySource.getConfigurationProperty(name)
            │    │         └─ SystemEnvironmentPropertyMapper.map(name)
            │    │              → ["SERVER_PORT", "server_port", ...]
            │    │         └─ PropertySource.getProperty("SERVER_PORT")  → raw String
            │    └─ bindProperty()
            │         ├─ placeholdersResolver.resolvePlaceholders()
            │         └─ BindConverter.convert(rawString, targetType)
            │              → String "8080" becomes Integer 8080
            └─ handleBindResult()
                 ├─ handler.onSuccess()   (validation fires here)
                 └─ BindConverter.convert()  (final coercion)
```

---

### Key points to keep in mind if you're modifying this flow

- **Adding a new name format** — `SystemEnvironmentPropertyMapper.map()` calls `ConfigurationPropertyName.toString(format, upperCase)`. The format enum lives in `ConfigurationPropertyName.ToStringFormat`; the actual string-building is in `buildSimpleToString()`. That's the only place to add a new canonical form.
- **Intercepting or short-circuiting binding** — implement `BindHandler` and register a `ConfigurationPropertiesBindHandlerAdvisor` bean; it's spliced into the chain in `getBindHandler()`.
- **Adding a new conversion** — register a `Converter` or `GenericConverter` in a `ConversionService` bean; `BindConverter` picks it up as the second delegate in its chain.
- **Changing how a `PropertySource` is adapted** — override `SpringConfigurationPropertySource.from()` or supply an alternate `PropertyMapper`; the mapper array is chosen once during adaptation and then used for every lookup against that source.
- **The `attach()` path vs. `from()` path** — `ConfigurationPropertySources.attach(environment)` wraps the environment's sources in-place so that `@Value` and `Environment.getProperty()` also benefit from relaxed binding. The `from()` path used by `ConfigurationPropertiesBinder` is a separate adapter used only by the `Binder`; both paths converge on `SpringConfigurationPropertySource` but are independently maintained.
