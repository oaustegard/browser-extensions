// Service worker: decides what gets indexed and keeps the index in step with browser history.
//
// A page is "read" once it has been the active tab of the focused window for dwellSec seconds. Then the
// worker checks the exclusion rules, reads the page text with Readability, checks the page for sensitive
// signals, and hands the text to the offscreen document, which embeds it with SparseUp on the GPU.
//
// History deletions remove pages from the index: onVisitRemoved for deletions while Chrome runs, and a
// sweep at startup (and every 6 hours) for anything removed while the extension was not running.

import * as db from "./lib/db.js";
import { DEFAULT_EXCLUDES, pageSignals, pageVerdict, urlVerdict } from "./lib/sensitive.js";
import { getSettings, hash } from "./lib/util.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ---------- offscreen document ----------

let creating = null;
async function ensureOffscreen() {
  const has = chrome.runtime.getContexts
    ? (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0
    : await chrome.offscreen.hasDocument();
  if (has) return;
  creating ??= chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["WORKERS"],
    justification: "Runs the local search model on the GPU to index pages and answer searches.",
  }).finally(() => { creating = null; });
  await creating;
}

async function callOffscreen(type, payload = {}) {
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ target: "offscreen", type, ...payload });
  if (!r) throw new Error("offscreen document did not answer");
  if (!r.ok) throw new Error(r.error);
  return r.result;
}

// ---------- skip log (host and reason only) ----------

async function noteSkip(url, reason) {
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  const { skips = [] } = await chrome.storage.local.get("skips");
  skips.unshift({ host, reason, at: Date.now() });
  await chrome.storage.local.set({ skips: skips.slice(0, 100) });
}

// ---------- reading a page ----------

const indexing = new Set();

async function indexTab(tabId, url) {
  if (indexing.has(url)) return;
  const s = await getSettings();
  if (s.paused) return;
  const excludes = s.excludes ?? DEFAULT_EXCLUDES;
  const why = urlVerdict(url, { excludes, auto: s.autoSensitive });
  if (why) { if (why !== "not a web page") await noteSkip(url, why); return; }

  // Only pages that history has: their removal from history is what removes them here.
  const visits = await chrome.history.getVisits({ url });
  if (!visits.length) { await noteSkip(url, "not in browser history"); return; }
  const visitTime = Math.max(...visits.map((v) => v.visitTime));

  indexing.add(url);
  try {
    const [{ result: sig } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func: pageSignals });
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== url) return;
    const verdict = sig ? pageVerdict(url, tab.title, sig, { auto: s.autoSensitive }) : null;
    if (verdict) { await noteSkip(url, verdict); return; }

    await chrome.scripting.executeScript({ target: { tabId }, files: ["lib/vendor/Readability.js"] });
    const [{ result: page } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPage });
    if (!page) return;
    const h = hash(page.title + "\n" + page.text);
    const prev = await db.getPage(url);
    if (prev && prev.hash === h) { await db.addVisit(url, visitTime); return; }
    await callOffscreen("index", { page: { url, title: page.title || tab.title || url, text: page.text, lang: page.lang, visitTime, hash: h } });
  } catch (e) {
    // Pages Chrome does not let extensions script (Web Store, other extensions, PDFs) end here.
    if (!/Cannot access|cannot be scripted|No tab with id|Frame with ID/i.test(String(e?.message))) console.warn("index failed:", e?.message);
  } finally {
    indexing.delete(url);
  }
}

// Runs in the page after Readability.js. Returns title and readable text with paragraph breaks.
function extractPage() {
  const BLOCK = "p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, td, th, dt, dd, figcaption";
  const textOf = (root) => {
    const blocks = [...root.querySelectorAll(BLOCK)].filter((el) => !el.querySelector(BLOCK));
    const t = blocks.length ? blocks.map((el) => el.textContent.trim()).filter(Boolean).join("\n") : root.textContent;
    return t.replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  };
  let text = "";
  try {
    // eslint-disable-next-line no-undef
    const art = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse();
    if (art?.content) text = textOf(new DOMParser().parseFromString(art.content, "text/html").body);
  } catch (e) { /* fall through to the body text */ }
  if (text.length < 200) text = (document.body?.innerText || "").replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  const desc = document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || "";
  if (desc && !text.includes(desc.slice(0, 40))) text = desc + "\n" + text;
  return { title: document.title, text: text.slice(0, 60000), lang: document.documentElement.lang || "" };
}

// ---------- dwell tracking ----------

const timers = new Map();   // tabId -> timeout

function disarm(tabId) { clearTimeout(timers.get(tabId)); timers.delete(tabId); }

async function arm(tab) {
  if (!tab || tab.incognito || !tab.active || !/^https?:/.test(tab.url || "")) return;
  disarm(tab.id);
  const { dwellSec } = await getSettings();
  const { id, url } = tab;
  timers.set(id, setTimeout(async () => {
    timers.delete(id);
    try {
      const t = await chrome.tabs.get(id);
      const w = await chrome.windows.get(t.windowId);
      if (t.active && t.url === url && w.focused && t.status === "complete") await indexTab(id, url);
    } catch { /* tab closed */ }
  }, dwellSec * 1000));
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  for (const k of [...timers.keys()]) if (k !== tabId) disarm(k);
  arm(await chrome.tabs.get(tabId).catch(() => null));
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) disarm(tabId);
  if ((change.status === "complete" || change.url) && tab.active) arm(tab);
});
chrome.tabs.onRemoved.addListener(disarm);
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  for (const k of [...timers.keys()]) disarm(k);
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  arm(tab);
});

// ---------- history deletions ----------

async function reconcile(url) {
  const visits = await chrome.history.getVisits({ url });
  return db.reconcile(url, visits.map((v) => v.visitTime));
}

async function notifyChanged() { chrome.runtime.sendMessage({ type: "index-changed" }).catch(() => {}); }

chrome.history.onVisitRemoved.addListener(async ({ allHistory, urls }) => {
  if (allHistory) await db.clearAll();
  else for (const url of urls || []) await reconcile(url);
  notifyChanged();
});

async function sweep() {
  const pages = await db.allPages();
  let deleted = 0, trimmed = 0;
  for (const p of pages) {
    const r = await reconcile(p.url);
    if (r === "deleted") deleted++;
    if (r === "trimmed") trimmed++;
  }
  await chrome.storage.local.set({ lastSweep: { at: Date.now(), pages: pages.length, deleted, trimmed } });
  if (deleted || trimmed) notifyChanged();
}

chrome.runtime.onStartup.addListener(sweep);
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("sweep", { periodInMinutes: 360 });
  sweep();
  callOffscreen("warm").catch(() => {});   // start the one-time model download
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "sweep") sweep(); });

// ---------- messages from the side panel and the offscreen document ----------

const handlers = {
  call: (msg) => callOffscreen(msg.call, msg.payload),
  "offscreen-idle": async () => { if (chrome.offscreen) await chrome.offscreen.closeDocument().catch(() => {}); return true; },
  "clear-index": async () => { await db.clearAll(); notifyChanged(); return true; },
  "delete-page": async (msg) => { await db.deletePage(msg.url); notifyChanged(); return true; },
  sweep: async () => { await sweep(); return (await chrome.storage.local.get("lastSweep")).lastSweep; },
  "index-now": async (msg) => { await indexTab(msg.tabId, msg.url); return true; },
};

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.target !== "background") return false;
  const h = handlers[msg.type];
  if (!h) return false;
  Promise.resolve().then(() => h(msg))
    .then((result) => respond({ ok: true, result }))
    .catch((e) => respond({ ok: false, error: String(e?.message || e) }));
  return true;
});
