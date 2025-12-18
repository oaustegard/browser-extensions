# Wirebrowser Lite (Chrome Extension)

A browser extension port of [Wirebrowser's](https://github.com/fcavallarin/wirebrowser) core heap inspection and BDHS (Breakpoint-Driven Heap Search) capabilities.

## Features

- **Heap Snapshot Search** - Capture V8 heap snapshots and search by property, value, or class name
- **Live Object Search** - Query live objects in memory via Runtime domain
- **Origin Trace (BDHS)** - Find the user-land function that creates/mutates a target value
- **Structural Similarity** - Find objects with similar shape using hybrid SimHash

## Installation

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this directory

## Usage

1. Open DevTools (F12) on any page
2. Navigate to the "Wirebrowser" panel
3. Use the tabs to switch between:
   - **Heap Snapshot**: Capture and search static snapshots
   - **Live Objects**: Search objects currently in memory
   - **Origin Trace**: BDHS temporal analysis

### BDHS (Origin Trace)

1. Enter search criteria (property/value/class to find)
2. Click "Arm BDHS"
3. Click an element on the page that triggers the code path
4. The extension traces through breakpoints, capturing snapshots at each step
5. Results show which function created/mutated the value

## Architecture

```
wirebrowser-extension/
├── manifest.json           # MV3 extension manifest
├── background.js           # Service worker (CDP session management)
├── lib/
│   ├── cdp-client.js       # chrome.debugger → CDP transport adapter
│   ├── debugger-wrapper.js # High-level debugger operations
│   ├── heap-snapshot.js    # Snapshot parsing and search
│   ├── bdhs.js             # Breakpoint-driven heap search executor
│   └── object-similarity.js # SimHash + structural similarity
└── devtools/
    ├── devtools.html/js    # DevTools panel registration
    └── panel.html/js       # Main UI
```

## Key Differences from Electron Version

| Aspect | Electron (Wirebrowser) | Extension (This) |
|--------|------------------------|------------------|
| Browser control | Puppeteer launches Chrome | Attaches to current tab |
| CDP transport | WebSocket via Puppeteer | chrome.debugger API |
| Network intercept | Full request interception | Limited (can't intercept before load) |
| UI | Standalone window | DevTools panel |
| Persistence | User data dir | None (per-session) |

## MCP Integration Path

This extension can be connected to an MCP server via Chrome's Native Messaging:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Claude    │────▶│ MCP Server  │────▶│  Extension  │
│  (client)   │◀────│   (host)    │◀────│ (via native │
└─────────────┘     └─────────────┘     │  messaging) │
                                        └─────────────┘
```

### Native Messaging Setup

1. Create a native messaging host (`wirebrowser_host.py` or similar)
2. Register it in Chrome's native messaging manifest
3. Extension connects via `chrome.runtime.connectNative()`
4. MCP server exposes tools like:
   - `heap_snapshot_search(property, value, class)`
   - `live_object_search(pattern)`
   - `start_bdhs(criteria)` / `stop_bdhs()`
   - `expose_object(objectId, varName)`

### Example MCP Tool Schema

```json
{
  "name": "heap_search",
  "description": "Search V8 heap snapshot for objects matching criteria",
  "input_schema": {
    "type": "object",
    "properties": {
      "property": { "type": "string", "description": "Property name to match" },
      "value": { "type": "string", "description": "Value to match" },
      "class": { "type": "string", "description": "Class name to match" },
      "similarity_threshold": { "type": "number", "default": 0.7 }
    }
  }
}
```

## Limitations

- **Debugger banner**: Chrome shows "Extension is debugging this browser" while attached
- **No pre-load interception**: Can't intercept requests before page load
- **Single tab**: Each panel instance controls one tab
- **Memory**: Large snapshots consume significant memory in the extension context

## Credits

Core algorithms ported from [fcavallarin/wirebrowser](https://github.com/fcavallarin/wirebrowser) (MIT License).
