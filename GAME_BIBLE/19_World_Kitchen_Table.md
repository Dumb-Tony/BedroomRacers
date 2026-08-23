# 19 — World: Kitchen Table

> **BUILT (Phase 8).** Both tracks shipped. No new surface, no physics change,
> nothing added to `TrackManager`, `Renderer` or `AIDriver`.
>
> Source: `src/data/tracks/kitchen-*.js`, four events in `src/data/events.js`.

## Concept

The kitchen table, cleared after breakfast. A high, hard, bright place: wiped
laminate, place mats, spilled sugar, crumbs, a butter dish that slides when
somebody leans on it — and an edge, 420 units above a tiled floor, with nothing
around it but the things that happen to be standing there.

Where the rug is grippy and the sand is draggy, **the table is fast and
slippery**. And where every other world's worst outcome is losing time, this
one's is losing the table.

## Why this world cost almost nothing

The sandbox (`08`) was the first proof that a world could be content rather than
a rewrite: one new file and a three-line change to `VehicleController`. This one
goes further and adds **zero code**. Every part of it already existed:

| The table | Is | Already used by |
| --- | --- | --- |
| wiped laminate | `hardwood` | Bedside Boulevard, under the bed |
| place mats | `blanket` | Bedside Boulevard, the socks |
| spilled sugar | `puddle` | Tide Pool, the hose |
| crumbs | `rugGrass` | every rug track |
| the morning's post | `paper` | nothing, until now |
| the drop | `openEdges` + `elevation` | Shelf Run's gap in the rail |
| being put back | `Recovery.js` | Shelf Run |
| barriers, mugs, breadsticks | `props`, `walls` | everywhere |

The one thing that had to be *decided* rather than reused is that the table
declares an `elevation` even though it is completely flat:

```js
elevation: [
  { t: 0.00, z: 420, level: 0 },
  { t: 0.50, z: 420, level: 0 },
],
```

That is not shape, it is **altitude**. `Recovery.check` ignores any deck at or
below `FLOOR_Z` (40), because leaving the road on the rug is a shortcut and not
a cliff. A table at 420 is unambiguously a cliff. Declaring it also buys the
look for nothing: `TrackManager` marks the track `elevated`, and the renderer
draws a raised slab with edge banding down the sides and legs under it, over a
floor a long way below. `07`'s elevation model was built for three storeys of
plastic track; used at one storey and one level it is a table, and neither file
had to change.

## What makes it different to drive

| surface | grip | max speed | accel |
|---|---|---|---|
| `rugRoad` — the baseline everything is judged against | 1.00 | 1.00 | 1.00 |
| **`hardwood`** — the table top | **0.78** | **1.12** | **1.05** |
| `blanket` — a place mat | 1.05 | 0.70 | 0.75 |
| `puddle` — spilled sugar | 0.42 | 0.95 | 0.70 |
| `rugGrass` — crumbs | 0.95 | 0.82 | 0.90 |
| `paper` — off the road, into the post | 0.60 | 1.00 | 0.85 |

The table carries **12% more top speed on 22% less grip** than the rug. It is
quick everywhere and trustworthy nowhere, and both tracks are laid out so the
extra speed has somewhere to go — Breakfast Run's south side is 2650 units of
almost no steering.

`offSurface` is `paper` rather than a slow surface, and that choice is the whole
character of a mistake here. Running wide on the rug costs 18% of your top
speed. Running wide on the table costs 40% of your **grip**, at the moment you
most need it, on the side where the barrier may not be. Off the road is not
slow, it is *slippery*, which is the worst possible way to leave a road that
ends in a drop.

## The edge

`openEdges` removes the barrier across an authored span of lap fractions:

```js
openEdges: [
  { from: 0.335, to: 0.425, side: 'outer' },
],
```

Both tracks open the **outer** side only, so every inner kerb is intact and a
complete lap is always available that never goes near an edge. It is just the
slow one.

### Measured

A car driven off the deck at 300 units/sec, 40° out from the racing line, in
each authored gap — each trial paired with a **control** at a lap fraction where
the kerb is intact, same car, same angle, same speed:

| where | fell | drop | back on the road | ended |
|---|---|---|---|---|
| Breakfast Run, in the gap | yes, 0.83s | 420 | 2.02s | on the centreline |
| Breakfast Run, kerb intact | no | — | — | 150 from centre, held |
| Table's Edge, front straight gap | yes, 0.73s | 420 | 1.92s | on the centreline |
| Table's Edge, east end gap | yes, 0.87s | 420 | 2.05s | on the centreline |
| Table's Edge, kerb intact (×2) | no | — | — | 128 / 134, held |
| town rug, flat, off the road | no | — | — | 428 out, still driving |

