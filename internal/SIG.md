# System Investigation — jiuwenswarm-browser

**Related document:** `RAT.md` — product requirements and business background.
This document covers architecture, decomposition, sequence diagrams, technical
constraints, system impact, and external dependencies.

---

## Feature Scope

`jiuwenswarm-browser` is a Chrome extension (Manifest V3) that embeds JiuwenSwarm as
a persistent side panel inside the browser. It has three runtime layers:

1. **Content script** — injected into every page; extracts text, monitors selection,
   responds to agent highlight/scroll/fill commands.

2. **Background service worker** — central hub; maintains the WebSocket connection to
   the local JiuwenSwarm server, manages session state, caches extracted page context,
   and dispatches browser-native agent tool calls.

3. **Side panel UI** — the user's interaction surface; chat with the agent, session
   switching, pinned-page context bar, and session export/import/templates.

All three layers connect via Chrome's `chrome.runtime` message-passing APIs. The
extension communicates with JiuwenSwarm exclusively via the same WebSocket gateway
protocol used by the IDE plugin and web app — no new server-side changes are required.

---

## Architecture

```
           ┌───────────────────────────────────────────────────────────────┐
           │                    Browser tabs (any URL)                      │
           │         article · GitHub · arXiv · SEC · PubMed               │
           │         Wikipedia · YouTube · Twitter · HackerNews · generic   │
           └─────────────────────┬─────────────────────────────────────────┘
                                 │ DOM access
           ┌─────────────────────▼─────────────────────────────────────────┐
           │     Content script  (injected into every page, document_idle)  │
           │                                                                │
           │  PageTypeDetector ──► adapters/ (9 adapters)                  │
           │  Extractor  ─────────────────────────────────► PageContext     │
           │  SelectionMonitor                                              │
           │  Annotator                                                     │
           │  FormAssist                                                    │
           │  scroll_to listener                                            │
           └─────────────────────┬─────────────────────────────────────────┘
                                 │ chrome.runtime.sendMessage / onMessage
           ┌─────────────────────▼─────────────────────────────────────────┐
           │     Background service worker  (MV3, non-persistent)           │
           │                                                                │
           │  WsClient ────────────────────────────────────── WebSocket     │
           │  SessionManager                                         │       │
           │  ContextCache                                           │       │
           │  TabWatcher                                             ▼       │
           │  ContextMenu                                   JiuwenSwarm     │
           │  ToolDispatcher ◄──── tool_call envelope       (local server)  │
           │        │                                                       │
           │        └──────────────────── tool_result ───► WsClient        │
           └─────────────────────┬─────────────────────────────────────────┘
                                 │ chrome.runtime Port "sidepanel"
           ┌─────────────────────▼─────────────────────────────────────────┐
           │     Side panel  (chrome.sidePanel, requires Chrome 114+)       │
           │                                                                │
            │  ChatBridge     ── port management, jiuwen:bg event dispatch   │
            │  SessionPicker  ── session dropdown                            │
            │  ContextBar     ── pinned-page chips with quality signals      │
            │  SessionExporter── export JSON / MD, import, templates        │
            │  chat/markdown  ── rendering helpers                           │
            │  reader/tour/privacy/search ── focused UI modules             │
            │  index.ts       ── wiring + streaming chat state              │
           └────────────────────────────────────────────────────────────────┘
```

### Design principles

**Server is the single source of truth for sessions.**
Sessions are created, listed, and stored by the JiuwenSwarm server. The extension
stores only two things locally: the active-session pointer (`chrome.storage.local`) and
pinned-page metadata (extracted text, URL, page type). This means sessions created in
the extension appear in the web app immediately, and vice versa.

**Content script is stateless.**
The content script does not persist anything. It reads the page and responds to
commands. All state (cache, session pointer, pinned pages) lives in the background.

**Background is the sole WebSocket owner.**
Only the background service worker holds the WebSocket connection. The side panel and
popup communicate with the server exclusively through the background via
`chrome.runtime` port messaging. This prevents multiple open connections and keeps
authentication and reconnection logic in one place.

**Protocol reuse.**
The WebSocket message format (envelopes with `type`, `session_id`, `payload`) is
identical to the one used by the IDE plugin. `chat.html` is shared unchanged with the
JupyterLab extension. No new server protocol surface is introduced.

