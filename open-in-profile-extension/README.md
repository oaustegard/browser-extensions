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

First, **put this folder somewhere permanent** (e.g. `~/chrome-extensions/open-in-profile-extension`)
— not Downloads or a temp dir. Step 3 records the absolute path to the host
script, so if you move the folder later you must re-run it.

`native-host/` is the subfolder right inside this one — it contains the host
script and `install.py`. After cloning the repo it's at
`open-in-profile-extension/native-host/`; in the release zip it's inside the
unzipped folder.

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this `open-in-profile-extension/` folder (the one with `manifest.json`).
2. Copy the **extension ID** shown on its card.
3. Open a terminal in the `native-host/` subfolder and register the host
   (writes the native-messaging manifest for your OS, plus a registry key on
   Windows):
   ```bash
   cd open-in-profile-extension/native-host

   python3 install.py <extension-id>     # macOS / Linux
   python  install.py <extension-id>     # Windows
   ```
4. Reload the extension (↻ on its card), then right-click a link.

> **If the menu says "native host not found":** re-run `install.py` with the
> current extension ID. The ID changes when you reload unpacked from a
> different path, and the recorded host path breaks if you moved the folder
> after installing.

Uninstall: from `native-host/`, run `python3 uninstall.py` (then remove the
extension at `chrome://extensions`).

## Protocol

Native messaging = 4-byte little-endian length prefix + UTF-8 JSON:

```
→ {"action":"list"}
← {"ok":true,"profiles":[{"dir":"Default","name":"Personal"}, ...]}
→ {"action":"open","profile":"Profile 2","url":"https://example.com"}
← {"ok":true}     # host spawns: chrome --profile-directory="Profile 2" <url>
```

## Notes

- **Colored dots, not avatars.** Chrome's `contextMenus` API can't render
  images in menu items (Firefox's `menus` API can; Chrome's can't), so each
  profile gets a colored dot — Chrome's own avatar color when the host can read
  it from `Local State`, otherwise a stable color derived from the profile.
- Targets Chrome **Stable**'s user-data dir and binary; edit `user_data_dir()`
  / `chrome_binary()` in the host for Beta/Canary.
- Unpacked/dev-mode by design — the Web Store disallows the broad native host
  this relies on.
