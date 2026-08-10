/**
 * Side panel entry point.
 *
 * Wires ChatBridge, SessionPicker, and ContextBar together.
 */

import { createLogger } from "@shared/logger";
import { getPinnedPagesBySession, removePinnedPage } from "@shared/storage";
import { PinnedPage, ResearchSession } from "@shared/types";
import { MSG } from "@shared/constants";

import { ChatBridge } from "./ChatBridge";
import { SessionPicker } from "./SessionPicker";
import { ContextBar } from "./ContextBar";

const log = createLogger("sidepanel");

// DOM refs
const statusDot = document.getElementById("status-dot")!;
const sessionLabel = document.getElementById("session-label")!;
const sessionPickerEl = document.getElementById("session-picker")!;
const pinBtn = document.getElementById("pin-btn")!;
const pinChipsEl = document.getElementById("pin-chips")!;
const chatFrame = document.getElementById("chat-frame") as HTMLIFrameElement;
const newSessionBtn = document.getElementById("new-session-btn")!;

// Components
const bridge = new ChatBridge(chatFrame);

const picker = new SessionPicker(sessionPickerEl, sessionLabel, (id) => {
  bridge.setActiveSession(id);
  loadPinnedPages(id);
});

const contextBar = new ContextBar(
  pinChipsEl,
  async (id) => {
    await removePinnedPage(id);
  },
  (page) => {
    // Retry: re-pin the same tab to get fresh context
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
      const connected = msg.connected as boolean;
      statusDot.classList.toggle("connected", connected);
      break;
    }

    case "sessions": {
      const sessions = msg.sessions as ResearchSession[];
      const activeId = msg.activeId as string | null;
      picker.update(sessions, activeId);
      if (activeId) loadPinnedPages(activeId);
      break;
    }

    case "session_created": {
      const session = msg.session as ResearchSession;
      picker.update([session], session.id);
      loadPinnedPages(session.id);
      break;
    }

    case "session_changed": {
      const activeId = msg.activeId as string | null;
      if (activeId) loadPinnedPages(activeId);
      break;
    }

    case "pinned": {
      const page = msg.page as PinnedPage;
      contextBar.addPage(page);
      break;
    }

    case "error":
      log.warn("error from background", msg.message);
      break;

    case "ask_selection": {
      // Pre-fill the chat with the selected text
      chatFrame.contentWindow?.postMessage(
        { type: "prefill", text: `> "${msg.text}"\n\n` },
        "*"
      );
      break;
    }

    case "summarize_tab":
      chatFrame.contentWindow?.postMessage(
        { type: "prefill", text: "Please summarize this page." },
        "*"
      );
      break;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

pinBtn.addEventListener("click", () => {
  bridge.pinCurrentTab();
});

newSessionBtn.addEventListener("click", () => {
  const title = prompt("Session name:", "Research session");
  if (title) {
    bridge.createSession(title.trim() || "Research session", "research");
  }
});

async function loadPinnedPages(sessionId: string): Promise<void> {
  const pages = await getPinnedPagesBySession(sessionId);
  contextBar.update(pages);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

bridge.connect();
log.info("side panel ready");
