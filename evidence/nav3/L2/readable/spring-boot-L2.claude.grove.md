# spring-boot · L2 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **spring-boot** (java) @ `e16c5d014`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | spring-boot (java) · L2 |
| pinned source | `e16c5d01417f5a6efc35714e83060aadc17a9321` |
| status | completed |
| engagement | `grove_tools = 23` (gate: > 0 → ✓ used its capability) |
| turns | 32 |
| wall clock | 106 s |
| context (peak) | 406,202 tokens |
| cost (billed) | $0.4097 |
| &nbsp;&nbsp;↳ token split | in 21 · out 6,070 · cache-create 34,394 · cache-read 371,787 |
| tool calls | 31 (mcp__grove__source×17, mcp__grove__outline×4, Read×4, Bash×3, mcp__grove__symbols×2, ToolSearch×1) |
| evidence | `evidence/nav3/L2/raw/spring-boot-L2.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to change how the process exit code is chosen when a Spring Boot application ends, whether it finishes by failing during startup or by an explicit programmatic shutdown, and I need to cover every place a code can come from. Walk me through the routine(s) that assemble the final exit code, the different sources that can contribute one (a thrown exception that itself carries a code, a mapped exception, a bean or a supplied generator), how the contributing generators are ordered and combined, and how the chosen code is then published or returned to the caller.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll load the grove tools and then trace the exit code machinery from first principles.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__outline,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)`

💬 Now let me locate the exit code machinery. I'll search for the key classes simultaneously.

&nbsp;&nbsp;▸ `mcp__grove__symbols(SpringApplication)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(ExitCode)`
&nbsp;&nbsp;▸ `Bash(find spring-boot-project/spring-boot/src/main/java/org/springframework/boot -name "*ExitCode*" -o -name "*exit*" | sort)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/spring-boot -name "*ExitCode*" | sort)`
&nbsp;&nbsp;▸ `Bash(ls /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ | grep -i "exit\|Spring" | sort)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationShutdownHook.java)`

💬 Now I'll read all the key method bodies in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#run@304)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#handleRunFailure@803)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#getExitCode@92)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#addAll@44)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#handleExitCode@881)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getExitCodeFromException@894)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getExitCodeFromMappedException@902)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getExitCodeFromExitCodeGeneratorException@912)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#exit@1396)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#add@58)`

💬 Now let me get the remaining pieces: the interfaces, the `MappedExitCodeGenerator`, and `SpringBootExceptionHandler`.

