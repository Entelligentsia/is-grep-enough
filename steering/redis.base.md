# Redis — contributor guide for coding agents

Redis is an in-memory data-structure store written in **C (C11)**. This file is
the standing context for working in this repository.

## Layout

- `src/` — the server. Entry point `server.c` (`main`, `initServer`, the
  `serverCron` timer, and the `redisCommandTable`). Everything else hangs off
  here.
- `src/dict.c`, `src/dict.h` — the core hash-table (`dict`); used for the
  keyspace, hashes, sets, and more.
- `src/t_string.c`, `src/t_list.c`, `src/t_hash.c`, `src/t_set.c`,
  `src/t_zset.c`, `src/t_stream.c` — per-type command implementations
  (`*Command` functions, e.g. `setCommand`, `getCommand`).
- `src/networking.c` — client I/O, the `client` struct, reply buffers,
  `readQueryFromClient`, `addReply*`.
- `src/server.c` / `src/server.h` — command dispatch (`call`, `processCommand`),
  the `redisServer` and `redisCommand` structs, shared globals.
- `src/expire.c` — key expiration (active + lazy); `src/evict.c` — maxmemory
  eviction.
- `src/rdb.c`, `src/aof.c` — persistence. `src/replication.c` — master/replica.
- `src/cluster.c` — Redis Cluster. `src/module.c` — the modules API.
- `tests/` — the Tcl integration suite. `tests/unit/`, `tests/integration/`.

## Build & test

- Build: `make` (from repo root; uses `src/Makefile`). `make distclean` to reset.
- Run a server: `./src/redis-server` (or with `redis.conf`).
- Full tests: `./runtest` (Tcl). Single suite: `./runtest --single unit/type/string`.
- C unit tests: `make test-c` where present.

## Conventions

- Style is the existing K&R-ish C: 4-space indent, no tabs, braces on the same
  line. Match the surrounding file.
- Commands are registered in the `redisCommandTable` in `server.c` and
  implemented as `void <name>Command(client *c)` in the relevant `t_*.c`.
- Memory goes through `zmalloc`/`zfree` (`src/zmalloc.c`), strings through the
  SDS library (`src/sds.c`). Do not use bare `malloc`/`free`.
- Keep `make` warning-clean. Source files end with a newline.

## When navigating

Most questions are "where is X defined", "who calls X", or "how does subsystem Y
work end to end". The codebase is large (~150 C files, thousands of functions),
so prefer pinpoint, structural lookups over reading whole files top to bottom.
