# JiuwenSwarm Browser Extension

A Chromium extension that puts the JiuwenSwarm AI agent alongside any page you are reading.
Pin multiple pages into a research session, ask questions across sources, and let the agent
act on what you see — all without leaving the browser.

**Requires:** A locally running JiuwenSwarm server (default `ws://127.0.0.1:19000`).

**Browser support:** Chrome 114+ (Side Panel API). On Chromium-based browsers without the
Side Panel API (360 Safe Browser, QQ Browser, Sogou Browser), the panel opens automatically
as a popup window — all features work identically.

---

## Features

- **9 page type adapters** — GitHub, arXiv, SEC EDGAR, PubMed, Wikipedia, YouTube,
  Twitter/X, Hacker News, and a Readability.js fallback for everything else
- **Multi-tab research sessions** — pin pages from multiple tabs; the agent receives
  all extracted content as one unified context block
- **Session unification** — sessions created in the extension appear in the JiuwenSwarm
  web app and vice versa; the server is the single source of truth
- **Session templates** — 3 built-in starters (Company Research, Paper Review, Due Diligence)
  that auto-fill session name, mode, and inject a structured starting prompt
- **Session export and import** — export as re-importable JSON or human-readable Markdown;
  import a JSON export to restore pinned pages into any session
- **Open in web app** — one-click to open the active session in the JiuwenSwarm web app
- **Browser-native agent tools** — the agent can highlight cited passages, scroll to sections,
  fill form fields, take screenshots, read specific URLs, open new tabs, and pin pages
  programmatically — without the user needing to trigger these actions manually
- **Persistent page annotations** — agent highlights are saved to local storage and reappear on
  the next visit to the same URL; click any saved highlight to attach or edit a sticky note
- **Saved-highlights panel** — a 🔆 button lists every highlight saved in the active session,
  with its URL and note; click to open the page
- **Session notes editor** — a freeform note panel in the side panel, auto-saved per session;
  notes are automatically prepended as context with every chat message
- **Session stats** — the empty state shows your active session's mode, title, and pinned count
  at a glance
- **Extraction quality signals** — character count per chip, warning on low-yield pages,
  PDF badge, and a retry button for failed extractions
- **Shared chat UI** — same `chat.html` webview used by the IDE plugin and JupyterLab extension
- **Keyboard shortcuts** — open/close panel, pin current tab, ask about selection
- **Right-click context menu** — ask about selection, pin page, summarize page
- **SPA navigation detection** — re-extracts context on URL change without a full reload
- **Settings** — configurable server host, port, default session mode, behaviour toggles
- **Popup window fallback** — on Chromium browsers without `chrome.sidePanel` (Chinese browsers,
  future Firefox build), opens the panel in a dedicated popup window; all features unchanged
- **Rich, readable chat** — agent answers render as Markdown (code, lists, links, headings)
  with one-click **Copy**, **↻ Regenerate**, **✎ Edit-and-resend**, and a **Stop** button while generating
- **Source citations** — every answer lists its **Sources** (the pinned pages); click one
  to open it in a new tab
- **Chat history** — messages carry timestamps and turns are separated for easy reading
- **Batch pin** — pin all open tabs in the current window to a session at once (⋯ menu)
- **Full-text search** — search across all pinned pages and session notes from the ⋯ menu
- **Reading mode** — open the active page's extracted text in a clean, distraction-free
  reader view from the ⋯ menu
- **Offline re-reading** — the last agent answer is cached and shown when the server is
  unreachable
- **Auto-summarize on pin** — optional setting that requests a short summary each time you pin
- **Activity dashboard** — the empty state shows session mode/title, pinned count, and how
  many pages you've pinned this week
- **In-app privacy disclosure** — a **🔒 Privacy** item in the ⋯ menu explains exactly what
  stays local and what is sent to your server
- **Getting-started tour** — a short first-run overlay teaches the pin → ask → act loop;
  replayable anytime from the ⋯ menu
- **Never dead-ends** — with no session, an inline **+ Create a session** button appears;
  pinning or asking when no session exists opens the form instead of failing silently
- **Suggestions before you type** — one-click chips ("Pin this page", "Summarize this page",
  "Compare the pinned pages") fill the gap before the first question
- **Pin feedback** — a toast and a toolbar badge (pinned-count) confirm every pin, and a
  toolbar badge tracks the active session's pinned pages
- **Undo on unpin** — unpinning a page shows an **Undo** toast, so it's easy to take back
- **Reorder pinned pages** — ◀ ▶ buttons on each chip set context priority (order matters)
- **"What's in my context"** — click any pinned chip to preview its extracted text, and a
  context-budget meter shows how much text is sent to the agent
- **Agent action visibility** — when the agent highlights, scrolls, fills a form or takes a
  screenshot, an inline status chip tells you what it's doing on the page
- **Connection recovery** — a banner with a Retry button appears when the server is
  unreachable, and errors are reworded in plain language
- **Dark mode** — follows your OS color scheme across the panel, popup, and settings
- **Thinking indicator** — a pulsing skeleton shows while the agent composes a reply
- **Keyboard-first** — the session picker and pinned-page chips are navigable with the
  arrow keys
- **Localized** — the full interface is available in English and Simplified Chinese
  (auto-detected from your browser)

---

## Documentation

| Document | Contents |
|---|---|
| [Installation](docs/INSTALLATION.md) | Build, load into Chrome, configure server address |
| [User Guide](docs/USER_GUIDE.md) | Sessions, pinning pages, shortcuts, chat, settings, troubleshooting |
| [Roadmap](docs/ROADMAP.md) | Planned next features |

---

## Quick Start

```bash
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension in `chrome://extensions`.

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for the full walkthrough.

## Development

```bash
npm run dev          # watch mode build
npm run type-check   # TypeScript type-check
npm run lint         # ESLint
npm run test         # unit tests (Vitest)
npm run build        # production build
```

---

## Project Structure

```
src/
├── shared/       Constants, types, protocol, storage, logger,
│                 annotations (persistent highlights CRUD), notes (per-session CRUD)
├── background/   Service worker: WsClient, SessionManager, ContextCache,
│                 TabWatcher, ContextMenu, ToolDispatcher
├── content/      Injected scripts: Extractor, PageTypeDetector,
│                 adapters (GitHub / arXiv / SEC / PubMed / Wikipedia /
│                 YouTube / Twitter / HackerNews / generic),
│                 SelectionMonitor, Annotator, FormAssist
├── sidepanel/    Side panel UI: ChatBridge, SessionPicker, ContextBar,
│                 NoteEditor (session notes, auto-save, context injection),
│                 SessionExporter (export / import / templates)
├── popup/        Toolbar popup: connection status, quick actions
├── options/      Settings page: host/port, behaviour toggles
└── webview/      chat.html (shared with jiuwenswarm-jupyterlab)
```

---

## Related Packages

- `jiuwenswarm-jupyterlab` — JupyterLab extension
- `jiuwenswarm-ide` — VS Code / JetBrains IDE plugin
- `agent-core` — JiuwenSwarm Python server and agent runtime