---

## Module layout

```
jiuwenswarm-browser/
├── src/
│   ├── shared/                     Shared types, protocol, constants, storage, logger
│   │   ├── constants.ts            DEFAULT_HOST, DEFAULT_PORT, CHANNEL_ID, STORAGE_KEYS,
│   │   │                           MAX_PINNED_PAGES, MAX_CONTEXT_CHARS, COMMANDS, MSG
│   │   ├── types.ts                AgentMode, PageMeta, PageContext, PinnedPage,
│   │   │                           ResearchSession, ExtensionSettings, ExtMessage union
│   │   ├── protocol.ts             WsRequest, InboundEnvelope, all payload types,
│   │   │                           OutboundMsgType, InboundMsgType, ToolCallPayload
│   │   ├── storage.ts              chrome.storage.local typed wrappers:
│   │   │                           active session pointer, pinned pages, settings
│   │   └── logger.ts               createLogger(prefix) — wraps console with a name tag
│   │
│   ├── background/                 MV3 service worker (non-persistent)
│   │   ├── index.ts                Singleton init; message routing; port management;
│   │   │                           keyboard command handling; tool_call interception
│   │   ├── WsClient.ts             WebSocket client with exponential-backoff reconnect;
│   │   │                           pending-request registry; InboundEnvelope dispatch
│   │   ├── SessionManager.ts       Session list cache; active-session pointer;
│   │   │                           create/list/switch; listener pattern
│   │   ├── ContextCache.ts         In-memory ephemeral cache: tabId → PageContext;
│   │   │                           aggregate() merges contexts with a char budget
│   │   ├── TabWatcher.ts           chrome.tabs.onUpdated / onRemoved; triggers
│   │   │                           re-extraction on navigation; evicts stale cache
│   │   ├── ContextMenu.ts          Registers 3 right-click items on install;
│   │   │                           clears stale items on wake
│   │   └── ToolDispatcher.ts       Dispatches 8 browser-native tools on tool_call;
│   │                               always sends tool_result back via WsClient
│   │
│   ├── content/                    Injected into every page (document_idle, all_urls)
│   │   ├── index.ts                Entry point: startSelectionMonitor, startAnnotator,
│   │   │                           startFormAssist, scroll_to listener, pushContext
│   │   ├── Extractor.ts            Orchestrates PageTypeDetector + adapters;
│   │   │                           applies head+tail truncation at 120,000 chars
│   │   ├── PageTypeDetector.ts     URL/DOM pattern matching → pageType string
│   │   ├── SelectionMonitor.ts     document.onselectionchange → sends to background
│   │   ├── Annotator.ts            Applies / clears colored overlays on DOM elements
│   │   ├── FormAssist.ts           Locates form fields by label/placeholder/name; fills
│   │   └── adapters/               Page-type-specific extraction
│   │       ├── github.ts           README, issue/PR body, comments, repo description
│   │       ├── arxiv.ts            Title, authors, abstract, full paper text
│   │       ├── sec.ts              10-K/10-Q/8-K body; filing content
│   │       ├── pubmed.ts           Abstract, full PMC text, authors, MeSH terms
│   │       ├── wikipedia.ts        Lead + article body; navboxes/references stripped
│   │       ├── youtube.ts          Title, channel, description, transcript (if available)
│   │       ├── twitter.ts          Thread text with quoted tweets; multi-reply support
│   │       ├── hackernews.ts       Submission title/URL; top-level comments; front page
│   │       └── (generic)           Readability.js fallback — used by Extractor directly
│   │
│   ├── sidepanel/                  Side panel UI
│   │   ├── sidepanel.html          HTML shell: header (session label, + New, ⋯), session
│   │   │                           picker, context bar, chat area, new-session form,
│   │   │                           session-actions menu, hidden file import input
│   │   ├── index.ts                Wiring: DOM bindings, jiuwen:bg event handler,
│   │   │                           native streaming chat orchestration + state,
│   │   │                           new-session form, session-actions menu
│   │   ├── ChatBridge.ts           chrome.runtime Port "sidepanel"; reconnects on wake;
│   │   │                           bridges UI actions to background; dispatches jiuwen:bg
│   │   ├── chat.ts                 Pure chat-rendering helpers (formatTime, addTurnDivider,
│   │   │                           addMessageFooter, appendSources, renderToolStatus, humanizeError)
│   │   ├── markdown.ts             renderMarkdown (marked + DOMPurify + sanitize)
│   │   ├── SessionPicker.ts        Dropdown rendering; session click → onSelect callback
│   │   ├── ContextBar.ts           Chip rendering with ⚠ / PDF badge / retry / unpin
│   │   ├── SessionExporter.ts      SESSION_TEMPLATES (3); exportSessionJson,
│   │   │                           exportSessionMarkdown, importSessionJson
│   │   ├── reader.ts               Agent-view (read_page) modal: openReader + back binding
│   │   ├── tour.ts                 First-run tour: openTour, maybeShowTour + its DOM/bindings
│   │   ├── privacy.ts              Privacy disclosure modal: openPrivacy + its close binding
│   │   └── search.ts               Full-text search across pinned pages: openSearch + its DOM
│   │
│   ├── popup/                      Toolbar popup (connection status + quick actions)
│   │   ├── popup.html
│   │   └── index.ts
│   │
│   ├── options/                    Extension settings page
│   │   ├── options.html
│   │   └── index.ts
│   │
│   └── webview/
│       └── chat.html               Canonical shared chat UI (shared with jiuwenswarm-jupyterlab);
│                                   declared as a web-accessible resource in manifest.json
│
├── docs/
├── manifest.json                   MV3 manifest; permissions, commands, host_permissions
├── package.json                    vite build; @mozilla/readability, nanoid dependencies
└── README.md
```

