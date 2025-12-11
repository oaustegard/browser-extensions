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

## Building Extensions

A GitHub Actions release workflow (TBD) will create zip files for each extension. The action will:
1. Detect all extension folders in root
2. Create a zip file per extension
3. Attach zips to GitHub releases

When asked to implement this:
- Detect extensions by presence of `manifest.json` in root-level folders
- Create distributable zips for unpacked browser loading
- Make the workflow automatic on releases

## Communication Guidelines

- **Be succinct** - Don't waste output tokens with post-commit summaries
- **Concise PRs** - Keep PR descriptions brief
- **No explanations** - The chat log and diffs speak for themselves
- Skip "what I did" recaps after completing work

## Development Context

- Extensions are experimental/"vibe coded"
- Each extension is independent
- Manifest versions (V2/V3) may vary by extension
- Users will load extensions in developer/unpacked mode
