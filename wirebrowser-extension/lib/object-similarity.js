/**
 * Object Similarity - ported from Wirebrowser's src/app/object-similarity.js
 *
 * Measures how alike two objects are by MinHashing the set of structural
 * features `extractFeatures` produces. For a k-permutation MinHash the
 * collision rate of a single slot is the Jaccard index of the two sets:
 *
 *   P(minhash_i(A) === minhash_i(B)) = |A n B| / |A u B|
 *
 * so the fraction of agreeing slots estimates Jaccard directly, unbiased,
 * with a standard error of about 1/sqrt(k). `exactSimilarity` computes the
 * same quantity exactly and is the reference the estimator is checked
 * against; the search path uses the estimator because it can hash the query
 * once and then compare fixed-width signatures.
 */

const DEFAULT_K = 128;

// MurmurHash3 x86_32 finalizer. A bijection on uint32, so composing it with a
// per-slot seed gives k distinct permutations of the hash space.
function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// MurmurHash3 x86_32 over the UTF-16 code units of `str`.
//
// Replaces the `h = h * 31 + c` recurrence this file used to call
// "MurmurHash3-like". That recurrence is Java's String.hashCode and avalanches
// poorly on short strings differing in one segment, which is exactly the
// population of feature strings here.
function murmur3_32(str, seed = 0) {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const len = str.length;
  const nblocks = len >>> 1; // two code units = one 32-bit block
  let h1 = seed | 0;

  for (let i = 0; i < nblocks; i++) {
    let k1 = (str.charCodeAt(i * 2) | (str.charCodeAt(i * 2 + 1) << 16)) | 0;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
  }

  if (len & 1) {
    let k1 = str.charCodeAt(len - 1) | 0;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }

  h1 ^= len * 2; // length in bytes
  return fmix32(h1);
}

// Deterministic, well-spread per-slot seeds.
function makeSeeds(k) {
  const seeds = new Uint32Array(k);
  let s = 0x9e3779b9;
  for (let i = 0; i < k; i++) {
    s = fmix32(s + 0x9e3779b9);
    seeds[i] = s;
  }
  return seeds;
}

export class ObjectSimilarity {
  constructor(options = {}) {
    this.includeValues = options.includeValues ?? false;
    // Signature width. Higher k narrows the estimate: standard error ~1/sqrt(k),
    // so 128 slots put it near 0.09.
    this.k = options.k ?? DEFAULT_K;
    this.seeds = makeSeeds(this.k);
  }

  hash(str) {
    return murmur3_32(str);
  }

  // Extract features from object structure
  extractFeatures(obj, prefix = "", depth = 0, maxDepth = 8) {
    const features = [];

    if (depth > maxDepth) return features;

    if (obj === null || obj === undefined) {
      features.push(`${prefix}:null`);
      return features;
    }

    const type = typeof obj;

    if (type === "string" || type === "number" || type === "boolean") {
      features.push(`${prefix}:${type}`);
      if (this.includeValues) {
        features.push(`${prefix}=${String(obj).slice(0, 50)}`);
      }
      return features;
    }

    if (Array.isArray(obj)) {
      features.push(`${prefix}:array`);
      features.push(`${prefix}:array:len${obj.length}`);

      // Sample array elements
      const sampleSize = Math.min(obj.length, 5);
      for (let i = 0; i < sampleSize; i++) {
        features.push(...this.extractFeatures(obj[i], `${prefix}[*]`, depth + 1, maxDepth));
      }
      return features;
    }

    if (type === "object") {
      const keys = Object.keys(obj).sort();
      features.push(`${prefix}:object`);
      features.push(`${prefix}:keys:${keys.length}`);

      for (const key of keys) {
        features.push(`${prefix}.${key}`);
        features.push(...this.extractFeatures(obj[key], `${prefix}.${key}`, depth + 1, maxDepth));
      }
      return features;
    }

    features.push(`${prefix}:${type}`);
    return features;
  }

  // MinHash signature over a feature set. Returns null for an empty set.
  signatureFromFeatures(features) {
    const set = features instanceof Set ? features : new Set(features);
    if (set.size === 0) return null;

    const k = this.k;
    const seeds = this.seeds;
    const sig = new Uint32Array(k).fill(0xffffffff);

    for (const feature of set) {
      const base = murmur3_32(feature);
      for (let i = 0; i < k; i++) {
        const h = fmix32(base ^ seeds[i]);
        if (h < sig[i]) sig[i] = h;
      }
    }

    return sig;
  }

  // Signature for a single object. Hoist this out of any scan loop: the query
  // side of a search only needs it once.
  signature(obj) {
    return this.signatureFromFeatures(this.extractFeatures(obj));
  }

  // Estimated Jaccard similarity (0-1) between two signatures.
  compareSignatures(sig1, sig2) {
    if (!sig1 || !sig2) return !sig1 && !sig2 ? 1 : 0;

    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] === sig2[i]) matches++;
    }
    return matches / sig1.length;
  }

  // Estimated Jaccard similarity (0-1) between two objects.
  similarity = (obj1, obj2) => {
    return this.compareSignatures(this.signature(obj1), this.signature(obj2));
  };

  // Exact Jaccard over the same feature sets. The quantity `similarity`
  // estimates - useful as a reference and for small objects where the exact
  // answer costs no more than the signature.
  exactSimilarity(obj1, obj2) {
    const set1 = new Set(this.extractFeatures(obj1));
    const set2 = new Set(this.extractFeatures(obj2));

    if (set1.size === 0 && set2.size === 0) return 1;

    let intersection = 0;
    for (const f of set1) {
      if (set2.has(f)) intersection++;
    }
    return intersection / (set1.size + set2.size - intersection);
  }
}

export default ObjectSimilarity;
