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
  hasSeenTour,
  markTourSeen,
} from "@shared/storage";
import { PinnedPage, ResearchSession } from "@shared/types";
import { MSG } from "@shared/constants";
import { loadAnnotationsBySession } from "@shared/annotations";
import { initI18n, applyStaticI18n, t } from "@shared/i18n";
import { loadNote } from "@shared/notes";

import { ChatBridge } from "./ChatBridge";
import { SessionPicker } from "./SessionPicker";
import { ContextBar } from "./ContextBar";
import { NoteEditor } from "./NoteEditor";
import { renderMarkdown } from "./markdown";
import {
  exportSessionJson,
  exportSessionMarkdown,
  importSessionJson,
  openInWebApp,
  getTemplate,
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
const contextMeter    = document.getElementById("context-meter")!;
const chatMessages    = document.getElementById("chat-messages")!;
const chatEmpty       = document.getElementById("chat-empty")!;
const chatEmptyTitle  = document.getElementById("chat-empty-title")!;
const chatEmptySub    = document.getElementById("chat-empty-sub")!;
const chatEmptyStats  = document.getElementById("chat-empty-stats")!;
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

// Notes panel
const notesBtn        = document.getElementById("notes-btn")!;
const notesPanel      = document.getElementById("notes-panel")!;
const notesInput      = document.getElementById("notes-input") as HTMLTextAreaElement;
const notesSaved      = document.getElementById("notes-saved")!;

// Annotations panel
const annotationsBtn   = document.getElementById("annotations-btn")!;
const annotationsPanel = document.getElementById("annotations-panel")!;
const annotationsEmpty = document.getElementById("annotations-empty")!;
const annotationsList  = document.getElementById("annotations-list")!;

// Session actions menu (⋯)
const sessionActionsMenu = document.getElementById("session-actions-menu")!;
const saExportJson    = document.getElementById("sa-export-json")!;
const saExportMd      = document.getElementById("sa-export-md")!;
const saImport        = document.getElementById("sa-import")!;
const saOpenWeb       = document.getElementById("sa-open-web")!;
const saPinAll        = document.getElementById("sa-pin-all")!;
const saSearch        = document.getElementById("sa-search")!;
const saReader        = document.getElementById("sa-reader")!;
const saTour          = document.getElementById("sa-tour")!;
const saPrivacy       = document.getElementById("sa-privacy")!;
const importInput     = document.getElementById("import-input") as HTMLInputElement;

// Reading-mode overlay
const readerEl        = document.getElementById("reader")!;
const readerBack      = document.getElementById("reader-back")!;
const readerOpen      = document.getElementById("reader-open") as HTMLAnchorElement;
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
const nfTemplate      = document.getElementById("nf-template") as HTMLSelectElement;
const nfHint          = document.getElementById("nf-hint")!;
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

// Template whose starting prompt should be injected after the session is created.
// Stored here because createSession is async via round-trip to background.
let _pendingTemplateId: string | null = null;

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
  contextMeter,
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

const noteEditor = new NoteEditor(notesInput, notesSaved);

// ---------------------------------------------------------------------------
// Background event bus
// ---------------------------------------------------------------------------

window.addEventListener("jiuwen:bg", (ev: Event) => {
  const msg = (ev as CustomEvent).detail as Record<string, unknown>;
  handleBgMsg(msg);
});

function handleBgMsg(msg: Record<string, unknown>): void {
  // Background replies use msg.action ("status"/"sessions"), while raw server
  // envelopes use msg.type ("token"/"done"/"error") — accept either.
  const action = (msg.action ?? msg.type) as string;

  switch (action) {
    case MSG.STATUS: {
      setConnected(msg.connected as boolean);
      break;
    }

    case "token": {
      const text = ((msg.payload as { text?: string }) ?? {}).text;
      if (text) appendStreamText(text);
      break;
    }

    case "done": {
      const text = ((msg.payload as { text?: string }) ?? {}).text;
      endTurn(text);
      break;
    }

    case "error": {
      const message =
        ((msg.payload as { message?: string }) ?? {}).message ??
        (msg.message as string | undefined) ??
        "Unknown error";
      endTurn();
      renderError(humanizeError(message));
      break;
    }

    case "sessions": {
      _sessions = msg.sessions as ResearchSession[];
      const activeId = msg.activeId as string | null;
      _activeSessionId = activeId;
      picker.update(_sessions, activeId);
      if (activeId) loadPinnedPages(activeId);
      noteEditor.setSession(activeId).catch(() => {});
      renderAnnotations();
      break;
    }

    case "session_created": {
      const session = msg.session as ResearchSession;
      _sessions = [session, ..._sessions.filter((s) => s.id !== session.id)];
      _activeSessionId = session.id;
      picker.update(_sessions, session.id);
      loadPinnedPages(session.id);
      noteEditor.setSession(session.id).catch(() => {});
      renderAnnotations();

      // If a template was pending, inject its starting prompt now
      if (_pendingTemplateId) {
        const tpl = getTemplate(_pendingTemplateId);
        _pendingTemplateId = null;
        if (tpl?.startingPrompt) {
          chatInput.value = tpl.startingPrompt;
          chatInput.dispatchEvent(new Event("input"));
          chatInput.focus();
        }
      }
      break;
    }

    case "session_changed": {
      const activeId = msg.activeId as string | null;
      _activeSessionId = activeId;
      if (activeId) loadPinnedPages(activeId);
      noteEditor.setSession(activeId).catch(() => {});
      renderAnnotations();
      break;
    }

    case "tool": {
      renderToolStatus(msg.tool as string);
      break;
    }

    case "pinned": {
      const page = msg.page as PinnedPage;
      contextBar.addPage(page);
      showToast(t("toast.pinned"));
      refreshSuggestions();
      maybeAutoSummarize(page);
      break;
    }

    case "ask_selection":
      _contextTabId = (msg.tabId as number) ?? null;
      chatInput.value = `> "${msg.text}"\n\n`;
      chatInput.dispatchEvent(new Event("input"));
      chatInput.focus();
      break;

    case "summarize_tab":
      _contextTabId = (msg.tabId as number) ?? null;
      chatInput.value =
        "Summarize this page in 2-3 short sentences. Be brief and direct — just the key point.";
      chatInput.dispatchEvent(new Event("input"));
      chatInput.focus();
      break;
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
// Notes panel toggle
// ---------------------------------------------------------------------------

notesBtn.addEventListener("click", () => {
  const isOpen = notesPanel.classList.toggle("open");
  if (isOpen) annotationsPanel.classList.remove("open");
});

annotationsBtn.addEventListener("click", () => {
  const isOpen = annotationsPanel.classList.toggle("open");
  if (isOpen) {
    notesPanel.classList.remove("open");
    renderAnnotations();
  }
});

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

saImport.addEventListener("click", () => {
  closeMoreMenu();
  importInput.value = "";
  importInput.click();
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file || !_activeSessionId) return;
  try {
    const count = await importSessionJson(file, _activeSessionId);
    log.info(`imported ${count} pages`);
    // Reload pinned pages to show the imported chips
    await loadPinnedPages(_activeSessionId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("import failed:", msg);
  }
});

saOpenWeb.addEventListener("click", async () => {
  closeMoreMenu();
  if (!_activeSessionId) return;
  try {
    await openInWebApp(_activeSessionId);
  } catch (e) {
    log.warn("open in web app failed", e);
  }
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
    readerOpen.href = ctx.url;
    readerOpen.style.display = "";
    const article = document.createElement("article");
    article.id = "reader-article";
    const h1 = document.createElement("h1");
    h1.textContent = ctx.title || ctx.url;
    const meta = document.createElement("div");
    meta.className = "reader-meta";
    meta.textContent = `${ctx.url} · ${ctx.pageType}`;
    const body = document.createElement("div");
    body.className = "reader-body";
    body.textContent = ctx.text || "—";
    article.appendChild(h1);
    article.appendChild(meta);
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

// Template select: auto-fill title, show page hint
nfTemplate.addEventListener("change", () => {
  const tpl = getTemplate(nfTemplate.value);
  if (tpl) {
    nfTitle.value = tpl.defaultTitle;
    nfHint.textContent = `Suggested pages: ${tpl.suggestedPages.join(", ")}`;
    nfHint.classList.add("visible");
  } else {
    nfTitle.value = "";
    nfHint.textContent = "";
    nfHint.classList.remove("visible");
  }
});

nfCreateBtn.addEventListener("click", () => {
  const title = nfTitle.value.trim() || "Research session";
  const templateId = nfTemplate.value || null;

  // Store template so we can inject the starting prompt once the session is created
  _pendingTemplateId = templateId;

  bridge.createSession(title);
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
  nfTemplate.value = "";
  nfHint.textContent = "";
  nfHint.classList.remove("visible");
  _pendingTemplateId = null;
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
  await updateEmptyStateStats(pages.length);
}

// ---------------------------------------------------------------------------
// Saved highlights (annotations) panel
// ---------------------------------------------------------------------------

async function renderAnnotations(): Promise<void> {
  if (!_activeSessionId) {
    annotationsList.innerHTML = "";
    annotationsEmpty.style.display = "block";
    return;
  }
  const entries = await loadAnnotationsBySession(_activeSessionId);
  annotationsList.innerHTML = "";
  annotationsEmpty.style.display = entries.length === 0 ? "block" : "none";
  for (const a of entries) {
    const item = document.createElement("div");
    item.className = "anno-item";
    item.title = "Open this page";

    const text = document.createElement("div");
    text.className = "anno-text";
    text.textContent = `"${a.text}"`;

    const url = document.createElement("div");
    url.className = "anno-url";
    url.textContent = a.url;

    item.appendChild(text);
    item.appendChild(url);

    if (a.note) {
      const note = document.createElement("div");
      note.className = "anno-note";
      note.textContent = `Note: ${a.note}`;
      item.appendChild(note);
    }

    item.addEventListener("click", () => {
      chrome.tabs.create({ url: a.url });
    });
    annotationsList.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// Empty-state stats (progression / "my research" feel)
// ---------------------------------------------------------------------------

async function updateEmptyStateStats(pinnedCount: number): Promise<void> {
  if (!_connected || _chatStarted) {
    chatEmptyStats.textContent = "";
    createSessionCta.hidden = true;
    return;
  }
  if (!_activeSessionId) {
    chatEmptyStats.textContent = "";
    createSessionCta.hidden = false;
    return;
  }
  createSessionCta.hidden = true;
  const session = _activeSession();
  const parts: string[] = [];
  if (session) {
    parts.push(`mode: ${session.mode || "Research"}`);
    if (session.title) parts.push(`"${session.title}"`);
  }
  parts.push(`${pinnedCount} page${pinnedCount === 1 ? "" : "s"} pinned`);
  // Activity dashboard: pages pinned in the last 7 days (across all sessions).
  try {
    const all = await loadAllPinnedPages();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekly = all.filter((p) => new Date(p.pinnedAt).getTime() >= weekAgo).length;
    parts.push(`${weekly} this week`);
  } catch {
    /* stats are best-effort */
  }
  chatEmptyStats.textContent = parts.join(" · ");
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
let _lastUserText = "";
let _lastUserEl: HTMLDivElement | null = null;
let _lastAssistantEl: HTMLDivElement | null = null;
let _lastTurnStart = 0;
/** Tab the last "summarize this page" / "ask selection" action targeted. */
let _contextTabId: number | null = null;

function setConnected(connected: boolean): void {
  _connected = connected;
  statusDot.classList.toggle("connected", connected);
  chatEmptySub.textContent = connected ? t("empty.ready") : t("empty.waiting");
  chatEmptyTitle.textContent = connected ? t("empty.title.ready") : t("empty.title.waiting");
  connBanner.classList.toggle("show", !connected);
  connBannerText.textContent = t("conn.lost");
  chatInput.disabled = !connected || _streaming;
  chatSend.disabled = !connected || _streaming || !chatInput.value.trim();
  if (connected) {
    refreshSuggestions();
  } else {
    maybeShowCachedResponse();
  }
}

/** Offline mode: if the chat is empty and a previous answer is cached, show it. */
function maybeShowCachedResponse(): void {
  if (chatMessages.children.length > 0) return;
  loadLastResponse().then((cached) => {
    if (!cached || !cached.text) return;
    _chatStarted = true;
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

function refreshSuggestions(): void {
  suggestionsEl.innerHTML = "";
  if (!_connected || _chatStarted) return;
  const buttons: { label: string; action: () => void }[] = [
    {
      label: t("sug.pin"),
      action: () => bridge.pinCurrentTab(),
    },
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
    {
      label: t("sug.compare"),
      action: () => {
        chatInput.value = "Compare the pinned pages and flag the key differences.";
        chatInput.dispatchEvent(new Event("input"));
        chatInput.focus();
      },
    },
  ];

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
  _lastUserText = text;
  _lastTurnStart = Date.now();
  addTurnDivider(_lastTurnStart);
  // Only the most recent user message is editable.
  document.querySelectorAll(".msg.user .msg-edit").forEach((el) => el.remove());
  _lastUserEl = document.createElement("div");
  _lastUserEl.className = "msg user";
  const body = document.createElement("div");
  body.textContent = text;
  const ts = document.createElement("span");
  ts.className = "msg-ts";
  ts.textContent = formatTime(_lastTurnStart);
  const editBtn = document.createElement("button");
  editBtn.className = "msg-edit";
  editBtn.textContent = t("msg.edit");
  editBtn.title = t("msg.editTitle");
  editBtn.addEventListener("click", () => editUserMessage());
  _lastUserEl.appendChild(body);
  _lastUserEl.appendChild(editBtn);
  _lastUserEl.appendChild(ts);
  chatMessages.appendChild(_lastUserEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/** Load the last question back into the input and drop the last turn for editing. */
function editUserMessage(): void {
  if (_streaming || !_lastUserText) return;
  if (_lastAssistantEl) _lastAssistantEl.remove();
  if (_lastUserEl) _lastUserEl.remove();
  chatInput.value = _lastUserText;
  chatInput.dispatchEvent(new Event("input"));
  chatInput.focus();
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function beginAssistantTurn(): void {
  _chatStarted = true;
  chatEmpty.style.display = "none";
  _assistantRaw = "";
  _assistantEl = document.createElement("div");
  _assistantEl.className = "msg assistant thinking";
  _assistantEl.innerHTML =
    '<span class="sk-dot"></span><span class="sk-dot"></span><span class="sk-dot"></span>';
  chatMessages.appendChild(_assistantEl);
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
    _assistantEl.appendChild(_makeMessageTools());
    _appendSources(_assistantEl);
    const ts = document.createElement("span");
    ts.className = "msg-ts";
    ts.textContent = formatTime(Date.now());
    _assistantEl.appendChild(ts);
    _lastAssistantEl = _assistantEl;
    _assistantEl = null;
  }
  _streaming = false;
  _stopRequested = false;
  stopBtn.hidden = true;
  chatInput.disabled = !_connected;
  chatSend.disabled = !_connected || !chatInput.value.trim();
  chatInput.focus();
  // Cache the last answer for offline re-reading.
  if (_assistantRaw.trim()) saveLastResponse(_assistantRaw.trim()).catch(() => {});
}

function _makeMessageTools(): HTMLElement {
  const tools = document.createElement("div");
  tools.className = "msg-tools";
  tools.style.cssText = "margin-top:8px;display:flex;gap:6px;align-items:center;";

  const copyBtn = document.createElement("button");
  copyBtn.className = "msg-copy";
  copyBtn.textContent = t("msg.copy");
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(_assistantRaw);
    copyBtn.textContent = t("msg.copied");
    copyBtn.classList.add("copied");
    window.setTimeout(() => {
      copyBtn.textContent = t("msg.copy");
      copyBtn.classList.remove("copied");
    }, 1500);
  });
  tools.appendChild(copyBtn);

  const regenBtn = document.createElement("button");
  regenBtn.className = "msg-copy";
  regenBtn.textContent = t("msg.regenerate");
  regenBtn.addEventListener("click", () => {
    regenerate(_lastAssistantEl);
  });
  tools.appendChild(regenBtn);

  return tools;
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

function regenerate(completedEl: HTMLDivElement | null): void {
  if (_streaming || !_connected || !_lastUserText) return;
  // Remove the previous turn's user + assistant messages.
  if (completedEl) completedEl.remove();
  if (_lastUserEl) _lastUserEl.remove();
  // Re-send the same question.
  _sendUserMessage(_lastUserText);
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
  stopBtn.hidden = false;
  beginAssistantTurn();
  bridge.sendChat(text, _contextTabId ?? undefined, noteEditor.getNoteText() || undefined);
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
// Full-text search across pinned pages and session notes
// ---------------------------------------------------------------------------

function openSearch(): void {
  searchInput.value = "";
  searchResults.innerHTML = "";
  searchEl.classList.add("open");
  searchInput.focus();
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

  // Search session notes too.
  for (const s of _sessions) {
    const note = await loadNote(s.id);
    if (note.toLowerCase().includes(q)) {
      const idx = note.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 40);
      results.push({
        title: `${s.title} — note`,
        url: "",
        snippet: note.slice(start, start + 120) + "…",
      });
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
maybeShowTour().catch(() => {});
log.info("side panel ready");
