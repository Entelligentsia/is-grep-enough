#!/usr/bin/env python3
# Probe typescript-language-server readiness on a large TS repo: drive it DIRECTLY
# over LSP (Content-Length framing). Tests BOTH the position-based definition the
# native Claude Code LSP tool uses AND name-based workspace/symbol, and reports
# project-load time. Run inside a container from grove-testbench/lsp:latest.
#
#   WS=/home/bench/repos/typescript \
#   SEED=/home/bench/repos/typescript/src/compiler/parser.ts \
#   SYMBOL=createSourceFile EXPECT=parser.ts \
#   DEF_LINE=1343 DEF_COL=20 python3 ts-probe.py
import os, sys, json, subprocess, threading, time

WS     = os.environ.get("WS", "/home/bench/repos/typescript")
SEED   = os.environ.get("SEED", WS + "/src/compiler/parser.ts")
SYMBOL = os.environ.get("SYMBOL", "createSourceFile")
EXPECT = os.environ.get("EXPECT", "parser.ts")
DEF_LINE = int(os.environ.get("DEF_LINE", "1343"))   # 0-based
DEF_COL  = int(os.environ.get("DEF_COL", "20"))      # 0-based, inside the name token
MAX = int(os.environ.get("MAX_S", "180"))

p = subprocess.Popen(["typescript-language-server", "--stdio"],
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

txt = open(SEED, encoding="utf-8", errors="replace").read()
send({"jsonrpc":"2.0","method":"textDocument/didOpen","params":{
    "textDocument":{"uri":"file://"+SEED,"languageId":"typescript","version":1,"text":txt}}})
print(f"[{time.time()-t0:.1f}s] seeded didOpen {SEED}", flush=True)

# (A) position-based definition — what the native Claude Code LSP tool uses.
# Retry: tsserver needs the project loaded before it answers.
def_ok = False
qid = 50
while time.time() - t0 < MAX:
    qid += 1
    send({"jsonrpc":"2.0","id":qid,"method":"textDocument/definition","params":{
        "textDocument":{"uri":"file://"+SEED},
        "position":{"line":DEF_LINE,"character":DEF_COL}}})
    m = drain_until(qid, 30)
    res = (m or {}).get("result") or []
    if isinstance(res, dict): res = [res]
    if res:
        loc = res[0]
        uri = loc.get("uri","")
        ln  = loc.get("range",{}).get("start",{}).get("line")
        def_ok = EXPECT in uri
        print(f"[{time.time()-t0:.1f}s] definition@{DEF_LINE}:{DEF_COL} -> {uri.split('/')[-1]} L{ln} (0-based) match={def_ok}", flush=True)
        if def_ok: break
    else:
        print(f"[{time.time()-t0:.1f}s] definition -> empty (project loading...)", flush=True)
    time.sleep(4)

# (B) name-based workspace/symbol — broader index check.
sym_ok = False
qid = 100
while time.time() - t0 < MAX:
    qid += 1
    send({"jsonrpc":"2.0","id":qid,"method":"workspace/symbol","params":{"query":SYMBOL}})
    m = drain_until(qid, 30)
    body = json.dumps(m) if m else ""
    n = len(m["result"]) if (m and isinstance(m.get("result"), list)) else 0
    sym_ok = EXPECT in body
    print(f"[{time.time()-t0:.1f}s] workspace/symbol({SYMBOL}) -> {n} results, {EXPECT} present={sym_ok}", flush=True)
    if sym_ok:
        for r in (m.get("result") or [])[:3]:
            loc = r.get("location",{}).get("uri","")
            ln = r.get("location",{}).get("range",{}).get("start",{}).get("line")
            print("    ->", r.get("name"), loc.split("/")[-1], f"L{ln}", flush=True)
        break
    time.sleep(5)

p.terminate()
print(f"RESULT def_ok={def_ok} sym_ok={sym_ok}", flush=True)
sys.exit(0 if (def_ok or sym_ok) else 1)
