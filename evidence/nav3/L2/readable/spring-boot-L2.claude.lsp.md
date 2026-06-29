# spring-boot · L2 · lsp — readable transcript

> lsp — semantic (native Claude Code LSP tool), over **spring-boot** (java) @ `e16c5d014`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `lsp` — semantic (native Claude Code LSP tool) |
| repo · rung | spring-boot (java) · L2 |
| pinned source | `e16c5d01417f5a6efc35714e83060aadc17a9321` |
| status | completed |
| engagement | `lsp_tools = 4` (gate: > 0 → ✓ used its capability) |
| turns | 19 |
| wall clock | 92 s |
| context (peak) | 270,658 tokens |
| cost (billed) | $0.3133 |
| &nbsp;&nbsp;↳ token split | in 1,904 · out 4,996 · cache-create 26,541 · cache-read 242,213 |
| tool calls | 18 (Read×9, LSP×4, Bash×4, ToolSearch×1) |
| evidence | `evidence/nav3/L2/raw/spring-boot-L2.claude.lsp.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to change how the process exit code is chosen when a Spring Boot application ends, whether it finishes by failing during startup or by an explicit programmatic shutdown, and I need to cover every place a code can come from. Walk me through the routine(s) that assemble the final exit code, the different sources that can contribute one (a thrown exception that itself carries a code, a mapped exception, a bean or a supplied generator), how the contributing generators are ordered and combined, and how the chosen code is then published or returned to the caller.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll trace this through the LSP tool, starting with the key types involved in exit code assembly.

&nbsp;&nbsp;▸ `ToolSearch(select:LSP)`

💬 Now let me search for the key types involved in exit code assembly simultaneously.

&nbsp;&nbsp;▸ `LSP(ExitCodeGenerator)`
&nbsp;&nbsp;▸ `LSP(ExitCodeExceptionMapper)`
&nbsp;&nbsp;▸ `LSP(SpringApplicationShutdownHook)`

💬 Let me find the right file first, then use LSP.

&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src -name "ExitCodeGenerator.java" -o -name "ExitCodeExceptionMapper.java" -o -name "ExitCodeGenerators.java" -o -name "SpringApplicationShutdownHook.java" | sort)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/spring-boot -name "ExitCodeGenerator.java" -o -name "ExitCodeExceptionMapper.java" -o -name "ExitCodeGenerators.java" -o -name "SpringApplicationShutdownHook.java" 2>/dev/null | sort)`

💬 Good, the layout differs from CLAUDE.md. Let me read all four files in parallel.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerator.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeExceptionMapper.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationShutdownHook.java)`

💬 Now let me look at `SpringApplication.exit()` and the startup failure handler.

&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/spring-boot -name "SpringApplication.java" -path "*/main/*" | grep -v test | head -5)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/spring-boot -name "SpringBootExceptionHandler.java" -o -name "ExitCodeEvent.java" -o -name "ExitCodeListener.java" 2>/dev/null | sort)`
&nbsp;&nbsp;▸ `LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java","line":1,"character":1})`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeEvent.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java)`

💬 Now let me read the key sections of `SpringApplication.java` — the `run()` method, `handleRunFailure`, all the exit-code methods, and `exit()`.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`

💬 I have everything I need. Here's the full picture.

---

## Exit code assembly in Spring Boot

There are two independent entry points, each with a distinct collection strategy and delivery mechanism.

---

### Entry point 1: startup failure

`run()` wraps its entire body in a catch-all (`SpringApplication.java:330`):

```
run() catch(Throwable ex)
  → handleRunFailure(context, ex, listeners)        line 803
      → handleExitCode(context, exception)           line 881
      → listeners.failed(...)                        (notify run-listeners)
      → reportFailure(...)                           (log / suppress duplicate stack trace)
      → context.close() + deregisterFailedApplicationContext()
```

`handleExitCode()` (line 881) drives code resolution:

```java
int exitCode = getExitCodeFromException(context, exception);
if (exitCode != 0) {
    context.publishEvent(new ExitCodeEvent(context, exitCode));   // broadcast to context
    SpringBootExceptionHandler handler = getSpringBootExceptionHandler();
    if (handler != null) handler.registerExitCode(exitCode);      // store for System.exit
}
```

`getExitCodeFromException()` (line 894) is a two-stage cascade. The first non-zero result wins:

**Stage 1 — mapper beans** (`getExitCodeFromMappedException()`, line 902)
- Skipped entirely if `context == null || !context.isActive()` (context never started or already closed before failure)
- Otherwise: all `ExitCodeExceptionMapper` beans are collected from the context, each wrapped in a `MappedExitCodeGenerator` adaptor, and added to an `ExitCodeGenerators` collection
- `ExitCodeGenerators.getExitCode()` iterates the sorted list and returns the **first non-zero code** (short-circuit)

