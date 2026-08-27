# JiuwenSwarm Browser Extension

A Chromium extension that puts the JiuwenSwarm AI agent alongside any page you read.
Pin pages into a research session, ask questions across sources, and let the agent
act on what you see — all without leaving the browser.

**Requires:** a locally running JiuwenSwarm server (default `ws://127.0.0.1:19000`).

## Features

- Pin multiple tabs into one research session; the agent reads all pinned pages as context
- Browser-native agent tools: highlight, scroll, fill forms, screenshot, read/open URLs
- 9 page-type extractors (GitHub, arXiv, SEC, PubMed, Wikipedia, YouTube, Twitter/X, Hacker News, generic)
- Rich Markdown chat with source citations, copy, and stop
- Session export (JSON/Markdown), rename, search, batch pin, agent's view
- Dark mode, keyboard navigation, English + Simplified Chinese

## Quick Start

```bash
# 0. Start JiuwenSwarm (must be running)
jiuwenswarm-start            # gateway on ws://127.0.0.1:19000

# 1. Build
npm install
npm run build                # → dist/

# 2. Load unpacked in Chrome
# chrome://extensions → Developer mode → Load unpacked → select dist/
```

## Documentation

- [User Guide](docs/en/browser-extension/BrowserExtensionGuide.md)
- [Installation](docs/en/browser-extension/BrowserExtensionInstall.md)

## Development

```bash
npm run dev          # watch-mode build
npm run type-check   # TypeScript type-check
npm run lint         # ESLint
npm run test         # unit tests (Vitest)
npm run build        # production build
npm run pack         # → jiuwenswarm-browser-<version>.zip
```

## Repository layout

```
browser/       The extension package (src, tests, configs, manifest, icons)
docs/          User-facing docs (en + zh)
internal/      Working/design docs (not shipped)
```
