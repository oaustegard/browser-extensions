/**
 * Claude Conversation Cache - ISOLATED World Content Script
 * 
 * Relays messages between:
 * - MAIN world content script (page context, can intercept fetch)
 * - Service worker (extension context, manages IndexedDB)
 * 
 * Communication flow:
 * MAIN world --[window.postMessage]--> ISOLATED world --[chrome.runtime.sendMessage]--> Service Worker
 */

const MESSAGE_ID = 'claude-cache-message';
const VERSION = '0.4.5';
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[Claude Cache Relay]', ...args);
}

// Listen for messages from MAIN world content script
window.addEventListener('message', (event) => {
  // Only accept messages from same window
  if (event.source !== window) return;
  
  // Only accept our messages
  if (!event.data || event.data.id !== MESSAGE_ID) return;
  
  const { type, data, timestamp } = event.data;
  
  log('Relaying to service worker:', type, data?.conversationId || '');
  
  // Forward to service worker
  try {
    chrome.runtime.sendMessage({
      type,
      data,
      timestamp
    }).catch(err => {
      // Extension context invalidated (extension was reloaded)
      if (err.message?.includes('Extension context invalidated')) {
        console.warn('[Claude Cache Relay] Extension reloaded - refresh page to reconnect');
      } else if (!err.message?.includes('Receiving end does not exist')) {
        console.error('[Claude Cache Relay] Error:', err);
      }
    });
  } catch (err) {
    // Synchronous error - extension context gone
    if (err.message?.includes('Extension context invalidated')) {
      console.warn('[Claude Cache Relay] Extension reloaded - refresh page to reconnect');
    } else {
      console.error('[Claude Cache Relay] Error:', err);
    }
  }
});

// Listen for messages from popup/service worker that need to go to MAIN world
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'request-capture') {
    log('Forwarding capture request to MAIN world');
    
    // Post to MAIN world
    window.postMessage({
      id: MESSAGE_ID,
      type: 'request-capture',
      timestamp: Date.now()
    }, '*');
    
    sendResponse({ success: true });
  }
  
  return false; // Sync response
});

log(`ISOLATED world relay initialized (v${VERSION})`);
