/**
 * Claude Cache Viewer - Full page viewer for cached conversations
 */

let currentConversation = null;
const messagesContainer = document.getElementById('messages-container');

// Load conversation from storage
chrome.storage.local.get('viewer-conversation', (result) => {
  if (!result['viewer-conversation']) {
    messagesContainer.innerHTML = '<div class="empty-state">No conversation data found. Open a conversation from the extension popup.</div>';
    return;
  }

  currentConversation = result['viewer-conversation'];
  renderConversation(currentConversation);
  
  // Clear storage after loading
  chrome.storage.local.remove('viewer-conversation');
});

function renderConversation(conv) {
  // Update title
  const title = conv.name || 'Conversation';
  document.getElementById('conv-title').textContent = title;
  document.title = `${title} - Claude Cache`;
  document.getElementById('conv-meta').textContent = 
    `${conv.messageCount || conv.data?.chat_messages?.length || 0} messages · Cached ${new Date(conv.updatedAt).toLocaleString()}`;

  // Render messages
  messagesContainer.innerHTML = '';

  if (!conv.data?.chat_messages?.length) {
    messagesContainer.innerHTML = '<div class="empty-state">No messages in this conversation.</div>';
    return;
  }

  conv.data.chat_messages.forEach(message => {
    const processed = PrunerCore.processMessageContent(message);
    const elements = PrunerCore.renderMessage(message, processed);
    
    elements.forEach(el => {
      // Enhanced click handling
      el.addEventListener('click', (e) => {
        const mode = document.querySelector('input[name="toggle-mode"]:checked').value;
        
        if (mode === 'normal') {
          el.classList.toggle('selected');
        } else {
          const allBlocks = Array.from(messagesContainer.querySelectorAll('.message, .tool-use, .thinking-block'));
          const currentIndex = allBlocks.indexOf(el);
          
          if (mode === 'before') {
            for (let i = 0; i < currentIndex; i++) {
              allBlocks[i].classList.toggle('selected');
            }
          } else if (mode === 'after') {
            for (let i = currentIndex + 1; i < allBlocks.length; i++) {
              allBlocks[i].classList.toggle('selected');
            }
          }
        }
        
        updateStats();
        updateCollapsedState();
      });
      
      messagesContainer.appendChild(el);
    });
  });

  updateStats();
}

function updateStats() {
  const stats = PrunerCore.calculateStats(messagesContainer);
  document.getElementById('stats').textContent = 
    `${stats.messages} msgs · ${stats.tools} tools · ${stats.thinking} thinking · ~${stats.tokens} tokens`;
}

function updateCollapsedState() {
  const collapse = document.getElementById('collapse-deselected').checked;
  messagesContainer.querySelectorAll('.message, .tool-use, .thinking-block').forEach(el => {
    const content = el.querySelector('.msg-content');
    if (content) {
      if (collapse && !el.classList.contains('selected')) {
        content.style.maxHeight = '2em';
        content.style.overflow = 'hidden';
      } else {
        content.style.maxHeight = '400px';
        content.style.overflow = 'auto';
      }
    }
  });
}

// Event handlers
document.getElementById('toggle-all').addEventListener('click', () => {
  const allEls = messagesContainer.querySelectorAll('.message, .tool-use, .thinking-block');
  const allSelected = Array.from(allEls).every(el => el.classList.contains('selected'));
  allEls.forEach(el => el.classList.toggle('selected', !allSelected));
  updateStats();
  updateCollapsedState();
});

document.getElementById('toggle-human').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.message.human').forEach(el => el.classList.toggle('selected'));
  updateStats();
  updateCollapsedState();
});

document.getElementById('toggle-assistant').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.message.assistant').forEach(el => el.classList.toggle('selected'));
  updateStats();
  updateCollapsedState();
});

document.getElementById('toggle-tools').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.tool-use').forEach(el => el.classList.toggle('selected'));
  updateStats();
  updateCollapsedState();
});

document.getElementById('toggle-thinking').addEventListener('click', () => {
  messagesContainer.querySelectorAll('.thinking-block').forEach(el => el.classList.toggle('selected'));
  updateStats();
  updateCollapsedState();
});

document.getElementById('collapse-deselected').addEventListener('change', updateCollapsedState);

document.getElementById('copy-btn').addEventListener('click', () => {
  const text = PrunerCore.formatSelectedContent(messagesContainer);
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy Selected', 2000);
  });
});

document.getElementById('render-btn').addEventListener('click', () => {
  if (!currentConversation) return;
  
  const html = PrunerCore.renderAsHTML(currentConversation.data, messagesContainer);
  if (html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
});

document.getElementById('open-claude-btn').addEventListener('click', () => {
  if (!currentConversation) return;
  window.open(`https://claude.ai/chat/${currentConversation.conversationId}`, '_blank');
});
