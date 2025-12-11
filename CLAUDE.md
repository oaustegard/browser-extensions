# CLAUDE.md - Browser Extensions Repository

## Repository Structure

This repository contains a collection of browser extensions, organized with one extension per folder in the root directory.

```
browser-extensions/
├── extension-one/
│   ├── manifest.json
│   ├── icons/
│   ├── scripts/
│   └── ...
├── extension-two/
│   ├── manifest.json
│   ├── icons/
│   ├── scripts/
│   └── ...
└── ...
```

## Extension Organization

Each extension should be self-contained within its own directory, including:
- `manifest.json` - Extension manifest file (required)
- Icons and assets
- JavaScript files
- HTML files (popup, options, etc.)
- CSS stylesheets
- Any extension-specific documentation

## Development Workflow

### Local Development

Each extension can be loaded directly into your browser in developer/unpacked mode:

**Chrome/Edge:**
1. Navigate to `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" toggle
3. Click "Load unpacked"
4. Select the extension's folder from this repository

**Firefox:**
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file within the extension's folder (typically `manifest.json`)

### Building Extensions

**Status: TBD**

A GitHub Actions release workflow will be implemented to automatically create distributable zip files for each extension. This will allow for:
- Automated packaging of extensions
- Version management
- Easy distribution for local installation
- Optional submission preparation for browser extension stores

The release action will:
1. Detect all extension folders in the root directory
2. Create a zip file for each extension
3. Attach the zip files to GitHub releases

## Contributing

When adding a new extension:
1. Create a new folder in the repository root
2. Ensure it contains a valid `manifest.json`
3. Follow browser extension best practices
4. Update this documentation if needed

## Notes

- Extensions are primarily "vibe coded" - experimental and for learning purposes
- Each extension is independent and can be developed/deployed separately
- Manifest version (V2 vs V3) may vary by extension - check individual manifests
