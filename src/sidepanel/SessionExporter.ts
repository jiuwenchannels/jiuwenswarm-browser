/**
 * SessionExporter — export, import, open-in-web-app, and session templates.
 *
 * Export formats:
 *   JSON (.json)     — re-importable; contains full pinned page data
 *   Markdown (.md)   — human-readable research package for sharing
 *
 * Import: reads a JSON export and re-adds pinned pages to the current session.
 * Open in web app: opens the active session in the JiuwenSwarm web UI.
 * Templates: predefined session starters that auto-fill name, mode, and
 *            inject a starting prompt into the chat after creation.
 */

import { addPinnedPage, getPinnedPagesBySession, loadSettings } from "@shared/storage";
import { AgentMode, PinnedPage, ResearchSession } from "@shared/types";

// ---------------------------------------------------------------------------
// Session templates
// ---------------------------------------------------------------------------

export interface SessionTemplate {
  id: string;
  label: string;
  defaultTitle: string;
  defaultMode: AgentMode;
  startingPrompt: string;
  suggestedPages: string[];
}

export const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    id: "company-research",
    label: "Company Research",
    defaultTitle: "Company Research",
    defaultMode: "research",
    startingPrompt:
      "Pin the company website, LinkedIn profile, and recent news, then ask:\n\nSummarize this company — what they do, their funding stage, key people, and recent developments.",
    suggestedPages: ["Company website", "LinkedIn", "Crunchbase", "Recent news"],
  },
  {
    id: "paper-review",
    label: "Paper Review",
    defaultTitle: "Paper Review",
    defaultMode: "summarize",
    startingPrompt:
      "Pin the paper on arXiv or PubMed, then ask:\n\nSummarize this paper — what problem it solves, the methodology, key results, and limitations.",
    suggestedPages: ["arXiv or PubMed page", "Related papers"],
  },
  {
    id: "due-diligence",
    label: "Due Diligence",
    defaultTitle: "Due Diligence",
    defaultMode: "research",
    startingPrompt:
      "Pin the SEC filings, company investor page, and recent news, then ask:\n\nPerform due diligence — analyze financials, key risks, competitive position, and recent developments.",
    suggestedPages: ["SEC EDGAR filing", "Company IR page", "Recent news", "Competitor pages"],
  },
];

export function getTemplate(id: string): SessionTemplate | undefined {
  return SESSION_TEMPLATES.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Export — JSON
// ---------------------------------------------------------------------------

export interface ExportPackage {
  version: "1";
  session: {
    id: string;
    title: string;
    mode: string;
    createdAt: string;
  };
  pinnedPages: PinnedPage[];
  exportedAt: string;
}

export async function exportSessionJson(session: ResearchSession): Promise<void> {
  const pinnedPages = await getPinnedPagesBySession(session.id);
  const pkg: ExportPackage = {
    version: "1",
    session: {
      id: session.id,
      title: session.title,
      mode: session.mode,
      createdAt: session.createdAt,
    },
    pinnedPages,
    exportedAt: new Date().toISOString(),
  };
  _download(
    JSON.stringify(pkg, null, 2),
    `jiuwen-${_safeName(session.title)}.json`,
    "application/json",
  );
}

// ---------------------------------------------------------------------------
// Export — Markdown
// ---------------------------------------------------------------------------

export async function exportSessionMarkdown(session: ResearchSession): Promise<void> {
  const pinnedPages = await getPinnedPagesBySession(session.id);
  const lines: string[] = [
    `# Research Session: ${session.title}`,
    ``,
    `**Mode:** ${session.mode}  `,
    `**Created:** ${new Date(session.createdAt).toLocaleString()}  `,
    `**Exported:** ${new Date().toLocaleString()}`,
    ``,
    `---`,
    ``,
    `## Pinned Pages (${pinnedPages.length})`,
    ``,
  ];

  for (const page of pinnedPages) {
    lines.push(`### ${page.context.title || page.context.url}`);
    lines.push(`- **URL:** ${page.context.url}`);
    lines.push(`- **Type:** ${page.context.pageType}`);
    lines.push(`- **Pinned:** ${new Date(page.pinnedAt).toLocaleString()}`);
    if (page.note) lines.push(`- **Note:** ${page.note}`);
    const preview = page.context.text.slice(0, 800).trimEnd();
    if (preview) {
      const quoted = preview.replace(/\n/g, "\n> ");
      lines.push(``, `> ${quoted}${page.context.text.length > 800 ? " …" : ""}`);
    }
    lines.push(``, `---`, ``);
  }

  lines.push(`*Chat conversation history is stored on the JiuwenSwarm server.*`);
  _download(
    lines.join("\n"),
    `jiuwen-${_safeName(session.title)}.md`,
    "text/markdown",
  );
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Reads a JSON export file and re-adds all pinned pages to targetSessionId.
 * Returns the number of pages imported.
 */
export async function importSessionJson(
  file: File,
  targetSessionId: string,
): Promise<number> {
  const text = await file.text();
  let pkg: ExportPackage;
  try {
    pkg = JSON.parse(text) as ExportPackage;
  } catch {
    throw new Error("Could not parse file — is it a valid JiuwenSwarm export?");
  }
  if (pkg.version !== "1" || !Array.isArray(pkg.pinnedPages)) {
    throw new Error("Unrecognised export format (expected version 1).");
  }
  for (const page of pkg.pinnedPages) {
    // Re-stamp with target session; keep all other fields intact
    await addPinnedPage({ ...page, sessionId: targetSessionId });
  }
  return pkg.pinnedPages.length;
}

// ---------------------------------------------------------------------------
// Open in web app
// ---------------------------------------------------------------------------

export async function openInWebApp(sessionId: string): Promise<void> {
  const settings = await loadSettings();
  const url = `http://${settings.host}:${settings.port}/#session=${sessionId}`;
  await chrome.tabs.create({ url });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _safeName(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "session";
}

function _download(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
