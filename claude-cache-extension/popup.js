/**
 * Claude Cache Popup
 * Displays cached conversations and provides pruner interface
 */

let currentConversation = null;

// DOM elements
const listView = document.getElementById('list-view');
const detailView = document.getElementById('detail-view');
const convList = document.getElementById('conv-list');
const emptyState = document.getElementById('empty-state');
const messagesContainer = document.getElementById('messages-container');
const detailTitle = document.getElementById('detail-title');
const streamNotice = document.getElementById('stream-notice');
const statsEl = document.getElementById('stats');

// Send message to service worker
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response.success) {
        reject(new Error(response.error || 'Unknown error'));
      } else {
        resolve(response.data);
      }
    });
  });
}

// Format relative time
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

// Load and display conversation list
async function loadConversationList() {
  try {
    const conversations = await sendMessage({ type: 'get-conversations' });
    
    if (!conversations || conversations.length === 0) {
      convList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    
    convList.innerHTML = conversations.map(conv => `
      <li class="conv-item" data-id="${conv.conversationId}">
        <div class="conv-info">
          <div class="conv-name">${escapeHtml(conv.name || 'Untitled')}</div>
          <div class="conv-meta">
            ${conv.messageCount} messages · ${formatRelativeTime(conv.updatedAt)}
          </div>
        </div>
        <div class="conv-actions">
          <button class="conv-action-btn claude-btn" title="Open in Claude">↗</button>
          <button class="conv-action-btn delete" title="Delete from cache">×</button>
        </div>
      </li>
    `).join('');
    
    // Add click handlers
    convList.querySelectorAll('.conv-item').forEach(item => {
      const id = item.dataset.id;
      
      item.querySelector('.claude-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: `https://claude.ai/chat/${id}` });
      });
      
      item.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        const confirmBar = document.getElementById('confirm-bar');
        document.getElementById('confirm-message').textContent = 'Delete this conversation?';
        const yesBtn = document.getElementById('confirm-yes');
        yesBtn.textContent = 'Delete';
        // Replace handler for this specific delete
        const newYes = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        newYes.addEventListener('click', async () => {
          confirmBar.classList.remove('active');
          await sendMessage({ type: 'delete-conversation', conversationId: id });
          loadConversationList();
          showStatus('Conversation deleted', 'success');
        });
        document.getElementById('confirm-no').addEventListener('click', () => {
          confirmBar.classList.remove('active');
        }, { once: true });
        confirmBar.classList.add('active');
      });
      
      // Row click opens in full tab
      item.addEventListener('click', () => openInTab(id));
    });
    
  } catch (err) {
    console.error('Failed to load conversations:', err);
    convList.innerHTML = `<li class="empty-state">Error loading conversations</li>`;
  }
}

// Open conversation in new tab (full viewer)
async function openInTab(conversationId) {
  try {
    const conversation = await sendMessage({ 
      type: 'get-conversation', 
      conversationId 
    });
    
    if (!conversation) {
      alert('Conversation data not found');
      return;
    }
    
    chrome.storage.local.set({ 'viewer-conversation': conversation }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
    });
  } catch (err) {
    console.error('Failed to open in tab:', err);
    alert('Failed to open conversation');
  }
}

// Open conversation in detail view
async function openConversation(conversationId) {
  try {
    const conversation = await sendMessage({ 
      type: 'get-conversation', 
      conversationId 
    });
    
    if (!conversation || !conversation.data) {
      alert('Conversation data not found');
      return;
    }
    
    currentConversation = conversation;
    
    // Check for stream data
    const stream = await sendMessage({ 
      type: 'get-stream', 
      conversationId 
    });
    
    // Update UI
    detailTitle.textContent = conversation.name || 'Conversation';
    
    // Show stream notice if we have partial stream data
    if (stream && stream.events?.length > 0 && !stream.complete) {
      streamNotice.style.display = 'block';
    } else {
      streamNotice.style.display = 'none';
    }
    
    // Render messages
    renderMessages(conversation.data);
    
    // Switch view
    listView.classList.remove('active');
    detailView.classList.add('active');
    
  } catch (err) {
    console.error('Failed to open conversation:', err);
    alert('Failed to load conversation');
  }
}

// Render conversation messages
function renderMessages(data) {
  messagesContainer.innerHTML = '';
  
  if (!data.chat_messages || data.chat_messages.length === 0) {
    messagesContainer.innerHTML = '<div class="empty-state">No messages</div>';
    return;
  }
  
  data.chat_messages.forEach(message => {
    const processed = PrunerCore.processMessageContent(message);
    const elements = PrunerCore.renderMessage(message, processed);

    elements.forEach(el => {
      // Header click toggles collapse
      const header = el.querySelector('.msg-header');
      if (header) {
        header.addEventListener('click', (e) => {
          e.stopPropagation();
          el.classList.toggle('collapsed');
          const toggle = el.querySelector('.toggle-collapse');
          if (toggle) {
            toggle.textContent = el.classList.contains('collapsed') ? '▶' : '▼';
          }
        });
      }

      // Body click toggles selection
      el.addEventListener('click', (e) => {
        if (e.target.closest('.msg-header')) return;
        el.classList.toggle('selected');
        updateStats();
      });
      messagesContainer.appendChild(el);
    });
  });
  
  updateStats();
}

