# spring-boot · L2 · baseline — readable transcript

> baseline — text search (bash + coreutils), over **spring-boot** (java) @ `e16c5d014`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `baseline` — text search (bash + coreutils) |
| repo · rung | spring-boot (java) · L2 |
| pinned source | `e16c5d01417f5a6efc35714e83060aadc17a9321` |
| status | completed |
| engagement | `bash_calls = 19` (gate: > 0 → ✓ used its capability) |
| turns | 11 |
| wall clock | 220 s |
| context (peak) | 165,895 tokens |
| cost (billed) | $0.3314 |
| &nbsp;&nbsp;↳ token split | in 8 · out 3,961 · cache-create 16,669 · cache-read 149,218 |
| tool calls | 43 (Read×23, Bash×19, Agent×1) |
| evidence | `evidence/nav3/L2/raw/spring-boot-L2.claude.baseline.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to change how the process exit code is chosen when a Spring Boot application ends, whether it finishes by failing during startup or by an explicit programmatic shutdown, and I need to cover every place a code can come from. Walk me through the routine(s) that assemble the final exit code, the different sources that can contribute one (a thrown exception that itself carries a code, a mapped exception, a bean or a supplied generator), how the contributing generators are ordered and combined, and how the chosen code is then published or returned to the caller.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 Let me explore the exit code assembly path across the relevant classes before explaining it.

▸ `Agent(Explore Spring Boot exit code assembly)`  ⟶ subagent:
    ↳ `Bash(find /home/bench/repos/spring-boot -type f -name "*.java" | grep -i "exit\|shutdown" | head -20)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerator.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeExceptionMapper.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeEvent.java)`
    ↳ `Bash(find /home/bench/repos/spring-boot -type f -name "SpringApplication.java" | grep -v test)`
    ↳ `Bash(grep -n "public static int exit\|public int exit" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicationShutdownHook.java)`
    ↳ `Bash(find /home/bench/repos/spring-boot -type f -name "*ExceptionHandler*.java" | grep -i springboot)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java)`
    ↳ `Bash(grep -r "ExitCodeGeneratingException\|interface.*ExitCode" /home/bench/repos/spring-boot/core/spring-boot/src/main/java --include="*.java" | head -20)`
    ↳ `Bash(grep -r "implements.*ExitCodeGenerator\|implements ExitCode" /home/bench/repos/spring-boot/core/spring-boot --include="*.java" | head -10)`
    ↳ `Bash(grep -n "public ConfigurableApplicationContext run\|SpringBootExceptionHandler\|registerLoggedException\|registerExitCode" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java | head -20)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Bash(grep -n "private.*handleRunFailure\|protected.*handleRunFailure" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Read(/home/bench/repos/spring-boot/module/spring-boot-batch/src/main/java/org/springframework/boot/batch/autoconfigure/JobExecutionExitCodeGenerator.java)`
    ↳ `Bash(grep -n "getExitCodeFromExceptionGeneratorException\|ExitCodeGenerators\|registerExitCode" /home/bench/repos/spring-boot/core/spring-boot/src/test/java/org/springframework/boot/SpringApplicationTests.java | head -20)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/test/java/org/springframework/boot/SpringApplicationTests.java)`
    ↳ `Bash(grep -n "class ExitCodeCommandLineRunConfig\|class MappedExitCodeCommandLineRunConfig\|class ExitStatusException" /home/bench/repos/spring-boot/core/spring-boot/src/test/java/org/springframework/boot/SpringApplicationTests.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/test/java/org/springframework/boot/SpringApplicationTests.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/test/java/org/springframework/boot/SpringApplicationTests.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/test/java/org/springframework/boot/ExitCodeGeneratorsTests.java)`
    ↳ `Bash(grep -n "public int exit" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Bash(grep -n "public.*exit\|getExitCode" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ `Bash(grep -r "System.exit" /home/bench/repos/spring-boot/core/spring-boot/src/main/java --include="*.java")`
    ↳ `Bash(grep -n "class SpringApplication\|public SpringApplication" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java | head -5)`
    ↳ `Bash(grep -n "exitCode\|exit" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java)`
    ↳ `Bash(grep -B5 -A5 "first non-zero" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
    ↳ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
    ↳ ⟹ returned to parent


💬 Good overview from the agent. Let me read the key files directly to verify the details and fill in specifics.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
&nbsp;&nbsp;▸ `Bash(grep -n "handleExitCode\|getExitCodeFrom\|handleRunFailure\|registerExitCode\|ExitCodeEvent\|SpringApplication.exit\|getBeansOfType(ExitCodeGenerator" /home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java | head -60)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java)`
&nbsp;&nbsp;▸ `Bash(find /home/bench/repos/spring-boot -name "ExitCodeGenerators.java" -o -name "SpringApplication.java" -o -name "SpringBootExceptionHandler.java" | grep -v build | grep -v test | head -20)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/ExitCodeGenerators.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringBootExceptionHandler.java)`
&nbsp;&nbsp;▸ `Bash(grep -n "handleExitCode\|getExitCodeFrom\|handleRunFailure\|registerExitCode\|ExitCodeEvent\|static.*exit\|getBeansOfType(ExitCodeGenerator\|ExitCodeExceptionMapper\|instanceof ExitCodeGenerator" /home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplicati…)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/spring-boot/core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java)`

💬 Now I have the complete picture. Here is a precise walkthrough.

---

## The two entry points

There are two separate routines that assemble an exit code, depending on *why* the application is ending.

### 1. `SpringApplication.exit()` — programmatic shutdown

`SpringApplication.java:1396`

Called by user code: `System.exit(SpringApplication.exit(ctx, ...))`. It does not call `System.exit` itself — it assembles and **returns** an `int` to whatever called it.

```
SpringApplication.exit(context, exitCodeGenerators...)
  ├─ new ExitCodeGenerators()
  ├─ generators.addAll(exitCodeGenerators)         // caller-supplied first
  ├─ generators.addAll(context.getBeansOfType(ExitCodeGenerator.class))  // then beans
  ├─ exitCode = generators.getExitCode()           // first non-zero wins
  ├─ if exitCode != 0 → context.publishEvent(new ExitCodeEvent(context, exitCode))
  └─ finally: close(context)
     catch Exception → exitCode = (exitCode != 0) ? exitCode : 1
