# bitcoin · L3 · baseline — readable transcript

> baseline — text search (bash + coreutils), over **bitcoin** (cpp) @ `6d8e15dff`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `baseline` — text search (bash + coreutils) |
| repo · rung | bitcoin (cpp) · L3 |
| pinned source | `6d8e15dff015d3df8e87de63e650a5aee32ff12f` |
| status | completed |
| engagement | `bash_calls = 18` (gate: > 0 → ✓ used its capability) |
| turns | 9 |
| wall clock | 215 s |
| context (peak) | 146,115 tokens |
| cost (billed) | $0.3860 |
| &nbsp;&nbsp;↳ token split | in 7 · out 3,452 · cache-create 18,197 · cache-read 127,911 |
| tool calls | 48 (Read×29, Bash×18, Agent×1) |
| evidence | `evidence/nav3/L3/raw/bitcoin-L3.claude.baseline.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens to a single message arriving from a peer from the moment its bytes are read off the socket until the per-message-type handler actually runs. I'm interested in how the raw bytes are read and fed into the transport, how a complete message is parsed out, how the message is pulled and handed to the processing layer, how its type is matched to a handler, and how control finally reaches that handler's logic. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll trace this end-to-end by reading the relevant parts of the networking and message-processing code.

▸ `Agent(Trace Bitcoin P2P message pipeline from socket read to handler)`  ⟶ subagent:
    ↳ `Bash(find /home/bench/repos/bitcoin -name "net.cpp" -o -name "net.h" -o -name "net_processing.cpp" | head -20)`
    ↳ `Bash(find /home/bench/repos/bitcoin/src -name "*transport*" -type f)`
    ↳ `Bash(find /home/bench/repos/bitcoin/src -name "*v1transport*" -o -name "*v2transport*" -o -name "*protocol*" | grep -v test)`
    ↳ `Bash(grep -n "class.*Transport\|struct.*Transport" /home/bench/repos/bitcoin/src/net.h | head -20)`
    ↳ `Bash(grep -n "ReceiveMsgBytes\|SocketHandler\|GetMessage\|ProcessMessages" /home/bench/repos/bitcoin/src/net.cpp | head -30)`
    ↳ `Bash(grep -n "ProcessMessages\|ProcessMessage" /home/bench/repos/bitcoin/src/net_processing.cpp | head -20)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.h)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.h)`
    ↳ `Bash(grep -n "struct CNetMessage\|class CNode" /home/bench/repos/bitcoin/src/net.h | head -20)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.h)`
    ↳ `Bash(grep -rn "struct CNetMessage\|class CNetMessage" /home/bench/repos/bitcoin/src --include="*.h" --include="*.cpp" | grep -v test)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.h)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.h)`
    ↳ `Bash(grep -n "ReceiveMsgBytes\|m_msg_process_queue\|m_msg_recv_queue" /home/bench/repos/bitcoin/src/net.h | head -30)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Bash(grep -n "vRecvMsg" /home/bench/repos/bitcoin/src/net.h)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Bash(grep -n "V2Transport::ReceivedBytes\|V2Transport::ReceivedMessageComplete\|V2Transport::GetReceivedMessage" /home/bench/repos/bitcoin/src/net.cpp | head -20)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net_processing.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net_processing.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net_processing.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net_processing.cpp)`
    ↳ `Bash(grep -n "msg_type == NetMsgType::\|else if (msg_type ==" /home/bench/repos/bitcoin/src/net_processing.cpp | head -40)`
    ↳ `Bash(grep -n "MarkReceivedMsgsForProcessing\|PollMessage" /home/bench/repos/bitcoin/src/net.cpp | head -20)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Bash(find /home/bench/repos/bitcoin/src -name "sock.h" -o -name "sock.cpp" | grep -v test)`
    ↳ `Bash(grep -n "int.*Recv\|ssize_t.*recv" /home/bench/repos/bitcoin/src/util/sock.cpp | head -20)`
    ↳ `Bash(grep -n "Recv\|recv" /home/bench/repos/bitcoin/src/util/sock.h | head -20)`
    ↳ `Read(/home/bench/repos/bitcoin/src/util/sock.h)`
    ↳ `Bash(grep -n "ssize_t Sock::Recv" /home/bench/repos/bitcoin/src/util/sock.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/util/sock.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Bash(grep -n "ProcessMessages\|ThreadMessageHandler\|m_msgproc->ProcessMessages" /home/bench/repos/bitcoin/src/net.cpp | head -30)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.h)`
    ↳ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
    ↳ ⟹ returned to parent


💬 Let me spot-check the key line numbers to make sure they're accurate.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net_processing.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.cpp)`

💬 Let me also verify the `ProcessMessage` dispatch structure.

