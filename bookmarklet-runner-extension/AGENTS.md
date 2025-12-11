# Agent Development Guide

This document provides guidance for AI agents (like Claude) working on the Bookmarklet Runner Extension project.

## Project Overview

**Bookmarklet Runner Extension** is a Chrome extension (Manifest V3) that allows users to run bookmarklets from GitHub repositories without manually adding them to their bookmarks bar. Users can configure repositories containing bookmarklets and execute them with a single click.

### Key Features
- Load bookmarklets from any public GitHub repository
- Keyboard shortcut support (Alt+B)
- Repository configuration dialog
- Pre-configured with demo bookmarklets (fetched from this repo's `demo-bookmarklets/` folder on GitHub)
- CSP-compliant execution using `eval()` (matches real bookmarklet behavior)

## Project Structure

```
bookmarklet-runner-extension/
├── manifest.json           # Extension manifest (version source of truth)
├── popup.html/js          # Main extension popup UI
├── options.html/js/css    # Settings/configuration page (defaults to demo bookmarklets)
├── icons/                 # Extension icons (16, 32, 48, 128)
├── demo-bookmarklets/     # Demo bookmarklets (in repo, NOT in releases; fetched from GitHub)
├── .github/
│   ├── workflows/
│   │   └── extension-release.yml    # Automated release workflow
│   └── scripts/
│       └── release-extension.sh     # Release packaging script
├── AGENTS.md              # This file (agent development guide, in repo but NOT in releases)
├── CLAUDE.md              # Claude-specific entry point (in repo but NOT in releases)
└── README.md              # User-facing documentation (in repo but NOT in releases)
```

## Version Management

**IMPORTANT**: The version in `manifest.json` is the **single source of truth** for the extension version.

- Current version format: Semantic versioning (e.g., `2.0.2`)
- When making changes, determine the scope of change and increment the version accordingly
- When incrementing version: Only update `manifest.json`
- The release workflow reads from `manifest.json` automatically

## Development Workflow

### Making Changes

1. **Read before editing**: Always read existing code before making changes
2. **Test locally**: The extension can be loaded unpacked in Chrome for testing:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory
3. **Follow Manifest V3**: This extension uses Manifest V3 APIs
   - Use `chrome.scripting.executeScript()` for code injection
   - Storage API: `chrome.storage.sync`
   - No remote code execution except via eval (for bookmarklets)

### Key Implementation Details

#### Bookmarklet Execution
- Bookmarklets are executed using `eval()` to match browser behavior
- This is necessary because CSP (Content Security Policy) on some sites blocks Function constructors
- See `popup.js` for the execution implementation

#### Storage Format
```javascript
{
  repo_config: {
    repoOwner: 'oaustegard',  // defaults to 'oaustegard'
    repoName: 'bookmarklet-runner-extension',  // defaults to 'bookmarklet-runner-extension'
    folderPath: 'demo-bookmarklets'  // defaults to 'demo-bookmarklets'
  }
}
```

The extension comes pre-configured with demo bookmarklets from this repository. Users can change these settings via the Options page.

#### GitHub API Integration
- Uses GitHub REST API v3
- Fetches repository contents from `https://api.github.com/repos/{owner}/{repo}/contents/{path}`
- Raw file content from `https://raw.githubusercontent.com`
- No authentication required for public repositories

### Testing Changes

1. **Manual Testing**:
   - Load the unpacked extension in Chrome
   - Test the popup (Alt+B or click extension icon) - should load demo bookmarklets by default
   - Test the options page - should show demo bookmarklet config as defaults
   - Try running demo bookmarklets (they're fetched from GitHub, not bundled)
   - Test on pages with strict CSP (like GitHub)

2. **Test Scenarios**:
   - Verify demo bookmarklets load on first run (no configuration needed)
   - Add a new repository configuration
   - Run various bookmarklets
   - Test keyboard shortcuts
   - Verify error handling for invalid repos

## Release Process

### Automated Releases

The project uses GitHub Actions for automated releases:

1. **Trigger**: Pushing changes to `manifest.json` on `main` branch
2. **Process**:
   - Workflow detects version change
   - Runs `release-extension.sh` script
   - Creates ZIP file with extension files
   - Creates GitHub release with tag `v{version}`
   - Attaches ZIP file to release

3. **Manual Trigger**: Can also manually trigger via GitHub Actions UI

### Creating a New Release

To create a new release:

1. Update version in `manifest.json`
2. Commit changes to a feature branch
3. Create PR and merge to `main`
4. Workflow automatically creates the release
5. Users can download ZIP from GitHub Releases

### Release Script Details

The script (`release-extension.sh`):
- Validates semantic versioning
- Packages only necessary files (excludes docs, demo-bookmarklets, .git, etc.)
- Files excluded from releases (but kept in repo):
  - `AGENTS.md` and `CLAUDE.md` (agent documentation)
  - `README.md` and `LICENSE` (included in release notes instead)
  - `demo-bookmarklets/` (fetched from GitHub, not bundled)
  - `.github/` (workflow and scripts)
- Generates release notes with:
  - Installation instructions
  - README excerpt
  - Recent commit history
- Prevents duplicate releases

## Code Style and Best Practices

### JavaScript
- Use modern ES6+ syntax
- Prefer `const` and `let` over `var`
- Use async/await for asynchronous operations
- Handle errors gracefully with try/catch
- Provide user-friendly error messages

### HTML/CSS
- Semantic HTML5 elements
- Responsive design considerations
- Accessible UI elements
- Clean, maintainable CSS

### Extension-Specific
- Always check for required permissions
- Handle API rate limits gracefully
- Provide feedback for long-running operations
- Use Chrome extension APIs appropriately

## Common Tasks

### Adding a New Bookmarklet Feature

1. Identify what data is needed
2. Update `popup.js` for UI changes
3. Update `options.js` if configuration is needed
4. Test with demo bookmarklets
5. Update README if user-facing

### Modifying Repository Configuration

1. Update storage schema in both `popup.js` and `options.js`
2. Handle migration if changing existing data structure
3. Update options UI if needed
4. Test with existing configurations

### Fixing Bugs

1. Reproduce the bug
2. Identify the root cause
3. Implement minimal fix
4. Test thoroughly
5. Consider edge cases

## Security Considerations

- **CSP Compliance**: Extension must work on sites with strict CSP
- **XSS Prevention**: Sanitize any user input before display
- **API Security**: No sensitive data in storage or code
- **Eval Usage**: Only used for bookmarklet code (unavoidable for functionality)

## Known Limitations

- Only works with public GitHub repositories
- Requires Developer mode to install (not published to Chrome Web Store)
- Bookmarklets must be single `.js` files
- No built-in bookmarklet editor

## Resources

- [Chrome Extension Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Bookmarklet Best Practices](https://en.wikipedia.org/wiki/Bookmarklet)

## Getting Help

- Check `README.md` for user documentation
- Review `manifest.json` for extension configuration
- Examine `popup.js` and `options.js` for implementation details
- Look at `demo-bookmarklets/` folder for example bookmarklets (in repo only, fetched from GitHub in production)

## Guidelines for AI Agents

1. **Always read files before editing**: Use the Read tool before making any changes
2. **Test changes**: Describe how changes can be tested
3. **Maintain simplicity**: Don't over-engineer solutions
4. **Respect version source**: Only `manifest.json` contains the version
5. **Follow existing patterns**: Match the code style and architecture already in place
6. **Document breaking changes**: If changing APIs or storage format, note migration needs
7. **Consider users**: Remember this is loaded as an unpacked extension by end users

## Version History Reference

- `2.0.0`: Current version with repository configuration dialog
- `1.x`: Earlier versions (see git history)

---

*This document should be updated as the project evolves.*
