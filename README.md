# JiuwenSwarm Browser Extension

A Chrome extension that puts the JiuwenSwarm AI agent alongside any page you are reading.
Pin multiple pages into a research session, ask questions across sources, and let the agent
act on what you see — all without leaving the browser.

**Requires:** A locally running JiuwenSwarm server (default `ws://127.0.0.1:19000`).

---

## Documentation

| Document | Contents |
|---|---|
| [Installation](docs/INSTALLATION.md) | Build, load into Chrome, configure server address |
| [User Guide](docs/USER_GUIDE.md) | Sessions, pinning pages, shortcuts, chat, settings, troubleshooting |
| [Roadmap](docs/ROADMAP.md) | v0.2 → v1.0 planned features |

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
│                 TabWatcher, ContextMenu
├── content/      Injected scripts: Extractor, adapters (GitHub/arXiv/SEC/PubMed),
│                 SelectionMonitor, Annotator, FormAssist
├── sidepanel/    Side panel UI: ChatBridge, SessionPicker, ContextBar
├── popup/        Toolbar popup: connection status, quick actions
├── options/      Settings page: host/port, behavior toggles
└── webview/      chat.html (shared with jiuwenswarm-jupyterlab)
```

---

## Related Packages

- `jiuwenswarm-jupyterlab` — JupyterLab extension
- `jiuwenswarm-ide` — VS Code / JetBrains IDE plugin
- `agent-core` — JiuwenSwarm Python server and agent runtime
