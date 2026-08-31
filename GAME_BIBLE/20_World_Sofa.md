# 20 — World: The Sofa

> **BUILT.** Both tracks shipped. No new surface, no physics change, nothing
> added to `TrackManager`, `Renderer`, `AIDriver` or any other file in
> `src/systems/`.
>
> Source: `src/data/tracks/sofa-*.js`, four events in `src/data/events.js`.

## Concept

The sofa, in the evening, after somebody has dragged the knitted throw off the
back and laid it across the cushions to make a road. Books, magazines, the
remote and a mug are still on it, half the biscuit is in the cushions, and there
is a mug of tea somebody put down where a mug of tea should not go.

Every other world in the game agrees about one thing: **the road is the fastest
ground on it, and leaving the road costs you speed.** This one does not. The
road here is a woollen blanket — the grippiest and *slowest* surface in
`BR.SURFACES` — and the only quick ground on the sofa is the hard flat things
lying on top of it.

## Why the sofa, over the other five places

The five existing worlds are the town rug on the bedroom floor, the sandbox, a
stunt track built across a dresser and a shelf, and the kitchen table. The list
of places a child actually races toy cars is short, and most of it was already
taken or already ruled out:

| candidate | why not |
| --- | --- |
| the bath, or a tiled bathroom floor | Hard, wet, and *drawn as fabric*. `Renderer.groundTile` has branches for sandy, stunt and kitchen and falls through to the rug's carpet pile for anything else, so a world it does not know is a world made of wool. A bathroom rendered in pile is a worse lie than no bathroom. |
| the garden path, the patio, the driveway | Same fallback problem, and the sandbox already owns *outdoors, loose ground, dig your own line*. |
| the bed — an unmade duvet | Right material, wrong room. Three of the five existing worlds are already in the bedroom, and a fourth would make the game a bedroom game with two guest appearances. |
| a desk, a worktop, a windowsill | A smaller kitchen table. Flat, hard, high, and nothing new to say. |
| the stairs, a bookcase, a laundry pile | Elevation belongs to `07`, and falling off things belongs to `19`. Both are already mined. |

**The sofa wins on four counts, and only one of them is taste.**

1. **It is made of the one material an unknown world gets for free.** Ground
   pile, a pile-textured road, and a *stitched* kerb — the renderer's fallbacks
   are all fabric, and they are fallbacks precisely because nobody wrote a
   `sofa` branch. On a sofa every one of them is correct by accident.
2. **It is a room the game has never been in.** Not the bedroom, not the
   kitchen, not the garden.
3. **It is flat**, which hands back the mechanic `19` had to give up. `shortcut`
   and `elevation` do not compose — a cut polygon lies outside the inner kerb,
   `drawElevatedRoad` fills only between the kerbs, and on the kitchen table
   that drew as an invisible bridge over 420 units of air. A sofa seat has
   nothing under it to fall to, so both tracks here carry a real chord across a
   real detour, the way `05_Tracks.md` has required since Phase 3.
4. **It inverts the surface model** without adding a surface.

## The inversion

| surface | grip | max speed | accel | on the sofa |
|---|---|---|---|---|
| `rugRoad` — the baseline everything is judged against | 1.00 | 1.00 | 1.00 | — |
| **`blanket`** | **1.05** | **0.70** | **0.75** | **the throw: the road** |
| `rugGrass` | 0.95 | 0.82 | 0.90 | biscuit crumbs |
| `paper` | 0.60 | 1.00 | 0.85 | a magazine, the Sunday papers |
| `hardwood` | 0.78 | 1.12 | 1.05 | a hardback, the remote |
| `puddle` | 0.42 | 0.95 | 0.70 | the tea somebody put down |
| `looseSand` | 0.66 | 0.68 | 0.62 | off the throw, into deep plush |

Read that column top to bottom and the world is already explained. The road is
the *stickiest* ground and the *slowest*; everything faster than it is looser
than it, in strict order, all the way to a spilled drink at 0.42.

**So the fast line is not the road, it is a route between the things on it.**
Everywhere else a player learns to stay on the road and be smooth. Here they
learn to leave the line on purpose, aim at a hard flat object, and get off it
again before the corner.

Three consequences fall out of that, and all three are the world rather than
decoration on it:

- **There is no slow-patch hazard available, because the road is already the
  slowest thing in the game.** Every other world taxes a mistake with speed —
  the rug's grass, the table's mats, the sandbox's loose sand. Nothing here can
  take speed off you that the road has not taken already, so every hazard on the
  sofa is a **grip** hazard instead. That is not a limitation worked around, it
  is what makes this world feel different from the first corner.
