# 05 — Tracks

## Anatomy of a track

A track is data, not code. Every track is composed of:

| Element | Purpose |
| --- | --- |
| **Surface zones** | Polygons tagged with a surface type; drive feel |
| **Collision geometry** | Walls and barriers as line segments |
| **Checkpoints** | Ordered gates for lap validation and respawn |
| **Spawn positions** | Grid slots, ordered |
| **Racing lines** | Waypoint lists for AI (`04_AI.md`) |
| **Props** | Static and dynamic objects |
| **Hazards** | Moving or triggered dangers |
| **Ramps** | Launch volumes with direction and strength |
| **Boost pads** | Trigger volumes granting boost |
| **Collectibles** | Hidden toy pieces, authored track-relative — see below |
| **Decoration** | Non-interactive visual dressing |

## Track data format

**The block that used to be here described a format the game has never
loaded.** It listed `surfaces`, `walls`, `checkpoints`, `spawns`, `racingLines`
and `bounds` as things an author writes — polygons, line segments and gates, by
hand, per track. Every one of those is now GENERATED, and has been since Phase 5
(`16_Content_Pipeline.md` q1). A schema in a design document that no track file
matches is worse than no schema: it is a spec that reads as authoritative and
sends you looking for fields nothing reads.

What a track actually declares is a path and a feature list. `TrackManager.build`
turns it into the arena. Every field below is real; no single track uses all of
them (Rug Loop has no rails and no elevation):

```js
BR.TRACKS['town-rug-loop'] = {
  id: 'town-rug-loop', name: 'Rug Route Rookie Circuit',
  world: 'town-rug', laps: 3,

  // THE PATH. A handful of points, smoothed into a closed centreline.
  control: [[1200, 800], [2600, 700], /* 9 to 14 of them */],
  roadWidth: 280,            // the whole road; halfWidth is derived
  finish:   [1750, 2830],    // snapped to the nearest centreline point
  checkpointEvery: 6,        // gates, every n centreline points
  gridSlots: 8,

  kerbHeight: 22, gateOverhang: 210,
  baseSurface: 'rugRoad',    // declaring NOTHING silently defaults to
  offSurface:  'rugGrass',   // rugRoad/rugGrass — see the stunt decks
  groundColour: '#…', roadColour: '#…', weaveColour: '#…', haze: 'r,g,b',

  // OPTIONAL. Every rectangle here is ANCHORED AT ITS CORNER, never centred.
  zones:     [{ type: 'hardwood', x, y, w, h }],
  ramps:     [{ x: 2520, y: 640, w: 90, h: 240, rise: [-1, 0], launch: 470 }],
  boostPads: [{ x, y, w, h, gain: 0.4 }],
  rails:     [{ x, y, w, h, dir: [dx, dy], kind: 'loop', radius, length,
                width, minSpeed, exitBoost }],
  hazards:   [{ type: 'toyTrain', path: [[x, y], …], period: 8.0, r, h }],
  props:     [{ type: 'crayon', x, y, r, h, rot }],   // WORLD coords, and the
                                                      // only thing still
                                                      // authored that way
  decoration:[{ type: 'building', x, y, w, h, colour: '#…' }],
  shortcut:  { fromXY: [4100, 2250], toXY: [4200, 1650],
               surface: 'rugRoad', exitBoost: 0.45 },
  elevation: [{ t: 0, z: 0, level: 0 }, …],           // t round the lap
  collectibles: [{ id: 'rug-1', t: 0.18, offset: 0.8 }],   // track-relative
};
```

Generated, never authored: the centreline, both kerbs, every collision wall, the
racing line, the checkpoint gates, the starting grid, the bounds, and the item
boxes. Twelve tracks exist and not one of them writes any of it.

Anything that can be data must be data. If authoring a track requires writing
JavaScript, the pipeline has failed — see `16_Content_Pipeline.md`.

## Surface types

Handling values live in `03_Driving_Physics.md`. Design intent:

| Surface | Intent |
| --- | --- |
| **Printed rug roads** | The default. Predictable, the baseline everything else is judged against |
| **Rug grass** | Mild penalty. Cutting a corner across grass is a real choice, not a punishment |
| **Hardwood floor** | Fast but low grip. Rewards smooth input, punishes panic |
| **Blanket / clothing** | Soft, slow, uneven. Used to close off routes softly rather than with walls |
| **Plastic track** | Best surface. Fast and grippy — a reward, usually on an optional route |
| **Paper** | Slippery, and may shift when driven over. Chaotic by design |
| **Book covers** | Hard, slightly fast. Usually elevated routes or ramp approaches |

