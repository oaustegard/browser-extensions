/**
 * Background Service Worker
 * Manages CDP sessions and coordinates between DevTools panel and pages
 */

import CDPClient from "./lib/cdp-client.js";
import Debugger from "./lib/debugger-wrapper.js";
import BDHSExecutor from "./lib/bdhs.js";
import ObjectSimilarity from "./lib/object-similarity.js";
import {
  captureSnapshot,
  parseSnapshot,
  searchObjects,
  inspectObject,
  buildReverseEdges,
  buildJsPath
} from "./lib/heap-snapshot.js";

// Active sessions per tab
const sessions = new Map();

// Get or create session for a tab
async function getSession(tabId) {
  if (sessions.has(tabId)) {
    return sessions.get(tabId);
  }
  
  const client = new CDPClient(tabId);
  await client.attach();
  
  const dbg = new Debugger(client);
  
  const session = {
    client,
    dbg,
    bdhs: null,
    lastSnapshot: null,
    lastNodes: null
  };
  
  sessions.set(tabId, session);
  return session;
}

// Clean up session
async function destroySession(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;
  
  if (session.bdhs) {
    await session.bdhs.abort();
  }
  
  try {
    await session.client.detach();
  } catch {}
  
  sessions.delete(tabId);
}

// Handle messages from DevTools panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, tabId, data } = message;
  
  // All actions are async
  handleAction(action, tabId, data)
    .then(result => sendResponse({ success: true, result }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  return true; // Keep channel open for async response
});

