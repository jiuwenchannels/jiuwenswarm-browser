/**
 * Typed wrappers around chrome.storage.local.
 *
 * Sessions are server-owned. The extension stores only:
 *   - ACTIVE_SESSION — which session is currently selected (pointer only)
 *   - PINNED_PAGES   — browser-specific research context (extracted page text)
 *   - SETTINGS       — host/port and behaviour preferences
 */

import { STORAGE_KEYS } from "./constants";
import {
  DEFAULT_SETTINGS,
  ExtensionSettings,
  PinnedPage,
} from "./types";

// ---------------------------------------------------------------------------
// Active session pointer (server owns the full session list)
// ---------------------------------------------------------------------------

export async function loadActiveSessionId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSION);
  return (result[STORAGE_KEYS.ACTIVE_SESSION] as string) ?? null;
}

export async function saveActiveSessionId(id: string | null): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSION]: id });
}

// ---------------------------------------------------------------------------
// Pinned pages
// ---------------------------------------------------------------------------

export async function loadPinnedPages(): Promise<PinnedPage[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PINNED_PAGES);
  return (result[STORAGE_KEYS.PINNED_PAGES] as PinnedPage[]) ?? [];
}

export async function savePinnedPages(pages: PinnedPage[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PINNED_PAGES]: pages });
}

export async function addPinnedPage(page: PinnedPage): Promise<void> {
  const pages = await loadPinnedPages();
  pages.push(page);
  await savePinnedPages(pages);
}

export async function removePinnedPage(id: string): Promise<void> {
  const pages = await loadPinnedPages();
  await savePinnedPages(pages.filter((p) => p.id !== id));
}

export async function getPinnedPagesBySession(
  sessionId: string
): Promise<PinnedPage[]> {
  const pages = await loadPinnedPages();
  return pages.filter((p) => p.sessionId === sessionId);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(
  settings: Partial<ExtensionSettings>
): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}
