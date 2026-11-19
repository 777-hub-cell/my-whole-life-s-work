#!/usr/bin/env python3
"""Capture native UI preview screens using explicitly debug-only fixture data.

The launch flag is guarded by ApplicationInfo.FLAG_DEBUGGABLE. This script never
contacts the Aharane server; sample content is absent from release launches.
"""
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

REMOTE_XML = "/sdcard/aharane-ui-preview.xml"
OUT = Path("screenshots")


def run(*args, capture_output=False):
    return subprocess.run(
        list(args),
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture_output else subprocess.DEVNULL,
        stderr=subprocess.PIPE if capture_output else subprocess.DEVNULL,
    )


def capture(name: str, settle: float = 1.5):
    time.sleep(settle)
    with (OUT / name).open("wb") as image_file:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], check=True, stdout=image_file)


def nodes():
    run("adb", "shell", "uiautomator", "dump", REMOTE_XML)
    xml_text = run("adb", "shell", "cat", REMOTE_XML, capture_output=True).stdout
    return list(ET.fromstring(xml_text).iter("node"))


def tap_label(
    label: str,
    *,
    content_desc: bool = False,
    occurrence: int = 0,
    required: bool = True,
    scroll_to_find: bool = False,
):
    deadline = time.time() + (18 if scroll_to_find else 8)
    last_swipe = 0.0
    swipe_count = 0
    while time.time() < deadline:
        matches = []
        for node in nodes():
            value = node.attrib.get("content-desc" if content_desc else "text", "")
            if value == label:
                bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
                if bounds:
                    matches.append(tuple(map(int, bounds.groups())))
        if len(matches) > occurrence:
            x1, y1, x2, y2 = matches[occurrence]
            run("adb", "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
            time.sleep(0.7)
            return True

        now = time.time()
        if scroll_to_find and swipe_count < 5 and now - last_swipe >= 2.2:
            run("adb", "shell", "input", "swipe", "540", "2050", "540", "980", "350")
            last_swipe = time.time()
            swipe_count += 1
        time.sleep(0.35)

    if required:
        raise RuntimeError(f"Could not locate tappable UI element: {label!r}")
    return False

def back():
    run("adb", "shell", "input", "keyevent", "4")
    time.sleep(0.8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    run("adb", "install", "-r", "artifacts/app-debug.apk")
    run(
        "adb", "shell", "am", "start", "-n", "com.aharane.studio/.MainActivity",
        "--ez", "aharane_preview_mode", "true"
    )
    capture("01-home.png", 5)
    tap_label("Link account", occurrence=0)
    capture("01a-link-account.png")
    back()
    tap_label("Configuration")
    capture("01b-configuration.png")
    tap_label("Edit config.js", scroll_to_find=True)
    capture("01c-config-editor.png", 2)
    back()
    capture("01d-configuration-return.png")
    tap_label("‹  Back to Home")

    tap_label("Chats")
    capture("02-chats.png")
    tap_label("Mira")
    capture("02a-conversation.png", 2)
    back()
    tap_label("Switch WhatsApp account", content_desc=True, required=False)
    capture("02b-public-chats.png", 1)
    tap_label("Switch WhatsApp account", content_desc=True, required=False)
    
    tap_label("Files")
    capture("03-files.png")
    tap_label("admin")
    capture("03b-admin-folder.png")
    tap_label("File actions", content_desc=True)
    capture("03c-file-menu.png")
    tap_label("auth.js")
    capture("03a-editor.png", 2)
    tap_label("Show explorer", content_desc=True)
    capture("03d-editor-explorer.png")
    back()
    back()

    tap_label("ENV")
    capture("04-env.png")
    tap_label("More")
    capture("05-more.png")
    tap_label("Accounts & owners")
    capture("05a-accounts-owners.png")
    back()
    tap_label("Studio source", scroll_to_find=True)
    capture("05b-studio-source.png")
    back()
    tap_label("Appearance", scroll_to_find=True)
    capture("06-appearance.png")
    back()

    # Repeat the comparison screens with normal (non-preview) app state so
    # empty/disconnected UI can be compared directly to the web reference.
    run("adb", "shell", "am", "force-stop", "com.aharane.studio")
    run("adb", "shell", "am", "start", "-n", "com.aharane.studio/.MainActivity")
    capture("07-home-disconnected.png", 8)
    tap_label("Files")
    capture("08-files-disconnected.png")
    tap_label("ENV")
    capture("09-env-disconnected.png")
    tap_label("Chats")
    capture("10-chats-disconnected.png")
    tap_label("More")
    capture("11-more-disconnected.png")
    tap_label("Appearance")
    capture("12-appearance-disconnected.png")

    print("Captured debug-preview interaction screens and matching normal disconnected screens.")


if __name__ == "__main__":
    main()
