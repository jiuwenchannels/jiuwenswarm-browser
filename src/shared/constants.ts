/** Shared constants for the JiuwenSwarm browser extension. */

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 19000;
export const CHANNEL_ID = "browser";

export const WS_URL = (host = DEFAULT_HOST, port = DEFAULT_PORT): string =>
  `ws://${host}:${port}/ws`;

/** chrome.storage.local keys */
export const STORAGE_KEYS = {
  SESSIONS: "jiuwen_sessions",
  ACTIVE_SESSION: "jiuwen_active_session",
  PINNED_PAGES: "jiuwen_pinned_pages",
  SETTINGS: "jiuwen_settings",
} as const;

/** Maximum number of pages that can be pinned in one research session */
export const MAX_PINNED_PAGES = 20;

/** Context block size limit sent to agent (characters) */
export const MAX_CONTEXT_CHARS = 120_000;

/** Extension command names (must match manifest.json) */
export const COMMANDS = {
  TOGGLE_PANEL: "toggle-panel",
  PIN_PAGE: "pin-page",
  ASK_SELECTION: "ask-selection",
} as const;

/** Internal message actions between extension parts */
export const MSG = {
  // content → background
  PAGE_CONTEXT: "page_context",
  SELECTION_TEXT: "selection_text",
  // background → content
  HIGHLIGHT_TEXT: "highlight_text",
  CLEAR_HIGHLIGHTS: "clear_highlights",
  FILL_FORM: "fill_form",
  // popup ↔ background
  GET_STATUS: "get_status",
  STATUS: "status",
  // sidepanel ↔ background
  SEND_AGENT: "send_agent",
  AGENT_EVENT: "agent_event",
  PIN_TAB: "pin_tab",
  UNPIN_TAB: "unpin_tab",
  GET_SESSION: "get_session",
  SET_SESSION: "set_session",
  LIST_SESSIONS: "list_sessions",
  NEW_SESSION: "new_session",
} as const;
