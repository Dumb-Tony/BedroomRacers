#!/usr/bin/env bash
# =============================================================================
# smoke.sh — build, then check that nothing is on fire.
# =============================================================================
# Run before every commit:
#
#   ./tools/smoke.sh
#
# Builds the bundle, appends tools/smoke.html, loads it in headless Chrome and
# reports. Exits non-zero on failure, so it can gate anything.
#
# It makes NO claims about behaviour — see the header in smoke.html. It answers
# "does anything throw?" across every track, screen, event and split-screen
# layout. That is the class of bug the per-feature harnesses in this project
# miss, because each is written to answer one narrow question: a commit once
# shipped drawEvents throwing on every frame and nothing noticed.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
OUT="${TMPDIR:-/tmp}/br-smoke"
mkdir -p "$OUT"

# A FRESH PROFILE PER RUN, removed on exit.
# Chrome refuses to start on a user-data-dir another instance still holds, and
# it does so by exiting immediately with no output — which this script reported
# as "the page did not finish", indistinguishable from the game hanging. That
# cost a real debugging detour: a rendering change was blamed for a lock left
# behind by an unrelated browser window. A unique directory cannot collide.
PROFILE="$OUT/profile-$$"
trap 'rm -rf "$PROFILE" 2>/dev/null' EXIT

[ -x "$CHROME" ] || { echo "chrome not found at: $CHROME" >&2
                      echo "set CHROME=/path/to/chrome" >&2; exit 2; }

"$ROOT/tools/build-artifact.sh" >/dev/null || { echo "build failed" >&2; exit 2; }

# The bundle has no <head>, so declare the encoding or the browser guesses and
# every star and arrow comes out as mojibake.
{
  printf '<meta charset="utf-8">\n'
  cat "$ROOT/dist/play.html"
  cat "$ROOT/tools/smoke.html"
} > "$OUT/smoke.html"

"$CHROME" --headless=new --disable-gpu \
  --autoplay-policy=no-user-gesture-required \
  --window-size=1280,900 --virtual-time-budget=900000 \
  --user-data-dir="$PROFILE" \
  --dump-dom "file://$(cygpath -m "$OUT/smoke.html" 2>/dev/null || echo "$OUT/smoke.html")" \
  2>/dev/null > "$OUT/dom.html"

# A PASS report is one line; a FAIL report is many. A single-line sed matched the
# first and silently dropped the second, so a real failure came out as "the page
# did not finish" — the harness discarding the very thing it exists to show.
# awk ranges across lines, so both work.
RESULT="$(awk '/<pre id="smoke">/,/<\/pre>/' "$OUT/dom.html" \
  | sed 's/.*<pre id="smoke">//; s/<\/pre>.*//' \
  | sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' \
  | head -40)"

printf '%s\n' "$RESULT"

case "$RESULT" in
  *"SMOKE PASS"*) exit 0 ;;
  "")             echo "no result — the page did not finish" >&2; exit 2 ;;
  *)              exit 1 ;;
esac
