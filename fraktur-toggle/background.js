// Background service worker for Fraktur Toggle

// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  // Check if URL is valid for content scripts
  if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
    console.log('Cannot run on this page');
    return;
  }

  try {
    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      // Content script may already be injected, continue
    }

    // Send toggle message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    console.log('Toggled Fraktur:', response.enabled);

  } catch (error) {
    console.error('Toggle error:', error);
  }
});
