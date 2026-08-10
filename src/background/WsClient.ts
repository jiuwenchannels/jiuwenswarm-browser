/**
 * WebSocket client for the JiuwenSwarm background service worker.
 *
 * Maintains a single persistent WebSocket connection to the local server.
 * Reconnects automatically with exponential back-off on unexpected close.
 * All inbound envelopes are dispatched to registered handlers.
 */

import { createLogger } from "@shared/logger";
import { InboundEnvelope, OutboundEnvelope } from "@shared/protocol";
import { loadSettings } from "@shared/storage";
import { WS_URL } from "@shared/constants";

export type EventHandler = (envelope: InboundEnvelope) => void;
export type StatusChangeHandler = (connected: boolean) => void;

const log = createLogger("bg/ws");

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export class WsClient {
  private _ws: WebSocket | null = null;
  private _handlers: Set<EventHandler> = new Set();
  private _retryCount = 0;
  private _intentionalClose = false;
  private _onStatusChange: StatusChangeHandler | null = null;

  /** Register a callback fired whenever the connection state flips. */
  onStatusChange(handler: StatusChangeHandler): void {
    this._onStatusChange = handler;
  }

  get isConnected(): boolean {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    const settings = await loadSettings();
    const url = WS_URL(settings.host, settings.port);
    this._intentionalClose = false;
    this._open(url);
  }

  disconnect(): void {
    this._intentionalClose = true;
    this._ws?.close();
    this._ws = null;
  }

  send(envelope: OutboundEnvelope): void {
    if (!this.isConnected || !this._ws) {
      log.warn("send() called while disconnected — dropping", envelope.type);
      return;
    }
    this._ws.send(JSON.stringify(envelope));
  }

  onEvent(handler: EventHandler): () => void {
    this._handlers.add(handler);
    return () => this._handlers.delete(handler);
  }

  private _open(url: string): void {
    log.info("connecting to", url);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      log.info("connected");
      this._retryCount = 0;
      this._ws = ws;
      this._onStatusChange?.(true);
    };

    ws.onmessage = (ev: MessageEvent) => {
      let envelope: InboundEnvelope;
      try {
        envelope = JSON.parse(ev.data as string) as InboundEnvelope;
      } catch (e) {
        log.warn("could not parse inbound message", e);
        return;
      }
      for (const h of this._handlers) {
        try {
          h(envelope);
        } catch (e) {
          log.error("handler threw", e);
        }
      }
    };

    ws.onerror = (ev) => {
      log.warn("websocket error", ev);
    };

    ws.onclose = () => {
      this._ws = null;
      this._onStatusChange?.(false);
      if (this._intentionalClose) {
        log.info("disconnected (intentional)");
        return;
      }
      const delay = BACKOFF_MS[Math.min(this._retryCount, BACKOFF_MS.length - 1)];
      log.info(`reconnecting in ${delay}ms (attempt ${this._retryCount + 1})`);
      this._retryCount++;
      setTimeout(() => this._open(url), delay);
    };
  }
}