The pairing is the point. `17_Claude_Rules.md` lists *testing falling on a track
with no gap in its rail* as a check that already passed while proving nothing;
a fall test with no intact-kerb control is the same mistake wearing a hat. The
last row is the `FLOOR_Z` gate doing its job: the identical manoeuvre on the rug
is just off-roading.

A fall costs about **1.2 seconds of not driving** — `FALL_TIME` 0.85 plus
`HOLD_TIME` 0.35 — plus the time spent leaving the road, plus 70% of the speed
you had (`KEEP_SPEED` 0.30). You are put back on the last centreline point you
legitimately occupied, so you lose no distance. It hurts and it does not
humiliate.

### The AI never uses it

Across eight measured races — four on each track, fields of six and eight —
**not one car in the field went over an edge**. That is not luck: `AIDriver`
clamps its lateral target to `halfWidth - radius - 8`, so an opponent can only
leave the deck if something pushes it there.

This is worth stating rather than fixing. It means the gap is a **player-facing
risk**, never a source of random AI pace, which is why the reference times below
have a spread of a few tenths instead of a few seconds. Shelf Run's gap has
exactly the same property.

## The tracks

| | Breakfast Run | Table's Edge |
| --- | --- | --- |
| lap | 11036 units | 10187 |
| road width | 320 | 280 |
| gates | 24 | 22 |
| gaps in the barrier | 1 (1257 units) | 2 (1051 + 1319) |
| race reference | 103.0 | 95.3 |
| laps | 35.7 / 33.8 / 33.5 | 32.9 / 30.9 / 31.8 |

**Breakfast Run** is the introduction: wide, one gap, and that gap on the
outside of a corner you are already braking for. The mats are on the insides of
both end corners, two of the three sugar slicks are off the natural line rather
than across it, and the whole track is about learning that the ground runs out.

**Table's Edge** is 40 units narrower and has two gaps. The east end is the same
idea sharpened — longer, with the sugar moved out of the run-off and onto the
braking zone. The other is the track's reason to exist: **1051 units of missing
kerb down the outside of the front straight**, the fastest ground in the game.
The finish sits at the *far* end of that straight on purpose, so the grid starts
past the gap and the field meets it for the first time at the end of lap one,
strung out. A starting field jostling for room alongside a 420-unit drop is not
a first corner, it is a cull.

Note that the harder track is the **quicker** one, by seven and a half seconds.
On laminate it is grip rather than distance that costs time, so the narrower
circuit is not the slower circuit.

## Target times

Technician on `normal`, four runs, quickest taken, ratios from
`src/data/events.js`. Races start mid-grid.

| event | runs | M | targets |
|---|---|---|---|
| `kt-01` Breakfast Run | 103.0 / 103.1 / 103.2 / 103.3 | **103.0** | platinum 96 |
| `tt-breakfast` | 103.9 / 104.0 / 104.1 / 104.3 | **103.9** | gold 99, silver 108, bronze 121, platinum 92 |
| `kt-02` Table's Edge | 95.3 / 95.4 / 95.5 / 95.7 | **95.3** | platinum 89 |
| `tt-tables-edge` | 95.6 / 95.6 / 95.8 / 95.9 | **95.6** | gold 91, silver 99, bronze 111, platinum 85 |

Gated at 38 / 41 / 44 / 47 stars, above the stunt track. That is deliberate: the
fastest, least grippy surface in the game with half its barrier missing is not
where anybody should learn to drive.

## What went wrong

### `shortcut` and `elevation` do not compose

Both tracks were authored with a proper `shortcut` first — a chord across the
mouth of a detour, exactly the way the rug and the sandbox do it, and it
measured well: 259 and 333 units saved against the rug's 334.

Then it was rendered and looked at, and the cut was a **hole**.
`Renderer.drawElevatedRoad` fills only the band between `outer[i]` and
`inner[i]`, and a cut polygon lies outside the inner kerb by construction. On
the rug that is invisible, because the rug is underneath it. On a table there is
nothing underneath: the shortcut drew as an invisible bridge over 420 units of
air, with its yellow dashed marker painted on the kitchen floor below it,
because the marker is projected at `z = 0` too.

Every numeric check passed. Both shortcuts were removed.

### Everything visible has to sit on the deck

The same fill rule bites everything else. Any prop, hazard-path point, boost pad
or toy piece further from the centreline than `roadWidth / 2` is drawn hanging
in mid-air. The first pass of these tracks had **all thirteen props and three
whole hazard paths** out there, plus a mug that read as levitating over the
tiles, and it was invisible to every check that returns a number.

There is now a harness that walks every placeable on an elevated track and fails
on anything beyond the half width. **`stunt-shelf-run` fails it too** — two props
and a boost pad, from before anybody had looked — which is left alone here only
because that file is not this world's to edit.

