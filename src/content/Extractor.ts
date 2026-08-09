/**
 * Page content extractor.
 *
 * Uses Readability.js as the baseline for article-like pages, with
 * specialised adapters for structured sources (GitHub, arXiv, SEC, PubMed).
 *
 * The output is a PageContext that the background caches and injects
 * into agent requests.
 */

import { Readability } from "@mozilla/readability";
import { PageContext } from "@shared/types";
import { MAX_CONTEXT_CHARS } from "@shared/constants";
import { detectPageType } from "./PageTypeDetector";
import { extractGitHub } from "./adapters/github";
import { extractArxiv } from "./adapters/arxiv";
import { extractSec } from "./adapters/sec";
import { extractPubmed } from "./adapters/pubmed";

export function extractPageContext(): PageContext {
  const url = location.href;
  const pageType = detectPageType(url);
  const capturedAt = new Date().toISOString();

  let title = document.title;
  let text = "";

  try {
    switch (pageType) {
      case "github":
        ({ title, text } = extractGitHub());
        break;
      case "arxiv":
        ({ title, text } = extractArxiv());
        break;
      case "sec":
        ({ title, text } = extractSec());
        break;
      case "pubmed":
        ({ title, text } = extractPubmed());
        break;
      default:
        ({ title, text } = extractReadability(title));
    }
  } catch {
    // Fall back to Readability
    try {
      ({ title, text } = extractReadability(title));
    } catch {
      text = document.body?.innerText?.slice(0, 5000) ?? "";
    }
  }

  const originalLength = text.length;
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS) + "\n[...truncated]";
  }

  return {
    url,
    title,
    pageType,
    capturedAt,
    text,
    originalLength,
    faviconUrl: getFaviconUrl(),
  };
}

function extractReadability(fallbackTitle: string): { title: string; text: string } {
  // Clone document so Readability doesn't mutate the live DOM
  const docClone = document.cloneNode(true) as Document;
  const reader = new Readability(docClone);
  const article = reader.parse();
  return {
    title: article?.title || fallbackTitle,
    text: article?.textContent?.trim() ?? "",
  };
}

function getFaviconUrl(): string | undefined {
  const link =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
    document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
  if (!link?.href) return undefined;
  try {
    return new URL(link.href, location.href).href;
  } catch {
    return undefined;
  }
}
