# Integration Guide — JiuwenSwarm Channel

**Status:** Study / preparation (integration happens at a later stage).

This document maps the **jiuwenswarm-browser** extension onto the JiuwenSwarm
server codebase so the two can be unified as a new channel. It records how the
server organizes channels, how the extension already speaks that protocol, and
the concrete alignment points that must be reconciled at copy-in time.

---

## 1. How JiuwenSwarm organizes channels

The server (`jiuwenswarm/`) routes all messaging through a unified gateway at
`jiuwenswarm/gateway/`.

### Channel layer — `gateway/channel_manager/`

- `base.py` — `ChannelMetadata`, `RobotMessageRouter` (the publish bus), `ConnectHook`.
- `im_platforms/` — outbound IM channels (feishu, dingtalk, wecom, telegram,
  whatsapp, discord, slack, wechat, xiaoyi).
- `protocol/` — ACP, A2A, SSH.
- `tui/` — terminal channel.
- `web/` — the **WebSocket channel** that serves the web frontend **and** is the
  same endpoint a browser extension connects to.

### The WebChannel — `web/web_connect.py`

The `WebChannel` class (port **19000**, path **`/ws`**) is a WebSocket JSON-RPC
channel. This is the surface a browser extension reuses — it needs no new server
listener.

- Frame types: `req` (client→server), `res` (server→client reply), `event`
  (server→client push). Extended with coalescing of contiguous `chat.delta` /
  `chat.reasoning` frames.
- Request methods are dispatched two ways:
  1. Every `req` is first published to the message bus
     (`bus.publish_user_messages`) — the IM/`MessageHandler` pipeline.
  2. Then matched against `register_method(method, handler)` registrations made
     in `web/app_web_handlers.py`; unknown methods get `METHOD_NOT_FOUND`.
- Per-connection routing keys derive from **query params** at handshake:
  `app_id` (default `"default"`), `mode` (default `"agent"`), `agent_id`
  (default `"default"`), `session_id`, and an optional `user_id`/`X-User-Id`
  header. Outbound `event`s are routed to the correct connection via this key.
- The channel has its own fixed `channel_id = "web"` — a client's `channel_id`
  field in a `req` body is **ignored** (the server uses its own identity).
- WebSocket Origin validation exists but is opt-in via env
  `JIUWENSWARM_ENABLE_ORIGIN_CHECK=1` and an allowlist
  `JIUWENSWARM_WS_ALLOWED_ORIGIN_HOSTS`.

### Message protocol — `common/schema/message.py`

- `ReqMethod` — inbound client→server request names (e.g. `chat.send`,
  `session.list`, `session.create`, `session.switch`).
- `EventType` — outbound server→client events (e.g. `chat.delta`, `chat.final`,
  `chat.tool_call`, `chat.tool_result`, `connection.ack`, `chat.error`).
- `Mode` — agent operating modes.

### Channel registration / config

Channels are enabled via config (`config.yaml`, `enabled: true`). The web
channel config lives in `WebChannelConfig` (`web_connect.py`): host, port,
path, `allow_from`, `dual_protocol`.

---

## 2. How the extension already maps onto it

The extension is a pure **client** of the WebChannel protocol. Everything it
needs already exists on the server; the server's role is unchanged.

| Extension side | Server surface |
|---|---|
| `WsClient.ts` connects to `ws://127.0.0.1:19000/ws` | `WebChannel` / `WebChannelConfig` (port 19000, path `/ws`) |
| Sends `{type:"req", id, channel_id:"browser", method, params, timestamp}` | `WebChannel._handle_raw_message` (the `channel_id` field is ignored) |
| Consumes `res` frames | `WebChannel.send_response` |
| Consumes `event` frames (`connection.ack`, `chat.delta`, `chat.final`, `chat.error`, `chat.tool_call`, `pong`) | `WebChannel.send_event` / `_serialize_frame` |
| `session.list` / `session.create` / `session.switch` | Registered handlers / message-bus dispatch |
| `chat.send` | Registered `_chat_send` handler + message-bus dispatch |

So the extension and the server are **wire-compatible by construction** — the
extension was modeled on the same gateway protocol the web frontend uses.

---

## 3. Alignment points to reconcile at copy-in

These are the concrete things to decide when integrating. None block the
current standalone extension (which talks to its own expectations of the
server), but they must be resolved before declaring it "a JiuwenSwarm channel".

