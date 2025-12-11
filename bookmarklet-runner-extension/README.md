# Bookmarklet Runner Chrome Extension

Run bookmarklets from any GitHub repository directly without adding them to your bookmarks bar. Configure it to use your own bookmarklet collection or try the demo bookmarklets included in this repo!

## Features

- **One-click execution**: Run any bookmarklet on the current page instantly
- **Domain filtering**: Bookmarklets with `@domains` metadata only appear on matching sites, and are hoisted to the top of the list. Supports wildcards (e.g., `*jira*`)
- **Auto-grouping**: Bookmarklets with common prefixes (e.g., `bsky_*`) are grouped into collapsible sections (collapsed by default)
- **Search**: Filter bookmarklets by name, description, or filename
- **README links**: Bookmarklets with companion README files show a 📖 link
- **Keyboard navigation**: 
  - `Alt+B` opens the extension
  - `↓` from search moves to first item
  - `↑/↓` navigates the list (including group headers)
  - `←/→` collapses/expands groups
  - `Enter` executes bookmarklet or toggles group
  - `Esc` returns focus to search
- **Persistent state**: Manually expanded groups stay expanded between sessions
- **Auto-caching**: Fetches from GitHub once per hour, cached locally

## Quick Start

The extension comes pre-configured with demo bookmarklets - just install and press `Alt+B` to try them out!

### Use Your Own Repository

1. Right-click the extension icon and select **Options**
2. Enter your GitHub repository details:
   - **GitHub Owner**: Your username or organization
   - **Repository Name**: The repo containing your bookmarklets
   - **Folder Path**: (optional) Subfolder path if bookmarklets aren't in the root
3. Click **Save Settings**
4. Open the extension with `Alt+B`

The extension defaults to [oaustegard/bookmarklets](https://github.com/oaustegard/bookmarklets) - a collection of useful bookmarklets for various websites.

## Creating Bookmarklets

### File Structure

Each bookmarklet is a `.js` file in your repository:

```
your-repo/
├── hello_world.js
├── github_stars.js
├── github_stars_README.md  ← Optional documentation
├── utils_copy_title.js     ← Auto-grouped by "utils_" prefix
├── utils_copy_url.js
└── utils_scroll_to_top.js
```

### Bookmarklet Metadata

Add optional metadata to your bookmarklets using special comment tags:

```javascript
javascript:
/* @title: My Bookmarklet Name */
/* @description: What this bookmarklet does */
/* @domains: example.com, *jira* */
(function() {
  // Your code here
})();
```

#### Metadata Tags

All tags are optional but highly recommended:

**@title** - Display name in the extension
- Defaults to filename with underscores replaced by spaces
- Example: `/* @title: Count GitHub Stars */`

**@description** - Brief description shown below the title
- Appears as subtitle in the extension UI
- Defaults to first comment line or "Run {title}"
- Example: `/* @description: Show the number of stars on a GitHub repository */`

**@domains** - Domain filtering
- Comma-separated list of domains where this bookmarklet should appear
- When specified, bookmarklet **only appears** on matching sites
- Bookmarklets without `@domains` appear everywhere
- Supports wildcards for flexible matching:

| Pattern | Matches | Example Domains |
|---------|---------|-----------------|
| `github.com` | Exact domain | `github.com`, `www.github.com` |
| `*jira*` | Contains "jira" | `company.jira.com`, `jira.atlassian.net`, `myjira.example.com` |
| `jira*` | Starts with "jira" | `jira.company.com` |
| `*jira` | Ends with "jira" | `company.jira` |

Mix patterns: `/* @domains: github.com, *jira*, *confluence* */`

### README Documentation

Create detailed documentation for your bookmarklets by adding README files:

**Naming Convention:**
- `bookmarklet_name.js` → `bookmarklet_name_README.md`
- Alternative: `bookmarklet_name.README.md`

**Example:**
```
github_stars.js
github_stars_README.md  ← Extension shows 📖 link
```

The extension automatically detects README files and displays a 📖 link next to the bookmarklet. Clicking it opens the documentation on GitHub.

See [demo-bookmarklets/github_stars_README.md](demo-bookmarklets/github_stars_README.md) for an example.

### Auto-Grouping

Bookmarklets with common prefixes automatically group into collapsible sections:

```
utils_copy_title.js    ┐
utils_copy_url.js      ├─ Grouped as "utils"
utils_scroll_to_top.js ┘

demo_highlight_links.js  ┐
demo_word_count.js       ├─ Grouped as "demo"
demo_image_viewer.js     ┘
```

**Requirements:**
- 3+ bookmarklets with same prefix
- Prefix separated by underscore (e.g., `prefix_name.js`)
- Groups collapse by default to reduce clutter

## Installation

### Download Release (Recommended)

Download the latest release from the [Releases page](https://github.com/oaustegard/bookmarklet-runner-extension/releases) and follow the installation instructions included with the release.

### From Source (Development)

For development or contributing:

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the repository folder
6. The extension icon will appear in your toolbar

### Set keyboard shortcut (optional)

1. Go to `chrome://extensions/shortcuts`
2. Find "Bookmarklet Runner" 
3. Set your preferred shortcut (default: `Alt+B`)

### Pin the extension (recommended)

1. Click the puzzle piece icon in Chrome toolbar
2. Click the pin icon next to "Bookmarklet Runner"

## Usage

1. Navigate to any webpage
2. Press `Alt+B` or click the extension icon
3. Search or scroll to find your bookmarklet
4. Click or press Enter to execute

## Limitations

- Cannot run on `chrome://`, `chrome-extension://`, or `edge://` pages (browser restriction)
- Some bookmarklets may fail on pages with strict Content Security Policy (CSP)
- Requires internet connection to initially fetch bookmarklets (cached afterward)

## Configuration

The extension can be configured to work with any GitHub repository:

1. Right-click the extension icon → **Options**
2. Enter your repository details
3. Click **Save Settings**

Settings are stored locally and persist between browser sessions. The extension caches bookmarklets for 1 hour to reduce API calls.

## License

MIT
