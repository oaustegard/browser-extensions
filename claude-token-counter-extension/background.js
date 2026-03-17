/* Claude Token Counter — Background Service Worker */

const LOG_PREFIX = "[Token Counter BG]";

/* Handle messages from popup requesting latest analysis */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getAnalysis") {
    chrome.storage.local.get(
      ["lastAnalysis", "lastConversationId", "lastAnalysisTime"],
      (data) => {
        sendResponse(data);
      }
    );
    return true; /* async response */
  }

  if (message.type === "refreshAnalysis") {
    /* Send message to the active claude.ai tab to re-analyze */
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes("claude.ai")) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "refresh" }, (resp) => {
          if (chrome.runtime.lastError) {
            console.warn(LOG_PREFIX, "Content script not ready:", chrome.runtime.lastError.message);
            sendResponse({ error: "Content script not ready" });
          } else {
            sendResponse(resp);
          }
        });
      } else {
        sendResponse({ error: "No active Claude.ai tab" });
      }
    });
    return true;
  }
});

/* Update badge text when analysis is stored */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.lastAnalysis) {
    const analysis = changes.lastAnalysis.newValue;
    if (analysis?.totals) {
      const cost = analysis.totals.totalCost;
      const text = cost < 0.01 ? "<1¢" : "$" + cost.toFixed(2);
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: "#059669" });
      chrome.action.setBadgeTextColor({ color: "#ffffff" });
    }
  }
});

console.log(LOG_PREFIX, "Service worker loaded");