### 3.1 Tool-result delivery (most important)

- The extension's `ToolDispatcher.ts` sends browser-tool results as a **request**:
  `this._client.send("chat.tool_result", { call_id, result, session_id })`.
- In JiuwenSwarm, `chat.tool_result` is declared as an **`EventType`** (server→
  client), **not** a `ReqMethod`. `_parse_req_method("chat.tool_result")` returns
  `None`, there is no `register_method("chat.tool_result", …)`, and the
  message-bus pipeline only special-cases `chat.send`.
- **Implication:** as wired today, the gateway would answer the extension's
  `chat.tool_result` request with `METHOD_NOT_FOUND` — the agent's pending tool
  call would never resolve.

**Decision needed at integration time (pick one):**
1. **Server-side:** add an inbound `chat.tool_result` handler that forwards the
   result to the target AgentServer (E2A), analogous to how the agent receives
   tool responses — then keep the extension unchanged.
2. **Extension-side:** match however the web/IDE frontend delivers tool results
   (the web frontend does *not* send `chat.tool_result` as a req; it renders the
   event). This may require a different flow where the agent tool is executed
   server-side rather than in the browser.

> Verify against the current web/IDE tool-dispatch flow before choosing. This is
> the single largest integration risk.

### 3.2 Channel identity

- The extension sends `channel_id: "browser"` in every `req` body (now centralized
  in `src/shared/protocol.ts` via `makeRequest`), but the server ignores it (uses
  `"web"`). Session/telemetry therefore cannot tell a browser-channel request from
  a web-frontend request.
- The extension's `WS_URL` now attaches `?app_id=<APP_ID>` on the handshake, where
  `APP_ID` lives in `src/shared/constants.ts` and currently defaults to `"default"`.
  This matches the web channel / server default so **session sharing keeps working**.
- **At integration time:** flip `APP_ID` to `"browser"` (the gateway reads it from
  the handshake query and routes/scopes this client distinctly), and/or add a real
  `channel_id = "browser"` handling on the server.

### 3.3 Method/event coverage check

Confirmed available on the server for the methods the extension calls. The names
are centralized in `GW_METHOD` / `GW_EVENT` in `src/shared/protocol.ts`, mirroring
the server's `ReqMethod` / `EventType`:

| Extension method | Server support |
|---|---|
| `session.list` | ✅ `register_method` (app_web_handlers.py) |
| `session.create` | ✅ `register_method` |
| `session.switch` | ✅ via message-bus (`ReqMethod.SESSION_SWITCH`) |
| `chat.send` | ✅ `register_method` + bus |
| `chat.tool_result` | ⚠️ **not a ReqMethod** — see 3.1 |

### 3.4 WebSocket Origin

- Chrome extension service-worker sockets generally send no meaningful `Origin`.
- Origin check is **off by default**, so this is a non-issue today. If a deployment
  enables `JIUWENSWARM_ENABLE_ORIGIN_CHECK`, the browser channel must be added to
  `JIUWENSWARM_WS_ALLOWED_ORIGIN_HOSTS` (or the check must exempt extension
  sockets).

### 3.5 Distribution / serving the extension

- The web channel serves its own frontend `dist` via `app_web.py`. To ship the
  extension "as part of JiuwenSwarm", the built extension (`dist/` or the
  `.zip`) should be served/downloadable from the web channel or a documented
  release artifact, with the settings page pointing at the server host/port
  (default 19000).

---

## 4. Recommended integration steps (for the later copy-in)

1. **Decide tool-result flow** (§3.1) — this drives everything else.
2. **Add a browser channel identity** at handshake (`app_id=browser`) and, if
   telemetry matters, a real `channel_id = "browser"` on the server.
3. **Register/serve the extension artifact** from the product (download from the
   web channel; auto-configure the default host/port).
4. **Verify** the 5 method calls and the event mapping end-to-end against the
   current gateway.
5. **Move code** into the monorepo (`channels/` for a small server-side adapter if
   needed; the extension itself stays a separately-built frontend package), and
   document in the product's channel docs.

---

## 5. Open questions

- How does the current web/IDE frontend actually resolve agent tool calls in the
  browser? (drives §3.1)
- Should the extension be a first-class `channel_id` or just an `app_id` variant
  of the web channel? (§3.2)
- Is a server-side adapter desired, or should the extension remain a pure client
  that only needs origin/config allowances? (determines how much server code moves)
