/**
 * Side panel entry point.
 *
 * Wires ChatBridge, SessionPicker, ContextBar, and the new session form,
 * more-menu (export / import / open-in-web-app), and session templates.
 */

import { createLogger } from "@shared/logger";
import { getPinnedPagesBySession, removePinnedPage } from "@shared/storage";
import { PinnedPage, ResearchSession } from "@shared/types";
import { MSG } from "@shared/constants";

import { ChatBridge } from "./ChatBridge";
import { SessionPicker } from "./SessionPicker";
import { ContextBar } from "./ContextBar";
import { NoteEditor } from "./NoteEditor";
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
const chatMessages    = document.getElementById("chat-messages")!;
const chatEmpty       = document.getElementById("chat-empty")!;
const chatEmptySub    = document.getElementById("chat-empty-sub")!;
const chatInput       = document.getElementById("chat-input") as HTMLTextAreaElement;
const chatSend        = document.getElementById("chat-send") as HTMLButtonElement;
const chatMode        = document.getElementById("chat-mode") as HTMLSelectElement;

// Header buttons
const newSessionBtn   = document.getElementById("new-session-btn")!;
const moreBtn         = document.getElementById("more-btn")!;

// Notes panel
const notesBtn        = document.getElementById("notes-btn")!;
const notesPanel      = document.getElementById("notes-panel")!;
const notesInput      = document.getElementById("notes-input") as HTMLTextAreaElement;
const notesSaved      = document.getElementById("notes-saved")!;

// Session actions menu (⋯)
const sessionActionsMenu = document.getElementById("session-actions-menu")!;
const saExportJson    = document.getElementById("sa-export-json")!;
const saExportMd      = document.getElementById("sa-export-md")!;
const saImport        = document.getElementById("sa-import")!;
const saOpenWeb       = document.getElementById("sa-open-web")!;
const importInput     = document.getElementById("import-input") as HTMLInputElement;

// New session form
const newSessionForm  = document.getElementById("new-session-form")!;
const nfTitle         = document.getElementById("nf-title") as HTMLInputElement;
const nfTemplate      = document.getElementById("nf-template") as HTMLSelectElement;
const nfMode          = document.getElementById("nf-mode") as HTMLSelectElement;
const nfHint          = document.getElementById("nf-hint")!;
const nfCreateBtn     = document.getElementById("nf-create-btn")!;
const nfCancelBtn     = document.getElementById("nf-cancel-btn")!;

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

let _sessions: ResearchSession[] = [];
let _activeSessionId: string | null = null;

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
  async (id) => {
    await removePinnedPage(id);
  },
  (page) => {
    bridge.retryPin(page.tabId, page.id);
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
      const message = ((msg.payload as { message?: string }) ?? {}).message ?? "Unknown error";
      endTurn();
      renderError(message);
      break;
    }

    case "sessions": {
      _sessions = msg.sessions as ResearchSession[];
      const activeId = msg.activeId as string | null;
      _activeSessionId = activeId;
      picker.update(_sessions, activeId);
      if (activeId) loadPinnedPages(activeId);
      noteEditor.setSession(activeId).catch(() => {});
      break;
    }

    case "session_created": {
      const session = msg.session as ResearchSession;
      _sessions = [session, ..._sessions.filter((s) => s.id !== session.id)];
      _activeSessionId = session.id;
      picker.update(_sessions, session.id);
      loadPinnedPages(session.id);
      noteEditor.setSession(session.id).catch(() => {});

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
      break;
    }

    case "pinned": {
      contextBar.addPage(msg.page as PinnedPage);
      break;
    }

    case "error":
      log.warn("error from background", msg.message);
      break;

    case "ask_selection":
      _contextTabId = (msg.tabId as number) ?? null;
      chatInput.value = `> "${msg.text}"\n\n`;
      chatInput.dispatchEvent(new Event("input"));
      chatInput.focus();
      break;

    case "summarize_tab":
      _contextTabId = (msg.tabId as number) ?? null;
      chatInput.value = "Please summarize this page.";
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
  notesPanel.classList.toggle("open");
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

