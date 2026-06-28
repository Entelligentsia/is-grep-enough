# Tokio — contributor guide for coding agents

Tokio is an asynchronous runtime for **Rust**, providing the building blocks for writing network applications: a multi-threaded work-stealing scheduler, async I/O, timers, and synchronization primitives. This file is the standing context for working in this repository.

## Layout
The repo is a Cargo workspace with several published crates:
- `tokio/` — the core crate. Everything below lives under `tokio/src/`.
- `tokio-util/` — utilities built on top of tokio (codecs, `Framed`, `CancellationToken`, compat shims).
- `tokio-macros/` — proc-macros backing `#[tokio::main]` and `#[tokio::test]`.
- `tokio-stream/` — `Stream` adapters and wrappers (the `Stream` trait lives here, not in core).
- `tokio-test/` — test helpers (`task::spawn`, `io::Builder`, `assert_ready!`).
- `benches/`, `examples/`, `stress-test/` — benchmarks, runnable examples, and load tests.

## Key modules (inside `tokio/src/`)
- `runtime/` — the heart. `Runtime`, the `Builder` (`new_multi_thread`, `new_current_thread`), and the schedulers under `runtime/scheduler/` (multi-thread work-stealing + current-thread). Driver, blocking pool, and the I/O reactor wiring live here too.
- `task/` — `spawn`, `JoinHandle`, `JoinSet`, `LocalSet`/`spawn_local`, `task::yield_now`, and `spawn_blocking`.
- `net/` — `TcpListener`, `TcpStream`, `UdpSocket`, Unix sockets — non-blocking sockets registered with the reactor.
- `sync/` — `Mutex`, `RwLock`, `mpsc`/`oneshot`/`broadcast`/`watch` channels, `Notify`, `Semaphore`.
- `time/` — `sleep`, `interval`, `timeout`, `Instant`, the timer wheel.
- `io/` — `AsyncRead`/`AsyncWrite` traits, `AsyncReadExt`/`AsyncWriteExt`, `copy`, buffered wrappers.
- `fs/` — async filesystem ops (offloaded to the blocking pool).

## Build & test
- Build: `cargo build`. Most of the crate is behind feature flags; enable everything with `cargo build --all-features` (or the `full` feature for the common set).
- Test: `cargo test --all-features`. Tests are split between `tokio/tests/` integration files and in-module `#[cfg(test)]` units.
- Unstable APIs (e.g. runtime metrics, task IDs) require `RUSTFLAGS="--cfg tokio_unstable"`; tests touching them need it too.
- Concurrency correctness is checked with **loom**: `RUSTFLAGS="--cfg loom" cargo test --lib` under the `loom` cfg. Loom tests live alongside the code they exercise.
- Lints must be clean: `cargo fmt --all` and `cargo clippy --all-features`. MSRV is enforced — check `Cargo.toml` `rust-version` before using newer std APIs.

## Conventions
- Public API changes need a `# Examples` doctest and often a changelog entry; keep `# Safety` blocks documented for any `unsafe`.
- Feature-gate new APIs and add the appropriate `#[cfg(feature = "...")]` plus `cfg_*!` macros (see `tokio/src/macros/cfg.rs`).
- Prefer the internal sync/loom abstractions (`loom::sync::...`) over `std` directly in runtime code so loom can model them.

## When navigating
Most questions are "where is X defined", "who calls X", or "how does subsystem Y (scheduler, reactor, timer wheel) work end to end". The codebase is large and heavily feature-gated, so prefer pinpoint, structural lookups over reading whole files top to bottom.
