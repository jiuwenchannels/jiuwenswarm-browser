# Requirements Analysis — jiuwenswarm-browser

---

## Source of Demand

- **Proactive Planning** — New Features / Technology Innovation
- **Product Requirements** — JiuwenSwarm Product / Researcher & Analyst Reach

---

## Demand Background

### WHY

Researchers, financial analysts, journalists, legal professionals, and product managers
spend a large portion of their working time in a browser — reading papers, news, SEC
filings, social media discussions, and documentation. Their research tool is the web
page, not a notebook or an IDE.

Accessing JiuwenSwarm's agent capabilities today requires switching to the web app,
copying content from one or more browser tabs by hand, pasting it into the chat, and
losing the reading context in the process. When following up on a finding, the user
must repeat the cycle.

The goal is to embed JiuwenSwarm directly into the browser as an ambient assistant: a
side panel that stays open beside any page, reads the page the user is looking at
automatically, allows several pages to be pinned into a shared research session, and
lets the agent act on the page — highlighting, scrolling, or filling a form — without
the user copying anything or leaving the browser.

A secondary goal is session continuity: a session created in the browser extension must
be immediately visible in the JiuwenSwarm web app and vice versa, so heavy follow-up
work (skills, code review, team agents, goal tracking) can happen in the full UI without
re-establishing context.

### WHEN

New feature, proactively planned. No commercial project deadline.
Targeted for delivery as part of the JiuwenSwarm platform release.

### WHAT

The feature is a Chrome extension (Manifest V3) with four runtime layers:

---

**Layer 1 — Background service worker**

Central hub for the extension. Runs in a separate context from both page content and the
side panel. Maintains the WebSocket connection to the local JiuwenSwarm server.

| Capability | Component | Description |
|---|---|---|
| WebSocket connection to JiuwenSwarm | `WsClient` | Persistent reconnecting WebSocket client; exponential back-off reconnect |
| Research session lifecycle | `SessionManager` | Fetch, create, switch sessions; server is source of truth; active pointer in local storage |
| Page context cache | `ContextCache` | Ephemeral in-memory cache of extracted `PageContext` per tab; aggregate for agent context block |
| Tab lifecycle tracking | `TabWatcher` | Listen on `chrome.tabs.onUpdated` / `onRemoved`; trigger re-extraction on navigation |
| Right-click context menu | `ContextMenu` | "Ask about selection", "Pin this page", "Summarize this page" |
| Browser-native agent tools | `ToolDispatcher` | Dispatch 8 tools on behalf of the agent when server sends a `tool_call` envelope |

**Browser-native agent tools (ToolDispatcher):**

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

---

**Layer 2 — Content script**

Injected into every web page (at `document_idle`). Responsible for reading pages and
responding to background commands.

| Capability | Component | Description |
|---|---|---|
| Page text extraction | `Extractor` + `PageTypeDetector` | Detect page type; route to correct adapter; truncate to 120,000 chars using head+tail strategy |
| 9 page-type adapters | `adapters/` | GitHub, arXiv, SEC EDGAR, PubMed, Wikipedia, YouTube, Twitter/X, Hacker News, generic (Readability.js) |
| Text selection monitoring | `SelectionMonitor` | Detect and surface selected text for the "Ask about selection" shortcut |
| Passage highlighting | `Annotator` | Apply and clear colored overlay on DOM elements cited by the agent |
| Form field filling | `FormAssist` | Locate and fill `<input>` and `<textarea>` elements by label, placeholder, or name |
| Scroll to element | inline listener | Respond to `MSG.SCROLL_TO` — find element by CSS selector, scroll smoothly |

---

**Layer 3 — Side panel UI**

A persistent Chrome Side Panel (requires Chrome 114+) that opens beside the page.
The side panel is the user's primary interaction surface.

| Capability | Component | Description |
|---|---|---|
| Chat with the agent | `ChatBridge` + native rendering | Port-based bridge to background; native streaming chat (no iframe) |
| Session picker | `SessionPicker` | Dropdown showing all research sessions; click to switch |
| Context bar with pinned-page chips | `ContextBar` | Chip per pinned page with ⚠ warning, PDF badge, and retry button |
| Session export and import | `SessionExporter` | Download JSON (re-importable) or Markdown; import JSON; open in web app |
| Session templates | `SessionExporter.SESSION_TEMPLATES` | Pre-built starters: Company Research, Paper Review, Due Diligence |
| New session form | `index.ts` | Inline form with name, template selector, mode selector, and hint text |

---

**Layer 4 — Popup and options**

| Capability | Component | Description |
|---|---|---|
| Connection status indicator | `popup/` | Toolbar popup: WebSocket status dot, quick "Open panel" button |
| Extension settings | `options/` | Configure server host, port, default mode, auto-extract, show-annotations toggles |

---

### Requirement Type

☑ **Functionality** (excluding Trust)
☑ **Operation and Maintenance Methods** (local server connection, MV3 lifecycle)

---

## Needs Assessment

### Requirement Decomposition

