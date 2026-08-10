/**
 * Bridge between the background service worker port and the chat iframe.
 *
 * Translates inbound server envelopes into the window.postMessage API
 * that chat.html (shared-webview) expects, and forwards messages from
 * the iframe back to background via the port.
 */

import { createLogger } from "@shared/logger";
import { InboundEnvelope, OutboundMsgType } from "@shared/protocol";
import { MSG } from "@shared/constants";

const log = createLogger("sidepanel/bridge");

export class ChatBridge {
  private _port: chrome.runtime.Port | null = null;
  private _iframe: HTMLIFrameElement;
  private _sessionId: string | null = null;

  constructor(iframe: HTMLIFrameElement) {
    this._iframe = iframe;
  }

  connect(): void {
    this._port = chrome.runtime.connect({ name: "sidepanel" });

    this._port.onMessage.addListener((msg: Record<string, unknown>) => {
      this._onBgMessage(msg);
    });

    this._port.onDisconnect.addListener(() => {
      log.warn("port disconnected — will reconnect on next message");
      this._port = null;
    });

    // Listen for messages from the chat iframe
    window.addEventListener("message", (ev) => {
      if (ev.source !== this._iframe.contentWindow) return;
      this._onIframeMessage(ev.data as Record<string, unknown>);
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

  sendChat(message: string): void {
    this._send({ action: MSG.SEND_AGENT, message, sessionId: this._sessionId });
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

  /**
   * Re-pin a tab to get fresh context, replacing the old pinned-page entry.
   * Background removes the old pin by id then re-extracts and re-adds.
   */
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

  private _onBgMessage(msg: Record<string, unknown>): void {
    const action = msg.action ?? msg.type;

    // Forward agent stream events to iframe
    if (action === "token" || action === "done" || action === "error") {
      this._toIframe(msg as InboundEnvelope);
      return;
    }

    // Emit custom events for the side panel UI to handle
    window.dispatchEvent(new CustomEvent("jiuwen:bg", { detail: msg }));
  }

  private _onIframeMessage(msg: Record<string, unknown>): void {
    // The shared chat iframe emits { type: 'send', text: '...' }
    if (msg.type === "send" && typeof msg.text === "string") {
      this.sendChat(msg.text);
    }
  }

  private _toIframe(envelope: Record<string, unknown>): void {
    try {
      this._iframe.contentWindow?.postMessage(envelope, "*");
    } catch (e) {
      log.warn("postMessage to iframe failed", e);
    }
  }
}
