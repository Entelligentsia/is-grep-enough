# transcript: I'm adding a new option that controls how a @ConfigurationProperties type is bound, and I keep tripping on the difference between the descriptor the binder i...


💬 Let me load the grove tools and explore the binder's descriptor type structurally.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__outline,mcp__grove__map)

💬 Now let me locate and outline the `Bindable` class and the binder directory.
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind","name":"Bindable","kind":"class"})
  ▸ mcp__grove__map({"dir":"spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind","kind":"class"})

💬 Grove returned empty — let me find the file path first, then use grove properly.
  ▸ Bash(find spring-boot-project/spring-boot/src/main/java/org/springframework/boot/context/properties/bind -name "Bindable.java" -o -name "*.java" | sort)
  ▸ Bash(find . -name "Bindable.java" 2>/dev/null | head -5)
  ▸ Bash(ls ./core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/)
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Bindable.java"})
  ▸ mcp__grove__outline({"file":"core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindMethod.java"})

💬 Good — now let me read the full `Bindable` source and pull in `BindMethod`.
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Bindable.java#Bindable@46"})
  ▸ Bash(cat -n ./core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindMethod.java)

💬 Now let me check how the binders consult `getBindMethod()` and how `BindRestriction` is tested in `Binder`.
  ▸ Bash(grep -n "getBindMethod\|bindMethod\|NO_DIRECT_PROPERTY\|hasBindRestriction\|getBoxedType\|getValue()" \   ./core/spring-boot/src/main/java/org/springframewor...)
  ▸ Bash(grep -n "dataObjectBinders\|BindMethod\." \   ./core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java | head -40)
  ▸ Read({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java","offset":380,"limit":55})
  ▸ Read({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java","offset":470,"limit":55})
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java)

💬 I have everything I need. Here is a complete account of `Bindable<T>`.  ---  ## `Bindable<T>` — what it carries and how the fields constrain one another  `Bi...

──────── RESULT (success, 113960ms, 17 turns) ────────
I have everything I need. Here is a complete account of `Bindable<T>`.

---

## `Bindable<T>` — what it carries and how the fields constrain one another

`Bindable<T>` (`core/spring-boot/…/bind/Bindable.java:46`) is the immutable descriptor the `Binder` receives for each binding target. It is always constructed through the static factories or the `with*` fluent mutators; the private constructor is never called directly by callers.

---

### The six fields

#### `type` — the declared `ResolvableType`

```java
private final ResolvableType type;  // line 52
```

The authoritative, generic-aware type the caller asked to bind — e.g. `List<String>`, `MyProps`, `int`. `getType()` returns this. `Binder` uses `target.getType().resolve(Object.class)` (line 503) when it needs the raw class to detect recursive binding. This type is also what appears in error messages and in `toString()`.

#### `boxedType` — the conversion-safe `ResolvableType`

```java
private final ResolvableType boxedType;  // line 54
```

Computed eagerly by the private `box()` helper (line 320) at construction time:

- Primitive → wrapper class (`int` → `Integer`).
- Primitive array → each component boxed recursively.
- Everything else → identical to `type`.

The converter calls `context.getConverter().convert(result, target)` (line 388, 403, 406), which resolves the target type through `boxedType`. That way a raw property string like `"42"` can be converted to `Integer` even when the declared field type is the primitive `int`. The `withExistingValue` validator uses `boxedTypeIsInstanceOf()` (line 204) — not `type` — to check that the existing instance matches, for the same reason.

#### `value` — the pre-existing or supplied instance

```java
private final @Nullable Supplier<T> value;  // line 56
```

`null` when there is no instance yet. Otherwise a `Supplier<T>` wrapping either a concrete existing object (`withExistingValue`) or an arbitrary supplier (`withSuppliedValue`). Callers reach it via `getValue()`.

`JavaBeanBinder` checks this in two places:

- Line 65: `target.getValue() != null` is used as an early signal that there are already properties set on the object (skipping an expensive scan if none are bound).
- Lines 273–274: when populating properties it calls `target.getValue().get()` to obtain the mutable instance to mutate, rather than constructing a new one.

When `value` is `null`, `JavaBeanBinder` constructs a fresh instance via reflection.

#### `annotations` — binding-affecting annotations

```java
private final Annotation[] annotations;  // line 58
```

Annotations from the source element that the binder should consult during binding — most commonly `@DefaultValue` and `@Name` from sub-property descriptors. Defaults to the `NO_ANNOTATIONS` constant (empty array). `withAnnotations()` replaces the array wholesale (it does not merge). `getAnnotation(Class<A>)` (line 113) does a linear scan; the array is always tiny.

#### `bindRestrictions` — behavioural gate flags

```java
private final EnumSet<BindRestriction> bindRestrictions;  // line 60
```

Currently one member: `BindRestriction.NO_DIRECT_PROPERTY` (nested enum at line ~348).

`Binder.findProperty()` (line 478) checks this first:

```java
if (name.isEmpty() || target.hasBindRestriction(BindRestriction.NO_DIRECT_PROPERTY)) {
    return null;
}
```

When the flag is set, the binder never tries to match the name as a scalar key in any `ConfigurationPropertySource`. It skips straight to data-object sub-property traversal. This is used for `@ConfigurationProperties` roots: you want `spring.datasource.url` bound, not `spring.datasource` interpreted as a raw string.

`withBindRestrictions()` accumulates (additive via `EnumSet.copyOf` + `addAll`); it never removes flags.

#### `bindMethod` — JavaBean vs value-object selector

```java
private final @Nullable BindMethod bindMethod;  // line 62
```

`BindMethod` is a two-constant enum (`core/…/bind/BindMethod.java:25`):

| Constant | Semantics |
|---|---|
| `JAVA_BEAN` | Setter/getter binding; existing mutable instance allowed |
| `VALUE_OBJECT` | Constructor binding; immutable; no existing instance permitted |

`Binder` holds a `Map<@Nullable BindMethod, List<DataObjectBinder>>` (lines 75, 219–222):

```java
dataObjectBinders.put(BindMethod.VALUE_OBJECT, List.of(valueObjectBinder));
dataObjectBinders.put(BindMethod.JAVA_BEAN,    List.of(javaBeanBinder));
dataObjectBinders.put(null,                    List.of(valueObjectBinder, javaBeanBinder));
```

`null` means **auto-detect**: both binders are tried in order (`ValueObjectBinder` first, then `JavaBeanBinder`). Whichever returns a non-null result wins. An explicit `BindMethod` restricts the lookup to exactly one binder with no fallback.

---

### Constraints between fields

**1. `value` and `VALUE_OBJECT` are mutually exclusive — enforced by assertions in both directions.**

`withExistingValue()` (line 194):
```java
Assert.state(this.bindMethod != BindMethod.VALUE_OBJECT,
    () -> "An existing value cannot be provided when binding as a value object");
```

`withBindMethod(VALUE_OBJECT)` (line 240):
```java
Assert.state(bindMethod != BindMethod.VALUE_OBJECT || this.value == null,
    () -> "Value object binding cannot be used with an existing or supplied value");
```

The invariant is fundamental: `ValueObjectBinder` produces a brand-new immutable instance from constructor arguments; there is no object to hand it in advance.

**2. `withExistingValue()` always hard-locks `bindMethod` to `JAVA_BEAN`.**

Even if `bindMethod` was `null` (auto-detect), once an existing value is supplied the descriptor is fixed to setter-based binding (line 200 passes `BindMethod.JAVA_BEAN` to the constructor). You cannot have an existing instance and leave the binding method ambiguous.

**3. `withSuppliedValue()` does not change `bindMethod`.**

It threads `this.bindMethod` through unchanged (line 216). A supplier with `null` bind-method is legal — useful when you want to provide a default-construction lambda but still allow the auto-detect path to pick the right strategy.

**4. `value` is excluded from `equals()`/`hashCode()`** (lines 143–161).

Identity is defined by `type` (resolved class only, not full generics), `annotations`, `bindRestrictions`, and `bindMethod`. Two descriptors for the same type with different suppliers are equal. That matters for caching and deduplication of binding targets.

**5. `boxedType` is also excluded from `equals()`/`hashCode()`.**

It is entirely derived from `type`, so including it would be redundant.

---

### Summary in one sentence per field

| Field | Role |
|---|---|
| `type` | The generic declared type: drives recursion, error messages, type resolution |
| `boxedType` | The primitive-safe wrapper type: used exclusively by the converter |
| `value` | A `Supplier` for the pre-existing instance (null = create fresh); its presence locks `bindMethod` to `JAVA_BEAN` |
| `annotations` | `@DefaultValue`, `@Name`, etc. — passed alongside the descriptor for per-property decisions |
| `bindRestrictions` | Additive gate flags; currently only `NO_DIRECT_PROPERTY` to suppress scalar key lookup |
| `bindMethod` | `null` = auto-detect both strategies; `JAVA_BEAN` = setters only; `VALUE_OBJECT` = constructor only; mutually exclusive with a non-null `value` |
