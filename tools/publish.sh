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
want="$(git rev-parse HEAD)"

echo
echo "pushed ${want:0:7}. Waiting for GitHub Pages…"

# WAIT FOR *THIS* COMMIT, not merely for a build to be green.
# `pages/builds/latest` still describes the PREVIOUS build for a while after a
# push, so polling it for status == built reports success against the build
# before yours — which is exactly what happened once: the check went green and
# the site was still serving a bundle with no touch controls in it.
if command -v gh >/dev/null 2>&1; then
  for i in $(seq 1 24); do
    line="$(gh api repos/Dumb-Tony/bedroom-racers-play/pages/builds/latest \
              --jq '.commit + " " + .status' 2>/dev/null)"
    sha="${line%% *}"; status="${line##* }"
    if [ "$sha" = "$want" ] && [ "$status" = "built" ]; then
      # And confirm the bytes actually changed hands, rather than trusting the
      # build API — a CDN can still be serving the old copy.
      if command -v curl >/dev/null 2>&1; then
        live="$(curl -sS "$URL?cb=$want" | wc -c | tr -d ' ')"
        local_bytes="$(wc -c < index.html | tr -d ' ')"
        if [ "$live" = "$local_bytes" ]; then
          echo "live and serving the new build ($live bytes)"
        else
          echo "built, but the URL is serving $live bytes against $local_bytes local" >&2
          echo "give the CDN a minute: $URL" >&2
          exit 1
        fi
      fi
      echo "$URL"
      exit 0
    fi
    [ "$status" = "errored" ] && { echo "Pages build FAILED" >&2; exit 1; }
    sleep 10
  done
  echo "still building after four minutes — check $URL shortly" >&2
  exit 1
fi

echo "$URL"
