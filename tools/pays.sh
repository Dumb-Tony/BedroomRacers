#!/usr/bin/env bash
# =============================================================================
# pays.sh — does each track feature earn its place?
# =============================================================================
# Run when rails, ramps, boost pads or the driving model change:
#
#   ./tools/pays.sh
#
# SLOW: around 72 races. This is not a pre-commit check — smoke.sh is.
#
# It exists because loops were a NET TIME LOSS for three phases while every
# check passed. Rides were paced by the arc length of the ribbon, so a car was
# charged for the circumference of a vertical circle: 1.57s a lap for a loop,
# 3.70s for a corkscrew, against not being there at all. The fastest line
# through a loop was to arrive too slowly to be allowed on one.
#
# Nothing caught it because nothing had ever compared a lap WITH the feature
# against a lap WITHOUT it. Every existing check asked whether the feature
# worked. It did — perfectly, expensively.
#
# See the header in pays.html for why the control column is not optional.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
OUT="${TMPDIR:-/tmp}/br-pays"
mkdir -p "$OUT"

[ -x "$CHROME" ] || { echo "chrome not found at: $CHROME" >&2
                      echo "set CHROME=/path/to/chrome" >&2; exit 2; }

"$ROOT/tools/build-artifact.sh" >/dev/null || { echo "build failed" >&2; exit 2; }

# The bundle has no <head>, so declare the encoding or every ± and — comes out
# as mojibake.
{
  printf '<meta charset="utf-8">\n'
  cat "$ROOT/dist/play.html"
  cat "$ROOT/tools/pays.html"
} > "$OUT/pays.html"

# A generous virtual-time budget: 72 races of up to 400 simulated seconds.
"$CHROME" --headless=new --disable-gpu \
  --autoplay-policy=no-user-gesture-required \
  --window-size=1280,900 --virtual-time-budget=3600000 \
  --user-data-dir="$OUT/profile" \
  --dump-dom "file://$(cygpath -m "$OUT/pays.html" 2>/dev/null || echo "$OUT/pays.html")" \
  2>/dev/null > "$OUT/dom.html"

# awk ranges across lines so a multi-line report survives; a single-line sed
# silently kept only the first line, which threw away the very thing the report
# exists to show (learned in smoke.sh).
RESULT="$(awk '/<pre id="pays">/,/<\/pre>/' "$OUT/dom.html" \
  | sed 's/.*<pre id="pays">//; s/<\/pre>.*//' \
  | sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' \
  | head -60)"

printf '%s\n' "$RESULT"

case "$RESULT" in
  *"PAYS PASS"*) exit 0 ;;
  "")            echo "no result — the page did not finish" >&2; exit 2 ;;
  *)             exit 1 ;;
esac
