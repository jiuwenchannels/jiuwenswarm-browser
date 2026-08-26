# Roadmap

Planned next steps for the JiuwenSwarm browser extension. This document covers
what is not yet built. For what the extension currently does, see the
[User Guide](USER_GUIDE.md).

---

## Collaboration and Annotations

**Goal:** Make research shareable across users.

### Team Sessions

Requires a shared JiuwenSwarm server instance (multi-user deployment). Multiple
users pin pages to a shared session; pinned pages and chat sync in real time via
the server WebSocket broadcast.

---

## Multi-Browser Support

**Goal:** Make the extension available beyond Chrome.

### Firefox

Firefox does not support `chrome.sidePanel`. The `browser.sidebarAction` API is the
Firefox equivalent and requires a separate manifest entry. Content scripts and
background logic need minimal changes; the Firefox build shares the same codebase via
a Firefox-specific manifest.

---

## Smart Context Ranking

**Goal:** Use more of the context budget for pages that are actually relevant to the
current question, rather than sending all pinned pages in pin-order.

### Relevance-Based Context Selection

When the combined text of all pinned pages exceeds `MAX_CONTEXT_CHARS`, rank pages by
relevance to the current user query using TF-IDF or a lightweight embedding match, and
include the top-ranked pages first. Pages that fall below the budget get a summarized
version rather than being dropped entirely. The ranking runs in the background service
worker synchronously (no LLM call) to keep latency low.

### Page Change Alerts

Detect when a previously pinned page has changed since it was pinned. On the next visit
to a pinned URL, compare the current extracted text to the stored context using a
normalized diff. If the page has changed by more than a configurable threshold, show a
visual indicator on the chip (e.g. a `↻` badge with a "content changed" tooltip) and
offer one-click re-pin.

---

## Distribution

**Goal:** Extension ready for the Chrome Web Store, Chinese browser stores, and Firefox.

**Goal:** Extension ready for the Chrome Web Store and Firefox.

### Chrome Web Store

- Replace placeholder icons with production SVG-derived PNGs (5 required sizes)
- Write store listing: description, screenshots, privacy policy URL
- MV3 security audit: no remote code execution, no eval
- Test on Chrome Stable and Chrome Beta channels

### Chrome Web Store Listing

Write the store listing: description, screenshots, privacy policy URL. Test on
Chrome Stable and Chrome Beta channels.

### Chinese Browser Stores

Once the popup-window fallback (above) is in place, publish to the 360 Extension
Store and the QQ Browser store. Both require a Chinese developer account or a
verified foreign-company account.

### Automated Testing

- Playwright end-to-end tests with `chrome` extension loading
- Unit tests for `Extractor.ts`, `PageTypeDetector.ts`, all adapters, `ContextCache.ts`
- CI on push: build + lint + unit tests

---

## Future Ideas

| Idea | Notes |
|---|---|
| **Reader overlay** | Render the extracted page (the Agent's view) in a full-page overlay with chat attached |
| **Schedule research** | Background agent runs while away; notifies with findings |
| **Databricks / Colab adapter** | Detect notebook-like environments, extract cell outputs |
| **Link graph** | Visualize connections between pinned pages based on shared topics |
| **Voice input** | Web Speech API → text; the web app already has voice in/out via the shared chat iframe |
| **Cron research jobs** | Schedule recurring research tasks; the web app has a cron panel; extension surfaces a simplified "monitor this topic" shortcut |
| **Custom adapters** | Let users define domain-specific extraction rules for internal tools and intranets via a JSON config |
| **Team sessions** | Requires a shared JiuwenSwarm server instance (multi-user deployment); multiple users pin pages to a shared session; pinned pages and chat sync in real time via server WebSocket broadcast |

> Several earlier "future ideas" have since been implemented and are no longer listed:
> offline re-reading, batch pin, auto-summarize on pin, and full-text search. Ideas that
> referenced persistent page annotations were dropped when that feature was removed.
