# Requirements Analysis — jiuwenswarm-browser

> **Post-approval simplifications:** This requirements analysis reflects the originally
> approved scope. Since implementation the product was simplified — the following were
> **removed**: persistent page annotations / sticky notes, per-session notes, session
> **import**, session **templates**, **edit-and-resend**, **regenerate**, the
> context-budget meter, and **Open in web app**. Agent highlights are now **transient**
> (applied and cleared within a session). See the README and USER_GUIDE for the current
> feature set.

---

## Source of Demand

- **Proactive Planning** — New Features / Technology Innovation
- **Product Requirements** — JiuwenSwarm Product / Researcher & Analyst Reach

---

## Demand Background

### WHY

#### The problem: research lives in the browser, but the agent lives in another window

The people JiuwenSwarm serves — researchers, financial analysts, journalists,
legal professionals, and product managers — do their thinking in a browser. Their
raw material is a web page: a paper on arXiv, an SEC filing, a PubMed abstract,
a Twitter thread, a GitHub PR. The browser is not a convenience for them; it is
where the work happens.

But JiuwenSwarm's agent does not live there. It lives in a separate web app. To
use the agent on anything they are reading, a user must break their flow and do
manual assembly:

- **Copy-paste as the transport layer.** Select text, switch to the web app,
  paste it, lose the surrounding context, then repeat for every additional page.
  A question that spans three tabs becomes three round-trips of copying.
- **No memory of the page.** The agent never sees the page the user is actually
  looking at. Context the user can see — where a figure sits, what a highlighted
  passage says — has to be described back in prose, badly.
- **No action on the page.** Even when the agent has a useful answer, it cannot
  point at the page, highlight the passage it is citing, or fill the form the
  user was filling. The answer arrives in a chat window disconnected from the
  thing it is about.

The cost is not just friction. Every copy-paste cycle is a moment a user is
reminded that the agent is *somewhere else*, and the habit that survives is the
one without friction. The manual path is abandoned for whatever happens to be in
the same window — often a generic chat assistant with no real agent
capabilities. The users most likely to adopt JiuwenSwarm are exactly the ones
the walled garden pushes away.

#### The value: an ambient assistant, not a destination

The extension removes the wall between the agent and the page. It makes the
agent ambient — present beside whatever the user is reading, aware of it, and
able to act on it:

- **Reads the page automatically.** The side panel sees the active tab without
  the user copying a single character.
- **Holds a research session across pages.** Several tabs can be pinned into one
  shared session, so a question like "how do these three filings differ" is
  answerable without manual assembly.
- **Acts on the page.** Highlight the passage the agent cites, scroll to the
  element it means, fill the form the user was filling. The answer lands on the
  page, not in a disconnected chat.
- **Keeps context into the full UI.** A session started in the browser is the
  same session in the web app, so heavy follow-up (skills, code review, team
  agents) continues without re-establishing anything.

The "rather than not do" argument is capability reach. JiuwenSwarm already has a
serious agent — code execution, long-term memory, multi-agent coordination. The
browser is where the demand for it is highest and where, today, it is
unreachable. This extension is the difference between an agent people visit and
an agent that is already there when they need it.

#### The stakes for JiuwenSwarm: why build it

**The return.** The browser is the highest-frequency surface a knowledge worker
owns. An ambient extension puts JiuwenSwarm in front of users continuously, not
only when they decide to open the web app. Each in-browser session is a
touchpoint that converts a one-time user into a daily one, and each pinned page
is distribution — the agent becoming part of how someone already works.

**Competitive position.** The reference tool for in-browser research today is a
chat sidebar with no access to the page and no agent behind it. No serious agent
platform owns the "reads the page, remembers the session, acts on the page"
surface. That is an open seam, and it is the cheapest way for JiuwenSwarm to be
present where the competition is a thin wrapper over a model API.

**What winning looks like.** The extension succeeds when it changes behaviour,
not when it installs: (a) retention — users run browser sessions repeatedly, not
once; (b) reach — the browser becomes a measurable source of sessions that would
otherwise never start; (c) follow-through — browser sessions graduate into web
app sessions for heavy work, proving the continuity goal; (d) no regression —
existing web app and IDE users are unaffected. If those move, the extension paid
for itself; if none move, the wall was never the problem.

#### The user, in one sentence

A knowledge worker who already lives in a browser and needs JiuwenSwarm's agent
to meet them there — reading the page, remembering the session, and acting on
what they see — without copying, switching, or leaving the tab.

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
| Panel open + fallback | `PanelManager` | Unified side-panel opener; falls back to a focused popup window on Chromium browsers without `chrome.sidePanel` |
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
| 8 page-type adapters | `adapters/` | GitHub, arXiv, SEC EDGAR, PubMed, Wikipedia, YouTube, Twitter/X, Hacker News |
| Generic article fallback | `Extractor` (Readability.js) | Article-like pages not matching a named adapter are extracted with Readability.js |
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
| Session notes | `NoteEditor` | Freeform markdown note per session, auto-saved with debounce; included in the agent context block |
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
| Panel open + fallback | `background/PanelManager.ts` |
| Browser-native agent tools | `background/ToolDispatcher.ts` |
| Page extraction + page-type detection | `content/Extractor.ts`, `content/PageTypeDetector.ts` |
| Page-type adapters (8 total) | `content/adapters/` |
| Text selection monitoring | `content/SelectionMonitor.ts` |
| Inline passage highlighting | `content/Annotator.ts` |
| Form fill assist | `content/FormAssist.ts` |
| Chat bridge (sidepanel ↔ background) | `sidepanel/ChatBridge.ts` |
| Session picker dropdown | `sidepanel/SessionPicker.ts` |
| Context bar with chip quality signals | `sidepanel/ContextBar.ts` |
| Session export / import / web-app | `sidepanel/SessionExporter.ts` |
| Session notes | `sidepanel/NoteEditor.ts` |
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
