// IndexedDB store shared by the service worker (deletions), the offscreen document (indexing, search)
// and the side panel (counts). All three run on the extension's origin, so they open the same database.
//
//   pages:  { url, title, host, visits: [history visitTime ms], indexedAt, hash, nChunks, lang }
//   chunks: { url, i, text, ids: ArrayBuffer (Uint16), vals: ArrayBuffer (Uint8), scale }
//   meta:   { key: "version", value: n }   bumped on every change, so a reader knows when to reload
//
// A page's visits are the history visit times it was read at. When history loses all of them the page
// leaves the index (reconcile below), whether or not the URL has other visits left.

const NAME = "semantic-history";
let dbp = null;

export function open() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("pages", { keyPath: "url" });
      d.createObjectStore("chunks", { keyPath: ["url", "i"] });
      d.createObjectStore("meta", { keyPath: "key" });
    };
    r.onsuccess = () => {
      const d = r.result;
      d.onversionchange = () => { d.close(); dbp = null; };
      resolve(d);
    };
    r.onerror = () => { dbp = null; reject(r.error); };
  });
  return dbp;
}

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
const chunkRange = (url) => IDBKeyRange.bound([url, 0], [url, Infinity]);

function bump(tx) {
  const m = tx.objectStore("meta");
  const g = m.get("version");
  g.onsuccess = () => m.put({ key: "version", value: (g.result?.value ?? 0) + 1 });
}

export async function version() {
  const d = await open();
  const v = await req(d.transaction("meta").objectStore("meta").get("version"));
  return v?.value ?? 0;
}

export async function getPage(url) {
  const d = await open();
  return req(d.transaction("pages").objectStore("pages").get(url));
}

export async function allPages() {
  const d = await open();
  return req(d.transaction("pages").objectStore("pages").getAll());
}

export async function counts() {
  const d = await open();
  const tx = d.transaction(["pages", "chunks"]);
  const [pages, chunks] = await Promise.all([req(tx.objectStore("pages").count()), req(tx.objectStore("chunks").count())]);
  return { pages, chunks };
}

// Replace a page and its chunks in one transaction.
export async function putPage(page, chunks) {
  const d = await open();
  const tx = d.transaction(["pages", "chunks", "meta"], "readwrite");
  const cs = tx.objectStore("chunks");
  cs.delete(chunkRange(page.url));
  for (const c of chunks) cs.put(c);
  tx.objectStore("pages").put({ ...page, nChunks: chunks.length });
  bump(tx);
  return done(tx);
}

// Record another history visit of an already indexed, unchanged page.
export async function addVisit(url, visitTime) {
  const d = await open();
  const tx = d.transaction(["pages", "meta"], "readwrite");
  const ps = tx.objectStore("pages");
  const p = await req(ps.get(url));
  if (p && !p.visits.includes(visitTime)) {
    p.visits = [...p.visits, visitTime].sort((a, b) => a - b).slice(-50);
    ps.put(p);
    bump(tx);
  }
  return done(tx);
}

export async function deletePage(url) {
  const d = await open();
  const tx = d.transaction(["pages", "chunks", "meta"], "readwrite");
  tx.objectStore("pages").delete(url);
  tx.objectStore("chunks").delete(chunkRange(url));
  bump(tx);
  return done(tx);
}

export async function clearAll() {
  const d = await open();
  const tx = d.transaction(["pages", "chunks", "meta"], "readwrite");
  tx.objectStore("pages").clear();
  tx.objectStore("chunks").clear();
  bump(tx);
  return done(tx);
}

// Keep only the visits that history still has; drop the page when none are left.
// historyVisitTimes: visitTime values from chrome.history.getVisits({ url }).
// Returns "kept", "trimmed", "deleted" or "absent".
export async function reconcile(url, historyVisitTimes) {
  const p = await getPage(url);
  if (!p) return "absent";
  const have = new Set(historyVisitTimes);
  const visits = p.visits.filter((t) => have.has(t));
  if (!visits.length) { await deletePage(url); return "deleted"; }
  if (visits.length === p.visits.length) return "kept";
  const d = await open();
  const tx = d.transaction(["pages", "meta"], "readwrite");
  tx.objectStore("pages").put({ ...p, visits });
  bump(tx);
  await done(tx);
  return "trimmed";
}

export async function getChunks(url) {
  const d = await open();
  return req(d.transaction("chunks").objectStore("chunks").getAll(chunkRange(url)));
}

export async function getChunk(url, i) {
  const d = await open();
  return req(d.transaction("chunks").objectStore("chunks").get([url, i]));
}

// Stream every chunk's vector (no text) to fn(url, i, ids Uint16Array, vals Uint8Array, scale).
export async function eachVector(fn) {
  const d = await open();
  const tx = d.transaction("chunks");
  await new Promise((resolve, reject) => {
    const c = tx.objectStore("chunks").openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return resolve();
      const v = cur.value;
      fn(v.url, v.i, new Uint16Array(v.ids), new Uint8Array(v.vals), v.scale);
      cur.continue();
    };
    c.onerror = () => reject(c.error);
  });
}
