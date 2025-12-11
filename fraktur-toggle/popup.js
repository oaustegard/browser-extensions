// Popup script for Fraktur Toggle

let currentTab = null;
let currentHostname = '';
let isEnabled = false;

// Get current tab and initialize
async function initialize() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];

    if (!currentTab) {
      document.getElementById('currentSite').textContent = 'No active tab';
      return;
    }

    const url = new URL(currentTab.url);
    currentHostname = url.hostname;
    document.getElementById('currentSite').textContent = currentHostname;

    // Get current state from content script
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'getState' });
    isEnabled = response.enabled;
    updateUI();

    // Check if site is saved in storage
    const result = await chrome.storage.sync.get([currentHostname]);
    const rememberCheckbox = document.getElementById('rememberSite');
    rememberCheckbox.checked = result[currentHostname] === true;

  } catch (error) {
    console.error('Initialization error:', error);
    document.getElementById('currentSite').textContent = 'Error loading';
  }
}

// Update UI based on current state
function updateUI() {
  const button = document.getElementById('toggleButton');

  if (isEnabled) {
    button.textContent = 'Disable Fraktur';
    button.className = 'toggle-button enabled';
  } else {
    button.textContent = 'Enable Fraktur';
    button.className = 'toggle-button disabled';
  }
}

// Toggle Fraktur on the page
async function toggleFraktur() {
  if (!currentTab) return;

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'toggle' });
    isEnabled = response.enabled;
    updateUI();

    // Update storage if remember is checked
    const rememberCheckbox = document.getElementById('rememberSite');
    if (rememberCheckbox.checked) {
      await chrome.storage.sync.set({ [currentHostname]: isEnabled });
    }
  } catch (error) {
    console.error('Toggle error:', error);
  }
}

// Handle remember checkbox change
async function handleRememberChange() {
  const rememberCheckbox = document.getElementById('rememberSite');

  if (rememberCheckbox.checked) {
    // Save current state to storage
    await chrome.storage.sync.set({ [currentHostname]: isEnabled });
  } else {
    // Remove from storage
    await chrome.storage.sync.remove(currentHostname);
  }
}

// Set up event listeners
document.getElementById('toggleButton').addEventListener('click', toggleFraktur);
document.getElementById('rememberSite').addEventListener('change', handleRememberChange);

// Initialize on popup open
initialize();
