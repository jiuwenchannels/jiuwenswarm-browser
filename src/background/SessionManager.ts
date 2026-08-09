/**
 * Manages research session lifecycle in the background service worker.
 *
 * Source of truth is chrome.storage.local (persists across SW restarts).
 * The background SW syncs session list from the local server on connect,
 * and creates/deletes sessions via the WS protocol.
 */

import { nanoid } from "nanoid";
import { createLogger } from "@shared/logger";
import { makeEnvelope } from "@shared/protocol";
import {
  loadSessions,
  saveSessions,
  loadActiveSessionId,
  saveActiveSessionId,
} from "@shared/storage";
import { AgentMode, ResearchSession } from "@shared/types";
import type { WsClient } from "./WsClient";

const log = createLogger("bg/sessions");

type ChangeListener = (sessions: ResearchSession[], activeId: string | null) => void;

export class SessionManager {
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

  /** Load persisted state from storage. Called once on SW startup. */
  async init(): Promise<void> {
    this._sessions = await loadSessions();
    this._activeSessionId = await loadActiveSessionId();
    log.info(`loaded ${this._sessions.length} sessions, active=${this._activeSessionId}`);
    this._notify();
  }

  /** Refresh session list from the server. */
  refresh(): void {
    this._client.send(makeEnvelope("list_sessions", {}));
  }

  /** Create a new research session both locally and on the server. */
  async createSession(
    title: string,
    mode: AgentMode = "research"
  ): Promise<ResearchSession> {
    const now = new Date().toISOString();
    const session: ResearchSession = {
      id: nanoid(),
      title,
      mode,
      createdAt: now,
      updatedAt: now,
      pinnedPageIds: [],
    };
    this._sessions = [session, ...this._sessions];
    this._activeSessionId = session.id;
    await this._persist();
    this._notify();

    this._client.send(
      makeEnvelope("create_session", { title, mode }, session.id)
    );
    log.info("created session", session.id, title);
    return session;
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

  /** Called by background/index.ts when a 'sessions' envelope arrives. */
  handleServerSessions(serverSessions: Array<{ session_id: string; title: string; created_at: string; mode: string }>): void {
    // Merge: keep local sessions, add any server-only ones
    const localIds = new Set(this._sessions.map((s) => s.id));
    for (const ss of serverSessions) {
      if (!localIds.has(ss.session_id)) {
        this._sessions.push({
          id: ss.session_id,
          title: ss.title,
          mode: ss.mode as AgentMode,
          createdAt: ss.created_at,
          updatedAt: ss.created_at,
          pinnedPageIds: [],
        });
      }
    }
    this._sessions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this._persist().catch((e) => log.error("persist failed", e));
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

  private async _persist(): Promise<void> {
    await saveSessions(this._sessions);
    await saveActiveSessionId(this._activeSessionId);
  }
}
