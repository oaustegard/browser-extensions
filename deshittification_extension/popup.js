// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const siteNameElem = document.getElementById('site-name');
    const ruleList = document.getElementById('rule-list');
    const addRuleBtn = document.getElementById('add-rule');
    const selectorInput = document.getElementById('selector-input');
    const pickElementBtn = document.getElementById('pick-element');
  
    // Get current tab's hostname
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return; // No active tab
      const url = new URL(tabs[0].url);
      const hostname = url.hostname;
      siteNameElem.textContent = hostname;
  
      // Load existing rules
      chrome.storage.sync.get(hostname, (data) => {
        const rules = data[hostname] || [];
        rules.forEach(rule => addRuleToList(rule.selector));
      });
    });
  
    // Add rule to list and storage
    addRuleBtn.addEventListener('click', () => {
      const selector = selectorInput.value.trim();
      if (selector) {
        addRuleToList(selector);
        saveRule(selector);
        selectorInput.value = '';
      }
    });
  
    // Function to add rule to UI list
    function addRuleToList(selector) {
      const li = document.createElement('li');
      li.textContent = selector;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'X';
      removeBtn.style.marginLeft = '10px';
      removeBtn.addEventListener('click', () => {
        li.remove();
        removeRule(selector);
      });
      li.appendChild(removeBtn);
      ruleList.appendChild(li);
    }
  
    // Save rule to storage
    function saveRule(selector) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return; // No active tab
        const url = new URL(tabs[0].url);
        const hostname = url.hostname;
        chrome.storage.sync.get(hostname, (data) => {
          const rules = data[hostname] || [];
          // Avoid adding duplicate selectors
          if (!rules.some(rule => rule.selector === selector)) {
            rules.push({ selector });
            chrome.storage.sync.set({ [hostname]: rules }, () => {
              // Notify content script to re-apply rules
              chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshRules' });
            });
          }
        });
      });
    }
  
    // Remove rule from storage
    function removeRule(selector) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return; // No active tab
        const url = new URL(tabs[0].url);
        const hostname = url.hostname;
        chrome.storage.sync.get(hostname, (data) => {
          let rules = data[hostname] || [];
          rules = rules.filter(rule => rule.selector !== selector);
          chrome.storage.sync.set({ [hostname]: rules }, () => {
            // Notify content script to re-apply rules
            chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshRules' });
          });
        });
      });
    }
  
    // Element picker functionality
    pickElementBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return; // No active tab
        const tabId = tabs[0].id;
        chrome.scripting.executeScript(
            {
              target: { tabId: tabId },
              files: ['content.js'] // Changed from 'contentScript.js' to 'content.js'
            },
            () => {
              if (chrome.runtime.lastError) { 
                  console.error("Runtime error:", chrome.runtime.lastError.message);
                  alert('Failed to start the element picker. Please ensure the content script is injected.');
              } else {
                chrome.tabs.sendMessage(tabId, { action: 'startPicker' }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error("Message error:", chrome.runtime.lastError.message);
                    alert('Failed to start the element picker. Please ensure the content script is injected.');
                  } else {
                    console.log(response.status);
                  }
                });
              }
            }
          );
      });
    });
  });