**Stage 2 — exception-is-generator** (`getExitCodeFromExitCodeGeneratorException()`, line 912)
- Reached only if stage 1 returned 0
- Walks the `exception → getCause() → getCause()` chain recursively
- If any `Throwable` in the chain also implements `ExitCodeGenerator`, calls `getExitCode()` on it
- This is the mechanism that lets custom exception types self-report their code

---

### Entry point 2: programmatic shutdown

`SpringApplication.exit(context, generators...)` (line 1396) is the static helper callers invoke as `System.exit(SpringApplication.exit(ctx))`:

```java
ExitCodeGenerators generators = new ExitCodeGenerators();
Collection<ExitCodeGenerator> beans = context.getBeansOfType(ExitCodeGenerator.class).values();
generators.addAll(exitCodeGenerators);   // caller-supplied generators added first
generators.addAll(beans);               // then context beans
exitCode = generators.getExitCode();
if (exitCode != 0) context.publishEvent(new ExitCodeEvent(context, exitCode));
// finally: close(context)
return exitCode;                         // caller must pass this to System.exit()
```

There is no mapper chain here — only raw `ExitCodeGenerator` contributors. `ExitCodeExceptionMapper` plays no role in this path.

---

### How generators are ordered and combined

`ExitCodeGenerators` (`ExitCodeGenerators.java`) maintains a `List<ExitCodeGenerator>`. Every call to `add()` (line 77–80) immediately re-sorts the entire list with `AnnotationAwareOrderComparator`, which respects `@Order` annotations and the `Ordered` interface.

`getExitCode()` (line 92–108) is a short-circuit scan:

```java
int exitCode = 0;
for (ExitCodeGenerator generator : this.generators) {
    try {
        int value = generator.getExitCode();
        if (value != 0) { exitCode = value; break; }   // first non-zero wins
    }
    catch (Exception ex) { exitCode = 1; ex.printStackTrace(); }   // generator itself threw
}
return exitCode;
```

**First non-zero wins; a generator that throws is treated as code 1.** If every generator returns 0, the final code is 0.

---

### How the chosen code is published or returned

| Path | Publication | Delivery to OS |
|---|---|---|
| Startup failure | `context.publishEvent(new ExitCodeEvent(ctx, code))` if context active | `SpringBootExceptionHandler.uncaughtException()` calls `System.exit(this.exitCode)` — automatic, main-thread only |
| Programmatic exit | Same `ExitCodeEvent` if code ≠ 0 | `exit()` **returns** the int; caller must call `System.exit()` |

`SpringBootExceptionHandler` (`SpringBootExceptionHandler.java`) is the glue for the startup path. It installs itself as the `UncaughtExceptionHandler` for the main thread via a `ThreadLocal` (initialized on first access, line 131–136). When the startup exception propagates out of `main()` uncaught, the JVM invokes `uncaughtException()`, which calls `System.exit(this.exitCode)` if the code is non-zero (line 74–76). This only fires on a thread named `"main"` or `"restartedMain"` in the `"main"` thread group (line 929–931) — the handler is silently skipped for other threads.

---

### Summary of all code sources

| Source | Path | Condition |
|---|---|---|
| `ExitCodeExceptionMapper` bean(s) | Startup failure only | Context must be non-null and active at failure time |
| Exception (or its cause chain) implements `ExitCodeGenerator` | Startup failure only | Only consulted if mapper stage returned 0 |
| `ExitCodeGenerator` beans in context | Programmatic exit only | Always consulted |
| `ExitCodeGenerator` instances passed directly to `exit()` | Programmatic exit only | Added before beans, so lower `@Order` values win if tied |


## Final answer

_Result event — success, 92 s, 19 turns._

I have everything I need. Here's the full picture.

---

## Exit code assembly in Spring Boot

There are two independent entry points, each with a distinct collection strategy and delivery mechanism.

---

### Entry point 1: startup failure

`run()` wraps its entire body in a catch-all (`SpringApplication.java:330`):

```
run() catch(Throwable ex)
  → handleRunFailure(context, ex, listeners)        line 803
      → handleExitCode(context, exception)           line 881
      → listeners.failed(...)                        (notify run-listeners)
      → reportFailure(...)                           (log / suppress duplicate stack trace)
      → context.close() + deregisterFailedApplicationContext()
```

`handleExitCode()` (line 881) drives code resolution:

