# bitcoin · L3 · grove — readable transcript

> grove — structural (grove MCP/CLI), over **bitcoin** (cpp) @ `6d8e15dff`, model `sonnet`. One run (n=1). This document is generated from the run's own stream-json; every number below is recomputed from that transcript.

| field | value |
|---|---|
| arm | `grove` — structural (grove MCP/CLI) |
| repo · rung | bitcoin (cpp) · L3 |
| pinned source | `6d8e15dff015d3df8e87de63e650a5aee32ff12f` |
| status | completed |
| engagement | `grove_tools = 20` (gate: > 0 → ✓ used its capability) |
| turns | 27 |
| wall clock | 190 s |
| context (peak) | 431,984 tokens |
| cost (billed) | $0.4347 |
| &nbsp;&nbsp;↳ token split | in 21 · out 7,499 · cache-create 33,659 · cache-read 398,304 |
| tool calls | 26 (mcp__grove__source×14, mcp__grove__outline×4, Read×3, mcp__grove__symbols×2, Bash×2, ToolSearch×1) |
| evidence | `evidence/nav3/L3/raw/bitcoin-L3.claude.grove.jsonl` |

## Prompt — verbatim (exactly what the arm was shown)

The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).

> I want to trace what happens to a single message arriving from a peer from the moment its bytes are read off the socket until the per-message-type handler actually runs. I'm interested in how the raw bytes are read and fed into the transport, how a complete message is parsed out, how the message is pulled and handed to the processing layer, how its type is matched to a handler, and how control finally reaches that handler's logic. Walk me through that sequence in order, end to end.

## Reasoning trail

Each `💬` is the agent's own reasoning; each `▸` is a tool call, in order. Subagent steps are spliced under their spawn (`↳`).


💬 I'll trace this end-to-end using grove to follow the actual code path. Let me load the tools and explore the key files in parallel.

&nbsp;&nbsp;▸ `ToolSearch(select:mcp__grove__outline,mcp__grove__symbols,mcp__grove__source,mcp__grove__callers,mcp__grove__definition)`

💬 Let me get outlines of the two key files in parallel to understand their structure.

&nbsp;&nbsp;▸ `mcp__grove__outline(src/net.cpp)`
&nbsp;&nbsp;▸ `mcp__grove__outline(src/net_processing.cpp)`
&nbsp;&nbsp;▸ `mcp__grove__outline(src/net.h)`

💬 Good overview. Now let me read the key functions that form the pipeline, fetching them in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(SocketHandlerConnected)`
&nbsp;&nbsp;▸ `mcp__grove__source(ThreadMessageHandler)`
&nbsp;&nbsp;▸ `mcp__grove__source(ReceiveMsgBytes)`

💬 Now let me get `ReceiveMsgBytes` (the implementation is in net.cpp, not net.h), the Transport interface methods, `MarkReceivedMsgsForProcessing`, and `ProcessMessages` all in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(ReceiveMsgBytes)`
&nbsp;&nbsp;▸ `mcp__grove__source(MarkReceivedMsgsForProcessing)`
&nbsp;&nbsp;▸ `mcp__grove__source(ProcessMessages)`
&nbsp;&nbsp;▸ `mcp__grove__source(ReceivedBytes)`
&nbsp;&nbsp;▸ `mcp__grove__source(ReceivedMessageComplete)`

💬 Good. Let me get the actual `ProcessMessages` implementation and the V1 transport's `ReceivedBytes` method, plus look at the Transport class structure.

&nbsp;&nbsp;▸ `mcp__grove__source(cpp:src/net_processing.cpp#ProcessMessages@5141)`
&nbsp;&nbsp;▸ `mcp__grove__outline(src/net.cpp)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(ReceivedBytes)`

💬 Now let me read the V1 transport's `ReceivedBytes` (it uses `readHeader`/`readData`), `PollMessage`, and the top of `ProcessMessage` dispatcher, all in parallel.

&nbsp;&nbsp;▸ `mcp__grove__source(readHeader)`
&nbsp;&nbsp;▸ `mcp__grove__source(readData)`
&nbsp;&nbsp;▸ `mcp__grove__source(PollMessage)`
&nbsp;&nbsp;▸ `mcp__grove__source(cpp:src/net.cpp#ReceivedBytes@1330)`

💬 Let me find V1Transport's `ReceivedBytes` implementation and the `ProcessMessage` dispatcher's structure.