Every surface must be **identifiable by sight alone** before it is driven on.

## Checkpoints and lap validation

Checkpoints are ordered gates defined as line segments. A lap counts only when all
checkpoints have been crossed in order and the finish line is crossed last.

This prevents reverse-driving exploits and gives respawn anchors for free.

Rules:
- Checkpoint spacing must be tight enough that no shortcut can skip one.
- Every alternate route must pass through the same checkpoint sequence.
- Respawn places the vehicle at the last valid checkpoint, facing along the racing
  line, after a short delay.

## Alternate routes and shortcuts

### A shortcut needs a detour to bypass

The single most useful thing learned building these. **You cannot make a
shortcut by cutting a corner on a convex track.** A chord across a 90° arc saves
about 10% of the distance, and turning in and back out costs more than that. The
first attempt measured **0.03 seconds** — nothing — and no amount of retuning
the surface, the width or the exit boost changed it, because the geometry was
the problem.

What works is giving the road a **detour**, and letting the shortcut carry
straight on across its mouth. Then the entry barely costs any steering, which is
where the time was going. The rug circuit now swings east around a car park; the
shortcut is simply not following it. Measured **0.78s saved**, inside the range
below, at a 36° entry angle.

### Checkpoints and alternate routes

**Never place a checkpoint inside a bypassed section.** It cannot be satisfied
by both routes: deep in a detour the road's perpendicular points *away* from the
shortcut, so no amount of extra gate length makes the cut cross it. Two gates
were being skipped outright, and a lap taken via the shortcut never validated.

Gate the **junctions** instead — both routes pass through those by definition.
Verified by walking a lap each way: identical checkpoints, identical laps.

### Guidelines

- ~~**Every track has at least one.** Non-negotiable from Phase 3 onward.~~
  **Eight of the twelve do.** The rule was written before the game had a world
  where it does not work, and the tracks that broke it were right to: on the
  kitchen table there is nothing under the road, so a chord across a detour is
  an invisible bridge over a hole; on Dresser Drop the crossover is already the
  thing the track is asking you to read. Three of the four say so in the file,
  at length. **The rule is now: every track has at least one route choice, and
  a track without a `shortcut` chord must say in its header what it has
  instead.** All four now do.
- A shortcut should be **visible but not obvious** — findable by a curious player on
  lap two, not hidden behind pixel-hunting.
- Shortcuts carry **risk**: a jump that can be missed, a narrow gap, a hazard, a
  slower surface at the entry.
- Time saved should be modest — around 0.5–1.5 seconds. A shortcut that dominates
  turns the track into one route.
- Shortcuts must respect checkpoint order.

## Hazards

### Static
Building blocks, crayons, books, shoes, toy figures, puzzle pieces, cups, game
pieces, stuffed animals.

### Moving
Toy trains, rolling pencils, bouncing balls, wind-up toys, remote-controlled toys,
swinging cords, falling blocks, opening toy-box lids.

Moving hazards should be **periodic and learnable**, not random. A player on lap
three should be able to time the train. Randomness here reads as unfair.

### Surface
Spilled water, rug folds, loose paper, sand, mud, soap, sticky candy, dust patches.

### Interactive
Buttons that change routes, switches that activate ramps, gates that open
temporarily, fans that push vehicles, magnets that pull metal cars, launchers that
fire vehicles forward.

Interactive hazards are the strongest expression of the "interactive toy worlds"
pillar. Prioritise at least one per track from Phase 3.

## Prop behaviour

| Class | Behaviour |
| --- | --- |
| **Static** | Solid, immovable. Walls in disguise |
| **Knockable** | Displaced by impact, costs the player speed |
| **Destructible** | Breaks apart, minimal speed cost. Satisfying to hit |
| **Dynamic** | Simulated — rolls, falls, topples |

Bias toward knockable and destructible. A bedroom full of immovable objects feels
like a museum, not a play space.

## Readability rules

"Tracks may be hard to read" is a listed project risk. Mitigations are mandatory,
not optional:

- Road edges must have **visible boundaries** — kerbs, barriers, or a hard colour
  change. Never rely on surface texture alone.
- **Directional arrows** printed on the rug at every ambiguous junction.
- Alternate route entries get a **distinct visual marker** used consistently
  game-wide.
