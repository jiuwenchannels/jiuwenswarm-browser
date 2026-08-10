/**
 * NoteEditor — freeform markdown note block attached to the active session.
 *
 * Notes are auto-saved to chrome.storage.local (via shared/notes.ts) with an
 * 800 ms debounce. They are exposed via getNoteText() so that index.ts can
 * include them in the agent context block when sending a chat message.
 *
 * The editor is hidden by default; the "📝" toggle button in the side panel
 * shows and hides it.
 */

import { createLogger } from "@shared/logger";
import { loadNote, saveNote } from "@shared/notes";

const log = createLogger("sidepanel/notes");

export class NoteEditor {
  private _sessionId: string | null = null;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly _textarea: HTMLTextAreaElement,
    private readonly _savedIndicator: HTMLElement,
  ) {
    this._textarea.addEventListener("input", () => this._onInput());
  }

  /** Call when the active session changes. Loads the saved note for that session. */
  async setSession(sessionId: string | null): Promise<void> {
    this._sessionId = sessionId;
    this._textarea.value = sessionId ? await loadNote(sessionId) : "";
    this._savedIndicator.style.opacity = "0";
  }

  /** Returns the current note text — used to include notes in agent context. */
  getNoteText(): string {
    return this._textarea.value.trim();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _onInput(): void {
    this._savedIndicator.style.opacity = "0";
    if (this._saveTimer != null) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._persist(), 800);
  }

  private async _persist(): Promise<void> {
    if (!this._sessionId) return;
    try {
      await saveNote(this._sessionId, this._textarea.value);
      this._savedIndicator.style.opacity = "1";
    } catch (e) {
      log.warn("note save failed", e);
    }
  }
}
