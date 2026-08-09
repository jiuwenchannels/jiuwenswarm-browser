/**
 * Options page entry point.
 * Loads settings from storage, binds form fields, saves on submit.
 */

import { loadSettings, saveSettings } from "@shared/storage";
import { AgentMode } from "@shared/types";
import { createLogger } from "@shared/logger";

const log = createLogger("options");

const hostInput = document.getElementById("host") as HTMLInputElement;
const portInput = document.getElementById("port") as HTMLInputElement;
const defaultModeSelect = document.getElementById("default-mode") as HTMLSelectElement;
const autoExtractCheck = document.getElementById("auto-extract") as HTMLInputElement;
const showAnnotationsCheck = document.getElementById("show-annotations") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn")!;
const statusMsg = document.getElementById("status-msg")!;

async function load(): Promise<void> {
  const settings = await loadSettings();
  hostInput.value = settings.host;
  portInput.value = String(settings.port);
  defaultModeSelect.value = settings.defaultMode;
  autoExtractCheck.checked = settings.autoExtract;
  showAnnotationsCheck.checked = settings.showAnnotations;
  log.debug("settings loaded", settings);
}

saveBtn.addEventListener("click", async () => {
  const port = parseInt(portInput.value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    alert("Port must be between 1 and 65535.");
    return;
  }
  await saveSettings({
    host: hostInput.value.trim() || "127.0.0.1",
    port,
    defaultMode: defaultModeSelect.value as AgentMode,
    autoExtract: autoExtractCheck.checked,
    showAnnotations: showAnnotationsCheck.checked,
  });
  statusMsg.classList.add("visible");
  setTimeout(() => statusMsg.classList.remove("visible"), 2000);
  log.info("settings saved");
});

load().catch((e) => log.error("failed to load settings", e));
