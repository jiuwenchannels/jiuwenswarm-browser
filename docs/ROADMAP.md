# Roadmap

Planned next steps for the JiuwenSwarm browser extension. This document covers
what is not yet built. For what the extension currently does, see the
[User Guide](USER_GUIDE.md).

---

## Research Session Management

**Goal:** Make a research session a first-class artifact, not just a chat thread.

### Export

Export a session as a portable research package:
- Session title, mode, date
- List of pinned pages: URL, title, page type, extraction summary
- Full conversation transcript
- Agent-generated synthesis (if requested)
- Download as `.md` or `.json`; `.json` is re-importable

Note: the JiuwenSwarm web app already exports conversation transcripts and screenshot
snapshots. The extension's export is complementary — it bundles the pinned-page content
together with the conversation, producing a self-contained research record.

### Import and Merge

- Import a previously exported session JSON — restores pinned page list and session metadata
- Merge two sessions (combine pinned page lists; conversation history stays server-side)

### Open in Web App

One-click button to open the active session in the full JiuwenSwarm web app, giving
access to teams, skills, code review, goal tracking, and other panels not available
in the side panel. The extension serves as a lightweight entry point; heavy work
moves to the web app naturally.

### Session Templates

Pre-built session starters that suggest which pages to pin and pre-fill structured prompts:
- **Company research** — LinkedIn, Crunchbase, investor page, recent news
- **Paper review** — structured prompts for summary, methodology, criticism
- **Due diligence** — SEC filings, financials, news, competitors

---

## Collaboration and Annotations

**Goal:** Make research persistent across visits and shareable across users.

### Persistent Page Annotations

When the agent highlights a passage in a tab, save that highlight to storage so it
reappears on the next visit to the same URL. Allow the user to add sticky notes
attached to highlights.

### Note-Taking Sidebar

A lightweight markdown editor inside the side panel (below the context bar). Notes
auto-save to the active session and are referenced in agent context as
"The user noted: …".

### Team Sessions

Requires a shared JiuwenSwarm server instance (multi-user deployment). Multiple
users pin pages to a shared session; pinned pages and chat sync in real time via
the server WebSocket broadcast.

---

## Distribution

**Goal:** Extension ready for the Chrome Web Store and Firefox.

### Chrome Web Store

- Replace placeholder icons with production SVG-derived PNGs (5 required sizes)
- Write store listing: description, screenshots, privacy policy URL
- MV3 security audit: no remote code execution, no eval
- Test on Chrome Stable and Chrome Beta channels

### Firefox

Firefox does not yet support `chrome.sidePanel` — the equivalent is `sidebar_action`.
The content scripts and background logic need minimal changes; the Firefox build
will share the same codebase with a Firefox-specific entry in `manifest.json`.

### Automated Testing

- Playwright end-to-end tests with `chrome` extension loading
- Unit tests for `Extractor.ts`, `PageTypeDetector.ts`, all adapters, `ContextCache.ts`
- CI on push: build + lint + unit tests

---

## Future Ideas

| Idea | Notes |
|---|---|
| **Offline mode** | Cache last agent response for re-reading without server |
| **Reading mode overlay** | Render Readability output in a clean overlay (like Reader Mode) with chat attached |
| **Batch pin** | Pin all open tabs in the current window to a session at once |
| **Schedule research** | Background agent runs while away; notifies with findings |
| **Databricks / Colab adapter** | Detect notebook-like environments, extract cell outputs |
| **Auto-summarize on pin** | Immediately ask the agent for a 3-sentence summary when a page is pinned |
| **Link graph** | Visualize connections between pinned pages based on shared topics |
| **Voice input** | Web Speech API → text; the web app already has voice in/out via the shared chat iframe |
| **Cron research jobs** | Schedule recurring research tasks; the web app has a cron panel; extension surfaces a simplified "monitor this topic" shortcut |
