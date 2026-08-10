/**
 * Manages research session lifecycle in the background service worker.
 *
 * Sessions are server-owned. The active-session pointer is stored locally; the
 * session list is fetched from the server via `session.list` (same JSON-RPC
 * protocol as the IDE plugin / web app).
 */

import { createLogger } from "@shared/logger";
import { loadActiveSessionId, saveActiveSessionId } from "@shared/storage";
import { AgentMode, ResearchSession } from "@shared/types";
import type { WsClient } from "./WsClient";

const log = createLogger("bg/sessions");

type ServerSessionRow = {
  session_id: string;
  title?: string;
  created_at?: string;
  mode?: string;
};

type ChangeListener = (sessions: ResearchSession[], activeId: string | null) => void;

export class SessionManager {
  /** In-memory cache populated from server — not persisted locally. */
  private _sessions: ResearchSession[] = [];
  private _activeSessionId: string | null = null;
  private _listeners: Set<ChangeListener> = new Set();

  constructor(private readonly _client: WsClient) {}

  get sessions(): ResearchSession[] {
    return this._sessions;
  }

  get activeSessionId(): string | null {
    return this._activeSessionId;
  }

  get activeSession(): ResearchSession | undefined {
    return this._sessions.find((s) => s.id === this._activeSessionId);
  }

  /**
   * Load the active-session pointer from local storage. The session list is
   * fetched separately via refresh() once the connection is established.
   */
  async init(): Promise<void> {
    this._activeSessionId = await loadActiveSessionId();
    log.info("init, active pointer=", this._activeSessionId);
    this._notify();
  }

  /** Ask the server for the current session list (session.list → res). */
  async refresh(): Promise<void> {
    try {
      const payload = await this._client.request("session.list", { limit: 50 });
      const rows = (payload.sessions as ServerSessionRow[]) || [];
      this._sessions = rows
        .filter((ss) => ss && typeof ss.session_id === "string")
        .map((ss) => ({
          id: ss.session_id,
          title: ss.title || ss.session_id,
          mode: (ss.mode as AgentMode) || "chat",
          createdAt: ss.created_at || new Date().toISOString(),
          updatedAt: ss.created_at || new Date().toISOString(),
          pinnedPageIds: [],
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Keep the active pointer even if the freshly-adopted connection session
      // (from connection.ack) is not in the list yet — it is valid for chat and
      // only becomes visible in session.list after it has content. Make sure it
      // stays visible in the picker too.
      if (this._activeSessionId && !this._sessions.find((s) => s.id === this._activeSessionId)) {
        this._sessions.unshift({
          id: this._activeSessionId,
          title: this._activeSessionId,
          mode: "chat",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pinnedPageIds: [],
        });
      }

      log.info(`server sessions updated: ${this._sessions.length} sessions`);
      this._notify();
    } catch (e) {
      log.error("session.list failed", e);
    }
  }

  /** Create a new session on the server and activate it. */
  async createSession(title: string, mode: AgentMode = "research"): Promise<void> {
    try {
      const payload = await this._client.request("session.create", {
        title,
        mode,
        create_token: this._randomHex(16),
      });
      const sid = payload.session_id as string | undefined;
      if (!sid) {
        log.warn("session.create returned no session_id");
        return;
      }
      this._activeSessionId = sid;
      await saveActiveSessionId(sid);
      // Refresh the list so the new session shows up in the picker.
      await this.refresh();
      this._notify();
    } catch (e) {
      log.error("session.create failed", e);
    }
  }

  /** Adopt the connection's auto-created session (from connection.ack). */
  setSessionFromAck(sessionId: string, mode?: string): void {
    if (!sessionId) return;
    const existing = this._sessions.find((s) => s.id === sessionId);
    if (!existing) {
      this._sessions.unshift({
        id: sessionId,
        title: sessionId,
        mode: (mode as AgentMode) || "chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pinnedPageIds: [],
      });
    }
    this._activeSessionId = sessionId;
    void saveActiveSessionId(sessionId);
    this._notify();
  }

  async setActiveSession(id: string): Promise<void> {
    if (!this._sessions.find((s) => s.id === id)) {
      log.warn("setActiveSession: unknown id", id);
      return;
    }
    await this._client.request("session.switch", { session_id: id }).catch(() => {});
    this._activeSessionId = id;
    await saveActiveSessionId(id);
    this._notify();
  }

  onChange(listener: ChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _randomHex(bytes: number): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  private _notify(): void {
    for (const l of this._listeners) {
      try {
        l(this._sessions, this._activeSessionId);
      } catch (e) {
        log.error("listener threw", e);
      }
    }
  }
}
