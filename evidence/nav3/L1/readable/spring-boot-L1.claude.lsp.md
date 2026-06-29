# transcript: I'm adding a new option that controls how a @ConfigurationProperties type is bound, and I keep tripping on the difference between the descriptor the binder i...

  ▸ ToolSearch(select:LSP)

💬 Let me find the binder's target descriptor class.
  ▸ LSP(Bindable)
  ▸ LSP(Bindable)
  ▸ Bash(find /home/bench/repos/spring-boot -name "Bindable.java" 2>/dev/null)
  ▸ LSP(Bindable)

💬 Good, found it. Let me read `Bindable.java` in full.
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Bindable.java)

💬 Now let me look at `BindMethod` to understand the enum values and their semantics.
  ▸ LSP(BindMethod)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindMethod.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/BindMethodAttribute.java)

💬 Let me also check how `NO_DIRECT_PROPERTY` is used in the binder to explain it precisely.
  ▸ Bash(grep -rn "NO_DIRECT_PROPERTY\|hasBindRestriction\|BindRestriction" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/cont...)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Binder.java)

💬 Let me see how the converter uses `boxedType` vs `type` during the actual conversion step.
  ▸ Bash(grep -n "getBoxedType\|boxedType\|getType()" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Bi...)
  ▸ Bash(find /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/ -name "BindConverter.java")
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/BindConverter.java)

