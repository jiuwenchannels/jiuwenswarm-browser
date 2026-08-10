/**
 * Manages research session lifecycle in the background service worker.
 *
 * The server is the single source of truth for the session list — the same
 * sessions are visible in the web app and the extension. The extension stores
 * only the active session pointer in chrome.storage.local.
 *
 * Session list lives in memory only; it is refreshed from the server on every
 * connect and after every create/delete. A cold SW restart triggers a refresh
 * automatically through the connect → init → refresh flow.
 */

import { createLogger } from "@shared/logger";
import { makeEnvelope } from "@shared/protocol";
import { loadActiveSessionId, saveActiveSessionId } from "@shared/storage";
import { AgentMode, ResearchSession } from "@shared/types";
import type { WsClient } from "./WsClient";

const log = createLogger("bg/sessions");

type ServerSessionRow = {
  session_id: string;
  title: string;
  created_at: string;
  mode: string;
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
   * Load the active-session pointer from local storage, then request the
   * session list from the server. Called once on SW startup (after connect).
   */
  async init(): Promise<void> {
    this._activeSessionId = await loadActiveSessionId();
    log.info("init, active pointer=", this._activeSessionId);
    this._notify();
  }

  /** Ask the server for the current session list. */
  refresh(): void {
    this._client.send(makeEnvelope("list_sessions", {}));
  }

  /**
   * Create a new session on the server. The session list updates when the
   * server responds with a `sessions` or `session_created` envelope.
   */
  createSession(title: string, mode: AgentMode = "research"): void {
    this._client.send(makeEnvelope("create_session", { title, mode }));
    log.info("create_session sent", title, mode);
  }

  async setActiveSession(id: string): Promise<void> {
    if (!this._sessions.find((s) => s.id === id)) {
      log.warn("setActiveSession: unknown id", id);
      return;
    }
    this._activeSessionId = id;
    await saveActiveSessionId(id);
    this._notify();
  }

  /**
   * Replace the in-memory session list with the authoritative server list.
   * Called whenever a `sessions` envelope arrives.
   */
  handleServerSessions(serverSessions: ServerSessionRow[]): void {
    this._sessions = serverSessions
      .map((ss) => ({
        id: ss.session_id,
        title: ss.title,
        mode: ss.mode as AgentMode,
        createdAt: ss.created_at,
        updatedAt: ss.created_at,
        pinnedPageIds: [],
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // If the active pointer no longer exists on the server, clear it
    if (
      this._activeSessionId &&
      !this._sessions.find((s) => s.id === this._activeSessionId)
    ) {
      log.warn("active session no longer on server, clearing pointer");
      this._activeSessionId = null;
      saveActiveSessionId(null).catch(() => {});
    }

    log.info(`server sessions updated: ${this._sessions.length} sessions`);
    this._notify();
  }

  /**
   * Handle a `session_created` envelope — add the new session and activate it.
   */
  handleSessionCreated(row: ServerSessionRow): void {
    const session: ResearchSession = {
      id: row.session_id,
      title: row.title,
      mode: row.mode as AgentMode,
      createdAt: row.created_at,
      updatedAt: row.created_at,
      pinnedPageIds: [],
    };
    this._sessions = [session, ...this._sessions];
    this._activeSessionId = session.id;
    saveActiveSessionId(session.id).catch(() => {});
    log.info("session created and activated", session.id, session.title);
    this._notify();
  }

  onChange(listener: ChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
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
