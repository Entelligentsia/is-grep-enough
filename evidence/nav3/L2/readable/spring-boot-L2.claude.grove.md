# transcript: I want to change how the process exit code is chosen when a Spring Boot application ends, whether it finishes by failing during startup or by an explicit pro...


💬 I'll load the grove tools and then trace the exit code machinery from first principles.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__outline,mcp__grove__callers,mcp__grove__definition,mcp__grove__map)

💬 Now let me locate the exit code machinery. I'll search for the key classes simultaneously.
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot/src/main/java/org/springframework/boot","name":"SpringApplication","kind":"class"})
  ▸ mcp__grove__symbols({"dir":"spring-boot-project/spring-boot/src/main/java/org/springframework/boot","nameContains":true,"name":"ExitCode","kind":"class"})
  ▸ Bash(find spring-boot-project/spring-boot/src/main/java/org/springframework/boot -name "*ExitCode*" -o -name "*exit*" | sort)
  ▸ Bash(find /home/bench/repos/spring-boot -name "*ExitCode*" | sort)
  ▸ Bash(ls /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ | grep -i "exit\|Spring" | sort)
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java"})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","kind":"method"})
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationShutdownHook.java"})

💬 Now I'll read all the key method bodies in parallel.
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#run@304"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#handleRunFailure@803"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#getExitCode@92"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#addAll@44"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#handleExitCode@881"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getExitCodeFromException@894"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getExitCodeFromMappedException@902"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getExitCodeFromExitCodeGeneratorException@912"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#exit@1396"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#add@58"})

💬 Now let me get the remaining pieces: the interfaces, the `MappedExitCodeGenerator`, and `SpringBootExceptionHandler`.
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#MappedExitCodeGenerator@113"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#addAll@50"})
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerator.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeExceptionMapper.java)
  ▸ mcp__grove__outline({"file":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java#registerExitCode@61"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java#uncaughtException@66"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java#forCurrentThread@121"})
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java#getSpringBootExceptionHandler@922"})

💬 I have a complete picture. Let me read the one remaining piece — the `add(ExitCodeGenerator)` method and its list field.
  ▸ mcp__grove__source({"id":"java:core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java#add@76"})
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)
  ▸ Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeEvent.java)

💬 I now have everything needed for a complete explanation.  ---  ## Exit Code Assembly in Spring Boot  There are two distinct entry points that each assemble t...

──────── RESULT (success, 106331ms, 32 turns) ────────
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
