#!/usr/bin/env python3
"""Cross-platform installer for the native messaging host.

Registers profile_switcher_host.py with Chrome so the extension is allowed to
call it. Run AFTER loading the unpacked extension (you need its ID):

    python3 install.py <extension-id>

macOS / Linux: writes a manifest into Chrome's NativeMessagingHosts dir.
Windows:       writes a .bat wrapper + manifest, registers it in HKCU.
"""

import json
import os
import platform
import stat
import sys

HOST_NAME = "com.muninn.profile_switcher"


def make_executable(path):
    mode = os.stat(path).st_mode
    os.chmod(path, mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("Usage: python3 install.py <extension-id>")
        print("Find the ID at chrome://extensions (Developer mode -> Load unpacked -> copy ID).")
        sys.exit(1)

    ext_id = sys.argv[1].strip().strip("/")
    here = os.path.dirname(os.path.abspath(__file__))
    host_py = os.path.join(here, "profile_switcher_host.py")
    system = platform.system()
    home = os.path.expanduser("~")

    if system == "Windows":
        host_path = os.path.join(here, "profile_switcher_host.bat")
        with open(host_path, "w", newline="\r\n") as f:
            f.write('@echo off\r\npython "%s" %%*\r\n' % host_py)
    else:
        make_executable(host_py)
        host_path = host_py

    manifest = {
        "name": HOST_NAME,
        "description": "Open Link in Profile native host",
        "path": host_path,
        "type": "stdio",
        "allowed_origins": ["chrome-extension://%s/" % ext_id],
    }

    if system == "Darwin":
        targets = [
            os.path.join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
            os.path.join(home, "Library", "Application Support", "Chromium", "NativeMessagingHosts"),
        ]
    elif system == "Linux":
        targets = [
            os.path.join(home, ".config", "google-chrome", "NativeMessagingHosts"),
            os.path.join(home, ".config", "chromium", "NativeMessagingHosts"),
        ]
    elif system == "Windows":
        targets = [here]
    else:
        print("Unsupported OS:", system)
        sys.exit(1)

    wrote_any = False
    for target in targets:
        # Only install into browsers that are actually present (parent dir exists).
        if system != "Windows" and not os.path.isdir(os.path.dirname(target)):
            continue
        os.makedirs(target, exist_ok=True)
        mpath = os.path.join(target, HOST_NAME + ".json")
        with open(mpath, "w") as f:
            json.dump(manifest, f, indent=2)
        print("Wrote", mpath)
        wrote_any = True

    if system == "Windows":
        import winreg

        mpath = os.path.join(here, HOST_NAME + ".json")
        key = winreg.CreateKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Google\Chrome\NativeMessagingHosts\%s" % HOST_NAME,
        )
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, mpath)
        winreg.CloseKey(key)
        print("Registered HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\%s ->" % HOST_NAME, mpath)
        wrote_any = True

    if not wrote_any:
        print("No Chrome/Chromium config dir found — is the browser installed for this user?")
        sys.exit(1)

    print("\nDone. Reload the extension at chrome://extensions, then right-click any link.")


if __name__ == "__main__":
    main()
