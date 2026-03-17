/* Claude API Pricing Table (USD per million tokens)
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 * Last updated: March 2026
 *
 * Each entry: { input, output, cacheRead, cacheWrite }
 * All values in dollars per million tokens.
 */

const CLAUDE_PRICING = {
  /* Current generation */
  "claude-opus-4-6":   { input: 5.00,  output: 25.00, cacheRead: 0.50,  cacheWrite: 6.25  },
  "claude-opus-4-5":   { input: 5.00,  output: 25.00, cacheRead: 0.50,  cacheWrite: 6.25  },
  "claude-sonnet-4-6": { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75  },
  "claude-sonnet-4-5": { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75  },
  "claude-sonnet-4":   { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75  },
  "claude-haiku-4-5":  { input: 1.00,  output: 5.00,  cacheRead: 0.10,  cacheWrite: 1.25  },

  /* Legacy (still sometimes seen) */
  "claude-opus-4-1":   { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  "claude-opus-4":     { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  "claude-sonnet-3-7": { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75  },
  "claude-haiku-3-5":  { input: 0.80,  output: 4.00,  cacheRead: 0.08,  cacheWrite: 1.00  },
  "claude-haiku-3":    { input: 0.25,  output: 1.25,  cacheRead: 0.03,  cacheWrite: 0.30  }
};

/* Default model to assume when we can't detect it */
const DEFAULT_MODEL = "claude-sonnet-4-6";

/* Default system prompt token estimate (claude.ai's system prompt is substantial) */
const DEFAULT_SYSTEM_PROMPT_TOKENS = 10000;

/**
 * Resolve a model string from the conversation API to a pricing key.
 * The API may return strings like "claude-3-5-sonnet-20241022" or display names.
 * We do best-effort matching.
 */
function resolvePricing(modelString) {
  if (!modelString) return CLAUDE_PRICING[DEFAULT_MODEL];

  /* Direct match */
  const lower = modelString.toLowerCase();
  if (CLAUDE_PRICING[lower]) return CLAUDE_PRICING[lower];

  /* Fuzzy match: check if any key is a substring or vice versa */
  for (const [key, pricing] of Object.entries(CLAUDE_PRICING)) {
    /* Match on the model family name portion */
    const keyParts = key.replace("claude-", "").split("-");
    const family = keyParts[0]; /* opus, sonnet, haiku */
    const version = keyParts.slice(1).join("-"); /* 4-6, 4-5, etc */

    if (lower.includes(family) && lower.includes(version.replace("-", "."))) {
      return pricing;
    }
    if (lower.includes(family) && lower.includes(version.replace("-", ""))) {
      return pricing;
    }
  }

  /* Fall back to family-based matching */
  if (lower.includes("opus")) {
    if (lower.includes("4.6") || lower.includes("4-6")) return CLAUDE_PRICING["claude-opus-4-6"];
    if (lower.includes("4.5") || lower.includes("4-5")) return CLAUDE_PRICING["claude-opus-4-5"];
    if (lower.includes("4.1") || lower.includes("4-1")) return CLAUDE_PRICING["claude-opus-4-1"];
    return CLAUDE_PRICING["claude-opus-4-6"]; /* latest opus */
  }
  if (lower.includes("sonnet")) {
    if (lower.includes("4.6") || lower.includes("4-6")) return CLAUDE_PRICING["claude-sonnet-4-6"];
    if (lower.includes("4.5") || lower.includes("4-5")) return CLAUDE_PRICING["claude-sonnet-4-5"];
    return CLAUDE_PRICING["claude-sonnet-4-6"]; /* latest sonnet */
  }
  if (lower.includes("haiku")) {
    if (lower.includes("4.5") || lower.includes("4-5")) return CLAUDE_PRICING["claude-haiku-4-5"];
    return CLAUDE_PRICING["claude-haiku-4-5"];
  }

  console.log("[Token Counter] Unknown model, using default:", modelString);
  return CLAUDE_PRICING[DEFAULT_MODEL];
}
