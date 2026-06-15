#!/usr/bin/env python3
"""Remove the native messaging host registration. Run: python3 uninstall.py"""

import os
import platform

HOST_NAME = "com.muninn.profile_switcher"


def main():
    system = platform.system()
    home = os.path.expanduser("~")
    here = os.path.dirname(os.path.abspath(__file__))
    removed = False

    if system == "Darwin":
        dirs = [
            os.path.join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
            os.path.join(home, "Library", "Application Support", "Chromium", "NativeMessagingHosts"),
        ]
    elif system == "Linux":
        dirs = [
            os.path.join(home, ".config", "google-chrome", "NativeMessagingHosts"),
            os.path.join(home, ".config", "chromium", "NativeMessagingHosts"),
        ]
    else:
        dirs = [here]

    for d in dirs:
        mpath = os.path.join(d, HOST_NAME + ".json")
        if os.path.exists(mpath):
            os.remove(mpath)
            print("Removed", mpath)
            removed = True

    if system == "Windows":
        import winreg

        try:
            winreg.DeleteKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Google\Chrome\NativeMessagingHosts\%s" % HOST_NAME,
            )
            print("Removed registry key for", HOST_NAME)
            removed = True
        except FileNotFoundError:
            pass

    print("Done." if removed else "Nothing to remove.")


if __name__ == "__main__":
    main()
