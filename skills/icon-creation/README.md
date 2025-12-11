# Icons

To generate PNG icons from the SVG:

## Using Inkscape (recommended)
```bash
inkscape icon.svg -w 16 -h 16 -o icon16.png
inkscape icon.svg -w 32 -h 32 -o icon32.png
inkscape icon.svg -w 48 -h 48 -o icon48.png
inkscape icon.svg -w 128 -h 128 -o icon128.png
```

## Using ImageMagick
```bash
convert -background none icon.svg -resize 16x16 icon16.png
convert -background none icon.svg -resize 32x32 icon32.png
convert -background none icon.svg -resize 48x48 icon48.png
convert -background none icon.svg -resize 128x128 icon128.png
```

## Online tool
Upload `icon.svg` to https://cloudconvert.com/svg-to-png and export at different sizes.

## Using Chrome
1. Open `icon.svg` in Chrome
2. Right-click → Inspect
3. In console, use canvas to export at different sizes
4. Or simply take screenshots at the required sizes

The icon is a stylized Fraktur "𝔉" on a dark background.
