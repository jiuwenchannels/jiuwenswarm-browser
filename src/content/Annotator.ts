/**
 * Highlights text passages in the page on behalf of the agent.
 *
 * Two kinds of highlights:
 *   Transient (.jiuwen-highlight) — applied by the agent during a session;
 *     cleared on CLEAR_HIGHLIGHTS or when the agent moves on.
 *   Persistent (.jiuwen-saved)   — backed by storage; restored on every visit;
 *     the user can attach a sticky note to them.
 *
 * Uses <mark> element injection (Chrome 105 Custom Highlight API not needed).
 */

import { MSG } from "@shared/constants";
import { AnnotationEntry, AnnotationRestoreMsg, HighlightMsg } from "@shared/types";

const TRANSIENT_CLASS = "jiuwen-highlight";
const SAVED_CLASS     = "jiuwen-saved";
const STYLE_ID        = "jiuwen-highlight-style";
const POPOVER_ID      = "jiuwen-annotation-popover";

export function startAnnotator(): void {
  _injectStyles();

  chrome.runtime.onMessage.addListener(
    (msg: HighlightMsg | AnnotationRestoreMsg | { action: string }) => {
      const action = (msg as { action: string }).action;

      if (action === MSG.HIGHLIGHT_TEXT) {
        const m = msg as HighlightMsg;
        _applyTransient(m.text, m.color);
      } else if (action === MSG.CLEAR_HIGHLIGHTS) {
        _clearTransient();
      } else if (action === MSG.RESTORE_ANNOTATIONS) {
        const m = msg as AnnotationRestoreMsg;
        _restoreSaved(m.annotations);
      }

      return false;
    }
  );
}

// ---------------------------------------------------------------------------
// Transient highlights (agent session — cleared by agent)
// ---------------------------------------------------------------------------

function _applyTransient(searchText: string, _color?: string): void {
  if (!searchText) return;
  _clearTransient();

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node as Text).textContent ?? "";
    const idx = text.indexOf(searchText);
    if (idx === -1) continue;
    const mark = document.createElement("mark");
    mark.className = TRANSIENT_CLASS;
    mark.textContent = searchText;
    const parent = node.parentNode!;
    parent.insertBefore(document.createTextNode(text.slice(0, idx)), node);
    parent.insertBefore(mark, node);
    parent.insertBefore(document.createTextNode(text.slice(idx + searchText.length)), node);
    parent.removeChild(node);
    break; // first occurrence only
  }
}

function _clearTransient(): void {
  document.querySelectorAll(`.${TRANSIENT_CLASS}`).forEach((el) => {
    el.replaceWith(el.textContent ?? "");
  });
}

// ---------------------------------------------------------------------------
// Persistent saved annotations (restored from storage on every visit)
// ---------------------------------------------------------------------------

function _restoreSaved(annotations: AnnotationEntry[]): void {
  // Remove any previously restored marks before re-applying (prevents duplicates
  // if this message is received multiple times on the same page load).
  document.querySelectorAll(`.${SAVED_CLASS}`).forEach((el) => {
    el.replaceWith(el.textContent ?? "");
  });

  for (const entry of annotations) {
    _applySaved(entry);
  }
}

function _applySaved(entry: AnnotationEntry): void {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node as Text).textContent ?? "";
    const idx = text.indexOf(entry.text);
    if (idx === -1) continue;

    const mark = document.createElement("mark");
    mark.className = SAVED_CLASS;
    mark.dataset.annotationId = entry.id;
    mark.dataset.annotationNote = entry.note;
    mark.style.setProperty("--ann-color", entry.color || "#ffe08a");
    mark.textContent = entry.text;
    mark.title = entry.note ? `Note: ${entry.note}` : "Click to add a note";

    mark.addEventListener("click", (e) => {
      e.stopPropagation();
      _openPopover(mark, entry.id, entry.note);
    });

    const parent = node.parentNode!;
    parent.insertBefore(document.createTextNode(text.slice(0, idx)), node);
    parent.insertBefore(mark, node);
    parent.insertBefore(document.createTextNode(text.slice(idx + entry.text.length)), node);
    parent.removeChild(node);
    break;
  }
}

// ---------------------------------------------------------------------------
// Sticky note popover
// ---------------------------------------------------------------------------

function _openPopover(anchor: HTMLElement, annotationId: string, currentNote: string): void {
  _closePopover();

  const popover = document.createElement("div");
  popover.id = POPOVER_ID;

  const rect = anchor.getBoundingClientRect();
  Object.assign(popover.style, {
    position: "fixed",
    top: `${rect.bottom + window.scrollY + 6}px`,
    left: `${Math.max(8, rect.left)}px`,
    zIndex: "2147483647",
  });

  const textarea = document.createElement("textarea");
  textarea.value = currentNote;
  textarea.placeholder = "Add a note…";
  textarea.rows = 4;

  const row = document.createElement("div");
  row.className = "jiuwen-pop-row";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    const note = textarea.value.trim();
    // Update the mark's tooltip and data
    anchor.dataset.annotationNote = note;
    anchor.title = note ? `Note: ${note}` : "Click to add a note";
    chrome.runtime.sendMessage({ action: MSG.ANNOTATION_UPDATE, id: annotationId, note });
    _closePopover();
  });

  const delBtn = document.createElement("button");
  delBtn.textContent = "Delete";
  delBtn.className = "jiuwen-pop-del";
  delBtn.addEventListener("click", () => {
    anchor.replaceWith(anchor.textContent ?? "");
    chrome.runtime.sendMessage({ action: MSG.ANNOTATION_REMOVE, id: annotationId });
    _closePopover();
  });

  row.appendChild(saveBtn);
  row.appendChild(delBtn);
  popover.appendChild(textarea);
  popover.appendChild(row);
  document.body.appendChild(popover);

  textarea.focus();
}

function _closePopover(): void {
  document.getElementById(POPOVER_ID)?.remove();
}

document.addEventListener("click", (e) => {
  const pop = document.getElementById(POPOVER_ID);
  if (pop && !pop.contains(e.target as Node)) {
    _closePopover();
  }
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function _injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${TRANSIENT_CLASS} {
      background-color: #ffe08a;
      border-radius: 2px;
      padding: 0 1px;
    }
    .${SAVED_CLASS} {
      background-color: color-mix(in srgb, var(--ann-color, #ffe08a) 55%, transparent);
      outline: 2px solid var(--ann-color, #ffe08a);
      border-radius: 2px;
      padding: 0 1px;
      cursor: pointer;
    }
    #${POPOVER_ID} {
      background: #ffffff;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,.25);
      padding: 10px;
      width: 240px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: system-ui, sans-serif;
      font-size: 13px;
    }
    #${POPOVER_ID} textarea {
      width: 100%;
      resize: vertical;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }
    #${POPOVER_ID} textarea:focus { border-color: #2563eb; }
    .jiuwen-pop-row {
      display: flex;
      gap: 6px;
    }
    .jiuwen-pop-row button {
      flex: 1;
      padding: 4px 8px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      background: #2563eb;
      color: #fff;
    }
    .jiuwen-pop-del {
      background: #f3f4f6 !important;
      color: #dc2626 !important;
    }
  `;
  document.head.appendChild(style);
}