---

## Key Sequence Diagrams

### 1. Pin current tab — Ctrl+Shift+P

The most common path. Works from any browser tab.

```
User           background/index.ts   content/index.ts   ContextCache    storage.ts
  │                   │                     │                 │               │
  │  Ctrl+Shift+P     │                     │                 │               │
  │───────────────────►                     │                 │               │
  │  (chrome.commands │                     │                 │               │
  │   "pin-page")     │                     │                 │               │
  │                   │  sendMessage(MSG.PAGE_CONTEXT, tabId) │               │
  │                   │────────────────────►│                 │               │
  │                   │                     │  PageTypeDetector.detect()      │
  │                   │                     │  adapters[type].extract()       │
  │                   │                     │  Extractor.truncate(120000)     │
  │                   │◄── PageContext ──────│                 │               │
  │                   │                     │                 │               │
  │                   │  cache.set(tabId, ctx)                │               │
  │                   │──────────────────────────────────────►│               │
  │                   │                     │                 │               │
  │                   │  create PinnedPage (nanoid, sessionId, tabId, ctx)    │
  │                   │  addPinnedPage(page)                  │               │
  │                   │───────────────────────────────────────────────────────►
  │                   │                     │                 │               │
  │                   │  broadcast "pinned" to sidepanel port │               │
  │◄── chip appears ──│                     │                 │               │
  │  in context bar   │                     │                 │               │
```

---

### 2. User sends a chat message

```
User (sidepanel)   index.ts      ChatBridge.ts   background/index.ts   WsClient.ts   JiuwenSwarm
       │               │              │                   │                  │             │
       │  type + Enter │              │                   │                  │             │
       │──────────────►│              │                   │                  │             │
       │               │  sendMessage │                   │                  │             │
       │               │  (SEND_AGENT,│                   │                  │             │
       │               │  text, mode) │                   │                  │             │
       │               │─────────────►                    │                  │             │
       │               │              │  port.postMessage │                  │             │
       │               │              │──────────────────►│                  │             │
       │               │              │                   │  aggregate pinned page context │
       │               │              │                   │  (ContextCache.aggregate)      │
       │               │              │                   │                  │             │
       │               │              │                   │  WsClient.send(chat envelope)  │
       │               │              │                   │─────────────────►│             │
       │               │              │                   │                  │  ws.send()  │
       │               │              │                   │                  │────────────►│
       │               │              │                   │                  │             │
       │               │              │                   │                  │  stream     │
       │               │              │                   │                  │◄── token ───│
       │               │              │                   │◄── onEvent ──────│             │
       │               │              │◄── port.postMessage "AGENT_EVENT"    │             │
       │               │◄─ jiuwen:bg  │                   │                  │             │
       │◄── text appended             │                   │                  │             │
       │   to chat area│              │                   │                  │             │
       │               │              │                   │                  │  done       │
       │               │              │                   │                  │◄────────────│
       │◄── stream ends│              │                   │                  │             │
       │   input re-enabled           │                   │                  │             │
```

