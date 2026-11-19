#!/usr/bin/env python3
"""Capture native UI preview screens using explicitly debug-only fixture data.

The launch flag is guarded by BuildConfig.DEBUG. This script never touches the
Aharane server and sample content is not available in release builds.
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


def tap_label(label: str, *, content_desc: bool = False, occurrence: int = 0, required: bool = True):
    deadline = time.time() + 8
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
        time.sleep(0.4)
    if required:
        raise RuntimeError(f"Could not locate tappable UI element: {label!r}")
    return False


def back():
    run("adb", "shell", "input", "keyevent", "4")
    time.sleep(0.8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    run("adb", "install", "artifacts/app-debug.apk")
    run(
        "adb", "shell", "am", "start", "-n", "com.aharane.studio/.MainActivity",
        "--ez", "aharane_preview_mode", "true"
    )
    capture("01-home.png", 5)

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
    tap_label("Open")
    capture("03a-editor.png", 2)
    tap_label("Show explorer", content_desc=True)
    capture("03d-editor-explorer.png")
    back()
    back()

    tap_label("ENV")
    capture("04-env.png")
    tap_label("More")
    capture("05-more.png")
    tap_label("Appearance")
    capture("06-appearance.png")

    print("Captured native Home, Chats, conversation, account switch, Files, menu, editor, Explorer, ENV, More and Appearance screens.")


if __name__ == "__main__":
    main()
