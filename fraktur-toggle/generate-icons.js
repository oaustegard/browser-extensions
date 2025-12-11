#!/usr/bin/env node

// Simple icon generator using Canvas
// Run: npm install canvas && node generate-icons.js

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  try {
    const { createCanvas } = require('canvas');

    const sizes = [16, 32, 48, 128];
    const iconsDir = path.join(__dirname, 'icons');

    for (const size of sizes) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#2c3e50';
      const radius = size * 0.125;
      roundRect(ctx, 0, 0, size, size, radius);
      ctx.fill();

      // Text
      ctx.fillStyle = '#ecf0f1';
      ctx.font = `bold italic ${size * 0.56}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('𝔉', size / 2, size / 2 + size * 0.05);

      // Save
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
      console.log(`Generated icon${size}.png`);
    }

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    console.log('\nTo generate icons, run:');
    console.log('  npm install canvas');
    console.log('  node generate-icons.js');
    console.log('\nOr manually create PNG files from icons/icon.svg');
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
