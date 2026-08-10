/**
 * JiuwenSwarm background service worker — entry point.
 *
 * Responsibilities:
 * 1. Maintain WebSocket connection to local JiuwenSwarm server (gateway
 *    JSON-RPC protocol, channel_id "browser")
 * 2. Manage research sessions (list, create, switch)
 * 3. Cache page context from content scripts
 * 4. Handle right-click context menus
 * 5. Watch tab lifecycle (context refresh, eviction)
 * 6. Route messages between side panel ↔ server
 * 7. Dispatch browser-native agent tool calls (ToolDispatcher)
 */

import { createLogger } from "@shared/logger";
import { MSG, MAX_CONTEXT_CHARS, COMMANDS } from "@shared/constants";
import { addPinnedPage, getPinnedPagesBySession, removePinnedPage } from "@shared/storage";
import { PinnedPage } from "@shared/types";
import { nanoid } from "nanoid";

import { WsClient } from "./WsClient";
import { SessionManager } from "./SessionManager";
import { ContextCache } from "./ContextCache";
import { TabWatcher } from "./TabWatcher";
import { ContextMenu } from "./ContextMenu";
import { ToolDispatcher } from "./ToolDispatcher";

const log = createLogger("bg");

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

const client = new WsClient();
const cache = new ContextCache();
const sessionMgr = new SessionManager(client);
const tabWatcher = new TabWatcher(cache);
const contextMenu = new ContextMenu(onContextMenuAction);
const toolDispatcher = new ToolDispatcher(client, cache, tabWatcher, sessionMgr);

// Push connection state to the side panel so the chat can enable/disable its
// input live.
client.onStatusChange((connected) => {
  broadcastToSidePanel({
    action: MSG.STATUS,
    connected,
    activeSessionId: sessionMgr.activeSessionId,
  });
});

// Whenever the session list / active pointer changes, keep the side panel's
// picker and header in sync.
sessionMgr.onChange((sessions, activeId) => {
  broadcastToSidePanel({ action: "sessions", sessions, activeId });
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  log.info("service worker starting");
  await sessionMgr.init();
  tabWatcher.start();
  contextMenu.setup();
  await client.connect();
  client.onEvent((env) => {
    if (env.type === "ack") {
      // The server auto-creates a session per connection — adopt it and pull
      // the full session list.
      const sid = env.payload.session_id as string | undefined;
      if (sid) sessionMgr.setSessionFromAck(sid, env.payload.mode as string | undefined);
      sessionMgr.refresh().catch(() => {});
      return;
    }
    if (env.type === "tool_call") {
      toolDispatcher.dispatch(env, env.session_id).catch((e) =>
        log.error("tool dispatch error", e),
      );
      return;
    }
    // Stream / status envelopes flow straight through to the side panel.
    broadcastToSidePanel(env);
  });
  log.info("init complete");
}

// Kick off — SW restarts invoke the module from scratch
init().catch((e) => log.error("init failed", e));

// ---------------------------------------------------------------------------
// Side panel port management
// ---------------------------------------------------------------------------

const sidePanelPorts: Set<chrome.runtime.Port> = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidepanel") return;
  sidePanelPorts.add(port);
  log.debug("side panel connected, total:", sidePanelPorts.size);

  port.onMessage.addListener((msg: Record<string, unknown>) => {
    handleSidePanelMsg(msg, port);
  });

  port.onDisconnect.addListener(() => {
    sidePanelPorts.delete(port);
    log.debug("side panel disconnected, remaining:", sidePanelPorts.size);
  });
});

function broadcastToSidePanel(msg: unknown): void {
  for (const port of sidePanelPorts) {
    try {
      port.postMessage(msg);
    } catch {
      sidePanelPorts.delete(port);
    }
  }
}

// ---------------------------------------------------------------------------
// Messages from side panel / popup
// ---------------------------------------------------------------------------