| Sub-requirement | Scope |
|---|---|
| WebSocket client and reconnection | `background/WsClient.ts` |
| Session management | `background/SessionManager.ts`, `shared/storage.ts` |
| Page context cache | `background/ContextCache.ts` |
| Tab lifecycle tracking | `background/TabWatcher.ts` |
| Right-click context menu | `background/ContextMenu.ts` |
| Browser-native agent tools | `background/ToolDispatcher.ts` |
| Page extraction + page-type detection | `content/Extractor.ts`, `content/PageTypeDetector.ts` |
| Page-type adapters (9 total) | `content/adapters/` |
| Text selection monitoring | `content/SelectionMonitor.ts` |
| Inline passage highlighting | `content/Annotator.ts` |
| Form fill assist | `content/FormAssist.ts` |
| Chat bridge (sidepanel ↔ background) | `sidepanel/ChatBridge.ts` |
| Session picker dropdown | `sidepanel/SessionPicker.ts` |
| Context bar with chip quality signals | `sidepanel/ContextBar.ts` |
| Session export / import / web-app | `sidepanel/SessionExporter.ts` |
| Side panel wiring and native chat | `sidepanel/index.ts`, `sidepanel/sidepanel.html` |
| Toolbar popup | `popup/` |
| Settings page | `options/` |
| Shared types, protocol, storage, constants | `shared/` |

### Constraints

**MV3 service worker is not persistent:**
The background service worker is started on demand and terminated after a period of
inactivity. The WebSocket connection is lost on termination. `WsClient` reconnects on
wake. Any in-flight `tool_call` dispatched while the service worker was asleep will
generate an error response.

**Content scripts cannot run on chrome:// and extension pages:**
Pages at `chrome://` (New Tab, Settings, Extensions) and `chrome-extension://` cannot
receive content scripts. Pinning these pages will fail silently — the background
receives no context from the content script.

**Pages with restrictive Content Security Policy:**
Some enterprise or banking pages set a CSP that blocks script injection or disables
`eval`. The content script is injected by the browser at `document_idle` and does not
use `eval`, so CSP should not block extraction itself, but JS-rendered content on
CSP-restricted pages may not be fully loaded.

**chrome.sidePanel requires Chrome 114+:**
The Side Panel API is not available in older Chrome versions or other browsers. The
extension gracefully degrades — keyboard shortcuts and right-click actions work, but
the side panel cannot open.

**Binary PDFs cannot be extracted by the content script:**
A PDF opened inline in Chrome is served at a `chrome-extension://` URL by the built-in
PDF viewer, which does not receive injected content scripts. The chip shows a **PDF**
badge and the retry button routes through the server-side `read_pdf` tool.

**WebSocket limited to localhost:**
`host_permissions` in `manifest.json` allow WebSocket connections only to
`ws://127.0.0.1:*/*` and `ws://localhost:*/*`. Connections to remote servers would
require adding a broader host permission and user consent.

**Screenshots require a focused window and visible tab:**
`chrome.tabs.captureVisibleTab` fails if the tab is in a background window or the
window is minimised. The `ToolDispatcher` surfaces the error to the agent as a
tool result.

**No Firefox support:**
Firefox does not implement `chrome.sidePanel`. The `browser.sidebarAction` API is
the Firefox equivalent but requires a separate manifest entry and different panel
management. Firefox support is a future distribution goal.

**Context size cap:**
Each pinned page is truncated to at most 120,000 characters using a head+tail strategy
(approximately 80% from the start, 20% from the end). A `[...truncated...]` marker is
inserted at the cut point. The JiuwenSwarm server enforces its own token-level limit
independently.

### Impact of Requirement Implementation on Existing Systems

**JiuwenSwarm agent runtime:** No changes required. The extension connects via the
existing WebSocket gateway protocol (same protocol used by the IDE plugin and web app).
All session, context, and tool event types were already defined.

**JiuwenSwarm web app:** No changes required. Sessions created by the extension are
stored server-side and immediately visible in the web app because both share the same
server. No new API surface is needed.

**Existing JiuwenSwarm users:** No impact. The extension is a separate installable
artefact. Users who do not install it are unaffected.

**Performance:** The content script runs at `document_idle`, after the page has loaded.
It does not block page rendering. Extraction involves synchronous DOM traversal; for
very large pages (Wikipedia long-form, multi-chapter arXiv PDFs) this may add ~100 ms.
The 120,000-character cap keeps the extraction output bounded.

### External Dependencies

| Dependency | Purpose | Version |
|---|---|---|
| `@mozilla/readability` | Generic article text extraction (fallback adapter) | 0.5.0 |
| `nanoid` | Nanoid-based ID generation for sessions and pinned pages | 5.0.0 |
| Chrome browser | `chrome.sidePanel`, `chrome.tabs.captureVisibleTab`, MV3 service worker | 114+ (sidePanel) |
| `vite` | TypeScript build toolchain; separate configs for background and content | — |
| `@types/chrome` | TypeScript type definitions for Chrome Extension APIs | — |
| `@types/mozilla__readability` | TypeScript definitions for Readability | — |
| `typescript` | Type checking and compilation | — |
