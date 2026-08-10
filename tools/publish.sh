#!/usr/bin/env bash
# =============================================================================
# publish.sh — push the current build to the public URL.
# =============================================================================
#
#   ./tools/publish.sh
#
#   -> https://dumb-tony.github.io/bedroom-racers-play/
#
# THE SOURCE REPOSITORY IS PRIVATE AND STAYS PRIVATE. GitHub Pages will not
# serve from a private repo on a free account, so the public site lives in a
# SEPARATE repository that contains nothing but the built HTML file. None of
# src/, GAME_BIBLE/, the commit history or the SCP branch is exposed by this.
#
# That separation is the whole design, so this script never adds anything to
# the publish repo except index.html and its README.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLISH_DIR="${PUBLISH_DIR:-/c/Dev/bedroom-racers-play}"
URL="https://dumb-tony.github.io/bedroom-racers-play/"

[ -d "$PUBLISH_DIR/.git" ] || {
  echo "no publish repo at $PUBLISH_DIR" >&2
  echo "set PUBLISH_DIR, or clone https://github.com/Dumb-Tony/bedroom-racers-play" >&2
  exit 2
}

# Build and verify the standalone file first — share.sh checks the doctype, the
# charset, that nothing reaches for the network, and that it actually boots when
# opened as a file. Publishing an unverified build defeats the point of having
# the check.
"$ROOT/tools/share.sh" || { echo "build is not sendable — not publishing" >&2; exit 1; }

cp "$ROOT/dist/bedroom-racers.html" "$PUBLISH_DIR/index.html"

cd "$PUBLISH_DIR" || exit 2

# Refuse to publish from anything but main: the live site is served from it.
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { echo "publish repo is on '$branch', not main" >&2; exit 2; }

if git diff --quiet -- index.html; then
  echo
  echo "no change — the live build is already current"
  echo "$URL"
  exit 0
fi

git add index.html
git commit -q -m "Update the playable build

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -q origin main || { echo "push failed" >&2; exit 1; }

echo
echo "pushed. GitHub Pages takes a minute or so to rebuild."
echo "$URL"
