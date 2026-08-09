/**
 * Session picker dropdown — shows available research sessions
 * and lets the user switch between them or create a new one.
 */

import { ResearchSession } from "@shared/types";

export class SessionPicker {
  private _el: HTMLElement;
  private _label: HTMLElement;
  private _sessions: ResearchSession[] = [];
  private _activeId: string | null = null;
  private _onSelect: (id: string) => void;
  private _open = false;

  constructor(
    pickerEl: HTMLElement,
    labelEl: HTMLElement,
    onSelect: (id: string) => void
  ) {
    this._el = pickerEl;
    this._label = labelEl;
    this._onSelect = onSelect;

    labelEl.addEventListener("click", () => this.toggle());
    document.addEventListener("click", (ev) => {
      if (!this._el.contains(ev.target as Node) && ev.target !== labelEl) {
        this.close();
      }
    });
  }

  update(sessions: ResearchSession[], activeId: string | null): void {
    this._sessions = sessions;
    this._activeId = activeId;
    const active = sessions.find((s) => s.id === activeId);
    this._label.textContent = active?.title ?? "No session";
    this._label.title = active?.title ?? "";
    if (this._open) this._render();
  }

  toggle(): void {
    this._open ? this.close() : this.open();
  }

  open(): void {
    this._open = true;
    this._render();
    this._el.classList.add("open");
  }

  close(): void {
    this._open = false;
    this._el.classList.remove("open");
  }

  private _render(): void {
    this._el.innerHTML = "";
    for (const session of this._sessions) {
      const item = document.createElement("div");
      item.className = "session-item" + (session.id === this._activeId ? " active" : "");
      item.textContent = session.title;
      item.title = `Mode: ${session.mode} | Created: ${new Date(session.createdAt).toLocaleDateString()}`;
      item.addEventListener("click", () => {
        this._onSelect(session.id);
        this.close();
      });
      this._el.appendChild(item);
    }
  }
}
