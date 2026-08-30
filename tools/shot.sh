#!/usr/bin/env bash
# =============================================================================
# shot.sh — render one frame of the real game and save it as a PNG.
# =============================================================================
#   ./tools/shot.sh <eventId> [seconds] [outfile]
#
#   ./tools/shot.sh rug-route-01                 # 6s in, /tmp/br-shot/shot.png
#   ./tools/shot.sh st-02 14 dresser.png         # 14 seconds into Shelf Run
#
# Use it whenever a claim is about what something LOOKS like. This project has
# shipped a loop that drew as a flat slab, toy pieces squashed to illegible
# slivers, and a cull that silently dropped two thirds of the visible walls —
# every one of them measured perfectly and every one was obvious in a frame.
#
# `seconds` is how much game time passes before the shot, so the camera has
# settled and the car is actually racing. It is virtual time, not wall time:
# the page runs as fast as it can and Chrome captures when the budget expires.
#
# DO NOT replace this with a hand-rolled step-and-render loop. See the header
# in tools/shot.html for what that produces and why it looks like a bug in the
# renderer rather than a bug in the harness.
# =============================================================================
set -uo pipefail

EVENT="${1:-rug-route-01}"
SECS="${2:-6}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTFILE="${3:-}"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
OUT="${TMPDIR:-/tmp}/br-shot-$$"
mkdir -p "$OUT"
[ -n "$OUTFILE" ] || OUTFILE="$OUT/shot.png"

# Per-run directory, deleted on exit — but NOT the screenshot, which is the
# whole point of running this. See the note in smoke.sh about two harnesses
# sharing one path and reporting each other's answers.
trap 'rm -rf "$OUT" 2>/dev/null' EXIT

[ -x "$CHROME" ] || { echo "chrome not found at: $CHROME" >&2; exit 2; }

"$ROOT/tools/build-artifact.sh" >/dev/null || { echo "build failed" >&2; exit 2; }

{
  printf '<meta charset="utf-8">\n'
  cat "$ROOT/dist/play.html"
  printf '<script>window.__SHOT_EVENT = %s;</script>\n' "\"$EVENT\""
  cat "$ROOT/tools/shot.html"
} > "$OUT/shot.html"

# Virtual time: the budget IS the game time that elapses before the capture.
BUDGET=$(( SECS * 1000 + 2000 ))

"$CHROME" --headless=new --disable-gpu \
  --window-size="${SHOT_W:-1280}","${SHOT_H:-900}" \
  --virtual-time-budget="$BUDGET" \
  --user-data-dir="$OUT/profile" \
  --screenshot="$OUTFILE" \
  "file://$(cygpath -m "$OUT/shot.html" 2>/dev/null || echo "$OUT/shot.html")" \
  2>/dev/null

if [ ! -s "$OUTFILE" ]; then
  echo "no image written — the page did not finish" >&2
  exit 2
fi

echo "$OUTFILE"
