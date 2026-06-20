// Open Link in Profile — MV3 service worker.
//
// The extension itself cannot cross the profile boundary; it talks to a native
// messaging host (profile_switcher_host.py) that enumerates profiles and
// launches `chrome --profile-directory=<dir> <url>`.

const HOST = "com.muninn.profile_switcher";
const PARENT = "open-in-profile";
const REFRESH = "open-in-profile-refresh";

// Chrome's context-menu API can't render avatar images, so each profile gets a
// colored dot instead: Chrome's own avatar color when the host can read it,
// otherwise a stable color derived from the profile so they stay distinguishable.
const PALETTE = [
  { dot: "🔴", rgb: [211, 47, 47] },
  { dot: "🟠", rgb: [245, 124, 0] },
  { dot: "🟡", rgb: [251, 192, 45] },
  { dot: "🟢", rgb: [56, 142, 60] },
  { dot: "🔵", rgb: [25, 118, 210] },
  { dot: "🟣", rgb: [142, 36, 170] },
  { dot: "🟤", rgb: [121, 85, 72] },
  { dot: "⚫", rgb: [66, 66, 66] },
  { dot: "⚪", rgb: [224, 224, 224] },
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function dotFor(profile) {
  // profile.color is an ARGB integer from Chrome's Local State (may be negative).
  if (typeof profile.color === "number") {
    const r = (profile.color >> 16) & 0xff;
    const g = (profile.color >> 8) & 0xff;
    const b = profile.color & 0xff;
    let best = 0;
    let bestD = Infinity;
    PALETTE.forEach((p, i) => {
      const d = (p.rgb[0] - r) ** 2 + (p.rgb[1] - g) ** 2 + (p.rgb[2] - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return PALETTE[best].dot;
  }
  // Fallback: stable, distinct color derived from the profile directory.
  return PALETTE[hashString(profile.dir) % PALETTE.length].dot;
}

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.runtime.sendNativeMessage(HOST, { action: "list" }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        const msg = chrome.runtime.lastError
          ? chrome.runtime.lastError.message
          : (resp && resp.error) || "unknown error";
        console.error("[profile-switcher] native host unavailable:", msg);
        chrome.contextMenus.create({
          id: PARENT,
          title: "Open link in profile (native host not found)",
          contexts: ["link"],
          enabled: false,
        });
        return;
      }

      chrome.contextMenus.create({
        id: PARENT,
        title: "Open link in profile",
        contexts: ["link"],
      });

      for (const p of resp.profiles) {
        chrome.contextMenus.create({
          id: "prof:" + p.dir,
          parentId: PARENT,
          title: dotFor(p) + " " + p.name,
          contexts: ["link"],
        });
      }

      // Lets you pick up newly-created profiles without reloading the extension.
      chrome.contextMenus.create({
        id: "sep",
        parentId: PARENT,
        type: "separator",
        contexts: ["link"],
      });
      chrome.contextMenus.create({
        id: REFRESH,
        parentId: PARENT,
        title: "↻ Refresh profile list",
        contexts: ["link"],
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === REFRESH) {
    buildMenus();
    return;
  }
  if (typeof info.menuItemId !== "string" || !info.menuItemId.startsWith("prof:")) {
    return;
  }
  const dir = info.menuItemId.slice("prof:".length);
  const url = info.linkUrl || info.pageUrl;
  chrome.runtime.sendNativeMessage(HOST, { action: "open", profile: dir, url }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error("[profile-switcher] open failed:", chrome.runtime.lastError.message);
    } else if (resp && !resp.ok) {
      console.error("[profile-switcher] open failed:", resp.error);
    }
  });
});