```java
int exitCode = getExitCodeFromException(context, exception);
if (exitCode != 0) {
    context.publishEvent(new ExitCodeEvent(context, exitCode));   // broadcast to context
    SpringBootExceptionHandler handler = getSpringBootExceptionHandler();
    if (handler != null) handler.registerExitCode(exitCode);      // store for System.exit
}
```

`getExitCodeFromException()` (line 894) is a two-stage cascade. The first non-zero result wins:

**Stage 1 — mapper beans** (`getExitCodeFromMappedException()`, line 902)
- Skipped entirely if `context == null || !context.isActive()` (context never started or already closed before failure)
- Otherwise: all `ExitCodeExceptionMapper` beans are collected from the context, each wrapped in a `MappedExitCodeGenerator` adaptor, and added to an `ExitCodeGenerators` collection
- `ExitCodeGenerators.getExitCode()` iterates the sorted list and returns the **first non-zero code** (short-circuit)

**Stage 2 — exception-is-generator** (`getExitCodeFromExitCodeGeneratorException()`, line 912)
- Reached only if stage 1 returned 0
- Walks the `exception → getCause() → getCause()` chain recursively
- If any `Throwable` in the chain also implements `ExitCodeGenerator`, calls `getExitCode()` on it
- This is the mechanism that lets custom exception types self-report their code

---

### Entry point 2: programmatic shutdown

`SpringApplication.exit(context, generators...)` (line 1396) is the static helper callers invoke as `System.exit(SpringApplication.exit(ctx))`:

```java
ExitCodeGenerators generators = new ExitCodeGenerators();
Collection<ExitCodeGenerator> beans = context.getBeansOfType(ExitCodeGenerator.class).values();
generators.addAll(exitCodeGenerators);   // caller-supplied generators added first
generators.addAll(beans);               // then context beans
exitCode = generators.getExitCode();
if (exitCode != 0) context.publishEvent(new ExitCodeEvent(context, exitCode));
// finally: close(context)
return exitCode;                         // caller must pass this to System.exit()
```

There is no mapper chain here — only raw `ExitCodeGenerator` contributors. `ExitCodeExceptionMapper` plays no role in this path.

---

### How generators are ordered and combined

`ExitCodeGenerators` (`ExitCodeGenerators.java`) maintains a `List<ExitCodeGenerator>`. Every call to `add()` (line 77–80) immediately re-sorts the entire list with `AnnotationAwareOrderComparator`, which respects `@Order` annotations and the `Ordered` interface.

`getExitCode()` (line 92–108) is a short-circuit scan:

```java
int exitCode = 0;
for (ExitCodeGenerator generator : this.generators) {
    try {
        int value = generator.getExitCode();
        if (value != 0) { exitCode = value; break; }   // first non-zero wins
    }
    catch (Exception ex) { exitCode = 1; ex.printStackTrace(); }   // generator itself threw
}
return exitCode;
```

**First non-zero wins; a generator that throws is treated as code 1.** If every generator returns 0, the final code is 0.

---

### How the chosen code is published or returned

| Path | Publication | Delivery to OS |
|---|---|---|
| Startup failure | `context.publishEvent(new ExitCodeEvent(ctx, code))` if context active | `SpringBootExceptionHandler.uncaughtException()` calls `System.exit(this.exitCode)` — automatic, main-thread only |
| Programmatic exit | Same `ExitCodeEvent` if code ≠ 0 | `exit()` **returns** the int; caller must call `System.exit()` |

`SpringBootExceptionHandler` (`SpringBootExceptionHandler.java`) is the glue for the startup path. It installs itself as the `UncaughtExceptionHandler` for the main thread via a `ThreadLocal` (initialized on first access, line 131–136). When the startup exception propagates out of `main()` uncaught, the JVM invokes `uncaughtException()`, which calls `System.exit(this.exitCode)` if the code is non-zero (line 74–76). This only fires on a thread named `"main"` or `"restartedMain"` in the `"main"` thread group (line 929–931) — the handler is silently skipped for other threads.

---

### Summary of all code sources

| Source | Path | Condition |
|---|---|---|
| `ExitCodeExceptionMapper` bean(s) | Startup failure only | Context must be non-null and active at failure time |
| Exception (or its cause chain) implements `ExitCodeGenerator` | Startup failure only | Only consulted if mapper stage returned 0 |
| `ExitCodeGenerator` beans in context | Programmatic exit only | Always consulted |
| `ExitCodeGenerator` instances passed directly to `exit()` | Programmatic exit only | Added before beans, so lower `@Order` values win if tied |

