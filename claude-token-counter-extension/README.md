# Claude Token Counter

Browser extension that estimates token usage and API-equivalent cost for Claude.ai conversations.

## What It Does

Fetches the current conversation's transcript via Claude.ai's internal API, estimates token counts per turn using a heuristic tokenizer, and models the compounding multi-turn cost with prompt caching assumptions.

Displays a floating badge on claude.ai pages showing:
- **Context window size** — estimated total tokens in the conversation
- **API-equivalent cost** — what this conversation would cost at published API rates

Click the badge for a per-turn breakdown, or click the extension icon for a detailed popup.

## Cost Model

Multi-turn conversations are expensive because each API call sends the entire conversation history as input. The extension models this:

- **Turn 1**: System prompt (~10k tokens estimated) + user message at full input rate; assistant response at output rate
- **Turn N > 1**: All prior context at **cache-read rate** (10% of input cost); new user message at full input rate; assistant response at output rate

This reflects how claude.ai likely operates — with prompt caching enabled, prior turns get cached automatically, so only the new user input and model output incur full rates.

## Pricing (as of March 2026)

| Model | Input | Output | Cache Read |
|-------|-------|--------|------------|
| Opus 4.6 | $5.00/MTok | $25.00/MTok | $0.50/MTok |
| Sonnet 4.6 | $3.00/MTok | $15.00/MTok | $0.30/MTok |
| Haiku 4.5 | $1.00/MTok | $5.00/MTok | $0.10/MTok |

## Token Estimation

Uses a word-length heuristic (~4 chars/token average) tuned for typical conversation text. Not as accurate as a real BPE tokenizer, but avoids a ~3-5MB dependency. Expect ±15% accuracy for English prose.

## Installation

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `claude-token-counter-extension` folder
5. Navigate to a Claude.ai conversation

## Files

```
claude-token-counter-extension/
├── manifest.json    # MV3 extension config
├── background.js    # Service worker (badge updates, message passing)
├── content.js       # Injected into claude.ai (API fetch, analysis, badge UI)
├── tokenizer.js     # Heuristic token estimator
├── pricing.js       # Model pricing lookup table
├── styles.css       # Floating badge styles
├── popup.html       # Extension popup layout
├── popup.js         # Popup rendering logic
└── icon.png         # Extension icon
```

## Limitations

- **Token estimates are approximate** — Claude's actual tokenizer is not publicly available; we use a heuristic
- **System prompt size is unknown** — we estimate ~10k tokens based on typical claude.ai system prompts
- **Tool use & artifacts** — tool calls and results are estimated from their JSON representation
- **Extended thinking** — thinking tokens (if visible in the API response) are counted as output tokens
- **Shared conversations** use a different API endpoint and may have less metadata
- **Images and PDFs** — binary content tokens are not estimated (only text content blocks)

## Privacy

All requests go directly from your browser to claude.ai using your existing session cookies. No external servers, no data collection.
