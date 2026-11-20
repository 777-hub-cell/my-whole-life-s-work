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
            # Compose may merge a clickable row's title and subtitle into
            # one accessibility node (for example, "Configuration, Private Owner…").
            # Match the visible label within that node, preferring the shortest
            # matching text and then the smallest bounds to avoid tapping a parent.
            if value == label or (not content_desc and label in value):
                bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
                if bounds:
                    x1, y1, x2, y2 = tuple(map(int, bounds.groups()))
                    matches.append((len(value), (x2 - x1) * (y2 - y1), (x1, y1, x2, y2)))
        matches.sort(key=lambda item: (item[0], item[1]))
        if len(matches) > occurrence:
            _, _, (x1, y1, x2, y2) = matches[occurrence]
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
        visible = sorted({
            node.attrib.get("text", "") or node.attrib.get("content-desc", "")
            for node in nodes()
            if node.attrib.get("text", "") or node.attrib.get("content-desc", "")
        })
        raise RuntimeError(
            f"Could not locate tappable UI element: {label!r}; visible labels: {visible[:100]!r}"
        )
    return False

def assert_visible_texts(labels):
    """Fail the screenshot run if the native popup drifts from the web actions."""
    deadline = time.time() + 8
    while time.time() < deadline:
        visible = {node.attrib.get("text", "") for node in nodes()}
        missing = [
            label for label in labels
            if not any(label.casefold() in value.casefold() for value in visible)
        ]
        if not missing:
            return
        time.sleep(0.35)
    raise RuntimeError(f"File popup is missing expected actions: {missing!r}")

def assert_absent_texts(labels):
    """Ensure removed Android-app source editing does not reappear in More."""
    visible = {
        node.attrib.get("text", "") or node.attrib.get("content-desc", "")
        for node in nodes()
    }
    found = [
        label for label in labels
        if any(label.casefold() in value.casefold() for value in visible)
    ]
    if found:
        raise RuntimeError(f"Unexpected removed UI entries are visible: {found!r}")


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
    tap_label("Preview", occurrence=0)
    capture("01a-preview-account-action.png")
    tap_label("Close")
    tap_label("Configuration", scroll_to_find=True)
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
    tap_label("Browse conversation media", content_desc=True, required=False)
    capture("02b-conversation-media-gallery.png", 1)
    tap_label("Close media gallery", content_desc=True, required=False)
    tap_label("Search in conversation", content_desc=True, required=False)
    capture("02c-conversation-search.png", 1)
    back()  # Close the in-conversation search field.
    back()  # Return from the full-screen conversation to the inbox.
    tap_label("Switch to Public WhatsApp", content_desc=True, required=False)
    capture("02d-public-chats.png", 1)
    tap_label("Switch to Private WhatsApp", content_desc=True, required=False)
    
    tap_label("Files")
    capture("03-files.png")

    # The saved-package manager is populated only with explicit Preview fixtures
    # here; upload/deploy controls are demonstrated but cannot change a server.
    tap_label("View all", scroll_to_find=True)
    assert_visible_texts([
        "Update packages",
        "Upload ZIP",
        "Refresh",
        "aharane-preview-update.zip",
        "Update bot",
        "Remove",
        "Preview package library",
    ])
    capture("03e-update-packages.png")
    tap_label("Close")
    tap_label("Open update packages folder", content_desc=True, scroll_to_find=True)
    capture("03f-update-package-folder.png")
    tap_label("File actions", content_desc=True)
    assert_visible_texts(["Update bot", "Remove"])
    capture("03g-update-package-menu.png")
    tap_label("Update bot")
    assert_visible_texts(["Confirm update", "Cancel"])
    capture("03h-update-confirmation.png")
    tap_label("Cancel")
    tap_label("root", scroll_to_find=True)

    tap_label("admin")
    capture("03b-admin-folder.png")
    tap_label("File actions", content_desc=True)
    assert_visible_texts(["Rename", "Duplicate", "Move", "Download as ZIP", "Delete"])
    capture("03c-file-menu.png")
    back()
    tap_label("auth.js")
    capture("03a-editor.png", 2)
    tap_label("Problems & Console")
    capture("03i-editor-problems.png")
    assert_visible_texts(["Preview sample", "warning"])
    tap_label("Console")
    capture("03j-editor-console.png")
    assert_visible_texts(["Preview", "sample"])
    back()
    tap_label("Show explorer", content_desc=True)
    capture("03d-editor-explorer.png")
    back()
    back()

    tap_label("ENV")
    capture("04-env.png")
    tap_label("More")
    capture("05-more.png")
    assert_absent_texts(["Development", "Studio source"])
    tap_label("Accounts & owners")
    capture("05a-accounts-owners.png")
    back()
    tap_label("Appearance", scroll_to_find=True)
    capture("06-appearance.png")
    back()
    tap_label("Chat settings", scroll_to_find=True)
    capture("06a-chat-settings.png", 1)
    tap_label("Open Appearance Studio", scroll_to_find=True)
    capture("06b-chat-appearance-studio.png", 1)
    tap_label("Photo", scroll_to_find=True, required=False)
    tap_label("Choose photo", scroll_to_find=True, required=False)
    if tap_label("Choose photo", required=False):
        capture("06c-android-photo-picker.png", 1)
        back()
    tap_label("Message bubbles", scroll_to_find=True)
    capture("06d-message-bubble-customisation.png")
    tap_label("Typography", scroll_to_find=True)
    capture("06e-typography-settings.png")
    tap_label("Apply to", scroll_to_find=True)
    tap_label("Conversation", scroll_to_find=True)
    capture("06f-conversation-override-selector.png")
    tap_label("Mira", scroll_to_find=True, required=False)
    capture("06g-per-conversation-override.png")
    back()
    back()

    # A normal first launch now requires secure HTTPS sign-in before any Studio
    # content is available. Capture that gate separately; never bypass auth in
    # the production launch just to reach the screen previews.
    run("adb", "shell", "am", "force-stop", "com.aharane.studio")
    run("adb", "shell", "am", "start", "-n", "com.aharane.studio/.MainActivity")
    capture("07-server-connection.png", 8)
    assert_visible_texts(["Aharane", "Connect your private Studio", "Server address", "HTTPS only"])

    print("Captured debug-only native UI flows and the normal secure first-launch connection screen.")


if __name__ == "__main__":
    main()