- **`offSurface` is `looseSand`**, which is a surface named for another world
  and used here for its numbers. `BR.SURFACES` is a table of *modifiers*, and
  0.66 grip on 0.68 speed with 0.62 accel is exactly what deep, never-sat-on
  cushion does to a toy car: it does not so much slow you as stop you steering
  or accelerating out of it. It is also the **only** entry slower than the
  throw, and this world requires one — an off-road faster than the road is a
  free shortcut round the outside of every corner.
- **The speed streaks only appear on the hard bits.** `CAMERA.streakSpeed` is
  240 and a Red Racer on the throw caps at 350 × 0.70 = **245**. On a hardback
  it caps at 392, on the papers at 350. The sense-of-speed system that
  `12_Art_Guide.md` calls the answer to the flatness problem therefore switches
  itself on and off with the ground, and it was not tuned to do that. It was
  free.

## Why this world cost nothing

`08_World_Sandbox.md` was the first proof that a world could be content: one
file and a three-line change to `VehicleController`. `19_World_Kitchen_Table.md`
went further and added zero code. This one holds that line, and does it while
using the shortcut machinery the kitchen table could not.

| The sofa | Is | Already used by |
| --- | --- | --- |
| the knitted throw | `blanket` | Bedside Boulevard's socks, the table's place mats |
| a hardback, the remote | `hardwood` | under the bed, the table top |
| a magazine, the Sunday papers | `paper` | the table's morning post |
| biscuit crumbs | `rugGrass` | every rug track |
| the tea | `puddle` | Tide Pool's hose, the table's sugar |
| deep plush, off the throw | `looseSand` | all four sandbox tracks |
| the throw going round a book | `shortcut` + `exitBoost` | the rug's car park, the boulevard's tunnel |
| the arms, the back, the seat front | `decoration` | everywhere |
| the barrier | `walls` from `kerbHeight` | everywhere |

## The tracks

| | Three Seater | Down the Back |
| --- | --- | --- |
| lap | 7,360 units | 7,200 |
| road width | 300 | 250 |
| gates | 16 | 14 |
| zones | 6 | 8 |
| shortcut, forced | −1.72s per lap | −1.42s |
| race reference | 84.80 | 83.48 |
| laps | 30.8 / 27.2 / 26.7 | 30.4 / 26.9 / 26.1 |

Both are around 7,300 units against the kitchen table's 11,036, because **a
sofa is smaller than a table** and because the throw is slow: a lap here runs at
about 250 units/sec against the table's 322, so an 11,000-unit sofa would be a
forty-five-second lap. The world is the slowest in the game per unit of ground
and produces the second- and third-quickest races on the board — only The Big
Dig, at 78.17, gets round faster. Both of those are true at once and
neither is a mistake.

**Three Seater** is the introduction, and it teaches the ladder by laying it out
where you have to *choose* it. The front straight is two lanes — crumbs on the
inside, the remote on the outside — so the quick lane is the wrong lane for the
corner that follows. The magazine hangs over the outer edge at the far apex and
the tea is on the exit, both off the natural line, so the world's two grip
hazards punish running wide rather than taxing everyone. It also owns the only
concave corner in the game: where a corner sofa's return meets its seat, the
road bends back on itself into a left–right S.

**Down the Back** takes the same ladder and puts it **on the line, end to end**.
Four hard flat things lie nose to tail down the back cushions — hardback, TV
guide, remote, magazine — alternating inner, outer, inner, outer, each about a
half-width across, with two props standing between them. Threading all four is
the quick lap. It is also 800 units of accelerating on 0.78 and 0.60 grip, and
it delivers you to the only hairpin in the world with the tea straight across
the braking zone. The road is 50 units narrower and the chain fills most of what
is left.

That is the division of labour: **the first track asks whether you can be
bothered to aim at the fast ground; the second asks whether you can get off it
in time.**

## Target times

Technician on `normal`, five seeds, median, straight out of `tools/calibrate.sh`
— the stand-in the committed baseline is written by. Races start mid-grid.

| event | M | targets |
|---|---|---|
| `sf-01` Three Seater | **84.80** | platinum 79 |
| `tt-three-seater` | **83.43** | gold 79, silver 87, bronze 97, platinum 74 |
| `sf-02` Down the Back | **83.48** | platinum 78 |
| `tt-down-the-back` | **84.45** | gold 80, silver 88, bronze 98, platinum 75 |

Two of the four carry a spread near five seconds across the five seeds —
`sf-01` at 4.78 and `tt-down-the-back` at 4.85, against 0.42 and 0.52 for their
partners and 2.62 for the noisiest event before this world. That is the tea and
the papers doing exactly what they were put there to do: a run that clips a
0.42-grip patch at speed loses whole seconds, and a run that misses it does not.
The median is what the targets are scaled from, so the numbers are stable; but
this is the highest-variance world in the game and it is high-variance on
purpose.

