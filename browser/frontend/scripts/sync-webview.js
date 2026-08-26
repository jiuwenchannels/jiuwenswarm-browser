#!/usr/bin/env node
/**
 * sync-webview.js
 *
 * Copies chat.html from the shared-webview package into src/webview/
 * so Vite can pick it up as a static asset.
 *
 * Source: ../../jiuwenswarm-jupyterlab/packages/shared-webview/chat.html
 * (adjust WEBVIEW_SRC if your repo layout differs)
 *
 * Usage: node scripts/sync-webview.js [--force]
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

const WEBVIEW_SRC = resolve(
  __dirname,
  "../../jiuwenswarm-jupyterlab/packages/shared-webview/chat.html"
);
const WEBVIEW_DEST_DIR = join(ROOT, "src", "webview");
const WEBVIEW_DEST = join(WEBVIEW_DEST_DIR, "chat.html");

const force = process.argv.includes("--force");

if (!existsSync(WEBVIEW_SRC)) {
  console.warn(
    `[sync-webview] Source not found: ${WEBVIEW_SRC}\n` +
    `  → Skipping copy. Create src/webview/chat.html manually or adjust WEBVIEW_SRC.`
  );
  process.exit(0);
}

if (!existsSync(WEBVIEW_DEST_DIR)) {
  mkdirSync(WEBVIEW_DEST_DIR, { recursive: true });
}

if (!force && existsSync(WEBVIEW_DEST)) {
  const srcMtime = statSync(WEBVIEW_SRC).mtimeMs;
  const destMtime = statSync(WEBVIEW_DEST).mtimeMs;
  if (destMtime >= srcMtime) {
    console.log("[sync-webview] chat.html is up to date — skipping");
    process.exit(0);
  }
}

copyFileSync(WEBVIEW_SRC, WEBVIEW_DEST);
console.log(`[sync-webview] Copied chat.html → ${WEBVIEW_DEST}`);