---

### 3. Agent tool call — server → browser → result

```
JiuwenSwarm   WsClient.ts   background/index.ts   ToolDispatcher.ts   content/index.ts   WsClient.ts
      │             │                │                    │                    │                │
      │  tool_call  │                │                    │                    │                │
      │  envelope   │                │                    │                    │                │
      │────────────►│                │                    │                    │                │
      │             │  onEvent()     │                    │                    │                │
      │             │───────────────►│                    │                    │                │
      │             │                │  type === "tool_call"                   │                │
      │             │                │  toolDispatcher.dispatch(payload, sid)  │                │
      │             │                │───────────────────►│                    │                │
      │             │                │                    │                    │                │
      │             │                │          (example: scroll_to)           │                │
      │             │                │                    │  sendMessage(       │                │
      │             │                │                    │  MSG.SCROLL_TO,    │                │
      │             │                │                    │  {selector})       │                │
      │             │                │                    │───────────────────►│                │
      │             │                │                    │                    │  querySelector │
      │             │                │                    │                    │  scrollIntoView│
      │             │                │                    │◄── {ok: true} ─────│                │
      │             │                │                    │                    │                │
      │             │                │                    │  client.send(tool_result envelope)  │
      │             │                │                    │────────────────────────────────────►│
      │◄────────────────────────────────────────────────────────────────────────────────────── │
      │  result received             │                    │                    │                │
```

---

### 4. Session export (JSON)

```
User (sidepanel)  index.ts         SessionExporter.ts    storage.ts        Browser
       │              │                   │                    │               │
       │  click ⋯     │                   │                    │               │
       │  Export JSON  │                   │                    │               │
       │──────────────►│                   │                    │               │
       │               │  saExportJson     │                    │               │
       │               │  .click() handler │                    │               │
       │               │  exportSessionJson(activeSession)      │               │
       │               │──────────────────►│                    │               │
       │               │                   │  getPinnedPagesBySession(id)       │
       │               │                   │───────────────────►│               │
       │               │                   │◄── PinnedPage[] ───│               │
       │               │                   │                    │               │
       │               │                   │  build ExportPackage{              │
       │               │                   │    version:"1",    │               │
       │               │                   │    session,        │               │
       │               │                   │    pinnedPages,    │               │
       │               │                   │    exportedAt}     │               │
       │               │                   │                    │               │
       │               │                   │  _download(json, filename, mime)   │
       │               │                   │──────────────────────────────────►│
       │               │                   │                   URL.createObjectURL
       │◄── file saves │                   │                   anchor.click()   │
       │  to disk      │                   │                   URL.revokeObjectURL
```

---

## Component Breakdown

### `background/` — service worker

| Module | Responsibility |
|---|---|
| `index.ts` | Singleton init (WsClient, SessionManager, ContextCache, TabWatcher, ContextMenu, ToolDispatcher); `chrome.runtime.onConnect` port registry; `chrome.commands.onCommand` for keyboard shortcuts; `chrome.alarms` keep-alive; `tool_call` interception — routes to ToolDispatcher without forwarding to side panel |
| `WsClient.ts` | WebSocket client; exponential back-off reconnect (1 → 2 → 5 → 10 → 30 s); pending-request map with 15 s timeout; `send()` / `onEvent(fn)` subscriber pattern; fires `STATUS` change to all connected ports |
| `SessionManager.ts` | In-memory `_sessions: ResearchSession[]`; `_activeSessionId: string \| null` persisted via `chrome.storage.local`; `createSession(title, mode)` → RPC to server; `listSessions()` → server; `setActive(id)` → notifies listeners; `init()` restores pointer on wake |
| `ContextCache.ts` | `Map<number, PageContext>` keyed by tab ID; `set / get / delete`; `aggregate(tabIds, maxChars)` joins contexts with `--- [Title](URL) ---` headers, respects character budget |
| `TabWatcher.ts` | `chrome.tabs.onUpdated` (status:"complete") → `extractFromTab(tabId)`; `chrome.tabs.onRemoved` → `cache.delete(tabId)`; `extractFromTab()` returns cached ctx if age < 30 s, else sends `MSG.PAGE_CONTEXT` to content script |
| `ContextMenu.ts` | `chrome.contextMenus.removeAll()` on wake; registers "Ask about…", "Pin this page", "Summarize"; `chrome.contextMenus.onClicked` → sends action to side panel port |
| `ToolDispatcher.ts` | `dispatch(payload, sessionId)` — switch on `tool` name; wraps each tool in try/catch; always calls `client.send(tool_result envelope)`; for content-script tools (highlight, scroll, fill) uses `chrome.tabs.sendMessage`; for screenshot uses `chrome.tabs.captureVisibleTab` |

