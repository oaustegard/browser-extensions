/* Claude Token Counter — Content Script
 *
 * Injected into claude.ai pages. Detects the current conversation,
 * fetches the transcript via internal API, estimates tokens per turn,
 * models compounding multi-turn costs with cache assumptions,
 * and renders a floating badge.
 */

(function () {
  "use strict";

  const LOG_PREFIX = "[Token Counter]";
  const BADGE_ID = "claude-token-counter-badge";
  const POLL_INTERVAL_MS = 5000; /* check for new messages every 5s */
  const DEBOUNCE_MS = 1500; /* debounce after URL changes */

  let currentConversationId = null;
  let currentOrgId = null;
  let lastMessageCount = 0;
  let pollTimer = null;
  let analysisCache = null; /* cached analysis result */

  /* ── Org ID ────────────────────────────────────────────── */

  async function getOrgId() {
    if (currentOrgId) return currentOrgId;

    /* Try storage cache first */
    try {
      const cached = await chrome.storage.local.get("orgId");
      if (cached.orgId) {
        currentOrgId = cached.orgId;
        console.log(LOG_PREFIX, "Org ID from cache:", currentOrgId);
        return currentOrgId;
      }
    } catch (e) { /* storage may not be available */ }

    /* Fetch from bootstrap */
    try {
      const resp = await fetch("https://claude.ai/api/bootstrap", {
        headers: {
          "accept": "*/*",
          "content-type": "application/json",
          "anthropic-client-platform": "web_claude_ai"
        },
        credentials: "include"
      });
      if (!resp.ok) throw new Error("Bootstrap HTTP " + resp.status);
      const data = await resp.json();
      currentOrgId = data?.account?.memberships?.[0]?.organization?.uuid ?? null;
      if (currentOrgId) {
        try { await chrome.storage.local.set({ orgId: currentOrgId }); } catch (e) { /* ok */ }
        console.log(LOG_PREFIX, "Org ID from bootstrap:", currentOrgId);
      }
      return currentOrgId;
    } catch (err) {
      console.error(LOG_PREFIX, "Failed to get org ID:", err);
      return null;
    }
  }

  /* ── Conversation Detection ────────────────────────────── */

  function getConversationIdFromUrl() {
    /* Matches: /chat/{uuid}, /chat/{uuid}?..., /s/{snapshotId} */
    const chatMatch = location.pathname.match(/\/chat\/([a-f0-9-]{36})/);
    if (chatMatch) return { id: chatMatch[1], isShared: false };

    const shareMatch = location.pathname.match(/\/s\/([a-f0-9-]{36})/);
    if (shareMatch) return { id: shareMatch[1], isShared: true };

    return null;
  }

  /**
   * Detect project ID from the URL.
   * Project conversations live at: /project/{projectId}/chat/{conversationId}
   */
  function getProjectIdFromUrl() {
    const match = location.pathname.match(/\/project\/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  }

  /* ── Project Knowledge Stats ───────────────────────────── */

  let kbStatsCache = {}; /* projectId -> { knowledge_size, use_project_knowledge_search, ... } */

  /**
   * Fetch KB stats for a project.
   * Returns { knowledge_size, use_project_knowledge_search, ... } or null.
   * knowledge_size is in characters (not tokens).
   */
  async function fetchKbStats(projectId) {
    if (!projectId) return null;
    if (kbStatsCache[projectId]) return kbStatsCache[projectId];

    const orgId = await getOrgId();
    if (!orgId) return null;

    try {
      const resp = await fetch(
        `https://claude.ai/api/organizations/${orgId}/projects/${projectId}/kb/stats`,
        {
          headers: { "anthropic-client-platform": "web_claude_ai" },
          credentials: "include"
        }
      );
      if (!resp.ok) throw new Error("KB stats HTTP " + resp.status);
      const stats = await resp.json();
      kbStatsCache[projectId] = stats;
      console.log(LOG_PREFIX, "KB stats for project:", projectId, stats);
      return stats;
    } catch (err) {
      console.warn(LOG_PREFIX, "Failed to fetch KB stats:", err);
      return null;
    }
  }

  /**
   * Estimate the per-turn token overhead from project knowledge.
   *
   * If use_project_knowledge_search is false, the full knowledge_size
   * (in chars, ~chars/4 for tokens) is injected into context every turn
   * as part of the system prompt.
   *
   * If true, only RAG-retrieved chunks are injected (variable per turn,
   * estimate ~4k tokens as a rough average).
   */
  function estimateKbTokenOverhead(kbStats) {
    if (!kbStats) return 0;

    if (!kbStats.use_project_knowledge_search) {
      /* Full injection: knowledge_size is in characters, estimate tokens */
      return Math.round((kbStats.knowledge_size || 0) / 4);
    }

    /* RAG mode: estimate average retrieval chunk size per turn */
    return 4000;
  }

  /* ── Conversation API ──────────────────────────────────── */

  async function fetchConversation(conversationId, isShared) {
    const orgId = await getOrgId();
    if (!orgId && !isShared) {
      console.error(LOG_PREFIX, "No org ID available");
      return null;
    }

    const apiUrl = isShared
      ? `https://claude.ai/api/organizations/${orgId}/chat_snapshots/${conversationId}?rendering_mode=messages&render_all_tools=true`
      : `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;

    try {
      const resp = await fetch(apiUrl, { credentials: "include" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return await resp.json();
    } catch (err) {
      console.error(LOG_PREFIX, "Failed to fetch conversation:", err);
      return null;
    }
  }

  /* ── Message Extraction ────────────────────────────────── */

  /**
   * Extract ordered messages from the conversation API response.
   * The response has a `chat_messages` array with:
   *   { uuid, sender, content, index, ... }
   * where sender is "human" or "assistant"
   */
  function extractMessages(conversationData) {
    let messages = conversationData?.chat_messages;
    if (!messages) return [];

    /* Sort by index to get chronological order */
    messages = messages
      .filter(m => m.sender === "human" || m.sender === "assistant")
      .sort((a, b) => (a.index || 0) - (b.index || 0));

    return messages.map(m => ({
      role: m.sender === "human" ? "user" : "assistant",
      content: m.content || m.text || "",
      model: m.model || conversationData.model || null,
      uuid: m.uuid
    }));
  }

  /* ── Cost Calculation ──────────────────────────────────── */

  /**
   * Calculate per-turn and total cost for a conversation.
   *
   * Multi-turn cost model:
   * Each API call sends the full conversation history as input.
   * We assume claude.ai uses prompt caching, so prior turns get
   * cache-read pricing after turn 1.
   *
   * Turn 1:
   *   inputTokens = systemPrompt + kbOverhead + userMsg[0]  (full input rate)
   *   outputTokens = assistantMsg[0]                        (output rate)
   *
   * Turn N (N > 1):
   *   cachedTokens = systemPrompt + kb + all prior turns    (cache-read rate)
   *   freshInputTokens = userMsg[N]                         (full input rate)
   *   outputTokens = assistantMsg[N]                        (output rate)
   *
   * @param {Array} messages - extracted message objects
   * @param {string|null} modelOverride - model string from conversation metadata
   * @param {object|null} kbStats - project KB stats from API, or null
   */
  function analyzeConversation(messages, modelOverride, kbStats) {
    const turns = []; /* paired user/assistant turns */
    let i = 0;

    /* Pair up user/assistant messages into turns */
    while (i < messages.length) {
      const turn = { user: null, assistant: null };

      if (messages[i]?.role === "user") {
        turn.user = messages[i];
        i++;
      }
      if (i < messages.length && messages[i]?.role === "assistant") {
        turn.assistant = messages[i];
        i++;
      }

      if (turn.user || turn.assistant) {
        turns.push(turn);
      }

      /* Safety: skip unexpected sequences */
      if (!turn.user && !turn.assistant) {
        i++;
      }
    }

    if (turns.length === 0) {
      return { turns: [], totals: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalCost: 0 }, model: DEFAULT_MODEL };
    }

    /* Determine model from first assistant message or override */
    const detectedModel = modelOverride || turns[0]?.assistant?.model || DEFAULT_MODEL;
    const pricing = resolvePricing(detectedModel);

    /* Base context overhead: system prompt + project knowledge (if injected) */
    const kbTokenOverhead = estimateKbTokenOverhead(kbStats);
    const baseOverhead = DEFAULT_SYSTEM_PROMPT_TOKENS + kbTokenOverhead;

    let cumulativeTokens = baseOverhead; /* running total of all prior context */
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    const analyzedTurns = turns.map((turn, idx) => {
      const userTokens = turn.user ? TokenEstimator.estimateContent(turn.user.content) : 0;
      const assistantTokens = turn.assistant ? TokenEstimator.estimateContent(turn.assistant.content) : 0;

      let turnCost;
      let freshInput;
      let cachedInput;

      if (idx === 0) {
        /* First turn: everything is fresh input (system prompt + user message) */
        freshInput = cumulativeTokens + userTokens;
        cachedInput = 0;
        turnCost = (freshInput / 1_000_000) * pricing.input
                 + (assistantTokens / 1_000_000) * pricing.output;
      } else {
        /* Subsequent turns: prior context is cached, only new user message is fresh */
        cachedInput = cumulativeTokens;
        freshInput = userTokens;
        turnCost = (cachedInput / 1_000_000) * pricing.cacheRead
                 + (freshInput / 1_000_000) * pricing.input
                 + (assistantTokens / 1_000_000) * pricing.output;
      }

      totalCost += turnCost;
      totalInputTokens += freshInput;
      totalOutputTokens += assistantTokens;
      totalCachedTokens += cachedInput;

      /* Add this turn's tokens to cumulative for next turn's cache */
      cumulativeTokens += userTokens + assistantTokens;

      return {
        index: idx + 1,
        userTokens,
        assistantTokens,
        freshInputTokens: freshInput,
        cachedInputTokens: cachedInput,
        turnCost,
        cumulativeCost: totalCost
      };
    });

    return {
      turns: analyzedTurns,
      totals: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens,
        totalCost,
        contextWindow: cumulativeTokens /* final conversation size */
      },
      model: detectedModel,
      pricing,
      kbStats: kbStats || null,
      kbTokenOverhead,
      baseOverhead
    };
  }

  /* ── Floating Badge UI ─────────────────────────────────── */

  function createBadge() {
    let badge = document.getElementById(BADGE_ID);
    if (badge) return badge;

    badge = document.createElement("div");
    badge.id = BADGE_ID;
    badge.className = "ctc-badge";
    badge.innerHTML = `
      <div class="ctc-badge-content">
        <span class="ctc-badge-tokens" title="Estimated conversation tokens">…</span>
        <span class="ctc-badge-sep">|</span>
        <span class="ctc-badge-cost" title="Estimated API-equivalent cost">…</span>
        <span class="ctc-badge-model" title="Detected model"></span>
      </div>
      <div class="ctc-badge-detail" style="display:none;">
        <div class="ctc-detail-header">
          <span class="ctc-detail-title">Token Breakdown</span>
          <button class="ctc-detail-close" title="Close">×</button>
        </div>
        <div class="ctc-detail-body"></div>
      </div>
    `;

    document.body.appendChild(badge);

    /* Toggle detail panel on click */
    badge.querySelector(".ctc-badge-content").addEventListener("click", () => {
      const detail = badge.querySelector(".ctc-badge-detail");
      detail.style.display = detail.style.display === "none" ? "block" : "none";
    });

    badge.querySelector(".ctc-detail-close").addEventListener("click", (e) => {
      e.stopPropagation();
      badge.querySelector(".ctc-badge-detail").style.display = "none";
    });

    return badge;
  }

  function updateBadge(analysis) {
    const badge = createBadge();
    if (!analysis || analysis.turns.length === 0) {
      badge.querySelector(".ctc-badge-tokens").textContent = "0 tokens";
      badge.querySelector(".ctc-badge-cost").textContent = "$0.00";
      badge.querySelector(".ctc-badge-model").textContent = "";
      badge.querySelector(".ctc-detail-body").innerHTML = "<em>No messages yet</em>";
      return;
    }

    const { totals, turns, model, pricing } = analysis;

    /* Update summary */
    badge.querySelector(".ctc-badge-tokens").textContent =
      TokenEstimator.formatTokens(totals.contextWindow) + " ctx";
    badge.querySelector(".ctc-badge-cost").textContent =
      TokenEstimator.formatCost(totals.totalCost);

    /* Model label (short) */
    const modelShort = model.replace("claude-", "").replace(/-/g, " ");
    badge.querySelector(".ctc-badge-model").textContent = modelShort;

    /* Update detail panel */
    const detailBody = badge.querySelector(".ctc-detail-body");
    let html = `
      <table class="ctc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>User</th>
            <th>Asst</th>
            <th>Cached</th>
            <th>Cost</th>
            <th>Cum.</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const t of turns) {
      html += `
        <tr>
          <td>${t.index}</td>
          <td>${TokenEstimator.formatTokens(t.userTokens)}</td>
          <td>${TokenEstimator.formatTokens(t.assistantTokens)}</td>
          <td>${TokenEstimator.formatTokens(t.cachedInputTokens)}</td>
          <td>${TokenEstimator.formatCost(t.turnCost)}</td>
          <td>${TokenEstimator.formatCost(t.cumulativeCost)}</td>
        </tr>
      `;
    }

    html += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4"><strong>Total</strong></td>
            <td colspan="2"><strong>${TokenEstimator.formatCost(totals.totalCost)}</strong></td>
          </tr>
        </tfoot>
      </table>
      <div class="ctc-detail-meta">
        <div>Model: ${model} ($${pricing.input}/$${pricing.output}/MTok)</div>
        <div>Context window: ${TokenEstimator.formatTokens(totals.contextWindow)} tokens</div>
        <div>Fresh input: ${TokenEstimator.formatTokens(totals.inputTokens)} | Cached: ${TokenEstimator.formatTokens(totals.cachedTokens)} | Output: ${TokenEstimator.formatTokens(totals.outputTokens)}</div>
        <div>Base overhead: ~${TokenEstimator.formatTokens(analysis.baseOverhead)} tokens (system prompt${analysis.kbStats ? " + project KB" : ""})</div>
        ${analysis.kbStats ? `<div>Project KB: ${TokenEstimator.formatTokens(analysis.kbStats.knowledge_size)} chars (~${TokenEstimator.formatTokens(analysis.kbTokenOverhead)} tokens est.) — ${analysis.kbStats.use_project_knowledge_search ? "RAG search mode" : "full injection"}</div>` : ""}
        <div class="ctc-detail-note">Cache-read rate assumed for prior turns. Token counts are estimates.</div>
      </div>
    `;

    detailBody.innerHTML = html;
  }

  function hideBadge() {
    const badge = document.getElementById(BADGE_ID);
    if (badge) badge.style.display = "none";
  }

  function showBadge() {
    const badge = document.getElementById(BADGE_ID);
    if (badge) badge.style.display = "";
  }

  /* ── Main Loop ─────────────────────────────────────────── */

  async function analyze() {
    const convInfo = getConversationIdFromUrl();
    if (!convInfo) {
      hideBadge();
      return;
    }

    console.log(LOG_PREFIX, "Analyzing conversation:", convInfo.id);
    const data = await fetchConversation(convInfo.id, convInfo.isShared);
    if (!data) {
      hideBadge();
      return;
    }

    const messages = extractMessages(data);
    console.log(LOG_PREFIX, "Messages found:", messages.length);

    /* Skip re-analysis if message count hasn't changed */
    if (messages.length === lastMessageCount && analysisCache) {
      showBadge();
      return;
    }
    lastMessageCount = messages.length;

    /* Fetch project KB stats if this is a project conversation */
    const projectId = getProjectIdFromUrl() || data.project_uuid || null;
    let kbStats = null;
    if (projectId) {
      kbStats = await fetchKbStats(projectId);
    }

    /* Detect model from conversation metadata */
    const modelHint = data.model || data.current_model || null;
    const analysis = analyzeConversation(messages, modelHint, kbStats);
    analysisCache = analysis;

    console.log(LOG_PREFIX, "Analysis:", {
      turns: analysis.turns.length,
      totalCost: analysis.totals.totalCost.toFixed(4),
      contextWindow: analysis.totals.contextWindow,
      model: analysis.model
    });

    updateBadge(analysis);
    showBadge();

    /* Store analysis for popup access */
    try {
      await chrome.storage.local.set({
        lastAnalysis: analysis,
        lastConversationId: convInfo.id,
        lastAnalysisTime: Date.now()
      });
    } catch (e) {
      console.warn(LOG_PREFIX, "Could not save analysis to storage:", e);
    }
  }

  /* ── URL Change Detection ──────────────────────────────── */

  let lastUrl = location.href;
  let debounceTimer = null;

  function onUrlChange() {
    const newUrl = location.href;
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;

    console.log(LOG_PREFIX, "URL changed:", newUrl);
    currentConversationId = null;
    lastMessageCount = 0;
    analysisCache = null;

    /* Debounce to let the page settle */
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(analyze, DEBOUNCE_MS);
  }

  /* Watch for SPA navigation (claude.ai is a Next.js SPA) */
  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    onUrlChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    onUrlChange();
  };

  window.addEventListener("popstate", onUrlChange);

  /* ── Periodic Polling ──────────────────────────────────── */

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (getConversationIdFromUrl()) {
        analyze();
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /* ── MutationObserver for new messages ─────────────────── */
  /* Watch for DOM changes that suggest a new message appeared */

  let mutationDebounce = null;
  const observer = new MutationObserver(() => {
    if (!getConversationIdFromUrl()) return;
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(analyze, 2000);
  });

  /* Observe the main content area for child additions */
  function startObserving() {
    /* claude.ai renders messages in a main scrollable container */
    const target = document.querySelector("main") || document.body;
    observer.observe(target, { childList: true, subtree: true });
  }

  /* ── Init ──────────────────────────────────────────────── */

  async function init() {
    console.log(LOG_PREFIX, "Initializing on", location.href);
    createBadge();
    await analyze();
    startPolling();
    startObserving();
  }

  /* ── Message Listener ────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "refresh") {
      lastMessageCount = 0;
      analysisCache = null;
      analyze().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  /* Wait for page to be ready */
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(init, 1000);
  } else {
    window.addEventListener("DOMContentLoaded", () => setTimeout(init, 1000));
  }

})();
