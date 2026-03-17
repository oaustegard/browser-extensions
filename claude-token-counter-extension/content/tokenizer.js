/* Token Estimator
 *
 * Heuristic-based token counting for Claude conversations.
 * Claude uses a BPE tokenizer similar to (but not identical to) OpenAI's.
 * The ~4 chars/token rule is a rough average for English prose.
 *
 * We use a slightly smarter approach:
 * - Split on whitespace + punctuation boundaries
 * - Count words (most common English words ≈ 1 token, longer words ≈ 1.3 tokens)
 * - Add overhead for special characters, code blocks, etc.
 *
 * Accuracy target: within ~15% of actual for typical conversations.
 */

const TokenEstimator = {

  /**
   * Estimate token count for a string.
   * @param {string} text
   * @returns {number} estimated token count
   */
  estimate(text) {
    if (!text || typeof text !== "string") return 0;

    /* Fast path for empty/whitespace */
    const trimmed = text.trim();
    if (!trimmed) return 0;

    /* Split into word-like segments */
    const words = trimmed.match(/\S+/g) || [];
    let tokens = 0;

    for (const word of words) {
      const len = word.length;

      if (len <= 3) {
        /* Short words: usually 1 token */
        tokens += 1;
      } else if (len <= 7) {
        /* Medium words: usually 1 token, sometimes 2 */
        tokens += 1.2;
      } else if (len <= 12) {
        /* Longer words: often 2 tokens */
        tokens += 1.8;
      } else {
        /* Very long words (URLs, code identifiers, etc.): roughly len/4 */
        tokens += Math.ceil(len / 3.5);
      }

      /* Punctuation attached to words adds ~0.5 tokens */
      const punctCount = (word.match(/[^a-zA-Z0-9\s]/g) || []).length;
      if (punctCount > 1) {
        tokens += (punctCount - 1) * 0.3;
      }
    }

    /* Newlines and structural whitespace cost tokens */
    const newlines = (text.match(/\n/g) || []).length;
    tokens += newlines * 0.5;

    return Math.round(tokens);
  },

  /**
   * Estimate tokens for a content block array (as returned by claude.ai API).
   * Content blocks can be: { type: "text", text: "..." }, { type: "tool_use", ... }, etc.
   * @param {Array|string} content
   * @returns {number}
   */
  estimateContent(content) {
    if (typeof content === "string") return this.estimate(content);
    if (!Array.isArray(content)) return 0;

    let total = 0;
    for (const block of content) {
      if (block.type === "text" && block.text) {
        total += this.estimate(block.text);
      } else if (block.type === "tool_use") {
        /* Tool use blocks: name + JSON input */
        total += this.estimate(block.name || "");
        total += this.estimate(JSON.stringify(block.input || {}));
        total += 20; /* overhead for tool_use structure */
      } else if (block.type === "tool_result") {
        total += this.estimateContent(block.content || "");
        total += 10; /* overhead for tool_result structure */
      } else if (block.type === "thinking" && block.thinking) {
        total += this.estimate(block.thinking);
      } else if (block.type === "code_execution") {
        total += this.estimate(block.code || "");
        total += 15; /* overhead */
      } else {
        /* Unknown block type — estimate from JSON representation */
        total += this.estimate(JSON.stringify(block));
      }
    }
    return total;
  },

  /**
   * Format a token count for display.
   * @param {number} tokens
   * @returns {string}
   */
  formatTokens(tokens) {
    if (tokens < 1000) return tokens.toString();
    if (tokens < 1000000) return (tokens / 1000).toFixed(1) + "k";
    return (tokens / 1000000).toFixed(2) + "M";
  },

  /**
   * Format a dollar amount for display.
   * @param {number} dollars
   * @returns {string}
   */
  formatCost(dollars) {
    if (dollars < 0.01) return "<$0.01";
    if (dollars < 1) return "$" + dollars.toFixed(2);
    return "$" + dollars.toFixed(2);
  }
};