### `content/` — injected content script

| Module | Responsibility |
|---|---|
| `index.ts` | Entry point called once per page; starts `SelectionMonitor`, `Annotator`, `FormAssist`; registers `MSG.SCROLL_TO` listener; calls `pushContext()` when DOM ready (sends `MSG.PAGE_CONTEXT` to background proactively) |
| `Extractor.ts` | Calls `PageTypeDetector.detect()` → routes to the matching adapter or falls back to Readability; applies head+tail truncation at `MAX_CONTEXT_CHARS` (120,000); sets `originalLength` field |
| `PageTypeDetector.ts` | URL pattern + DOM signal matching → `pageType` string; checked in order: github, arxiv, sec, pubmed, wikipedia, youtube, twitter, hackernews, then generic |
| `SelectionMonitor.ts` | `document.addEventListener("selectionchange")` with 300 ms debounce; sends `MSG.SELECTION_TEXT` to background when non-empty |
| `Annotator.ts` | `MSG.HIGHLIGHT_TEXT` → wraps matching text ranges in `<mark data-jiuwen>` elements; `MSG.CLEAR_HIGHLIGHTS` → removes all such marks |
| `FormAssist.ts` | `MSG.FILL_FORM` → receives `{label, value}` pairs; finds `<input>` / `<textarea>` by label text, `aria-label`, `placeholder`, or `name`; dispatches `input` and `change` events after fill |
| `adapters/github.ts` | Extracts README (rendered text), issue/PR body + comments, repo description and language stats |
| `adapters/arxiv.ts` | Extracts title, authors, abstract; full paper text from PDF-as-HTML view if available |
| `adapters/sec.ts` | Extracts 10-K/10-Q/8-K filing body; strips XBRL and inline metadata |
| `adapters/pubmed.ts` | Extracts abstract, PMC full-text if available, authors, MeSH terms |
| `adapters/wikipedia.ts` | Extracts lead section + article body; removes navboxes, references, and "See also" sections |
| `adapters/youtube.ts` | Extracts title, channel, description; fetches auto-generated transcript from `ytInitialPlayerResponse` if present |
| `adapters/twitter.ts` | Extracts tweet thread text with quoted tweet text; follows multi-reply threads in DOM |
| `adapters/hackernews.ts` | Extracts submission title + URL; top-level comments from `#hnmain`; front-page link list if on index |

### `sidepanel/` — side panel UI