&nbsp;&nbsp;▸ `Bash(grep -n "V1Transport::ReceivedBytes\|V1Transport::ReceivedMessageComplete\|V1Transport::GetReceivedMessage" /home/bench/repos/bitcoin/src/net.cpp | head -20)`
&nbsp;&nbsp;▸ `mcp__grove__symbols(ProcessMessage)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.cpp)`
&nbsp;&nbsp;▸ `mcp__grove__source(cpp:src/net_processing.cpp#ProcessMessage@3603)`

💬 Let me find V1Transport's `ReceivedBytes` — it may be inline in net.h.

&nbsp;&nbsp;▸ `Bash(grep -n "ReceivedBytes\|ReceivedMessageComplete\|CompleteInternal" /home/bench/repos/bitcoin/src/net.h | head -30)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.h)`
&nbsp;&nbsp;▸ `Read(/home/bench/repos/bitcoin/src/net.h)`

💬 I now have all the pieces. Here is the complete end-to-end trace.

---

## How an inbound message flows from socket bytes to handler

There are three distinct thread roles involved. The socket-handler thread owns the read side. The message-handler thread owns the process side. They hand off through a shared queue.

---

### Stage 1 — Raw socket read: `CConnman::SocketHandlerConnected` (`src/net.cpp:2147`)

`ThreadSocketHandler` runs a tight loop calling `SocketHandler` → `SocketHandlerConnected` for every connected peer. When `poll`/`select` marks a socket readable:

```cpp
uint8_t pchBuf[0x10000];   // 64 KiB stack buffer
nBytes = pnode->m_sock->Recv(pchBuf, sizeof(pchBuf), MSG_DONTWAIT);
```

A single `recv()` syscall dumps up to 64 KiB of wire bytes into that stack buffer. The span `{pchBuf, nBytes}` is then passed directly to `CNode::ReceiveMsgBytes`.

---

### Stage 2 — Feed bytes to the transport: `CNode::ReceiveMsgBytes` (`src/net.cpp:668`)

This function is the bridge between raw bytes and protocol messages. It holds `cs_vRecv` and loops until the input span is empty:

```cpp
while (msg_bytes.size() > 0) {
    if (!m_transport->ReceivedBytes(msg_bytes)) return false; // transport parse error
    if (m_transport->ReceivedMessageComplete()) {
        CNetMessage msg = m_transport->GetReceivedMessage(time, reject_message);
        ...
        vRecvMsg.push_back(std::move(msg));
        complete = true;
    }
}
```

`ReceivedBytes` consumes bytes off the front of the span (trimming it in-place). The loop is important: a single `recv()` might contain more than one complete message, so parsing continues until the buffer is drained. Each completed message lands in `vRecvMsg`, a staging list on `CNode`.

Back in `SocketHandlerConnected`, if `complete` was set:

```cpp
pnode->MarkReceivedMsgsForProcessing();
WakeMessageHandler();
```

---

### Stage 3 — Transport parsing (V1): `V1Transport::ReceivedBytes` (`src/net.h:434`)

`V1Transport` implements a two-state machine via the `in_data` flag:

```cpp
bool ReceivedBytes(std::span<const uint8_t>& msg_bytes) override {
    LOCK(m_recv_mutex);
    int ret = in_data ? readData(msg_bytes) : readHeader(msg_bytes);
    if (ret < 0) Reset(); else msg_bytes = msg_bytes.subspan(ret);
    return ret >= 0;
}
```

**`readHeader` (`src/net.cpp:739`):** Accumulates bytes into a 24-byte `hdrbuf`. Once `nHdrPos == HEADER_SIZE`, it deserializes a `CMessageHeader`, validates the 4-byte network magic, rejects payloads larger than `MAX_PROTOCOL_MESSAGE_LENGTH` (4 MB), then sets `in_data = true`.

**`readData` (`src/net.cpp:782`):** Appends bytes into a `DataStream vRecv`, running a rolling SHA256 hasher in parallel, until `nDataPos == hdr.nMessageSize`.

**`ReceivedMessageComplete`** checks `in_data && hdr.nMessageSize == nDataPos`.

**`GetReceivedMessage` (`src/net.cpp:809`):** Validates the checksum (double-SHA256 of payload vs `hdr.pchChecksum`), validates the message-type string, fills `msg.m_type` from the 12-byte null-padded command field, moves `vRecv` into the `CNetMessage`, then calls `Reset()` to prepare for the next message.

---

### Stage 3 (alternate) — Transport parsing (V2 / BIP324): `V2Transport::ReceivedBytes` (`src/net.cpp:1330`)

