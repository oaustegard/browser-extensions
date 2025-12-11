# Demo Bookmarklets

This folder contains example bookmarklets that demonstrate the features of the Bookmarklet Runner extension.

## Included Examples

### Basic Examples

- **hello_world.js** - Simple alert demonstrating basic bookmarklet structure
- **demo_highlight_links.js** - Highlights all links on a page (demonstrates DOM manipulation)
- **demo_word_count.js** - Counts words and characters on the current page

### Domain-Specific Example

- **github_stars.js** - Shows star count on GitHub repository pages
  - Uses `@domains: github.com` to only appear on GitHub
  - Includes a companion README file demonstrating documentation

### Grouped Examples (utils_*)

These bookmarklets share the `utils_` prefix and will automatically be grouped together:

- **utils_copy_title.js** - Copy page title to clipboard
- **utils_copy_url.js** - Copy current URL to clipboard
- **utils_scroll_to_top.js** - Smooth scroll to top of page

## Metadata Features Demonstrated

### @title
All bookmarklets use custom titles instead of filenames:
```javascript
/* @title: Hello World */
```

### @description
Each bookmarklet includes a description that appears in the extension:
```javascript
/* @description: Display a simple greeting message */
```

### @domains
The GitHub bookmarklet demonstrates domain filtering:
```javascript
/* @domains: github.com */
```

This makes the bookmarklet only appear when you're on GitHub, reducing clutter.

### Companion README Files

The `github_stars.js` bookmarklet includes a README file (`github_stars_README.md`) that provides detailed documentation. The extension automatically detects these files and shows a 📖 link next to the bookmarklet.

## Auto-Grouping

Bookmarklets with common prefixes (like `utils_*` or `demo_*`) are automatically grouped into collapsible sections when there are 3 or more with the same prefix. This helps organize large collections of bookmarklets.

## Testing This Folder

To test these demo bookmarklets:

1. Open the extension options (right-click the extension icon → Options)
2. Change the repository settings to:
   - **GitHub Owner**: `oaustegard`
   - **Repository Name**: `bookmarklet-runner-extension`
   - **Folder Path**: `demo-bookmarklets`
3. Click "Save Settings"
4. Open the extension (Alt+B) to see the demo bookmarklets

## Creating Your Own Bookmarklets

Use these examples as templates for creating your own bookmarklets. Follow the metadata format to take advantage of all the extension's features!
