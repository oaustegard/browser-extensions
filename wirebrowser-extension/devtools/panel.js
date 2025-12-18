/**
 * DevTools Panel Controller
 * Handles UI interactions and communicates with background service worker
 */

const tabId = chrome.devtools.inspectedWindow.tabId;
let isAttached = false;
let isBDHSRunning = false;

// DOM Elements
const elements = {
  // Tabs
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  
  // Snapshot
  btnCapture: document.getElementById("btn-capture"),
  btnSearchSnap: document.getElementById("btn-search-snap"),
  snapProp: document.getElementById("snap-prop"),
  snapValue: document.getElementById("snap-value"),
  snapClass: document.getElementById("snap-class"),
  snapSimilarity: document.getElementById("snap-similarity"),
  snapThreshold: document.getElementById("snap-threshold"),
  snapResults: document.getElementById("snap-results"),
  
  // Live
  btnSearchLive: document.getElementById("btn-search-live"),
  liveProp: document.getElementById("live-prop"),
  liveValue: document.getElementById("live-value"),
  liveClass: document.getElementById("live-class"),
  liveResults: document.getElementById("live-results"),
  
  // BDHS
  btnBDHSStart: document.getElementById("btn-bdhs-start"),
  btnBDHSStop: document.getElementById("btn-bdhs-stop"),
  bdhsProp: document.getElementById("bdhs-prop"),
  bdhsValue: document.getElementById("bdhs-value"),
  bdhsClass: document.getElementById("bdhs-class"),
  bdhsBefore: document.getElementById("bdhs-before"),
  bdhsAfter: document.getElementById("bdhs-after"),
  bdhsStatus: document.getElementById("bdhs-status"),
  bdhsResults: document.getElementById("bdhs-results"),
  
  // Status
  statusIndicator: document.getElementById("status-indicator"),
  statusText: document.getElementById("status-text"),
  statusInfo: document.getElementById("status-info")
};

// Tab switching
elements.tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const panelId = tab.dataset.panel;
    
    elements.tabs.forEach(t => t.classList.remove("active"));
    elements.panels.forEach(p => p.classList.remove("active"));
    
    tab.classList.add("active");
    document.getElementById(`panel-${panelId}`).classList.add("active");
  });
});

// Send message to background
async function sendMessage(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, tabId, data }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response.success) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.result);
    });
  });
}

// Update status bar
function setStatus(text, state = "disconnected") {
  elements.statusText.textContent = text;
  elements.statusIndicator.className = "status-indicator";
  if (state === "connected") elements.statusIndicator.classList.add("connected");
  if (state === "running") elements.statusIndicator.classList.add("running");
}

