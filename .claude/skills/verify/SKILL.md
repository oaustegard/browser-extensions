---
name: verify
description: Load the Claude Usage Monitor extension unpacked in headless Chromium, open claude.ai, and check that the usage badge appears with the right text, colour and tooltip. Run before every commit that touches claude-usage-extension/, and whenever a change to it is called done.
---

# Verify: Claude Usage Monitor

Run from the repo root:

```bash
node .claude/skills/verify/claude-usage.mjs
```

It exits 0 and prints `OK: 3/3` when the extension works. It takes about 1.5 s.
To check a copy of the extension somewhere else, pass its folder:
`node .claude/skills/verify/claude-usage.mjs path/to/claude-usage-extension`.

## What it does

1. Launches the Chromium that Playwright ships, in its new headless mode
   (`channel: 'chromium'`), with the extension loaded unpacked through
   `--load-extension`. The headless shell cannot load extensions; if the
   service worker never appears, that is the cause.
2. Stubs `https://claude.ai/**` with `context.route`. `/api/bootstrap` and
   `/api/organizations/<org>/usage` return fixtures, and every other path
   returns a stub page. `claude.ai` resolves nowhere
   (`--host-resolver-rules`), so no request reaches the real site and no login
   is needed.
3. Opens `https://claude.ai/` in a tab and waits for the extension's startup poll
   to finish. Then it clears the extension's storage and calls the service
   worker's own `fetchAndUpdateUsage()`, so the poll under test goes through the
   extension's real fetch path to the stub.
4. Reads the badge text, the badge colour, the tooltip and the cached org id
   through `chrome.action` and `chrome.storage`.

## Scenarios

| scenario | checks |
|---|---|
| chat org listed second, behind an API-only org | badge `42%`, green, the tooltip shows 5-hour and weekly; `/usage` is requested for the chat org (the stub returns 403 for the other one) |
| weekly usage far over pace | badge `7%`, red, the tooltip says "over pace" |
| a good poll, then the session expires (401) | badge cleared, the error tooltip shown, the cached org id removed |

## Stress test (2026-11-18)

- 30 sequential runs: 30/30 passed, 51 s in total.
- 4 runners at once, 5 runs each: 20/20 passed.
- Planted defects, each run against a patched copy: always picking
  `memberships[0]`, dropping `%` from the badge, a weekly-pace threshold
  that never turns red, an error state that keeps the old badge, and a 401
  that keeps the cached org. Each one fails at least one scenario.

## Limits

The stubs encode the API shape as of the code in `background.js`. If
claude.ai changes `/api/bootstrap` or `/usage`, this check still passes, and
only the extension loaded in Oskar's logged-in Chrome would show the break. When
a change depends on the live response shape, say that in the commit's
`Verified:` line.

## Adding another extension

Copy `claude-usage.mjs` to `<extension>.mjs`, keep the launch block (new
headless, `--load-extension`, `--host-resolver-rules` for each host it calls,
`context.route` stubs), and add a row and command here.