For encrypted connections the transport is a multi-state machine: `KEY_MAYBE_V1` → `KEY` → `GARB_GARBTERM` → `VERSION` → `APP` → `APP_READY`. During the handshake states it processes ECDH key material and garbage. In the `APP` state, `ProcessReceivedPacketBytes()` ChaCha20-Poly1305-decrypts and authenticates each BIP324 packet. When decryption completes and the packet is validated, the state flips to `APP_READY`, at which point `ReceivedMessageComplete()` returns true. The message type is extracted later by `GetMessageType()` from the decrypted payload header byte. If the first 16 bytes look like a V1 magic header, the transport falls back to `m_v1_fallback.ReceivedBytes()`.

---

### Stage 4 — Move to the processing queue: `CNode::MarkReceivedMsgsForProcessing` (`src/net.cpp:4093`)

```cpp
LOCK(m_msg_process_queue_mutex);
m_msg_process_queue.splice(m_msg_process_queue.end(), vRecvMsg);
m_msg_process_queue_size += nSizeAdded;
fPauseRecv = m_msg_process_queue_size > m_recv_flood_size;
```

`vRecvMsg` (written by the socket thread under `cs_vRecv`) is spliced atomically into `m_msg_process_queue` (consumed by the message thread under `m_msg_process_queue_mutex`). The two locks are distinct, which is the key to decoupling the two threads. `fPauseRecv` provides backpressure: if the queue grows too large, the socket thread stops reading.

---

### Stage 5 — Message-handler thread picks up: `CConnman::ThreadMessageHandler` (`src/net.cpp:3193`)

This thread holds `NetEventsInterface::g_msgproc_mutex` for its entire lifetime — a global mutex that serializes all message processing. It shuffles the peer list each iteration (to prevent ordering attacks), then for each peer calls:

```cpp
bool fMoreNodeWork{m_msgproc->ProcessMessages(*pnode, flagInterruptMsgProc)};
```

`m_msgproc` is the `PeerManagerImpl`. If `ProcessMessages` returns `true` (more work pending), the thread loops immediately instead of sleeping.

---

### Stage 6 — Pop one message and dispatch: `PeerManagerImpl::ProcessMessages` (`src/net_processing.cpp:5141`)

```cpp
auto poll_result{node.PollMessage()};
CNetMessage& msg{poll_result->first};

TRACEPOINT(net, inbound_message, ...);   // USDT hook for external observers

ProcessMessage(peer, node, msg.m_type, msg.m_recv, msg.m_time, interruptMsgProc);
```

`PollMessage` (`src/net.cpp:4110`) atomically pops one `CNetMessage` from the front of `m_msg_process_queue` and returns whether more remain. The USDT tracepoint fires here, before any handler logic, making this the single chokepoint where external tools can observe every inbound message.

---

### Stage 7 — Type dispatch: `PeerManagerImpl::ProcessMessage` (`src/net_processing.cpp:3603`)

This is a single large function. There is no function-pointer table, no vtable, no visitor — just a cascade of string comparisons:

```cpp
if (msg_type == NetMsgType::VERSION) {
    // version handshake logic ...
} else if (msg_type == NetMsgType::VERACK) {
    // ...
} else if (msg_type == NetMsgType::ADDR || msg_type == NetMsgType::ADDRV2) {
    // ...
} else if (msg_type == NetMsgType::INV) {
    // ...
} else if (msg_type == NetMsgType::TX) {
    // ...
} // ... etc. for every message type Bitcoin Core knows
```

`msg.m_type` is the string extracted from the wire header in Stage 3 (`hdr.GetMessageType()` for V1, or the decrypted type byte for V2). The matching branch deserializes `msg.m_recv` (a `DataStream`) directly and runs the handler inline.

---

### Summary of the call chain

```
ThreadSocketHandler
  └─ CConnman::SocketHandlerConnected          [socket thread]
       └─ m_sock->Recv()                        raw syscall
       └─ CNode::ReceiveMsgBytes()
            └─ m_transport->ReceivedBytes()     V1: readHeader / readData
            └─ m_transport->ReceivedMessageComplete()
            └─ m_transport->GetReceivedMessage() → CNetMessage → vRecvMsg
       └─ CNode::MarkReceivedMsgsForProcessing() vRecvMsg → m_msg_process_queue
       └─ CConnman::WakeMessageHandler()        condvar signal

ThreadMessageHandler
  └─ PeerManagerImpl::ProcessMessages()        [msg thread, holds g_msgproc_mutex]
       └─ CNode::PollMessage()                  dequeues one CNetMessage
       └─ PeerManagerImpl::ProcessMessage()
            └─ if (msg_type == "version") { ... }
            └─ else if (msg_type == "inv") { ... }
            └─ ... per-type handler logic runs inline
```

