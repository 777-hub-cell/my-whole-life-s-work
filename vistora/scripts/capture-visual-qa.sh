#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.vistora.android"
OUT="${RUNNER_TEMP:-/tmp}/vistora-visual-qa"
mkdir -p "$OUT"
rm -f "$OUT"/*.png
XML="$OUT/window.xml"
SIZE="$(timeout 8s adb shell wm size | awk -F': ' '/size:/ { value=$2 } END { print value }' | tr -d '\r' || true)"
SCREEN_W="${SIZE%x*}"
SCREEN_H="${SIZE#*x}"
SCREEN_W="${SCREEN_W:-1080}"
SCREEN_H="${SCREEN_H:-1920}"

swipe_up() {
  adb shell input swipe "$((SCREEN_W / 2))" "$((SCREEN_H * 80 / 100))" \
    "$((SCREEN_W / 2))" "$((SCREEN_H * 30 / 100))" 350
}

dump_ui() {
  # UIAutomator can occasionally hang on a just-resumed Compose window.
  # Bound each adb operation so screenshots already captured are retained.
  timeout 8s adb shell uiautomator dump /sdcard/vistora-window.xml >/dev/null 2>&1 || true
  timeout 5s adb pull /sdcard/vistora-window.xml "$XML" >/dev/null 2>&1 || true
  [[ -s "$XML" ]]
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
    dump_ui || true
    coords="$(find_bounds "$needle" || true)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      timeout 5s adb shell input tap "$x" "$y"
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
  timeout 12s adb exec-out screencap -p > "$OUT/$name.png"
  test -s "$OUT/$name.png"
  echo "Captured $name.png"
}

scroll_to_text_and_tap() {
  local needle="$1"
  for _ in $(seq 1 7); do
    dump_ui || true
    local coords
    coords="$(find_bounds "$needle" || true)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      timeout 5s adb shell input tap "$x" "$y"
      sleep 1.0
      return 0
    fi
    timeout 5s bash -c 'adb shell input swipe "$1" "$2" "$3" "$4" 350' _ "$((SCREEN_W / 2))" "$((SCREEN_H * 80 / 100))" "$((SCREEN_W / 2))" "$((SCREEN_H * 30 / 100))" || true
    sleep 0.4
  done
  echo "Could not find UI text after scrolling: $needle" >&2
  return 1
}

# Instrumentation runners may uninstall the target package after tests.
# Reinstall the freshly assembled app before opening it for visual inspection.
APK="vistora/android/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK"
timeout 120s adb install -r "$APK"
timeout 8s adb shell am force-stop "$PACKAGE" || true
LAUNCHER="$(timeout 12s adb shell cmd package resolve-activity --brief \
  -a android.intent.action.MAIN \
  -c android.intent.category.LAUNCHER "$PACKAGE" | tr -d '\r' | tail -n 1 || true)"
if [[ -z "$LAUNCHER" || "$LAUNCHER" == *"No activity found"* ]]; then
  echo "Could not resolve the VISTORA launcher activity for $PACKAGE" >&2
  adb shell pm list packages | grep -i vistora || true
  exit 1
fi
timeout 20s adb shell am start -W -n "$LAUNCHER"
sleep 2.5
# Capture the first screen before any semantic navigation; even if a later
# UIAutomator lookup fails, the artifact will contain a real rendered screen.
capture "01-home-empty"

# Empty-state review.
tap_text "Library"
capture "02-library-empty"
tap_text "Add your first title"
capture "03-add-title-sheet"

# Create one clearly labelled local sample so the library grid, stats and
# title-detail layouts can be reviewed using real persisted app data.
tap_text "Title name"
adb shell input text "Vistora%sVisual%sQA"
adb shell input keyevent 4
sleep 0.5
scroll_to_text_and_tap "Add to My Watchlist"
scroll_to_text_and_tap "Add to library"
sleep 1.5
capture "04-title-details-top"

# Inspect the lower detail sections as well as its header.
timeout 5s bash -c 'adb shell input swipe "$1" "$2" "$3" "$4" 350' _ "$((SCREEN_W / 2))" "$((SCREEN_H * 80 / 100))" "$((SCREEN_W / 2))" "$((SCREEN_H * 30 / 100))" || true
capture "05-title-details-progress"
# Title Details hides bottom navigation; use Android's Back action.
timeout 5s adb shell input keyevent 4
sleep 1.0
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
scroll_to_text_and_tap "My Notes"
capture "12-my-notes"

echo "Visual QA screenshots:"
find "$OUT" -maxdepth 1 -type f -name '*.png' -printf '%f %s bytes\n' | sort
