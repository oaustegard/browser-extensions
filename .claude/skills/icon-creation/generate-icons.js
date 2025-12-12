#!/usr/bin/env node

// Simple icon generator using Canvas
// Run: npm install canvas && node generate-icons.js [text] [bgColor] [textColor]
// Examples:
//   node generate-icons.js "A"
//   node generate-icons.js "🎨"
//   node generate-icons.js "X" "#1a1a1a" "#00ff00"

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  try {
    const { createCanvas } = require('canvas');

    // Parse command-line arguments
    const text = process.argv[2] || 'T';
    const bgColor = process.argv[3] || '#2c3e50';
    const textColor = process.argv[4] || '#ecf0f1';

    // Detect if text is emoji (simplified check)
    const isEmoji = /[\p{Emoji}\u200d]/u.test(text);
    const fontFamily = isEmoji ? 'sans-serif' : 'sans-serif';

    const sizes = [16, 32, 48, 128];
    const outputDir = process.cwd();

    console.log(`Generating icons with text: "${text}"`);
    console.log(`Background: ${bgColor}, Text: ${textColor}`);

    for (const size of sizes) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = bgColor;
      const radius = size * 0.125;
      roundRect(ctx, 0, 0, size, size, radius);
      ctx.fill();

      // Text
      ctx.fillStyle = textColor;
      ctx.font = `bold ${size * 0.56}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, size / 2, size / 2 + size * 0.05);

      // Save
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(path.join(outputDir, `icon${size}.png`), buffer);
      console.log(`Generated icon${size}.png`);
    }

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    console.log('\nTo generate icons, run:');
    console.log('  npm install canvas');
    console.log('  node generate-icons.js [text] [bgColor] [textColor]');
    console.log('\nExamples:');
    console.log('  node generate-icons.js "A"');
    console.log('  node generate-icons.js "🎨"');
    console.log('  node generate-icons.js "X" "#1a1a1a" "#00ff00"');
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

generateIcons();
