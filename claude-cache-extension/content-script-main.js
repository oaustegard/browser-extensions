/**
 * Claude Conversation Cache - Content Script
 * 
 * Runs in MAIN world to intercept fetch() calls.
 * Captures:
 * 1. Full conversation JSON from /chat_conversations/{id}
 * 2. SSE stream chunks during active generation
 * 
 * Communicates with service worker via window.postMessage -> 
 * injected relay script in ISOLATED world (if needed) or BroadcastChannel.
 */

(function() {
  'use strict';

  const VERSION = '0.5.1';
  const LOG_PREFIX = '[Claude Cache]';
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function error(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  // Pattern matchers for Claude API endpoints
  const CONVERSATION_API_PATTERN = /\/api\/organizations\/[^/]+\/chat_conversations\/([a-f0-9-]+)/;
  const COMPLETION_API_PATTERN = /\/api\/organizations\/[^/]+\/chat_conversations\/([a-f0-9-]+)\/completion/;
  const SNAPSHOT_API_PATTERN = /\/api\/organizations\/[^/]+\/chat_snapshots\/([a-f0-9-]+)/;

  // Communication with ISOLATED world content script via window.postMessage
  // (BroadcastChannel doesn't work across extension/page origins)
  const MESSAGE_ID = 'claude-cache-message';

  function sendToServiceWorker(type, data) {
    window.postMessage({ 
      id: MESSAGE_ID,
      type, 
      data, 
      timestamp: Date.now() 
    }, '*');
  }

  // Listen for capture requests from popup (via isolated script)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.id !== MESSAGE_ID) return;
    
    if (event.data.type === 'request-capture') {
      log('Capture requested from popup');
      fetchAndCacheCurrentConversation();
    }
  });

  // Extract conversation ID from URL
  function getConversationIdFromUrl(url) {
    // Check completion FIRST - it's more specific and would otherwise match conversation pattern
    const compMatch = url.match(COMPLETION_API_PATTERN);
    if (compMatch) return { id: compMatch[1], type: 'completion' };
    
    const convMatch = url.match(CONVERSATION_API_PATTERN);
    if (convMatch) return { id: convMatch[1], type: 'conversation' };
    
    const snapMatch = url.match(SNAPSHOT_API_PATTERN);
    if (snapMatch) return { id: snapMatch[1], type: 'snapshot' };
    
    return null;
  }

  // Parse SSE data lines into events
  function parseSSEChunk(chunk) {
    const events = [];
    const lines = chunk.split('\n');
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        currentData += line.slice(6);
      } else if (line === '' && currentData) {
        try {
          events.push(JSON.parse(currentData));
        } catch (e) {
          // Not valid JSON, might be partial or special message
          events.push({ raw: currentData });
        }
        currentData = '';
      }
    }

    return events;
  }

  // Process SSE stream, forwarding chunks to cache while returning to app
  async function processSSEStream(response, conversationId) {
    log('Starting SSE stream processing for', conversationId);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    
    // Create a new ReadableStream that both caches and passes through
    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // Stream complete - signal end to cache
              log('Stream complete for', conversationId, '- processed', chunkCount, 'chunks');
              sendToServiceWorker('stream-end', { 
                conversationId,
                buffer 
              });
              controller.close();
              break;
            }

            chunkCount++;
            
            // Decode chunk
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Parse and cache SSE events
            const events = parseSSEChunk(chunk);
            
            // Always send chunk data, even if parsing found no events
            sendToServiceWorker('stream-chunk', {
              conversationId,
              events,
              rawChunk: chunk,
              chunkNumber: chunkCount
            });

            // Pass through to app
            controller.enqueue(value);
          }
        } catch (err) {
          error('Stream processing error:', err);
          log('Saving partial stream buffer:', buffer.length, 'chars');
          sendToServiceWorker('stream-error', {
            conversationId,
            error: err.message,
            buffer,
            chunkCount
          });
          controller.error(err);
        }
      }
    });

    return new Response(stream, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText
    });
  }

  // Also intercept EventSource in case Claude uses it for SSE
  const OriginalEventSource = window.EventSource;
  if (OriginalEventSource) {
    window.EventSource = function(url, config) {
      const urlInfo = getConversationIdFromUrl(url);
      if (urlInfo && urlInfo.type === 'completion') {
        log('EventSource detected for completion:', urlInfo.id);
        sendToServiceWorker('stream-start', { conversationId: urlInfo.id, method: 'EventSource' });
      }
      
      const es = new OriginalEventSource(url, config);
      
      if (urlInfo && urlInfo.type === 'completion') {
        let buffer = '';
        const conversationId = urlInfo.id;
        
        es.addEventListener('message', (event) => {
          buffer += event.data + '\n';
          try {
            const parsed = JSON.parse(event.data);
            sendToServiceWorker('stream-chunk', {
              conversationId,
              events: [parsed],
              rawChunk: event.data
            });
          } catch (e) {
            sendToServiceWorker('stream-chunk', {
              conversationId,
              events: [{ raw: event.data }],
              rawChunk: event.data
            });
          }
        });
        
        es.addEventListener('error', () => {
          log('EventSource error, saving buffer');
          sendToServiceWorker('stream-error', {
            conversationId,
            error: 'EventSource error',
            buffer
          });
        });
        
        const origClose = es.close.bind(es);
        es.close = function() {
          log('EventSource closed for', conversationId);
          sendToServiceWorker('stream-end', { conversationId, buffer });
          return origClose();
        };
      }
      
      return es;
    };
    window.EventSource.CONNECTING = OriginalEventSource.CONNECTING;
    window.EventSource.OPEN = OriginalEventSource.OPEN;
    window.EventSource.CLOSED = OriginalEventSource.CLOSED;
  }

  // Wrap fetch to intercept Claude API calls
  const originalFetch = window.fetch;
  
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const urlInfo = getConversationIdFromUrl(url);

    // Not a Claude conversation endpoint - pass through
    if (!urlInfo) {
      return originalFetch.apply(this, arguments);
    }

    log(`Intercepting ${urlInfo.type} request for ${urlInfo.id}`);

    try {
      const response = await originalFetch.apply(this, arguments);

      // Clone response for caching (can't read body twice)
      const responseClone = response.clone();

      if (urlInfo.type === 'completion') {
        // SSE stream - need special handling
        log('Processing SSE stream for', urlInfo.id);
        sendToServiceWorker('stream-start', { conversationId: urlInfo.id });
        return processSSEStream(response, urlInfo.id);
      }

      // Full conversation or snapshot fetch
      if (urlInfo.type === 'conversation' || urlInfo.type === 'snapshot') {
        // Check if response is actually JSON (not SSE stream)
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          // Read and cache the JSON response
          responseClone.json().then(data => {
            log(`Caching ${urlInfo.type} data for ${urlInfo.id}:`, 
                data.chat_messages?.length, 'messages');
            
            sendToServiceWorker('conversation-data', {
              conversationId: urlInfo.id,
              type: urlInfo.type,
              data,
              url
            });
          }).catch(err => {
            warn('Failed to parse conversation JSON:', err);
          });
        } else if (contentType.includes('text/event-stream')) {
          // This is actually an SSE stream, handle it
          log('Conversation endpoint returned SSE stream, processing');
          sendToServiceWorker('stream-start', { conversationId: urlInfo.id });
          return processSSEStream(response, urlInfo.id);
        } else {
          log('Unexpected content-type for conversation:', contentType);
        }
      }

      return response;

    } catch (err) {
      error('Fetch interception error:', err);
      throw err;
    }
  };

  // Also intercept XMLHttpRequest for completeness (Claude might use it)
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._claudeCacheUrl = url;
    this._claudeCacheUrlInfo = getConversationIdFromUrl(url);
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._claudeCacheUrlInfo) {
      const urlInfo = this._claudeCacheUrlInfo;
      
      this.addEventListener('load', function() {
        if (this.status >= 200 && this.status < 300) {
          try {
            const data = JSON.parse(this.responseText);
            log(`XHR: Caching ${urlInfo.type} data for ${urlInfo.id}`);
            
            sendToServiceWorker('conversation-data', {
              conversationId: urlInfo.id,
              type: urlInfo.type,
              data,
              url: this._claudeCacheUrl
            });
          } catch (e) {
            // Not JSON or parse error
          }
        }
      });
    }
    
    return originalXHRSend.call(this, body);
  };

  // Track current conversation from URL changes
  function getCurrentConversationId() {
    const match = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  // Notify on navigation
  let lastConversationId = getCurrentConversationId();
  
  const observer = new MutationObserver(() => {
    const currentId = getCurrentConversationId();
    if (currentId !== lastConversationId) {
      log('Conversation changed:', lastConversationId, '->', currentId);
      sendToServiceWorker('conversation-changed', {
        previousId: lastConversationId,
        currentId
      });
      lastConversationId = currentId;
    }
  });

  // Start observing URL changes (SPA navigation)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Also listen for popstate
  window.addEventListener('popstate', () => {
    const currentId = getCurrentConversationId();
    if (currentId !== lastConversationId) {
      log('Conversation changed (popstate):', lastConversationId, '->', currentId);
      sendToServiceWorker('conversation-changed', {
        previousId: lastConversationId,
        currentId
      });
      lastConversationId = currentId;
    }
  });

  // Proactively fetch current conversation data
  async function fetchAndCacheCurrentConversation() {
    const conversationId = getCurrentConversationId();
    if (!conversationId) return;

    log('Proactively fetching conversation:', conversationId);

    try {
      // Get org ID from bootstrap (same as bookmarklet)
      const bootstrapRes = await originalFetch('https://claude.ai/api/bootstrap', {
        headers: {
          'accept': '*/*',
          'content-type': 'application/json',
          'anthropic-client-platform': 'web_claude_ai'
        },
        credentials: 'include'
      });
      
      const bootstrap = await bootstrapRes.json();
      const orgId = bootstrap?.account?.memberships?.[0]?.organization?.uuid;
      
      if (!orgId) {
        warn('Could not get org ID from bootstrap');
        return;
      }

      // Fetch full conversation data
      const apiUrl = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;
      
      const convRes = await originalFetch(apiUrl, {
        headers: {
          'accept': '*/*',
          'content-type': 'application/json',
          'anthropic-client-platform': 'web_claude_ai'
        },
        credentials: 'include'
      });

      if (!convRes.ok) {
        warn('Failed to fetch conversation:', convRes.status);
        return;
      }

      const data = await convRes.json();
      
      log('Proactively cached conversation:', conversationId, 
          data.chat_messages?.length, 'messages');
      
      sendToServiceWorker('conversation-data', {
        conversationId,
        type: 'conversation',
        data,
        url: apiUrl,
        proactive: true
      });

    } catch (err) {
      error('Proactive fetch error:', err);
    }
  }

  // Initial capture on page load
  if (lastConversationId) {
    sendToServiceWorker('conversation-active', {
      conversationId: lastConversationId
    });
    
    // Small delay to let page settle, then proactively cache
    setTimeout(fetchAndCacheCurrentConversation, 1000);
  }

  // Also fetch when conversation changes (SPA navigation)
  const originalObserverCallback = observer._callback;
  observer.disconnect();
  
  const enhancedObserver = new MutationObserver(() => {
    const currentId = getCurrentConversationId();
    if (currentId !== lastConversationId) {
      log('Conversation changed:', lastConversationId, '->', currentId);
      sendToServiceWorker('conversation-changed', {
        previousId: lastConversationId,
        currentId
      });
      lastConversationId = currentId;
      
      // Proactively fetch new conversation after navigation
      if (currentId) {
        setTimeout(fetchAndCacheCurrentConversation, 500);
      }
    }
  });
  
  enhancedObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  log(`Content script initialized (v${VERSION})`);
})();
