// Offscreen document: owns the SparseUp WebGPU engine. Indexes pages the service worker hands it, answers
// searches from the side panel, and groups open / closed tabs by topic. It never sends page content or URLs
// anywhere; the only network traffic is the one-time model download.

import * as db from "./lib/db.js";
import { loadModel, modelCached } from "./lib/model.js";
import { BUILD, hostOf } from "./lib/util.js";

const relay = self.Relay?.start?.({ page: "semantic-history-offscreen", build: BUILD }) ?? null;
const log = (msg, attrs) => { relay?.log(msg, attrs); };

const CHUNK_TOKENS = 380;     // per chunk, before prefix and special tokens (the model reads 512)
const MAX_CHUNKS = 12;        // per page: about 3,500 words
const DOC_TERMS = 128;        // terms kept per chunk (top-128: same retrieval quality as all terms)
const IDLE_MS = 5 * 60 * 1000;

let model = null, modelP = null, modelState = { state: "idle" };
let lastUse = Date.now(), busy = 0;

function broadcast(msg) { chrome.runtime.sendMessage(msg).catch(() => {}); }
function setModelState(s) { modelState = s; broadcast({ type: "status", model: s }); }

// One GPU job at a time: the engine's buffers are shared.
let chain = Promise.resolve();
function withGPU(fn) { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }

async function getModel() {
  if (model) return model;
  modelP ??= (async () => {
    const t0 = performance.now();
    const cached = await modelCached().catch(() => false);
    setModelState({ state: cached ? "loading" : "downloading", loaded: 0, total: 0 });
    let lastSent = 0;
    try {
      model = await loadModel((p) => {
        const now = performance.now();
        if (p.phase === "build" || now - lastSent > 250) {
          lastSent = now;
          setModelState({ state: p.phase === "build" ? "building" : cached ? "loading" : "downloading", loaded: p.loaded, total: p.total });
        }
      });
      model.device.lost.then((info) => { log("device lost", { reason: info.reason }); model = null; modelP = null; setModelState({ state: "idle" }); });
      log("model ready", { ms: Math.round(performance.now() - t0), cached, fetchMs: Math.round(model.info.fetchMs), initMs: Math.round(model.info.initMs), ...model.info.adapter });
      setModelState({ state: "ready" });
      return model;
    } catch (e) {
      modelP = null;
      relay?.error("model load failed", { message: String(e?.message || e) });
      setModelState({ state: "error", message: String(e?.message || e) });
      throw e;
    }
  })();
  return modelP;
}

// ---------- indexing ----------

// Split text into chunks of at most CHUNK_TOKENS tokens on paragraph, then sentence, then word boundaries.
function chunkText(m, title, text) {
  const pieces = [];
  for (const para of text.split(/\n+/)) {
    const p = para.trim();
    if (!p) continue;
    if (m.countTokens(p) <= CHUNK_TOKENS) { pieces.push(p); continue; }
    for (const sent of p.split(/(?<=[.!?])\s+/)) {
      if (m.countTokens(sent) <= CHUNK_TOKENS) { pieces.push(sent); continue; }
      const words = sent.split(/\s+/);
      for (let i = 0; i < words.length; i += 200) pieces.push(words.slice(i, i + 200).join(" "));
    }
  }
  const chunks = [];
  let cur = title ? title + "\n" : "", n = cur ? m.countTokens(cur) : 0;
  for (const p of pieces) {
    const k = m.countTokens(p);
    if (n + k > CHUNK_TOKENS && cur.trim()) {
      chunks.push(cur.trim());
      if (chunks.length >= MAX_CHUNKS) return chunks;
      cur = ""; n = 0;
    }
    cur += p + "\n"; n += k;
  }
  if (cur.trim() && chunks.length < MAX_CHUNKS) chunks.push(cur.trim());
  return chunks;
}

