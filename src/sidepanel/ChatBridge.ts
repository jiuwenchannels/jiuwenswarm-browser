/**
 * Bridge between the background service worker port and the chat iframe.
 *
 * The shared-webview chat.html (used by VS Code / JetBrains / JupyterLab) only
 * sends messages up when one of its host bridges is installed on the iframe's
 * contentWindow — vscodeApi, window.__jb_send, or window.__jupyter_send.  This
 * bridge installs window.__jupyter_send so the webview can talk to us, pushes
 * connection status down (connected / disconnected), and translates between the
 * extension's E2A WebSocket envelopes (token / done / error / sessions) and the
 * webview's jiuwen_event protocol.
 */

import { createLogger } from "@shared/logger";
import { MSG } from "@shared/constants";

const log = createLogger("sidepanel/bridge");

export class ChatBridge {
  private _port: chrome.runtime.Port | null = null;
  private _iframe: HTMLIFrameElement;
  private _sessionId: string | null = null;
  /** requestId handed to us by the webview for the in-flight send */
  private _requestId: string | null = null;

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

    // Listen for messages the iframe posts up directly (postMessage path)
    window.addEventListener("message", (ev) => {
      if (ev.source !== this._iframe.contentWindow) return;
      this._onIframeMessage(ev.data as Record<string, unknown>);
    });

    // Install the __jupyter_send bridge once the shared webview has loaded
    this._iframe.addEventListener("load", () => this._installBridge());

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

  private _installBridge(): void {
    const win = this._iframe.contentWindow;
    if (!win) return;

    // chat.html's send() picks up window.__jupyter_send when present.
    const bridgeWindow = win as unknown as { __jupyter_send?: (jsonStr: string) => void };
    if (!bridgeWindow.__jupyter_send) {
      bridgeWindow.__jupyter_send = (jsonStr: string) => {
        try {
          this._onIframeMessage(JSON.parse(jsonStr));
        } catch (e) {
          log.warn("could not parse iframe message", e);
        }
      };
    }

    log.info("bridge installed on chat iframe");
    // Re-request state so the webview gets connected/session data after load.
    this._send({ action: MSG.GET_STATUS });
    this._send({ action: MSG.LIST_SESSIONS });
  }

  private _onBgMessage(msg: Record<string, unknown>): void {
    const action = msg.action ?? msg.type;

    // Connection status -> enable/disable the webview input
    if (action === MSG.STATUS) {
      if (msg.connected) {
        this._toIframe({
          type: "connected",
          sessionId: (msg.activeSessionId as string) || null,
          sessionTitle: null,
          models: [],
          activeModel: null,
        });
      } else {
        this._toIframe({ type: "disconnected" });
      }
      return;
    }

    // Server stream envelopes -> webview jiuwen_event protocol
    if (action === "token") {
      const payload = (msg.payload as { text?: string }) ?? {};
      if (payload.text) {
        this._toIframe({
          type: "jiuwen_event",
          event: {
            event_type: "chat.delta",
            request_id: this._requestId,
            payload: { text: payload.text },
          },
        });
      }
      return;
    }
    if (action === "done") {
      const payload = (msg.payload as { text?: string }) ?? {};
      this._toIframe({
        type: "jiuwen_event",
        event: {
          event_type: "chat.final",
          request_id: this._requestId,
          payload: { content: payload.text ?? "" },
        },
      });
      this._requestId = null;
      return;
    }
    if (action === "error") {
      const payload = (msg.payload as { message?: string }) ?? {};
      this._toIframe({
        type: "jiuwen_event",
        event: {
          event_type: "chat.error",
          request_id: this._requestId,
          payload: { error: payload.message ?? "Unknown error" },
        },
      });
      this._requestId = null;
      return;
    }

    // A freshly created session becomes active — point the webview at it
    if (action === "session_created") {
      const payload = (msg.payload as { session_id?: string }) ?? {};
      this._sessionId = payload.session_id ?? null;
      this._toIframe({
        type: "connected",
        sessionId: this._sessionId,
        sessionTitle: null,
        models: [],
        activeModel: null,
      });
    }

    // Session list also feeds the webview's own session picker
    if (action === "sessions") {
      this._toIframe({ type: "sessions", sessions: msg.sessions ?? [] });
    }

    // Emit custom events for the side panel UI to handle
    window.dispatchEvent(new CustomEvent("jiuwen:bg", { detail: msg }));
  }

  private _onIframeMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    if (type === "send") {
      this._requestId = (msg.requestId as string) || null;
      const content =
        typeof msg.content === "string" ? msg.content : typeof msg.text === "string" ? msg.text : "";
      if (content) this.sendChat(content);
      return;
    }
    if (type === "list_sessions") {
      this._send({ action: MSG.LIST_SESSIONS });
      return;
    }
    if (type === "switch_session") {
      this.setActiveSession(msg.sessionId as string);
      return;
    }
    if (type === "new_session") {
      this.createSession("New session", "research");
      return;
    }
    // Other webview host requests (skills, rewind, git, files, …) are not
    // supported by the browser channel — ignore them silently.
  }

  private _toIframe(envelope: Record<string, unknown>): void {
    try {
      this._iframe.contentWindow?.postMessage(envelope, "*");
    } catch (e) {
      log.warn("postMessage to iframe failed", e);
    }
  }
}