💬 Let me check where `getBoxedType()` is actually called across the binder.
  ▸ Bash(grep -rn "getBoxedType\|boxedType" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/ --include="...)

💬 I now have everything I need. Here's a complete breakdown of `Bindable<T>`, the descriptor the binder holds for each target.  ---  ## `Bindable<T>` — the bin...

──────── RESULT (success, 132175ms, 16 turns) ────────
I now have everything I need. Here's a complete breakdown of `Bindable<T>`, the descriptor the binder holds for each target.

---

## `Bindable<T>` — the binder's target descriptor

File: `core/spring-boot/src/main/java/org/springframework/boot/context/properties/bind/Bindable.java`

The class is immutable and final. Every mutating `with*` method returns a new instance sharing unchanged fields.

---

### The six fields

#### 1. `type` — `ResolvableType` (line 52)

The **declared type** of what is being bound, preserving full generic information (`ResolvableType` wraps `java.lang.reflect.Type`). This is the type the binder navigates — sub-properties are discovered against it, and `BindConverter.convert()` receives it directly (line 96 of `BindConverter`):

```java
<T> T convert(Object source, Bindable<T> target) {
    return convert(source, target.getType(), target.getAnnotations());
}
```

It may be a primitive (`int`, `boolean`, etc.).

---

#### 2. `boxedType` — `ResolvableType` (line 54)

The **wrapper form** of `type`, computed once at construction by `box()` (lines 320–331) and never settable independently:

- primitive → its wrapper class: `int` → `Integer`, `boolean` → `Boolean`, etc.
- `T[]` → `BoxedComponent[]`, recursing into the component type
- anything else → identical to `type`

It exists for exactly one reason: `Class.isInstance()` returns `false` for primitive types since no object can be an `int`. When `withExistingValue()` validates that the supplied object is compatible (line 195), it calls `boxedType.resolve().isInstance(existingValue)` (line 205), which works correctly for wrapper objects.

`boxedType` is also what `ValidationBindHandler` resolves to a class when it needs to instantiate a validator (line 117 of that file).

---

#### 3. `value` — `@Nullable Supplier<T>` (line 56)

A **lazy supplier** for a pre-existing or pre-constructed instance, or `null` when no instance is available yet.

- `null` → the binder must create the object itself
- non-null → the supplier returns the object that the binder should populate or use as a starting point

It is a `Supplier<T>`, not a bare `T`, so the existing object is held by reference inside the lambda rather than captured into the descriptor at construction time. `withExistingValue(T existingValue)` wraps it as `() -> existingValue` (line 199). `withSuppliedValue(Supplier<T>)` lets you pass an arbitrary supplier without locking in the bind method.

---

#### 4. `annotations` — `Annotation[]` (line 58)

Annotations **from the binding site** — typically the field or constructor parameter that this `Bindable` was derived from. They are threaded through to the converter so that type-conversion annotations such as `@DurationUnit` or `@DataSizeUnit` can influence how a raw string is turned into a typed value. The default is `NO_ANNOTATIONS` (an empty array, not `null`).

---

#### 5. `bindRestrictions` — `EnumSet<BindRestriction>` (line 60)

A set of opt-in restrictions on how the binder is allowed to satisfy this target. Currently there is exactly one member of the enum:

```
BindRestriction.NO_DIRECT_PROPERTY
```

When this restriction is present, `Binder.findProperty()` immediately returns `null` (line 478):

```java
if (name.isEmpty() || target.hasBindRestriction(BindRestriction.NO_DIRECT_PROPERTY)) {
    return null;
}
```

This means the binder will not attempt to satisfy the target by matching a single scalar configuration property at the current path. It forces binding to proceed only via sub-property traversal (i.e., by walking into the type's members). Used for aggregate types — collections, maps, nested beans — where collapsing the whole thing to one config key would be wrong.

---

#### 6. `bindMethod` — `@Nullable BindMethod` (line 62)

Controls which binding strategy is used. The enum has two values:

| Value | Strategy |
|---|---|
| `JAVA_BEAN` | Instantiate (or reuse the existing instance from `value`) and populate via setters |
| `VALUE_OBJECT` | Bind by calling a constructor, producing a fresh immutable object |

`null` means the binder will resolve the strategy itself through heuristics (presence of `@ConstructorBinding`, whether a suitable single constructor exists, etc.).

---

### The constraints that tie these fields together

These are the rules that make the fields non-independent:

**`withExistingValue()` locks `bindMethod` to `JAVA_BEAN`** (line 201):

```java
return new Bindable<>(this.type, this.boxedType, value, this.annotations, this.bindRestrictions,
        BindMethod.JAVA_BEAN);   // ← forced
```

An existing instance is by definition mutable and already constructed. Setting `bindMethod = VALUE_OBJECT` would be a contradiction because value-object binding creates a new object by calling the constructor.

**`withBindMethod(VALUE_OBJECT)` asserts `value == null`** (line 241):

```java
Assert.state(bindMethod != BindMethod.VALUE_OBJECT || this.value == null,
        () -> "Value object binding cannot be used with an existing or supplied value");
```

A constructor-bound value object must be built fresh from configuration. Providing a pre-existing instance to inject properties into is a JavaBean concern.

These two rules are strict inverses:

```
existingValue present  ⟹  bindMethod must be JAVA_BEAN
bindMethod == VALUE_OBJECT  ⟹  value must be null
```

**`boxedType` is always derived from `type`** — there is no `withBoxedType()`. It is computed in the `of(ResolvableType)` factory (lines 315–317) and preserved unchanged by every `with*` method, so it always faithfully describes the wrapper form of `type`.

---

### Summary of the lifecycle

When a `@ConfigurationProperties` class is registered, it arrives at the binder as roughly:

```java
Bindable.of(MyProps.class)
    .withExistingValue(existingBean)     // if the bean exists → forces JAVA_BEAN
    // OR
    .withBindMethod(BindMethod.VALUE_OBJECT)  // for @ConstructorBinding → asserts no value
    .withAnnotations(...)                // field/parameter annotations from binding site
```

The binder then reads `getBindMethod()` to choose the right `BeanBinder` implementation (`JavaBeanBinder` or `ValueObjectBinder`), uses `getType()` for property navigation and conversion, validates any existing value against `getBoxedType()`, checks `hasBindRestriction(NO_DIRECT_PROPERTY)` before trying scalar lookup, and threads `getAnnotations()` into the converter for every leaf property.
