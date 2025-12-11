# Claude Usage Monitor

Browser extension that displays your Claude.ai usage limits via a dynamic icon badge.

## Features

- **Dynamic Visual Icon**: Horizontal thermometer bar shows usage percentage
- **Color-Coded Status**: Green → Yellow → Red as you approach limits
- **Auto-Refresh**: Updates every 5 minutes
- **Hover Details**: Tooltip shows usage percentage + reset time
- **Click to View**: Click icon to open full usage details page

## Installation

### Chrome/Edge (Developer Mode)

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `claude-usage-extension` folder
5. Extension icon appears in toolbar

### First Use

1. Visit `https://claude.ai` (must be logged in)
2. Extension fetches your org ID automatically
3. Badge updates within 5 minutes (or reload extension to force immediate update - you can also edit the `POLL_INTERVAL_MINUTES` value in background.js - can be as low as 1)  

## What You'll See

### Dynamic Icon + Badge
- **Thermometer Bar**: Horizontal bar fills left-to-right as usage increases
- **Claude Orange Frame**: Orange border contains the usage bar (top half of icon)
- **Badge Text**: Orange percentage badge below the thermometer (e.g., "45%")
- **Green Bar**: < 50% capacity
- **Yellow Bar**: 50-80% capacity  
- **Red Bar**: > 80% capacity
- **Gray "!"**: Error state (check console logs)

### Hover Tooltip
```
Claude Usage Monitor
22% used
Resets at 9:59 PM
```

### Click Action
Clicking the extension icon opens `https://claude.ai/settings/usage` in a new tab.

## How It Works

1. Fetches your organization ID from `claude.ai/api/bootstrap` (cached)
2. Polls `claude.ai/api/organizations/{orgId}/usage` every 5 minutes
3. Generates dynamic icon using OffscreenCanvas with thermometer bar design
4. Updates icon bar color based on `five_hour.utilization` (percentage)
5. Displays percentage in orange badge text below the thermometer
6. Uses browser's authenticated session (cookies) - no API key needed
7. Clicking icon opens full usage details at `claude.ai/settings/usage`

## Troubleshooting

**Badge shows "!"**
- Check browser console (F12 → Console)
- Ensure you're logged into claude.ai
- Try visiting claude.ai in a tab first

**Badge not updating**
- Right-click extension icon → Inspect service worker
- Check console for errors
- Try reloading extension

**Wants to customize polling interval**
- Edit `POLL_INTERVAL_MINUTES` in `background.js`
- Minimum: 1 minute (Chrome limitation)

## Files

```
claude-usage-extension/
├── manifest.json       # Extension config (V3)
├── background.js       # Service worker with polling logic
├── icon.png           # Static icon for management UI
└── error-icon.png     # Error state icon
```

## Releasing a New Version

This repository uses a GitHub Action to automatically create a release and package the extension into a `claude-usage-monitor.zip` file.

To create a new release:

1.  **Commit your changes:** Make sure all your changes are committed to the `main` branch.
2.  **Tag the new version:** Use a tag that starts with `v`, for example:
    ```bash
    git tag v1.0.1
    ```
3.  **Push the tag:**
    ```bash
    git push origin v1.0.1
    ```

Pushing the tag will trigger the GitHub Action, which will create a new release on the Releases page with the packaged `.zip` file.

## Privacy

- All requests made directly from your browser to claude.ai
- No external servers or data collection
- Org ID cached locally in extension storage
- Uses your existing claude.ai authentication

## Limitations

- Polls every 5 minutes (can't be faster than 1 minute due to Chrome alarm limitations)
- Only monitors `five_hour` window (other windows like `seven_day` not displayed)
- Badge text may truncate on some browsers if percentage > 99%

