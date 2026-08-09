/**
 * Typed wrappers around chrome.storage.local.
 *
 * All public functions return Promises so callers can use async/await cleanly.
 * No polling — callers that need live updates should add their own
 * chrome.storage.onChanged listener.
 */

import { STORAGE_KEYS } from "./constants";
import {
  DEFAULT_SETTINGS,
  ExtensionSettings,
  PinnedPage,
  ResearchSession,
} from "./types";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function loadSessions(): Promise<ResearchSession[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
  return (result[STORAGE_KEYS.SESSIONS] as ResearchSession[]) ?? [];
}

export async function saveSessions(sessions: ResearchSession[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
}

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