```

The caller is responsible for passing the returned `int` to `System.exit`.

---

### 2. `handleRunFailure` → `handleExitCode` — startup failure

`SpringApplication.java:803` and `881`

Triggered when an exception escapes from `run()`. The goal here is to get the code into the JVM's exit mechanism without the caller having to do anything.

```
handleRunFailure(context, exception, listeners)
  └─ handleExitCode(context, exception)
       └─ getExitCodeFromException(context, exception)
            ├─ getExitCodeFromMappedException(context, exception)    // tried first
            └─ (if 0) getExitCodeFromExitCodeGeneratorException(exception)  // fallback
       if exitCode != 0:
         context.publishEvent(new ExitCodeEvent(context, exitCode))
         SpringBootExceptionHandler.forCurrentThread().registerExitCode(exitCode)
```

---

## Sources of exit codes, in priority order

### Source A — caller-supplied generators (exit path only)

In `SpringApplication.exit()`, any `ExitCodeGenerator` varargs passed by the caller are added **first**. They beat context beans because they are inserted before beans into the shared `ExitCodeGenerators` list, and the list returns the first non-zero value.

### Source B — `ExitCodeGenerator` beans

Context beans of type `ExitCodeGenerator` are fetched via `getBeansOfType`. They are added to the same `ExitCodeGenerators` list (after caller-supplied generators in the exit path; as the only source in the happy-exit path). Each bean is sorted using `AnnotationAwareOrderComparator` — so `@Order(1)` beats `@Order(2)`, and `Ordered` is respected.

`ExitCodeGenerators.java:76-79`:
```java
void add(ExitCodeGenerator generator) {
    this.generators.add(generator);
    AnnotationAwareOrderComparator.sort(this.generators);  // re-sorts on every add
}
```

### Source C — `ExitCodeExceptionMapper` beans (startup failure only)

`SpringApplication.java:902-909`

If the application context exists and is still active at the time of failure, Spring fetches all `ExitCodeExceptionMapper` beans and wraps each one in a `MappedExitCodeGenerator` adapter, which calls `mapper.getExitCode(exception)`. These are again sorted by `@Order` through the same `ExitCodeGenerators` machinery. If any mapper returns non-zero for this exception, that code wins and the next source is not consulted.

```java
private int getExitCodeFromMappedException(context, exception) {
    ExitCodeGenerators generators = new ExitCodeGenerators();
    Collection<ExitCodeExceptionMapper> beans = context.getBeansOfType(ExitCodeExceptionMapper.class).values();
    generators.addAll(exception, beans);         // wraps each into MappedExitCodeGenerator
    return generators.getExitCode();
}
```

### Source D — exception implementing `ExitCodeGenerator` (startup failure fallback)

`SpringApplication.java:912-919`

Only reached if source C returned 0. Spring checks whether the exception itself implements `ExitCodeGenerator`. If it does, it calls `exception.getExitCode()` directly. If not, it recurses into `exception.getCause()` — walking the entire cause chain until it either finds a `Throwable` that is also an `ExitCodeGenerator` or exhausts the chain.

```java
private int getExitCodeFromExitCodeGeneratorException(Throwable exception) {
    if (exception instanceof ExitCodeGenerator generator) {
        return generator.getExitCode();
    }
    return getExitCodeFromExitCodeGeneratorException(exception.getCause());
}
```

Note: there is no ordering here — it is the first exception in the cause chain that implements `ExitCodeGenerator` that contributes the code.

---

## Aggregation rule inside `ExitCodeGenerators`

`ExitCodeGenerators.java:92-108` — this is the only combination rule, used by all three generator sources above:

```java
int getExitCode() {
    int exitCode = 0;
    for (ExitCodeGenerator generator : this.generators) {   // ordered by @Order
        try {
            int value = generator.getExitCode();
            if (value != 0) {
                exitCode = value;
                break;                                       // first non-zero wins, stop
            }
        }
        catch (Exception ex) {
            exitCode = 1;                                    // generator threw → hardcode 1
            ex.printStackTrace();
        }
    }
    return exitCode;
}
```

**First non-zero wins and short-circuits**. Generators are not summed or merged — there is no bitwise OR or max. If a generator throws, the loop stops and returns `1`.

---

## How the code reaches the OS

### Programmatic exit (`SpringApplication.exit`)

The code is returned as an `int` to the caller. The idiom `System.exit(SpringApplication.exit(ctx))` puts the caller in charge of actually terminating the JVM.

### Startup failure (`handleRunFailure`)

`SpringBootExceptionHandler` is a per-thread `UncaughtExceptionHandler` installed on the main thread via a `ThreadLocal` (`LoggedExceptionHandlerThreadLocal`) the first time `forCurrentThread()` is called.

After `registerExitCode(exitCode)` stores the code in the handler, the exception is re-thrown up through `handleRunFailure` and eventually escapes `run()` uncaught. The JVM then calls `SpringBootExceptionHandler.uncaughtException`, which in its `finally` block does:

`SpringBootExceptionHandler.java:72-76`:
```java
finally {
    this.loggedExceptions.clear();
    if (this.exitCode != 0) {
        System.exit(this.exitCode);     // only fired here, only if non-zero
    }
}
```

`System.exit` is only called if a non-zero code was registered. If startup fails but no source produced a non-zero code, the JVM terminates through the normal uncaught-exception path (typically printing the stack trace and exiting with a JVM-chosen code).

### Event publication

Both paths publish `ExitCodeEvent` on the application context (when context is available and the code is non-zero) before either returning or registering with the exception handler. This lets any listener within the application react to the chosen code before shutdown completes — e.g., an actuator endpoint or a metrics recorder could observe it.

---

## Summary map

```
Startup failure                          Programmatic exit
───────────────────────────────          ─────────────────────────────────
handleRunFailure                         SpringApplication.exit(ctx, gens...)
 └─ handleExitCode
      └─ getExitCodeFromException
           ├─ [C] ExitCodeExceptionMapper beans  (if ctx active)
           └─ [D] exception.getExitCode()        (cause-chain walk)
                                         ├─ [A] caller ExitCodeGenerator varargs
                                         └─ [B] ExitCodeGenerator beans