- The **critical path must be the widest, brightest path.**
- Any blind corner needs either a camera pull-back or a landmark visible before it.
- **Keep tall props off the inside of corners.** At the locked 17.5° camera a
  prop hides ground behind it out to 2.83 times its height — a kerb hides 2.2 car
  lengths, a building hides 170 units. Measured in `12_Art_Guide.md`.
- Test every track at mobile screen size before considering it finished.

## Authoring collectibles

Toy pieces are placed **relative to the track**, never in world coordinates:

```js
{ id: 'rug-2', t: 0.18, offset: 0.8 }   // 18% round the lap, 80% out toward
                                        // the kerb (0 = centre line)
{ id: 'rug-1', cut: 0.5 }               // halfway along a shortcut chord
```

Hand-placed `x`/`y` still works, and is how the first attempt put a piece **521
units from the road** — behind a wall, permanently uncollectable — and two more
on grass. Authoring against the track makes that impossible, because the
position is derived from the geometry rather than guessed against it.

`cut` placements are inset toward the arc, because the chord *is* the cut
polygon's closing edge and a point exactly on it lands on the boundary, where
the surface test is ambiguous.

**Verify placement, don't eyeball it.** Every piece should be on drivable
surface and within reach of the road. Both are cheap to assert.

## Authoring props — the one thing still in world coordinates

Props are placed as raw `x`/`y`, and they are the last thing in a track file
that is. That is not an oversight — a prop is scenery in a room, not a feature
of the road, and `t`/`offset` would be the wrong frame for it. But it means
props keep the mistakes collectibles were rescued from, plus two of their own.

**A prop takes the height of the nearest CENTRELINE point.** On an elevated
track that is not a decision you made; it is whichever stretch of road happens
to be geometrically closest, which on a figure-eight with three decks can be one
you were not thinking about. Shelf Run's crayon sat 303 units from a road half
150 wide and inherited z 394.5 from the drop it was beside — hanging in the air
over the floorboards, with its collision octagon hanging there too and drawn as
a grey barrier ring around nothing. Counted inside `drawProp` so the number is
post-cull: **drawn in 661 of the 2,410 frames of a lap**, eleven seconds of
every forty.

**A prop can end up inside a rail.** Dresser Drop's third block was authored a
phase before the magnetic booster, and the booster was laid over the top of it:
31 units off the axis of a 190-wide ribbon that grabs the car and throws it. It
has been a solid wall in the middle of a ride ever since the booster shipped,
and the only symptom was the AI quietly steering round it every lap.

`TrackManager.findMisplacedProps()` now runs on every build and reports both, on
`arena.badProps` and as a console warning, the same way `findStrayRects` reports
a rectangle that never touches the road.

**Measure, then render, then decide.** An audit flagged four props and two boost
pads on the two stunt tracks, on lateral distance from the centreline alone. Only
one of the six was actually wrong. The other three props are 196–441 units out
with `z` resolving to 0 — standing on the bedroom floor beside a raised deck,
which is exactly what scenery in this world is; and both pads sit within 19
units of the centreline once you measure from their CENTRE rather than their
corner anchor. The block inside the booster was not on the list at all. Lateral
distance is the wrong question; the questions are *what is my z* and *what else
is here*, and a rendered frame is what settles the first one.

## Track authoring checklist

Before a track is considered complete:

- [ ] Drivable start to finish without getting stuck
- [ ] Checkpoints prevent all reverse and skip exploits
- [ ] At least one shortcut, with genuine risk
- [ ] At least one ramp or jump
- [ ] At least one moving hazard — **ten of the twelve tracks carry a `toyTrain`;
      both stunt tracks ship `hazards: []` with no recorded decision, see
      `07_World_Stunt_Track.md` q6**
- [ ] AI completes a clean lap on all three difficulties
- [ ] AI never permanently stuck
- [ ] Readable at mobile resolution
- [ ] Surface transitions visible and audible
- [ ] Lap time in the 30–50 second range for a three-lap race
- [ ] Collectibles placed, none unreachable
- [ ] Spawn grid does not cause first-corner pileups

## Open questions

1. ~~**Authoring tool.** Hand-written JSON will not scale past two or three
   tracks.~~ **Resolved in `16_Content_Pipeline.md` q1: control points, and no
   tool at all.** The premise was the thing that turned out to be wrong. Twelve
   tracks are authored by hand today, the largest is 312 lines and a great deal
   of that is prose. See below.
