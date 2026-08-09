/**
 * Highlights text passages in the page on behalf of the agent.
 *
 * Uses the CSS Custom Highlight API (Chrome 105+) when available,
 * falls back to <mark> element injection.
 */

import { MSG } from "@shared/constants";
import { HighlightMsg } from "@shared/types";

const HIGHLIGHT_CLASS = "jiuwen-highlight";
const STYLE_ID = "jiuwen-highlight-style";

export function startAnnotator(): void {
  // Inject highlight styles once
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        background-color: #ffe08a;
        border-radius: 2px;
        padding: 0 1px;
      }
    `;
    document.head.appendChild(style);
  }

  chrome.runtime.onMessage.addListener((msg: HighlightMsg | { action: string }) => {
    if (msg.action === MSG.HIGHLIGHT_TEXT) {
      highlightText((msg as HighlightMsg).text, (msg as HighlightMsg).color);
    } else if (msg.action === MSG.CLEAR_HIGHLIGHTS) {
      clearHighlights();
    }
    return false;
  });
}

function highlightText(searchText: string, _color?: string): void {
  if (!searchText) return;
  clearHighlights();

  // Simple text search + mark injection (no regex, safe for arbitrary strings)
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if ((node as Text).textContent?.includes(searchText)) {
      textNodes.push(node as Text);
    }
  }

  for (const textNode of textNodes.slice(0, 20)) {
    const idx = textNode.textContent?.indexOf(searchText) ?? -1;
    if (idx === -1) continue;
    const before = textNode.textContent!.slice(0, idx);
    const after = textNode.textContent!.slice(idx + searchText.length);
    const mark = document.createElement("mark");
    mark.className = HIGHLIGHT_CLASS;
    mark.textContent = searchText;
    const parent = textNode.parentNode!;
    parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(mark, textNode);
    parent.insertBefore(document.createTextNode(after), textNode);
    parent.removeChild(textNode);
    break; // highlight first occurrence only
  }
}

function clearHighlights(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.replaceWith(el.textContent ?? "");
  });
}
