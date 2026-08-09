/**
 * Observes tab lifecycle events and requests page context from content scripts.
 *
 * Triggers:
 * - Tab updated (loading complete) → request context extraction
 * - Tab removed → evict from ContextCache
 * - Tab activated → notify side panel of current tab
 */

import { createLogger } from "@shared/logger";
import { MSG } from "@shared/constants";
import type { ContextCache } from "./ContextCache";
import type { PageContext } from "@shared/types";

const log = createLogger("bg/tabs");

export class TabWatcher {
  constructor(private readonly _cache: ContextCache) {}

  start(): void {
    chrome.tabs.onUpdated.addListener(this._onUpdated.bind(this));
    chrome.tabs.onRemoved.addListener(this._onRemoved.bind(this));
    log.info("tab watcher started");
  }

  stop(): void {
    chrome.tabs.onUpdated.removeListener(this._onUpdated.bind(this));
    chrome.tabs.onRemoved.removeListener(this._onRemoved.bind(this));
  }

  /** Pull context from a specific tab (used when user pins a page). */
  async extractFromTab(tabId: number): Promise<PageContext | null> {
    // Return cached value if fresh (< 30s)
    const cached = this._cache.get(tabId);
    if (cached) {
      const age = Date.now() - new Date(cached.capturedAt).getTime();
      if (age < 30_000) return cached;
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: MSG.PAGE_CONTEXT,
      });
      return (response as PageContext) ?? null;
    } catch (e) {
      log.warn(`failed to extract context from tab ${tabId}`, e);
      return null;
    }
  }

  private _onUpdated(
    tabId: number,
    info: chrome.tabs.TabChangeInfo
  ): void {
    if (info.status !== "complete") return;
    // Asynchronously fetch context — fire and forget
    this.extractFromTab(tabId)
      .then((ctx) => {
        if (ctx) {
          this._cache.set(tabId, ctx);
          log.debug(`cached context for tab ${tabId}: ${ctx.title}`);
        }
      })
      .catch((e) => log.warn("context extraction error", e));
  }

  private _onRemoved(tabId: number): void {
    this._cache.delete(tabId);
    log.debug(`evicted context for closed tab ${tabId}`);
  }
}