`tt-down-the-back` is the only time trial in the game **slower** than the race
on its own track, by a second. Alone, the technician commits to all four links
of the chain and drops one somewhere; in traffic it takes the tidy line through
and never tries. The number is what it measured and the targets are scaled from
it, per the rule at the top of `events.js`.

Gated at 50 / 53 / 56 / 59 stars, above the kitchen table's 47. That order is
deliberate: the table teaches you to be smooth on ground with no grip, and this
world then asks you to go looking for that ground on purpose.

## What went wrong

### The shortcut was worth 2.62 seconds a lap, and the surface was not why

`AIDriver` has no idea shortcuts exist. It aims at `arena.racingLine`, which is
the centreline, so it drives the long way round every time — measured, zero
frames inside `cutPoly` across three seeds on all four shortcut tracks in the
game. The only way to measure a shortcut is to **move the racing line onto the
chord and drive it**, which is the same forcing trick `19` used on its two lines
through the east end. With that harness, and the two shortcuts that were already
in the game as controls:

| | saved per lap | forced |
| --- | --- | --- |
| the rug's car park | 535 units | **−1.37s per lap** |
| the boulevard's tunnel | 578 | **−1.16** |
| Three Seater, as first authored | 573 | **−2.62** |
| Down the Back, as first authored | 461 | **−0.24** |

One shortcut worth twice the calibrated example and one worth a fifth of it,
from the same author on the same afternoon.

**The first fix was wrong, and it was a good theory.** Three Seater's cut was
`hardwood` against a `blanket` road — both shorter *and* 60% faster — so the
surface was the obvious culprit, and this world is a world about surfaces. The
two tracks' cut surfaces were swapped and re-measured:

    Three Seater    hardwood -2.66  ->  paper    -2.62
    Down the Back   paper    -0.24  ->  hardwood -0.24

**Four hundredths and nothing.** What a shortcut is paved with is very nearly
irrelevant to what it saves.

What it saves is the **corner it does not have to take**. Three Seater's detour
was a 98-degree apex the technician had to crawl round: the forced line drove
only 352 units less per lap and gained 2.62 seconds doing it, an effective 134
units/sec on a track where the cars run at 250. Down the Back's was a 92-degree
sag it barely lifted for. Six geometries later:

| Three Seater apex | | | Down the Back sag | | |
|---|---|---|---|---|---|
| y 467 | 98° | −2.62 | y 2280 | 92° | −0.24 |
| y 610 | 74° | −1.94 | y 2420 | 110° | −1.69 |
| **y 700** | **53°** | **−1.72** | **y 2330** | **100°** | **−1.42** |

against 1.37 and 1.16 for the two examples already in the game. Three Seater
stops at 700 because a fourth step leaves nothing to bypass — the forced line
already drives only 129 units less per lap and takes all of its time out of the
corner rather than the distance.

The general form is worth keeping: **the distance a chord saves is a poor
predictor of what a shortcut is worth, and the surface is almost none of it. It
is the corner.**

### Two detours built inner kerbs that crossed themselves

Both first attempts put the bulge on a **corner** rather than on a straight,
because that is where a detour intuitively belongs. Printed from the built
geometry, both `cutPoly` lists doubled back on themselves at the apex — the
inner kerb of a turn tighter than the road is wide folds through itself — and
Three Seater's chord came out at **230 units on a 300-wide road**, a "shortcut"
shorter than two car lengths.

`05_Tracks.md` already says a shortcut needs a detour rather than a corner. What
it does not say, and now does here, is the mechanical reason: on a compact
circuit *every* corner is tighter than half the road width can survive being
offset into, and the entry angle to the chord comes out at 50–65 degrees against
the rug's 36. Put the bulge on a **straight**, where the road's own heading is
already the chord's.

### The ramp was in the starting grid

Three Seater's ramp sat at x 1785. The grid is laid back from the finish index —
eight slots at centreline points 11, 9, 7 and 5, which on that track is x 1985
down to x 1510 — so the third row started **on the ramp**. Half the field would
have launched off it before the lights went out. No numeric check has any
opinion about this; it was found by rendering the start and looking at it.

### A cut draws as bare ground, in every world

Nothing in the renderer fills `cutPoly`. The rug's car park and the boulevard's
tunnel have always drawn as plain floor with a dashed yellow chord across the
mouth, and on those tracks it is harmless: leaving the road there is a shortcut
anyway.

Here it is a lie in the expensive direction. Off the throw is `looseSand`, the
slowest ground on the sofa, so **a cut that draws as bare cushion reads as the
one place you must not go, when it is the fastest line on the lap.**

