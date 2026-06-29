# transcript: I'm adding a new option that controls how a @ConfigurationProperties type is bound, and I keep tripping on the difference between the descriptor the binder i...


💬 Let me find the descriptor class in the binding subsystem.
  ▸ Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src -type f -name "Bindable.java" 2>/dev/null)
  ▸ Bash(find /home/bench/repos/spring-boot -type f -name "Bindable.java" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Bindable.java)

💬 Now let me read the `BindMethod` enum and see how the binder actually uses these fields.
  ▸ Bash(find /home/bench/repos/spring-boot -type f -name "BindMethod.java" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindMethod.java)

💬 Now let me look at how the `Binder` consults these fields, particularly around `boxedType`, the value supplier, and `bindMethod`.
  ▸ Bash(find /home/bench/repos/spring-boot -type f -name "Binder.java" -path "*/bind/*" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java)

💬 Let me also check how `BindConverter` uses `boxedType` versus `type`, and how `withExistingValue` enforces the `JAVA_BEAN` constraint.
  ▸ Bash(find /home/bench/repos/spring-boot -type f -name "BindConverter.java" 2>/dev/null)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindConverter.java)

💬 I now have the full picture. Here's a precise breakdown of every field in `Bindable<T>` and how they constrain each other.  ---  ## `Bindable<T>` — field by ...

──────── RESULT (success, 93356ms, 10 turns) ────────
I now have the full picture. Here's a precise breakdown of every field in `Bindable<T>` and how they constrain each other.

---

## `Bindable<T>` — field by field

### `type` vs `boxedType`

`type` (`ResolvableType`) is the declared type, exactly as given — including primitives (`int`, `boolean`) and generics (`List<String>`). This is what the binder resolves for dispatch decisions: `getAggregateBinder` checks `target.getType().resolve()` to decide `Map`/`Collection`/array paths; `isUnbindableBean` checks `target.getType().resolve()` to skip primitives and `java.*` types.

`boxedType` exists solely because `int.class.isInstance(42)` returns `false`. It is computed once in `box()` (line 320): for a primitive, it allocates a one-element array of that primitive, reads the first element's class (the wrapper), and wraps that. For everything else, `boxedType == type`. Its only consumer is `boxedTypeIsInstanceOf` (line 204), called from `withExistingValue`'s assertion to check that the value you hand in is actually a legal instance of the target type.

**Conversion does not use `boxedType`.** `BindConverter.convert(source, Bindable<T>)` (line 95) passes `target.getType()` — the raw type — plus `target.getAnnotations()` to the `ResolvableTypeDescriptor`. The `ConversionService` layer handles primitive widening internally.

---

### `value` — the existing/supplied instance

```java
private final @Nullable Supplier<T> value;
```

This is a `Supplier`, not a bare value, so it is lazy: the instance isn't materialised until the binder actually needs it. Two factory methods populate it:

- **`withExistingValue(T existingValue)`** (line 194) wraps the value as `() -> existingValue` and, critically, also sets `bindMethod = JAVA_BEAN`. The presence of an existing value is definitionally setter binding: the binder populates that object in place.
- **`withSuppliedValue(Supplier<T> supplier)`** (line 214) stores the supplier as-is and leaves `bindMethod` unchanged. Use this when you want to lazily provide a default to mutate if properties are present, but don't want to force the bind-method.

`null` value means "create a fresh instance" — either via the constructor (VALUE_OBJECT) or via `new` + setters (JAVA_BEAN). The binder reads `target.getValue()` to decide whether to hand an existing object to the `JavaBeanBinder` or let it construct one.

---

### `annotations`

```java
private final Annotation[] annotations;
```

These do not come from the target class itself — they come from the *field or parameter declaration* at the binding site, forwarded here by the infrastructure. They have two effects:

1. **Conversion hints.** `BindConverter` wraps these into a `ResolvableTypeDescriptor` (line 148) and passes them to every `ConversionService` delegate. Converters like the duration converter inspect `@DurationUnit` here to pick the right `ChronoUnit` without the value carrying that context itself.

2. **Handler/binder inspection.** `BindHandler` implementations and custom `DataObjectBinder` impls receive the `Bindable` and can call `getAnnotation(SomeAnnotation.class)` to change behaviour per-target. The `Binder` itself doesn't gate on annotations directly — that's left to participants.

Use `withAnnotations(...)` to replace the whole array; it resets `bindRestrictions` to none (so if you're chaining, order matters).

---

### `bindRestrictions`

```java
private final EnumSet<BindRestriction> bindRestrictions;
```

Currently only one value exists: `NO_DIRECT_PROPERTY`. When present, `findProperty` (line 476) short-circuits to `null` even if the sources contain an exact property at that name. This tells the binder "don't try to coerce this entire target from a single scalar value; only descend into sub-properties." Complex aggregate types (a nested `@ConfigurationProperties` group) set this to prevent a raw string from accidentally matching the whole prefix.

`withBindRestrictions(...)` accumulates — it copies the existing set and adds to it, so restrictions compose without losing earlier ones.

---

### `bindMethod`

```java
private final @Nullable BindMethod bindMethod;
```

The `Binder` maintains three `DataObjectBinder` lists keyed on this (line 219–223):

| `bindMethod` | List used |
|---|---|
| `null` | `[ValueObjectBinder, JavaBeanBinder]` — tries constructor first, then setters |
| `VALUE_OBJECT` | `[ValueObjectBinder]` only |
| `JAVA_BEAN` | `[JavaBeanBinder]` only |

**The hard mutual-exclusion rule** is enforced by the two `withExistingValue` / `withBindMethod` paths:

- `withExistingValue` (line 194) asserts `bindMethod != VALUE_OBJECT` before proceeding, then sets `bindMethod = JAVA_BEAN`. An existing value and constructor binding are structurally incompatible: the constructor produces a new immutable object; there is nothing to pre-populate.
- `withBindMethod(VALUE_OBJECT)` (line 240) asserts `this.value == null`. You cannot demand constructor binding and also supply an object to mutate.

`withSuppliedValue` is the escape hatch: it does **not** force `JAVA_BEAN`, so you can supply a lazy default and still let the `bindMethod` field decide which strategy wins. But if you later call `withExistingValue` on the same `Bindable`, it will override `bindMethod` to `JAVA_BEAN` regardless.

---

### How the pieces gate each other — summary

```
withExistingValue(v)      → value = () -> v, bindMethod = JAVA_BEAN (forced)
withBindMethod(VALUE_OBJECT) → asserts value == null
withSuppliedValue(s)      → value = s, bindMethod unchanged (neutral)
withAnnotations(...)      → replaces annotations, resets bindRestrictions to {}
withBindRestrictions(...) → addAll to existing set
```

When you add your new option, the questions to anchor on are:
- Does it constrain which `DataObjectBinder` list is used? → extend `BindMethod` or gate in `bindDataObject`.
- Does it suppress a kind of property lookup? → add a new `BindRestriction` value and gate in `findProperty`/`bindObject`.
- Is it a conversion hint visible to converters? → put it in `annotations`.
- Is it about the instance lifecycle (existing vs fresh)? → it likely needs to interact with the `value`/`bindMethod` exclusion rule.
