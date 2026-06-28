# Bitcoin Core — contributor guide for coding agents

Bitcoin Core is a large C++ project (C++20) implementing a full Bitcoin node, wallet, and GUI. The bulk of the code lives under `src/`.

## Layout

- `src/` — core sources. Entry points are `bitcoind.cpp` (daemon) and `bitcoin-cli.cpp`; shared startup lives in `init.cpp`.
- `src/validation.{cpp,h}` — the consensus/validation engine: block and transaction validation, `ChainstateManager`, the UTXO set, and chain activation.
- `src/kernel/` — the consensus-critical "Bitcoin Kernel" library, factored out of the rest of the node.
- `src/net.cpp` — the P2P networking layer (connection management, sockets, `CConnman`). `src/net_processing.cpp` — message handling and peer logic on top of it.
- `src/txmempool.{cpp,h}` — the mempool. `src/policy/` — relay/fee policy.
- `src/consensus/` — consensus rules and parameters. `src/primitives/` — core data types (`CBlock`, `CTransaction`).
- `src/script/` — the script interpreter, signing, and standardness checks.
- `src/rpc/` — the JSON-RPC server and command implementations.
- `src/wallet/` — the (optional) wallet, descriptors, and coin selection.
- `src/qt/` — the Qt-based GUI (bitcoin-qt).
- `src/test/` — Boost.Test C++ unit tests; `src/test/fuzz/` — fuzz harnesses.
- `test/functional/` — Python end-to-end tests driving real nodes over RPC.

## Build & test

Bitcoin Core uses CMake:

```
cmake -B build
cmake --build build -j$(nproc)
```

Enable optional components with flags like `-DBUILD_GUI=ON`, `-DENABLE_WALLET=ON`, `-DBUILD_TESTS=ON`. Build outputs land in `build/bin/` and `build/src/`.

- **Unit tests:** run the suite directly with `build/src/test/test_bitcoin`, or via `ctest --test-dir build`. Filter with `--run_test=<suite>`.
- **Functional tests:** `test/functional/test_runner.py` runs the Python integration suite; pass a script name to run one, e.g. `test/functional/test_runner.py feature_rbf.py`.
- **Fuzzing:** build with `-DBUILD_FOR_FUZZING=ON` and run targets under `build/src/test/fuzz/`.

## Conventions

- Follow `doc/developer-notes.md` for C++ style, naming, threading, and locking annotations — read it before non-trivial changes.
- C++ formatting is enforced by `clang-format` (`.clang-format` at the repo root); Python by the project's linters. Run `test/lint/` checks before submitting.
- Consensus-critical code (`src/consensus/`, `src/script/`, validation) demands extra care: behavior changes can fork the network. Prefer minimal, well-reviewed diffs.
- Contributions go through `doc/CONTRIBUTING.md`: focused PRs, clear commit messages, and reviewer ACKs. Keep commits buildable and logically separated.

## When navigating

This is a large, deeply interconnected codebase. Prefer pinpoint, structural lookups — locate the specific function, class, or symbol you need rather than reading whole files end to end. Validation, net, net_processing, and the wallet are especially large; jump to the relevant declaration or definition and follow call sites from there.
