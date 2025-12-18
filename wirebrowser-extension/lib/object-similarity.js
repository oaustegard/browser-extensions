/**
 * Object Similarity - ported from Wirebrowser's src/app/object-similarity.js
 * Hybrid SimHash + structural comparison for finding similar objects
 */

export class ObjectSimilarity {
  constructor(options = {}) {
    this.includeValues = options.includeValues ?? false;
    this.hashBits = 64;
  }

  // MurmurHash3-like hash for strings
  hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h = ((h << 5) - h) + c;
      h = h & h; // Convert to 32bit integer
    }
    return h >>> 0;
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

  // Compute SimHash from features
  simhash(features) {
    const v = new Array(this.hashBits).fill(0);
    
    for (const feature of features) {
      const h = this.hash(feature);
      for (let i = 0; i < this.hashBits; i++) {
        const bit = (h >> (i % 32)) & 1;
        v[i] += bit ? 1 : -1;
      }
    }
    
    let hash = 0n;
    for (let i = 0; i < this.hashBits; i++) {
      if (v[i] > 0) {
        hash |= (1n << BigInt(i));
      }
    }
    
    return hash;
  }

  // Hamming distance between two simhashes
  hammingDistance(a, b) {
    let xor = a ^ b;
    let dist = 0;
    while (xor > 0n) {
      dist += Number(xor & 1n);
      xor >>= 1n;
    }
    return dist;
  }

  // SimHash similarity (0-1)
  simhashSimilarity(obj1, obj2) {
    const features1 = this.extractFeatures(obj1);
    const features2 = this.extractFeatures(obj2);
    
    if (features1.length === 0 && features2.length === 0) return 1;
    if (features1.length === 0 || features2.length === 0) return 0;
    
    const hash1 = this.simhash(features1);
    const hash2 = this.simhash(features2);
    
    const distance = this.hammingDistance(hash1, hash2);
    return 1 - (distance / this.hashBits);
  }

  // Structural similarity based on key overlap
  structuralSimilarity(obj1, obj2) {
    if (obj1 === null || obj2 === null) return obj1 === obj2 ? 1 : 0;
    if (typeof obj1 !== "object" || typeof obj2 !== "object") return 0;
    
    const keys1 = new Set(Object.keys(obj1));
    const keys2 = new Set(Object.keys(obj2));
    
    if (keys1.size === 0 && keys2.size === 0) return 1;
    
    const intersection = [...keys1].filter(k => keys2.has(k)).length;
    const union = new Set([...keys1, ...keys2]).size;
    
    return intersection / union; // Jaccard similarity
  }

  // Hybrid similarity combining SimHash and structural comparison
  hybridSimilarity = (obj1, obj2, alpha = 0.5) => {
    const simSim = this.simhashSimilarity(obj1, obj2);
    const structSim = this.structuralSimilarity(obj1, obj2);
    
    // For small objects, weight structural similarity higher
    const keys1 = typeof obj1 === "object" && obj1 ? Object.keys(obj1).length : 0;
    const keys2 = typeof obj2 === "object" && obj2 ? Object.keys(obj2).length : 0;
    const avgKeys = (keys1 + keys2) / 2;
    
    // Adjust alpha based on object size
    const adjustedAlpha = avgKeys < 5 ? Math.max(0.2, alpha - 0.3) : alpha;
    
    return adjustedAlpha * simSim + (1 - adjustedAlpha) * structSim;
  };

  // Convenience method for simhashing a single object
  simhashObject(obj) {
    return this.simhash(this.extractFeatures(obj));
  }
}

export default ObjectSimilarity;
