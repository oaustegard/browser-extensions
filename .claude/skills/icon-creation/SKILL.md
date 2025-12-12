---
name: icon-creation
description: Generate browser extension icons at multiple sizes (16x16, 32x32, 48x48, 128x128) from SVG files. Use when creating new extension icons, converting SVG to PNG icons, or when user mentions extension icons, icon generation, or icon sizes.
---

# Icon Creation for Browser Extensions

This Skill helps generate browser extension icons at the required sizes from SVG source files.

## When to Use This Skill

Use this Skill when:
- Creating icons for a new browser extension
- Converting SVG designs to PNG icons at multiple sizes
- User mentions "extension icon", "icon generation", or "icon sizes"
- Need to generate 16x16, 32x32, 48x48, and 128x128 PNG icons

## Quick Start

1. **Create or edit icon.svg** - Design your icon in SVG format
2. **Generate PNGs** using one of these methods:
   - Node.js: `node generate-icons.js` (requires: `npm install canvas`)
   - See [README.md](README.md) for alternative methods (Inkscape, ImageMagick, online tools)

## Icon Size Requirements

Browser extensions require icons at these sizes:
- **16x16** - Browser toolbar (smallest)
- **32x32** - Browser toolbar (retina displays)
- **48x48** - Extension management page
- **128x128** - Chrome Web Store and extension installation

## Design Tips

- **Use the full 128x128 canvas** - Make primary elements large and bold
- **Test at 16x16** - Ensure icon is readable at smallest size
- **Simple, bold shapes** - Avoid thin lines that disappear when scaled down
- **High contrast** - Ensure icon stands out on light and dark backgrounds

## Generation Methods

### Method 1: Node.js Script (Recommended)
```bash
npm install canvas
node generate-icons.js
```

### Method 2: Other Tools
For Inkscape, ImageMagick, or online tools, see [README.md](README.md).

## Complete Documentation

- [USAGE.md](USAGE.md) - Full usage documentation and framework details
- [README.md](README.md) - Alternative generation methods

## Example Workflow

1. Copy `icon.svg` from this directory to your extension folder
2. Edit the SVG to match your extension's purpose
3. Run `node generate-icons.js` in the extension directory
4. Reference the generated icons in your `manifest.json`:
   ```json
   "icons": {
     "16": "icon16.png",
     "32": "icon32.png",
     "48": "icon48.png",
     "128": "icon128.png"
   }
   ```
