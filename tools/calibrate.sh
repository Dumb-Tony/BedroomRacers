#!/usr/bin/env bash
# =============================================================================
# calibrate.sh — has any event's lap time moved?
# =============================================================================
#   ./tools/calibrate.sh            compare against tools/reference-times.txt
#   ./tools/calibrate.sh --update   accept what it measures as the new baseline
#
# Run it after anything that could change how long a lap takes: the driving
# model, rails, ramps, boost pads, AI, track data, grid layout. It measures all
# eighteen events and diffs against the committed baseline.
#
# WHY A COMMITTED BASELINE AND NOT A FORMULA. The obvious version of this tool
# checks each event against its own target (platinum ~ 0.93 x reference) and
# flags the ones that disagree. That version was written first and it was
# WRONG-BY-CONSTRUCTION: it flagged fifteen events that had never changed, on a
# single measurement, because the stand-in it drove was not the stand-in that
# produced the targets. Fifteen events were edited before six older builds were
# measured and came back identical.
#
# A formula compares the game to an assumption. A baseline compares the game to
# itself, so a difference is always a real effect and never a disagreement about
# units. When something does move, scale that event's targets by the ratio you
# measured -- do NOT recompute them from a ratio you believe in.
#
# The number that moves is the finding. The number that sits still needs
# nothing done to it, however wrong its target may look.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
OUT="${TMPDIR:-/tmp}/br-calib"
BASE="$ROOT/tools/reference-times.txt"
mkdir -p "$OUT"

# Fresh profile per run; Chrome exits silently on a locked user-data-dir and the
# empty output is indistinguishable from the game hanging. See smoke.sh.
PROFILE="$OUT/profile-$$"
trap 'rm -rf "$PROFILE" 2>/dev/null' EXIT

[ -x "$CHROME" ] || { echo "chrome not found at: $CHROME" >&2; exit 2; }

"$ROOT/tools/build-artifact.sh" >/dev/null || { echo "build failed" >&2; exit 2; }

{ printf '<meta charset="utf-8">\n'
  cat "$ROOT/dist/play.html"
  cat "$ROOT/tools/calibrate.html"
} > "$OUT/calib.html"

"$CHROME" --headless=new --disable-gpu \
  --window-size=1280,900 --virtual-time-budget=1800000 \
  --user-data-dir="$PROFILE" \
  --dump-dom "file://$(cygpath -m "$OUT/calib.html" 2>/dev/null || echo "$OUT/calib.html")" \
  2>/dev/null > "$OUT/dom.html"

RESULT="$(awk '/<pre id="calib">/,/<\/pre>/' "$OUT/dom.html" \
  | sed 's/.*<pre id="calib">//; s/<\/pre>.*//' \
  | sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g')"

case "$RESULT" in
  "")                    echo "no result — the page did not finish" >&2; exit 2 ;;
  *"CALIBRATE DONE"*)    : ;;
  *) printf '%s\n' "$RESULT"; echo "harness did not finish" >&2; exit 2 ;;
esac

printf '%s\n' "$RESULT" | grep -v 'CALIBRATE DONE' > "$OUT/now.txt"

if [ "${1:-}" = "--update" ]; then
  cp "$OUT/now.txt" "$BASE"
  echo "baseline updated — $(wc -l < "$BASE" | tr -d ' ') events"
  cat "$BASE"
  exit 0
fi

if [ ! -f "$BASE" ]; then
  echo "no baseline at tools/reference-times.txt — run with --update to create it" >&2
  cat "$OUT/now.txt"
  exit 2
fi

MOVED=0
printf '  %-14s %9s %9s %9s\n' event baseline now delta
printf '  %s\n' "------------------------------------------------"
while read -r id t rest; do
  [ -z "${id:-}" ] && continue
  old="$(awk -v k="$id" '$1 == k { print $2 }' "$BASE")"
  if [ -z "$old" ]; then
    printf '  %-14s %9s %9s   NEW EVENT\n' "$id" "-" "$t"; MOVED=1; continue
  fi
  d="$(awk -v a="$old" -v b="$t" 'BEGIN { printf "%.2f", b - a }')"
  big="$(awk -v d="$d" 'BEGIN { print (d < -0.05 || d > 0.05) ? 1 : 0 }')"
  if [ "$big" = "1" ]; then
    printf '  %-14s %9s %9s %9s  <== MOVED\n' "$id" "$old" "$t" "$d"; MOVED=1
  else
    printf '  %-14s %9s %9s %9s\n' "$id" "$old" "$t" "$d"
  fi
done < "$OUT/now.txt"

echo
if [ "$MOVED" = "1" ]; then
  echo "SOMETHING MOVED. Scale that event's targets in src/data/events.js by the"
  echo "ratio measured above, then re-run with --update to accept the new baseline."
  exit 1
fi
echo "CALIBRATE PASS — every event within 0.05s of its baseline"
exit 0
