/**
 * Typed wrappers around chrome.storage.local for page annotations.
 *
 * Annotations are persistent highlights left by the agent (or the user)
 * on a specific URL. They survive page reloads and browser restarts.
 * The annotation list is keyed by normalized URL for fast per-page lookups.
 */

import { STORAGE_KEYS } from "./constants";
import { AnnotationEntry } from "./types";

/** Strip fragment and normalize trailing slash for consistent URL keys. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export async function loadAnnotations(): Promise<AnnotationEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ANNOTATIONS);
  return (result[STORAGE_KEYS.ANNOTATIONS] as AnnotationEntry[]) ?? [];
}

export async function saveAnnotations(entries: AnnotationEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ANNOTATIONS]: entries });
}

export async function addAnnotation(entry: AnnotationEntry): Promise<void> {
  const all = await loadAnnotations();
  all.push(entry);
  await saveAnnotations(all);
}

export async function removeAnnotation(id: string): Promise<void> {
  const all = await loadAnnotations();
  await saveAnnotations(all.filter((a) => a.id !== id));
}

export async function updateAnnotationNote(id: string, note: string): Promise<void> {
  const all = await loadAnnotations();
  const entry = all.find((a) => a.id === id);
  if (entry) {
    entry.note = note;
    await saveAnnotations(all);
  }
}

/** Returns all annotations whose URL matches the given URL (normalized). */
export async function loadAnnotationsByUrl(url: string): Promise<AnnotationEntry[]> {
  const normalized = normalizeUrl(url);
  const all = await loadAnnotations();
  return all.filter((a) => a.url === normalized);
}

/** Returns all annotations belonging to a session. */
export async function loadAnnotationsBySession(
  sessionId: string
): Promise<AnnotationEntry[]> {
  const all = await loadAnnotations();
  return all.filter((a) => a.sessionId === sessionId);
}
