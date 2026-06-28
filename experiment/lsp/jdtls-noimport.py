#!/usr/bin/env python3
# Invisible-source-path LSP proxy for jdtls on a huge composite Gradle build.
#
# Why this exists: spring-boot is a 451-module composite Gradle build with heavy
# buildSrc conventions. A full jdtls Gradle import is impractical (minutes of
# configuration + the whole dependency tree) and fragile. But the cross-cutting
# spines the experiment asks about are INTRA-module (resolution within one
# module's src/main/java), which jdtls resolves through its own type model with
# no gradle download — IF that source root is on a project's source path.
#
# Two things have to happen, neither controllable via the native LSP tool's
# initializationOptions, so this transparent proxy does them:
#   1. Disable gradle/maven import (settings.java.import.{gradle,maven}.enabled=
#      false) by deep-merging into the client's `initialize` request. Otherwise
#      jdtls tries to import all 451 modules and the agent races a multi-minute
#      (often failing) import.
#   2. For every file the agent opens, add its enclosing source root
#      (.../src/main/java or .../src/test/java) to jdtls's default project via the
#      `java.project.addToSourcePath` command — so sibling/intra-module types
#      resolve line-exact. (Verified: Binder.java -> BindHandler.java line-exact
#      in ~9s, no gradle.) Without this, an opened file is an orphan single file
#      and nothing cross-file resolves.
# It also injects one didOpen for $LSP_SEED_FILE after `initialized` (like
# lsp-seed.py) to warm the core source root before the first query.
#
# Usage (as the native-LSP plugin command):
#   LSP_SEED_FILE=/abs/file.java python3 /usr/local/bin/jdtls-noimport.py jdtls [args...]
import sys, os, json, subprocess, threading

SENTINEL = 9_700_001  # id base for injected addToSourcePath requests; responses are swallowed

def read_msg(f):
    """Read one framed LSP message; return (raw_bytes, parsed_or_None) or (None, None)."""
    h = b""
    while not h.endswith(b"\r\n\r\n"):
        c = f.read(1)
        if not c:
            return None, None
        h += c
    n = 0
    for line in h.split(b"\r\n"):
        if line.lower().startswith(b"content-length:"):
            n = int(line.split(b":")[1])
    body = f.read(n) if n else b""
    try:
        return h + body, json.loads(body)
    except Exception:
        return h + body, None

def frame(obj):
    b = json.dumps(obj).encode()
    return b"Content-Length: %d\r\n\r\n" % len(b) + b

def source_root_of(path):
    """The .../src/main/java (or src/test/java) ancestor of a .java file, else None."""
    for marker in ("/src/main/java/", "/src/test/java/"):
        i = path.find(marker)
        if i != -1:
            return path[: i + len(marker) - 1]  # drop trailing slash
    return None

def deep_no_import(params):
    opts = params.get("initializationOptions")
    if not isinstance(opts, dict):
        opts = {}; params["initializationOptions"] = opts
    settings = opts.setdefault("settings", {})
    java = settings.setdefault("java", {})
    imp = java.setdefault("import", {})
    imp.setdefault("gradle", {})["enabled"] = False
    imp.setdefault("maven", {})["enabled"] = False
    java.setdefault("autobuild", {})["enabled"] = True
    return params

server = subprocess.Popen(sys.argv[1:], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
SEED = os.environ.get("LSP_SEED_FILE")
state = {"patched": False, "seeded": False, "roots": set(), "n": 0}
lock = threading.Lock()
s_in, s_out = server.stdin, server.stdout
assert s_in is not None and s_out is not None

def add_source_root(path):
    root = source_root_of(path)
    if not root:
        return
    with lock:
        if root in state["roots"]:
            return
        state["roots"].add(root)
        state["n"] += 1
        rid = SENTINEL + state["n"]
    s_in.write(frame({"jsonrpc": "2.0", "id": rid, "method": "workspace/executeCommand",
        "params": {"command": "java.project.addToSourcePath", "arguments": ["file://" + root]}}))
    s_in.flush()

def uri_to_path(uri):
    return uri[len("file://"):] if uri.startswith("file://") else uri

def client_to_server(cin):
    while True:
        raw, msg = read_msg(cin)
        if raw is None:
            break
        if msg and not state["patched"] and msg.get("method") == "initialize" and isinstance(msg.get("params"), dict):
            msg["params"] = deep_no_import(msg["params"])
            raw = frame(msg)
            state["patched"] = True
        # before forwarding a didOpen, ensure its source root is on the project source path
        if msg and msg.get("method") == "textDocument/didOpen":
            try:
                add_source_root(uri_to_path(msg["params"]["textDocument"]["uri"]))
            except Exception:
                pass
        s_in.write(raw); s_in.flush()
        # seed one didOpen right after the client's `initialized`
        if msg and SEED and not state["seeded"] and msg.get("method") == "initialized":
            state["seeded"] = True
            try:
                add_source_root(SEED)
                txt = open(SEED, encoding="utf-8", errors="replace").read()
                s_in.write(frame({"jsonrpc": "2.0", "method": "textDocument/didOpen",
                    "params": {"textDocument": {"uri": "file://" + SEED,
                        "languageId": "java", "version": 1, "text": txt}}}))
                s_in.flush()
            except Exception:
                pass

def server_to_client(cout):
    while True:
        raw, msg = read_msg(s_out)
        if raw is None:
            break
        # swallow responses to our injected addToSourcePath requests
        if msg and isinstance(msg.get("id"), int) and msg["id"] > SENTINEL:
            continue
        cout.write(raw); cout.flush()

threading.Thread(target=client_to_server, args=(sys.stdin.buffer,), daemon=True).start()
threading.Thread(target=server_to_client, args=(sys.stdout.buffer,), daemon=True).start()
server.wait()
