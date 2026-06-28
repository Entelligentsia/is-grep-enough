#!/usr/bin/env python3
# Probe jdtls in INVISIBLE-PROJECT mode (gradle/maven import disabled) on a huge
# composite Gradle repo: does an intra-module textDocument/definition resolve
# line-exact, and how long does the cold invisible-project build take? Drives
# jdtls directly over LSP. Run inside a container from grove-testbench/lsp:spring-boot.
#
#   WS=/home/bench/repos/spring-boot \
#   SEED=.../bind/Binder.java DEF_LINE=72 DEF_COL=18 \
#   EXPECT=BindHandler.java EXPECT_LINE=30 python3 jdtls-probe.py
import os, sys, json, subprocess, threading, time

WS   = os.environ["WS"]
SEED = os.environ["SEED"]
DEF_LINE = int(os.environ.get("DEF_LINE", "72"))
DEF_COL  = int(os.environ.get("DEF_COL", "18"))
EXPECT      = os.environ.get("EXPECT", "BindHandler.java")
EXPECT_LINE = os.environ.get("EXPECT_LINE")  # optional 0-based line check
MAX = int(os.environ.get("MAX_S", "240"))
DATA = os.environ.get("JDTLS_DATA", "/tmp/jdtls-probe-ws")

env = dict(os.environ, JAVA_HOME="/opt/jdk-21",
           PATH="/opt/jdk-21/bin:" + os.environ.get("PATH", ""))
p = subprocess.Popen(["python3", "/opt/jdtls/bin/jdtls", "-data", DATA],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, bufsize=0, env=env)
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

init_opts = {"settings": {"java": {
    "import": {"gradle": {"enabled": False}, "maven": {"enabled": False}},
    "autobuild": {"enabled": True}}}}
send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
    "processId":None,"rootUri":"file://"+WS,
    "initializationOptions":init_opts,
    "capabilities":{"textDocument":{"definition":{"linkSupport":True}}},
    "workspaceFolders":[{"uri":"file://"+WS,"name":"ws"}]}})
drain_until(1, 60)
send({"jsonrpc":"2.0","method":"initialized","params":{}})
print(f"[{time.time()-t0:.1f}s] initialized (gradle/maven import OFF -> invisible project)", flush=True)

txt = open(SEED, encoding="utf-8", errors="replace").read()
send({"jsonrpc":"2.0","method":"textDocument/didOpen","params":{
    "textDocument":{"uri":"file://"+SEED,"languageId":"java","version":1,"text":txt}}})
print(f"[{time.time()-t0:.1f}s] seeded didOpen {SEED.split('/')[-1]}", flush=True)

ok = False
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
        uri = loc.get("uri") or loc.get("targetUri","")
        rng = loc.get("range") or loc.get("targetSelectionRange") or loc.get("targetRange") or {}
        ln = rng.get("start",{}).get("line")
        fmatch = EXPECT in uri
        lmatch = (EXPECT_LINE is None) or (str(ln) == str(EXPECT_LINE))
        ok = fmatch and lmatch
        print(f"[{time.time()-t0:.1f}s] definition@{DEF_LINE}:{DEF_COL} -> {uri.split('/')[-1]} L{ln} (0-based) file_match={fmatch} line_match={lmatch}", flush=True)
        if ok: break
    else:
        print(f"[{time.time()-t0:.1f}s] definition -> empty (invisible project building...)", flush=True)
    time.sleep(5)

try: p.terminate()
except Exception: pass
print(f"RESULT ok={ok} setup_s={time.time()-t0:.1f}", flush=True)
sys.exit(0 if ok else 1)
