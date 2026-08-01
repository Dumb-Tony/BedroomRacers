#!/usr/bin/env bash
# =============================================================================
# build-artifact.sh — bundle the game into one self-contained HTML file.
# =============================================================================
# Published artifacts run under a strict CSP with no external requests, so the
# 14 source files have to become one page. This concatenates them in the same
# order index.html loads them and drops the result into the template.
#
# Run after ANY source change, then republish. Output is generated — it is
# gitignored, and index.html remains the thing you edit.
#
#   ./tools/build-artifact.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/tools/artifact-template.html"
OUT_DIR="$ROOT/dist"
OUT="$OUT_DIR/play.html"
MARKER="__GAME_SOURCE__"

# DEVELOPMENT ONLY — loaded by index.html, deliberately excluded from the
# shipped bundle. index.html is the dev page; this build is the release.
DEV_ONLY=(
  "src/ui/Debug.js"
)

# Load order matters and must match index.html.
FILES=(
  "src/config/tuning.js"
  "src/systems/MathUtil.js"
  "src/systems/Projection.js"
  "src/systems/Input.js"
  "src/data/vehicles.js"
  "src/data/events.js"
  "src/data/tracks/town-rug-loop.js"
  "src/data/tracks/bedside-boulevard.js"
  "src/data/tracks/sandbox-dune-dash.js"
  "src/data/tracks/sandbox-big-dig.js"
  "src/data/tracks/sandbox-bucket-brigade.js"
  "src/data/tracks/sandbox-tide-pool.js"
  "src/entities/Vehicle.js"
  "src/systems/VehicleController.js"
  "src/systems/Collision.js"
  "src/systems/SandGrid.js"
  "src/systems/TrackManager.js"
  "src/systems/AIDriver.js"
  "src/systems/RaceManager.js"
  "src/systems/Audio.js"
  "src/systems/SaveManager.js"
  "src/systems/ProgressionManager.js"
  "src/systems/Ghost.js"
  "src/render/Particles.js"
  "src/render/Renderer.js"
  "src/ui/HUD.js"
  "src/ui/MiniMap.js"
  "src/ui/CornerHint.js"
  "src/ui/Screens.js"
  "src/main.js"
)

# Fail loudly rather than shipping a half-built page.
for f in "${FILES[@]}"; do
  [ -f "$ROOT/$f" ] || { echo "MISSING: $f" >&2; exit 1; }
done
[ -f "$TEMPLATE" ] || { echo "MISSING: tools/artifact-template.html" >&2; exit 1; }

# Guard against index.html and this script drifting apart. Every script tag in
# index.html pointing at src/ must appear in FILES above, or be listed as
# development-only.
missing=0
while IFS= read -r ref; do
  found=0
  for f in "${FILES[@]}";    do [ "$f" = "$ref" ] && found=1 && break; done
  for f in "${DEV_ONLY[@]}"; do [ "$f" = "$ref" ] && found=1 && break; done
  if [ "$found" -eq 0 ]; then
    echo "NOT BUNDLED: $ref is loaded by index.html but missing from FILES" >&2
    missing=1
  fi
done < <(grep -o 'src="src/[^"]*\.js"' "$ROOT/index.html" | sed 's/src="//; s/"$//')
[ "$missing" -eq 0 ] || exit 1

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Split the template either side of the marker line.
awk -v m="$MARKER" 'index($0, m) { exit } { print }'  "$TEMPLATE" > "$TMP/head"
awk -v m="$MARKER" 'seen { print } index($0, m) { seen = 1 }' "$TEMPLATE" > "$TMP/tail"

{
  cat "$TMP/head"
  for f in "${FILES[@]}"; do
    printf '\n/* ==================== %s ==================== */\n' "$f"
    cat "$ROOT/$f"
  done
  cat "$TMP/tail"
} > "$OUT"

bytes=$(wc -c < "$OUT" | tr -d ' ')
echo "built  $OUT"
echo "files  ${#FILES[@]}"
echo "size   $(( bytes / 1024 )) KB"
