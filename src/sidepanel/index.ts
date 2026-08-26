/**
 * Side panel entry point.
 *
 * Wires ChatBridge, SessionPicker, ContextBar, and the new session form,
 * more-menu (export / import / open-in-web-app), and session templates.
 */

import { createLogger } from "@shared/logger";
import {
  getPinnedPagesBySession,
  removePinnedPage,
  addPinnedPage,
  movePinnedPage,
  loadPinnedPages as loadAllPinnedPages,
  loadSettings,
  saveLastResponse,
  loadLastResponse,
  loadChatHistory,
  saveChatHistory,
  hasSeenTour,
  markTourSeen,
} from "@shared/storage";
import { PinnedPage, ResearchSession, ChatEntry } from "@shared/types";
import { MSG } from "@shared/constants";
import { BackgroundReply } from "@shared/messages";
import { initI18n, applyStaticI18n, t } from "@shared/i18n";

import { ChatBridge } from "./ChatBridge";
import { SessionPicker } from "./SessionPicker";
import { ContextBar } from "./ContextBar";
import { renderMarkdown } from "./markdown";
import {
  exportSessionJson,
  exportSessionMarkdown,
} from "./SessionExporter";

const log = createLogger("sidepanel");

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const statusDot       = document.getElementById("status-dot")!;
const sessionLabel    = document.getElementById("session-label")!;
const sessionPickerEl = document.getElementById("session-picker")!;
const pinBtn          = document.getElementById("pin-btn")!;
const pinChipsEl      = document.getElementById("pin-chips")!;
const chatMessages    = document.getElementById("chat-messages")!;
const chatEmpty       = document.getElementById("chat-empty")!;
const chatEmptyTitle  = document.getElementById("chat-empty-title")!;
const chatStatus      = document.getElementById("chat-status")!;
const createSessionCta = document.getElementById("create-session-cta") as HTMLButtonElement;
const chatInput       = document.getElementById("chat-input") as HTMLTextAreaElement;
const chatSend        = document.getElementById("chat-send") as HTMLButtonElement;
const stopBtn         = document.getElementById("stop-btn") as HTMLButtonElement;

// Connection banner
const connBanner      = document.getElementById("conn-banner")!;
const connBannerText  = document.getElementById("conn-banner-text")!;
const connRetryBtn    = document.getElementById("conn-retry-btn")!;

// Toast
const toastEl         = document.getElementById("toast")!;

// Tour
const tourEl          = document.getElementById("tour")!;
const tourTitle       = document.getElementById("tour-title")!;
const tourBody        = document.getElementById("tour-body")!;
const tourNext        = document.getElementById("tour-next")!;
const tourPrev        = document.getElementById("tour-prev")!;
const tourSkip        = document.getElementById("tour-skip")!;
const tourDots        = document.getElementById("tour-dots")!;

// Suggestions
const suggestionsEl   = document.getElementById("suggestions")!;

// Header buttons
const newSessionBtn   = document.getElementById("new-session-btn")!;
const moreBtn         = document.getElementById("more-btn")!;

// Session actions menu (⋯)
const sessionActionsMenu = document.getElementById("session-actions-menu")!;
const saExportJson    = document.getElementById("sa-export-json")!;
const saExportMd      = document.getElementById("sa-export-md")!;
const saRename        = document.getElementById("sa-rename")!;
const saPinAll        = document.getElementById("sa-pin-all")!;
const saSearch        = document.getElementById("sa-search")!;
const saReader        = document.getElementById("sa-reader")!;
const saTour          = document.getElementById("sa-tour")!;
const saPrivacy       = document.getElementById("sa-privacy")!;

// Reading-mode overlay
const readerEl        = document.getElementById("reader")!;
const readerBack      = document.getElementById("reader-back")!;
const readerContent   = document.getElementById("reader-content")!;

// Privacy modal
const privacyEl       = document.getElementById("privacy")!;
const privacyBody     = document.getElementById("privacy-body")!;
const privacyClose    = document.getElementById("privacy-close")!;

// Search modal
const searchEl        = document.getElementById("search")!;
const searchInput     = document.getElementById("search-input") as HTMLInputElement;
const searchResults   = document.getElementById("search-results")!;
const searchClose     = document.getElementById("search-close")!;

// New session form
const newSessionForm  = document.getElementById("new-session-form")!;
const nfTitle         = document.getElementById("nf-title") as HTMLInputElement;
const nfCreateBtn     = document.getElementById("nf-create-btn")!;
const nfCancelBtn     = document.getElementById("nf-cancel-btn")!;

