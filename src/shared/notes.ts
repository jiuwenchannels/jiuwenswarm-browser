/**
 * Typed wrappers around chrome.storage.local for session notes.
 *
 * Each research session can have a freeform markdown note block.
 * Notes are stored as a flat Record<sessionId, string> under one storage key.
 * They are included in agent context as "[User notes]\n{text}" when the user
 * sends a chat message.
 */

import { STORAGE_KEYS } from "./constants";

async function _loadAllNotes(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.NOTES);
  return (result[STORAGE_KEYS.NOTES] as Record<string, string>) ?? {};
}

export async function loadNote(sessionId: string): Promise<string> {
  const all = await _loadAllNotes();
  return all[sessionId] ?? "";
}

export async function saveNote(sessionId: string, text: string): Promise<void> {
  const all = await _loadAllNotes();
  if (text.trim() === "") {
    delete all[sessionId];
  } else {
    all[sessionId] = text;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: all });
}
