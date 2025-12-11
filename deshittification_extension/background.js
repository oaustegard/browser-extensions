// background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'addRule') {
      const selector = message.selector;
      // Get the active tab where the message originated
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          sendResponse({ status: 'No active tab found.' });
          return;
        }
        const url = new URL(tabs[0].url);
        const hostname = url.hostname;
        chrome.storage.sync.get(hostname, (data) => {
          const rules = data[hostname] || [];
          // Avoid duplicate selectors
          if (!rules.some(rule => rule.selector === selector)) {
            rules.push({ selector });
            chrome.storage.sync.set({ [hostname]: rules }, () => {
              // Notify content script to re-apply rules
              chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshRules' });
            });
          }
        });
      });
      // Acknowledge the message
      sendResponse({ status: 'Rule processing initiated.' });
    }
  });
  