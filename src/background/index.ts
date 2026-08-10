/**
 * JiuwenSwarm background service worker — entry point.
 *
 * Responsibilities:
 * 1. Maintain WebSocket connection to local JiuwenSwarm server
 * 2. Manage research sessions (create, list, persist)
 * 3. Cache page context from content scripts
 * 4. Handle right-click context menus
 * 5. Watch tab lifecycle (context refresh, eviction)
 * 6. Route messages between side panel ↔ server
 * 7. Dispatch browser-native agent tool calls (ToolDispatcher)
 */

import { createLogger } from "@shared/logger";
import { MSG, MAX_CONTEXT_CHARS, COMMANDS } from "@shared/constants";
import { makeEnvelope } from "@shared/protocol";
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
// Singletons (survive SW restart via closure — NOT across cold starts)
// ---------------------------------------------------------------------------

const client = new WsClient();
const cache = new ContextCache();
const sessionMgr = new SessionManager(client);
const tabWatcher = new TabWatcher(cache);
const contextMenu = new ContextMenu(onContextMenuAction);
const toolDispatcher = new ToolDispatcher(client, cache, tabWatcher, sessionMgr);

// Push connection state to the side panel so the chat iframe can
// enable/disable its input live (not just on an explicit status query).
client.onStatusChange((connected) => {
  broadcastToSidePanel({
    action: MSG.STATUS,
    connected,
    activeSessionId: sessionMgr.activeSessionId,
  });
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
    if (env.type === "sessions") {
      const p = env.payload as { sessions: Array<{ session_id: string; title: string; created_at: string; mode: string }> };
      sessionMgr.handleServerSessions(p.sessions ?? []);
    }
    if (env.type === "session_created") {
      const p = env.payload as { session_id: string; title: string; created_at: string; mode: string };
      sessionMgr.handleSessionCreated(p);
      // Broadcast updated session list to side panel
      broadcastToSidePanel({
        action: "sessions",
        sessions: sessionMgr.sessions,
        activeId: sessionMgr.activeSessionId,
      });
    }
    if (env.type === "tool_call") {
      // Dispatch browser-native tool; do not forward to side panel
      const p = env.payload as import("@shared/protocol").ToolCallPayload;
      toolDispatcher.dispatch(p, env.session_id).catch((e) =>
        log.error("tool dispatch error", e),
      );
      return;
    }
    // Forward all other events to side panel ports
    broadcastToSidePanel(env);
  });
  sessionMgr.refresh();
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
      client.send(
        makeEnvelope(
          "chat",
          { message: msg.message, context: context || undefined, mode: sessionMgr.activeSession?.mode },
          sessionId
        )
      );
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
      // Fire-and-forget — server responds with session_created envelope which
      // triggers handleSessionCreated() and broadcasts updated sessions to panel
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
