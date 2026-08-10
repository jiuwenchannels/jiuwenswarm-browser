# Roadmap

## What's Implemented

### Scaffold & Core Loop (v0.1)
- [x] MV3 Chrome extension scaffold (service worker, content scripts, side panel, popup, options)
- [x] WebSocket connection to local JiuwenSwarm server with auto-reconnect
- [x] Research sessions with pinned-page context aggregation
- [x] Side panel: session picker, context bar (pinned page chips), shared chat iframe
- [x] Keyboard shortcuts: open panel, pin page, ask about selection
- [x] Right-click context menu: ask, pin, summarize
- [x] Settings page: server host/port, default mode, behaviour toggles
- [x] Text highlight injector (Annotator); form fill assist (FormAssist)
- [x] SPA navigation detection (MutationObserver re-push on URL change)

### Content Quality & Session Unification (v0.2)
- [x] **Session unification** — server is single source of truth; extension stores only `activeSessionId` pointer; sessions created in extension appear in the web app and vice versa
- [x] **9 page type adapters** — GitHub, arXiv, SEC EDGAR, PubMed, Wikipedia, YouTube, Twitter/X, Hacker News, generic (Readability.js)
- [x] **Paragraph-boundary truncation** — 80% head / 20% tail split; cuts at `\n\n`; preserves document conclusions; replaces hard character slice
- [x] **Extraction quality signals** — character count tooltip on each chip; ⚠ warning chip for < 200 chars extracted; PDF badge; retry button for low-extraction and PDF pages
- [x] **PDF detection** — early return with server-tool hint stub; `read_pdf` server-side path planned for v0.3

---

## Architectural Context: Relationship with the JiuwenSwarm Web App

The JiuwenSwarm web app (`channels/web`) is a full-featured AI development platform
with 244 TypeScript source files, multi-agent orchestration, team collaboration, code
mode with git diff, goal tracking, cron scheduling, extension management, TraceHound
debugging, and rich document preview (DOCX, Excel, PowerPoint, Markdown+Mermaid+KaTeX).
It is the primary interface to the JiuwenSwarm server for all deliberate, focused work.

**The browser extension is not a replacement or a lighter version of the web app.**
They serve fundamentally different interaction patterns:

| | Web App | Browser Extension |
|---|---|---|
| **Pattern** | User goes to it intentionally | Ambient — present on every page |
| **Context source** | User pastes or uploads content | Auto-extracted from tabs you browse |
| **Placement** | Separate browser tab | Side panel alongside external sites |
| **Unique capability** | Rich panels: teams, skills, agents, code review, cron | Content script access to any live page |
| **Best for** | Focused development and research sessions | Reading-while-researching workflows |

The extension is a thin ambient layer that feeds content and quick interactions into
the same backend as the web app — not a standalone product. Sessions are shared.

---

## v0.3 — Agent Tool Integration

**Goal:** Let the agent take actions on the page, not just read it.

### Browser-Native Agent Tools
Expose the following tools to the server-side agent when the channel is `browser`:

| Tool | Description |
|---|---|
| `read_page` | Return full extracted text of a given tab URL |
| `read_pdf` | Server-side PDF text extraction via `pdfminer` / `pypdf` — unblocks inline PDFs |
| `get_selection` | Return current text selection in active tab |
| `highlight_text(text)` | Highlight a passage in the active tab |
| `fill_form(fields)` | Fill form fields by label or id |
| `take_screenshot` | Capture visible tab area as base64 PNG |
| `open_url(url)` | Open a URL in a new tab |
| `pin_page(tabId)` | Pin a specific tab to the active session |
| `scroll_to(selector)` | Scroll page to a CSS selector |

These replace the IDE tools (`read_file`, `write_file`, `run_bash`) that are
not applicable in a browser context. The server routes tool calls to the correct
channel based on `channel_id`.