The two-queue design (`vRecvMsg` → `m_msg_process_queue`) with separate locks lets the socket thread keep reading at full speed without blocking on the message thread's processing time.


## Final answer

_Result event — success, 190 s, 27 turns._

I now have all the pieces. Here is the complete end-to-end trace.

---

## How an inbound message flows from socket bytes to handler

There are three distinct thread roles involved. The socket-handler thread owns the read side. The message-handler thread owns the process side. They hand off through a shared queue.

---

### Stage 1 — Raw socket read: `CConnman::SocketHandlerConnected` (`src/net.cpp:2147`)

`ThreadSocketHandler` runs a tight loop calling `SocketHandler` → `SocketHandlerConnected` for every connected peer. When `poll`/`select` marks a socket readable:

```cpp
uint8_t pchBuf[0x10000];   // 64 KiB stack buffer
nBytes = pnode->m_sock->Recv(pchBuf, sizeof(pchBuf), MSG_DONTWAIT);
```

A single `recv()` syscall dumps up to 64 KiB of wire bytes into that stack buffer. The span `{pchBuf, nBytes}` is then passed directly to `CNode::ReceiveMsgBytes`.

---

### Stage 2 — Feed bytes to the transport: `CNode::ReceiveMsgBytes` (`src/net.cpp:668`)

This function is the bridge between raw bytes and protocol messages. It holds `cs_vRecv` and loops until the input span is empty:

```cpp
while (msg_bytes.size() > 0) {
    if (!m_transport->ReceivedBytes(msg_bytes)) return false; // transport parse error
    if (m_transport->ReceivedMessageComplete()) {
        CNetMessage msg = m_transport->GetReceivedMessage(time, reject_message);
        ...
        vRecvMsg.push_back(std::move(msg));
        complete = true;
    }
}
```

`ReceivedBytes` consumes bytes off the front of the span (trimming it in-place). The loop is important: a single `recv()` might contain more than one complete message, so parsing continues until the buffer is drained. Each completed message lands in `vRecvMsg`, a staging list on `CNode`.

Back in `SocketHandlerConnected`, if `complete` was set:

```cpp
pnode->MarkReceivedMsgsForProcessing();
WakeMessageHandler();
```

---

### Stage 3 — Transport parsing (V1): `V1Transport::ReceivedBytes` (`src/net.h:434`)

`V1Transport` implements a two-state machine via the `in_data` flag:

```cpp
bool ReceivedBytes(std::span<const uint8_t>& msg_bytes) override {
    LOCK(m_recv_mutex);
    int ret = in_data ? readData(msg_bytes) : readHeader(msg_bytes);
    if (ret < 0) Reset(); else msg_bytes = msg_bytes.subspan(ret);
    return ret >= 0;
}
```

**`readHeader` (`src/net.cpp:739`):** Accumulates bytes into a 24-byte `hdrbuf`. Once `nHdrPos == HEADER_SIZE`, it deserializes a `CMessageHeader`, validates the 4-byte network magic, rejects payloads larger than `MAX_PROTOCOL_MESSAGE_LENGTH` (4 MB), then sets `in_data = true`.

**`readData` (`src/net.cpp:782`):** Appends bytes into a `DataStream vRecv`, running a rolling SHA256 hasher in parallel, until `nDataPos == hdr.nMessageSize`.

**`ReceivedMessageComplete`** checks `in_data && hdr.nMessageSize == nDataPos`.

**`GetReceivedMessage` (`src/net.cpp:809`):** Validates the checksum (double-SHA256 of payload vs `hdr.pchChecksum`), validates the message-type string, fills `msg.m_type` from the 12-byte null-padded command field, moves `vRecv` into the `CNetMessage`, then calls `Reset()` to prepare for the next message.

---

### Stage 3 (alternate) — Transport parsing (V2 / BIP324): `V2Transport::ReceivedBytes` (`src/net.cpp:1330`)

For encrypted connections the transport is a multi-state machine: `KEY_MAYBE_V1` → `KEY` → `GARB_GARBTERM` → `VERSION` → `APP` → `APP_READY`. During the handshake states it processes ECDH key material and garbage. In the `APP` state, `ProcessReceivedPacketBytes()` ChaCha20-Poly1305-decrypts and authenticates each BIP324 packet. When decryption completes and the packet is validated, the state flips to `APP_READY`, at which point `ReceivedMessageComplete()` returns true. The message type is extracted later by `GetMessageType()` from the decrypted payload header byte. If the first 16 bytes look like a V1 magic header, the transport falls back to `m_v1_fallback.ReceivedBytes()`.

