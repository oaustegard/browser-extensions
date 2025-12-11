// Fraktur Toggle Content Script

const FRAKTUR_FONTS = [
  'UnifrakturMaguntia',
  'Fette Fraktur',
  'Fraktur',
  'Old English Text MT',
  'Blackletter',
  'cursive'
].join(', ');

const STYLE_ID = 'fraktur-toggle-style';

// Get current site hostname
const hostname = window.location.hostname;

// Check if Fraktur is currently applied
function isFrakturEnabled() {
  return document.getElementById(STYLE_ID) !== null;
}

// Apply Fraktur font to the page
function enableFraktur() {
  if (isFrakturEnabled()) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    * {
      font-family: ${FRAKTUR_FONTS} !important;
    }
  `;
  document.head.appendChild(style);
}

// Remove Fraktur font from the page
function disableFraktur() {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
}

// Toggle Fraktur on/off
function toggleFraktur() {
  if (isFrakturEnabled()) {
    disableFraktur();
    return false;
  } else {
    enableFraktur();
    return true;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle') {
    const newState = toggleFraktur();
    sendResponse({ enabled: newState });
  } else if (message.action === 'getState') {
    sendResponse({ enabled: isFrakturEnabled() });
  } else if (message.action === 'setState') {
    if (message.enabled) {
      enableFraktur();
    } else {
      disableFraktur();
    }
    sendResponse({ enabled: message.enabled });
  }
  return true;
});

// Check storage on page load to see if this site should have Fraktur enabled
chrome.storage.sync.get([hostname], (result) => {
  if (result[hostname] === true) {
    enableFraktur();
  }
});