// Detect UI language before any translated strings are evaluated.
initI18n();
applyStaticI18n();

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

let _sessions: ResearchSession[] = [];
let _activeSessionId: string | null = null;
let _settings: Awaited<ReturnType<typeof loadSettings>> | null = null;
let _chatHistory: ChatEntry[] = [];
let _renderedSessionId: string | null = null;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const bridge = new ChatBridge();

const picker = new SessionPicker(sessionPickerEl, sessionLabel, (id) => {
  _activeSessionId = id;
  bridge.setActiveSession(id);
  loadPinnedPages(id);
  closeSessionPicker();
});

const contextBar = new ContextBar(
  pinChipsEl,
  async (page) => {
    await onUnpin(page);
  },
  (page) => {
    bridge.retryPin(page.tabId, page.id);
  },
  async (id, dir) => {
    if (!_activeSessionId) return;
    await movePinnedPage(_activeSessionId, id, dir);
    await loadPinnedPages(_activeSessionId);
  }
);

// ---------------------------------------------------------------------------
// Background event bus
// ---------------------------------------------------------------------------

window.addEventListener("jiuwen:bg", (ev: Event) => {
  const msg = (ev as CustomEvent).detail as BackgroundReply;
  handleBgMsg(msg);
});

function handleBgMsg(msg: BackgroundReply): void {
  // Background replies use msg.action ("status"/"sessions"), while raw server
  // envelopes use msg.type ("token"/"done"/"error") — accept either.
  const action =
    (msg as { action?: string }).action ?? (msg as { type?: string }).type ?? "";

  switch (action) {
    case MSG.STATUS: {
      const m = msg as Extract<BackgroundReply, { action: "status" }>;
      setConnected(m.connected);
      break;
    }

    case "token": {
      const m = msg as Extract<BackgroundReply, { type: "token" }>;
      if (m.payload.text) appendStreamText(m.payload.text);
      break;
    }

    case "done": {
      const m = msg as Extract<BackgroundReply, { type: "done" }>;
      endTurn(m.payload.text);
      break;
    }

    case "error": {
      const m = msg as Extract<BackgroundReply, { action: "error" } | { type: "error" }>;
      const message = "message" in m ? m.message : m.payload.message ?? "Unknown error";
      endTurn();
      renderError(humanizeError(message));
      break;
    }

    case "sessions": {
      const m = msg as Extract<BackgroundReply, { action: "sessions" }>;
      _sessions = m.sessions;
      const activeId = m.activeId;
      _activeSessionId = activeId;
      picker.update(_sessions, activeId);
      if (activeId) {
        loadPinnedPages(activeId);
        renderSessionChatIfNeeded(activeId);
      }
      break;
    }

    case "session_created": {
      const m = msg as Extract<BackgroundReply, { action: "session_created" }>;
      const session = m.session;
      _sessions = [session, ..._sessions.filter((s) => s.id !== session.id)];
      _activeSessionId = session.id;
      picker.update(_sessions, session.id);
      loadPinnedPages(session.id);
      renderSessionChatIfNeeded(session.id);
      break;
    }

    case "session_changed": {
      const m = msg as Extract<BackgroundReply, { action: "session_changed" }>;
      const activeId = m.activeId;
      _activeSessionId = activeId;
      if (activeId) {
        loadPinnedPages(activeId);
        renderSessionChatIfNeeded(activeId);
      }
      break;
    }

    case "tool": {
      const m = msg as Extract<BackgroundReply, { action: "tool" }>;
      renderToolStatus(m.tool);
      break;
    }

    case "pinned": {
      const m = msg as Extract<BackgroundReply, { action: "pinned" }>;
      contextBar.addPage(m.page);
      showToast(t("toast.pinned"));
      refreshSuggestions();
      maybeAutoSummarize(m.page);
      break;
    }

    case "refresh_pins": {
      if (_activeSessionId) loadPinnedPages(_activeSessionId);
      break;
    }

    case "ask_selection": {
      const m = msg as Extract<BackgroundReply, { action: "ask_selection" }>;
      _contextTabId = m.tabId ?? null;
      chatInput.value = `> "${m.text}"\n\n`;
      chatInput.dispatchEvent(new Event("input"));
      chatInput.focus();
      break;
    }

    case "summarize_tab": {
      const m = msg as Extract<BackgroundReply, { action: "summarize_tab" }>;
      _contextTabId = m.tabId;
      _sendUserMessage(
        "Summarize this page in 2-3 short sentences. Be brief and direct — just the key point."
      );
      break;
    }

    case "reader":
      openReadingMode();
      break;

    case "search_selection": {
      const m = msg as Extract<BackgroundReply, { action: "search_selection" }>;
      openSearch(m.text);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Session picker toggle
// ---------------------------------------------------------------------------

sessionLabel.addEventListener("click", () => {
  const isOpen = sessionPickerEl.classList.toggle("open");
  if (isOpen) closeMoreMenu();
});

function closeSessionPicker(): void {
  sessionPickerEl.classList.remove("open");
}

// ---------------------------------------------------------------------------
// More menu (⋯)
// ---------------------------------------------------------------------------

moreBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = sessionActionsMenu.classList.toggle("open");
  if (isOpen) closeSessionPicker();
});

function closeMoreMenu(): void {
  sessionActionsMenu.classList.remove("open");
}

// Close both dropdowns when clicking outside
document.addEventListener("click", () => {
  closeSessionPicker();
  closeMoreMenu();
});

// Stop clicks inside the menus from propagating to the document listener
sessionPickerEl.addEventListener("click", (e) => e.stopPropagation());
sessionActionsMenu.addEventListener("click", (e) => e.stopPropagation());

// ---------------------------------------------------------------------------
// Session actions: export / import / open in web app
// ---------------------------------------------------------------------------

saExportJson.addEventListener("click", async () => {
  closeMoreMenu();
  const session = _activeSession();
  if (!session) return;
  try {
    await exportSessionJson(session);
  } catch (e) {
    log.warn("export JSON failed", e);
  }
});

saExportMd.addEventListener("click", async () => {
  closeMoreMenu();
  const session = _activeSession();
  if (!session) return;
  try {
    await exportSessionMarkdown(session);
  } catch (e) {
    log.warn("export Markdown failed", e);
  }
});




saRename.addEventListener("click", () => {
  closeMoreMenu();
  if (!_activeSessionId) return;
  const session = _activeSession();
  const current = session?.title ?? "";
  const name = window.prompt(t("rename.prompt"), current);
  if (name == null) return; // cancelled
  bridge.renameSession(_activeSessionId, name.trim());
});

saPinAll.addEventListener("click", () => {
  closeMoreMenu();
  if (!_activeSessionId) {
    promptForSession(t("session.required.pin"));
    return;
  }
  bridge.pinAllTabs();
  showToast(t("toast.pinAll"));
});

saPrivacy.addEventListener("click", () => {
  closeMoreMenu();
  openPrivacy();
});

privacyClose.addEventListener("click", closePrivacy);

// Reading mode
saReader.addEventListener("click", () => {
  closeMoreMenu();
  openReadingMode();
});
readerBack.addEventListener("click", closeReadingMode);

async function openReadingMode(): Promise<void> {
  readerEl.classList.add("open");
  readerContent.innerHTML = `<div id="reader-loading">${t("reader.loading")}</div>`;
  try {
    const resp = await chrome.runtime.sendMessage({ action: MSG.GET_ACTIVE_CONTEXT });
    const ctx = resp?.context;
    if (!ctx) {
      readerContent.innerHTML = `<div id="reader-error">${t("reader.error")}</div>`;
      return;
    }
    const article = document.createElement("article");    article.id = "reader-article";
    const h1 = document.createElement("h1");
    h1.textContent = ctx.title || ctx.url;
    const meta = document.createElement("div");
    meta.className = "reader-meta";
    meta.textContent = `${ctx.url} · ${ctx.pageType}`;
    const note = document.createElement("div");
    note.className = "reader-note";
    note.textContent = t("reader.note");
    const body = document.createElement("div");
    body.className = "reader-body";
    body.textContent = ctx.text || "—";
    article.appendChild(h1);
    article.appendChild(meta);
    article.appendChild(note);
    article.appendChild(body);
    readerContent.innerHTML = "";
    readerContent.appendChild(article);
  } catch {
    readerContent.innerHTML = `<div id="reader-error">${t("reader.error")}</div>`;
  }
}

function closeReadingMode(): void {
  readerEl.classList.remove("open");
}

// Full-text search
saSearch.addEventListener("click", () => {
  closeMoreMenu();
  openSearch();
});
searchClose.addEventListener("click", closeSearch);

let _searchTimer: number | null = null;
searchInput.addEventListener("input", () => {
  if (_searchTimer != null) window.clearTimeout(_searchTimer);
  _searchTimer = window.setTimeout(runSearch, 250);
});

// ---------------------------------------------------------------------------
// New session form
// ---------------------------------------------------------------------------

newSessionBtn.addEventListener("click", () => {
  const isOpen = newSessionForm.classList.contains("open");
  if (isOpen) {
    newSessionForm.classList.remove("open");
    _resetForm();
  } else {
    openNewSessionForm();
  }
});

nfCancelBtn.addEventListener("click", () => {
  newSessionForm.classList.remove("open");
  _resetForm();
});

nfCreateBtn.addEventListener("click", () => {
  bridge.createSession(nfTitle.value.trim());
  newSessionForm.classList.remove("open");
  _resetForm();
});

// Allow submitting the form with Enter in the title field
nfTitle.addEventListener("keydown", (e) => {
  if (e.key === "Enter") nfCreateBtn.click();
  if (e.key === "Escape") nfCancelBtn.click();
});

function _resetForm(): void {
  nfTitle.value = "";
}

// ---------------------------------------------------------------------------
// Pin button
// ---------------------------------------------------------------------------

pinBtn.addEventListener("click", () => {
  if (!_activeSessionId) {
    promptForSession(t("session.required.pin"));
    return;
  }
  bridge.pinCurrentTab();
});

createSessionCta.addEventListener("click", () => {
  openNewSessionForm();
});
createSessionCta.textContent = t("cta.create.session");

// Arrow-key navigation between pinned-page chips (context bar).
pinChipsEl.addEventListener("keydown", (ev) => {
  if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
  const chips = Array.from(
    pinChipsEl.querySelectorAll<HTMLElement>(".pin-chip")
  );
  if (chips.length === 0) return;
  const current = document.activeElement as HTMLElement | null;
  let idx = current ? chips.indexOf(current) : -1;
  if (idx < 0) idx = ev.key === "ArrowRight" ? -1 : chips.length;
  idx += ev.key === "ArrowRight" ? 1 : -1;
  if (idx < 0 || idx >= chips.length) return;
  ev.preventDefault();
  chips[idx].focus();
});

// ---------------------------------------------------------------------------
// New-session helpers (used by + New, the empty-state CTA, and action guards)
// ---------------------------------------------------------------------------

function openNewSessionForm(): void {
  newSessionForm.classList.add("open");
  nfTitle.focus();
  closeSessionPicker();
  closeMoreMenu();
}

function promptForSession(message: string): void {
  openNewSessionForm();
  showToast(message);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _activeSession(): ResearchSession | undefined {
  return _sessions.find((s) => s.id === _activeSessionId);
}

async function loadPinnedPages(sessionId: string): Promise<void> {
  const pages = await getPinnedPagesBySession(sessionId);
  contextBar.update(pages);
  updateCreateSessionCta();
}

// ---------------------------------------------------------------------------
// Chat history (persisted per session, reloaded on reopen / switch)
// ---------------------------------------------------------------------------

function persistChatHistory(): void {
  if (!_activeSessionId) return;
  saveChatHistory(_activeSessionId, _chatHistory).catch(() => {});
}

function renderHistoryUser(text: string, ts: number): void {
  const el = document.createElement("div");
  el.className = "msg user";
  const body = document.createElement("div");
  body.textContent = text;
  el.appendChild(body);
  _addMessageFooter(el, text, ts);
  chatMessages.appendChild(el);
}

function renderHistoryAssistant(text: string, ts: number): void {
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.innerHTML = renderMarkdown(text);
  _addMessageFooter(el, text, ts);
  chatMessages.appendChild(el);
}

async function loadSessionChat(sessionId: string): Promise<void> {
  _chatHistory = await loadChatHistory(sessionId);
  // Clear any live-rendered messages but keep the empty-state node.
  Array.from(chatMessages.children).forEach((c) => {
    if (c.id !== "chat-empty") c.remove();
  });
  _lastUserEl = null;
  _assistantRaw = "";
  _chatStarted = _chatHistory.length > 0;
  updateChatStatus();
  chatEmpty.style.display = _chatStarted ? "none" : "";
  for (const entry of _chatHistory) {
    if (entry.role === "user") {
      renderHistoryUser(entry.text, entry.ts);
    } else {
      renderHistoryAssistant(entry.text, entry.ts);
    }
  }
  if (_chatHistory.length > 0) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/** Render a session's history once, unless it is already showing. */
async function renderSessionChatIfNeeded(sessionId: string): Promise<void> {
  if (_renderedSessionId === sessionId) return;
  _renderedSessionId = sessionId;
  await loadSessionChat(sessionId);
}

// ---------------------------------------------------------------------------
// Empty-state stats (progression / "my research" feel)
// ---------------------------------------------------------------------------

async function updateCreateSessionCta(): Promise<void> {
  if (!_connected || _chatStarted || !!_activeSessionId) {
    createSessionCta.hidden = true;
  } else {
    createSessionCta.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Unpin with undo
// ---------------------------------------------------------------------------

let _undoTimer: number | null = null;

async function onUnpin(page: PinnedPage): Promise<void> {
  await removePinnedPage(page.id);
  if (_activeSessionId) await loadPinnedPages(_activeSessionId);
  showUndoToast(page);
}

function showUndoToast(page: PinnedPage): void {
  toastEl.innerHTML = `${t("toast.unpinned")} <button class="toast-undo">${t("toast.undo")}</button>`;
  toastEl.classList.add("show");
  if (_undoTimer != null) window.clearTimeout(_undoTimer);
  const undoBtn = toastEl.querySelector<HTMLButtonElement>(".toast-undo");
  undoBtn?.addEventListener("click", async () => {
    if (_undoTimer != null) window.clearTimeout(_undoTimer);
    await addPinnedPage(page);
    if (_activeSessionId) await loadPinnedPages(_activeSessionId);
    toastEl.classList.remove("show");
    showToast(t("toast.restored"));
  });
  _undoTimer = window.setTimeout(() => toastEl.classList.remove("show"), 3000);
}

// ---------------------------------------------------------------------------
// Native chat rendering
// ---------------------------------------------------------------------------

let _connected = false;
let _streaming = false;
let _assistantEl: HTMLDivElement | null = null;
let _assistantRaw = "";
let _assistantRaf: number | null = null;
let _chatStarted = false;
let _stopRequested = false;
let _lastUserEl: HTMLDivElement | null = null;
let _lastTurnStart = 0;
/** Tab the last "summarize this page" / "ask selection" action targeted. */
let _contextTabId: number | null = null;
let _connBannerTimer: number | null = null;

/** Connection status shown at the bottom of the empty state; hidden with it. */
function updateChatStatus(): void {
  chatStatus.textContent = _connected ? t("empty.ready") : t("empty.waiting");
}

function setConnected(connected: boolean): void {
  _connected = connected;
  statusDot.classList.toggle("connected", connected);
  chatEmptyTitle.textContent = connected ? t("empty.title.ready") : t("empty.title.waiting");
  connBannerText.textContent = t("conn.lost");
  updateChatStatus();
  if (connected) {
    // Clear any pending "lost connection" debounce.
    if (_connBannerTimer != null) {
      window.clearTimeout(_connBannerTimer);
      _connBannerTimer = null;
    }
    connBanner.classList.remove("show");
  } else {
    // Debounce: only show the banner if still disconnected after a few seconds,
    // so MV3 service-worker suspension doesn't flash "Lost connection" on every
    // idle drop even though the server is fine.
    if (_connBannerTimer == null) {
      _connBannerTimer = window.setTimeout(() => {
        _connBannerTimer = null;
        connBanner.classList.add("show");
        // Nudge a reconnect in case the background's own backoff stalled.
        bridge.reconnect();
      }, 3000);
    }
  }
  chatInput.disabled = !connected || _streaming;
  chatSend.disabled = !connected || _streaming || !chatInput.value.trim();
  chatSend.hidden = _streaming;
  stopBtn.hidden = !_streaming;
  if (connected) {
    refreshSuggestions();
  } else {
    maybeShowCachedResponse();
  }
  updateCreateSessionCta();
}

/** Offline mode: if the chat is empty and a previous answer is cached, show it. */
function maybeShowCachedResponse(): void {
  if (chatMessages.children.length > 0) return;
  loadLastResponse().then((cached) => {
    if (!cached || !cached.text) return;
    _chatStarted = true;
    updateChatStatus();
    chatEmpty.style.display = "none";
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.innerHTML = renderMarkdown(cached.text);
    const note = document.createElement("div");
    note.className = "msg-ts";
    note.textContent = t("offline.cached");
    el.appendChild(note);
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }).catch(() => {});
}
/** If the "auto-summarize on pin" setting is on, request a short summary for the pinned page. */
function maybeAutoSummarize(page: PinnedPage): void {
  if (!_settings?.autoSummarizeOnPin || !_connected || _streaming) return;
  _contextTabId = page.tabId;
  _sendUserMessage(
    "Summarize this page in 2-3 short sentences. Be brief and direct — just the key point."
  );
}

void loadSettings().then((s) => { _settings = s; }).catch(() => {});

async function refreshSuggestions(): Promise<void> {
  suggestionsEl.innerHTML = "";
  if (!_connected || _chatStarted) return;
  // "Compare" only makes sense with at least two pinned pages.
  const pinnedCount = _activeSessionId
    ? (await getPinnedPagesBySession(_activeSessionId)).length
    : 0;
  const buttons: { label: string; action: () => void }[] = [
    {
      label: t("sug.summarize"),
      action: () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id == null) return;
          _contextTabId = tab.id;
          chatInput.value = "Summarize this page in 2-3 short sentences. Be brief and direct — just the key point.";
          chatInput.dispatchEvent(new Event("input"));
          chatInput.focus();
        });
      },
    },
  ];
  if (pinnedCount >= 2) {
    buttons.push({
      label: t("sug.compare"),
      action: () => {
        chatInput.value = "Compare the pinned pages and flag the key differences.";
        chatInput.dispatchEvent(new Event("input"));
        chatInput.focus();
      },
    });
  }

  for (const b of buttons) {
    const el = document.createElement("button");
    el.className = "sug";
    el.textContent = b.label;
    el.addEventListener("click", b.action);
    suggestionsEl.appendChild(el);
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addTurnDivider(ts: number): void {
  const last = chatMessages.lastElementChild;
  // Only add a divider when there was a prior completed turn in this session.
  if (last && last.className !== "msg-turn-divider") {
    const d = document.createElement("div");
    d.className = "msg-turn-divider";
    d.textContent = formatTime(ts);
    chatMessages.appendChild(d);
  }
}

function renderUserMessage(text: string): void {
  _chatStarted = true;
  chatEmpty.style.display = "none";
  _lastTurnStart = Date.now();
  addTurnDivider(_lastTurnStart);
  _lastUserEl = document.createElement("div");
  _lastUserEl.className = "msg user";
  const body = document.createElement("div");
  body.textContent = text;
  _lastUserEl.appendChild(body);
  _addMessageFooter(_lastUserEl, text, _lastTurnStart);
  chatMessages.appendChild(_lastUserEl);
  updateChatStatus();
  chatMessages.scrollTop = chatMessages.scrollHeight;
  _chatHistory.push({ role: "user", text, ts: _lastTurnStart });
  persistChatHistory();
}

function beginAssistantTurn(): void {
  _chatStarted = true;
  updateChatStatus();
  chatEmpty.style.display = "none";
  _assistantRaw = "";
  _assistantEl = document.createElement("div");
  _assistantEl.className = "msg assistant thinking";
  _assistantEl.innerHTML =
    '<span class="sk-dot"></span><span class="sk-dot"></span><span class="sk-dot"></span>';
  chatMessages.appendChild(_assistantEl);
  updateChatStatus();
}

/** Render the buffered raw text as markdown, throttled to one per frame. */
function scheduleAssistantRender(): void {
  if (_assistantRaf != null || !_assistantEl) return;
  _assistantRaf = requestAnimationFrame(() => {
    _assistantRaf = null;
    if (_assistantEl) {
      _assistantEl.innerHTML = renderMarkdown(_assistantRaw);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
}

function appendStreamText(text: string): void {
  if (_stopRequested) return; // discard tokens arriving after a Stop click
  const isFirst = _assistantRaw === "";
  if (!_assistantEl) beginAssistantTurn();
  _assistantRaw += text;
  if (isFirst && _assistantEl) {
    // Clear the thinking skeleton on the first token.
    _assistantEl.classList.remove("thinking");
    _assistantEl.innerHTML = "";
  }
  scheduleAssistantRender();
}

function endTurn(finalText?: string): void {
  if (_assistantRaf != null) {
    cancelAnimationFrame(_assistantRaf);
    _assistantRaf = null;
  }
  if (_assistantEl) {
    if (finalText) _assistantRaw = finalText;
    _assistantEl.classList.remove("thinking");
    _assistantEl.innerHTML = renderMarkdown(_assistantRaw);
    _appendSources(_assistantEl);
    _addMessageFooter(_assistantEl, _assistantRaw, Date.now());
    _assistantEl = null;
  }
  _streaming = false;
  _stopRequested = false;
  stopBtn.hidden = true;
  chatSend.hidden = false;
  chatInput.disabled = !_connected;
  chatSend.disabled = !_connected || !chatInput.value.trim();
  chatInput.focus();
  // Cache the last answer for offline re-reading.
  if (_assistantRaw.trim()) saveLastResponse(_assistantRaw.trim()).catch(() => {});
  // Persist the assistant turn into chat history.
  if (_assistantRaw.trim()) {
    _chatHistory.push({ role: "assistant", text: _assistantRaw.trim(), ts: Date.now() });
    persistChatHistory();
  }
}

/** Make a small copy icon button (copies the message text on click). */
function _makeCopyIcon(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "msg-copy-icon";
  btn.title = t("msg.copy");
  btn.textContent = "⧉";
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    btn.textContent = "✓";
    window.setTimeout(() => {
      btn.textContent = "⧉";
    }, 1200);
  });
  return btn;
}

/** Append a bottom row with the timestamp (left) and the copy icon (right). */
function _addMessageFooter(el: HTMLElement, text: string, tsValue: number): void {
  const footer = document.createElement("div");
  footer.className = "msg-footer";
  const time = document.createElement("span");
  time.className = "msg-ts";
  time.textContent = formatTime(tsValue);
  footer.appendChild(time);
  footer.appendChild(_makeCopyIcon(text));
  el.appendChild(footer);
}

function _appendSources(el: HTMLElement): void {
  if (!_activeSessionId) return;
  getPinnedPagesBySession(_activeSessionId).then((pages) => {
    if (pages.length === 0) return;
    const wrap = document.createElement("div");
    wrap.className = "msg-sources";
    const label = document.createElement("span");
    label.style.cssText = "font-size:10px;color:var(--text-dim);align-self:center;";
    label.textContent = t("msg.sources");
    wrap.appendChild(label);
    for (const page of pages.slice(0, 8)) {
      const chip = document.createElement("button");
      chip.className = "src-chip";
      chip.textContent = page.context.title || page.context.url;
      chip.title = page.context.url;
      chip.addEventListener("click", () => {
        chrome.tabs.create({ url: page.context.url });
      });
      wrap.appendChild(chip);
    }
    el.appendChild(wrap);
  }).catch(() => {});
}

function renderError(message: string): void {
  chatEmpty.style.display = "none";
  const el = document.createElement("div");
  el.className = "msg error";
  el.textContent = message;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/** Render a small inline chip when the agent acts on the page (tool visibility). */
function renderToolStatus(tool: string): void {
  const labels: Record<string, string> = {
    highlight_text: t("tool.highlight"),
    scroll_to: t("tool.scroll"),
    fill_form: t("tool.fill"),
    take_screenshot: t("tool.screenshot"),
    open_url: t("tool.open"),
    read_page: t("tool.read"),
    pin_page: t("tool.pin"),
    get_selection: t("tool.selection"),
  };
  const text = labels[tool] ?? t("tool.default");
  const chip = document.createElement("div");
  chip.className = "tool-chip";
  chip.textContent = `⚙ ${text}`;
  chatMessages.appendChild(chip);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  // Remove after a short delay so it doesn't accumulate.
  window.setTimeout(() => chip.remove(), 2500);
}

let _toastTimer: number | null = null;
function showToast(text: string): void {  toastEl.textContent = text;
  toastEl.classList.add("show");
  if (_toastTimer != null) window.clearTimeout(_toastTimer);
  _toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
}

/** Turn raw server errors into plain-language messages with a next step. */
function humanizeError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("websocket") || lower.includes("socket") || lower.includes("handshake")) {
    return t("err.websocket");
  }
  if (lower.includes("extract page context") || lower.includes("extraction")) {
    return t("err.extraction");
  }
  if (lower.includes("maximum") || lower.includes("limit")) {
    return raw;
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return t("err.timeout");
  }
  return raw;
}

function _sendUserMessage(text: string): void {
  if (!text || !_connected || _streaming) return;
  if (!_activeSessionId) {
    promptForSession(t("session.required.ask"));
    return;
  }
  renderUserMessage(text);
  chatInput.value = "";
  chatInput.style.height = "auto";
  _streaming = true;
  _stopRequested = false;
  chatInput.disabled = true;
  chatSend.disabled = true;
  chatSend.hidden = true;
  stopBtn.hidden = false;
  beginAssistantTurn();
  bridge.sendChat(text, _contextTabId ?? undefined);
  _contextTabId = null;
}

function sendMessage(): void {
  _sendUserMessage(chatInput.value.trim());
}

stopBtn.addEventListener("click", () => {
  _stopRequested = true;
  endTurn();
});

chatSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
  chatSend.disabled = !_connected || _streaming || !chatInput.value.trim();
});

// ---------------------------------------------------------------------------
// Connection banner
// ---------------------------------------------------------------------------

connRetryBtn.addEventListener("click", () => {
  bridge.reconnect();
  connRetryBtn.textContent = t("conn.reconnecting");
  window.setTimeout(() => {
    connRetryBtn.textContent = t("conn.retry");
  }, 3000);
});

// ---------------------------------------------------------------------------
// First-run tour
// ---------------------------------------------------------------------------

const TOUR_STEPS = [
  { title: t("tour.1.title"), body: t("tour.1.body") },
  { title: t("tour.2.title"), body: t("tour.2.body") },
  { title: t("tour.3.title"), body: t("tour.3.body") },
];

let _tourStep = 0;

function renderTourStep(): void {
  const step = TOUR_STEPS[_tourStep];
  tourTitle.textContent = step.title;
  tourBody.textContent = step.body;
  tourNext.textContent = _tourStep === TOUR_STEPS.length - 1 ? t("tour.gotit") : t("tour.next");
  tourPrev.style.visibility = _tourStep === 0 ? "hidden" : "visible";
  tourDots.innerHTML = TOUR_STEPS.map(
    (_, i) => `<span class="dot${i === _tourStep ? " active" : ""}"></span>`
  ).join("");
}

function openTour(): void {
  _tourStep = 0;
  renderTourStep();
  tourEl.classList.add("open");
}

function closeTour(): void {
  tourEl.classList.remove("open");
}

// ---------------------------------------------------------------------------
// Privacy disclosure
// ---------------------------------------------------------------------------

function openPrivacy(): void {
  privacyBody.textContent = t("privacy.body");
  privacyEl.classList.add("open");
}

function closePrivacy(): void {
  privacyEl.classList.remove("open");
}

// ---------------------------------------------------------------------------
// Full-text search across pinned pages
// ---------------------------------------------------------------------------

function openSearch(initialQuery?: string): void {
  searchInput.value = initialQuery ?? "";
  searchResults.innerHTML = "";
  searchEl.classList.add("open");
  searchInput.focus();
  if (initialQuery) runSearch();
}

function closeSearch(): void {
  searchEl.classList.remove("open");
}

async function runSearch(): Promise<void> {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    searchResults.innerHTML = "";
    return;
  }
  const results: { title: string; url: string; snippet: string }[] = [];

  const pages = await loadAllPinnedPages();
  for (const p of pages) {
    const hay = `${p.context.title} ${p.context.url} ${p.context.text}`.toLowerCase();
    if (hay.includes(q)) {
      const idx = p.context.text.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 40);
      const snippet = p.context.text.slice(start, start + 120) + (idx < 0 ? "" : "…");
      results.push({ title: p.context.title || p.context.url, url: p.context.url, snippet });
    }
  }

  searchResults.innerHTML = "";
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sr-item";
    empty.textContent = t("search.noResults");
    empty.style.cssText = "color:var(--text-dim);";
    searchResults.appendChild(empty);
    return;
  }
  for (const r of results.slice(0, 20)) {
    const item = document.createElement("div");
    item.className = "sr-item";
    const title = document.createElement("div");
    title.className = "sr-title";
    title.textContent = r.title;
    const snippet = document.createElement("div");
    snippet.className = "sr-snippet";
    snippet.textContent = r.snippet;
    item.appendChild(title);
    item.appendChild(snippet);
    item.addEventListener("click", () => {
      if (r.url) chrome.tabs.create({ url: r.url });
    });
    searchResults.appendChild(item);
  }
}

tourNext.addEventListener("click", () => {
  if (_tourStep < TOUR_STEPS.length - 1) {
    _tourStep += 1;
    renderTourStep();
  } else {
    closeTour();
  }
});
tourPrev.addEventListener("click", () => {
  if (_tourStep > 0) {
    _tourStep -= 1;
    renderTourStep();
  }
});
tourSkip.addEventListener("click", () => {
  markTourSeen().catch(() => {});
  closeTour();
});

// Replay from the ⋯ menu
saTour.addEventListener("click", () => {
  closeMoreMenu();
  openTour();
});

async function maybeShowTour(): Promise<void> {
  if (await hasSeenTour()) return;
  await markTourSeen();
  openTour();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

bridge.connect();
// Re-sync (and pull any queued context-menu action) whenever the panel regains focus.
window.addEventListener("focus", () => bridge.refresh());
// Keep the service worker (and its WebSocket) alive while the panel is open, so
// MV3 suspension doesn't drop the connection and show a false "Lost connection".
setInterval(() => bridge.refresh(), 20000);
maybeShowTour().catch(() => {});
log.info("side panel ready");
