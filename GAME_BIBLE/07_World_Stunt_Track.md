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

### A corkscrew is the same ring, gone round more times over more ground

| | turns | travel | reads as |
| --- | --- | --- | --- |
| **loop** | one | short | a ring you go round on the spot |
| **corkscrew** | two | long | a spiral you travel along |

`Rails.frameAt` returns the surface offset, the car's up vector and the ribbon's
across vector for both. Everything else — capture, constant speed, release, the
edge trigger, the minimum speed — is shared.

#### THE CAMERA DECIDES WHICH PLANE THE RING LIVES IN

A real loop's circle lies in the plane containing the direction of travel. **That
cannot be drawn in this projection.** The camera's yaw follows the direction of
travel, so it looks straight down that plane's axis; screen-x comes only from
lateral offset, while depth *and* height both fold into screen-y. A travel-plane
circle therefore has constant screen-x and collapses to a vertical band. No
radius rescues it — stretching the circle forward just makes a taller band.

The first loop was built that way. It measured perfectly: full rotation, correct
apex, correct exit, right ride time, back on the road. **It drew as a flat slab
of stacked stripes**, and shipped, because every check was a number and nobody
looked at the screen. It took a player saying "I don't see any loop de loop".

Both rides now put their circle in the **lateral/up** plane, which projects to a
proper ellipse because lateral feeds screen-x and height feeds screen-y. The car
rolls through both. A pitching loop is the geometrically honest one and it is
invisible here, which makes it the wrong answer.

> **The rule this is an instance of:** a stopwatch cannot verify a picture. Any
> claim about what something *looks like* has to be checked by rendering a frame
> and looking at it. The same trap took the debug panel in Phase 1 — existence
> and slider count were checked, computed styles were not.

### Two tracks, and a division of labour

**Dresser Drop** is the trick track: a loop, a corkscrew, a climb and a
crossover, with about 15% of its lap on rails. **Shelf Run** is the tall one:
one ride and everything else is height.

Shelf Run runs **three decks** — floor, dresser at 210, shelf at 440 — so its
crossing is not one storey but two. Measured, the floor strand passes beneath
the shelf strand with a **428-unit height gap**, and a race spends 3477 / 1654 /
1530 ticks on levels 0 / 1 / 2 respectively: all three decks are genuinely
driven, not decoration.

That split exists because one track carrying every feature is how a world ends
up with nothing for its second track to do.

#### The camera follows the deck

Heights are drawn relative to `Projection.camZ`, which tracks `v.roadZ`. Without
it a car on the 300-high dresser sat 255px above the anchor and a corkscrew on
top put it 394px up — off the top of the viewport, along with the ride. It
follows the deck and never the jump, so the gap between car and shadow still
means jump height and nothing else.

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
4. ~~What does falling off do here?~~ **Resolved: you fall, you watch, you get
   put back.** `Recovery.js`, and a `openEdges` field that lets a track author a
   gap in its rail — Shelf Run has one on the outside of the shelf, 440 up.

   Not a reset to the last checkpoint. That can be half a lap back, and losing a
   lap for clipping an edge is the kind of punishment that stops people taking
   the risk in the first place. The car is lifted to **the last centreline index
   it occupied while on the road**, pointing along the track, keeping 30% of the
   speed it went over with. Measured cost: **1.18 seconds** and nearly all the
   momentum, which is enough to hurt without being a lap.

   **The fall is shown.** Teleporting on contact with the edge is cheaper and
   reads as a bug — the car vanishes with no explanation. It drops for 0.85s,
   tumbling, lands on the carpet, holds for a beat, and is then replaced. `z` is
   measured from the deck the car left, so the floor is at `-roadZ`; without
   clamping there, a 440-unit fall spends its last fraction of a second
   underneath the room.

   The gap is on the **outside of the corner only**. The inside keeps its rail,
   so there is always a line that costs nothing — the drop is a price for
   running wide, not a tax on being there. Measured across a full race, the AI
   field falls **zero** times, and neither Dresser Drop (no gap) nor any flat
   track can trigger any of it.