| Module | Responsibility |
|---|---|
| `sidepanel.html` | Layout shell; header row (session label, `+ New`, `⋯`); `#session-picker` dropdown; `#pin-chips` context bar; `#chat-messages` + `#chat-input` + `#chat-send`; `#new-session-form` with template/mode selects; `#session-actions-menu` dropdown; hidden `#import-input` file input |
| `index.ts` | Binds all DOM elements; handles `jiuwen:bg` CustomEvent switch (status, sessions, session_created, pinned, ask_selection, summarize_tab, token, done, error); native streaming chat orchestration + connection/stream state; new-session form + template auto-fill; ⋯ menu open/close; export/import handlers; `_pendingTemplateId` for post-create prompt injection |
| `ChatBridge.ts` | Opens and maintains `chrome.runtime` port named `"sidepanel"`; re-opens on disconnect; `sendChat(text, mode, tabId)` → posts `MSG.SEND_AGENT`; `setActiveSession(id)` → posts `MSG.SET_SESSION`; `createSession(title, mode)` → posts `MSG.NEW_SESSION`; `pinCurrentTab()` → posts `MSG.PIN_TAB`; all inbound messages re-dispatched as `CustomEvent("jiuwen:bg")` on `window` |
| `chat.ts` | Pure chat-rendering helpers: `formatTime`, `addTurnDivider(chatMessages, ts)`, `makeCopyIcon`, `addMessageFooter(el, text, ts)`, `appendSources(el, sessionId)`, `renderToolStatus(chatMessages, tool)`, `humanizeError` — take DOM/context as parameters (no module state) |
| `markdown.ts` | `renderMarkdown(text)` — marked → DOMPurify → sanitize; returns safe HTML string |
| `SessionPicker.ts` | Renders `<li>` per session; active session highlighted; `onSelect(id)` callback on click |
| `ContextBar.ts` | Renders one chip per `PinnedPage`; ⚠ red border + icon if `originalLength < 200`; **PDF** badge if `pageType === "pdf"`; ↻ retry button calls `onRetry(page)`; × unpin calls `onRemove(id)` |
| `SessionExporter.ts` | `SESSION_TEMPLATES` — 3 entries (company-research, paper-review, due-diligence); `getTemplate(id)` — lookup; `exportSessionJson(session)` — builds `ExportPackage`, downloads `.json`; `exportSessionMarkdown(session)` — renders `.md` with 800-char page previews; `importSessionJson(file, targetSessionId)` — parses `ExportPackage`, re-stamps all pages with `targetSessionId`, calls `addPinnedPage` per page |
| `reader.ts` | Agent-view modal: `openReader(title, text, url)` + own back-button binding; shown when the agent calls `read_page` |
| `tour.ts` | First-run tour: `openTour()`, `maybeShowTour()`; owns its own DOM refs and next/prev/skip button bindings |
| `privacy.ts` | Privacy disclosure modal: `openPrivacy()` + own close binding |
| `search.ts` | Full-text search across pinned pages: `openSearch(query?)` + own DOM refs and input/close bindings |

### `shared/` — cross-layer utilities

| Module | Responsibility |
|---|---|
| `constants.ts` | `DEFAULT_HOST`, `DEFAULT_PORT`, `CHANNEL_ID`, `WS_URL()`, `STORAGE_KEYS`, `MAX_PINNED_PAGES` (20), `MAX_CONTEXT_CHARS` (120,000), `COMMANDS`, `MSG` action map |
| `types.ts` | `AgentMode`, `PageMeta`, `PageContext`, `PinnedPage`, `ResearchSession`, `ExtensionSettings`, `DEFAULT_SETTINGS`, `ExtMessage` union |
| `protocol.ts` | `WsRequest`, `OutboundMsgType`, `InboundMsgType`, `InboundEnvelope`, `ChatParams`, `ToolResultParams`, `TokenPayload`, `DonePayload`, `ErrorPayload`, `ToolCallPayload`, `SessionsPayload`, `SessionCreatedPayload` |
| `storage.ts` | Typed `chrome.storage.local` wrappers: `loadActiveSessionId / saveActiveSessionId`, `loadPinnedPages / savePinnedPages / addPinnedPage / removePinnedPage / getPinnedPagesBySession`, `loadSettings / saveSettings` |
| `logger.ts` | `createLogger(prefix)` — `{info, warn, error}` wrapping `console.*` with a `[prefix]` tag; no-op in production builds |

---

## Technical Constraints

**MV3 service worker is not persistent.**
The background service worker terminates after ~30 seconds of inactivity. The WebSocket
connection is torn down on termination. `WsClient` detects the close and reconnects as
soon as the next message is sent or the alarm fires. Any `tool_call` arriving while the
service worker is asleep will be missed; the server should treat this as a timeout.

**Content scripts cannot access chrome:// or extension pages.**
`chrome://` pages (New Tab, Settings, Downloads) and pages at `chrome-extension://`
do not receive injected content scripts. Pin attempts on these pages are silently
dropped — the background receives no `PAGE_CONTEXT` response and times out.

