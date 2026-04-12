/**
 * Claude Conversation Cache - Service Worker
 * 
 * Manages IndexedDB storage for cached conversations.
 * Receives messages from content script via BroadcastChannel.
 */

const DB_NAME = 'claude-cache';
const DB_VERSION = 1;
const STORE_CONVERSATIONS = 'conversations';
const STORE_STREAMS = 'streams';

let db = null;

// Initialize IndexedDB
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Store for complete conversation data
      if (!database.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        const convStore = database.createObjectStore(STORE_CONVERSATIONS, { 
          keyPath: 'conversationId' 
        });
        convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        convStore.createIndex('name', 'name', { unique: false });
      }
      
      // Store for in-progress stream data
      if (!database.objectStoreNames.contains(STORE_STREAMS)) {
        const streamStore = database.createObjectStore(STORE_STREAMS, { 
          keyPath: 'conversationId' 
        });
        streamStore.createIndex('startedAt', 'startedAt', { unique: false });
      }
    };
  });
}

// Get database, initializing if needed
async function getDB() {
  if (!db) {
    await initDB();
  }
  return db;
}

// Maximum cached conversations before LRU eviction kicks in
const MAX_CACHED_CONVERSATIONS = 100;

// Save or update conversation data
async function saveConversation(conversationId, type, data, url) {
  const database = await getDB();
  
  const record = {
    conversationId,
    type,
    data,
    url,
    name: data.name || data.title || 'Untitled',
    messageCount: data.chat_messages?.length || 0,
    updatedAt: Date.now(),
    createdAt: data.created_at || Date.now()
  };
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    
    const request = store.put(record);
    request.onsuccess = () => {
      // Evict oldest entries if over limit
      evictOldConversations(database).catch(err =>
        console.warn('[Claude Cache SW] Eviction error:', err)
      );
      resolve(record);
    };
    request.onerror = () => reject(request.error);
  });
}

// Remove oldest conversations when cache exceeds max size
async function evictOldConversations(database) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count <= MAX_CACHED_CONVERSATIONS) return resolve();
      
      const toEvict = count - MAX_CACHED_CONVERSATIONS;
      const index = store.index('updatedAt');
      // Open cursor ascending (oldest first)
      const cursorReq = index.openCursor();
      let evicted = 0;
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && evicted < toEvict) {
          console.log('[Claude Cache SW] Evicting old conversation:', cursor.value.name);
          cursor.delete();
          evicted++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    };
    countReq.onerror = () => reject(countReq.error);
  });
}

