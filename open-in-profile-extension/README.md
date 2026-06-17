# open-in-profile-extension

Right-click any link → **Open link in profile** → pick a Chrome profile. The
link opens in that profile's window.

## Why it needs a native host

A Chrome extension can only act within its *own* profile — `chrome.tabs` /
`chrome.windows` have no API to open a URL in a different profile. The only
mechanism that switches profiles is launching the binary with
`--profile-directory`, which extensions can't do. So this ships two parts:

- **Extension** (this folder) — builds the right-click profile submenu.
- **Native host** (`native-host/profile_switcher_host.py`) — enumerates
  profiles from Chrome's `Local State` (auto-discovers friendly names) and
  runs `chrome --profile-directory=<dir> <url>`, via Chrome's
  [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

A **↻ Refresh profile list** item in the submenu picks up new profiles without
reloading.

## Requirements

Google Chrome (or Chromium) and **Python 3** on `PATH` (`python3` on
macOS/Linux, `python` on Windows).

## Install

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this `open-in-profile-extension/` folder.
2. Copy the **extension ID** shown on its card.
3. From `native-host/`, register the host (writes the manifest for your OS,
   and a registry key on Windows):
   ```bash
   python3 install.py <extension-id>     # macOS / Linux
   python  install.py <extension-id>     # Windows
   ```
4. Reload the extension (↻ on its card), then right-click a link.

> The extension ID changes if you reload unpacked from a different path. If the
> menu shows "native host not found", re-run `install.py` with the current ID.

Uninstall: `python3 native-host/uninstall.py` (then remove the extension).

## Protocol

Native messaging = 4-byte little-endian length prefix + UTF-8 JSON:

```
→ {"action":"list"}
← {"ok":true,"profiles":[{"dir":"Default","name":"Personal"}, ...]}
→ {"action":"open","profile":"Profile 2","url":"https://example.com"}
← {"ok":true}     # host spawns: chrome --profile-directory="Profile 2" <url>
```

## Notes

- Targets Chrome **Stable**'s user-data dir and binary; edit `user_data_dir()`
  / `chrome_binary()` in the host for Beta/Canary.
- Unpacked/dev-mode by design — the Web Store disallows the broad native host
  this relies on.
