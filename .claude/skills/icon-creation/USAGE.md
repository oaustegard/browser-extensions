# Icon Creation Framework

This framework generates browser extension icons at multiple sizes from a single design.

## Quick Start

1. **Edit icon.svg** - Modify the SVG to create your icon design
2. **Run generator**: `node generate-icons.js` (requires: `npm install canvas`)
3. **Alternative methods** - See README.md for other generation options (Inkscape, ImageMagick, etc.)

## Files

- `generate-icons.js` - Node.js script that generates 16x16, 32x32, 48x48, and 128x128 PNG icons
- `icon.svg` - Template SVG source file
- `README.md` - Multiple methods for converting SVG to PNG at various sizes

## Design Tips

- Use the full 128x128 canvas - make primary elements large and visible
- Test icon readability at 16x16 (smallest toolbar size)
- Use simple, bold shapes for better scaling
- Avoid thin lines that disappear at small sizes

## Usage for New Extensions

Copy this folder to your extension directory or reference these files when creating new extension icons.
