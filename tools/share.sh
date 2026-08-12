#!/usr/bin/env bash
# =============================================================================
# share.sh — one file you can send to somebody.
# =============================================================================
#
#   ./tools/share.sh
#
# Produces dist/bedroom-racers.html: the whole game in a single file that opens
# by double-click, with no server, no install and no network.
#
# WHY NOT JUST SEND dist/play.html. That file is built for the artifact host,
# which wraps it in a document of its own — so it has no <!doctype>, and a
# browser opening it directly drops into QUIRKS MODE, where the box model
# changes and the layout is not the one that was tested. It is the same file
# plus a proper wrapper.
#
# The bundle is already self-contained: no CDN, no fetch, no external images.
# Verified by this script rather than assumed, because "it worked on my machine"
# is exactly what a file sent to somebody else defeats.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist/bedroom-racers.html"

"$ROOT/tools/build-artifact.sh" >/dev/null || { echo "build failed" >&2; exit 2; }

{
  echo '<!doctype html>'
  echo '<html lang="en">'
  echo '<head>'
  # The bundle opens with its own <meta charset> and <title>; both belong here.
  echo '<meta name="viewport" content="width=device-width, initial-scale=1">'
  cat "$ROOT/dist/play.html"
  echo '</html>'
} > "$OUT"

# ── verify, rather than hope ────────────────────────────────────────────────
fail=0
note() { echo "  $1"; }
bad()  { echo "  FAIL: $1" >&2; fail=1; }

grep -qi '<!doctype html>' "$OUT" || bad "no doctype — would open in quirks mode"
grep -qi '<meta charset' "$OUT"   || bad "no charset — accented characters will mangle"

# Anything that would need a network is fatal for a file sent to somebody.
if grep -qE 'src="https?://|href="https?://|fetch\(|XMLHttpRequest|new Worker\(' "$OUT"; then
  bad "references something external — it will not work offline"
else
  note "self-contained: no external fetches"
fi

bytes=$(wc -c < "$OUT" | tr -d ' ')
note "size $(( bytes / 1024 )) KB"
[ "$bytes" -gt 40000 ] || bad "suspiciously small — did the build produce anything?"

# Does it actually RUN? Load it the way a recipient would and check the game
# booted, rather than checking that a file exists.
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
if [ -x "$CHROME" ]; then
  probe="${TMPDIR:-/tmp}/br-share"
  mkdir -p "$probe"
  cp "$OUT" "$probe/index.html"
  cat >> "$probe/index.html" <<'EOF'
<script>
window.addEventListener('error', function (e) {
  document.title = 'THREW: ' + (e.message || e.error);
});
setTimeout(function () {
  var ok = !!(window.BR && BR.Game && BR.TRACKS &&
              Object.keys(BR.TRACKS).length && document.querySelector('canvas'));
  /* compatMode is the ONLY direct evidence that the wrapper did its job. A
     doctype can be present and still not be first, and quirks mode changes the
     box model — the layout would differ from the one that was tested. */
  var mode = document.compatMode;   // CSS1Compat = standards, BackCompat = quirks
  if (document.title.indexOf('THREW') !== 0) {
    document.title = !ok ? 'DID NOT BOOT'
      : mode !== 'CSS1Compat' ? 'QUIRKS MODE'
      : 'BOOTED ' + Object.keys(BR.TRACKS).length + ' tracks, standards mode';
  }
}, 2000);
</script>
EOF
  dom="$("$CHROME" --headless=new --disable-gpu --window-size=1280,900 \
        --virtual-time-budget=20000 --user-data-dir="$probe/profile-$$" \
        --dump-dom "file://$(cygpath -m "$probe/index.html" 2>/dev/null || echo "$probe/index.html")" \
        2>/dev/null | grep -o '<title>[^<]*</title>' | head -1)"
  # Bash pattern substitution is globbing, not regex — strip the tags with sed.
  title="$(printf '%s' "$dom" | sed 's/<[^>]*>//g')"
  case "$title" in
    BOOTED*) note "opens and runs — $title" ;;
    *)       bad "did not boot when opened as a file: ${title:-no title}" ;;
  esac
else
  note "chrome not found — skipped the does-it-run check"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "NOT SENDABLE" >&2
  exit 1
fi
echo "sendable: $OUT"
