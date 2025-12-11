// Default options: mode "v1" and copy enabled.
const DEFAULT_OPTIONS = {
  mode: "v1", // "v1" or "v2"
  copy: true
};

// (Dynamic rules remain unchanged if you still want them for network requests in v2 mode.)
const dynamicRule = {
  "id": 1,
  "priority": 1,
  "action": {
    "type": "modifyHeaders",
    "requestHeaders": [
      { "header": "x-engine", "operation": "set", "value": "readerlm-v2" },
      { "header": "Accept", "operation": "set", "value": "text/event-stream" }
    ]
  },
  "condition": {
    "urlFilter": "https://r.jina.ai/*",
    "resourceTypes": ["main_frame"]
  }
};

function updateDynamicRules(mode) {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: mode === "v2" ? [dynamicRule] : []
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error updating dynamic rules:", chrome.runtime.lastError);
    } else {
      console.log("Dynamic rules updated for mode:", mode);
    }
  });
}

chrome.storage.sync.get(DEFAULT_OPTIONS, (options) => {
  updateDynamicRules(options.mode);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.mode) {
    updateDynamicRules(changes.mode.newValue);
  }
});

// Create a context menu item when the extension is installed.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "to-md-with-jina",
    title: "Convert to Markdown with Jina ReaderLM",
    contexts: ["page"]
  });
});

// Listen for clicks on the extension icon.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    handleTrigger(tab);
  }
});

// Listen for clicks on the context menu.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "to-md-with-jina" && tab && tab.id) {
    handleTrigger(tab);
  }
});

// Open a new tab that loads result.html with the original URL passed as a query parameter.
function handleTrigger(tab) {
  if (!tab.url || !tab.id) {
    return;
  }
  const encodedUrl = encodeURIComponent(tab.url);
  const resultPageUrl = chrome.runtime.getURL("result.html?target=" + encodedUrl);
  chrome.tabs.create({ url: resultPageUrl }, (newTab) => {
    if (chrome.runtime.lastError) {
      console.error("Error opening new tab:", chrome.runtime.lastError);
    }
  });
}