### Screenshot-Based Reasoning
- Capture full-page screenshot on demand
- Send as base64 image in the context block (for vision-capable models)
- Useful for pages where text extraction fails (tables, diagrams, dynamic dashboards)

---

## v0.4 — Research Session Management

**Goal:** Make research sessions a first-class workflow, not just a chat thread.

### Session Export (Extension-Specific)
The web app already has session export (screenshot/image snapshot, conversation history
export, and a `/share-api/snapshot` endpoint). The extension's export is different:
it exports the **research package** — the combination of pinned pages + conversation,
not just the chat transcript.

- Export a session as a Markdown research package:
  - Session title, mode, date
  - List of pinned pages: URL, title, page type, extraction summary
  - Full conversation transcript
  - Agent-generated synthesis (if requested)
- Download as `.md` or `.json`; `.json` is re-importable

### Session Import / Merge
- Import a previously exported session JSON — restores pinned page list and session metadata
- Merge two sessions (combine pinned page lists; conversation history stays server-side)

### Shared Sessions
- The web app's `/share-api/snapshot` already supports sharing conversation snapshots
- Extension adds: "Open in web app" button — opens the active session in the web app
  for full access to teams, skills, code review, and other panels not in the extension
- This makes the extension a quick-start surface; heavy work moves to the web app naturally

### Session Templates
- "Company research" template: pre-suggests pinning LinkedIn, Crunchbase, investor page, news
- "Paper review" template: structured prompts for summary, methodology, criticism
- "Due diligence" template: financials + SEC filings + news + competitors

---

## v0.5 — Collaboration and Annotations

**Goal:** Make research shareable and annotatable.

### Persistent Page Annotations
- When the agent highlights a passage (Annotator), save the highlight to storage
- Show highlights on return visits to the same URL (restored via content script)
- Allow user to add sticky notes to highlights

### Note-Taking Sidebar
- Lightweight markdown editor inside the side panel (below context bar)
- Notes auto-save to the active session
- Referenced in agent context: "The user noted: …"

### Team Sessions (v0.5+)
- Requires a shared JiuwenSwarm server instance (multi-user)
- Multiple users can pin pages to a shared session
- Real-time sync of pinned pages and chat via server WebSocket broadcast

---

## v1.0 — Distribution

**Goal:** Publishable to Chrome Web Store.

### Chrome Web Store Compliance
- Replace placeholder icons with production SVG-derived PNGs (5 sizes)
- Write store listing: description, screenshots, privacy policy URL
- Conduct MV3 security audit (no remote code execution, no eval)
- Test on Chrome stable + Chrome Beta

### Firefox Adaptation (MV3 / MV2 bridge)
- Firefox does not yet support `chrome.sidePanel` — use a sidebar (`sidebar_action`) instead
- Content scripts and background logic require minimal changes
- Shared codebase; Firefox-specific entry in `manifest.json`

### Automated Testing
- Playwright + `chrome` extension loading for E2E tests
- Unit tests for `Extractor.ts`, `PageTypeDetector.ts`, adapters, `ContextCache.ts`
- CI on push: build + lint + unit tests

---

## Future Ideas (Unscheduled)

| Idea | Notes |
|---|---|
| **Offline mode** | Cache last agent response for re-reading without server |
| **Reading mode overlay** | Render Readability output in a clean overlay (like Reader Mode) with chat attached |
| **Batch pin** | Pin all open tabs in the current window to a session at once |
| **Schedule research** | Background agent runs while the user is away; notifies with findings |
| **Databricks / Colab adapter** | Detect notebook-like environments, extract cell outputs |
| **Auto-summarize on pin** | Immediately ask the agent for a 3-sentence summary when a page is pinned |
| **Link graph** | Visualize connections between pinned pages based on shared topics |
| **Voice input** | Web Speech API → text; voice in/out already exists in the web app; extension can expose the same capability via the shared chat iframe |
| **Cron research jobs** | Schedule recurring research tasks (web app has cron panel server-side; extension surfaces a simplified "monitor this topic" shortcut) |
