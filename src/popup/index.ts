/**
 * Popup entry point.
 * Shows connection status, active session, and pinned page count.
 * Provides quick actions: open side panel, open settings.
 */

import { createLogger } from "@shared/logger";
import { MSG } from "@shared/constants";
import { getPinnedPagesBySession } from "@shared/storage";

const log = createLogger("popup");

const statusDot = document.getElementById("status-dot")!;
const statusText = document.getElementById("status-text")!;
const sessionName = document.getElementById("session-name")!;
const pinCount = document.getElementById("pin-count")!;
const openPanelBtn = document.getElementById("open-panel-btn")!;
const openOptionsBtn = document.getElementById("open-options-btn")!;

// Request status from background via one-shot message
chrome.runtime.sendMessage({ action: MSG.GET_STATUS }, async (resp) => {
  if (!resp) {
    statusText.textContent = "Server not reachable";
    return;
  }
  const connected: boolean = resp.connected;
  statusDot.classList.toggle("connected", connected);
  statusText.textContent = connected ? "Connected to local server" : "Not connected";

  const activeId: string | null = resp.activeSessionId;
  if (activeId) {
    sessionName.textContent = resp.activeSessionTitle ?? activeId;

    const pages = await getPinnedPagesBySession(activeId);
    pinCount.textContent = String(pages.length);
  } else {
    sessionName.textContent = "None";
  }
});

openPanelBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ action: MSG.OPEN_PANEL, windowId: tab?.windowId });
  window.close();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

log.debug("popup loaded");
