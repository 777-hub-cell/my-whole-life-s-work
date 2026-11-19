#!/usr/bin/env python3
"""Capture the full-screen native source editor from the Android emulator."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

REMOTE_XML = "/sdcard/aharane-window.xml"
LABEL = "Open editor"
OUTPUT = Path("screenshots/03a-editor.png")


def run(*args, capture_output=False):
    return subprocess.run(
        list(args),
        check=True,
        text=capture_output,
        stdout=subprocess.PIPE if capture_output else subprocess.DEVNULL,
        stderr=subprocess.PIPE if capture_output else subprocess.DEVNULL,
    )


def find_editor_button() -> bool:
    run("adb", "shell", "uiautomator", "dump", REMOTE_XML)
    xml_text = run("adb", "shell", "cat", REMOTE_XML, capture_output=True).stdout
    root = ET.fromstring(xml_text)
    for node in root.iter("node"):
        if node.attrib.get("text") == LABEL or node.attrib.get("content-desc") == LABEL:
            match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
            if match:
                x1, y1, x2, y2 = map(int, match.groups())
                run("adb", "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
                return True
    return False


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if not find_editor_button():
        # The editor launcher may be below the first viewport on narrow phones.
        run("adb", "shell", "input", "swipe", "540", "2000", "540", "1100", "350")
        time.sleep(1)
        if not find_editor_button():
            raise SystemExit(f"Could not locate the native {LABEL!r} control")

    time.sleep(3)
    with OUTPUT.open("wb") as image_file:
        subprocess.run(
            ["adb", "exec-out", "screencap", "-p"],
            check=True,
            stdout=image_file,
        )
    run("adb", "shell", "input", "keyevent", "4")
    time.sleep(1)


if __name__ == "__main__":
    main()
