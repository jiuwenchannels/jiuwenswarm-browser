/**
 * Bridge between the background service worker port and the side panel UI.
 *
 * Keeps a single chrome.runtime port open (name "sidepanel"), forwards UI
 * actions to the background, and re-dispatches every background message as a
 * "jiuwen:bg" CustomEvent on window so the side panel can render connection
 * status, session state, and agent stream events natively.
 */

import { createLogger } from "@shared/logger";
import { MSG } from "@shared/constants";

const log = createLogger("sidepanel/bridge");

export class ChatBridge {
  private _port: chrome.runtime.Port | null = null;
  private _sessionId: string | null = null;

  connect(): void {
    this._port = chrome.runtime.connect({ name: "sidepanel" });

    this._port.onMessage.addListener((msg: Record<string, unknown>) => {
      window.dispatchEvent(new CustomEvent("jiuwen:bg", { detail: msg }));
    });

    this._port.onDisconnect.addListener(() => {
      log.warn("port disconnected — will reconnect on next message");
      this._port = null;
    });

    log.info("bridge connected");

    // Request initial state
    this._send({ action: MSG.GET_STATUS });
    this._send({ action: MSG.LIST_SESSIONS });
  }

  setActiveSession(sessionId: string): void {
    this._sessionId = sessionId;
    this._send({ action: MSG.SET_SESSION, sessionId });
  }

  sendChat(message: string, mode?: string): void {
    this._send({ action: MSG.SEND_AGENT, message, mode, sessionId: this._sessionId });
  }

  pinCurrentTab(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id != null) {
        this._send({ action: MSG.PIN_TAB, tabId: tab.id });
      }
    });
  }

  createSession(title: string, mode: string): void {
    this._send({ action: MSG.NEW_SESSION, title, mode });
  }

  retryPin(tabId: number, oldPinId: string): void {
    this._send({ action: MSG.UNPIN_TAB, id: oldPinId });
    this._send({ action: MSG.PIN_TAB, tabId });
  }

  private _send(msg: Record<string, unknown>): void {
    if (!this._port) {
      // Reconnect
      this.connect();
      return;
    }
    try {
      this._port.postMessage(msg);
    } catch (e) {
      log.warn("port postMessage failed", e);
      this._port = null;
    }
  }
}
