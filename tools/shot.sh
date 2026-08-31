#!/usr/bin/env bash
# =============================================================================
# shot.sh — render one frame of the real game and save it as a PNG.
# =============================================================================
#   ./tools/shot.sh <eventId> [seconds] [outfile]
#
# Set AIR=1 to hold until the car is actually airborne, for anything about
# height, shadows or landings:
#
#   AIR=1 ./tools/shot.sh rug-route-01 20 jump.png
#
#   ./tools/shot.sh rug-route-01                 # 6s in, /tmp/br-shot/shot.png
#   ./tools/shot.sh st-02 14 dresser.png         # 14 seconds into Shelf Run
#
# Use it whenever a claim is about what something LOOKS like. This project has
# shipped a loop that drew as a flat slab, toy pieces squashed to illegible
# slivers, and a cull that silently dropped two thirds of the visible walls —
# every one of them measured perfectly and every one was obvious in a frame.
#
# `seconds` is game time, advanced by stepping the simulation exactly that many
# ticks. It is deterministic: the same arguments give the same frame, which is
# what makes a before/after pair worth anything. Do NOT pace it by wall clock —
# performance.now() is frozen under headless virtual time, and the same budget
# produced the countdown on one run and three minutes of race on another.
#
# See the header in tools/shot.html before changing how it renders. Calling
# Renderer.render(game, 0) — which reads perfectly reasonably — yields an empty
# floor with the HUD floating on it, and looks exactly like a broken renderer.
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
  printf '<script>window.__SHOT_EVENT = "%s"; window.__SHOT_SECS = %s; window.__SHOT_AIR = %s;</script>\n' \
    "$EVENT" "$SECS" "${AIR:-0}"
  cat "$ROOT/tools/shot.html"
} > "$OUT/shot.html"

# Generous, and unrelated to game time: the page steps the simulation itself and
# is done long before this expires. It only has to outlast the stepping, which
# runs as fast as the machine can, not in real seconds.
# The airborne hold may step a long way through a lap before the car leaves a
# ramp, and every frame spends virtual time.
BUDGET=30000
if [ "${AIR:-0}" = "1" ]; then BUDGET=180000; fi

# --dump-dom, NOT --screenshot. The page puts the canvas out as a data URL at
# the exact frame it chose; Chrome's own screenshot fires when the virtual time
# budget expires, which is a race this kept losing — the same command gave a
# good frame and an empty one on alternate runs.
"$CHROME" --headless=new --disable-gpu \
  --window-size="${SHOT_W:-1280}","${SHOT_H:-900}" \
  --virtual-time-budget="$BUDGET" \
  --user-data-dir="$OUT/profile" \
  --dump-dom \
  "file://$(cygpath -m "$OUT/shot.html" 2>/dev/null || echo "$OUT/shot.html")" \
  2>/dev/null > "$OUT/dom.html"

TITLE="$(grep -o '<title>[^<]*</title>' "$OUT/dom.html" | head -1 |
         sed 's/<title>//; s/<\/title>//')"
case "$TITLE" in
  *"SHOT ERROR"*) echo "$TITLE" >&2; exit 2 ;;
esac

# One long line inside the <pre>; strip the data: prefix and decode.
grep -o 'data:image/png;base64,[A-Za-z0-9+/=]*' "$OUT/dom.html" | head -1 \
  | sed 's|data:image/png;base64,||' | base64 -d > "$OUTFILE" 2>/dev/null

if [ ! -s "$OUTFILE" ]; then
  echo "no image — the page did not reach its frame (title: ${TITLE:-none})" >&2
  exit 2
fi

echo "$OUTFILE   [$TITLE]"
