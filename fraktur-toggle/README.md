# Fraktur Toggle

A browser extension that toggles any webpage to Fraktur (blackletter) font.

## Purpose

A performative protest tool that reveals the aesthetic inspiration of certain websites by displaying them in Fraktur, the typeface associated with historical fascist regimes.

## Features

- **One-click toggle**: Click the extension icon to instantly convert any page to Fraktur font
- **Per-site memory**: Option to remember your preference for each website
- **Instant effect**: Changes apply immediately without page reload
- **Easy revert**: Click again to restore normal fonts

## Installation

### From Source (Developer Mode)

1. Download or clone this repository
2. Open your browser's extension page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `fraktur-toggle` directory

## Usage

1. Navigate to any website
2. Click the Fraktur Toggle extension icon
3. Click "Enable Fraktur" to apply the font
4. (Optional) Check "Remember for this site" to auto-apply on future visits
5. Click "Disable Fraktur" to revert to normal fonts

## Technical Details

- Built with Manifest V3
- Uses content scripts for instant font injection
- Syncs preferences across devices via Chrome Storage API
- Works on all websites

## Font Stack

The extension applies Fraktur fonts in this priority order:
1. UnifrakturMaguntia
2. Fette Fraktur
3. Fraktur
4. Old English Text MT
5. Blackletter
6. cursive (fallback)

## Development

To regenerate icons:
```bash
npm install canvas
node generate-icons.js
```

## License

Public domain. Use freely.
