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
const chatFrame       = document.getElementById("chat-frame") as HTMLIFrameElement;

// Header buttons
const newSessionBtn   = document.getElementById("new-session-btn")!;
const moreBtn         = document.getElementById("more-btn")!;

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

const bridge = new ChatBridge(chatFrame);

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

// ---------------------------------------------------------------------------
// Background event bus
// ---------------------------------------------------------------------------

window.addEventListener("jiuwen:bg", (ev: Event) => {
  const msg = (ev as CustomEvent).detail as Record<string, unknown>;
  handleBgMsg(msg);
});

function handleBgMsg(msg: Record<string, unknown>): void {
  const action = msg.action as string;

  switch (action) {
    case MSG.STATUS: {
      statusDot.classList.toggle("connected", msg.connected as boolean);
      break;
    }

    case "sessions": {
      _sessions = msg.sessions as ResearchSession[];
      const activeId = msg.activeId as string | null;
      _activeSessionId = activeId;
      picker.update(_sessions, activeId);
      if (activeId) loadPinnedPages(activeId);
      break;
    }

    case "session_created": {
      const session = msg.session as ResearchSession;
      _sessions = [session, ..._sessions.filter((s) => s.id !== session.id)];
      _activeSessionId = session.id;
      picker.update(_sessions, session.id);
      loadPinnedPages(session.id);

      // If a template was pending, inject its starting prompt now
      if (_pendingTemplateId) {
        const tpl = getTemplate(_pendingTemplateId);
        _pendingTemplateId = null;
        if (tpl?.startingPrompt) {
          chatFrame.contentWindow?.postMessage(
            { type: "prefill", text: tpl.startingPrompt },
            "*"
          );
        }
      }
      break;
    }

    case "session_changed": {
      const activeId = msg.activeId as string | null;
      _activeSessionId = activeId;
      if (activeId) loadPinnedPages(activeId);
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
      chatFrame.contentWindow?.postMessage(
        { type: "prefill", text: `> "${msg.text}"\n\n` },
        "*"
      );
      break;

    case "summarize_tab":
      chatFrame.contentWindow?.postMessage(
        { type: "prefill", text: "Please summarize this page." },
        "*"
      );
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
// Start
// ---------------------------------------------------------------------------

bridge.connect();
log.info("side panel ready");
