#!/usr/bin/env python3
"""Native messaging host for the "Open Link in Profile" extension.

Speaks Chrome's native messaging protocol over stdio (4-byte little-endian
length prefix + UTF-8 JSON). Two actions:

  {"action": "list"}                      -> {"ok": true, "profiles": [{dir, name}, ...]}
  {"action": "open", "profile": "Profile 2", "url": "https://..."}
                                          -> {"ok": true}

The only thing that can actually switch profiles is launching the Chrome
binary with --profile-directory, which is what "open" does.
"""

import glob
import json
import os
import platform
import shutil
import struct
import subprocess
import sys


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack("<I", raw)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode("utf-8"))


def send_message(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def user_data_dir():
    system = platform.system()
    home = os.path.expanduser("~")
    if system == "Darwin":
        return os.path.join(home, "Library", "Application Support", "Google", "Chrome")
    if system == "Windows":
        return os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
    return os.path.join(home, ".config", "google-chrome")


def chrome_binary():
    system = platform.system()
    if system == "Darwin":
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if system == "Windows":
        for env in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            base = os.environ.get(env)
            if not base:
                continue
            cand = os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")
            if os.path.exists(cand):
                return cand
        return "chrome.exe"
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        path = shutil.which(name)
        if path:
            return path
    return "google-chrome"


def list_profiles():
    local_state = os.path.join(user_data_dir(), "Local State")
    profiles = []
    try:
        with open(local_state, "r", encoding="utf-8") as f:
            state = json.load(f)
        cache = state.get("profile", {}).get("info_cache", {})
        for directory, meta in cache.items():
            entry = {"dir": directory, "name": meta.get("name") or directory}
            # Chrome stores the generated-avatar color as a signed ARGB int.
            color = meta.get("default_avatar_fill_color")
            if isinstance(color, int):
                entry["color"] = color & 0xFFFFFF
            profiles.append(entry)
    except (OSError, ValueError):
        # Fallback: scan the user-data dir for profile folders.
        base = user_data_dir()
        dirs = ["Default"] + [os.path.basename(p) for p in glob.glob(os.path.join(base, "Profile *"))]
        for directory in dirs:
            if os.path.isdir(os.path.join(base, directory)):
                profiles.append({"dir": directory, "name": directory})
    # Default first, then alphabetical by display name.
    profiles.sort(key=lambda p: (p["dir"] != "Default", p["name"].lower()))
    return profiles


def open_in_profile(profile, url):
    args = [chrome_binary(), "--profile-directory=" + profile]
    if url:
        args.append(url)
    # Detach so the host can exit immediately and so the child never writes to
    # our stdout (which would corrupt the native messaging stream).
    kwargs = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if platform.system() == "Windows":
        kwargs["creationflags"] = 0x00000008  # DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(args, **kwargs)


def handle(msg):
    action = msg.get("action")
    if action == "list":
        return {"ok": True, "profiles": list_profiles()}
    if action == "open":
        open_in_profile(msg.get("profile", "Default"), msg.get("url", ""))
        return {"ok": True}
    return {"ok": False, "error": "unknown action: %r" % action}


def main():
    msg = read_message()
    if msg is None:
        return
    try:
        resp = handle(msg)
    except Exception as exc:  # report errors back to the extension
        resp = {"ok": False, "error": str(exc)}
    send_message(resp)


if __name__ == "__main__":
    main()
