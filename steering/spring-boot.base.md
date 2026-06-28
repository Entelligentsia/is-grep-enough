# Spring Boot — contributor guide for coding agents

Spring Boot is a large, multi-module Java project (built with Gradle) that makes it easy to create stand-alone, production-grade Spring applications. It targets Java 17+.

## Layout

Almost all source lives under `spring-boot-project/`:

- `spring-boot/` — the core: `SpringApplication`, embedded server abstractions, `Environment`/property binding, the `ApplicationContext` bootstrap.
- `spring-boot-autoconfigure/` — the bulk of the auto-configuration classes (data sources, web, security, messaging, etc.), wired via `@AutoConfiguration` and registered in `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`.
- `spring-boot-actuator/` and `spring-boot-actuator-autoconfigure/` — production endpoints (`/actuator/health`, `/metrics`, `/info`, …) and their auto-configuration.
- `spring-boot-starters/` — the `spring-boot-starter-*` aggregator POMs (no code; curated transitive dependencies).
- `spring-boot-test/` and `spring-boot-test-autoconfigure/` — `@SpringBootTest`, slice annotations (`@WebMvcTest`, `@DataJpaTest`, …), test utilities.
- `spring-boot-tools/` — build tooling: the Maven/Gradle plugins, the loader/JarLauncher, the CLI, and configuration-metadata processing.
- `spring-boot-docs/` — reference documentation (Asciidoctor).

Other top-level dirs: `buildSrc/` (Gradle convention plugins, conventions enforcement), `ci/`, `src/` (checkstyle/test config).

## Key concepts

- `@SpringBootApplication` = `@SpringBootConfiguration` + `@EnableAutoConfiguration` + `@ComponentScan`.
- Auto-configuration classes are conditional (`@ConditionalOnClass`, `@ConditionalOnMissingBean`, `@ConditionalOnProperty`, …) and discovered from the `AutoConfiguration.imports` file (the older `spring.factories` mechanism is legacy).
- `SpringApplication.run(...)` drives bootstrap; starters pull in coherent dependency sets; the embedded server (Tomcat/Jetty/Undertow/Netty) is selected by what is on the classpath.

## Build & test

Use the Gradle wrapper (do not require a local Gradle install):

- Full build: `./gradlew build`
- Checks (tests + checkstyle + formatting): `./gradlew check`
- One module's tests: `./gradlew :spring-boot-project:spring-boot:test`
- A single test: add `--tests "org.springframework.boot.SomeTests"`.

Builds are heavy; prefer scoping to the affected module. The build enforces formatting and license headers, so a green `check` is required before a PR.

## Conventions

- Follow the Spring Framework code style (enforced via the spring-javaformat plugin and Checkstyle in `src/checkstyle/`). Run `./gradlew format` to auto-apply.
- Public API requires complete Javadoc, including `@since` tags for new types/members.
- Every source file carries the Apache 2.0 license header.
- Commits and PRs follow `CONTRIBUTING.adoc`: sign the contributor agreement, reference the issue, keep changes focused, and add tests.
- New conditions/properties should ship configuration metadata (`additional-spring-configuration-metadata.json` where applicable).

## When navigating

This is a very large codebase and behavior is dominated by auto-configuration indirection: what runs depends on conditional annotations, classpath contents, and entries in `AutoConfiguration.imports` rather than on direct call chains. Reading whole files end-to-end is rarely productive. Prefer pinpoint structural lookups — jump to a specific class, annotation, bean method, or condition; find where a property key or auto-configuration is registered; and trace conditionals — instead of scanning entire modules.
