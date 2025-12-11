// Default redirects to seed on first install
const DEFAULT_REDIRECTS = [
  { from: 'x.com', to: 'xcancel.com' },
  { from: 'twitter.com', to: 'xcancel.com' }
];

let rebuildInProgress = false;

// Rebuild declarativeNetRequest rules from stored redirects
async function rebuildRules() {
  if (rebuildInProgress) return;
  rebuildInProgress = true;
  
  try {
    const { redirects = [] } = await chrome.storage.sync.get('redirects');
    
    // Remove all existing dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existingRules.map(r => r.id);
    
    if (removeIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: removeIds
      });
    }
    
    // Build new rules from stored redirects
    const addRules = redirects.map((redirect, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { transform: { host: redirect.to } }
      },
      condition: {
        requestDomains: [redirect.from, `www.${redirect.from}`],
        resourceTypes: ['main_frame', 'sub_frame']
      }
    }));
    
    if (addRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: addRules
      });
    }
    
    console.log(`Rebuilt ${addRules.length} redirect rules`);
  } finally {
    rebuildInProgress = false;
  }
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.redirects) {
    rebuildRules();
  }
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Seed default redirects on first install
    // The onChanged listener will trigger rebuildRules
    await chrome.storage.sync.set({ redirects: DEFAULT_REDIRECTS });
  } else {
    // For updates, just rebuild from existing storage
    rebuildRules();
  }
});