&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net_processing.cpp)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.cpp)`

💬 All line numbers check out. Here's the verified, end-to-end trace:

---

## Bitcoin P2P message pipeline: socket bytes → handler

There are two threads and a handoff between them.

---

### Thread 1: `ThreadSocketHandler` — reads bytes and assembles messages

**1. `ThreadSocketHandler` / `SocketHandlerConnected`** — `net.cpp:2147`

The network I/O thread runs a `poll`/`select` loop (`WaitMany`) over all connected sockets. When a socket becomes readable it calls into `SocketHandlerConnected`.

**2. `Sock::Recv`** — `sock.cpp:52`

Inside `SocketHandlerConnected` at `net.cpp:2205`, a 64 KB stack buffer `pchBuf[0x10000]` is filled with a single `recv()` syscall. The raw bytes now sit in that buffer.

**3. `CNode::ReceiveMsgBytes`** — `net.cpp:668`

Called at `net.cpp:2210` with a `std::span` over `pchBuf`. This is the boundary between raw I/O and the transport abstraction. Under `LOCK(cs_vRecv)` it loops while bytes remain:

```
while (msg_bytes.size() > 0) {
    m_transport->ReceivedBytes(msg_bytes);    // net.cpp:677 — consume some bytes
    if (m_transport->ReceivedMessageComplete()) {
        CNetMessage msg = m_transport->GetReceivedMessage(time, reject_message);  // net.cpp:685
        vRecvMsg.push_back(std::move(msg));   // net.cpp:703
        complete = true;
    }
}
```

Each iteration may consume only part of the span (e.g. just enough to finish the header), so the loop is necessary to handle multiple messages in one `recv` call.

**4a. `V1Transport::ReceivedBytes`** — `net.cpp`

The V1 transport is a two-phase state machine gated on `in_data`:
- **Header phase** → `readHeader` (`net.cpp:739`): accumulates exactly 24 bytes into `hdrbuf`, then deserializes the `CMessageHeader`. Validates the 4-byte network magic and rejects payloads over `MAX_PROTOCOL_MESSAGE_LENGTH`. Sets `in_data = true`.
- **Data phase** → `readData` (`net.cpp:782`): copies the payload bytes into `vRecv` and feeds them to a rolling `SHA256d` hasher. Completes when `nDataPos == hdr.nMessageSize`.

**4b. `V1Transport::GetReceivedMessage`** — `net.cpp:809` (called when `ReceivedMessageComplete()` is true)

Extracts `msg.m_type` from `hdr.GetMessageType()`, finalises the hash, validates the 4-byte checksum, validates the type string, then calls `Reset()` to prepare the transport for the next message. Returns a `CNetMessage` with `m_type` (string) and `m_recv` (a `DataStream` holding the payload).

*(For BIP 324 encrypted connections, `V2Transport::ReceivedBytes` — `net.cpp:1330` — runs the decryption state machine through handshake/garbage/ciphertext states, then `V2Transport::GetReceivedMessage` — `net.cpp:1460` — decrypts and parses the short or long message-type prefix defined by the v2 encoding.)*

**5. `CNode::MarkReceivedMsgsForProcessing`** — `net.cpp:4093`

Back in `SocketHandlerConnected` at `net.cpp:2219`, if `complete == true` this is called. Under `m_msg_process_queue_mutex` it splices the entire `vRecvMsg` list onto `m_msg_process_queue` in one O(1) operation (`net.cpp:4105`). This is the thread-safe handoff point. It also updates a byte-count and sets `fPauseRecv` if the queue exceeds the flood threshold.

**6. `WakeMessageHandler`** — `net.cpp:2220`

Signals `condMsgProc` to wake Thread 2 immediately rather than waiting for its 100 ms timeout.

---

### Thread 2: `ThreadMessageHandler` — dispatches messages to handlers

**7. `CConnman::ThreadMessageHandler`** — `net.cpp:3193`

Holds `g_msgproc_mutex` for its entire lifetime — this is the exclusive lock that serialises all message processing. Each iteration shuffles the node list (to prevent ordering attacks) and calls `ProcessMessages` on every node that isn't paused.

**8. `PeerManagerImpl::ProcessMessages`** — `net_processing.cpp:5141`

Does some pre-flight work (pending `GETDATA` responses, orphan transactions), then calls:

```cpp
auto poll_result{node.PollMessage()};   // net_processing.cpp:5178
```

**9. `CNode::PollMessage`** — `net.cpp:4110`

Under `m_msg_process_queue_mutex`, pops exactly one `CNetMessage` from the front of `m_msg_process_queue` and returns it together with a `bool` indicating whether more messages remain (used to signal `fMoreWork` back to the loop). Returns `std::nullopt` if the queue is empty.

**10. `PeerManagerImpl::ProcessMessage`** — `net_processing.cpp:5201` (called from `ProcessMessages`) / `net_processing.cpp:3603` (definition)

This is a single ~1500-line function. It receives `msg.m_type` (a `std::string`) and `msg.m_recv` (the `DataStream` payload). The dispatch is a plain **if/else chain** on the type string:

```cpp
if (msg_type == NetMsgType::VERSION) { … }        // line 3612
else if (msg_type == NetMsgType::VERACK)  { … }
else if (msg_type == NetMsgType::ADDR)    { … }
else if (msg_type == NetMsgType::INV)     { … }
else if (msg_type == NetMsgType::TX)      { … }
else if (msg_type == NetMsgType::BLOCK)   { … }
// … ~50 more types
```

`NetMsgType::*` constants are just `const char*` string literals (e.g. `"version"`, `"tx"`). There is no dispatch table or vtable — it's a linear scan, so `VERSION` is the cheapest and rarely-seen types like `WTXIDRELAY` are checked last.

Each branch deserializes the payload out of `vRecv` with `>>` and runs the handler logic inline.

---

### Summary call chain

```
[ThreadSocketHandler]
  Sock::Recv()                          sock.cpp:52
    → CNode::ReceiveMsgBytes()          net.cpp:668
        → V1Transport::ReceivedBytes()  net.cpp (readHeader:739, readData:782)
        → V1Transport::GetReceivedMessage()  net.cpp:809
        → vRecvMsg.push_back(msg)       net.cpp:703
    → CNode::MarkReceivedMsgsForProcessing()  net.cpp:4093
        → m_msg_process_queue.splice()  net.cpp:4105
    → WakeMessageHandler()              net.cpp:2220

