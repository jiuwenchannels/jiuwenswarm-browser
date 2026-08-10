/**
 * Context bar — shows pinned page chips with extraction quality signals.
 *
 * Each chip shows:
 * - Favicon + truncated page title
 * - Tooltip: full URL + extracted character count + page type
 * - Warning icon (⚠) if extraction returned < 200 characters
 * - PDF badge if page is a PDF (requires server-side extraction)
 * - Retry button for low-quality extractions
 * - Unpin (×) button
 */

import { PinnedPage } from "@shared/types";

const LOW_EXTRACTION_THRESHOLD = 200; // characters

export class ContextBar {
  private _chipsEl: HTMLElement;
  private _onUnpin: (id: string) => void;
  private _onRetry: (page: PinnedPage) => void;

  constructor(
    chipsEl: HTMLElement,
    onUnpin: (id: string) => void,
    onRetry: (page: PinnedPage) => void
  ) {
    this._chipsEl = chipsEl;
    this._onUnpin = onUnpin;
    this._onRetry = onRetry;
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
    const { context } = page;
    const charCount = context.text.length;
    const isLow = charCount < LOW_EXTRACTION_THRESHOLD;
    const isPdf = context.pageType === "pdf";

    const chip = document.createElement("div");
    chip.className = "pin-chip" + (isLow ? " pin-chip--warn" : "");
    chip.dataset.id = page.id;

    // Tooltip: full URL + char count + type
    const kbCount = charCount > 0 ? `${Math.round(charCount / 1000)}k chars` : "0 chars";
    chip.title = `${context.url}\nType: ${context.pageType} · ${kbCount} extracted\nPinned: ${new Date(page.pinnedAt).toLocaleString()}`;

    // Favicon
    const favicon = document.createElement("img");
    favicon.src = context.faviconUrl ?? chrome.runtime.getURL("icons/icon-16.png");
    favicon.width = 12;
    favicon.height = 12;
    favicon.style.cssText = "border-radius:2px;flex-shrink:0;";
    favicon.onerror = () => { favicon.style.display = "none"; };

    // PDF badge
    if (isPdf) {
      const badge = document.createElement("span");
      badge.textContent = "PDF";
      badge.style.cssText = "font-size:9px;background:#7c6af7;color:#fff;border-radius:3px;padding:0 3px;flex-shrink:0;";
      chip.appendChild(badge);
    }

    // Warning icon for low extraction
    if (isLow && !isPdf) {
      const warn = document.createElement("span");
      warn.textContent = "⚠";
      warn.style.cssText = "color:#f38ba8;font-size:11px;flex-shrink:0;";
      warn.title = charCount === 0
        ? "Extraction failed — page may be blocked or JS-only"
        : `Low extraction: only ${charCount} characters`;
      chip.appendChild(warn);
    }

    // Title label
    const label = document.createElement("span");
    label.textContent = context.title || context.url;
    label.style.cssText = "max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

    chip.appendChild(favicon);
    chip.appendChild(label);

    // Retry button (only for low-quality or PDF)
    if (isLow || isPdf) {
      const retryBtn = document.createElement("button");
      retryBtn.textContent = "↻";
      retryBtn.title = isPdf ? "Re-extract (requires server)" : "Retry extraction";
      retryBtn.style.cssText = "background:none;border:none;color:#7c6af7;cursor:pointer;font-size:12px;padding:0;";
      retryBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._onRetry(page);
      });
      chip.appendChild(retryBtn);
    }

    // Unpin button
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.title = "Unpin";
    removeBtn.style.cssText = "background:none;border:none;color:var(--text-dim,#7f849c);cursor:pointer;font-size:12px;padding:0;";
    removeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      chip.remove();
      this._onUnpin(page.id);
    });

    chip.appendChild(removeBtn);
    return chip;
  }
}
