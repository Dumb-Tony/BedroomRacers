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

nochange=0
if git diff --quiet -- index.html; then
  # Nothing new to send — but still confirm the URL is serving it, because
  # "the file here is unchanged" and "the link your friend opens is current"
  # are different claims and only the second one matters.
  nochange=1
  echo
  echo "build unchanged — checking the live link is serving it"
else
  git add index.html
  git commit -q -m "Update the playable build

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
  git push -q origin main || { echo "push failed" >&2; exit 1; }
fi
want="$(git rev-parse HEAD)"

[ "$nochange" = "1" ] || { echo; echo "pushed ${want:0:7}. Waiting for GitHub Pages…"; }

# ── WAIT FOR THE URL TO SERVE THIS BUILD ─────────────────────────────────────
# Poll the CONTENT, not the build API. Two ways the API misleads, both observed:
#
#   1. `pages/builds/latest` describes the PREVIOUS build for a while after a
#      push, so "status == built" reports success against the build before
#      yours. That happened: the check went green while the site was still
#      serving a bundle with no touch controls in it.
#   2. It also goes stale the other way — it sat on an older commit long after
#      the new content was live, so waiting for the sha to appear times out on
#      a deploy that already worked.
#
# What the URL actually returns settles both. Compared by git's own content
# hash rather than by byte count, because the working copy here has CRLF line
# endings while git stores and serves LF — a byte comparison is off by one per
# line and can never match. The first version of this check reported 473,664
# against 463,193 and called a perfectly good deploy a failure.
want_blob="$(git rev-parse "HEAD:index.html")"

if command -v curl >/dev/null 2>&1; then
  for i in $(seq 1 24); do
    live="$(curl -sS "$URL?cb=$want-$i" 2>/dev/null | git hash-object --stdin)"
    if [ "$live" = "$want_blob" ]; then
      echo "live and serving this exact build"
      echo "$URL"
      exit 0
    fi
    # Surface a genuine build failure rather than waiting out the clock.
    if command -v gh >/dev/null 2>&1; then
      st="$(gh api repos/Dumb-Tony/bedroom-racers-play/pages/builds/latest \
             --jq '.status' 2>/dev/null)"
      [ "$st" = "errored" ] && { echo "Pages build FAILED" >&2; exit 1; }
    fi
    sleep 10
  done
  echo "four minutes on and the URL is still serving the old build" >&2
  echo "  expected ${want_blob:0:12}, serving ${live:0:12}" >&2
  echo "  $URL" >&2
  exit 1
fi

echo "$URL"
