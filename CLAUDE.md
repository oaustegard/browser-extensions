# CLAUDE.md - Instructions for AI Assistant

**IMPORTANT**: This file contains imperative instructions for you (Claude). YOU are the audience. Write all content in CLAUDE.md as direct commands to future assistants, not as README documentation for humans.

## Repository Structure

Understand that this repository contains browser extensions with one extension per folder in the root directory:

```
browser-extensions/
├── extension-one/
│   ├── manifest.json
│   └── ...
├── extension-two/
│   └── ...
```

## Extension Organization Rules

When creating or modifying extensions:
- Keep each extension self-contained in its own directory
- Ensure every extension has a `manifest.json` file
- Place icons, scripts, HTML, CSS, and assets within the extension folder
- Don't create cross-extension dependencies

## Building and Releasing Extensions

The GitHub Actions release workflow (`.github/workflows/release-extension.yml`) creates releases for individual extensions. The workflow:

**Triggers:**
- Automatically when a `manifest.json` file changes on main branch
- Manually via workflow_dispatch with extension folder name input

**Process:**
1. Detects the extension (from changed file or manual input)
2. Extracts version from `manifest.json`
3. Creates a zip file of the extension folder
4. Creates a GitHub release tagged as `{extension-name}-v{version}`
5. Attaches the zip to the release

**Release Tags:**
- Format: `extension-name-v1.2.3`
- Example: `my-extension-v1.0.0`
- Each extension has independent versioning

**Manual Release:**
Use GitHub Actions UI to trigger manually:
1. Go to Actions → Release Extension → Run workflow
2. Enter the extension folder name
3. Workflow creates release from current state

## Communication Guidelines

- **Be succinct** - Don't waste output tokens with post-commit summaries
- **Concise PRs** - Keep PR descriptions brief
- **No explanations** - The chat log and diffs speak for themselves
- Skip "what I did" recaps after completing work

## Development Context

- Each extension is independent
- **Always use Manifest V3** for all extensions
- Users will load extensions in developer/unpacked mode