2. ~~**Elevation representation.**~~ **Discrete levels with a continuous render
   height, exactly as this question guessed.** `level` decides what collides
   with what, `z` decides where it draws, and the two are independent. Built by
   Dresser Drop (two decks, one crossover) and pushed to three by Shelf Run.
   Nothing in the driving model changed to get it. See `07_World_Stunt_Track.md`.
3. ~~**Track size vs zoom.**~~ **Answerable now `groundTilt` is locked at 0.30,
   and answered by measurement below.** A lap wants 7,000–12,000 units; the
   binding constraint is not lap length but ROAD WIDTH on a portrait phone.

## Questions 1–3, answered (Phase 11)

### 1. No authoring tool, and the reason is the schema

This question assumed the schema in this document — the one with hand-authored
surface polygons, wall segments and checkpoint gates. Against *that* schema it
was right, and a tool was unavoidable.

`16_Content_Pipeline.md` q1 changed the schema instead. A track declares a
handful of control points and a feature list; `TrackManager` generates the
centreline, both kerbs, every wall, the racing line, the gates and the grid. The
question dissolved rather than being answered.

Measured across the twelve shipped track files: **118 lines at the smallest
(Bedside Boulevard), 312 at the largest (Three-Seater), median about 180**, and
**48% of those ~2,300 lines are comments** — 64% in the largest file. Control
points per track: **9 to 14.** That is the whole path. What is left after the
prose is a page of numbers, which is not what "unworkable beyond ~2 tracks"
predicted.

What is still tedious is exactly what `16_Content_Pipeline.md` says is still
tedious: hand-placing props and rectangles in world coordinates. It has cost
real bugs — six corner-anchored rectangles that could never fire, a collectible
521 units from the road, and a crayon left hanging 395 units in the air off the
side of an elevated deck. Collectibles were fixed by authoring them against the
track (`t`/`offset`); props were not, and are the remaining hand-placed thing.
**Build-time checks, not a tool, is how this project has paid for that so far**
— `findStrayRects` and `findMisplacedProps` both exist because silence was the
wrong answer.

### 2. Discrete levels, continuous height

Settled by building it. The full reasoning is in `07_World_Stunt_Track.md` and
in the header of `src/data/tracks/stunt-dresser-drop.js`; the short version is
that the alternative — continuous height with real 3D collision — would have
been a rewrite, and the discrete model cost a track file and a few dozen lines.

The one thing worth repeating here, because it is a rule and not a note: **every
wall on an elevated track must carry a `level`.** A wall without one is a wall
to every deck, so the upper kerb becomes an invisible barrier hanging over
whatever passes underneath. The build counts them and warns.

### 3. Track size vs zoom — the phone is the constraint

`groundTilt` 0.30 and `CAMERA.zoom` 1.15, measured. World units visible, against
canvas size in CSS pixels — the canvas is 100% of its host, so on a phone that
is the whole viewport:

| canvas | zoom | across | depth | ahead of the car |
| --- | --- | --- | --- | --- |
| 1280×800, parked | 1.150 | 1113 | 2319 | 1438 |
| 1280×800, top speed | 0.966 | 1325 | 2761 | 1712 |
| 900×500, parked | 1.150 | 783 | 1449 | 899 |
| 375×812, parked | 1.150 | **326** | 2354 | 1459 |
| 375×812, top speed | 0.966 | **388** | 2802 | 1737 |

Zoom does not adapt to viewport size — it is one constant, pulled back only by
speed (`CAMERA.speedZoom`). So a smaller screen shows strictly less world, and
at 0.30 the two axes lose it very differently: **depth is set by screen height
and width by screen width**, and a portrait phone keeps almost all its view
distance while losing three quarters of its width.

That is the answer, and it is not about lap length. Shipped laps run
7,190–11,701 units (median 10,000) in boxes of about 3,100–4,700 by
1,800–2,650. At 2,319 units of visible depth a median lap is a little over four
screen-depths of road, and the track boxes are three to four screen-widths
across — comfortable, with room to grow. Shipped road widths run 230–320.

**A 320-wide road on a 375px portrait phone occupies 98% of the screen width.**
At top speed the pull-back gets it to 82%. There is no room either side for the
kerb, the barrier or anything standing beyond it, which is most of what tells a
player where the road goes.

So: lap length is free, road width is not. **Keep new roads at or under 300
unless the track is meant to be driven wide**, and treat "test at mobile screen
size" in the readability rules above as a width test specifically.

## Related

`06_World_Town_Rug.md` — the flagship tracks.
`04_AI.md` — racing line authoring.
`16_Content_Pipeline.md` — how tracks get made.