// Render results
function renderResults(container, results, options = {}) {
  if (!results || results.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <div>No results found</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = results.map((r, i) => {
    const preview = JSON.stringify(r.object, null, 2).slice(0, 200);
    const similarityBadge = r.similarity != null 
      ? `<span class="result-similarity">${(r.similarity * 100).toFixed(0)}%</span>` 
      : "";
    
    return `
      <div class="result-item" data-index="${i}" data-object-id="${r.objectId || ""}">
        <div class="result-path">${r.path || ""}${similarityBadge}</div>
        ${r.className ? `<div class="result-class">${r.className}</div>` : ""}
        <div class="result-preview">${escapeHtml(preview)}${preview.length >= 200 ? "..." : ""}</div>
      </div>
    `;
  }).join("");
  
  // Click to expose
  container.querySelectorAll(".result-item").forEach(item => {
    item.addEventListener("click", async () => {
      const objectId = item.dataset.objectId;
      if (!objectId) {
        console.log("Full object:", results[parseInt(item.dataset.index)].object);
        return;
      }
      
      const varName = prompt("Expose as window variable:", `_obj${item.dataset.index}`);
      if (!varName) return;
      
      try {
        await sendMessage("exposeObject", { objectId, varName });
        setStatus(`Exposed as window.${varName}`, "connected");
      } catch (e) {
        setStatus(`Error: ${e.message}`, "disconnected");
      }
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Attach on panel open
async function attach() {
  try {
    await sendMessage("attach");
    isAttached = true;
    setStatus("Attached", "connected");
  } catch (e) {
    setStatus(`Failed to attach: ${e.message}`, "disconnected");
  }
}

// Capture snapshot
elements.btnCapture.addEventListener("click", async () => {
  if (!isAttached) await attach();
  
  elements.btnCapture.disabled = true;
  elements.btnCapture.textContent = "Capturing...";
  setStatus("Capturing heap snapshot...", "running");
  
  try {
    const result = await sendMessage("captureSnapshot");
    setStatus(`Captured ${result.nodeCount.toLocaleString()} nodes`, "connected");
    elements.statusInfo.textContent = `${result.stringCount.toLocaleString()} strings`;
  } catch (e) {
    setStatus(`Error: ${e.message}`, "disconnected");
  } finally {
    elements.btnCapture.disabled = false;
    elements.btnCapture.textContent = "Capture Snapshot";
  }
});

// Search snapshot
elements.btnSearchSnap.addEventListener("click", async () => {
  if (!isAttached) await attach();
  
  elements.btnSearchSnap.disabled = true;
  setStatus("Searching snapshot...", "running");
  
  try {
    const result = await sendMessage("searchSnapshot", {
      propertySearch: elements.snapProp.value ? [elements.snapProp.value] : null,
      valueSearch: elements.snapValue.value ? [elements.snapValue.value] : null,
      classSearch: elements.snapClass.value ? [elements.snapClass.value] : null,
      osEnabled: elements.snapSimilarity.checked,
      osThreshold: parseFloat(elements.snapThreshold.value),
      osAlpha: 0.5,
      osIncludeValues: false
    });
    
    renderResults(elements.snapResults, result.results);
    setStatus(`Found ${result.totalMatches} matches`, "connected");
  } catch (e) {
    setStatus(`Error: ${e.message}`, "disconnected");
  } finally {
    elements.btnSearchSnap.disabled = false;
  }
});

// Search live objects
elements.btnSearchLive.addEventListener("click", async () => {
  if (!isAttached) await attach();
  
  elements.btnSearchLive.disabled = true;
  setStatus("Searching live objects...", "running");
  
  try {
    const result = await sendMessage("searchLiveObjects", {
      propertySearch: elements.liveProp.value ? [elements.liveProp.value] : null,
      valueSearch: elements.liveValue.value ? [elements.liveValue.value] : null,
      classSearch: elements.liveClass.value ? [elements.liveClass.value] : null
    });
    
    renderResults(elements.liveResults, result.results);
    setStatus(`Found ${result.results.length} live objects`, "connected");
  } catch (e) {
    setStatus(`Error: ${e.message}`, "disconnected");
  } finally {
    elements.btnSearchLive.disabled = false;
  }
});

// Start BDHS
elements.btnBDHSStart.addEventListener("click", async () => {
  if (!isAttached) await attach();
  
  if (!elements.bdhsProp.value && !elements.bdhsValue.value && !elements.bdhsClass.value) {
    alert("Please specify at least one search criterion");
    return;
  }
  
  elements.btnBDHSStart.disabled = true;
  elements.btnBDHSStop.disabled = false;
  isBDHSRunning = true;
  
  elements.bdhsStatus.innerHTML = `
    <h3>⏳ BDHS Armed</h3>
    <p class="bdhs-instruction">Click an element on the page to begin tracing...</p>
  `;
  
  setStatus("BDHS armed - click element to trace", "running");
  
  try {
    const result = await sendMessage("startBDHS", {
      propertySearch: elements.bdhsProp.value ? [elements.bdhsProp.value] : null,
      valueSearch: elements.bdhsValue.value ? [elements.bdhsValue.value] : null,
      classSearch: elements.bdhsClass.value ? [elements.bdhsClass.value] : null,
      toleranceWinBefore: parseInt(elements.bdhsBefore.value),
      toleranceWinAfter: parseInt(elements.bdhsAfter.value)
    });
    
    // Result received
    if (result.results && result.results.length > 0) {
      elements.bdhsStatus.innerHTML = `
        <h3>✅ Origin Found</h3>
        <p>Value first appeared at the function below</p>
      `;
      
      renderBDHSResults(result.results);
      setStatus("BDHS complete - origin found", "connected");
    } else {
      elements.bdhsStatus.innerHTML = `
        <h3>❌ Not Found</h3>
        <p>Value was not detected during the trace</p>
      `;
      setStatus("BDHS complete - value not found", "connected");
    }
  } catch (e) {
    elements.bdhsStatus.innerHTML = `
      <h3>⚠️ Error</h3>
      <p>${e.message}</p>
    `;
    setStatus(`BDHS error: ${e.message}`, "disconnected");
  } finally {
    elements.btnBDHSStart.disabled = false;
    elements.btnBDHSStop.disabled = true;
    isBDHSRunning = false;
  }
});

// Stop BDHS
elements.btnBDHSStop.addEventListener("click", async () => {
  try {
    await sendMessage("stopBDHS");
    elements.bdhsStatus.innerHTML = `
      <h3>🛑 Stopped</h3>
      <p>BDHS scan was aborted</p>
    `;
    setStatus("BDHS stopped", "connected");
  } catch (e) {
    setStatus(`Error: ${e.message}`, "disconnected");
  }
  
  elements.btnBDHSStart.disabled = false;
  elements.btnBDHSStop.disabled = true;
  isBDHSRunning = false;
});

// Render BDHS results
function renderBDHSResults(results) {
  elements.bdhsResults.innerHTML = results.map((r, i) => {
    const isFirst = r.isFirstMatch;
    const highlight = isFirst ? 'style="background: rgba(78, 201, 176, 0.1); border-left: 3px solid var(--success);"' : "";
    
    return `
      <div class="result-item" ${highlight}>
        <div class="result-path">
          ${isFirst ? "🎯 " : ""}${r.functionName || "(anonymous)"} 
          <span style="color: var(--text-muted)">at ${r.file || "unknown"}:${r.lineNumber}:${r.columnNumber}</span>
        </div>
        ${r.heapSnapshot?.length ? `<div class="result-class">Found ${r.heapSnapshot.length} matching object(s)</div>` : ""}
      </div>
    `;
  }).join("");
}

// Listen for BDHS events from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "bdhs-event" || message.tabId !== tabId) return;
  
  const { event, data } = message;
  
  switch (event) {
    case "bdhs:progress":
      const status = data.matchFound ? "Match found, finalising..." : 
                     data.finalising ? "Finalising results..." : 
                     `Step ${data.currentStep}...`;
      elements.bdhsStatus.innerHTML = `
        <h3>🔍 Tracing</h3>
        <p>${status}</p>
      `;
      break;
  }
});

// Initial attach
attach();
