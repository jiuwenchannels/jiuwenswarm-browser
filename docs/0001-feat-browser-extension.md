**[Feature]: Implement a Browser Extension to Bring the JiuwenSwarm Agent into the Browser / 实现浏览器扩展，将 JiuwenSwarm 智能体带入浏览器**

EN ======      
JiuwenSwarm's agent lives in a web app, but its users work in the browser, reading web pages and switching tabs. To use the agent on anything they are reading, users must copy-paste text out of the page, lose its context, and repeat this for every tab — and the agent can neither see the page nor act on it. This feature is a Chrome extension that brings the agent into the browser: it reads the active page, holds a research session across pinned pages, and acts on the page (highlight, fill forms, scroll), while keeping the same session in the full JiuwenSwarm UI.

ZH ======      
JiuwenSwarm 的智能体位于 Web 应用中，但用户却是在浏览器里工作，阅读网页、切换标签页。要在正在阅读的内容上使用智能体，用户必须把文本复制粘贴出页面、丢失其上下文，并对每个标签页重复这一过程——而智能体既看不到页面，也无法对页面操作。本特性是一个 Chrome 扩展，将智能体带入浏览器：自动读取当前页面、跨固定页面维护研究会话、作用于页面（高亮、填表、滚动），并在完整的 JiuwenSwarm UI 中延续同一会话。

---

# [Feature]: Implement a Browser Extension to Bring the JiuwenSwarm Agent into the Browser

## Executive Summary

JiuwenSwarm's agent lives in a web app, but its users — researchers, financial analysts, journalists, legal professionals, and product managers — do their work in the browser, reading web pages and switching tabs. To use the agent on anything they are reading, users must copy-paste text out of the page, lose its context, and repeat this for every tab, and the agent can neither see the page nor act on it. This feature adds a Chrome extension (Manifest V3) that brings the agent into the browser: it reads the active page automatically, holds a research session across pinned pages, and acts on the page (highlight, fill forms, scroll, screenshot), while keeping the same session in the full JiuwenSwarm UI for heavy follow-up.

## Background Description

JiuwenSwarm serves knowledge workers whose thinking happens in the browser, with the web page they are reading as their raw material — a paper on arXiv, an SEC filing, a PubMed abstract, a Twitter thread, a GitHub PR. But the agent lives in a separate web app. Using it on anything the user is reading forces a manual, disconnected flow:

- **Copy-paste as the transport layer.** Select text, switch to the web app, paste it, lose the surrounding context, then repeat for every additional page. A question spanning three tabs becomes three round-trips of copying.
- **No memory of the page.** The agent never sees the page the user is actually looking at. Context the user can see — where a figure sits, what a highlighted passage says — has to be described back in prose.
- **No action on the page.** Even when the agent has a useful answer, it cannot point at the page, highlight the passage it is citing, or fill the form the user was filling. The answer arrives in a chat window disconnected from the thing it is about.

```mermaid
flowchart TD
    classDef fail fill:#FFCDD2,color:#111,stroke:#C62828
    classDef plain fill:#ECEFF1,color:#111,stroke:#607D8B
    PAGE(["user reads a web page<br/>(arXiv, SEC, PubMed, GitHub)"]):::plain
    PAGE -->|"select + copy"| COPY["switch to web app, paste<br/>lose surrounding context"]:::fail
    COPY -->|"per tab, repeatedly"| LOST["agent has no page context,<br/>cannot act on the page"]:::fail
```

## Design Ideas

### Proposed design

A Chrome extension (Manifest V3) with four runtime layers that connect to the existing JiuwenSwarm WebSocket gateway:

- **Layer 1 — Background service worker.** The central hub, running separately from both the page and the side panel. Maintains the WebSocket connection, session lifecycle, page-context cache, tab tracking, right-click menu, panel opening, and a browser-native tool dispatcher.
- **Layer 2 — Content script.** Injected into every web page; detects the page type, routes to one of eight page-type adapters, extracts text (head+tail, capped at 120,000 chars), tracks selection, and responds to highlight/scroll/fill commands from the background.
- **Layer 3 — Side panel.** A persistent Chrome Side Panel beside the page: native streaming chat, session picker, context bar with pinned-page chips, and session export/import and templates.
- **Layer 4 — Popup and options.** A toolbar connection-status popup and a settings page for the server host, port, default mode, and auto-extract toggles.

