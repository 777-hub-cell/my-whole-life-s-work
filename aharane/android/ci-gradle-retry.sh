#!/bin/sh
# Retry Android Gradle tasks when a remote Maven/Google repository briefly fails.
# The emulator-runner executes each input line separately, so call this file
# through one shell command instead of embedding multiline loops in its input.
set -eu

if [ "$#" -eq 0 ]; then
  echo "Usage: sh ci-gradle-retry.sh <gradle-task> [gradle-args...]" >&2
  exit 2
fi

for attempt in 1 2 3; do
  if ./gradlew --no-daemon "$@"; then
    exit 0
  fi

  if [ "$attempt" -lt 3 ]; then
    echo "Gradle task failed on attempt $attempt; stopping daemons and retrying."
    ./gradlew --stop || true
    sleep $((attempt * 15))
  fi
done

echo "Gradle task failed after three attempts: $*" >&2
exit 1
