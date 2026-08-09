/**
 * Right-click context menu entries for JiuwenSwarm.
 *
 * Menus:
 * - "Ask JiuwenSwarm about selection" — on selected text
 * - "Pin this page to research session" — on page background
 * - "Summarize this page" — on page background
 */

import { createLogger } from "@shared/logger";

const log = createLogger("bg/menu");

const MENU_ASK = "jiuwen_ask_selection";
const MENU_PIN = "jiuwen_pin_page";
const MENU_SUMMARIZE = "jiuwen_summarize";

export type ContextMenuHandler = (
  action: "ask" | "pin" | "summarize",
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined
) => void;

export class ContextMenu {
  constructor(private readonly _onAction: ContextMenuHandler) {}

  setup(): void {
    // Remove stale items from a previous SW instantiation
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ASK,
        title: "Ask JiuwenSwarm about \"%s\"",
        contexts: ["selection"],
      });
      chrome.contextMenus.create({
        id: MENU_PIN,
        title: "Pin this page to research session",
        contexts: ["page"],
      });
      chrome.contextMenus.create({
        id: MENU_SUMMARIZE,
        title: "Summarize this page",
        contexts: ["page"],
      });
      log.info("context menus registered");
    });

    chrome.contextMenus.onClicked.addListener(this._onClick.bind(this));
  }

  private _onClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): void {
    switch (info.menuItemId) {
      case MENU_ASK:
        this._onAction("ask", info, tab);
        break;
      case MENU_PIN:
        this._onAction("pin", info, tab);
        break;
      case MENU_SUMMARIZE:
        this._onAction("summarize", info, tab);
        break;
      default:
        log.warn("unknown menu item", info.menuItemId);
    }
  }
}
