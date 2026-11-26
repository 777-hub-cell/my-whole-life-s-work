#!/usr/bin/env python3
"""Capture native UI preview screens using explicitly debug-only fixture data.

The launch flag is guarded by ApplicationInfo.FLAG_DEBUGGABLE. This script never
contacts the Aharane server; sample content is absent from release launches.
"""
import json
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

REMOTE_XML = "/sdcard/window.xml"
OUT = Path("screenshots")
SCREEN_INDEX = []
CURRENT_THEME = "emulator-default"
DEVICE_INFO = {}


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
    SCREEN_INDEX.append({
        "file": name,
        "theme": CURRENT_THEME,
        "device": DEVICE_INFO.get("model", "Android emulator"),
        "api_level": DEVICE_INFO.get("api_level", "unknown"),
        "resolution": DEVICE_INFO.get("resolution", "unknown"),
        "density": DEVICE_INFO.get("density", "unknown"),
    })


def nodes():
    """Read the current Android accessibility tree reliably on API 36.

    uiautomator can return before its external-storage dump is readable on a
    freshly booted emulator. Retry the dump/read pair and retain stderr so a
    capture failure explains which Android command failed.
    """
    last_error = ""
    for attempt in range(4):
        dump = subprocess.run(
            ["adb", "shell", "uiautomator", "dump", "--compressed", REMOTE_XML],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if dump.returncode != 0:
            # Compatibility fallback for emulator images without --compressed.
            dump = subprocess.run(
                ["adb", "shell", "uiautomator", "dump", REMOTE_XML],
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        if dump.returncode == 0:
            result = subprocess.run(
                ["adb", "exec-out", "cat", REMOTE_XML],
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if result.returncode == 0 and result.stdout.strip():
                try:
                    return list(ET.fromstring(result.stdout).iter("node"))
                except ET.ParseError as error:
                    last_error = f"Accessibility XML was malformed: {error}"
            else:
                last_error = (
                    f"Could not read {REMOTE_XML}: "
                    f"{result.stderr.strip() or 'the dump file was empty'}; "
                    f"uiautomator: {dump.stdout.strip()} {dump.stderr.strip()}"
                )
        else:
            last_error = (
                f"uiautomator dump failed ({dump.returncode}): "
                f"{dump.stdout.strip()} {dump.stderr.strip()}"
            )
        time.sleep(0.4 * (attempt + 1))
    raise RuntimeError(f"Android accessibility-tree capture failed after retries: {last_error}")


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

def assert_visible_texts(labels, timeout_seconds: float = 8):
    """Wait for expected native UI text, failing with the missing labels."""
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        visible = {node.attrib.get("text", "") for node in nodes()}
        missing = [
            label for label in labels
            if not any(label.casefold() in value.casefold() for value in visible)
        ]
        if not missing:
            return
        time.sleep(0.35)
    raise RuntimeError(f"Expected UI text is not visible: {missing!r}")

def assert_absent_texts(labels):
    """Ensure removed or relocated entries do not reappear on More."""
    visible = {
        node.attrib.get("text", "") or node.attrib.get("content-desc", "")
        for node in nodes()
    }
    found = [
        label for label in labels
        if any(label.casefold() in value.casefold() for value in visible)
    ]
    if found:
        raise RuntimeError(f"Unexpected UI entries are visible: {found!r}")


def scroll_until_label_visible(label: str, max_swipes: int = 14):
    """Scroll a screen until a label is visible without activating it."""
    for _ in range(max_swipes + 1):
        visible = [
            node.attrib.get("text", "") or node.attrib.get("content-desc", "")
            for node in nodes()
        ]
        if any(label.casefold() in value.casefold() for value in visible):
            return
        run("adb", "shell", "input", "swipe", "540", "2050", "540", "980", "350")
        time.sleep(0.5)
    raise RuntimeError(f"Could not scroll to visible UI label: {label!r}")


def scroll_back_until_label_visible(label: str, max_swipes: int = 14):
    """Scroll toward the top of a LazyColumn until an earlier section is visible."""
    for _ in range(max_swipes + 1):
        visible = [
            node.attrib.get("text", "") or node.attrib.get("content-desc", "")
            for node in nodes()
        ]
        if any(label.casefold() in value.casefold() for value in visible):
            return
        run("adb", "shell", "input", "swipe", "540", "980", "540", "2050", "350")
        time.sleep(0.5)
    raise RuntimeError(f"Could not scroll back to visible UI label: {label!r}")


def back():
    run("adb", "shell", "input", "keyevent", "4")
    time.sleep(0.8)


def main():
    global CURRENT_THEME
    OUT.mkdir(parents=True, exist_ok=True)
    DEVICE_INFO.update({
        "model": run("adb", "shell", "getprop", "ro.product.model", capture_output=True).stdout.strip(),
        "api_level": run("adb", "shell", "getprop", "ro.build.version.sdk", capture_output=True).stdout.strip(),
        "resolution": run("adb", "shell", "wm", "size", capture_output=True).stdout.strip(),
        "density": run("adb", "shell", "wm", "density", capture_output=True).stdout.strip(),
    })
    SCREEN_INDEX.clear()
    run("adb", "install", "-r", "artifacts/app-debug.apk")
    run(
        "adb", "shell", "am", "start", "-n", "com.aharane.studio/.MainActivity",
        "--ez", "aharane_preview_mode", "true"
    )
    # Wait for the actual Home page instead of capturing the launch splash.
    assert_visible_texts(["Welcome back", "WhatsApp accounts"], timeout_seconds=25)
    capture("01-home.png")
    # The header's Preview status badge is not interactive. Open the Private
    # account's Preview action (the second visible Preview label).
    tap_label("Preview", occurrence=1)
    assert_visible_texts(["Pairing code", "QR code", "This is a preview"])
    capture("01a-whatsapp-pairing-code-choice.png")
    tap_label("QR code")
    capture("01aa-whatsapp-qr-choice.png")
    tap_label("Pairing code")
    capture("01ab-whatsapp-pairing-code-choice.png")
    # The visible top Back control and the lower CTA share the same onBack handler.
    tap_label("‹  Back")
    tap_label("Configuration", scroll_to_find=True)
    capture("01b-configuration.png")
    tap_label("Edit config.js", scroll_to_find=True)
    capture("01c-config-editor.png", 2)
    back()
    capture("01d-configuration-return.png")
    tap_label("‹  Back to Home")
    scroll_until_label_visible("Visual command builder")
    capture("01e-home-visual-command-builder-shortcut.png")
    tap_label("Visual command builder")
    capture("01f-home-visual-command-builder.png", 2)
    assert_visible_texts(["Command builder", "WORKSPACE", "NODE LIBRARY", "Search nodes", "Save"])
    if os.environ.get("AHARANE_COMMAND_BUILDER_ONLY") == "1":
        index = {
            "file": "index.json",
            "device": DEVICE_INFO.get("model", "Android emulator"),
            "api_level": DEVICE_INFO.get("api_level", "unknown"),
            "resolution": DEVICE_INFO.get("resolution", "unknown"),
            "density": DEVICE_INFO.get("density", "unknown"),
            "screens": SCREEN_INDEX.copy(),
        }
        (OUT / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
        print("Captured the native Aharane command builder screen.")
        return
    back()

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
    # Capture the open editor with its explorer. Back first closes the
    # explorer drawer, so use the editor toolbar action to return to Files.
    if not any(node.attrib.get("content-desc") == "Hide explorer" for node in nodes()):
        tap_label("Show explorer", content_desc=True)
    capture("03d-editor-explorer.png")
    tap_label("Close editor", content_desc=True)
    time.sleep(0.8)

    tap_label("ENV")
    capture("04-env.png")
    tap_label("More")
    capture("05-more.png")
    assert_absent_texts([
        "Development", "Studio source", "Visual command builder",
        "Status", "Status & Channels", "WhatsApp Status", "No currently received statuses"
    ])
    tap_label("Configuration", scroll_to_find=True)
    capture("05a-configuration-from-more.png")
    tap_label("‹  Back to Home")

    tap_label("Activity and logs", scroll_to_find=True)
    capture("05b-activity-and-logs.png")
    back()
    tap_label("Storage information", scroll_to_find=True)
    capture("05c-storage-information.png")
    back()
    tap_label("Notes", scroll_to_find=True)
    capture("05d-notes.png")
    back()
    tap_label("Channels", scroll_to_find=True)
    assert_visible_texts(["Connect a paired WhatsApp account to browse Channels"])
    capture("05h-channels-disconnected.png")
    back()

    tap_label("Help", scroll_to_find=True)
    capture("05e-help-dialog.png")
    tap_label("Close")
    tap_label("About Aharane", scroll_to_find=True)
    capture("05f-about-dialog.png")
    tap_label("Close")

    tap_label("Appearance", scroll_to_find=True)
    capture("06-appearance.png")
    tap_label("Dark")
    CURRENT_THEME = "dark"
    capture("06a-appearance-dark.png")
    back()
    capture("05g-more-dark.png")
    tap_label("Appearance", scroll_to_find=True)
    tap_label("Light")
    CURRENT_THEME = "light"
    back()
    tap_label("Chat settings", scroll_to_find=True)
    capture("06a-chat-settings.png", 1)
    tap_label("Open Appearance Studio", scroll_to_find=True)
    capture("06b-chat-appearance-studio.png", 1)
    tap_label("Photo", scroll_to_find=True, required=False)
    if tap_label("Choose photo", scroll_to_find=True, required=False):
        capture("06c-android-photo-picker.png", 1)
        back()
    # These are section headings inside the Appearance Studio, not buttons.
    # Scroll them into view and capture the controls beneath each heading.
    scroll_until_label_visible("Message bubbles")
    capture("06d-message-bubble-customisation.png")
    scroll_until_label_visible("Typography")
    capture("06e-typography-settings.png")
    scroll_back_until_label_visible("Apply to")
    tap_label("Conversation")
    capture("06f-conversation-override-selector.png")
    tap_label("Mira", scroll_to_find=True, required=False)
    capture("06g-per-conversation-override.png")
    back()
    back()
    back()  # Return from chat settings to More.

    # The Visual Command Builder is intentionally opened only from Home.

    # A normal first launch now requires secure HTTPS sign-in before any Studio
    # content is available. Capture that gate separately; never bypass auth in
    # the production launch just to reach the screen previews.
    run("adb", "shell", "am", "force-stop", "com.aharane.studio")
    run("adb", "shell", "am", "start", "-n", "com.aharane.studio/.MainActivity")
    capture("07-server-connection.png", 8)
    assert_visible_texts(["Aharane", "Connect your private Studio", "Server address", "HTTPS only"])
    SCREEN_INDEX.append({
        "file": "index.json",
        "device": DEVICE_INFO.get("model", "Android emulator"),
        "api_level": DEVICE_INFO.get("api_level", "unknown"),
        "resolution": DEVICE_INFO.get("resolution", "unknown"),
        "density": DEVICE_INFO.get("density", "unknown"),
        "screens": SCREEN_INDEX.copy(),
    })
    (OUT / "index.json").write_text(
        json.dumps(SCREEN_INDEX[-1], indent=2),
        encoding="utf-8"
    )

    print("Captured debug-only native UI flows and wrote screenshots/index.json.")


if __name__ == "__main__":
    main()
