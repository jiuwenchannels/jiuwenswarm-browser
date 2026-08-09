# User Guide

## Overview

JiuwenSwarm Browser is a Chrome extension that puts the JiuwenSwarm AI agent
alongside any page you are reading. Unlike a standalone chat UI, it reads the
content of your current tab, lets you pin multiple pages into a single
**research session**, and allows the agent to interact with what you see
on screen.

---

## Core Concepts

### Research Session
A named conversation scope. All pinned pages, chat history, and agent context
belong to a session. You can have multiple sessions and switch between them.

### Pinned Page
A snapshot of a page's extracted text added to the active session's context.
When you send a message, the agent automatically receives the combined text
of all pinned pages as background context — no copy-pasting needed.

### Side Panel
The main UI. Opens beside the page (not as an overlay), so you can read and
chat simultaneously without losing your place.

---

## Getting Started

### Open the Side Panel

Three ways to open it:

| Method | Action |
|---|---|
| Keyboard shortcut | **Ctrl+Shift+J** (Mac: **Cmd+Shift+J**) |
| Toolbar icon | Click the JiuwenSwarm icon → **Open panel** |
| Right-click menu | Right-click any page → **Summarize this page** or **Pin this page** |

### Create Your First Session

1. Open the side panel.
2. Click **+ New** (top right of the panel).
3. Type a session name, e.g. "Competitive analysis Q3".
4. Press **Enter**. The session is created and becomes active.

You can rename or delete sessions later from the session picker (click the
session name in the header).

---

## Working with Pages

### Pin a Page

Pinning extracts the page's main content and adds it to the active session's
context. The agent will use it when answering your questions.

**Methods:**
- **Keyboard:** Press **Ctrl+Shift+P** (Mac: **Cmd+Shift+P**) on any tab.
- **Button:** Open the side panel → click **📌 Pin page**.
- **Right-click:** Right-click the page → **Pin this page to research session**.

The pinned page appears as a chip in the context bar under the header.
Hover over a chip to see the full URL. Click **×** to unpin.

### Page Types

The extension automatically detects the page type and applies a specialized
extractor:

| Page type | What is extracted |
|---|---|
| **Article / news** | Main body text via Readability.js |
| **GitHub** | README, issue/PR body, comments, repo description |
| **arXiv** | Title, authors, abstract, full paper (ar5iv.org) |
| **SEC EDGAR** | Filing content, 10-K/10-Q/8-K document body |
| **PubMed** | Abstract, full text (PMC), authors, MeSH terms |
| **Generic** | Readability fallback on any other page |

> **PDFs** opened directly in Chrome (URL ending in `.pdf`) are detected
> and noted as PDF type. Full text extraction from binary PDFs requires
> a server-side tool and is a v2 feature.

### Research Across Multiple Tabs

1. Open several tabs — a paper, a company's investor page, a news article.
2. Pin each tab using **Ctrl+Shift+P**.
3. All pinned pages appear as chips in the context bar.
4. Ask the agent in the side panel — it receives all pinned content as context.

Example prompt after pinning three pages:
> "Compare the revenue growth claims in these three sources and flag any
> contradictions."

---

## Using the Chat

### Sending Messages

Type your message in the chat input at the bottom of the side panel and press
**Enter** (or click Send).

The agent automatically receives:
- Your message
- Combined text of all pages pinned to the active session
- Session mode (Research / Chat / Summarize / Compare)

### Ask About Selected Text

Highlight any text on the page, then press **Ctrl+Shift+A** (Mac: **Cmd+Shift+A**).
The side panel opens and pre-fills the chat input with your selection quoted —
ready for you to add a question.

Alternatively: select text → right-click → **Ask JiuwenSwarm about "..."**

### Summarize a Page

Right-click anywhere on the page → **Summarize this page**. The side panel
opens with a pre-filled summary request. The page is temporarily added to
context for that request.

### Session Modes

| Mode | Best for |
|---|---|
| **Research** | Multi-source analysis, cross-referencing, fact-checking |
| **Chat** | Open-ended conversation without pinned context |
| **Summarize** | Distilling a single page or set of pages |
| **Compare** | Side-by-side comparison of two or more sources |

Change the mode when creating a session or via the session picker dropdown.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **Ctrl+Shift+J** | Open / close side panel |
| **Ctrl+Shift+P** | Pin current tab to active session |
| **Ctrl+Shift+A** | Ask about selected text |

Mac users: replace **Ctrl** with **Cmd**.

To customize shortcuts: `chrome://extensions/shortcuts`

---

## Managing Sessions

### Switch Sessions
Click the session name label in the panel header to open the session picker.
Click any session to switch to it. The context bar updates to show that
session's pinned pages.

### Create a New Session
Click **+ New** in the panel header. Name the session and press Enter.

### Session Persistence
Sessions and pinned page metadata are stored locally in Chrome storage.
They survive browser restarts. Chat history is stored server-side in the
JiuwenSwarm server's session registry.

---

## Settings

Open settings via the popup (**⚙ Settings**) or right-click the toolbar icon →
**Options**.

| Setting | Default | Description |
|---|---|---|
| Host | 127.0.0.1 | IP or hostname of the JiuwenSwarm server |
| Port | 19000 | WebSocket port |
| Default mode | Research | Mode for newly created sessions |
| Auto-extract | On | Extract page context automatically when panel opens |
| Show annotations | On | Highlight text passages cited by the agent |

---

## Troubleshooting

### Red status dot / "Not connected"

1. Ensure the JiuwenSwarm server is running.
2. Verify the host and port in Settings match your server configuration.
3. If the server is on a different port, update Settings → Save → wait 5 seconds.

### Page context is empty or wrong

- Some pages block content scripts (bank portals, Chrome internal pages).
  These pages cannot be extracted.
- SPA pages (React, Next.js) may need a moment to render. Try unpinning and
  re-pinning after the page fully loads.
- PDF pages shown inline in Chrome: extraction requires a v2 server-side tool.

### Side panel does not open

Chrome 114+ is required for the Side Panel API. Update Chrome if the panel
command has no effect.

### Context is cut off

Pages are capped at 120,000 characters per page. Very long documents
(e.g., large SEC filings) are truncated. A `[...truncated]` marker appears
in the extracted text. The server also enforces its own context window limit.

---

## Privacy

- **All processing is local.** The extension communicates exclusively with
  `ws://127.0.0.1` (or your configured local address). No data is sent to
  any external server by the extension itself.
- Page content is held in the extension's in-memory cache and in Chrome local
  storage. It is never transmitted outside your machine except to your local
  JiuwenSwarm server.
- Uninstalling the extension deletes all locally stored data.