// Get conversation by ID
async function getConversation(conversationId) {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_CONVERSATIONS, 'readonly');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    
    const request = store.get(conversationId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get all conversations, sorted by updatedAt
async function getAllConversations() {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_CONVERSATIONS, 'readonly');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    const index = store.index('updatedAt');
    
    const request = index.getAll();
    request.onsuccess = () => {
      // Sort descending (most recent first)
      const results = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

// Delete conversation
async function deleteConversation(conversationId) {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(STORE_CONVERSATIONS);
    
    const request = store.delete(conversationId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Stream handling
async function startStream(conversationId) {
  const database = await getDB();
  
  const record = {
    conversationId,
    events: [],
    rawChunks: [],
    startedAt: Date.now(),
    lastChunkAt: Date.now()
  };
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_STREAMS, 'readwrite');
    const store = tx.objectStore(STORE_STREAMS);
    
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

// How often to merge in-progress stream data into the conversation (in chunks)
const PERIODIC_MERGE_INTERVAL = 20;

// Per-conversation merge lock to prevent races between periodic merge and stream-end
const mergeLocks = new Map();

async function withMergeLock(conversationId, fn) {
  const prev = mergeLocks.get(conversationId) || Promise.resolve();
  const next = prev.then(fn, fn); // run fn after previous settles (success or failure)
  mergeLocks.set(conversationId, next);
  try {
    return await next;
  } finally {
    // Clean up if this was the last queued operation
    if (mergeLocks.get(conversationId) === next) {
      mergeLocks.delete(conversationId);
    }
  }
}

async function appendStreamChunk(conversationId, events, rawChunk) {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_STREAMS, 'readwrite');
    const store = tx.objectStore(STORE_STREAMS);

    const getRequest = store.get(conversationId);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.events.push(...events);
        record.rawChunks.push(rawChunk);
        record.lastChunkAt = Date.now();

        const putRequest = store.put(record);
        putRequest.onsuccess = () => {
          // Periodically merge in-progress stream into conversation for crash safety
          if (record.rawChunks.length % PERIODIC_MERGE_INTERVAL === 0) {
            withMergeLock(conversationId, () =>
              mergeInProgressStream(conversationId, record.events)
            );
          }
          resolve(record);
        };
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        // Stream wasn't started properly, create it now
        startStream(conversationId).then(newRecord => {
          newRecord.events.push(...events);
          newRecord.rawChunks.push(rawChunk);
          store.put(newRecord);
          resolve(newRecord);
        });
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Track consecutive merge failures per conversation
const mergeFailures = new Map();

// Merge in-progress stream into conversation so cached data stays current
async function mergeInProgressStream(conversationId, events) {
  try {
    if (!events || events.length === 0) return;
    const message = reconstructMessageFromEvents(events);
    message._partial = true;
    message._streaming = true;
    await mergeStreamedMessage(conversationId, message);
    mergeFailures.delete(conversationId);
    console.log('[Claude Cache SW] Periodic merge: updated conversation with', events.length, 'events');
  } catch (err) {
    const count = (mergeFailures.get(conversationId) || 0) + 1;
    mergeFailures.set(conversationId, count);
    console.warn('[Claude Cache SW] Periodic merge failed (attempt', count + '):', err);
    if (count >= 3) {
      chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
      chrome.action.setBadgeText({ text: '!' });
    }
  }
}

async function endStream(conversationId) {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_STREAMS, 'readwrite');
    const store = tx.objectStore(STORE_STREAMS);
    
    const getRequest = store.get(conversationId);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.endedAt = Date.now();
        record.complete = true;
        
        // Keep the stream data for potential recovery
        const putRequest = store.put(record);
        putRequest.onsuccess = () => resolve(record);
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve(null);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function getStream(conversationId) {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_STREAMS, 'readonly');
    const store = tx.objectStore(STORE_STREAMS);
    
    const request = store.get(conversationId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteStream(conversationId) {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_STREAMS, 'readwrite');
    const store = tx.objectStore(STORE_STREAMS);
    
    const request = store.delete(conversationId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Reconstruct message from SSE events
function reconstructMessageFromEvents(events) {
  const message = {
    uuid: null,
    sender: 'assistant',
    content: [],
    created_at: new Date().toISOString()
  };

  let currentText = '';
  let currentThinking = '';
  
  for (const event of events) {
    if (event.raw) continue; // Skip unparseable events
    
    // Handle different event types based on Claude's SSE format
    if (event.type === 'message_start' && event.message) {
      message.uuid = event.message.id;
      message.created_at = event.message.created_at || message.created_at;
    }
    
    if (event.type === 'content_block_start') {
      // New content block starting
    }
    
    if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        currentText += delta.text;
      }
      if (delta?.type === 'thinking_delta' && delta.thinking) {
        currentThinking += delta.thinking;
      }
    }
    
    if (event.type === 'content_block_stop') {
      // Content block finished
      if (currentText) {
        message.content.push({ type: 'text', text: currentText });
        currentText = '';
      }
      if (currentThinking) {
        message.content.push({ type: 'thinking', thinking: currentThinking });
        currentThinking = '';
      }
    }
    
    // Handle tool use events
    if (event.type === 'tool_use') {
      message.content.push({
        type: 'tool_use',
        id: event.id,
        name: event.name,
        input: event.input
      });
    }
  }
  
  // Capture any remaining content
  if (currentText) {
    message.content.push({ type: 'text', text: currentText });
  }
  if (currentThinking) {
    message.content.push({ type: 'thinking', thinking: currentThinking });
  }

  return message;
}

// Handle messages from content script relay (ISOLATED world)
async function handleContentScriptMessage(type, data) {
  console.log('[Claude Cache SW]', type, data?.conversationId || '', data?.chunkNumber ? `chunk #${data.chunkNumber}` : '');
  
  try {
    switch (type) {
      case 'conversation-data':
        await saveConversation(
          data.conversationId,
          data.type,
          data.data,
          data.url
        );
        // Update badge to show we have fresh data
        updateBadge(data.conversationId);
        break;
        
      case 'stream-start':
        console.log('[Claude Cache SW] Stream started via', data.method || 'fetch');
        await startStream(data.conversationId);
        break;
        
      case 'stream-chunk':
        await appendStreamChunk(
          data.conversationId,
          data.events || [],
          data.rawChunk
        );
        break;
        
      case 'stream-end':
        console.log('[Claude Cache SW] Stream ended, processing...');
        const streamData = await endStream(data.conversationId);
        if (streamData) {
          console.log('[Claude Cache SW] Stream had', streamData.events?.length || 0, 'events,', streamData.rawChunks?.length || 0, 'raw chunks');
          if (streamData.events && streamData.events.length > 0) {
            // Reconstruct the message and merge with existing conversation (serialized)
            const reconstructed = reconstructMessageFromEvents(streamData.events);
            await withMergeLock(data.conversationId, () =>
              mergeStreamedMessage(data.conversationId, reconstructed)
            );
          }
          // Also save raw buffer for recovery
          if (data.buffer) {
            await saveRawStreamBuffer(data.conversationId, data.buffer);
          }
        }
        break;
        
      case 'stream-error':
        console.warn('[Claude Cache SW] Stream error after', data.chunkCount || '?', 'chunks');
        // Keep the partial stream data for recovery
        const partialStream = await getStream(data.conversationId);
        if (partialStream) {
          partialStream.error = data.error;
          partialStream.errorAt = Date.now();
          partialStream.finalBuffer = data.buffer;
          // Persist updated stream record
          const swDb = await getDB();
          await new Promise((resolve, reject) => {
            const tx = swDb.transaction(STORE_STREAMS, 'readwrite');
            const store = tx.objectStore(STORE_STREAMS);
            const req = store.put(partialStream);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
          // Reconstruct and merge partial message so it's visible in cached conversation
          if (partialStream.events && partialStream.events.length > 0) {
            console.log('[Claude Cache SW] Reconstructing partial message from', partialStream.events.length, 'events');
            const partialMessage = reconstructMessageFromEvents(partialStream.events);
            partialMessage._partial = true;
            partialMessage._error = data.error;
            await withMergeLock(data.conversationId, () =>
              mergeStreamedMessage(data.conversationId, partialMessage)
            );
          }
        }
        // Also save raw buffer separately
        if (data.buffer) {
          await saveRawStreamBuffer(data.conversationId, data.buffer);
        }
        console.log('[Claude Cache SW] Preserved', data.buffer?.length || 0, 'chars of stream data');
        break;
        
      case 'conversation-changed':
      case 'conversation-active':
        // Could use this to pre-fetch or update UI
        break;
    }
  } catch (err) {
    console.error('[Claude Cache SW] Error handling message:', err);
  }
}

// Save raw stream buffer for recovery
async function saveRawStreamBuffer(conversationId, buffer) {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_STREAMS, 'readwrite');
    const store = tx.objectStore(STORE_STREAMS);
    
    const getRequest = store.get(conversationId);
    getRequest.onsuccess = () => {
      let record = getRequest.result || {
        conversationId,
        events: [],
        rawChunks: [],
        startedAt: Date.now()
      };
      record.rawBuffer = buffer;
      record.bufferSavedAt = Date.now();
      
      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve(record);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Merge a streamed message into the cached conversation
async function mergeStreamedMessage(conversationId, message) {
  const existing = await getConversation(conversationId);
  
  if (existing && existing.data && existing.data.chat_messages) {
    // Check if message already exists (by UUID)
    const existingIdx = existing.data.chat_messages.findIndex(
      m => m.uuid === message.uuid
    );
    
    if (existingIdx >= 0) {
      // Update existing message
      existing.data.chat_messages[existingIdx] = message;
    } else {
      // Append new message
      existing.data.chat_messages.push(message);
    }
    
    await saveConversation(
      conversationId,
      existing.type,
      existing.data,
      existing.url
    );
  }
}

// Update extension badge
function updateBadge(conversationId) {
  // Could show dot or count to indicate cached data
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  chrome.action.setBadgeText({ text: '•' });
  
  // Clear badge after a few seconds
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

// Handle messages from popup and content script relay
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;
  
  // Content script messages (from relay)
  const contentScriptTypes = [
    'conversation-data', 'stream-start', 'stream-chunk', 
    'stream-end', 'stream-error', 'conversation-changed', 'conversation-active'
  ];
  
  if (contentScriptTypes.includes(type)) {
    handleContentScriptMessage(type, data);
    // No response needed for content script messages
    return false;
  }
  
  // Popup messages (need async response)
  (async () => {
    try {
      switch (type) {
        case 'get-conversations':
          const conversations = await getAllConversations();
          sendResponse({ success: true, data: conversations });
          break;
          
        case 'get-conversation':
          const conversation = await getConversation(message.conversationId);
          // Check for active/partial stream data and merge it on-the-fly
          const activeStream = await getStream(message.conversationId);
          if (activeStream && activeStream.events?.length > 0 && !activeStream.complete) {
            const inProgress = reconstructMessageFromEvents(activeStream.events);
            inProgress._partial = true;
            inProgress._streaming = !activeStream.error;
            if (conversation?.data?.chat_messages) {
              const idx = conversation.data.chat_messages.findIndex(m => m.uuid === inProgress.uuid);
              if (idx >= 0) {
                conversation.data.chat_messages[idx] = inProgress;
              } else {
                conversation.data.chat_messages.push(inProgress);
              }
            }
          }
          sendResponse({ success: true, data: conversation });
          break;
          
        case 'get-stream':
          const stream = await getStream(message.conversationId);
          sendResponse({ success: true, data: stream });
          break;
          
        case 'get-stream-status':
          // Return summary of all active (non-complete) streams
          const statusDb = await getDB();
          const streamStatus = await new Promise((resolve, reject) => {
            const tx = statusDb.transaction(STORE_STREAMS, 'readonly');
            const store = tx.objectStore(STORE_STREAMS);
            const req = store.getAll();
            req.onsuccess = () => {
              const active = req.result
                .filter(s => !s.complete)
                .map(s => ({
                  conversationId: s.conversationId,
                  chunks: s.rawChunks?.length || 0,
                  events: s.events?.length || 0,
                  startedAt: s.startedAt,
                  lastChunkAt: s.lastChunkAt,
                  error: s.error || null,
                  mergeFailures: mergeFailures.get(s.conversationId) || 0
                }));
              resolve(active);
            };
            req.onerror = () => reject(req.error);
          });
          sendResponse({ success: true, data: streamStatus });
          break;
          
        case 'delete-conversation':
          await deleteConversation(message.conversationId);
          await deleteStream(message.conversationId);
          sendResponse({ success: true });
          break;
          
        case 'clear-all':
          const allConvs = await getAllConversations();
          for (const conv of allConvs) {
            await deleteConversation(conv.conversationId);
            await deleteStream(conv.conversationId);
          }
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      console.error('[Claude Cache SW] Message handler error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Initialize on startup
initDB().then(() => {
  console.log('[Claude Cache SW] Initialized');
}).catch(err => {
  console.error('[Claude Cache SW] Init error:', err);
});