**Binary PDFs are opaque to the content script.**
A PDF opened inline in Chrome is served at `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/…`
by the built-in PDF viewer. Content scripts are not injected into extension pages.
The `Extractor` returns a `PageContext` with `pageType:"pdf"` and empty `text`.
The **PDF** badge and ↻ retry button route the request to the server-side `read_pdf`
tool if available.

**chrome.sidePanel API requires Chrome 114+.**
`chrome.sidePanel.open()` and `chrome.sidePanel.setOptions()` were introduced in
Chrome 114. On older Chrome versions the side panel cannot be opened; keyboard
shortcuts and context-menu items have no effect.

**Screenshots require a focused, visible window.**
`chrome.tabs.captureVisibleTab(windowId, {format:"png"})` fails with a runtime error
if the window is minimised or the target tab is not the active tab in its window.
`ToolDispatcher._takeScreenshot()` catches the error and returns `{error: <message>}` as
the tool result.

**WebSocket only to localhost.**
`host_permissions` in `manifest.json` cover only `ws://127.0.0.1:*/*` and
`ws://localhost:*/*`. Connecting to a remote server requires a manifest change and
re-installation. This is intentional for privacy: all data stays on the user's machine.

**Context size cap and truncation strategy.**
Each pinned page is extracted and then truncated at `MAX_CONTEXT_CHARS` (120,000)
using a head+tail strategy: the first 80% of the budget and the last 20% are kept,
with a `[...truncated...]` marker at the cut. The combined context block passed to the
agent is not further capped by the extension; the JiuwenSwarm server enforces its own
token-level limit on the chat message.

**SPA navigation re-extraction.**
Single-page applications change the URL without a full page reload (`pushState`).
`TabWatcher` listens on `chrome.tabs.onUpdated` with `changeInfo.status === "complete"`.
SPAs often fire this event on the initial load only. The content script additionally
listens for `popstate` and `hashchange` events and calls `pushContext()` on navigation
within the same origin.

**Comm protocol version.**
The WebSocket envelope format (`type`, `session_id`, `payload`) must stay compatible
with the JiuwenSwarm server. If the server adds new `InboundMsgType` values not handled
by the extension, the unhandled events fall through the `switch` silently — no crash.

---

## Impact on Existing Systems

### JiuwenSwarm server

No server changes are required. The extension uses the existing WebSocket gateway
endpoint (`/ws`) with the established envelope protocol. `tool_call` / `tool_result`
were already part of the protocol for the IDE plugin.

### JiuwenSwarm web app

No web app changes are required. Sessions created by the extension are server-side
objects, visible in the web app's session list immediately.

### Existing JiuwenSwarm users

No impact. The extension is a separate distributable. Existing CLI, web app, and IDE
plugin users are unaffected.

### Browser performance

The content script runs at `document_idle` and does not block page rendering.
Extraction is synchronous DOM traversal. For very long pages (Wikipedia featured
articles, long arXiv papers) extraction may add 50–150 ms of script time after the
page is already interactive. The 120,000-character cap bounds both CPU time and memory.

### Security

No credentials are introduced by the extension. The WebSocket connection to localhost
does not require authentication (same trust model as the CLI and IDE plugin). No page
content is sent to any external server — the only network destination is `127.0.0.1`
(or `localhost`) at the configured port.

---

## External Dependencies

### Runtime (bundled)

| Package | Version | Purpose |
|---|---|---|
| `@mozilla/readability` | 0.5.0 | Generic article text extraction (fallback adapter) |
| `nanoid` | 5.0.0 | ID generation for `PinnedPage.id` and `ResearchSession.id` |

### Build only (dev dependencies)

| Package | Purpose |
|---|---|
| `typescript` | Type checking and compilation |
| `vite` | Bundler; separate configs for background (non-module SW) and content |
| `@types/chrome` | TypeScript definitions for Chrome Extension APIs |
| `@types/mozilla__readability` | TypeScript definitions for `@mozilla/readability` |
| `archiver` | `scripts/pack.js` — creates `.zip` for Chrome Web Store upload |

### Runtime (user must supply)

| Dependency | Required for | Notes |
|---|---|---|
| Chrome 114+ | Side panel | Earlier Chrome supports the rest of the extension |
| Local JiuwenSwarm server | All agent features | Default `ws://127.0.0.1:19000` |