// ---------------------------------------------------------------------------
// New session form
// ---------------------------------------------------------------------------

newSessionBtn.addEventListener("click", () => {
  const isOpen = newSessionForm.classList.toggle("open");
  if (isOpen) {
    nfTitle.focus();
    closeSessionPicker();
    closeMoreMenu();
  } else {
    _resetForm();
  }
});

nfCancelBtn.addEventListener("click", () => {
  newSessionForm.classList.remove("open");
  _resetForm();
});

// Template select: auto-fill title and mode, show page hint
nfTemplate.addEventListener("change", () => {
  const tpl = getTemplate(nfTemplate.value);
  if (tpl) {
    nfTitle.value = tpl.defaultTitle;
    nfMode.value  = tpl.defaultMode;
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
  const mode  = nfMode.value as "research" | "chat" | "summarize" | "compare";
  const templateId = nfTemplate.value || null;

  // Store template so we can inject the starting prompt once the session is created
  _pendingTemplateId = templateId;

  bridge.createSession(title, mode);
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
  nfMode.value = "research";
  nfHint.textContent = "";
  nfHint.classList.remove("visible");
  _pendingTemplateId = null;
}

// ---------------------------------------------------------------------------
// Pin button
// ---------------------------------------------------------------------------

pinBtn.addEventListener("click", () => {
  bridge.pinCurrentTab();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _activeSession(): ResearchSession | undefined {
  return _sessions.find((s) => s.id === _activeSessionId);
}

async function loadPinnedPages(sessionId: string): Promise<void> {
  const pages = await getPinnedPagesBySession(sessionId);
  contextBar.update(pages);
}

// ---------------------------------------------------------------------------
// Native chat rendering
// ---------------------------------------------------------------------------

let _connected = false;
let _streaming = false;
let _assistantEl: HTMLDivElement | null = null;
/** Tab the last "summarize this page" / "ask selection" action targeted. */
let _contextTabId: number | null = null;

function setConnected(connected: boolean): void {
  _connected = connected;
  statusDot.classList.toggle("connected", connected);
  chatEmptySub.textContent = connected ? "Ready to chat" : "Waiting for server…";
  chatInput.disabled = !connected || _streaming;
  chatSend.disabled = !connected || _streaming || !chatInput.value.trim();
}

function renderUserMessage(text: string): void {
  chatEmpty.style.display = "none";
  const el = document.createElement("div");
  el.className = "msg user";
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function beginAssistantTurn(): void {
  chatEmpty.style.display = "none";
  _assistantEl = document.createElement("div");
  _assistantEl.className = "msg assistant";
  chatMessages.appendChild(_assistantEl);
}

function appendStreamText(text: string): void {
  if (!_assistantEl) beginAssistantTurn();
  if (_assistantEl) {
    _assistantEl.textContent += text;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function endTurn(finalText?: string): void {
  if (_assistantEl) {
    if (finalText) _assistantEl.textContent = finalText;
    _assistantEl = null;
  }
  _streaming = false;
  chatInput.disabled = !_connected;
  chatSend.disabled = !_connected || !chatInput.value.trim();
  chatInput.focus();
}

function renderError(message: string): void {
  chatEmpty.style.display = "none";
  const el = document.createElement("div");
  el.className = "msg error";
  el.textContent = message;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage(): void {
  const text = chatInput.value.trim();
  if (!text || !_connected || _streaming) return;
  renderUserMessage(text);
  chatInput.value = "";
  chatInput.style.height = "auto";
  _streaming = true;
  chatInput.disabled = true;
  chatSend.disabled = true;
  beginAssistantTurn();
  bridge.sendChat(text, chatMode.value, _contextTabId ?? undefined, noteEditor.getNoteText() || undefined);
  _contextTabId = null;
}

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
// Start
// ---------------------------------------------------------------------------

bridge.connect();
log.info("side panel ready");