&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#MappedExitCodeGenerator@113)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#addAll@50)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerator.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeExceptionMapper.java)`
&nbsp;&nbsp;▸ `mcp__grove__outline(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java#registerExitCode@61)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java#uncaughtException@66)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java#forCurrentThread@121)`
&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getSpringBootExceptionHandler@922)`

💬 I have a complete picture. Let me read the one remaining piece — the `add(ExitCodeGenerator)` method and its list field.

&nbsp;&nbsp;▸ `mcp__grove__source(java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#add@76)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeEvent.java)`

💬 I now have everything needed for a complete explanation.

---

## Exit Code Assembly in Spring Boot

There are two distinct entry points that each assemble the code differently, but both use the same underlying `ExitCodeGenerators` aggregator.

---

### Entry Point 1 — Startup failure

The `run()` method (`SpringApplication.java:304`) wraps the entire bootstrap in a `try/catch (Throwable)`. Any exception escaping from environment prep, context creation, refresh, runner invocation, or the `ready` event lands here:

```
run() → catch(Throwable ex) → handleRunFailure(context, ex, listeners)
```

`handleRunFailure` (`line 803`) immediately calls `handleExitCode(context, exception)` (`line 881`) before doing anything else (notifying listeners of failure, reporting, closing the context). That ordering matters: the code is determined and published before the context is torn down.

`handleExitCode` drives a two-stage waterfall through `getExitCodeFromException` (`line 894`):

**Stage 1 — bean mappers (`getExitCodeFromMappedException`, line 902)**

```java
Collection<ExitCodeExceptionMapper> beans = context.getBeansOfType(ExitCodeExceptionMapper.class).values();
generators.addAll(exception, beans);   // wraps each (exception, mapper) in MappedExitCodeGenerator
return generators.getExitCode();
```

This only runs if the context is non-null and active. Each `ExitCodeExceptionMapper` bean gets the whole exception and returns an `int` (0 means "not mine"). The mappers are wrapped in `MappedExitCodeGenerator` adapters, which implement `ExitCodeGenerator`, and are sorted via `AnnotationAwareOrderComparator`. If any mapper returns a non-zero code, that code wins and stage 2 is skipped.

**Stage 2 — self-reporting exception (`getExitCodeFromExitCodeGeneratorException`, line 912)**

Only reached if stage 1 returned 0 (either because the context was not active, or no mapper matched). This walks the exception chain recursively through `getCause()`, looking for the first `Throwable` that also implements `ExitCodeGenerator`:

```java
if (exception instanceof ExitCodeGenerator generator) {
    return generator.getExitCode();
}
return getExitCodeFromExitCodeGeneratorException(exception.getCause());
```

So a thrown exception can directly carry its own code by implementing `ExitCodeGenerator`.

---

### Entry Point 2 — Programmatic shutdown

`SpringApplication.exit(ApplicationContext, ExitCodeGenerator...)` (`line 1396`) is the explicit API for user-controlled shutdown:

```java
ExitCodeGenerators generators = new ExitCodeGenerators();
Collection<ExitCodeGenerator> beans = context.getBeansOfType(ExitCodeGenerator.class).values();
generators.addAll(exitCodeGenerators);   // caller-supplied generators added first
generators.addAll(beans);               // then all ExitCodeGenerator beans
exitCode = generators.getExitCode();
```

The caller-supplied generators go in before the beans. Because every `add()` re-sorts the list with `AnnotationAwareOrderComparator`, the final traversal order is by `@Order`/`Ordered` rank, not insertion order — but if all have the same priority, insertion order is preserved.

---

### The `ExitCodeGenerators` aggregator

`ExitCodeGenerators` (`ExitCodeGenerators.java`) is a thin list that normalises both sources (direct generators and mapper-wrapped generators) into the same `ExitCodeGenerator` interface:

```java
private final List<ExitCodeGenerator> generators = new ArrayList<>();

void add(ExitCodeGenerator generator) {
    this.generators.add(generator);
    AnnotationAwareOrderComparator.sort(this.generators);  // resort after every add
}
```

The combination rule in `getExitCode()` (`line 92`) is **first non-zero wins, short-circuit**:

```java
for (ExitCodeGenerator generator : this.generators) {
    int value = generator.getExitCode();
    if (value != 0) {
        exitCode = value;
        break;            // stops here; later generators are ignored
    }
    // if a generator throws, exitCode becomes 1 and the loop exits via catch
}
```

So generators are ordered by Spring's `@Order` / `Ordered` / `PriorityOrdered` and the lowest ordinal value that returns non-zero is the answer. There is no "sum" or "merge" — priority order decides.

---

### How the chosen code is published / returned

**Startup failure path (`handleExitCode`, line 881):**

```java
if (exitCode != 0) {
    context.publishEvent(new ExitCodeEvent(context, exitCode));   // (1) event
    SpringBootExceptionHandler handler = getSpringBootExceptionHandler();
    if (handler != null) {
        handler.registerExitCode(exitCode);                       // (2) UEH stash
    }
}
```

1. **`ExitCodeEvent`** is fired on the context. This is informational — any `ApplicationListener<ExitCodeEvent>` can react (logging, metrics, custom cleanup). It does not cause a JVM exit.

2. **`SpringBootExceptionHandler`** is a thread-local `UncaughtExceptionHandler` installed on the main thread. It only receives the code when `getSpringBootExceptionHandler()` is called from the main thread (`isMainThread` check at line 929). `registerExitCode` simply stores the int. When the main thread's uncaught exception handler fires (`uncaughtException`, line 66), it calls:

    ```java
    if (this.exitCode != 0) {
        System.exit(this.exitCode);  // <-- actual JVM exit
    }
    ```

    This is the mechanism by which a startup crash drives the OS process exit code when running from the main thread. If the failure happens on a non-main thread, `handler` is null and no `System.exit` fires through this path.

**Programmatic shutdown path (`exit()`, line 1396):**

```java
if (exitCode != 0) {
    context.publishEvent(new ExitCodeEvent(context, exitCode));  // event
}
// finally: close(context)
return exitCode;
```

`exit()` closes the context and **returns the int to the caller**. The caller is expected to pass it to `System.exit()` themselves:

```java
System.exit(SpringApplication.exit(ctx));
```

There is no implicit `System.exit` here. If the context close throws, the catch block preserves a previously non-zero code: `exitCode = (exitCode != 0) ? exitCode : 1`.

---

### Summary of all contributing sources, in precedence order

| When | Source | How contributed | Priority |
|---|---|---|---|
| Startup failure | `ExitCodeExceptionMapper` **beans** | Wrapped in `MappedExitCodeGenerator`, sorted by `@Order` | First — tried before self-reporting exception |
| Startup failure | Exception that **implements `ExitCodeGenerator`** | Walks cause chain, first match wins | Second — only if mapper path returns 0 |
| Programmatic shutdown | Caller-supplied `ExitCodeGenerator[]` | Added to list before beans | Sorted together by `@Order`; caller-supplied generators have the same opportunity to win as beans |
| Programmatic shutdown | `ExitCodeGenerator` **beans** | Fetched from context and added after caller-supplied | Sorted by `@Order` in the same list |

Within either path, once `ExitCodeGenerators.getExitCode()` finds the first non-zero value in sort order, it stops — no later generator can override or modify it.


## Final answer

_Result event — success, 106 s, 32 turns._

I now have everything needed for a complete explanation.

---

## Exit Code Assembly in Spring Boot

There are two distinct entry points that each assemble the code differently, but both use the same underlying `ExitCodeGenerators` aggregator.

---

### Entry Point 1 — Startup failure

The `run()` method (`SpringApplication.java:304`) wraps the entire bootstrap in a `try/catch (Throwable)`. Any exception escaping from environment prep, context creation, refresh, runner invocation, or the `ready` event lands here:

```
run() → catch(Throwable ex) → handleRunFailure(context, ex, listeners)
```

`handleRunFailure` (`line 803`) immediately calls `handleExitCode(context, exception)` (`line 881`) before doing anything else (notifying listeners of failure, reporting, closing the context). That ordering matters: the code is determined and published before the context is torn down.

`handleExitCode` drives a two-stage waterfall through `getExitCodeFromException` (`line 894`):

**Stage 1 — bean mappers (`getExitCodeFromMappedException`, line 902)**

```java
Collection<ExitCodeExceptionMapper> beans = context.getBeansOfType(ExitCodeExceptionMapper.class).values();
generators.addAll(exception, beans);   // wraps each (exception, mapper) in MappedExitCodeGenerator
return generators.getExitCode();
```

This only runs if the context is non-null and active. Each `ExitCodeExceptionMapper` bean gets the whole exception and returns an `int` (0 means "not mine"). The mappers are wrapped in `MappedExitCodeGenerator` adapters, which implement `ExitCodeGenerator`, and are sorted via `AnnotationAwareOrderComparator`. If any mapper returns a non-zero code, that code wins and stage 2 is skipped.

**Stage 2 — self-reporting exception (`getExitCodeFromExitCodeGeneratorException`, line 912)**

Only reached if stage 1 returned 0 (either because the context was not active, or no mapper matched). This walks the exception chain recursively through `getCause()`, looking for the first `Throwable` that also implements `ExitCodeGenerator`:

```java
if (exception instanceof ExitCodeGenerator generator) {
    return generator.getExitCode();
}
return getExitCodeFromExitCodeGeneratorException(exception.getCause());
```

So a thrown exception can directly carry its own code by implementing `ExitCodeGenerator`.

---

### Entry Point 2 — Programmatic shutdown

`SpringApplication.exit(ApplicationContext, ExitCodeGenerator...)` (`line 1396`) is the explicit API for user-controlled shutdown:

```java
ExitCodeGenerators generators = new ExitCodeGenerators();
Collection<ExitCodeGenerator> beans = context.getBeansOfType(ExitCodeGenerator.class).values();
generators.addAll(exitCodeGenerators);   // caller-supplied generators added first
generators.addAll(beans);               // then all ExitCodeGenerator beans
exitCode = generators.getExitCode();
```

The caller-supplied generators go in before the beans. Because every `add()` re-sorts the list with `AnnotationAwareOrderComparator`, the final traversal order is by `@Order`/`Ordered` rank, not insertion order — but if all have the same priority, insertion order is preserved.

---

### The `ExitCodeGenerators` aggregator

`ExitCodeGenerators` (`ExitCodeGenerators.java`) is a thin list that normalises both sources (direct generators and mapper-wrapped generators) into the same `ExitCodeGenerator` interface:

```java
private final List<ExitCodeGenerator> generators = new ArrayList<>();

void add(ExitCodeGenerator generator) {
    this.generators.add(generator);
    AnnotationAwareOrderComparator.sort(this.generators);  // resort after every add
}
```

The combination rule in `getExitCode()` (`line 92`) is **first non-zero wins, short-circuit**:

```java
for (ExitCodeGenerator generator : this.generators) {
    int value = generator.getExitCode();
    if (value != 0) {
        exitCode = value;
        break;            // stops here; later generators are ignored
    }
    // if a generator throws, exitCode becomes 1 and the loop exits via catch
}
```

So generators are ordered by Spring's `@Order` / `Ordered` / `PriorityOrdered` and the lowest ordinal value that returns non-zero is the answer. There is no "sum" or "merge" — priority order decides.

---

### How the chosen code is published / returned

**Startup failure path (`handleExitCode`, line 881):**

```java
if (exitCode != 0) {
    context.publishEvent(new ExitCodeEvent(context, exitCode));   // (1) event
    SpringBootExceptionHandler handler = getSpringBootExceptionHandler();
    if (handler != null) {
        handler.registerExitCode(exitCode);                       // (2) UEH stash
    }
}
```

1. **`ExitCodeEvent`** is fired on the context. This is informational — any `ApplicationListener<ExitCodeEvent>` can react (logging, metrics, custom cleanup). It does not cause a JVM exit.

2. **`SpringBootExceptionHandler`** is a thread-local `UncaughtExceptionHandler` installed on the main thread. It only receives the code when `getSpringBootExceptionHandler()` is called from the main thread (`isMainThread` check at line 929). `registerExitCode` simply stores the int. When the main thread's uncaught exception handler fires (`uncaughtException`, line 66), it calls:

    ```java
    if (this.exitCode != 0) {
        System.exit(this.exitCode);  // <-- actual JVM exit
    }
    ```

    This is the mechanism by which a startup crash drives the OS process exit code when running from the main thread. If the failure happens on a non-main thread, `handler` is null and no `System.exit` fires through this path.

**Programmatic shutdown path (`exit()`, line 1396):**

```java
if (exitCode != 0) {
    context.publishEvent(new ExitCodeEvent(context, exitCode));  // event
}
// finally: close(context)
return exitCode;
```

`exit()` closes the context and **returns the int to the caller**. The caller is expected to pass it to `System.exit()` themselves:

```java
System.exit(SpringApplication.exit(ctx));
```

There is no implicit `System.exit` here. If the context close throws, the catch block preserves a previously non-zero code: `exitCode = (exitCode != 0) ? exitCode : 1`.

---

### Summary of all contributing sources, in precedence order

| When | Source | How contributed | Priority |
|---|---|---|---|
| Startup failure | `ExitCodeExceptionMapper` **beans** | Wrapped in `MappedExitCodeGenerator`, sorted by `@Order` | First — tried before self-reporting exception |
| Startup failure | Exception that **implements `ExitCodeGenerator`** | Walks cause chain, first match wins | Second — only if mapper path returns 0 |
| Programmatic shutdown | Caller-supplied `ExitCodeGenerator[]` | Added to list before beans | Sorted together by `@Order`; caller-supplied generators have the same opportunity to win as beans |
| Programmatic shutdown | `ExitCodeGenerator` **beans** | Fetched from context and added after caller-supplied | Sorted by `@Order` in the same list |

Within either path, once `ExitCodeGenerators.getExitCode()` finds the first non-zero value in sort order, it stops — no later generator can override or modify it.