5. ~~Is this the right second world?~~ **Resolved: no, and it was right not to
   be.** Sandbox Speedway went first and proved the modular-world architecture,
   which is why this one cost a track file and a few dozen lines. Attempted
   first, with no evidence the architecture held, it would have been the rewrite
   the draft feared.
6. **STILL OPEN — no moving hazard on either track, and no recorded decision.**
   `05_Tracks.md`'s authoring checklist makes one mandatory, `18_Roadmap.md` and
   `PROMPTS.md` both repeat it, and both stunt tracks ship `hazards: []`. Ten of
   the twelve tracks in the game carry a `toyTrain`; these two carry none.

   It may well be right. The rails, the crossover, the corkscrew and the open
   edge are already four things asking to be read at once, and a train through
   all of that could be noise rather than danger. But nothing in this document
   or either track file says so, which means it reads as an omission rather than
   a choice — and the difference matters to whoever authors the third one.

   **Deciding it costs a lap time.** Anything moving on the racing line changes
   what a lap takes, so it means re-measuring `st-01`, `tt-dresser`, `st-02` and
   `tt-shelf` and rescaling their targets by the ratio measured. Left open on
   purpose rather than answered cheaply.

## Switching gates — built (Phase 9)

The claim below was that "a switching gate is two rails sharing a mouth". That
turned out to be true, and cheap, and it was still the least interesting thing
the feature found.

**The mechanism.** Rails sharing a `gate` name share an entry box. Which branch
you get is decided by the lane you are in when you reach it — lateral position,
not a button — so the choice is made on the approach, by the line you take. The
AI needed no new machinery to express it either: it already steers to a lateral
offset, and a gate just overrides that offset the way packed sand does.

Two things did have to change, and both are the kind of bug that does not throw:

- **The edge trigger had to key on the GATE, not the rail index.** It exists so
  a car set down inside the mouth it just left does not board again. With
  branches sharing a box, a car that rode branch 1 re-enters and matches branch
  0 first — a different index, so the trigger rearms and it immediately rides
  the other half of the fork. The round-and-round bug wearing a different hat.
- **Entering down the middle is a 70-unit jump sideways** onto whichever lane
  wins, which is three car widths. The ride now eases onto its lane across the
  first quarter. Measured, the correction never exceeds 3.6 units in a tick
  against the 5.7 a car covers driving at 340 — slower than the car is already
  moving, so there is nothing to see.

### What it actually found: every loop in the game was a trap

Building the fork meant measuring what each branch was worth, and the answer was
that **taking a rail cost more time than skipping it.**

Identical driver, identical track, full laps on Shelf Run:

| | best lap |
| --- | --- |
| no rail at all | 32.55s |
| with the loop | 34.12s (**+1.57s**) |
| with a two-turn corkscrew | 36.25s (**+3.70s**) |

Rides were paced by the arc length of the ribbon — going round a vertical ring
really is further than driving past it, so the car was charged for the
circumference. That is the physically honest reading, and it made the fastest
line through a loop **arriving too slowly to be allowed on it**: the ride parked
the car for nearly two seconds and handed back a fifth of a boost meter. The
exact inverse of the stated design, "a reward you have to be carrying speed to
collect".

Rides are now paced by **ground distance**, so forward progress is exactly the
speed the car arrived with and a ride costs nothing. The circle is superimposed
on that — the car is briefly moving further through the world than its speed
suggests, which is fine, because it is a scripted ride and the spectacle is the
point. Charging admission for it was the bug.

Consequences, all measured:

- Rail `length` now sets the ride's duration, so every rail grew to occupy real
  road: 150 → 380 on Dresser Drop's loop, 150 → 400 on Shelf Run's, against 410
  and 440 units of measured straight road at those mouths.
- A ride is 1.17s instead of 4.3s, so the corkscrew's spiral got **3.7× faster**
  and whipped the car 24.6 units a tick. Shelf Run's corkscrew radius came down
  115 → 78, putting the swing at 15.0 — matching Dresser Drop's, which is the
  one that has actually been looked at.
- Both stunt tracks got quicker and **all four events were recalibrated**:
  Dresser Drop lost 9.1s a race, Shelf Run 3.0s.

