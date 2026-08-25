/** Shared domain types for the JiuwenSwarm browser extension. */

// ---------------------------------------------------------------------------
// Page context
// ---------------------------------------------------------------------------

export interface PageMeta {
  url: string;
  title: string;
  /** MIME-like type detected by PageTypeDetector */
  pageType: "article" | "github" | "arxiv" | "sec" | "pubmed" | "wikipedia" | "youtube" | "twitter" | "hackernews" | "pdf" | "generic";
  faviconUrl?: string | undefined;
  /** ISO-8601 timestamp when context was captured */
  capturedAt: string;
}

export interface PageContext extends PageMeta {
  /** Extracted main-content text (Readability output, truncated if needed) */
  text: string;
  /** Character count of original before truncation */
  originalLength: number;
}

// ---------------------------------------------------------------------------
// Pinned page
// ---------------------------------------------------------------------------

export interface PinnedPage {
  id: string;           // nanoid
  tabId: number;
  sessionId: string;
  context: PageContext;
  /** User-assigned note */
  note: string;
  pinnedAt: string;     // ISO-8601
}

// ---------------------------------------------------------------------------
// Annotations (persistent page highlights + sticky notes)
// ---------------------------------------------------------------------------

export interface AnnotationEntry {
  id: string;          // nanoid
  /** Normalized URL (no fragment, no trailing slash variation) */
  url: string;
  sessionId: string;
  /** Text excerpt that was highlighted */
  text: string;
  /** CSS hex color, e.g. "#ffe08a" */
  color: string;
  /** User-written sticky note attached to this highlight */
  note: string;
  createdAt: string;   // ISO-8601
}

// ---------------------------------------------------------------------------
// Research session
// ---------------------------------------------------------------------------

export interface ResearchSession {
  id: string;           // nanoid
  title: string;
  mode: string;
  createdAt: string;   // ISO-8601
  updatedAt: string;
  pinnedPageIds: string[];
}

// ---------------------------------------------------------------------------
// Extension settings
// ---------------------------------------------------------------------------

export interface ExtensionSettings {
  host: string;
  port: number;
  /** Auto-extract page context when side panel opens */
  autoExtract: boolean;
  /** Show inline annotations on pinned pages */
  showAnnotations: boolean;
  /** Immediately ask for a short summary when a page is pinned */
  autoSummarizeOnPin: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  host: "127.0.0.1",
  port: 19000,
  autoExtract: true,
  showAnnotations: true,
  autoSummarizeOnPin: false,
};

// ---------------------------------------------------------------------------
// Internal messages
// ---------------------------------------------------------------------------

export interface PageContextMsg {
  action: "page_context";
  context: PageContext;
}

export interface SelectionMsg {
  action: "selection_text";
  text: string;
  url: string;
}

export interface HighlightMsg {
  action: "highlight_text";
  text: string;
  color?: string;
}

export interface FillFormMsg {
  action: "fill_form";
  fields: Record<string, string>;
}

export interface StatusMsg {
  action: "status";
  connected: boolean;
  activeSessionId: string | null;
  pinnedCount: number;
}

export interface AnnotationRestoreMsg {
  action: "restore_annotations";
  annotations: AnnotationEntry[];
}

export interface AnnotationUpdateMsg {
  action: "annotation_update";
  id: string;
  note: string;
}

export interface AnnotationRemoveMsg {
  action: "annotation_remove";
  id: string;
}

export type ExtMessage =
  | PageContextMsg
  | SelectionMsg
  | HighlightMsg
  | FillFormMsg
  | StatusMsg
  | AnnotationRestoreMsg
  | AnnotationUpdateMsg
  | AnnotationRemoveMsg;