**Browser-native agent tools** (8) dispatched by the background worker when the server sends a `tool_call` envelope:

| Tool | What it does |
|---|---|
| `get_selection` | Read current text selection in the active tab |
| `highlight_text` | Highlight a passage in the active tab with a colored overlay |
| `fill_form` | Fill form fields in the active tab by label or field name |
| `scroll_to` | Scroll the active tab to a CSS selector |
| `take_screenshot` | Capture the visible area of the active tab as a base64 PNG |
| `open_url` | Open a URL in a new tab |
| `read_page` | Extract text from a tab by URL, or the active tab if no URL given |
| `pin_page` | Pin the current tab to the active research session |

```mermaid
flowchart TD
    classDef ok fill:#BBDEFB,color:#111,stroke:#1565C0
    classDef done fill:#C8E6C9,color:#111,stroke:#2E7D32
    classDef plain fill:#ECEFF1,color:#111,stroke:#607D8B
    PAGE(["active tab"]):::plain
    PAGE -->|"content script extracts"| BG["background service worker<br/>WebSocket to JiuwenSwarm"]:::ok
    BG -->|"session context + agent reply"| PANEL["side panel chat"]:::ok
    BG -->|"server sends tool_call "| TOOLS["browser-native tools<br/>(highlight, fill, scroll, ...)"]:::done
    TOOLS -->|"acts on the page"| PAGE
```

## Involved Public APIs

New components (public additions in the `jiuwenswarm-browser` extension):

| API | Kind |
|---|---|
| `WsClient` | new class (WebSocket client, exponential back-off reconnect) |
| `SessionManager` | new class (research session lifecycle, server as source of truth) |
| `ContextCache` | new class (per-tab page-context cache) |
| `TabWatcher` | new class (tab lifecycle tracking, re-extraction on navigation) |
| `ToolDispatcher` | new class (dispatch the 8 browser-native tools) |
| `Extractor` + `PageTypeDetector` | new classes (page text extraction + type routing) |
| 8 page-type adapters | new modules (GitHub, arXiv, SEC EDGAR, PubMed, Wikipedia, YouTube, Twitter/X, Hacker News) |
| `ChatBridge`, `SessionPicker`, `ContextBar`, `SessionExporter` | new side-panel components |
| `SharedProtocol` / message types | new module (content ↔ background ↔ side-panel wire protocol) |

**Impact:** additive and opt-in (a separately installable extension). It uses the existing JiuwenSwarm WebSocket gateway protocol — the same protocol used by the IDE plugin and the web app — so **no changes to the JiuwenSwarm agent runtime or web app are required**, and no new server API surface is introduced.

## Description of Relevance to Other Modules

- **`background/`** — `WsClient`, `SessionManager`, `ContextCache`, `TabWatcher`, `ContextMenu`, `PanelManager`, `ToolDispatcher` (extension-side only).
- **`content/`** — `Extractor`, `PageTypeDetector`, 8 adapters, `SelectionMonitor`, `Annotator`, `FormAssist`.
- **`sidepanel/`** — `ChatBridge`, `SessionPicker`, `ContextBar`, `SessionExporter`, `chat`, `markdown`, `reader`, `tour`, `privacy`, `search`, native chat.
- **`popup/` + `options/`** — connection status and settings.
- **`shared/`** — types, protocol, storage, constants shared across the three contexts.
- **JiuwenSwarm server** — intentionally unchanged; sessions created by the extension are stored server-side and immediately visible in the web app because both share the same server.

## Test Design and Test Plan

Unit/integration tests:

