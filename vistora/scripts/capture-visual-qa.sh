#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.vistora.android"
OUT="${RUNNER_TEMP:-/tmp}/vistora-visual-qa"
mkdir -p "$OUT"
rm -f "$OUT"/*.png
XML="$OUT/window.xml"

dump_ui() {
  adb shell uiautomator dump /sdcard/vistora-window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/vistora-window.xml "$XML" >/dev/null 2>&1
}

find_bounds() {
  local needle="$1"
  python3 - "$XML" "$needle" <<'PY'
import sys
import xml.etree.ElementTree as ET
path, needle = sys.argv[1], sys.argv[2].casefold()
root = ET.parse(path).getroot()
matches = []
for node in root.iter("node"):
    text = (node.attrib.get("text") or "").strip()
    desc = (node.attrib.get("content-desc") or "").strip()
    hay = (text + " " + desc).casefold()
    if needle in hay:
        bounds = node.attrib.get("bounds", "")
        import re
        m = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
        if m:
            x1,y1,x2,y2 = map(int,m.groups())
            if x2 > x1 and y2 > y1:
                matches.append((node.attrib.get("clickable") == "true", text.casefold() == needle, x1,y1,x2,y2,text,desc))
if matches:
    matches.sort(key=lambda x:(x[0],x[1]), reverse=True)
    _,_,x1,y1,x2,y2,_,_ = matches[0]
    print((x1+x2)//2, (y1+y2)//2)
PY
}

tap_text() {
  local needle="$1"
  local tries="${2:-8}"
  local coords=""
  for _ in $(seq 1 "$tries"); do
    dump_ui
    coords="$(find_bounds "$needle" || true)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      adb shell input tap "$x" "$y"
      sleep 1.0
      return 0
    fi
    sleep 0.4
  done
  echo "Could not find visible UI text: $needle" >&2
  return 1
}

capture() {
  local name="$1"
  sleep 0.8
  adb exec-out screencap -p > "$OUT/$name.png"
  test -s "$OUT/$name.png"
  echo "Captured $name.png"
}

scroll_to_text_and_tap() {
  local needle="$1"
  for _ in $(seq 1 7); do
    dump_ui
    local coords
    coords="$(find_bounds "$needle" || true)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      adb shell input tap "$x" "$y"
      sleep 1.0
      return 0
    fi
    adb shell input swipe 540 1900 540 650 350
    sleep 0.4
  done
  echo "Could not find UI text after scrolling: $needle" >&2
  return 1
}

adb shell am force-stop "$PACKAGE" || true
adb shell monkey -p "$PACKAGE" 1 >/dev/null
sleep 2.5

# Empty-state review.
capture "01-home-empty"
tap_text "Library"
capture "02-library-empty"
tap_text "Add your first title"
capture "03-add-title-sheet"

# Create one clearly labelled local sample so the library grid, stats and
# title-detail layouts can be reviewed using real persisted app data.
tap_text "Title name"
adb shell input text "Vistora%20Visual%20QA"
adb shell input keyevent 4
sleep 0.5
tap_text "Add to My Watchlist"
scroll_to_text_and_tap "Add to library"
sleep 1.5
capture "04-title-details-top"

# Inspect the lower detail sections as well as its header.
adb shell input swipe 540 1900 540 650 350
capture "05-title-details-progress"
tap_text "Home"
capture "06-home-with-watchlist"
tap_text "Library"
capture "07-library-with-poster"

# Combined filters sheet.
tap_text "Filters"
capture "08-library-filters"
adb shell input keyevent 4
sleep 0.7

tap_text "Discover"
capture "09-discover"
tap_text "Stats"
capture "10-stats"
tap_text "Settings"
capture "11-settings"
tap_text "My Notes"
capture "12-my-notes"

echo "Visual QA screenshots:"
find "$OUT" -maxdepth 1 -type f -name '*.png' -printf '%f %s bytes\n' | sort