All sources feed into ExitCodeGenerators.getExitCode()
  → first non-zero wins (ordered by @Order / Ordered)
  → generator throws → 1

Non-zero code:
  → context.publishEvent(ExitCodeEvent)
  → [startup] handler.registerExitCode() → uncaughtException → System.exit()
  → [programmatic] returned to caller; caller passes to System.exit()
```


## Final answer

_Result event — success, 220 s, 11 turns._

Now I have the complete picture. Here is a precise walkthrough.

---

## The two entry points

There are two separate routines that assemble an exit code, depending on *why* the application is ending.

### 1. `SpringApplication.exit()` — programmatic shutdown

`SpringApplication.java:1396`

Called by user code: `System.exit(SpringApplication.exit(ctx, ...))`. It does not call `System.exit` itself — it assembles and **returns** an `int` to whatever called it.

```
SpringApplication.exit(context, exitCodeGenerators...)
  ├─ new ExitCodeGenerators()
  ├─ generators.addAll(exitCodeGenerators)         // caller-supplied first
  ├─ generators.addAll(context.getBeansOfType(ExitCodeGenerator.class))  // then beans
  ├─ exitCode = generators.getExitCode()           // first non-zero wins
  ├─ if exitCode != 0 → context.publishEvent(new ExitCodeEvent(context, exitCode))
  └─ finally: close(context)
     catch Exception → exitCode = (exitCode != 0) ? exitCode : 1
