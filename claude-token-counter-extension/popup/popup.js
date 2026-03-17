/* Claude Token Counter — Popup Script */

(function () {
  "use strict";

  const content = document.getElementById("content");
  const refreshBtn = document.getElementById("refreshBtn");

  function formatTokens(n) {
    if (n < 1000) return n.toString();
    if (n < 1000000) return (n / 1000).toFixed(1) + "k";
    return (n / 1000000).toFixed(2) + "M";
  }

  function formatCost(dollars) {
    if (dollars < 0.01) return "<$0.01";
    return "$" + dollars.toFixed(2);
  }

  function render(analysis) {
    if (!analysis || !analysis.turns || analysis.turns.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="big">💬</div>
          <div>Open a Claude.ai conversation to see token estimates</div>
        </div>
      `;
      return;
    }

    const { totals, turns, model, pricing } = analysis;

    let html = `
      <div class="summary">
        <div class="summary-card">
          <div class="summary-label">Est. API Cost</div>
          <div class="summary-value cost">${formatCost(totals.totalCost)}</div>
          <div class="summary-sub">${model.replace("claude-", "")}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Context Window</div>
          <div class="summary-value tokens">${formatTokens(totals.contextWindow)}</div>
          <div class="summary-sub">current size</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Turns</div>
          <div class="summary-value turns">${turns.length}</div>
          <div class="summary-sub">user/assistant pairs</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Turn</th>
            <th>User</th>
            <th>Assistant</th>
            <th>Cached In</th>
            <th>Fresh In</th>
            <th>Turn Cost</th>
            <th>Cumulative</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const t of turns) {
      html += `
        <tr>
          <td>${t.index}</td>
          <td>${formatTokens(t.userTokens)}</td>
          <td>${formatTokens(t.assistantTokens)}</td>
          <td>${formatTokens(t.cachedInputTokens)}</td>
          <td>${formatTokens(t.freshInputTokens)}</td>
          <td>${formatCost(t.turnCost)}</td>
          <td>${formatCost(t.cumulativeCost)}</td>
        </tr>
      `;
    }

    html += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">Total</td>
            <td colspan="2">${formatCost(totals.totalCost)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="meta">
        <div>Model: ${model} — Input: $${pricing.input}/MTok, Output: $${pricing.output}/MTok, Cache Read: $${pricing.cacheRead}/MTok</div>
        <div>Fresh input: ${formatTokens(totals.inputTokens)} | Cached: ${formatTokens(totals.cachedTokens)} | Output: ${formatTokens(totals.outputTokens)}</div>
        <div>Base overhead: ~${formatTokens(analysis.baseOverhead || 10000)} tokens (system prompt${analysis.kbStats ? " + project KB" : ""})</div>
        ${analysis.kbStats ? `<div>Project KB: ${formatTokens(analysis.kbStats.knowledge_size)} chars (~${formatTokens(analysis.kbTokenOverhead || 0)} tokens est.) — ${analysis.kbStats.use_project_knowledge_search ? "RAG search mode" : "full injection"}</div>` : ""}
        <div><em>Cache-read rate assumed for prior turns. Token counts are estimates.</em></div>
      </div>
    `;

    content.innerHTML = html;
  }

  function loadAnalysis() {
    chrome.runtime.sendMessage({ type: "getAnalysis" }, (data) => {
      if (chrome.runtime.lastError) {
        console.error("Popup error:", chrome.runtime.lastError);
        return;
      }
      render(data?.lastAnalysis || null);
    });
  }

  refreshBtn.addEventListener("click", () => {
    refreshBtn.textContent = "⏳ …";
    refreshBtn.disabled = true;
    chrome.runtime.sendMessage({ type: "refreshAnalysis" }, () => {
      setTimeout(() => {
        loadAnalysis();
        refreshBtn.textContent = "↻ Refresh";
        refreshBtn.disabled = false;
      }, 2000);
    });
  });

  /* Load on open */
  loadAnalysis();
})();
