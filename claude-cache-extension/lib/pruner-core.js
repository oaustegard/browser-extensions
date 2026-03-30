/**
 * Pruner Core - Conversation rendering and export logic
 * Extracted from claude-pruner.html
 */

const PrunerCore = {
  
  // Format timestamp to readable string
  formatTimestamp(isoString) {
    try {
      return new Date(isoString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (err) {
      return 'Unknown';
    }
  },

  // Estimate token count from text
  estimateTokens(text) {
    const words = text.trim().split(/\s+/).length;
    return Math.round(words * 1.35);
  },

  // Process message content into structured parts
  processMessageContent(message) {
    if (!message.content) {
      return { 
        text: message.text || '', 
        toolUses: [], 
        thinking: [] 
      };
    }

    const textParts = [];
    const toolUses = [];
    const thinking = [];
    const toolUseIdMap = {};

    message.content.forEach(part => {
      if (part.type === 'text' && part.text?.trim()) {
        textParts.push(part.text.trim());
      }

      if (part.type === 'tool_use') {
        const toolElement = {
          id: part.id,
          name: part.name,
          message: part.message || part.name,
          input: JSON.stringify(part.input, null, 2),
          timestamp: part.start_timestamp || message.created_at
        };
        toolUseIdMap[part.id] = toolUses.length;
        toolUses.push(toolElement);
      }

      if (part.type === 'tool_result') {
        let resultContent = '';
        if (Array.isArray(part.content)) {
          part.content.forEach(rp => {
            if (rp.type === 'text') resultContent += rp.text;
          });
        } else if (typeof part.content === 'string') {
          resultContent = part.content;
        } else if (part.output) {
          resultContent = part.output;
        }

        const matchIdx = toolUseIdMap[part.tool_use_id];
        if (matchIdx !== undefined) {
          toolUses[matchIdx].result = resultContent;
          toolUses[matchIdx].isError = part.is_error || false;
        } else {
          toolUses.push({
            name: part.name,
            result: resultContent,
            timestamp: part.start_timestamp || message.created_at,
            isResult: true,
            isError: part.is_error || false
          });
        }
      }

      if (part.type === 'thinking') {
        thinking.push({
          content: part.thinking,
          summaries: part.summaries || [],
          timestamp: part.start_timestamp || message.created_at
        });
      }
    });

    return { 
      text: textParts.join('\n\n'), 
      toolUses, 
      thinking 
    };
  },

  // Render a single message element
  renderMessage(message, processed) {
    const elements = [];
    const timestamp = message.created_at;
    const formattedTime = this.formatTimestamp(timestamp);

    // Thinking blocks
    processed.thinking.forEach(t => {
      const div = document.createElement('div');
      div.className = 'thinking-block selected';
      div.setAttribute('data-content', t.content);
      div.setAttribute('data-timestamp', t.timestamp);
      
      const summary = t.summaries?.[0]?.summary || 'Thinking...';
      div.innerHTML = `
        <div class="msg-header">
          <strong>Thinking</strong>
          <span class="timestamp">${this.formatTimestamp(t.timestamp)}</span>
        </div>
        <div class="msg-content collapsed">
          <em>${this.escapeHtml(summary.substring(0, 100))}...</em>
        </div>
      `;
      elements.push({ el: div, timestamp: new Date(t.timestamp).getTime() });
    });

    // Tool uses
    processed.toolUses.forEach(tool => {
      const div = document.createElement('div');
      div.className = 'tool-use selected';
      div.setAttribute('data-timestamp', tool.timestamp);
      
      let content = `<ToolUse name="${tool.name}">${tool.input}</ToolUse>`;
      if (tool.result !== undefined) {
        content += `\n<ToolResult name="${tool.name}">${tool.result}</ToolResult>`;
      }
      div.setAttribute('data-content', content);
      
      const resultPreview = tool.result 
        ? `<div class="msg-content collapsed"><code>${this.escapeHtml(tool.result.substring(0, 80))}...</code></div>`
        : '';
      
      div.innerHTML = `
        <div class="msg-header">
          <strong>Tool: ${this.escapeHtml(tool.name)}</strong>
          <span class="timestamp">${this.formatTimestamp(tool.timestamp)}</span>
        </div>
        ${resultPreview}
      `;
      elements.push({ el: div, timestamp: new Date(tool.timestamp).getTime() });
    });

    // Main message text
    if (processed.text.trim()) {
      const div = document.createElement('div');
      div.className = `message ${message.sender} selected`;
      div.setAttribute('data-timestamp', timestamp);
      
      div.innerHTML = `
        <div class="msg-header">
          <strong>${message.sender}</strong>
          <span class="timestamp">${formattedTime}</span>
        </div>
        <div class="msg-content">${this.escapeHtml(processed.text)}</div>
      `;
      elements.push({ el: div, timestamp: new Date(timestamp).getTime() });
    }

    // Sort by timestamp
    elements.sort((a, b) => a.timestamp - b.timestamp);
    return elements.map(e => e.el);
  },

  // Escape HTML entities
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // Format selected content for export
  formatSelectedContent(container) {
    const selectedContent = [];

    container.querySelectorAll('.thinking-block.selected').forEach(el => {
      selectedContent.push({
        timestamp: new Date(el.getAttribute('data-timestamp')).getTime(),
        content: `<Thinking>${el.getAttribute('data-content')}</Thinking>`,
        type: 'thinking'
      });
    });

    container.querySelectorAll('.message.selected').forEach(el => {
      const role = el.classList.contains('human') ? 'Human' : 'Assistant';
      const text = el.querySelector('.msg-content')?.textContent?.trim();
      if (text) {
        selectedContent.push({
          timestamp: new Date(el.getAttribute('data-timestamp')).getTime(),
          content: `<${role}>${text}</${role}>`,
          type: 'message'
        });
      }
    });

    container.querySelectorAll('.tool-use.selected').forEach(el => {
      selectedContent.push({
        timestamp: new Date(el.getAttribute('data-timestamp')).getTime(),
        content: el.getAttribute('data-content'),
        type: 'tool'
      });
    });

    selectedContent.sort((a, b) => a.timestamp - b.timestamp);
    return selectedContent.map(item => item.content).join('\n\n');
  },

  // Calculate stats for selected content
  calculateStats(container) {
    const selectedMessages = container.querySelectorAll('.message.selected').length;
    const totalMessages = container.querySelectorAll('.message').length;
    const selectedTools = container.querySelectorAll('.tool-use.selected').length;
    const totalTools = container.querySelectorAll('.tool-use').length;
    const selectedThinking = container.querySelectorAll('.thinking-block.selected').length;
    const totalThinking = container.querySelectorAll('.thinking-block').length;

    const selectedText = Array.from(container.querySelectorAll('.selected .msg-content'))
      .map(el => el.textContent)
      .join(' ');
    
    const words = selectedText.trim().split(/\s+/).filter(w => w).length;
    const tokens = this.estimateTokens(selectedText);

    return {
      messages: `${selectedMessages}/${totalMessages}`,
      tools: `${selectedTools}/${totalTools}`,
      thinking: `${selectedThinking}/${totalThinking}`,
      words,
      tokens
    };
  },

  // Minimal markdown to HTML converter
  mdToHtml(text) {
    if (!text) return '';
    let html = this.escapeHtml(text);

    // Fenced code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${code.trimEnd()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_, h, c) => 
      `<h${h.length}>${c}</h${h.length}>`
    );

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, 
      '<a href="$2" target="_blank">$1</a>'
    );

    // Paragraphs (simple)
    html = html.split(/\n{2,}/).map(chunk => {
      chunk = chunk.trim();
      if (!chunk) return '';
      if (/^<(pre|h[1-6]|ul|ol|table)/.test(chunk)) return chunk;
      return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  },

  // Render conversation as standalone HTML page
  renderAsHTML(conversationData, container) {
    const allBlocks = Array.from(container.querySelectorAll('.message, .tool-use, .thinking-block'));
    const selectedBlocks = allBlocks.filter(el => el.classList.contains('selected'));

    if (selectedBlocks.length === 0) {
      alert('No content selected to render.');
      return null;
    }

    const title = conversationData?.name || conversationData?.title || 'Claude Conversation';
    const parts = [];

    selectedBlocks.forEach(el => {
      const timestamp = el.getAttribute('data-timestamp');
      const time = this.formatTimestamp(timestamp);

      if (el.classList.contains('thinking-block')) {
        const content = el.getAttribute('data-content') || '';
        parts.push({ type: 'thinking', content, time });
      } else if (el.classList.contains('tool-use')) {
        const content = el.getAttribute('data-content') || '';
        parts.push({ type: 'tool', content, time });
      } else if (el.classList.contains('message')) {
        const role = el.classList.contains('human') ? 'human' : 'assistant';
        const content = el.querySelector('.msg-content')?.textContent || '';
        parts.push({ type: 'message', role, content, time });
      }
    });

    // Build HTML
    let bodyHtml = '';
    
    parts.forEach(p => {
      if (p.type === 'message') {
        const rendered = p.role === 'human' 
          ? this.escapeHtml(p.content) 
          : this.mdToHtml(p.content);
        const roleLabel = p.role === 'human' ? 'You' : 'Claude';
        
        bodyHtml += `
          <div class="msg ${p.role}">
            <div class="msg-meta"><strong>${roleLabel}</strong> <span class="ts">${this.escapeHtml(p.time)}</span></div>
            <div class="msg-content">${rendered}</div>
          </div>`;
      } else if (p.type === 'tool') {
        bodyHtml += `
          <div class="msg assistant">
            <details class="tool-block">
              <summary>Tool <span class="ts">${this.escapeHtml(p.time)}</span></summary>
              <pre><code>${this.escapeHtml(p.content)}</code></pre>
            </details>
          </div>`;
      } else if (p.type === 'thinking') {
        bodyHtml += `
          <div class="msg assistant">
            <details class="thinking-block">
              <summary>Thinking <span class="ts">${this.escapeHtml(p.time)}</span></summary>
              <pre><code>${this.escapeHtml(p.content)}</code></pre>
            </details>
          </div>`;
      }
    });

    return this.renderPageTemplate(this.escapeHtml(title), bodyHtml);
  },

  // HTML page template
  renderPageTemplate(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0; padding: 0;
  background: #f7f5f2;
  color: #1a1a1a;
  line-height: 1.6;
}
.header {
  position: sticky; top: 0; z-index: 10;
  background: #fff; border-bottom: 1px solid #e5e2dc;
  padding: 14px 24px;
  font-size: 15px; font-weight: 600;
}
.header .meta {
  font-weight: 400; font-size: 13px; color: #888; margin-top: 2px;
}
.conversation {
  max-width: 800px; margin: 0 auto;
  padding: 24px 16px 80px;
}
.msg {
  padding: 16px 0;
  border-bottom: 1px solid #eae7e1;
}
.msg-meta {
  margin-bottom: 8px;
  font-size: 13px;
}
.msg-meta strong { font-weight: 600; }
.ts { color: #999; margin-left: 8px; }
.msg-content {
  font-size: 15px;
  line-height: 1.65;
}
.msg.human {
  background: #faf9f7;
  padding: 16px;
  border-radius: 8px;
  margin: 8px 0;
  border-bottom: none;
}
.msg.human .msg-content { white-space: pre-wrap; }
.msg-content p { margin: 0.5em 0; }
.msg-content pre {
  background: #2b2b2b; color: #e6e1dc;
  padding: 12px; border-radius: 6px;
  overflow-x: auto; font-size: 13px;
}
.msg-content code {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
  background: #f0ece6;
  padding: 2px 4px;
  border-radius: 3px;
}
.msg-content pre code {
  background: none;
  padding: 0;
}
.tool-block, .thinking-block {
  border: 1px solid #e0ddd7;
  border-radius: 6px;
  margin: 8px 0;
}
.tool-block summary, .thinking-block summary {
  padding: 8px 12px;
  cursor: pointer;
  background: #f9f7f4;
  font-size: 13px;
}
.tool-block pre, .thinking-block pre {
  margin: 0;
  border-radius: 0 0 6px 6px;
  max-height: 300px;
  overflow-y: auto;
}
.footer {
  text-align: center;
  padding: 24px;
  font-size: 12px;
  color: #999;
}
</style>
</head>
<body>
<div class="header">
  ${title}
  <div class="meta">Cached by Claude Cache · ${new Date().toLocaleDateString()}</div>
</div>
<div class="conversation">
${bodyHtml}
</div>
<div class="footer">
  Rendered by Claude Conversation Cache
</div>
</body>
</html>`;
  }
};

// Export for use in popup
if (typeof module !== 'undefined') {
  module.exports = PrunerCore;
}
