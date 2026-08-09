/**
 * Context bar — shows pinned page chips and the "Pin page" button.
 */

import { PinnedPage } from "@shared/types";

export class ContextBar {
  private _chipsEl: HTMLElement;
  private _onUnpin: (id: string) => void;

  constructor(chipsEl: HTMLElement, onUnpin: (id: string) => void) {
    this._chipsEl = chipsEl;
    this._onUnpin = onUnpin;
  }

  update(pinnedPages: PinnedPage[]): void {
    this._chipsEl.innerHTML = "";
    for (const page of pinnedPages) {
      this._chipsEl.appendChild(this._makeChip(page));
    }
  }

  addPage(page: PinnedPage): void {
    this._chipsEl.appendChild(this._makeChip(page));
  }

  private _makeChip(page: PinnedPage): HTMLElement {
    const chip = document.createElement("div");
    chip.className = "pin-chip";
    chip.dataset.id = page.id;

    const favicon = document.createElement("img");
    favicon.src = page.context.faviconUrl ?? chrome.runtime.getURL("icons/icon-16.png");
    favicon.width = 12;
    favicon.height = 12;
    favicon.style.borderRadius = "2px";

    const label = document.createElement("span");
    label.textContent = page.context.title || page.context.url;
    label.title = page.context.url;
    label.style.cssText = "max-width:100px;overflow:hidden;text-overflow:ellipsis;";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.title = "Unpin";
    removeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      chip.remove();
      this._onUnpin(page.id);
    });

    chip.appendChild(favicon);
    chip.appendChild(label);
    chip.appendChild(removeBtn);
    return chip;
  }
}