Fixed honestly rather than cosmetically: the thing you drive over is authored as
a **zone**. `surfaceAt` checks zones before `cutPoly`, and `drawZones` paints
`hardwood` as lit boards and `paper` as a printed sheet, so the rectangle drawn
is exactly the surface driven — the contract every other zone in the game keeps.
It is sized to fill as much of the wedge as a rectangle can, which means it
reaches a little way onto the road at both junctions; the book really does stick
out from under the throw where the two meet.

A first pass drew the book as **decoration** instead. That was rejected on
looking at it: decoration has no relationship to the surface underneath, so a
drawn book inside a cut would have been a picture of a claim rather than the
claim itself.

### This world has no room, and the seam showed

`Renderer.ROOMS` is keyed by world and has **no fallback** — `drawRoomFloor` and
`drawRoom` both return immediately for a world they do not know. So the sofa got
no floor beyond the play surface, no skirting and no furniture, and `drawGround`
fills only the bounds quad: rendered, a hard diagonal seam across the top of the
frame with bare `#2b2622` behind it.

A darker `haze` was considered and measured on paper first, which saved a build:
`CAMERA.depthFade` is 0.42, so even a haze exactly matching the backdrop leaves
the far ground at 58% of its own colour — a 67-point luminance step instead of
117. Better and still a seam.

What fixed it is that **a sofa's surround is more sofa**. The back cushions,
both arms and the front edge of the seat are authored as `decoration` quads
reaching past the kerbs and out over the bounds — decoration is not clipped to
`arena.bounds`, only to the viewport — with every one measured to clear the outer
kerb, the closest at 46 units, because decoration draws *after* the road and a
quad over the road paints out the edge a driver reads by.

This is the one world whose surround is data, and it works here only because a
sofa is a single object. It is not a general answer; see the open questions.

## What this world borrows and does not own

`world: 'sofa'` is a new name and six things keyed on it live in files this world
did not touch. Five fall back cleanly and one does not:

- **`Renderer.ROOMS` and `ROOM_PROPS` — no fallback at all.** The others use
  `|| this.X['town-rug']`; these two return early, so the sofa is the first world
  in the game with no room behind it. The entry it wants is small — a floor
  colour, `tile: 'boards'`, a `sill`, a wall and a skirting, plus two or three
  room props — and would let the decoration ring above be deleted.
- **`Renderer.groundTile` and `roadTile`** — both fall through to the rug's pile,
  which for upholstery is right by luck rather than by design.
- **The kerb style** — stitching, written for a printed rug. A sofa is stitched.
  Right by luck again.
- **`Renderer.WALL_PALETTES`** — books-and-blocks reds, blues and greens. The
  barrier round a sofa track is a stack of books, a games box and the cushions,
  so this one survives on its own merits.
- **`Audio.bedFor` and `AMBIENCE`** — the sofa races to the bedroom's musical
  bed.

Taking the fallbacks is deliberate, exactly as it was in `19`: the claim being
tested is that **a whole world can be pure content**, and a world that needed
five files edited before it would run is not that claim.

## Open questions

1. **Should `ROOMS` get a fallback, or should the sofa get an entry?** The
   decoration ring works and is honest, but it is a workaround for a table that
   returns early instead of defaulting. Either fix is a few lines. The entry is
   better; the fallback is more general.
2. **Should `cutPoly` be filled?** Asked in `19` about elevated tracks and now
   asked again about flat ones. Every shortcut in the game is invisible except
   for its chord, and this world had to spend a zone per track buying that back.
3. **Is 1.72s a lap too much?** It is a quarter above the rug's 1.37 on the same
   harness, and softening the apex further leaves nothing to bypass. The honest
   answer is that the shortcut is roughly worth a platinum time — 1.72 × 3 laps
   is 5.2 seconds against a platinum sitting 5.8 under the reference — which
   reads like a good target rather than a dominant one, but nobody has played it.
4. **Should the AI ever take a shortcut?** It has never taken one, on any track,
   in any world. That keeps the reference times clean and makes every shortcut a
   player-facing edge, which is defensible — but it also means the field never
   defends the inside line, and a player who finds the cut wins by six seconds
   without ever being challenged for it.
5. **Does a world with no slow surface need a different kind of hazard?** Every
   penalty here is grip. Moving hazards and props do the rest of the work, and
   both tracks lean on them harder than any other world's. Whether that is
   variety or a gap is a play question.

## Related

`05_Tracks.md` — the shortcut rules this world tests hardest, and the
readability rules the cut breaks.
`03_Driving_Physics.md` — the surface table this world reorders without editing.
`16_Content_Pipeline.md` — corner-anchored rectangles, and authoring against
measured points.
`19_World_Kitchen_Table.md` — the modular-world claim this world is the fifth
test of, and the elevation that made shortcuts impossible there.
`08_World_Sandbox.md` — `looseSand`, borrowed here for its numbers.