async function handleAction(action, tabId, data) {
  switch (action) {
    case "attach":
      await getSession(tabId);
      return { attached: true };
    
    case "detach":
      await destroySession(tabId);
      return { detached: true };
    
    case "captureSnapshot":
      return await doCaptureSnapshot(tabId);
    
    case "searchSnapshot":
      return await doSearchSnapshot(tabId, data);
    
    case "searchLiveObjects":
      return await doSearchLiveObjects(tabId, data);
    
    case "startBDHS":
      return await doStartBDHS(tabId, data);
    
    case "stopBDHS":
      return await doStopBDHS(tabId);
    
    case "exposeObject":
      return await doExposeObject(tabId, data);
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// Capture and parse heap snapshot
async function doCaptureSnapshot(tabId) {
  const session = await getSession(tabId);
  
  const snapshot = await captureSnapshot(session.client);
  const nodes = parseSnapshot(snapshot);
  
  session.lastSnapshot = snapshot;
  session.lastNodes = nodes;
  
  return {
    nodeCount: nodes.length,
    stringCount: snapshot.strings.length
  };
}

// Search previously captured snapshot
async function doSearchSnapshot(tabId, data) {
  const session = await getSession(tabId);
  
  // Capture fresh if no cached snapshot
  if (!session.lastNodes) {
    await doCaptureSnapshot(tabId);
  }
  
  const {
    propertySearch,
    valueSearch,
    classSearch,
    osEnabled,
    osObject,
    osThreshold,
    osAlpha,
    osIncludeValues,
    maxResults = 200
  } = data;
  
  const similarity = new ObjectSimilarity({ includeValues: osIncludeValues });
  
  const matches = searchObjects(session.lastNodes, {
    propertySearch,
    valueSearch,
    classSearch,
    osEnabled,
    osObject,
    osThreshold,
    osAlpha,
    similarityFn: similarity.hybridSimilarity
  }, maxResults);
  
  const reverseEdges = buildReverseEdges(session.lastNodes);
  
  const results = matches.map(m => {
    const obj = m.inspected || inspectObject(m.node, session.lastNodes);
    const path = buildJsPath(session.lastNodes, reverseEdges, m.node.idx);
    
    return {
      object: obj.object,
      meta: obj.meta,
      className: obj.className,
      path,
      similarity: m.similarity,
      nodeId: m.node.id
    };
  });
  
  return { results, totalMatches: matches.length };
}

// Search live objects via Runtime domain
async function doSearchLiveObjects(tabId, data) {
  const session = await getSession(tabId);
  const {
    propertySearch,
    valueSearch,
    classSearch,
    maxResults = 100
  } = data;
  
  // Get all objects via prototype chain query
  const { objects } = await session.client.send("Runtime.queryObjects", {
    prototypeObjectId: (await session.client.send("Runtime.evaluate", {
      expression: "Object.prototype",
      returnByValue: false
    })).result.objectId
  });
  
  // Get properties of the array-like object
  const { result: props } = await session.client.send("Runtime.getProperties", {
    objectId: objects.objectId,
    ownProperties: true
  });
  
  const results = [];
  
  for (const prop of props) {
    if (prop.name === "length" || !prop.value?.objectId) continue;
    if (results.length >= maxResults) break;
    
    try {
      // Get preview of the object
      const { result } = await session.client.send("Runtime.getProperties", {
        objectId: prop.value.objectId,
        ownProperties: true,
        generatePreview: true
      });
      
      // Build simple object representation
      const obj = {};
      let matches = false;
      
      for (const p of result) {
        if (p.name.startsWith("__") || p.name === "constructor") continue;
        
        const val = p.value?.value ?? p.value?.description ?? null;
        obj[p.name] = val;
        
        // Check property match
        if (propertySearch?.[0] && p.name.toLowerCase().includes(propertySearch[0].toLowerCase())) {
          matches = true;
        }
        
        // Check value match
        if (valueSearch?.[0] && String(val).toLowerCase().includes(valueSearch[0].toLowerCase())) {
          matches = true;
        }
      }
      
      // Check class match
      if (classSearch?.[0]) {
        const className = prop.value.className || "";
        if (className.toLowerCase().includes(classSearch[0].toLowerCase())) {
          matches = true;
        }
      }
      
      // If no search criteria, include all
      if (!propertySearch?.[0] && !valueSearch?.[0] && !classSearch?.[0]) {
        matches = true;
      }
      
      if (matches) {
        results.push({
          object: obj,
          className: prop.value.className,
          objectId: prop.value.objectId
        });
      }
    } catch {
      // Object may have been GC'd
    }
  }
  
  // Release the query result
  await session.client.send("Runtime.releaseObject", { objectId: objects.objectId });
  
  return { results };
}

// Start BDHS scan
async function doStartBDHS(tabId, data) {
  const session = await getSession(tabId);
  
  if (session.bdhs) {
    throw new Error("BDHS already running");
  }
  
  const {
    toleranceWinBefore = 6,
    toleranceWinAfter = 15,
    propertySearch,
    valueSearch,
    classSearch,
    osEnabled,
    osObject,
    osThreshold,
    osAlpha
  } = data;
  
  const similarity = new ObjectSimilarity();
  
  // Search function called at each breakpoint
  const searchFn = async () => {
    const snapshot = await captureSnapshot(session.client);
    const nodes = parseSnapshot(snapshot);
    
    return searchObjects(nodes, {
      propertySearch,
      valueSearch,
      classSearch,
      osEnabled,
      osObject,
      osThreshold,
      osAlpha,
      similarityFn: similarity.hybridSimilarity
    }, 10);
  };
  
  return new Promise((resolve, reject) => {
    session.bdhs = new BDHSExecutor(
      session.dbg,
      [toleranceWinBefore, toleranceWinAfter],
      searchFn,
      {
        armed: (d) => notifyPanel(tabId, "bdhs:armed", d),
        started: (d) => notifyPanel(tabId, "bdhs:started", d),
        progress: (d) => notifyPanel(tabId, "bdhs:progress", d),
        found: (d) => {
          notifyPanel(tabId, "bdhs:found", d);
          session.bdhs = null;
          resolve(d);
        },
        notfound: (d) => {
          notifyPanel(tabId, "bdhs:notfound", d);
          session.bdhs = null;
          resolve(d);
        },
        aborted: (d) => {
          notifyPanel(tabId, "bdhs:aborted", d);
          session.bdhs = null;
          resolve(d);
        },
        completed: (d) => notifyPanel(tabId, "bdhs:completed", d),
        maxReached: (d) => {
          notifyPanel(tabId, "bdhs:error", { reason: "Max steps reached", ...d });
          session.bdhs = null;
          reject(new Error("Max steps reached"));
        }
      }
    );
    
    session.bdhs.start();
  });
}

// Stop BDHS scan
async function doStopBDHS(tabId) {
  const session = sessions.get(tabId);
  if (!session?.bdhs) {
    throw new Error("BDHS not running");
  }
  
  await session.bdhs.abort();
  session.bdhs = null;
  return { stopped: true };
}

// Expose object to page's window
async function doExposeObject(tabId, data) {
  const session = await getSession(tabId);
  const { objectId, varName } = data;
  
  await session.client.send("Runtime.callFunctionOn", {
    objectId,
    functionDeclaration: `function() { window['${varName}'] = this; return this; }`
  });
  
  return { exposed: varName };
}

// Send notification to DevTools panel
function notifyPanel(tabId, event, data) {
  chrome.runtime.sendMessage({
    type: "bdhs-event",
    tabId,
    event,
    data
  }).catch(() => {
    // Panel may not be open
  });
}

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  destroySession(tabId);
});

// Clean up when navigating away
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    destroySession(details.tabId);
  }
});
