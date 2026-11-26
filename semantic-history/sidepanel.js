// Side panel. Empty search box: open tabs, recently closed tabs and recently read pages, grouped by topic,
// window or recency. With a query: SparseUp search over the index, filtered by date and open tabs.

import * as db from "./lib/db.js";
import { DEFAULT_EXCLUDES, cleanPattern, matchesExclude, urlVerdict } from "./lib/sensitive.js";
import { BUILD, getSettings, hostOf, setSettings } from "./lib/util.js";

const relay = self.Relay?.start?.({ page: "semantic-history-panel", build: BUILD }) ?? null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const favicon = (url) => `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
const DAY = 864e5;

let model = { state: "idle" };
let mode = "topics";
let rows = [], sel = -1, searchSeq = 0, overviewSeq = 0;

async function bg(type, payload = {}) {
  const r = await chrome.runtime.sendMessage({ target: "background", type, ...payload });
  if (!r?.ok) throw new Error(r?.error || "no answer from the service worker");
  return r.result;
}
const offscreen = (call, payload) => bg("call", { call, payload });

function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

// ---------- status line ----------

async function renderStatus(extra = "") {
  const el = $("status");
  el.classList.toggle("err", model.state === "error");
  const { pages } = await db.counts().catch(() => ({ pages: 0 }));
  const { settings } = await chrome.storage.local.get("settings");
  const paused = settings?.paused ? " · indexing paused" : "";
  const mb = (n) => (n / 1e6).toFixed(0);
  let m = "";
  if (model.state === "downloading") m = `Downloading the search model <span class="bar"><i style="width:${model.total ? (100 * model.loaded / model.total).toFixed(1) : 0}%"></i></span>${mb(model.loaded)} / ${mb(model.total)} MB (once)`;
  else if (model.state === "loading") m = "Loading the search model…";
  else if (model.state === "building") m = "Starting the search model on the GPU…";
  else if (model.state === "error") m = `Search model unavailable: ${esc(model.message)}. Keyword search over Chrome history only.`;
  else if (model.state === "ready") m = "Model ready";
  el.innerHTML = `${pages.toLocaleString()} page${pages === 1 ? "" : "s"} indexed${paused}${m ? " · " + m : ""}${extra ? " · " + extra : ""}`;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "status" && msg.model) {
    const was = model.state;
    model = msg.model;
    renderStatus();
    if (was !== "ready" && model.state === "ready") refresh();
  }
  if (msg?.type === "index-changed") { renderStatus(); if (!$("q").value.trim()) refresh(); }
  return false;
});

// ---------- filters ----------

function dateRange() {
  const v = $("when").value;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (v === "today") return { from: start.getTime(), to: null };
  if (v === "7" || v === "30") return { from: Date.now() - +v * DAY, to: null };
  if (v === "custom") {
    const f = $("from").value ? new Date($("from").value + "T00:00").getTime() : null;
    const t = $("to").value ? new Date($("to").value + "T00:00").getTime() + DAY : null;
    return { from: f, to: t };
  }
  return { from: null, to: null };
}
const inRange = (t, { from, to }) => (from == null || t >= from) && (to == null || t < to);

// ---------- rows and keyboard ----------

function setRows(list) { rows = list; sel = -1; }
function select(i) {
  const els = [...document.querySelectorAll(".row")];
  if (!els.length) return;
  sel = Math.max(0, Math.min(els.length - 1, i));
  els.forEach((e, j) => e.classList.toggle("sel", j === sel));
  els[sel].scrollIntoView({ block: "nearest" });
}

async function activate(item) {
  if (!item) return;
  try {
    if (item.tabId != null) {
      await chrome.tabs.update(item.tabId, { active: true });
      await chrome.windows.update(item.windowId, { focused: true });
    } else if (item.sessionId) {
      await chrome.sessions.restore(item.sessionId);
    } else {
      const [open] = await chrome.tabs.query({ url: item.url.split("#")[0] }).catch(() => []);
      if (open) { await chrome.tabs.update(open.id, { active: true }); await chrome.windows.update(open.windowId, { focused: true }); }
      else await chrome.tabs.create({ url: item.url });
    }
  } catch (e) { relay?.warn("activate failed", { message: String(e?.message || e) }); }
}

function rowHtml(item, i, { snippet = "", terms = null } = {}) {
  const state = item.tabId != null ? `<span class="dot"></span>open${item.windowLabel ? " · " + esc(item.windowLabel) : ""}`
    : item.sessionId ? `closed ${ago(item.time)}` : `read ${ago(item.time)}`;
  const chips = terms ? `<div class="chips">${terms.map((t) => `<span class="chip${t.literal ? "" : " exp"}" title="${t.literal ? "in the page" : "related term the model added"}">${esc(t.term)}</span>`).join("")}</div>` : "";
  const close = item.tabId != null ? `<button class="x" data-close="${item.tabId}" title="Close tab" aria-label="Close tab">×</button>` : "<span></span>";
  return `<div class="row" data-i="${i}"><img src="${favicon(item.url)}" alt=""><div>` +
    `<div class="t">${esc(item.title || item.url)}</div><div class="m">${esc(hostOf(item.url))} · ${state}</div>` +
    (snippet ? `<div class="s">${snippet}</div>` : "") + chips + `</div>${close}</div>`;
}

$("main").addEventListener("click", async (e) => {
  const x = e.target.closest("[data-close]");
  if (x) { e.stopPropagation(); await chrome.tabs.remove(+x.dataset.close).catch(() => {}); refresh(); return; }
  const r = e.target.closest(".row");
  if (r) activate(rows[+r.dataset.i]);
});

document.addEventListener("keydown", (e) => {
  if (!$("settings").hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); select(sel + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); select(sel - 1); }
  else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); activate(rows[sel]); }
  else if (e.key === "Escape" && $("q").value) { $("q").value = ""; refresh(); }
});

// ---------- overview: open, closed, recently read ----------

async function gatherItems() {
  const range = dateRange();
  const openOnly = $("openOnly").checked;
  const ownPrefix = chrome.runtime.getURL("");
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const focused = await chrome.windows.getLastFocused().catch(() => null);
  const items = [];
  wins.forEach((w, wi) => {
    for (const t of w.tabs) {
      if (!t.url || t.url.startsWith(ownPrefix) || t.url === "about:blank" || t.url.startsWith("chrome://newtab")) continue;
      items.push({ key: `o${t.id}`, url: t.url, title: t.title, tabId: t.id, windowId: w.id, windowIndex: wi,
        windowLabel: wins.length > 1 ? (w.id === focused?.id ? "this window" : `window ${wi + 1}`) : "", time: t.lastAccessed || Date.now(), active: t.active });
    }
  });
  if (openOnly) return items;
  const openUrls = new Set(items.map((i) => i.url));
  const closed = await chrome.sessions.getRecentlyClosed({ maxResults: 25 }).catch(() => []);
  for (const s of closed) {
    const tabs = s.tab ? [s.tab] : s.window?.tabs || [];
    for (const t of tabs) {
      const time = s.lastModified * 1000;
      if (!t.url || openUrls.has(t.url) || !inRange(time, range)) continue;
      items.push({ key: `c${t.sessionId}`, url: t.url, title: t.title, sessionId: t.sessionId, time });
      openUrls.add(t.url);
    }
  }
  const pages = await db.allPages().catch(() => []);
  const since = range.from ?? Date.now() - 3 * DAY;
  const read = pages.map((p) => ({ p, t: Math.max(...p.visits) })).filter(({ p, t }) => !openUrls.has(p.url) && t >= since && inRange(t, range))
    .sort((a, b) => b.t - a.t).slice(0, 40);
  for (const { p, t } of read) items.push({ key: `r${p.url}`, url: p.url, title: p.title, time: t });
  return items;
}

function renderGroups(groups) {
  const list = [];
  let html = "";
  for (const g of groups) {
    if (!g.items.length) continue;
    html += `<div class="group"><h4><span>${esc(g.label)}</span><span>${g.items.length}</span></h4>`;
    for (const it of g.items) { html += rowHtml(it, list.length); list.push(it); }
    html += "</div>";
  }
  $("main").innerHTML = html || `<div class="empty">No tabs to show.</div>`;
  setRows(list);
}

async function overview() {
  const seq = ++overviewSeq;
  const items = await gatherItems();
  if (seq !== overviewSeq) return;
  const byRecent = (a, b) => (b.tabId != null) - (a.tabId != null) || b.time - a.time;
  const open = items.filter((i) => i.tabId != null), rest = items.filter((i) => i.tabId == null);

  if (mode === "windows") {
    const wins = new Map();
    for (const it of open) { if (!wins.has(it.windowIndex)) wins.set(it.windowIndex, []); wins.get(it.windowIndex).push(it); }
    renderGroups([...[...wins].map(([wi, its]) => ({ label: its[0].windowLabel || `Window ${wi + 1}`, items: its })),
      { label: "Recently closed", items: rest.filter((i) => i.sessionId).sort(byRecent) },
      { label: "Recently read", items: rest.filter((i) => !i.sessionId).sort(byRecent) }]);
    return;
  }
  if (mode === "recent" || model.state !== "ready") {
    renderGroups([{ label: "Open tabs", items: open.sort(byRecent) },
      { label: "Recently closed", items: rest.filter((i) => i.sessionId).sort(byRecent) },
      { label: "Recently read", items: rest.filter((i) => !i.sessionId).sort(byRecent) }]);
    if (mode === "topics") $("main").insertAdjacentHTML("afterbegin", `<div class="note">Topic groups appear once the search model is ready.</div>`);
    if (mode === "topics" && model.state !== "error") offscreen("warm").catch(() => {});
    return;
  }

  // Topics. Tabs on excluded or sensitive-looking sites are not sent to the model; they go under "Other".
  const s = await getSettings();
  const excludes = s.excludes ?? DEFAULT_EXCLUDES;
  const eligible = items.filter((i) => !urlVerdict(i.url, { excludes, auto: s.autoSensitive }));
  const ineligible = items.filter((i) => urlVerdict(i.url, { excludes, auto: s.autoSensitive }));
  renderGroups([{ label: "Grouping…", items: items.sort(byRecent) }]);
  try {
    const r = await offscreen("group", { items: eligible.map(({ key, url, title }) => ({ key, url, title })), threshold: s.groupThreshold });
    if (seq !== overviewSeq) return;
    const byKey = new Map(items.map((i) => [i.key, i]));
    const groups = r.groups.map((g) => ({ label: g.label.join(" · ") || "Related", items: g.keys.map((k) => byKey.get(k)).sort(byRecent) }));
    groups.push({ label: "Other", items: [...r.other.map((k) => byKey.get(k)), ...ineligible].sort(byRecent) });
    renderGroups(groups);
  } catch (e) {
    relay?.error("group failed", { message: String(e?.message || e) });
    renderGroups([{ label: "Open tabs", items: open.sort(byRecent) }, { label: "Closed and read", items: rest.sort(byRecent) }]);
  }
}

// ---------- search ----------

function highlight(snippet, terms) {
  let h = esc(snippet);
  const lits = terms.filter((t) => t.literal && t.term.length > 1).map((t) => t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (lits.length) h = h.replace(new RegExp(`\\b(${lits.join("|")})`, "gi"), "<mark>$1</mark>");
  return h;
}

async function runSearch(query) {
  const seq = ++searchSeq;
  const range = dateRange();
  const openOnly = $("openOnly").checked;
  const tabs = await chrome.tabs.query({});
  const tabByUrl = new Map(tabs.map((t) => [t.url, t]));
  if (model.state === "error") return keywordFallback(query, seq, range, tabByUrl);
  try {
    const r = await offscreen("search", { query, from: range.from, to: range.to, urls: openOnly ? tabs.map((t) => t.url) : null, limit: 40 });
    if (seq !== searchSeq) return;
    const list = r.results.map((x) => {
      const t = tabByUrl.get(x.url);
      return { url: x.url, title: x.title, time: Math.max(...x.visits), tabId: t?.id, windowId: t?.windowId, x };
    });
    const qt = r.queryTerms.map((t) => esc(t.term)).join(", ");
    $("main").innerHTML = `<div class="qterms">Searching for: ${qt}</div>` +
      (list.length ? list.map((it, i) => rowHtml(it, i, { snippet: highlight(it.x.snippet, it.x.terms), terms: it.x.terms })).join("")
        : `<div class="empty">No indexed page matches${openOnly || range.from || range.to ? " with these filters" : ""}.</div>`);
    setRows(list);
    renderStatus(`${r.ms} ms`);
  } catch (e) {
    relay?.error("search failed", { message: String(e?.message || e) });
    keywordFallback(query, seq, range, tabByUrl);
  }
}

// Without the model: Chrome's own history search on titles and URLs.
async function keywordFallback(query, seq, range, tabByUrl) {
  const hits = await chrome.history.search({ text: query, startTime: range.from ?? 0, endTime: range.to ?? Date.now(), maxResults: 40 });
  if (seq !== searchSeq) return;
  const openOnly = $("openOnly").checked;
  const list = hits.filter((h) => !openOnly || tabByUrl.has(h.url)).map((h) => {
    const t = tabByUrl.get(h.url);
    return { url: h.url, title: h.title, time: h.lastVisitTime, tabId: t?.id, windowId: t?.windowId };
  });
  $("main").innerHTML = `<div class="note">Keyword matches on titles and URLs from Chrome history (the search model is not ready).</div>` +
    (list.length ? list.map((it, i) => rowHtml(it, i)).join("") : `<div class="empty">No matches.</div>`);
  setRows(list);
}

// ---------- wiring ----------

let timer = 0;
function refresh() {
  const q = $("q").value.trim();
  $("modes").hidden = !!q;
  if (q) runSearch(q); else overview();
}
$("q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(refresh, 250); });
$("when").addEventListener("change", () => { $("custom").hidden = $("when").value !== "custom"; refresh(); });
$("from").addEventListener("change", refresh);
$("to").addEventListener("change", refresh);
$("openOnly").addEventListener("change", refresh);
for (const b of document.querySelectorAll("#modes button")) {
  b.addEventListener("click", () => {
    mode = b.dataset.mode;
    chrome.storage.local.set({ mode });
    for (const x of document.querySelectorAll("#modes button")) x.setAttribute("aria-selected", String(x === b));
    refresh();
  });
}
for (const ev of ["onCreated", "onRemoved", "onUpdated"]) {
  let t = 0;
  chrome.tabs[ev].addListener((_id, change) => {
    if (ev === "onUpdated" && !(change?.title || change?.url)) return;
    clearTimeout(t); t = setTimeout(() => { if (!$("q").value.trim()) overview(); }, 400);
  });
}

// ---------- settings ----------

async function showSettings() {
  const s = await getSettings();
  $("paused").checked = s.paused;
  $("autoSensitive").checked = s.autoSensitive;
  $("dwellSec").value = s.dwellSec;
  $("groupThreshold").value = s.groupThreshold;
  $("excludes").value = (s.excludes ?? DEFAULT_EXCLUDES).join("\n");
  const { skips = [] } = await chrome.storage.local.get("skips");
  $("skips").innerHTML = skips.slice(0, 40).map((k) => `<li><b>${esc(k.host)}</b> · ${esc(k.reason)} · ${ago(k.at)}</li>`).join("") || "<li>Nothing skipped yet.</li>";
  const c = await db.counts();
  const { lastSweep } = await chrome.storage.local.get("lastSweep");
  $("counts").textContent = `${c.pages.toLocaleString()} pages, ${c.chunks.toLocaleString()} passages.` +
    (lastSweep ? ` Last checked against history ${ago(lastSweep.at)} (${lastSweep.deleted} removed).` : "");
  const est = await navigator.storage.estimate().catch(() => null);
  $("modelInfo").textContent = `SparseUp v2 (linkup-sparseup-embed-v2), int8 WebGPU pack, about 151 MB, kept in this browser's cache. State: ${model.state}.` +
    (est ? ` Extension storage in use: ${(est.usage / 1e6).toFixed(0)} MB.` : "");
  $("bridgeToken").value = localStorage.getItem("gpubridge:token") || "";
  $("relayOn").checked = localStorage.getItem("relay:on:/sidepanel.html") === "1";
  $("settings").hidden = false;
  $("main").hidden = true;
  document.querySelector("header").hidden = true;
}
function hideSettings() {
  $("settings").hidden = true;
  $("main").hidden = false;
  document.querySelector("header").hidden = false;
  renderStatus();
  refresh();
}
$("gear").addEventListener("click", showSettings);
$("closeSettings").addEventListener("click", hideSettings);
$("paused").addEventListener("change", (e) => setSettings({ paused: e.target.checked }));
$("autoSensitive").addEventListener("change", (e) => setSettings({ autoSensitive: e.target.checked }));
$("dwellSec").addEventListener("change", (e) => setSettings({ dwellSec: Math.max(2, Math.min(300, +e.target.value || 10)) }));
$("groupThreshold").addEventListener("change", (e) => setSettings({ groupThreshold: +e.target.value }));
const parseExcludes = () => [...new Set($("excludes").value.split("\n").map(cleanPattern).filter(Boolean))];
// Saving the list also drops indexed pages from the listed sites.
async function purgeExcluded(list) {
  for (const p of await db.allPages()) if (matchesExclude(p.url, list)) await bg("delete-page", { url: p.url });
}
$("saveExcludes").addEventListener("click", async () => { const list = parseExcludes(); await setSettings({ excludes: list }); await purgeExcluded(list); showSettings(); });
$("resetExcludes").addEventListener("click", async () => { await setSettings({ excludes: null }); showSettings(); });
$("excludeCurrent").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const host = hostOf(tab?.url || "");
  if (!host) return;
  const list = parseExcludes();
  if (!list.includes(host)) list.push(host);
  await setSettings({ excludes: list });
  await purgeExcluded(list);
  showSettings();
});
$("indexCurrent").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await bg("index-now", { tabId: tab.id, url: tab.url }).catch((e) => alert(e.message));
  showSettings();
});
$("sweepNow").addEventListener("click", async () => { await bg("sweep"); showSettings(); });
$("clearIndex").addEventListener("click", async () => {
  if (confirm("Delete every indexed page? Browser history is not touched.")) { await bg("clear-index"); showSettings(); }
});
$("removeModel").addEventListener("click", async () => {
  if (!confirm("Remove the downloaded model (about 151 MB)? It downloads again the next time it is needed.")) return;
  await caches.delete("semantic-history-sparseup-int8-v1");
  showSettings();
});
$("saveDiag").addEventListener("click", () => {
  const tok = $("bridgeToken").value.trim();
  if (tok) localStorage.setItem("gpubridge:token", tok); else localStorage.removeItem("gpubridge:token");
  for (const p of ["/sidepanel.html", "/offscreen.html"]) {
    if ($("relayOn").checked) localStorage.setItem("relay:on:" + p, "1"); else localStorage.removeItem("relay:on:" + p);
  }
});

// ---------- start ----------

(async () => {
  const { mode: m } = await chrome.storage.local.get("mode");
  if (m) mode = m;
  for (const x of document.querySelectorAll("#modes button")) x.setAttribute("aria-selected", String(x.dataset.mode === mode));
  try { model = (await offscreen("status")).model; } catch (e) { relay?.warn("status failed", { message: String(e?.message || e) }); }
  renderStatus();
  refresh();
  if (model.state === "idle") offscreen("warm").catch(() => {});
  $("q").focus();
})();
