# JiuwenSwarm Browser Extension

A Chrome extension that puts the JiuwenSwarm AI agent alongside any page you are reading.
Pin multiple pages into a research session, ask questions across sources, and let the agent
act on what you see — all without leaving the browser.

**Requires:** A locally running JiuwenSwarm server (default `ws://127.0.0.1:19000`).

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
- **Extraction quality signals** — character count per chip, warning on low-yield pages,
  PDF badge, and a retry button for failed extractions
- **Shared chat UI** — same `chat.html` webview used by the IDE plugin and JupyterLab extension
- **Keyboard shortcuts** — open/close panel, pin current tab, ask about selection
- **Right-click context menu** — ask about selection, pin page, summarize page
- **SPA navigation detection** — re-extracts context on URL change without a full reload
- **Settings** — configurable server host, port, default session mode, behaviour toggles

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

---

## Project Structure

```
src/
├── shared/       Constants, types, protocol, storage, logger
├── background/   Service worker: WsClient, SessionManager, ContextCache,
│                 TabWatcher, ContextMenu, ToolDispatcher
├── content/      Injected scripts: Extractor, PageTypeDetector,
│                 adapters (GitHub / arXiv / SEC / PubMed / Wikipedia /
│                 YouTube / Twitter / HackerNews / generic),
│                 SelectionMonitor, Annotator, FormAssist
├── sidepanel/    Side panel UI: ChatBridge, SessionPicker, ContextBar,
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