// Update stats display
function updateStats() {
  const stats = PrunerCore.calculateStats(messagesContainer);
  statsEl.textContent = `${stats.messages} msgs · ${stats.tools} tools · ~${stats.tokens} tokens`;
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Event handlers
document.getElementById('back-btn').addEventListener('click', () => {
  detailView.classList.remove('active');
  listView.classList.add('active');
  currentConversation = null;
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  loadConversationList();
});

// Status toast helper
function showStatus(message, type = 'success', duration = 3000) {
  const toast = document.getElementById('status-toast');
  toast.textContent = message;
  toast.className = `status-toast active ${type}`;
  setTimeout(() => {
    toast.classList.remove('active');
  }, duration);
}

// Capture current conversation from active tab
document.getElementById('capture-btn').addEventListener('click', async () => {
  const btn = document.getElementById('capture-btn');
  btn.textContent = '...';
  btn.disabled = true;

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('claude.ai')) {
      showStatus('Open a claude.ai conversation first', 'error');
      btn.textContent = 'Capture';
      btn.disabled = false;
      return;
    }

    // Check if we're on a conversation page (not just claude.ai homepage)
    if (!tab.url.match(/claude\.ai\/chat\/[a-f0-9-]+/)) {
      showStatus('Navigate to a conversation first', 'error');
      btn.textContent = 'Capture';
      btn.disabled = false;
      return;
    }

    // Get current conversation count to detect new data
    let prevConversations = [];
    try {
      prevConversations = await sendMessage({ type: 'get-conversations' }) || [];
    } catch (e) { /* ignore */ }

    // Send message to content script (ISOLATED world) to trigger capture
    await chrome.tabs.sendMessage(tab.id, { type: 'request-capture' });

    // Poll for new data (up to 5 seconds)
    let captured = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const newConversations = await sendMessage({ type: 'get-conversations' }) || [];
        // Check if any conversation was added or updated since we started
        const prevMap = new Map(prevConversations.map(c => [c.conversationId, c.updatedAt]));
        const hasNew = newConversations.some(c => {
          const prev = prevMap.get(c.conversationId);
          return !prev || c.updatedAt > prev;
        });
        if (hasNew) {
          captured = true;
          break;
        }
      } catch (e) { /* ignore */ }
    }

    loadConversationList();
    btn.textContent = 'Capture';
    btn.disabled = false;

    if (captured) {
      showStatus('Conversation captured!', 'success');
    } else {
      showStatus('Capture may have failed — check console for errors', 'error', 5000);
    }

  } catch (err) {
    console.error('Capture failed:', err);
    showStatus('Failed: ' + err.message, 'error', 5000);
    btn.textContent = 'Capture';
    btn.disabled = false;
  }
});

// Inline confirmation for clear
document.getElementById('clear-btn').addEventListener('click', () => {
  document.getElementById('confirm-bar').classList.add('active');
});

document.getElementById('confirm-no').addEventListener('click', () => {
  document.getElementById('confirm-bar').classList.remove('active');
});

document.getElementById('confirm-yes').addEventListener('click', async () => {
  document.getElementById('confirm-bar').classList.remove('active');
  try {
    await sendMessage({ type: 'clear-all' });
    loadConversationList();
    showStatus('All conversations cleared', 'success');
  } catch (err) {
    showStatus('Failed to clear: ' + err.message, 'error');
  }
});

// Toggle buttons
document.getElementById('toggle-all').addEventListener('click', () => {
  const allEls = messagesContainer.querySelectorAll('.message, .tool-use, .thinking-block');
  const allSelected = Array.from(allEls).every(el => el.classList.contains('selected'));
  allEls.forEach(el => el.classList.toggle('selected', !allSelected));
  updateStats();
});

document.getElementById('toggle-human').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.message.human').forEach(el => {
    el.classList.toggle('selected');
  });
  updateStats();
});

document.getElementById('toggle-assistant').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.message.assistant').forEach(el => {
    el.classList.toggle('selected');
  });
  updateStats();
});

document.getElementById('toggle-tools').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.tool-use').forEach(el => {
    el.classList.toggle('selected');
  });
  updateStats();
});

document.getElementById('toggle-thinking').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.thinking-block').forEach(el => {
    el.classList.toggle('selected');
  });
  updateStats();
});

// Copy button
document.getElementById('copy-btn').addEventListener('click', () => {
  const text = PrunerCore.formatSelectedContent(messagesContainer);
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
});

// Render HTML button
document.getElementById('render-btn').addEventListener('click', () => {
  if (!currentConversation) return;
  
  const html = PrunerCore.renderAsHTML(currentConversation.data, messagesContainer);
  if (html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
  }
});

// Open in Claude button
document.getElementById('open-claude-btn').addEventListener('click', () => {
  if (!currentConversation) return;
  chrome.tabs.create({ url: `https://claude.ai/chat/${currentConversation.conversationId}` });
});

// Open in Tab button - opens full viewer page
document.getElementById('open-tab-btn').addEventListener('click', () => {
  if (!currentConversation) return;
  
  // Store conversation data for the viewer page to retrieve
  chrome.storage.local.set({ 
    'viewer-conversation': currentConversation 
  }, () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
  });
});

// Initialize
loadConversationList();
