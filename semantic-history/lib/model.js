// SparseUp v2 (linkup-sparseup-embed-v2, int8 pack) on WebGPU, adapted from
// oaustegard/experiments sparseup-v2/pack/web/sparseup.js for an extension page:
//   - the tokenizer is vendored (Manifest V3 loads no remote code);
//   - the pack's files go through the Cache API, so the 151 MB download happens once.
//
//   const sp = await loadModel(onProgress);
//   const [q] = await sp.encode(["gravel bike tires"], "query");   // [{ id: weight }]
//   sp.token(id)                                                    // "tires"

import { SparseEngine, toSparse } from "./wgsl/sparse-engine.js";
import { Tokenizer } from "./vendor/tokenizers.mjs";

export const PACK = "https://pub-38421218e82c4d4ba2bc53974c28b55d.r2.dev/sparseup-v2/int8-v1/";
export const CACHE = "semantic-history-sparseup-int8-v1";

// Fetch through the Cache API, reporting bytes as they arrive.
async function cachedBytes(cache, url, onBytes) {
  const hit = await cache.match(url);
  if (hit) { const b = await hit.arrayBuffer(); onBytes(b.byteLength); return b; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.split("/").pop()}: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.byteLength;
    onBytes(value.byteLength);
  }
  const out = new Uint8Array(n);
  parts.reduce((o, p) => { out.set(p, o); return o + p.byteLength; }, 0);
  await cache.put(url, new Response(out, { headers: { "Content-Type": "application/octet-stream" } }));
  return out.buffer;
}

export async function modelCached() {
  if (!(await caches.has(CACHE))) return false;
  const c = await caches.open(CACHE);
  const m = await c.match(PACK + "manifest.json");
  if (!m) return false;
  const manifest = await m.json();
  for (const n of [...manifest.weights_parts, "tokenizer.json"]) if (!(await c.match(PACK + n))) return false;
  return true;
}

export async function deleteModel() { return caches.delete(CACHE); }

// onProgress({ phase: "download" | "build", loaded, total })
export async function loadModel(onProgress = () => {}, opts = {}) {
  if (!navigator.gpu) throw new Error("no WebGPU in this browser");
  const cache = await caches.open(CACHE);
  const t0 = performance.now();
  const manifest = JSON.parse(new TextDecoder().decode(await cachedBytes(cache, PACK + "manifest.json", () => {})));
  const names = manifest.weights_parts ?? ["weights.bin"];
  const total = manifest.regions.layers.offset + manifest.regions.layers.length;
  let loaded = 0;
  const tick = (n) => { loaded += n; onProgress({ phase: "download", loaded, total }); };
  const [tjBytes, ...parts] = await Promise.all([
    cachedBytes(cache, PACK + "tokenizer.json", () => {}),
    ...names.map((n) => cachedBytes(cache, PACK + n, tick))]);
  const tj = JSON.parse(new TextDecoder().decode(tjBytes));
  const data = new Uint8Array(parts.reduce((s, x) => s + x.byteLength, 0));
  parts.reduce((o, x) => { data.set(new Uint8Array(x), o); return o + x.byteLength; }, 0);
  const fetchMs = performance.now() - t0;

  const tok = new Tokenizer(tj, {});
  const vocab = [];
  for (const [s, id] of Object.entries(tj.model.vocab)) vocab[id] = s;
  for (const a of tj.added_tokens) vocab[a.id] = a.content;
  const maxSeq = opts.maxSeq ?? 512;

  const tokenize = (text, kind = "document") => {
    const prefix = kind === "query" ? manifest.query_prefix : kind === "document" ? manifest.document_prefix : "";
    if (manifest.add_prefix_space && !text.startsWith(" ")) text = " " + text;
    let ids = Array.from(tok.encode(prefix + text).ids);
    if (ids.length > maxSeq) ids = ids.slice(0, maxSeq - 1).concat(ids[ids.length - 1]);
    const pool = ids.map((_, j) => (prefix && j === 1 ? 0 : 1));
    return { ids, pool };
  };
  // Token count of plain text, without prefix or special tokens.
  const countTokens = (text) => tok.encode(" " + text, { add_special_tokens: false }).ids.length;

  onProgress({ phase: "build", loaded, total });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no WebGPU adapter");
  const L = adapter.limits;
  const device = await adapter.requestDevice({
    requiredLimits: { maxStorageBufferBindingSize: L.maxStorageBufferBindingSize, maxBufferSize: L.maxBufferSize } });
  const t1 = performance.now();
  const maxTokens = opts.maxTokens ?? 512, maxSeqs = opts.maxSeqs ?? 16;
  const engine = await SparseEngine.create(device, manifest, data, { maxTokens, maxSeq, maxSeqs });
  const initMs = performance.now() - t1;
  const V = manifest.vpad;

  const run = async (items) => {
    const rows = [];
    for (let i = 0; i < items.length;) {
      const batch = [];
      let n = 0;
      while (i < items.length && batch.length < maxSeqs && n + items[i].ids.length <= maxTokens) { n += items[i].ids.length; batch.push(items[i++]); }
      const out = await engine.embed(batch);
      for (let b = 0; b < batch.length; b++) rows.push(out.subarray(b * V, (b + 1) * V));
    }
    return rows;
  };
  const encode = async (texts, kind = "document", topK = 0) =>
    (await run(texts.map((t) => tokenize(t, kind)))).map((r) => toSparse(r, V, 1, topK)[0]);
  const token = (id) => (vocab[id] ?? `#${id}`).replace(/^Ġ/, "");
  return { manifest, device, V, tokenize, countTokens, encode, token,
           info: { fetchMs, initMs, bytes: data.byteLength, adapter: adapter.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture } : {} } };
}