[ThreadMessageHandler]  (holds g_msgproc_mutex)
  PeerManagerImpl::ProcessMessages()   net_processing.cpp:5141
    → CNode::PollMessage()             net.cpp:4110
    → PeerManagerImpl::ProcessMessage()  net_processing.cpp:3603
        → if (msg_type == "version") { … }
        → else if (msg_type == "tx") { … }
        → …
```

The two key synchronization boundaries are the `cs_vRecv` lock (protects `vRecvMsg` while bytes are being assembled) and the `m_msg_process_queue_mutex` splice (the atomic handoff between threads). `g_msgproc_mutex` then serialises all processing across all peers.


## Final answer

_Result event — success, 215 s, 9 turns._

All line numbers check out. Here's the verified, end-to-end trace:

---

## Bitcoin P2P message pipeline: socket bytes → handler

There are two threads and a handoff between them.

---

### Thread 1: `ThreadSocketHandler` — reads bytes and assembles messages

**1. `ThreadSocketHandler` / `SocketHandlerConnected`** — `net.cpp:2147`

The network I/O thread runs a `poll`/`select` loop (`WaitMany`) over all connected sockets. When a socket becomes readable it calls into `SocketHandlerConnected`.

**2. `Sock::Recv`** — `sock.cpp:52`

Inside `SocketHandlerConnected` at `net.cpp:2205`, a 64 KB stack buffer `pchBuf[0x10000]` is filled with a single `recv()` syscall. The raw bytes now sit in that buffer.

**3. `CNode::ReceiveMsgBytes`** — `net.cpp:668`

Called at `net.cpp:2210` with a `std::span` over `pchBuf`. This is the boundary between raw I/O and the transport abstraction. Under `LOCK(cs_vRecv)` it loops while bytes remain:

```
while (msg_bytes.size() > 0) {
    m_transport->ReceivedBytes(msg_bytes);    // net.cpp:677 — consume some bytes
    if (m_transport->ReceivedMessageComplete()) {
        CNetMessage msg = m_transport->GetReceivedMessage(time, reject_message);  // net.cpp:685
        vRecvMsg.push_back(std::move(msg));   // net.cpp:703
        complete = true;
    }
}
```

Each iteration may consume only part of the span (e.g. just enough to finish the header), so the loop is necessary to handle multiple messages in one `recv` call.

**4a. `V1Transport::ReceivedBytes`** — `net.cpp`

The V1 transport is a two-phase state machine gated on `in_data`:
- **Header phase** → `readHeader` (`net.cpp:739`): accumulates exactly 24 bytes into `hdrbuf`, then deserializes the `CMessageHeader`. Validates the 4-byte network magic and rejects payloads over `MAX_PROTOCOL_MESSAGE_LENGTH`. Sets `in_data = true`.
- **Data phase** → `readData` (`net.cpp:782`): copies the payload bytes into `vRecv` and feeds them to a rolling `SHA256d` hasher. Completes when `nDataPos == hdr.nMessageSize`.

**4b. `V1Transport::GetReceivedMessage`** — `net.cpp:809` (called when `ReceivedMessageComplete()` is true)

Extracts `msg.m_type` from `hdr.GetMessageType()`, finalises the hash, validates the 4-byte checksum, validates the type string, then calls `Reset()` to prepare the transport for the next message. Returns a `CNetMessage` with `m_type` (string) and `m_recv` (a `DataStream` holding the payload).

*(For BIP 324 encrypted connections, `V2Transport::ReceivedBytes` — `net.cpp:1330` — runs the decryption state machine through handshake/garbage/ciphertext states, then `V2Transport::GetReceivedMessage` — `net.cpp:1460` — decrypts and parses the short or long message-type prefix defined by the v2 encoding.)*

**5. `CNode::MarkReceivedMsgsForProcessing`** — `net.cpp:4093`

Back in `SocketHandlerConnected` at `net.cpp:2219`, if `complete == true` this is called. Under `m_msg_process_queue_mutex` it splices the entire `vRecvMsg` list onto `m_msg_process_queue` in one O(1) operation (`net.cpp:4105`). This is the thread-safe handoff point. It also updates a byte-count and sets `fPauseRecv` if the queue exceeds the flood threshold.

**6. `WakeMessageHandler`** — `net.cpp:2220`

Signals `condMsgProc` to wake Thread 2 immediately rather than waiting for its 100 ms timeout.

---

### Thread 2: `ThreadMessageHandler` — dispatches messages to handlers

**7. `CConnman::ThreadMessageHandler`** — `net.cpp:3193`

Holds `g_msgproc_mutex` for its entire lifetime — this is the exclusive lock that serialises all message processing. Each iteration shuffles the node list (to prevent ordering attacks) and calls `ProcessMessages` on every node that isn't paused.

**8. `PeerManagerImpl::ProcessMessages`** — `net_processing.cpp:5141`

Does some pre-flight work (pending `GETDATA` responses, orphan transactions), then calls:

```cpp
auto poll_result{node.PollMessage()};   // net_processing.cpp:5178
```

**9. `CNode::PollMessage`** — `net.cpp:4110`

Under `m_msg_process_queue_mutex`, pops exactly one `CNetMessage` from the front of `m_msg_process_queue` and returns it together with a `bool` indicating whether more messages remain (used to signal `fMoreWork` back to the loop). Returns `std::nullopt` if the queue is empty.

**10. `PeerManagerImpl::ProcessMessage`** — `net_processing.cpp:5201` (called from `ProcessMessages`) / `net_processing.cpp:3603` (definition)

This is a single ~1500-line function. It receives `msg.m_type` (a `std::string`) and `msg.m_recv` (the `DataStream` payload). The dispatch is a plain **if/else chain** on the type string:

```cpp
if (msg_type == NetMsgType::VERSION) { … }        // line 3612
else if (msg_type == NetMsgType::VERACK)  { … }
else if (msg_type == NetMsgType::ADDR)    { … }
else if (msg_type == NetMsgType::INV)     { … }
else if (msg_type == NetMsgType::TX)      { … }
else if (msg_type == NetMsgType::BLOCK)   { … }
// … ~50 more types
```

`NetMsgType::*` constants are just `const char*` string literals (e.g. `"version"`, `"tx"`). There is no dispatch table or vtable — it's a linear scan, so `VERSION` is the cheapest and rarely-seen types like `WTXIDRELAY` are checked last.

Each branch deserializes the payload out of `vRecv` with `>>` and runs the handler logic inline.

---

### Summary call chain

```
[ThreadSocketHandler]
  Sock::Recv()                          sock.cpp:52
    → CNode::ReceiveMsgBytes()          net.cpp:668
        → V1Transport::ReceivedBytes()  net.cpp (readHeader:739, readData:782)
        → V1Transport::GetReceivedMessage()  net.cpp:809
        → vRecvMsg.push_back(msg)       net.cpp:703
    → CNode::MarkReceivedMsgsForProcessing()  net.cpp:4093
        → m_msg_process_queue.splice()  net.cpp:4105
    → WakeMessageHandler()              net.cpp:2220

[ThreadMessageHandler]  (holds g_msgproc_mutex)
  PeerManagerImpl::ProcessMessages()   net_processing.cpp:5141
    → CNode::PollMessage()             net.cpp:4110
    → PeerManagerImpl::ProcessMessage()  net_processing.cpp:3603
        → if (msg_type == "version") { … }
        → else if (msg_type == "tx") { … }
        → …
```

The two key synchronization boundaries are the `cs_vRecv` lock (protects `vRecvMsg` while bytes are being assembled) and the `m_msg_process_queue_mutex` splice (the atomic handoff between threads). `g_msgproc_mutex` then serialises all processing across all peers.

