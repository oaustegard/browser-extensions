# GitHub Stars Counter

This bookmarklet displays the number of stars a GitHub repository has received.

## Usage

1. Navigate to any GitHub repository page (e.g., https://github.com/owner/repo)
2. Run this bookmarklet from the Bookmarklet Runner
3. An alert will display the star count

## Domain Filtering

This bookmarklet uses the `@domains` metadata tag:

```javascript
/* @domains: github.com */
```

This means it will **only appear** in the Bookmarklet Runner when you're on `github.com`. This prevents clutter by hiding domain-specific tools when they're not relevant.

## How It Works

The bookmarklet searches for GitHub's star count element in the page DOM and extracts the number of stars. If you're not on a repository page, it will show a helpful error message.

## Example

Try it on this repository:
- https://github.com/oaustegard/bookmarklet-runner-extension
