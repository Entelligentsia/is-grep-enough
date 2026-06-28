#!/usr/bin/env python3
# Probe pyright-langserver readiness on a large repo: time from launch to a
# workspace/symbol query resolving a known symbol. Drives pyright DIRECTLY over
# LSP (Content-Length framing — that's the server protocol; the NDJSON quirk is
# only the MCP bridge layer above it). Run inside a container from lsp:latest.
#
#   WS=/home/bench/repos/django SYMBOL=ResolverMatch EXPECT=resolvers.py \
#   [SEED=/abs/file.py] python3 pyright-probe.py
import os, sys, json, subprocess, threading, time

WS = os.environ.get("WS", "/home/bench/repos/django")
SYMBOL = os.environ.get("SYMBOL", "ResolverMatch")
EXPECT = os.environ.get("EXPECT", "resolvers.py")
SEED = os.environ.get("SEED")
MAX = int(os.environ.get("MAX_S", "180"))

p = subprocess.Popen(["pyright-langserver", "--stdio"],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, bufsize=0)
t0 = time.time()

def send(o):
    b = json.dumps(o).encode()
    p.stdin.write(b"Content-Length: %d\r\n\r\n" % len(b) + b); p.stdin.flush()

def recv(timeout):
    out = [None]
    def rd():
        h = b""
        while not h.endswith(b"\r\n\r\n"):
            c = p.stdout.read(1)
            if not c: return
            h += c
        n = 0
        for line in h.split(b"\r\n"):
            if line.lower().startswith(b"content-length:"):
                n = int(line.split(b":")[1])
        out[0] = p.stdout.read(n)
    th = threading.Thread(target=rd); th.daemon = True; th.start(); th.join(timeout)
    return out[0]

def drain_until(_id, timeout):
    deadline = time.time() + timeout
    while time.time() < deadline:
        m = recv(deadline - time.time())
        if not m: return None
        try: msg = json.loads(m)
        except Exception: continue
        if msg.get("id") == _id: return msg
    return None

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
    "processId":None,"rootUri":"file://"+WS,
    "capabilities":{},"workspaceFolders":[{"uri":"file://"+WS,"name":"ws"}]}})
drain_until(1, 30)
send({"jsonrpc":"2.0","method":"initialized","params":{}})
print(f"[{time.time()-t0:.1f}s] initialized", flush=True)

if SEED:
    txt = open(SEED, encoding="utf-8", errors="replace").read()
    send({"jsonrpc":"2.0","method":"textDocument/didOpen","params":{
        "textDocument":{"uri":"file://"+SEED,"languageId":"python","version":1,"text":txt}}})
    print(f"[{time.time()-t0:.1f}s] seeded didOpen {SEED}", flush=True)

# poll workspace/symbol until the expected file shows up
qid = 100
hit = False
while time.time() - t0 < MAX:
    qid += 1
    send({"jsonrpc":"2.0","id":qid,"method":"workspace/symbol","params":{"query":SYMBOL}})
    m = drain_until(qid, 30)
    body = json.dumps(m) if m else ""
    n = len(m["result"]) if (m and isinstance(m.get("result"), list)) else 0
    hit = EXPECT in body
    print(f"[{time.time()-t0:.1f}s] workspace/symbol({SYMBOL}) -> {n} results, {EXPECT} present={hit}", flush=True)
    if hit:
        for r in (m.get("result") or [])[:3]:
            loc = r.get("location",{}).get("uri","")
            print("    ->", r.get("name"), loc.split("/")[-1], flush=True)
        break
    time.sleep(5)

p.terminate()
sys.exit(0 if hit else 1)