### The fork on Shelf Run

Both branches cover the same 400 units at the same pace, so neither costs time.
What separates them is what they ask and what they pay:

| | entry speed | boost | lane |
| --- | --- | --- | --- |
| low road (loop) | 230 | +0.22 | left |
| high road (corkscrew) | **320** | **+0.60** | right |

Miss the high road's entry speed and you get **nothing** — not the corkscrew and
not the loop either, because you committed to a lane. That is the bet.

**Which side each branch sits on is not cosmetic.** They exit 140 units apart
across the road and a corner follows, so the lane you leave in is worth more
than the boost you leave with. Built the other way round, the corkscrew measured
**0.43s a lap slower** than the loop despite paying nearly three times the
boost. The harder entry now gets the better exit: high road −0.32s a lap against
no rail at all, low road +0.15s.

### The field disagrees about it

A fork every driver takes the same way is a corner with extra steps. A
`gateNerve` trait decides how optimistic a driver is about the speed it will
arrive with:

| | arrives at | aims for |
| --- | --- | --- |
| Rookie | 316 | low road |
| Bully | 335 | high road |
| Technician | 345 | high road |
| Speedster | 391 | high road |

The first version had **everyone** taking the high road, because the decision
was made 620 units out where every car is still accelerating, so the estimate
needed a fudge large enough to clear the entry fee for anybody. Deciding at 340
instead — still 180 units more than a car needs to ease 70 across the road —
judges a speed close to the one it will actually turn up with, and the field
splits.

The decision is also **committed** rather than re-evaluated every tick: a driver
that recomputes as the mouth closes straddles the divider at the moment its
speed crosses the threshold, and arrives in neither lane.

## Magnetic boosters — built

The prediction below was that a booster is "a boost pad with a rail's entry
test", and content rather than a system. Both held: it cost a `kind` on the
existing rail shape, two branches inside `Rails.js`, five numbers in
`tuning.js`, and one entry in Dresser Drop's `rails` array. Nothing else in the
game knows it exists — `TrackManager` did not change, the renderer did not
change, and Audio's board/exit blips came for free.

### What separates it from a boost pad

A pad tops the meter up and lets you choose when to spend it; you drive straight
over it and nothing about the car changes. A booster **takes the car**: pulls it
onto its groove, holds it there at the speed it arrived, and throws it out the
far end. It gives **no meter at all** — `exitBoost: 0`, against the loop's 0.35
— because it has already spent the boost for you. That is the trade, and it is
the only thing stopping the two features being the same feature at two
strengths.

The ride is 520 units and 1.25s of not driving, which is the same order as the
loop's, and the same rule applies: it is kept short because being on a rail
means not being driven.

### The profile, and why it had to be measured

| | |
| --- | --- |
| hold | first 18% of the strip, clamped at arrival speed |
| throw | the rest, ramping on t² to 1.55× arrival, capped at 1.60× the car's own max |

Releasing above the car's cap **looks** like the payoff and is nearly worthless
on its own: `overspeedDecay` pulls 400 units/sec² back toward the cap, so a
modest excess is gone in a fifth of a second and buys a few dozen units of road.
The strip itself has to be quicker than driving it. Measured on a synthetic pass
entering at 366 — the speed the technician actually carries here:

| | |
| --- | --- |
| driving 520 units at 366 | 1.421s |
| riding the strip | **1.250s** |
| released at | 560 (the cap; 1.55 × 366 would have been 567) |
| exit direction | dot 1.0000 with the strip |

So the strip saves 0.171s on its own ground, and the rest of the lap's gain
arrives as speed carried out of it.

The hold is the part that could cost. Against a car already at its cap it is
free — it is doing exactly what driving would have done — and it costs only
against one that was still accelerating. What a longer hold really does is spend
strip that could have been throwing, so a fifth is the wind-up and the remaining
four fifths do the work.

### The magnet does not snap

