// Open Link in Profile — MV3 service worker.
//
// The extension itself cannot cross the profile boundary; it talks to a native
// messaging host (profile_switcher_host.py) that enumerates profiles and
// launches `chrome --profile-directory=<dir> <url>`.

const HOST = "com.muninn.profile_switcher";
const PARENT = "open-in-profile";
const REFRESH = "open-in-profile-refresh";

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
          title: p.name,
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
