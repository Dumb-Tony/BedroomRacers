# 16 — Content Pipeline

> **DRAFT.** Not covered by the source GDD. This document exists because the
> "expandable structure" pillar (`00_Vision.md`) is a promise that only holds if
> adding content is genuinely cheap. Right now, it isn't — there is no pipeline at all.
>
> Resolve before Phase 5, when track count grows past two.

## The problem

The GDD calls for six town-rug tracks, five-plus vehicles, and multiple future worlds.
Hand-writing the track schema in `05_Tracks.md` as raw JavaScript is fine for one
track, painful for three, and unworkable for six.

Every track needs surface polygons, wall segments, checkpoint gates, spawn positions,
racing-line waypoints, prop placements, hazard paths, ramp volumes, boost pads and
collectibles. That is not hand-authorable at scale.

## What "cheap to add" must mean

| Content | Target cost |
| --- | --- |
| New vehicle (stat variant) | Add a data entry + sprite sheet. No code |
| New cosmetic | Add a data entry + art. No code |
| New track | Draw it in a tool, export, add an event entry. No code |
| New event on an existing track | One config entry. No code |
| New race mode | One mode handler + config entries. No system changes |
| New world | New asset set + tracks. No engine changes |

If any row requires editing a file in `src/systems/`, the pipeline has failed.

## Track authoring options

### 1. Hand-written JS/JSON
*Now. Fine for the prototype, unworkable beyond ~2 tracks.*

### 2. Tiled (tilemap editor)
Mature, free, Phaser has first-class support. Object layers handle checkpoints,
spawns, props and waypoints; tile layers handle surfaces.

**Pros:** No tool to build. Well-documented. Artists can use it.
**Cons:** Grid-oriented — organic rug roads and curved racing lines fight the grid.
Custom properties get fiddly.

### 3. SVG authored in a vector tool
Draw the track in Illustrator/Inkscape/Figma. Paths become surface polygons and walls,
named layers carry semantics. An import script converts SVG → track JSON.

**Pros:** Natural for curved organic layouts. Artists work in a familiar tool. The
visual and the collision come from the same source.
**Cons:** Requires writing an importer. Naming conventions must be strict.

### 4. Custom in-browser editor
Build a track editor into the game itself.

**Pros:** Exactly fits the schema. Live-testable — drive the track you're editing.
**Cons:** Significant project in its own right. Classic scope trap.

### Recommendation

**Option 3 (SVG) for track geometry, with a small importer.** The rug roads are
organic curves, which is where Tiled struggles most and vector tools excel. The
importer is maybe a day's work and the tool is free and already familiar to whoever
draws the rug.

Racing-line waypoints can be authored as SVG paths too, sampled at intervals by the
importer, with `targetSpeed` from a per-path attribute.

**Do not build option 4** unless options 2 and 3 have both been tried and failed.

Decide before authoring track 2. Track 1 can be hand-written.

## Asset pipeline

### Vehicles
Per `12_Art_Guide.md`, vehicles need 16 heading frames at the camera tilt.

Proposed: model simply in 3D → script an orthographic turntable render at
`GROUND_TILT` → pack to a sprite atlas. Once that script exists, a new vehicle or
cosmetic variant is minutes of work rather than hours of drawing.

**This is why 3D-sourced vehicle art is recommended** despite the game being 2D — not
for fidelity, but because 16 hand-drawn angles per vehicle per cosmetic variant does
not scale.

### Sprites and atlases
Individual sources in `reference/`, packed atlases in `assets/sprites/`. Packing
should be a repeatable scripted step, never manual.

### Audio
Source files in `reference/`, compressed exports in `assets/audio/`. Formats and
fallback chain per `13_Audio.md`.

## Validation

Content bugs are the expensive kind — a broken checkpoint is invisible until someone
exploits it. A validation script should check, before anything ships:

- Every checkpoint is crossable and correctly ordered
- No shortcut can skip a checkpoint
- Racing lines stay within track bounds
- All spawns are on drivable surface
- No collectible is unreachable
- Every referenced sprite and audio key exists
- Track completes the `05_Tracks.md` authoring checklist

An automated headless AI lap over each track would catch most of these. Worth building
once there are three or more tracks.

### Add to that list: every rectangle must touch the road

**Every rectangle in a track definition is anchored at its CORNER, not its centre.**
Zones, ramps and boost pads all test `x <= p <= x + w`. Authoring one as though the
coordinate were the middle puts it half a box off the road, and nothing complains —
the ramp silently never launches, the pad never boosts, the puddle is never entered.

This is not hypothetical. Six of them shipped that way across the three Sandbox
tracks: three ramps that could not fire, a boost pad in the sand, and two puddles
beside the road. Every automated check passed. The AI drove clean laps. It was only
caught by driving a car at a ramp on purpose and noticing it stayed on the ground.

`TrackManager.findStrayRects()` now runs on every build and reports any rectangle
that never comes within half a road width of the centreline, on `arena.strays` and
as a console warning. **Silence is the wrong response to a feature that cannot fire.**

### And measure the jumps, don't compute them

A ramp's reach is not obvious from its `launch` number. Measured off Bucket
Brigade at racing speed:

| launch | apex | lands at | clears a 46-high prop between |
| --- | --- | --- | --- |
| 380 | 33 | 119 | never |
| 470 | 52 | 142 | 51 and 94 |
| 650 | 100 | 189 | 28 and 165 |

The first guess paired a 470 ramp with a bucket 260 units past it — beyond the whole
flight, so no jump could have cleared it at any speed. Author the ramp, measure the
envelope, then place what it is meant to clear at the middle of the window.

## Open questions

1. ~~Which authoring approach?~~ **Resolved in Phase 5: control points, not
   SVG.** A track is authored as a handful of control points plus a road width
   and a feature list. `TrackManager` generates everything else — the smoothed
   centreline, both kerbs, the collision walls, the racing line, the checkpoint
   gates and the starting grid.

   This beat the SVG recommendation on the thing that actually mattered: there
   is no importer to write and no tool to leave the editor for. A track is about
   a hundred lines of readable data.

   **Proven, not assumed.** Bedside Boulevard was authored entirely as data with
   **zero changes to anything in `src/systems/`** — the test this document set.
   It also introduced surface zones, a second hazard and a different shortcut
   without touching a system.

   Still true that hand-placing props is tedious, and a visual editor would help
   once there are six tracks. But it is no longer blocking.
2. JSON fetched at runtime, or JS modules bundled? JSON is tool-friendly; modules avoid
   a fetch and work from `file://`.
3. Who authors tracks — is this a solo project, or will there be an artist? Changes
   the tooling calculus substantially.
4. Is a build step acceptable? Atlas packing and SVG import both want one.
   See `14_Technical_Architecture.md`, open question 1.

## Related

`05_Tracks.md` — the schema being authored.
`12_Art_Guide.md` — asset requirements.
`14_Technical_Architecture.md` — how data is loaded.
