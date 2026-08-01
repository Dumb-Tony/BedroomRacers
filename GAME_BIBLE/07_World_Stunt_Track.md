# 07 — World: Plastic Stunt Track

> **STARTED (Phase 7).** The elevation model and the loop are both decided,
> built and measured, and one track ships on them — Dresser Drop. Corkscrews and
> track-switching gates are **not** built.
>
> Source: `src/data/tracks/stunt-dresser-drop.js`, `src/systems/Rails.js`, plus
> `resolveElevation` and `trackAt` in `TrackManager.js`.

## Concept

A network of bright plastic stunt tracks built around and over bedroom furniture.
Where the town rug is about a printed world at ground level, this world is about
**structure in the air** — orange track sections clipped together, climbing the
dresser, looping off the bed, launching across the room.

The fantasy is the one from the box art: the impossible layout you always wanted to
build and never had enough track pieces for.

## Wishlist from the GDD

Loops, launchers, magnetic boosters, corkscrews, track-switching gates, falling
track sections, giant jumps, wall-mounted routes.

> **Legal note.** Evoke modular plastic stunt tracks without copying branded designs,
> connector shapes, logos or colour trade dress. This world is closer to a specific
> real product line than any other in the game — the originality bar is higher here,
> not lower. Original connector geometry and an original palette are required.

## The core design problem

**This world breaks the flat-plane assumption.**

Everything in `03_Driving_Physics.md` assumes a flat 2D simulation with `z` used only
for jump arcs. A stunt track world is fundamentally about:

- Sustained elevation, not momentary height
- Routes that cross over each other vertically
- Banking and vertical track surfaces
- Loops, where the vehicle is briefly inverted

None of that is expressible in the current model. This is the single largest
technical question in the project.

### Options

1. **Discrete floor levels.** Track is flat, but tagged with a level index.
   Collision only applies within a level. Crossings are visual.
   *Cheap. Cannot do loops or banking. Probably enough for 80% of the fantasy.*

2. **True height field.** `z` becomes a real terrain property, vehicles follow track
   surface height, gravity works in 3D.
   *Expensive. Invalidates parts of the vehicle model. Enables ramps and banking,
   still awkward for loops.*

3. **Rail sections.** Loops and corkscrews are scripted rides — the vehicle is
   constrained to a spline, keeps its speed, and control is limited to lateral
   adjustment.
   *Pragmatic. Loops are non-interactive but look spectacular. Common in real
   arcade racers.*

**Leading recommendation:** option 1 for the track network plus option 3 for stunt
features. Option 2 is likely a rewrite disguised as a feature.

This must be decided **before** any stunt-track content is authored.

### RESOLVED — option 1, and it cost far less than "the largest technical question"

Discrete levels with a **continuous render height**. Two properties per
centreline point: `level`, an integer deciding what can collide with what, and
`z`, a height deciding where it draws. `level` steps at each authored key; `z`
eases between them with a smoothstep so a climb has no kink at the top.

**The simulation did not change at all.** Grip, steering, drift, gravity and
every `clearAt` threshold are the numbers they were on the bedroom rug. That is
entirely down to keeping `v.z` meaning *height above the track surface* and
adding a separate `v.roadZ` for the deck — so a car parked on a raised section
still has `z === 0` and every existing height test keeps its meaning.

What it actually took:

| | |
| --- | --- |
| `Collision.resolveWalls` | one condition: skip walls on another deck |
| `TrackManager.surfaceAt` | one filter: only segments on the car's own deck |
| `TrackManager.trackAt` | **new** — which deck a car is on, windowed (see below) |
| `Renderer.drawRoad` | quads sorted back to front instead of one even-odd fill |
| everything else | passed a `z` it previously hardcoded to 0 |

### RESOLVED — option 3 for loops AND corkscrews, exactly as recommended

`Rails.js`. The car is captured at the mouth, carried round a vertical circle at
constant speed, and released travelling the way the loop points. Ground position
creeps forward across the ride so the exit is visibly past the entry. Roll is a
**render property only** — the simulation never learns that up has moved.

Measured on Dresser Drop's loop (radius 115, arc 738):

| arrival speed | boards | ride | apex | roll | exit speed |
| --- | --- | --- | --- | --- | --- |
| 150 | **no** | — | — | — | drives on underneath |
| 220 | yes | 3.22s | 230 | 359° | 230 |
| 320 | yes | 2.27s | 230 | 359° | 327 |
| 400 | yes | 1.93s | 230 | 359° | 384 |

**The entry is the decision, and it is the only one.** Arrive under `minSpeed`
and you are not taken round — you drive along the floor beneath the loop.
Nothing is confiscated and nothing is punished: the loop is a reward you have to
be carrying speed to collect, which is the only framing that does not feel like
the game taking the wheel off you for three seconds.

