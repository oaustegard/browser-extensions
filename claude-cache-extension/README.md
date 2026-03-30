# Claude Conversation Cache

A Chrome extension that continuously caches Claude.ai conversations to prevent data loss when the UI crashes mid-response.

## The Problem

Claude's web UI occasionally crashes or fails after completing 80% of a response. When this happens, everything Claude generated is lost — even though it was streamed to your browser.

## The Solution

This extension intercepts Claude's API responses (including SSE streams) and caches them in IndexedDB. When the UI crashes, your conversation data is preserved and can be viewed/exported via the extension popup.

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your toolbar

## Usage

**Automatic caching:** Just browse claude.ai normally. The extension silently captures conversation data in the background.

**View cached conversations:** Click the extension icon to see a list of cached conversations, sorted by most recent.

**Recover from crashes:** If Claude's UI fails mid-response, open the extension popup. Your conversation should be there, including any streamed content that hadn't finished rendering.

**Export:** Select messages in the pruner view and:
- Click "Copy" to copy as structured text
- Click "Render HTML" to open a formatted standalone page

## How It Works

1. **Content script** runs in the page context and wraps `window.fetch()`
2. When Claude fetches conversation data or streams a response, we fork the response:
   - One stream goes to Claude's UI (unchanged)
   - One stream goes to our cache (IndexedDB)
3. **Service worker** manages the IndexedDB and reconstructs messages from SSE chunks
4. **Popup** displays cached conversations with a pruner interface

## Files

```
claude-cache/
├── manifest.json         # Extension configuration
├── content-script.js     # Fetch interception (runs in MAIN world)
├── service-worker.js     # Background caching logic
├── popup.html/js         # Extension popup UI
└── lib/
    └── pruner-core.js    # Rendering and export utilities
```

## Privacy

All data stays local in your browser's IndexedDB. Nothing is sent to external servers.

## Limitations

- Only caches conversations you actively view
- SSE stream reconstruction is best-effort (complex tool use may not fully reconstruct)
- Cache persists until manually cleared or conversation deleted

## Development

The extension uses Manifest V3 with:
- `MAIN` world content script for fetch interception
- `BroadcastChannel` for content script ↔ service worker communication
- IndexedDB for persistent storage

To modify, edit the files and reload the extension in `chrome://extensions/`.

## Credits

Based on [Claude Pruner](https://austegard.com/ai-tools/claude-pruner.html) by Oskar Austegard.

## Changelog

### 0.4.3
- Changed: Clicking conversation row now opens directly in full tab (not popup detail view)
- Fixed: CSP violation in viewer.html — moved inline script to external viewer.js
- Simplified: Removed "View" button from list (row click = open in tab)

### 0.4.2
- Added: "⤢" (Open in Tab) button directly in conversation list — no need to View first

### 0.4.1
- Fixed: "Extension context invalidated" error when extension reloads while page is open

### 0.4.0
- Fixed: Stream capture now works — completion URL pattern checked before conversation pattern
- Added: EventSource interception in case Claude uses SSE via EventSource API
- Added: Raw stream buffer preservation for crash recovery
- Added: Verbose logging for stream events (check console for `[Claude Cache]` messages)
- Improved: Stream chunks always sent to cache, even if parsing finds no events

### 0.3.0
- Added: "Open in Tab" button for full-page viewer experience
- Added: "Open on Claude" button to jump to conversation on claude.ai
- Added: Full-page viewer.html with all pruner controls (toggles, click modes, collapse)
- Added: Claude link button in conversation list for quick access

### 0.2.0
- Fixed: BroadcastChannel doesn't work across origins — switched to MAIN/ISOLATED relay pattern
- Added: Proactive fetch on page load (no longer requires new message to capture)
- Added: "Capture" button in popup for manual refresh
- Added: SPA navigation detection for auto-capture on conversation switch

### 0.1.0
- Initial implementation with fetch interception and SSE stream capture
- IndexedDB storage for conversations and partial streams
- Popup with conversation list and pruner UI