```

The caller is responsible for passing the returned `int` to `System.exit`.

---

### 2. `handleRunFailure` → `handleExitCode` — startup failure

`SpringApplication.java:803` and `881`

Triggered when an exception escapes from `run()`. The goal here is to get the code into the JVM's exit mechanism without the caller having to do anything.

```
handleRunFailure(context, exception, listeners)
  └─ handleExitCode(context, exception)
       └─ getExitCodeFromException(context, exception)
            ├─ getExitCodeFromMappedException(context, exception)    // tried first
            └─ (if 0) getExitCodeFromExitCodeGeneratorException(exception)  // fallback
       if exitCode != 0:
         context.publishEvent(new ExitCodeEvent(context, exitCode))
         SpringBootExceptionHandler.forCurrentThread().registerExitCode(exitCode)
```

---

## Sources of exit codes, in priority order

### Source A — caller-supplied generators (exit path only)

In `SpringApplication.exit()`, any `ExitCodeGenerator` varargs passed by the caller are added **first**. They beat context beans because they are inserted before beans into the shared `ExitCodeGenerators` list, and the list returns the first non-zero value.

### Source B — `ExitCodeGenerator` beans

Context beans of type `ExitCodeGenerator` are fetched via `getBeansOfType`. They are added to the same `ExitCodeGenerators` list (after caller-supplied generators in the exit path; as the only source in the happy-exit path). Each bean is sorted using `AnnotationAwareOrderComparator` — so `@Order(1)` beats `@Order(2)`, and `Ordered` is respected.

`ExitCodeGenerators.java:76-79`:
```java
void add(ExitCodeGenerator generator) {
    this.generators.add(generator);
    AnnotationAwareOrderComparator.sort(this.generators);  // re-sorts on every add
}
```

### Source C — `ExitCodeExceptionMapper` beans (startup failure only)

`SpringApplication.java:902-909`

If the application context exists and is still active at the time of failure, Spring fetches all `ExitCodeExceptionMapper` beans and wraps each one in a `MappedExitCodeGenerator` adapter, which calls `mapper.getExitCode(exception)`. These are again sorted by `@Order` through the same `ExitCodeGenerators` machinery. If any mapper returns non-zero for this exception, that code wins and the next source is not consulted.

```java
private int getExitCodeFromMappedException(context, exception) {
    ExitCodeGenerators generators = new ExitCodeGenerators();
    Collection<ExitCodeExceptionMapper> beans = context.getBeansOfType(ExitCodeExceptionMapper.class).values();
    generators.addAll(exception, beans);         // wraps each into MappedExitCodeGenerator
    return generators.getExitCode();
}
```

### Source D — exception implementing `ExitCodeGenerator` (startup failure fallback)

`SpringApplication.java:912-919`

Only reached if source C returned 0. Spring checks whether the exception itself implements `ExitCodeGenerator`. If it does, it calls `exception.getExitCode()` directly. If not, it recurses into `exception.getCause()` — walking the entire cause chain until it either finds a `Throwable` that is also an `ExitCodeGenerator` or exhausts the chain.

```java
private int getExitCodeFromExitCodeGeneratorException(Throwable exception) {
    if (exception instanceof ExitCodeGenerator generator) {
        return generator.getExitCode();
    }
    return getExitCodeFromExitCodeGeneratorException(exception.getCause());
}
```

Note: there is no ordering here — it is the first exception in the cause chain that implements `ExitCodeGenerator` that contributes the code.

---

## Aggregation rule inside `ExitCodeGenerators`

`ExitCodeGenerators.java:92-108` — this is the only combination rule, used by all three generator sources above:

```java
int getExitCode() {
    int exitCode = 0;
    for (ExitCodeGenerator generator : this.generators) {   // ordered by @Order
        try {
            int value = generator.getExitCode();
            if (value != 0) {
                exitCode = value;
                break;                                       // first non-zero wins, stop
            }
        }
        catch (Exception ex) {
            exitCode = 1;                                    // generator threw → hardcode 1
            ex.printStackTrace();
        }
    }
    return exitCode;
}
```

**First non-zero wins and short-circuits**. Generators are not summed or merged — there is no bitwise OR or max. If a generator throws, the loop stops and returns `1`.

---

## How the code reaches the OS

### Programmatic exit (`SpringApplication.exit`)

The code is returned as an `int` to the caller. The idiom `System.exit(SpringApplication.exit(ctx))` puts the caller in charge of actually terminating the JVM.

### Startup failure (`handleRunFailure`)

`SpringBootExceptionHandler` is a per-thread `UncaughtExceptionHandler` installed on the main thread via a `ThreadLocal` (`LoggedExceptionHandlerThreadLocal`) the first time `forCurrentThread()` is called.

After `registerExitCode(exitCode)` stores the code in the handler, the exception is re-thrown up through `handleRunFailure` and eventually escapes `run()` uncaught. The JVM then calls `SpringBootExceptionHandler.uncaughtException`, which in its `finally` block does:

`SpringBootExceptionHandler.java:72-76`:
```java
finally {
    this.loggedExceptions.clear();
    if (this.exitCode != 0) {
        System.exit(this.exitCode);     // only fired here, only if non-zero
    }
}
```

`System.exit` is only called if a non-zero code was registered. If startup fails but no source produced a non-zero code, the JVM terminates through the normal uncaught-exception path (typically printing the stack trace and exiting with a JVM-chosen code).

### Event publication

Both paths publish `ExitCodeEvent` on the application context (when context is available and the code is non-zero) before either returning or registering with the exception handler. This lets any listener within the application react to the chosen code before shutdown completes — e.g., an actuator endpoint or a metrics recorder could observe it.

---

## Summary map

```
Startup failure                          Programmatic exit
───────────────────────────────          ─────────────────────────────────
handleRunFailure                         SpringApplication.exit(ctx, gens...)
 └─ handleExitCode
      └─ getExitCodeFromException
           ├─ [C] ExitCodeExceptionMapper beans  (if ctx active)
           └─ [D] exception.getExitCode()        (cause-chain walk)
                                         ├─ [A] caller ExitCodeGenerator varargs
                                         └─ [B] ExitCodeGenerator beans

All sources feed into ExitCodeGenerators.getExitCode()
  → first non-zero wins (ordered by @Order / Ordered)
  → generator throws → 1

Non-zero code:
  → context.publishEvent(ExitCodeEvent)
  → [startup] handler.registerExitCode() → uncaughtException → System.exit()
  → [programmatic] returned to caller; caller passes to System.exit()
```