Speed is preserved through the ride and carried out the far side, so a loop
neither gives nor takes pace — but a faster arrival is a shorter ride, which
keeps the approach worth caring about. `exitBoost` pays 0.35 of a boost bar.

**Edge triggered, for the same reason ramps are.** The loop sets the car down
`length` units along its own direction, which can still be inside the mouth it
just came out of — so it boards again immediately. The full-grid race showed
four rides over three laps before `railIndex` was added; three after, one a lap.

The AI needed **no changes at all**. It drives the racing line, the line goes
through the mouth, and it gets carried. An opponent taking a loop is an opponent
that happened to be going fast enough.

### A corkscrew is the same rail turning about a different axis

That is the whole difference, and it is why the second one cost a function and a
flag rather than a second system:

| | turns about | car does | displacement |
| --- | --- | --- | --- |
| **loop** | the lateral axis | pitches — nose up, over on its back, nose down | vertical only |
| **corkscrew** | the travel axis | rolls | spirals sideways *and* up |

`Rails.frameAt` returns the surface offset, the car's up vector and the ribbon's
across vector for either kind. Everything else — capture, constant speed,
release, the edge trigger, the minimum speed — is shared.

Measured, Dresser Drop's corkscrew (radius 82, two turns, 420 units of travel):
`up` swings fully sideways, lateral swing reaches 82 units at the widest, the
car passes through fully inverted twice, and it ends upright on the road. Below
`minSpeed` it is refused exactly as the loop is.

**`up` is a VECTOR, not an angle.** The first version handed the renderer a roll
angle, which barrel-rolled the car through the *loop* — where a pitch belongs.
One number cannot say which axis is turning. It also cannot be interpolated
across the wrap at 2π without producing a backflip in the last few frames.

**The honest cost.** Together the two rides are about 5.6 seconds of a 36.5
second lap — roughly 15% of the race not being driven. That is the price option 3
was always going to charge, and the draft above accepted it in advance
("non-interactive but look spectacular"). It is affordable here because both
sit on stretches that were otherwise a straight line, and it is the reason a
third ride on this track would be one too many.

### Two things that were not obvious

**A car's deck cannot be found by nearest centreline point.** At a crossover the
two nearest points are on different levels and a global search picks whichever
is geometrically closer — so a car on the upper deck gets told it is on the road
below. `trackAt` searches a window around the car's *own* last index instead,
following its progress round the lap. Measured over a three-lap race: exactly
two deck changes per lap, at the two authored transitions, with no flicker at
the crossing.

**A crossover needs a figure-eight, not a ring.** On a convex loop the raised
stretch and the floor stretch are on opposite sides of the circuit and never
meet, so there is nothing to pass over and the level index is never exercised.
The first draft of Dresser Drop was a ring and tested none of this.

## Open questions

1. ~~Which elevation model?~~ **Resolved: option 1, above.**
2. ~~Does the vehicle model survive?~~ **Resolved: yes, untouched.** Not one
   constant in `03_Driving_Physics.md` moved.
3. ~~Are the racing lines in `04_AI.md` sufficient on multi-level track?~~
   **Resolved: yes, unmodified.** The line is an ordered loop, so following it by
   index is level-correct for free — an AI cannot cut from the upper deck to the
   lower because the indices between them are the ramp. `advanceWaypoint`
   already searched a narrow window forward, for an unrelated reason, and that
   turns out to be the same defence `trackAt` needed.
4. **What does falling off do here?** Still open, and now the most pressing one.
   Dresser Drop has continuous side rails on the raised deck, so it is dodged
   rather than answered — you cannot currently leave the upper deck except by
   driving down it. A track with a gap in the rail needs a real answer: does the
   car fall to the floor and rejoin, or is it a reset?
5. ~~Is this the right second world?~~ **Resolved: no, and it was right not to
   be.** Sandbox Speedway went first and proved the modular-world architecture,
   which is why this one cost a track file and a few dozen lines. Attempted
   first, with no evidence the architecture held, it would have been the rewrite
   the draft feared.

## Still unbuilt

Magnetic boosters, track-switching gates, falling track sections and wall-mounted
routes. All four are content on top of what now exists rather than new systems —
a booster is a boost pad with a rail's entry test, and a switching gate is two
rails sharing a mouth.

The **legal note above still binds** every one of them. Dresser Drop uses violet
and teal rather than the obvious orange and blue, and draws no connector
geometry at all.

## Related

`03_Driving_Physics.md` — the flat-plane assumption this world challenges.
`08_World_Sandbox.md` — the lower-risk alternative expansion.
`18_Roadmap.md` — where expansions sit.