async function handleSidePanelMsg(
  msg: Record<string, unknown>,
  port: chrome.runtime.Port
): Promise<void> {
  const action = msg.action as string;

  switch (action) {
    case MSG.SEND_AGENT: {
      const sessionId = sessionMgr.activeSessionId;
      if (!sessionId) {
        port.postMessage({ type: "error", payload: { message: "No active session" } });
        return;
      }
      const pinnedPages = await getPinnedPagesBySession(sessionId);
      const tabIds = pinnedPages.map((p) => p.tabId);
      const context = cache.aggregate(tabIds, MAX_CONTEXT_CHARS);
      client.send("chat.send", {
        content: msg.message as string,
        context: context || undefined,
        mode: (msg.mode as string) || sessionMgr.activeSession?.mode || "chat",
        session_id: sessionId,
      });
      break;
    }

    case MSG.PIN_TAB: {
      const tabId = msg.tabId as number;
      const sessionId = sessionMgr.activeSessionId;
      if (!sessionId) return;
      let ctx = cache.get(tabId);
      if (!ctx) {
        ctx = await tabWatcher.extractFromTab(tabId) ?? undefined;
        if (ctx) cache.set(tabId, ctx);
      }
      if (!ctx) {
        port.postMessage({ action: "error", message: "Could not extract page context" });
        return;
      }
      const pinned: PinnedPage = {
        id: nanoid(),
        tabId,
        sessionId,
        context: ctx,
        note: "",
        pinnedAt: new Date().toISOString(),
      };
      await addPinnedPage(pinned);
      port.postMessage({ action: "pinned", page: pinned });
      break;
    }

    case MSG.UNPIN_TAB: {
      const id = msg.id as string;
      await removePinnedPage(id);
      break;
    }

    case MSG.LIST_SESSIONS:
      port.postMessage({
        action: "sessions",
        sessions: sessionMgr.sessions,
        activeId: sessionMgr.activeSessionId,
      });
      break;

    case MSG.NEW_SESSION: {
      sessionMgr.createSession(
        (msg.title as string) || "New session",
        (msg.mode as "research" | "chat" | "summarize" | "compare") || "research"
      );
      break;
    }

    case MSG.SET_SESSION:
      await sessionMgr.setActiveSession(msg.sessionId as string);
      port.postMessage({ action: "session_changed", activeId: sessionMgr.activeSessionId });
      break;

    case MSG.GET_STATUS:
      port.postMessage({
        action: MSG.STATUS,
        connected: client.isConnected,
        activeSessionId: sessionMgr.activeSessionId,
      });
      break;

    default:
      log.warn("unknown action from side panel", action);
  }
}

// ---------------------------------------------------------------------------
// Content script messages (runtime.onMessage — short-lived)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === MSG.PAGE_CONTEXT && sender.tab?.id != null) {
    cache.set(sender.tab.id, msg.context);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.action === MSG.GET_STATUS) {
    sendResponse({
      connected: client.isConnected,
      activeSessionId: sessionMgr.activeSessionId,
    });
    return false;
  }
  // Sync response required — return false (no async needed)
  return false;
});

// ---------------------------------------------------------------------------
// Keyboard commands
// ---------------------------------------------------------------------------

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  switch (command) {
    case COMMANDS.TOGGLE_PANEL:
      if (tab?.windowId != null) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
      break;

    case COMMANDS.PIN_PAGE:
      if (tab?.id != null) {
        broadcastToSidePanel({ action: MSG.PIN_TAB, tabId: tab.id });
      }
      break;

    case COMMANDS.ASK_SELECTION:
      if (tab?.id != null) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: MSG.SELECTION_TEXT });
        if (response?.text) {
          broadcastToSidePanel({ action: "ask_selection", text: response.text });
        }
      }
      break;
  }
});

// ---------------------------------------------------------------------------
// Context menu handler
// ---------------------------------------------------------------------------

async function onContextMenuAction(
  action: "ask" | "pin" | "summarize",
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const tabId = tab?.id;
  const windowId = tab?.windowId;

  if (windowId != null) {
    await chrome.sidePanel.open({ windowId });
  }

  if (action === "ask" && info.selectionText) {
    broadcastToSidePanel({ action: "ask_selection", text: info.selectionText });
  } else if (action === "pin" && tabId != null) {
    broadcastToSidePanel({ action: MSG.PIN_TAB, tabId });
  } else if (action === "summarize" && tabId != null) {
    broadcastToSidePanel({ action: "summarize_tab", tabId });
  }
}