Pulling the car all the way onto the strip's centre line is what the fiction
wants and it is wrong. A car on a rail cannot be shoved — `resolveCarContacts`
sits rail cars out — so a whole grid boarding one strip would be eight cars in
one groove driving through each other. The magnet removes **65%** of the lateral
offset instead: entering 100 off the line starts the ride 35 off it, which is a
visible sideways yank of several car widths, over the first 12% of the ride
rather than a gate's leisurely quarter. Two cars entering abreast stay abreast,
closer together.

Longitudinal position is kept exactly. Snapping that too would jerk the car up
to half a mouth along the road, and backwards is unforgivable.

### The painted strip is longer than the ride

A ride starts where the car **touched** the mouth. The entry box is axis-aligned
and this road runs at −49°, so a mouth 150 square reaches 106 units either side
of centre along the road as well as across it. The ribbon therefore runs from a
mouth-reach behind the centre to a mouth-reach past the release point — 731
units of paint for 520 units of ride — and every ride is over paint for its
whole length. Drawn ride-length only, a car that boarded late spent its last
fifth flying along bare road, which reads as the strip running out from under
it.

### Placement on Dresser Drop

On the floor, on the long straight out of the start/finish line and into the
crossing. Mouth centred on the measured centreline point at index 127,
(1972,2785); the ride runs 520 units along the chord to index 133.5,
(2305,2385). **Deviation from the road at the midpoint of that chord: 6 units,
against a half-width of 150** — the straightest stretch on the track, which is
what a fixed-direction ride needs.

Three things ruled out the more obvious spots, in ascending order of what they
cost to learn:

- The car is already at its cap for the whole of that straight, so a booster is
  the only thing that can make it faster. Somewhere it is slowing anyway, a ride
  that holds speed through a corner would be worth far more — and would delete
  the corner.
- A rail takes its deck height from the first car to ride it (`deckZ` is set at
  capture), so a booster on the raised deck draws on the bedroom floor until
  someone rides it. The corkscrew already has that quirk; a second one is not
  worth adding.
- It ends 1050 units short of the loop's mouth. Chaining the throw straight into
  the loop was tempting and is wrong: two rides back to back is 2.1s of not
  driving.

**The colour is readability, not decoration.** The first version was flat
mid-teal, and rendered, it sat 800 units from the boost pad at t 0.88 — which
the renderer draws in mint. Two differently-shaped teal patches on one stretch
of floor is exactly the confusion the legal note's palette was supposed to buy.
It is now hard alternating bands, dark against bright, which is what a magnet
looks like and is nothing like a pad.

### Measured: it is not a trap

The lesson of the loops is that a feature has to be compared against **not being
there**, so this was measured that way. `tools/pays.sh` strips every rail at
once and cannot see one booster, so the A/B strips only the booster — same
seeded RNG, same three seeds, same driver, quickest lap of each:

| | best lap | race | booster rides |
| --- | --- | --- | --- |
| with the booster | **32.45** | **98.35** | 9 of 9 |
| (control) | 32.45 | 98.35 | 9 of 9 |
| without it | 32.77 | 101.78 | 0 |

**+0.32s a lap, +3.43s a race**, with the control landing on the baseline to
0.000 — so nothing in that table is noise. It fires on every lap of every seed,
and never twice on one pass: the closest two rides are 32.4s apart.

`pays.sh` now reads **+0.08** in Dresser Drop's rail column, against −0.24 for
the same track measured the same way with only the loop and the corkscrew on it.
The booster is what turns this track's rails from a small net loss into a small
net gain.

**Owed:** `tt-dresser` and the Dresser Drop race are calibrated against a
reference lap that no longer exists. By this measurement the track is 3.4s a
race quicker than the times in `events.js` assume, and every medal on it is that
much cheaper until they are re-measured the way `05_Tracks.md` says.

## Still unbuilt

Falling track sections and wall-mounted routes. Both are content on top of what
now exists rather than new systems.

The **legal note above still binds** both of them. Dresser Drop uses violet
and teal rather than the obvious orange and blue, and draws no connector
geometry at all.

## Related

`03_Driving_Physics.md` — the flat-plane assumption this world challenges.
`08_World_Sandbox.md` — the lower-risk alternative expansion.
`18_Roadmap.md` — where expansions sit.
