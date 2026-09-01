#!/usr/bin/env bash
# =============================================================================
# career.sh — play the whole ladder from a wiped save and report what happens.
# =============================================================================
# Same shape as tools/calibrate.sh: build the bundle, append
# a question, run it in headless Chrome, print the answer.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
OUT="${TMPDIR:-/tmp}/br-career-$$"
mkdir -p "$OUT"
PROFILE="$OUT/profile-$$"
trap 'rm -rf "$OUT" 2>/dev/null' EXIT

[ -x "$CHROME" ] || { echo "chrome not found at: $CHROME" >&2; exit 2; }

"$ROOT/tools/build-artifact.sh" >/dev/null || { echo "build failed" >&2; exit 2; }

{ printf '<meta charset="utf-8">\n'
  cat "$ROOT/dist/play.html"
  cat "$HERE/career.html"
} > "$OUT/career.html"

"$CHROME" --headless=new --disable-gpu \
  --autoplay-policy=no-user-gesture-required \
  --window-size=1280,900 --virtual-time-budget=3600000 \
  --user-data-dir="$PROFILE" \
  --dump-dom "file://$(cygpath -m "$OUT/career.html" 2>/dev/null || echo "$OUT/career.html")" \
  2>/dev/null > "$OUT/dom.html"

RESULT="$(awk '/<pre id="career">/,/<\/pre>/' "$OUT/dom.html" \
  | sed 's/.*<pre id="career">//; s/<\/pre>.*//' \
  | sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g')"

case "$RESULT" in
  "")                 echo "no result — the page did not finish" >&2; exit 2 ;;
  *"CAREER DONE"*)    printf '%s\n' "$RESULT" ;;
  *) printf '%s\n' "$RESULT"; echo "harness did not finish" >&2; exit 2 ;;
esac