// Top-k sparse map -> Uint16 ids + Uint8 values with one scale.
function packVector(vec, k) {
  const ent = Object.entries(vec).map(([id, w]) => [+id, w]).sort((a, b) => b[1] - a[1]).slice(0, k);
  const max = ent.length ? ent[0][1] : 1;
  const scale = max / 255;
  const ids = new Uint16Array(ent.length), vals = new Uint8Array(ent.length);
  ent.forEach(([id, w], j) => { ids[j] = id; vals[j] = Math.max(1, Math.round(w / scale)); });
  return { ids: ids.buffer, vals: vals.buffer, scale };
}

async function indexPage({ url, title, text, visitTime, lang, hash }) {
  const t0 = performance.now();
  const m = await getModel();
  const texts = chunkText(m, title, text || "");
  if (!texts.length) texts.push(title || url);
  const chunks = [];
  for (let i = 0; i < texts.length; i++) {
    const [v] = await withGPU(() => m.encode([texts[i]], "document"));
    chunks.push({ url, i, text: texts[i], ...packVector(v, DOC_TERMS) });
  }
  const prev = await db.getPage(url);
  const visits = [...new Set([...(prev?.visits || []), visitTime])].sort((a, b) => a - b).slice(-50);
  await db.putPage({ url, title, host: hostOf(url), visits, indexedAt: Date.now(), hash, lang }, chunks);
  mem = null;
  log("indexed", { chunks: chunks.length, ms: Math.round(performance.now() - t0) });
  broadcast({ type: "index-changed" });
  return { chunks: chunks.length };
}

// ---------- in-memory vectors for search ----------

let mem = null;

async function getMem() {
  const v = await db.version();
  if (mem && mem.version === v) return mem;
  const t0 = performance.now();
  const pages = await db.allPages();
  const pageIdx = new Map(pages.map((p, i) => [p.url, i]));
  const cPage = [], cI = [], cOff = [0], idParts = [], valParts = [];
  let total = 0;
  await db.eachVector((url, i, ids, vals, scale) => {
    const p = pageIdx.get(url);
    if (p === undefined) return;
    cPage.push(p); cI.push(i);
    idParts.push(ids);
    const f = new Float32Array(vals.length);
    for (let j = 0; j < vals.length; j++) f[j] = vals[j] * scale;
    valParts.push(f);
    total += ids.length;
    cOff.push(total);
  });
  const ids = new Uint16Array(total), vals = new Float32Array(total);
  let o = 0;
  for (let c = 0; c < idParts.length; c++) { ids.set(idParts[c], o); vals.set(valParts[c], o); o += idParts[c].length; }
  mem = { version: v, pages, pageIdx, cPage: Int32Array.from(cPage), cI: Int32Array.from(cI), cOff: Uint32Array.from(cOff), ids, vals };
  log("index loaded", { pages: pages.length, chunks: cPage.length, ms: Math.round(performance.now() - t0) });
  return mem;
}

// ---------- search ----------

const STOP = new Set("the a an and or of to in on for with by at from is are was were be been it its this that as".split(" "));