Everything in both kitchen tracks is authored against **measured** centreline
points at roughly 0.62–0.65 of the half width, printed from the built geometry
rather than estimated from the control points.

### The alternate route had to be measured into existence

`05_Tracks.md` requires a second way round with real risk and a modest reward,
and with `shortcut` gone the candidate was the east end: inside over a place mat
with the barrier intact, or outside along the missing kerb where the strongest
boost pad on the track and a toy piece both are.

`tools/pays.sh` exists because loops were a net time *loss* for three phases
while every check said the feature worked, so the same question was asked here:
force the line inside, force it outside, and see which lap is quicker. Seeded,
three seeds, quickest taken, with a control column that repeated to 0.00.

The first answer was **0.17 seconds** — which is not a choice, it is a rounding
error. Two things were wrong with the reasoning behind it:

1. A place mat is not the penalty it looks like. A corner is grip-limited rather
   than speed-limited, so `blanket`'s 0.70 speed cap barely bites while its 1.05
   grip against laminate's 0.78 is enormous. The mat gives back most of what it
   takes.
2. Reading a mat as "slow" and the free line as "fast" conflated **surface**
   with **line**. Moving the mats to the outside made it worse, not better, and
   only a control column run twice made that legible — the free line's own time
   moved 1.43s between configurations because the free line was crossing the mat.

What fixed it was making the short line properly expensive: sugar across the
inside entry and a mat covering the whole length of it.

| | free line | inside | outside |
|---|---|---|---|
| Breakfast Run | 104.08 | +0.18 | **−0.20** |
| Table's Edge | 95.47 | +2.07, 12 impacts | +0.07 |

**0.38s** apart on Breakfast Run — and the edge line is now quicker than the
line the AI picks for itself. **2.00s** apart on Table's Edge. The first is
under the 0.5–1.5s a shortcut is meant to be worth, and stays there: on the
world's introductory track the boost pad and the toy piece are the rest of the
payment, and lap time is the smaller half of the reason to go out to the edge.
The gap between the two numbers is the reason there are two tracks.

## What this world borrows and does not own

`world: 'kitchen'` is a new name, and four things in files this world did not
touch are keyed on it. All four fall back to `town-rug`:

- **`Audio.bedFor`** — the kitchen races to the bedroom's musical bed.
- **`Renderer.roadTile`** — moot, since `drawElevatedRoad` never applies it. The
  deck draws as flat colour, which for polished laminate is right by accident.
- **The kerb style** — stitching, meant for a printed rug.
- **`Renderer.WALL_PALETTES`** — books-and-blocks reds, blues and greens. This
  one survives on its own merits: the barrier round a kitchen table is cereal
  boxes, packets and a stack of side plates, and those are brightly coloured.

Adding a `kitchen` entry to each is a few lines in four files and would be the
obvious first follow-up. It was left undone deliberately, because the claim
being tested was that **a whole world can be pure content**, and taking the
fallbacks is what makes that claim true rather than nearly true.

## Open questions

1. **Should surface zones be drawn?** They are not, in any world — `zones` never
   reaches the renderer. Tide Pool's seven puddles and this world's mats, sugar
   and crumbs are all invisible until you drive on them, which is squarely
   against `05_Tracks.md`: *every surface must be identifiable by sight alone.*
   It matters more here than anywhere, because the mats and the sugar are the
   whole basis of the route choice measured above.
2. **Should `shortcut` learn about elevation?** Filling `cutPoly` in
   `drawElevatedRoad` is not obviously hard, and it would give every future
   raised world the mechanic back.
3. **Should the deck audit be a build-time warning?** `findStrayRects` already
   warns about rectangles that miss the road. "Placeables that miss the deck" is
   the same class of error, it caught twenty-one real ones here across two
   brand-new tracks, and it catches Shelf Run.
4. **Is a fall the right price?** 1.2 seconds plus 70% of your speed was
   inherited from Shelf Run, where the gap is a punishment at the far end of a
   lap. Here it is on the fastest ground on the track and taken every lap on
   purpose. Nobody has yet measured whether that price makes the risk feel worth
   taking or merely survivable.
5. **Does the table want a second storey?** A chair, a worktop, a high shelf —
   the elevation model already supports it and this world used exactly one level
   of it. That is `07`'s territory, and the interesting version is a fall that
   lands you somewhere you can keep driving.

## Related

`05_Tracks.md` — surface types, shortcut rules, the readability rules this world
leans on hardest.
`07_World_Stunt_Track.md` — the elevation model, and `Recovery.js`, both used
here at one level instead of three.
`08_World_Sandbox.md` — the modular-world claim this world is the fourth test of.
`03_Driving_Physics.md` — the surface table.
`16_Content_Pipeline.md` — corner-anchored rectangles, and authoring against
measured points.
