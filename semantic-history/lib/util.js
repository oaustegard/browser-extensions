// Small helpers shared by the service worker, the offscreen document and the side panel.

export const BUILD = "2026-11-26-1";

// FNV-1a over a string, as 8 hex digits. Used to skip re-encoding a page whose text has not changed.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export const SETTINGS_DEFAULTS = {
  paused: false,
  autoSensitive: true,
  dwellSec: 10,
  groupThreshold: 0.2,
  excludes: null,          // null = DEFAULT_EXCLUDES; set once the user edits the list
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...SETTINGS_DEFAULTS, ...(settings || {}) };
}

export async function setSettings(patch) {
  const s = await getSettings();
  await chrome.storage.local.set({ settings: { ...s, ...patch } });
}