function snippetOf(text, terms) {
  const sents = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const lits = terms.filter((t) => t.literal).map((t) => t.term.toLowerCase());
  let best = 0, bestScore = -1;
  for (let i = 0; i < sents.length; i++) {
    const s = (sents[i] + " " + (sents[i + 1] || "")).toLowerCase();
    const sc = lits.reduce((n, t) => n + (s.includes(t) ? 1 : 0), 0);
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  let out = sents.slice(best, best + 2).join(" ");
  if (out.length > 320) out = out.slice(0, 317) + "…";
  return (best > 0 ? "… " : "") + out;
}

async function search({ query, from = null, to = null, urls = null, limit = 30 }) {
  const t0 = performance.now();
  const m = await getModel();
  const [q] = await withGPU(() => m.encode([query], "query"));
  const M = await getMem();
  const qv = new Float32Array(m.V);
  for (const k in q) qv[k] = q[k];
  const urlSet = urls ? new Set(urls) : null;
  const allowed = new Uint8Array(M.pages.length);
  M.pages.forEach((p, i) => {
    if (urlSet && !urlSet.has(p.url)) return;
    if ((from != null || to != null) && !p.visits.some((t) => (from == null || t >= from) && (to == null || t < to))) return;
    allowed[i] = 1;
  });
  const best = new Float32Array(M.pages.length), bestChunk = new Int32Array(M.pages.length).fill(-1);
  for (let c = 0; c < M.cPage.length; c++) {
    const p = M.cPage[c];
    if (!allowed[p]) continue;
    let s = 0;
    for (let j = M.cOff[c]; j < M.cOff[c + 1]; j++) s += qv[M.ids[j]] * M.vals[j];
    if (s > best[p]) { best[p] = s; bestChunk[p] = c; }
  }
  // Drop the long tail that matches only on weak expansion terms: below a fifth of the best score.
  let top = 0;
  for (const s of best) if (s > top) top = s;
  const order = [...best.keys()].filter((p) => best[p] > 0 && best[p] >= 0.2 * top).sort((a, b) => best[b] - best[a]).slice(0, limit);
  const results = [];
  for (const p of order) {
    const page = M.pages[p], c = bestChunk[p];
    const chunk = await db.getChunk(page.url, M.cI[c]);
    const text = chunk?.text || "";
    const lower = text.toLowerCase();
    const contrib = [];
    for (let j = M.cOff[c]; j < M.cOff[c + 1]; j++) if (qv[M.ids[j]] > 0) contrib.push([M.ids[j], qv[M.ids[j]] * M.vals[j]]);
    contrib.sort((a, b) => b[1] - a[1]);
    const terms = [];
    for (const [id, w] of contrib) {
      const term = m.token(id).trim();
      if (!term || terms.some((t) => t.term.toLowerCase() === term.toLowerCase())) continue;
      terms.push({ term, w, literal: new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(lower) });
      if (terms.length >= 8) break;
    }
    results.push({ url: page.url, title: page.title, host: page.host, visits: page.visits, score: best[p], terms, snippet: snippetOf(text, terms) });
  }
  const qterms = Object.entries(q).sort((a, b) => b[1] - a[1]).map(([id, w]) => ({ term: m.token(+id).trim(), w }))
    .filter((t, i, a) => t.term && a.findIndex((x) => x.term.toLowerCase() === t.term.toLowerCase()) === i).slice(0, 12);
  const ms = Math.round(performance.now() - t0);
  log("search", { ms, results: results.length, pages: M.pages.length });
  return { results, queryTerms: qterms, ms, pages: M.pages.length };
}

// ---------- grouping open and closed tabs ----------

const groupCache = new Map();   // text -> normalised sparse map (top 64)

function normalise(vec, k = 64) {
  const ent = Object.entries(vec).map(([id, w]) => [+id, w]).sort((a, b) => b[1] - a[1]).slice(0, k);
  const n = Math.hypot(...ent.map((e) => e[1])) || 1;
  return new Map(ent.map(([id, w]) => [id, w / n]));
}
function cosine(a, b) {
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0;
  for (const [k, w] of a) { const v = b.get(k); if (v) s += w * v; }
  return s;
}

const LABEL_STOP = new Set([...STOP, "com", "www", "http", "https", "html", "org", "net", "page", "home", "new", "tab", "untitled"]);

async function group({ items, threshold = 0.2 }) {
  const t0 = performance.now();
  const m = await getModel();
  const M = await getMem().catch(() => null);
  const texts = await Promise.all(items.map(async (it) => {
    let t = `${it.title || ""} — ${hostOf(it.url)}`;
    const pi = M?.pageIdx.get(it.url);
    if (pi !== undefined) {
      const c0 = await db.getChunk(it.url, 0);
      if (c0) t += ". " + c0.text.split(/\s+/).slice(0, 60).join(" ");
    }
    return t;
  }));
  const todo = [...new Set(texts.filter((t) => !groupCache.has(t)))];
  for (let i = 0; i < todo.length; i += 16) {
    const batch = todo.slice(i, i + 16);
    const vecs = await withGPU(() => m.encode(batch, "document"));
    batch.forEach((t, j) => groupCache.set(t, normalise(vecs[j])));
  }
  if (groupCache.size > 2000) for (const k of [...groupCache.keys()].slice(0, 500)) groupCache.delete(k);
  const vecs = texts.map((t) => groupCache.get(t));

  // Average-linkage agglomerative clustering on cosine similarity.
  const n = items.length;
  const S = Array.from({ length: n }, (_, i) => Float32Array.from({ length: n }, (_, j) => (i === j ? 0 : cosine(vecs[i], vecs[j]))));
  let clusters = items.map((_, i) => ({ members: [i] }));
  const sim = (a, b) => { let s = 0; for (const i of a.members) for (const j of b.members) s += S[i][j]; return s / (a.members.length * b.members.length); };
  for (;;) {
    let bi = -1, bj = -1, bs = threshold;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const s = sim(clusters[i], clusters[j]);
      if (s > bs) { bs = s; bi = i; bj = j; }
    }
    if (bi < 0) break;
    clusters[bi] = { members: [...clusters[bi].members, ...clusters[bj].members] };
    clusters.splice(bj, 1);
  }

  // Label each multi-member cluster by the terms most over-represented in it.
  const mean = new Map();
  for (const v of vecs) for (const [k, w] of v) mean.set(k, (mean.get(k) || 0) + w / n);
  const groups = [], other = [];
  for (const c of clusters) {
    if (c.members.length < 2) { other.push(...c.members); continue; }
    const inC = new Map();
    for (const i of c.members) for (const [k, w] of vecs[i]) inC.set(k, (inC.get(k) || 0) + w / c.members.length);
    const ranked = [...inC].map(([k, w]) => [k, w - 0.5 * (mean.get(k) || 0)]).sort((a, b) => b[1] - a[1]);
    const label = [];
    for (const [k] of ranked) {
      const t = m.token(k).trim();
      const tl = t.toLowerCase();
      if (t.length < 3 || !/[a-z]/i.test(t) || LABEL_STOP.has(tl)) continue;
      if (label.some((x) => { const xl = x.toLowerCase(); return xl.startsWith(tl) || tl.startsWith(xl); })) continue;
      label.push(t);
      if (label.length >= 3) break;
    }
    groups.push({ label, keys: c.members.map((i) => items[i].key) });
  }
  groups.sort((a, b) => b.keys.length - a.keys.length);
  const ms = Math.round(performance.now() - t0);
  log("group", { items: n, groups: groups.length, other: other.length, encoded: todo.length, ms, threshold });
  return { groups, other: other.map((i) => items[i].key), ms };
}

// ---------- messages ----------

const handlers = {
  status: async () => ({ model: modelState, cached: await modelCached().catch(() => false) }),
  warm: async () => { await getModel(); return { model: modelState }; },
  index: (msg) => indexPage(msg.page),
  search: (msg) => search(msg),
  group: (msg) => group(msg),
};

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.target !== "offscreen") return false;
  const h = handlers[msg.type];
  if (!h) { respond({ ok: false, error: `unknown type ${msg.type}` }); return false; }
  lastUse = Date.now();
  busy++;
  Promise.resolve().then(() => h(msg))
    .then((result) => respond({ ok: true, result }))
    .catch((e) => { relay?.error(`${msg.type} failed`, { message: String(e?.message || e) }); respond({ ok: false, error: String(e?.message || e) }); })
    .finally(() => { busy--; lastUse = Date.now(); });
  return true;
});

// Free the GPU when nothing has happened for a while: the service worker closes this document.
setInterval(() => {
  if (!busy && Date.now() - lastUse > IDLE_MS) chrome.runtime.sendMessage({ target: "background", type: "offscreen-idle" }).catch(() => {});
}, 60 * 1000);