---

### Stage 4 — Move to the processing queue: `CNode::MarkReceivedMsgsForProcessing` (`src/net.cpp:4093`)

```cpp
LOCK(m_msg_process_queue_mutex);
m_msg_process_queue.splice(m_msg_process_queue.end(), vRecvMsg);
m_msg_process_queue_size += nSizeAdded;
fPauseRecv = m_msg_process_queue_size > m_recv_flood_size;
```

`vRecvMsg` (written by the socket thread under `cs_vRecv`) is spliced atomically into `m_msg_process_queue` (consumed by the message thread under `m_msg_process_queue_mutex`). The two locks are distinct, which is the key to decoupling the two threads. `fPauseRecv` provides backpressure: if the queue grows too large, the socket thread stops reading.

---

### Stage 5 — Message-handler thread picks up: `CConnman::ThreadMessageHandler` (`src/net.cpp:3193`)

This thread holds `NetEventsInterface::g_msgproc_mutex` for its entire lifetime — a global mutex that serializes all message processing. It shuffles the peer list each iteration (to prevent ordering attacks), then for each peer calls:

```cpp
bool fMoreNodeWork{m_msgproc->ProcessMessages(*pnode, flagInterruptMsgProc)};
```

`m_msgproc` is the `PeerManagerImpl`. If `ProcessMessages` returns `true` (more work pending), the thread loops immediately instead of sleeping.

---

### Stage 6 — Pop one message and dispatch: `PeerManagerImpl::ProcessMessages` (`src/net_processing.cpp:5141`)

```cpp
auto poll_result{node.PollMessage()};
CNetMessage& msg{poll_result->first};

TRACEPOINT(net, inbound_message, ...);   // USDT hook for external observers

ProcessMessage(peer, node, msg.m_type, msg.m_recv, msg.m_time, interruptMsgProc);
```

`PollMessage` (`src/net.cpp:4110`) atomically pops one `CNetMessage` from the front of `m_msg_process_queue` and returns whether more remain. The USDT tracepoint fires here, before any handler logic, making this the single chokepoint where external tools can observe every inbound message.

---

### Stage 7 — Type dispatch: `PeerManagerImpl::ProcessMessage` (`src/net_processing.cpp:3603`)

This is a single large function. There is no function-pointer table, no vtable, no visitor — just a cascade of string comparisons:

```cpp
if (msg_type == NetMsgType::VERSION) {
    // version handshake logic ...
} else if (msg_type == NetMsgType::VERACK) {
    // ...
} else if (msg_type == NetMsgType::ADDR || msg_type == NetMsgType::ADDRV2) {
    // ...
} else if (msg_type == NetMsgType::INV) {
    // ...
} else if (msg_type == NetMsgType::TX) {
    // ...
} // ... etc. for every message type Bitcoin Core knows
```

`msg.m_type` is the string extracted from the wire header in Stage 3 (`hdr.GetMessageType()` for V1, or the decrypted type byte for V2). The matching branch deserializes `msg.m_recv` (a `DataStream`) directly and runs the handler inline.

---

### Summary of the call chain

```
ThreadSocketHandler
  └─ CConnman::SocketHandlerConnected          [socket thread]
       └─ m_sock->Recv()                        raw syscall
       └─ CNode::ReceiveMsgBytes()
            └─ m_transport->ReceivedBytes()     V1: readHeader / readData
            └─ m_transport->ReceivedMessageComplete()
            └─ m_transport->GetReceivedMessage() → CNetMessage → vRecvMsg
       └─ CNode::MarkReceivedMsgsForProcessing() vRecvMsg → m_msg_process_queue
       └─ CConnman::WakeMessageHandler()        condvar signal

ThreadMessageHandler
  └─ PeerManagerImpl::ProcessMessages()        [msg thread, holds g_msgproc_mutex]
       └─ CNode::PollMessage()                  dequeues one CNetMessage
       └─ PeerManagerImpl::ProcessMessage()
            └─ if (msg_type == "version") { ... }
            └─ else if (msg_type == "inv") { ... }
            └─ ... per-type handler logic runs inline
```

The two-queue design (`vRecvMsg` → `m_msg_process_queue`) with separate locks lets the socket thread keep reading at full speed without blocking on the message thread's processing time.

