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
          <div><strong>Thinking</strong> <span class="toggle-collapse">▼</span></div>
          <span class="timestamp">${this.formatTimestamp(t.timestamp)}</span>
        </div>
        <div class="thinking-summary"><em>${this.escapeHtml(summary)}</em></div>
        <pre class="thinking-content"><code>${this.escapeHtml(t.content)}</code></pre>
      `;
      elements.push({ el: div, timestamp: new Date(t.timestamp).getTime() });
    });

    // Tool uses
    processed.toolUses.forEach(tool => {
      const div = document.createElement('div');
      div.className = 'tool-use selected';
      div.setAttribute('data-timestamp', tool.timestamp);

      let exportContent = `<ToolUse name="${tool.name}">${tool.input}</ToolUse>`;
      if (tool.result !== undefined) {
        exportContent += `\n<ToolResult name="${tool.name}">${tool.result}</ToolResult>`;
      }
      div.setAttribute('data-content', exportContent);

      const toolLabel = tool.isResult ? 'Tool Result' : 'Tool';
      const msgLine = tool.message && tool.message !== tool.name
        ? `<div class="tool-msg">Message: ${this.escapeHtml(tool.message)}</div>`
        : '';

      let inputSection = '';
      if (!tool.isResult && tool.input) {
        inputSection = `
          <div class="tool-section">
            <div class="tool-label">Input:</div>
            <pre class="tool-params"><code>${this.escapeHtml(tool.input)}</code></pre>
          </div>`;
      }

      let resultSection = '';
      if (tool.result !== undefined) {
        const errorClass = tool.isError ? ' tool-result-error' : '';
        resultSection = `
          <div class="tool-section">
            <div class="tool-label">Result${tool.isError ? ' (error)' : ''}:</div>
            <pre class="tool-result${errorClass}"><code>${this.escapeHtml(tool.result)}</code></pre>
          </div>`;
      }

      div.innerHTML = `
        <div class="msg-header">
          <div><strong>${toolLabel}: ${this.escapeHtml(tool.name)}</strong> <span class="toggle-collapse">▼</span></div>
          <span class="timestamp">${this.formatTimestamp(tool.timestamp)}</span>
        </div>
        ${msgLine}
        ${inputSection}
        ${resultSection}
      `;
      elements.push({ el: div, timestamp: new Date(tool.timestamp).getTime() });
    });

    // Main message text
    if (processed.text.trim()) {
      const div = document.createElement('div');
      div.className = `message ${message.sender} selected`;
      div.setAttribute('data-timestamp', timestamp);

      const renderedText = message.sender === 'assistant'
        ? this.mdToHtml(processed.text)
        : this.escapeHtml(processed.text);

      div.innerHTML = `
        <div class="msg-header">
          <strong>${message.sender}</strong>
          <span class="timestamp">${formattedTime}</span>
        </div>
        <div class="msg-content">${renderedText}</div>
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

  // Extract tool name from label like "Tool: bash_tool" or "ToolUse name="bash_tool""
  _extractToolName(content) {
    const m = content.match(/(?:Tool[^:]*:\s*|name=")(\S+?)(?:"|>|\s)/i);
    return m ? m[1] : 'unknown';
  },

  // Try to parse tool input/result from data-content attribute
  _parseToolContent(content) {
    const useMatch = content.match(/<ToolUse name="([^"]+)">([\s\S]*?)<\/ToolUse>/);
    const resultMatch = content.match(/<ToolResult name="([^"]+)">([\s\S]*?)<\/ToolResult>/);

    return {
      name: useMatch?.[1] || resultMatch?.[1] || 'unknown',
      input: useMatch?.[2] || null,
      result: resultMatch?.[2] || null,
      isError: false
    };
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
        const summaryEl = el.querySelector('.thinking-summary');
        const summary = summaryEl ? summaryEl.textContent.trim() : 'Thinking\u2026';
        parts.push({ type: 'thinking', content, summary, time });
      } else if (el.classList.contains('tool-use')) {
        const rawContent = el.getAttribute('data-content') || '';
        const parsed = this._parseToolContent(rawContent);
        const headerEl = el.querySelector('.msg-header strong');
        const label = headerEl ? headerEl.textContent.trim() : `Tool: ${parsed.name}`;
        const msgEl = el.querySelector('.tool-msg');
        const message = msgEl ? msgEl.textContent.replace(/^Message:\s*/, '').trim() : '';
        parts.push({
          type: 'tool', label, message,
          name: parsed.name, input: parsed.input, result: parsed.result,
          isError: parsed.isError, time
        });
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
            <div class="msg-body">
              <div class="msg-meta"><strong>${roleLabel}</strong> <span class="ts">${this.escapeHtml(p.time)}</span></div>
              <div class="msg-content">${rendered}</div>
            </div>
          </div>`;
      } else if (p.type === 'tool') {
        let inner = '';
        if (p.message) inner += `<div class="tool-msg">${this.escapeHtml(p.message)}</div>`;
        if (p.input) inner += `<div class="tool-section"><div class="tool-lbl">Input</div><pre><code>${this.escapeHtml(p.input)}</code></pre></div>`;
        if (p.result) {
          const errClass = p.isError ? ' tool-error' : '';
          inner += `<div class="tool-section"><div class="tool-lbl">Result${p.isError ? ' (error)' : ''}</div><pre class="${errClass}"><code>${this.escapeHtml(p.result)}</code></pre></div>`;
        }

        bodyHtml += `
          <div class="msg assistant">
            <div class="msg-body">
              <details class="tool-block">
                <summary>${this.escapeHtml(p.label)} <span class="ts">${this.escapeHtml(p.time)}</span></summary>
                ${inner}
              </details>
            </div>
          </div>`;
      } else if (p.type === 'thinking') {
        const summaryText = this.escapeHtml(p.summary);
        bodyHtml += `
          <div class="msg assistant">
            <div class="msg-body">
              <details class="thinking-block">
                <summary>${summaryText} <span class="ts">${this.escapeHtml(p.time)}</span></summary>
                <pre class="thinking-pre"><code>${this.escapeHtml(p.content)}</code></pre>
              </details>
            </div>
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
  font-family: 'Söhne', ui-sans-serif, system-ui, -apple-system, sans-serif;
  margin: 0; padding: 0;
  background: #f7f5f2;
  color: #1a1a1a;
  line-height: 1.6;
}
.header {
  position: sticky; top: 0; z-index: 10;
  background: #fff; border-bottom: 1px solid #e5e2dc;
  padding: 14px 24px;
  font-size: 15px; font-weight: 600; color: #333;
}
.header .meta {
  font-weight: 400; font-size: 13px; color: #888; margin-top: 2px;
}
.conversation {
  max-width: 820px; margin: 0 auto;
  padding: 24px 16px 80px;
}
.msg {
  display: flex; gap: 14px; padding: 20px 0;
}
.msg + .msg { border-top: 1px solid #eae7e1; }
.msg-body { flex: 1; min-width: 0; }
.msg-meta {
  display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px;
}
.msg-meta strong { font-size: 14px; }
.ts { font-size: 12px; color: #999; }
.msg-content {
  font-size: 15px; line-height: 1.65; overflow-wrap: break-word;
}
.msg.human {
  background: #faf9f7; border-radius: 12px;
  padding: 16px; margin: 8px 0;
}
.msg.human .msg-content { white-space: pre-wrap; }
.msg-content h1, .msg-content h2, .msg-content h3,
.msg-content h4, .msg-content h5, .msg-content h6 {
  margin: 1.2em 0 0.4em; line-height: 1.3;
}
.msg-content h1 { font-size: 1.4em; }
.msg-content h2 { font-size: 1.25em; }
.msg-content h3 { font-size: 1.1em; }
.msg-content p { margin: 0.6em 0; }
.msg-content ul, .msg-content ol { margin: 0.5em 0; padding-left: 1.5em; }
.msg-content li { margin: 0.25em 0; }
.msg-content a { color: #b45309; text-decoration: underline; }
.msg-content blockquote {
  border-left: 3px solid #d4a574; margin: 0.8em 0; padding: 0.4em 1em;
  color: #555; background: #faf8f5;
}
.msg-content hr { border: none; border-top: 1px solid #e5e2dc; margin: 1.5em 0; }
.msg-content strong { font-weight: 600; }
.msg-content code {
  font-family: 'Söhne Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875em; background: #f0ece6; padding: 2px 5px; border-radius: 4px;
}
.msg-content pre {
  background: #2b2b2b; color: #e6e1dc;
  padding: 16px; border-radius: 8px;
  overflow-x: auto; margin: 0.8em 0; line-height: 1.5;
}
.msg-content pre code {
  background: none; padding: 0; color: inherit; font-size: 13px; white-space: pre;
}
.tool-block, .thinking-block {
  border: 1px solid #e0ddd7; border-radius: 8px; overflow: hidden;
}
.tool-block summary, .thinking-block summary {
  padding: 10px 14px; cursor: pointer;
  font-size: 14px; font-weight: 500;
  background: #f9f7f4;
  display: flex; align-items: center; gap: 8px;
  list-style: none; user-select: none;
}
.tool-block summary::-webkit-details-marker,
.thinking-block summary::-webkit-details-marker { display: none; }
.tool-block summary::before,
.thinking-block summary::before {
  content: '▶'; font-size: 10px; color: #999; transition: transform 0.15s;
}
details[open] > summary::before { transform: rotate(90deg); }
.tool-section { padding: 8px 14px; }
.tool-section + .tool-section { border-top: 1px dashed #e0ddd7; }
.tool-lbl {
  font-size: 12px; font-weight: 600; color: #888;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
}
.tool-msg {
  padding: 8px 14px; font-size: 14px; color: #555;
  border-bottom: 1px solid #f0ece6;
}
.tool-block pre, .thinking-block pre {
  background: #2b2b2b; color: #e6e1dc;
  margin: 0; padding: 12px 14px; border-radius: 0;
  font-size: 13px; overflow-x: auto;
}
.tool-block pre code, .thinking-block pre code {
  white-space: pre-wrap; word-break: break-word;
  font-family: 'Söhne Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
.tool-error { border-left: 3px solid #dc2626; }
.thinking-pre { max-height: 400px; overflow-y: auto; }
.thinking-pre code { color: #c4b5a0; }
@media print {
  .header { position: static; }
  body { background: #fff; }
  .msg.human { background: #f9f8f6; }
  .msg-content pre, .tool-block pre, .thinking-block pre {
    background: #f4f4f4; color: #333;
  }
}
.footer {
  text-align: center; padding: 24px; font-size: 12px; color: #bbb;
}
.footer a { color: #b45309; }
</style>
</head>
<body>
<div class="header">
  ${title}
  <div class="meta">Cached by Claude Cache &middot; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
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