1. **WebSocket client** — connects, and reconnects with exponential back-off after the MV3 service worker terminates and wakes.
2. **Session management** — create, switch, and resume research sessions; the active pointer is persisted and server remains the source of truth.
3. **Page extraction** — the correct page-type adapter is selected; generic article pages fall back to Readability.js; output is head+tail truncated to the 120,000-char cap.
4. **Adapters** — each of the 8 adapters extracts the expected structured content for its site.
5. **Tools** — `get_selection`, `highlight_text`, `fill_form`, `scroll_to`, `take_screenshot`, `open_url`, `read_page`, and `pin_page` each produce the correct result and surface errors (e.g. screenshot on a background/minimized window) as tool results.
6. **Cross-page session** — a question spanning multiple pinned pages is answered using all pinned contexts.
7. **Context continuity** — a session started in the browser is the same session in the web app.
8. **Service-worker sleep** — an in-flight `tool_call` dispatched while the worker is asleep generates a contained error response, and reconnects on wake.

Performance/reliability:

- **Extraction does not block rendering** — the content script runs at `document_idle`; large-page extraction stays bounded by the char cap.

## Additional Information

## Solution

**What type of PR is this?**
/kind feature

---

## **What does this PR do / why do we need it**

This PR adds a Chrome extension (Manifest V3) that brings the JiuwenSwarm agent into the browser, removing the wall between the agent and the page. It reads the active page automatically, holds a research session across pinned pages, and acts on the page, while keeping the same session in the full JiuwenSwarm UI.

---

## **Problem**

The people JiuwenSwarm serves do their thinking in a browser, but the agent lives in a separate web app. To use the agent on anything they are reading, users must copy-paste text out of the page, lose its context, and repeat this for every tab — and the agent can neither see the page nor act on it. The manual path is abandoned for whatever happens to be in the same window, often a generic assistant with no real agent capabilities.

---

## **Solution**

A Chrome extension with four runtime layers:

- **Background service worker** — WebSocket client, session manager, page-context cache, tab watcher, right-click menu, panel manager, and an 8-tool browser-native dispatcher.
- **Content script** — page-type detection with 8 adapters + Readability fallback, extraction capped at 120,000 chars, selection monitoring, passage highlighting, and form-fill/scroll handlers.
- **Side panel** — native streaming chat, session picker, pinned-page context bar, and session export/import and templates.
- **Popup + options** — connection status and server/settings configuration.

```mermaid
flowchart TD
    classDef ok fill:#BBDEFB,color:#111,stroke:#1565C0
    classDef done fill:#C8E6C9,color:#111,stroke:#2E7D32
    classDef plain fill:#ECEFF1,color:#111,stroke:#607D8B
    PAGE(["active tab"]):::plain
    PAGE -->|"content script extracts"| BG["background service worker<br/>WebSocket to JiuwenSwarm"]:::ok
    BG -->|"session context + agent reply"| PANEL["side panel chat"]:::ok
    BG -->|"server sends tool_call"| TOOLS["browser-native tools<br/>(highlight, fill, scroll, ...)"]:::done
    TOOLS -->|"acts on the page"| PAGE
```

The extension reuses the existing JiuwenSwarm WebSocket gateway protocol, so no changes to the agent runtime or web app are required.

---

## **Expected Impact**

- The agent becomes present beside whatever the user is reading, not a destination they must visit.
- Users can research across pinned pages without manual copy-paste.
- The agent can act on the page (highlight citations, fill forms, scroll to elements).
- Browser sessions graduate into web-app sessions for heavy follow-up (skills, code review, team agents).
- Existing web-app and IDE users are unaffected.

---

## **Self-checklist**

- [x] **Design**: Layered architecture (worker / content / side panel / popup) reviewed against the RAT document
- [x] **Test**: Covered WebSocket reconnect, session lifecycle, extraction, and the 8 browser-native tools
- [x] **Verification**: Confirmed cross-page sessions and web-app continuity
- [ ] **Interface**: No changes to the JiuwenSwarm server API
- [x] **Document**: Full documentation added
