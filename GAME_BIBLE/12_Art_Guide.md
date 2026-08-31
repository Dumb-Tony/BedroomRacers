# 12 — Art Guide

## Overall style

Colourful, warm, playful, slightly stylised. **No photorealism.** Objects are
recognisable at a glance with exaggerated proportions.

The reference point is not a modern mobile game. It is a 1990s toy catalogue
photographed in someone's bedroom on a Saturday afternoon.

---

## The camera, measured

Rewritten after `groundTilt` was tuned from the guessed 0.62 down to **0.30**.
That is not a small adjustment, and most of what this document originally said
about drawing for it was wrong.

| | Value |
| --- | --- |
| `groundTilt` | 0.30 |
| `heightScale` | 0.85 |
| Implied camera elevation | **17.5° above the floor** |
| Vertical exaggeration | 2.83× |
| Visible world at 1280×800 | 1113 wide × **2319 deep** |
| Depth visible ahead | ~83 car lengths |

**This is not "slightly angled 2.5D".** At 17.5° the camera is barely above the
rug — a low chase view. You see the backs and flanks of things, and almost never
their tops.

### heightScale is 0.85, and that is now a decision (Phase 9)

An axonometric camera at elevation *e* compresses ground depth by sin(*e*) and
lifts height by cos(*e*). With `groundTilt` at 0.30, consistency would need
`heightScale` of **0.954**. It is 0.85, so verticals sit about **11% shorter**
than the ground plane implies.

That inconsistency was treated as a debt to be paid. **It is not.** Both values
were rendered at the same airborne moment — same seed, same car, same camera,
`dt = 0` so nothing eased between the two — and looked at.

**`heightScale / groundTilt` is an exchange rate.** Height and depth spend the
same screen axis, so one unit of height is drawn exactly where **2.83 units of
receding ground** would be drawn. That single number decides everything below.

| Jump | Apex | Lift at 0.85 | at 0.954 | Reads as this far up the road |
| --- | --- | --- | --- | --- |
| Rug Route, the book | 79 | 77px | 87px | **8.0 → 9.0 car lengths** |
| Dresser Drop | ~112 | 110px | 123px | 11.3 → 12.7 |
| Bucket Brigade | ~151 | 148px | 166px | **15.3 → 17.2** |

What the renders showed:

- **The gain is 10–19px** on a 740px view, and at the rug's book ramp it is
  almost invisible. The claim that "every jump reads higher" is true and much
  smaller than it sounds.
- **The loss is legible.** At 160 units of height the car at 0.85 already sits
  156px above a shadow drawn at 0.19 alpha; at 0.954 it is 175px, and in the
  frame it stopped reading as a car in the air and started reading as a car
  parked further up the tarmac. The height cue is the *association* between car
  and shadow, and separation past a point destroys the thing it is measuring.
- **Occlusion scales by the same ratio.** The table below — a 22-unit kerb
  hiding 2.2 car lengths — becomes h × 3.18 at 0.954, so **every barrier in the
  game hides 12% more road**. Rendered on the Dresser Drop deck this is visible:
  the taller plastic sections eat into the deck behind them and into the level
  below.

What 0.954 genuinely buys, stated fairly: barriers and props read chunkier and
more object-like, and multi-level tracks separate more — at 0.954 the floor sits
31px further below the dresser deck. Neither is worth 12% more occlusion and 12%
more height/depth ambiguity in a projection whose named risk is that it reads
flat.

And consistency is not a property this camera has to protect. `depthScale`
already shrinks objects with distance and deliberately leaves the ground plane
alone, which no orthographic camera does either. **0.85 is chosen, not
inherited.**

---

## What the low angle means for vehicles

### Frame count: 16 is not enough

The original recommendation of 16 heading frames was written for a much higher
camera. Measured worst-case corner error when the drawn frame is half a step off
the true heading, against a sprite ~32px wide on screen:

| Frames | Error | As % of sprite |
| --- | --- | --- |
| 8 | 7.2px | 22% |
| 16 | 3.6px | **11%** |
| 24 | 2.4px | 8% |
| **32** | **1.8px** | **6%** |
| 48 | 1.2px | 4% |
| 64 | 0.9px | 3% |

At a low angle a rotating car changes silhouette fast — front, flank and rear are
genuinely different shapes rather than one shape rotated. **32 frames is the
floor**, 48 for anything the player stares at.

That is two to three times the art the guide originally budgeted, and it settles
the open question below: **render vehicles from 3D**. Hand-drawing 48 angles per
vehicle per cosmetic variant is not a pipeline, it is a punishment.

### Cars read squat

A car's on-screen depth is 9.7px against 18.4px of width — its footprint reads at
**0.53 of its true proportion**. Vehicle art has to be drawn knowing it will be
squashed along the travel axis, and detail on the roof is nearly wasted.

---

## The flatness problem

**The projection has no perspective.** It is axonometric: a car 2000 units away
is drawn exactly the same size as one alongside you. Only its row on screen
differs.

At `groundTilt 0.30` that is a real readability risk. 2319 units of depth are
compressed into 800px, so a rival 1000 units ahead sits only 345px up the screen
at identical size. The scene can read as a flat stack of same-sized cars rather
than a road going away from you.

Three ways to give depth back. **All three are built**, and all three are
independently tunable so their contributions can be judged separately.

1. ~~**Scale with depth.**~~ **Built.** A little fake perspective — see below.
2. ~~**Fade with depth.**~~ **Built.** Warm haze toward the far edge.
3. ~~**Shadow falloff.**~~ **Built.** Distant shadows lose contrast.

They are deliberately separable. Each has a slider that reaches zero, so if the
combination reads as too much, the answer is which one to pull back rather than
a rebuild.

### The other half of it: speed has no flow (Phase 9)

All three above give back *depth*. None gives back **speed**, and the same
missing perspective causes both: with no convergence nothing streams past the
camera, so the ground under a car at 350 units/sec looks exactly like the ground
under one at 100. The car moves; the world does not react.

Four camera behaviours, all in `BR.CAMERA`, all separately tunable to zero:

- **Pull back with speed** (`speedZoom 0.16`). Measured, 1.15 at rest to 1.00 at
  racing pace. Scaled against **the car's own top speed** rather than a
  constant, so a slow car flat out feels as flat out as a fast one — the
  sensation is "this is as quick as I go", not "this is 350 units/sec".
- **Punch in on a boost** (`boostKick 0.10`). Zooming *in* under acceleration is
  backwards from the pull-back, and that is exactly why it works: the contrast
  sells the shove. Edge-triggered on the boost starting, or holding the button
  would pin the view punched in for the whole boost.
- **Shake on impact** (`shakePerImpact 11`, capped at 18). Driven off the
  `impacts` counter rather than a boolean — the fixed step can run several times
  per frame, so a boolean shakes once per tick of contact. Hits **compound**:
  being bounced between two cars should feel worse than one clean knock.
- **Motion streaks** past the edges above 240 units/sec. Screen space, edges
  only, because a streak across the middle sits on the road you are reading.
  Measured cost: 62 canvas operations, 2.6% of a frame.

**Per camera, not global.** `BR.CAMERA.zoom` is one number for the whole game,
but in split screen four cars are at four speeds — a shared zoom would have one
player's boost pull back everybody else's view. Everything that scales a line
width by zoom now reads the effective per-view value, or kerbs and dashes would
change thickness as the view moved.

**All of it is render-only**, which is not a claim to make loosely: ghosts record
inputs and replay them, so a camera feeding back into the simulation would
desync every one. Verified by running the same race twice from identical seeded
inputs — once rendering every frame, once drawing nothing at all — and the car
finishes at the same position to the last bit, `dx = 0.00e+0`.

### Depth scaling

**This scales OBJECTS, not the ground.** Discrete things with a single ground
anchor — cars, props, hazards, toy pieces, wall extrusions — shrink about that
anchor. The road, the rug, the markings and the finish line do not: they *are*
the plane, and scaling them would mean true perspective, which is a different and
much larger change.

That trade is deliberate and worth stating plainly: a distant car on a road that
has not narrowed is geometrically inconsistent. It reads fine because the eye
keys on objects rather than absolute road width, and it buys depth for almost
nothing. `Projection.depthScale = 0` turns it off for comparison.

Linear falloff, clamped at `depthRange`. At the default 0.30 over 2400 units:

| Distance ahead | Scale |
| --- | --- |
| At the camera | 1.00 |
| 600 units | 0.93 |
| 1200 units | 0.85 |
| 2400 units and beyond | 0.70 |

Measured: a car draws 16px wide alongside and **12px at 2000 units — a 25%
shrink** — against a flat 16px either way with scaling off.

Two details that matter:

- **Objects shrink about their ground anchor**, so they stay planted rather than
  sliding as they scale. Verified: the anchor point does not move.
- **Wall height is scaled per ENDPOINT, not per segment.** Scaling a segment as a
  whole would step the top edge between neighbours; per endpoint it varies
  continuously along the wall. Verified: **zero pixels of gap** at a shared join.

Nothing behind the camera is ever enlarged — distance only shrinks.

### Shadow falloff

Depth scaling already shrinks a shadow along with its object; this is the
**contrast** half, and it is what atmosphere actually does to a shadow — the haze
between you and it lifts its black toward the ambient.

Shares `depthRange` with depth scaling, so the two cues stay in step. At the
default 0.5 a shadow keeps 87% of its opacity at 600 units, 75% at 1200, and 50%
at 2400 and beyond.

Applies to every shadow the game draws: vehicles, props, hazards and toy pieces.
The vehicle shadow already faded with **height** — a car far from its own shadow
casts a fainter one — and the two multiply, which is correct.

Measured by capturing the black fills the renderer emits over a live race: **13
distinct shadow alphas with falloff on, against 4 with it off**. The faintest
drops to 0.18, nothing gets darker, and a car's shadow at the far edge sits at
0.21 against 0.42 alongside — halved, but still clearly present. **Shadows must
stay visible at distance**; they are the only cue for height (`03_Driving_Physics.md`),
so this cannot be pushed until they vanish.

### The depth fade

A single screen-space vertical gradient, not a per-object tint. That shortcut is
exact rather than lazy: for anything on the ground plane `sy = ry * groundTilt`,
so screen row is a **monotonic function of camera depth**. Fading down the screen
*is* fading with distance.

- Strength and reach are both tunable (`CAMERA.depthFade`, `depthFadeEnd`), with
  sliders. 0 disables it.
- It stops short of the car. Everything below `horizonBias` is behind you and
  near; hazing it would look like fog rolling in backwards.
- **Haze colour is per track.** The rug circuit uses warm afternoon light
  (`198,176,140`); Bedside Boulevard is cooler and greyer (`150,148,158`) because
  half that lap is spent under the bed. This is the hook the lighting states in
  `06_World_Town_Rug.md` will hang on.
- The gradient is cached and only rebuilt when strength, reach or colour change.

Measured: the far row shifts by `+34,+19,+22` toward the haze — warm, red gaining
most — while the near row moves by `-9,-1,+2`, which is noise.

One artifact, left deliberately: a tall object near the camera is lifted up the
screen by `heightScale` and picks up a little haze at its top. That reads as
atmosphere rather than as a bug.

**Above about 0.7 strength the far half of the track starts washing out**, which
costs the readability `05_Tracks.md` demands. The slider caps at 0.8 so that edge
is reachable but obvious.

---

## What the low angle means for props

### Sides matter, tops do not

Measured on a typical prop: the visible **side face is 1.62× the area of the
top**. At 17.5° you are looking at the flank of everything.

So: detail the sides, and do not spend effort on top surfaces. This is the exact
opposite of the instinct a top-down game trains.

### Tall props hide the track

A prop of height *h* hides ground behind it out to *h* × 2.83:

| | Hides behind it |
| --- | --- |
| 22-unit kerb | 62 units — **2.2 car lengths** |
| 36-unit block | 102 units |
| 60-unit building | 170 units |

That is a genuine readability hazard and it interacts with the rules in
`05_Tracks.md`. Practical consequences:

- **Keep tall props off the inside of corners**, where they hide the apex.
- Buildings and furniture belong in the infield or beyond the outer kerb, not
  beside the racing line.
- A kerb hiding two car lengths of road is acceptable; a block tower hiding four
  is not.

### The rotating camera is still the expensive part

The camera rotates with travel direction, so **every prop with height is seen
from all sides**. A fixed-angle sprite visibly turns to follow the player. Flat
ground decals — road print, rug pattern, tyre marks — are unaffected, because
they live on the plane and rotate with it correctly.

Cheapest mitigations, in order: keep small props flat where the fiction allows (a
fallen crayon is nearly flat anyway); build tall props as simple extruded
geometry, as the prototype does; reserve multi-angle sprite sheets for the few
hero props that need them.

---

## What the low angle means for ground art

Everything printed on the rug is compressed to **30% vertically**. Consequences:

- **Detail perpendicular to travel is lost.** A pattern that reads beautifully in
  plan turns to mush at 17.5°.
- **Elongate markings along the travel axis.** Road dashes, arrows and lettering
  need stretching to read as intended — the same trick real road paint uses, and
  for exactly the same reason.
- **Contrast beats detail.** Fine texture disappears; value changes survive.
- Kerbs and road edges do a disproportionate amount of the work, because they run
  *along* the view rather than across it. Keep them bright and unambiguous
  (`05_Tracks.md` readability rules).

---

## Scale cues

The player must be **constantly** reminded these are toys. The low camera helps
here more than the old one did: at 17.5° a crayon on the floor rises into the
frame like a fallen tree, which is exactly the intended read.

- Visible rug fibres
- Large dust particles
- Massive pencils and crayons
- Towering furniture
- Oversized carpet seams
- Huge human footprints or handprints
- Stickers used as road signs

Rule of thumb: **every frame should contain at least one object of unmistakable
real-world scale.** If a screenshot could be a normal racing game, the shot has
failed.

---

## Toy vehicle style

Vehicles look **manufactured**: painted die-cast metal, glossy plastic, wood,
rubber, clear plastic, stickers.

Character comes from wear — scratches, chipped paint, worn wheels, a peeling
sticker. A brand-new toy car is boring; a loved one has history.

Material must read at gameplay zoom, which at 18px of car width means **material
is colour and value, not texture**. The wooden car reads as wood because it is
warm brown with a matte value, not because anyone can see grain.

---

## Lighting

Warm afternoon or evening bedroom light as the default. Variations in
`06_World_Town_Rug.md` reuse the same geometry.

The low camera makes **long shadows** far more valuable than they were — they run
toward the viewer and describe the ground plane, which is otherwise compressed
almost flat. Shadow direction should be consistent per lighting state.

Lighting is also a readability risk: the night-light and under-bed states must
never make the track unreadable. Test both against `05_Tracks.md`.

---

## Colour

- **Track surfaces stay readable.** Roads are the darkest value; drivable areas
  clearly distinct from non-drivable.
- **Vehicles are saturated and distinct** — they must pop against every surface,
  and at 18px wide, hue and value are all you get.
- **Decoration is desaturated relative to gameplay elements.**
- **Hazards use a consistent warning language** across all worlds. The prototype
  already draws jumpable barriers in a warning colour; keep that convention.

Verify with a colourblind simulation and a greyscale pass. If the track reads in
greyscale, it reads for everyone.

---

## Effects

Particle effects vary by surface — dust from rug, scuffs from hardwood, sand
spray, water splash. This is a **gameplay signal**, not decoration: it is how a
player knows what they are driving on without looking at the ground.

Effects must be poolable and capped. Browser performance is a listed risk; a
drifting pack of six cars is the worst case and needs a hard particle budget.

---

## Legal constraint

Every world here is inspired by heavily-branded real products — town-map play
rugs, plastic stunt track systems, die-cast car lines.

**All layouts, object designs, colour schemes, connector geometry, printed
iconography and logos must be original.** Reference the *category*, never the
product. When in doubt, change it.

This applies to the reference material in `reference/` too — collect it for mood,
do not trace it.

---

## Asset conventions

- Sprite sheets, power-of-two where practical
- **Vehicles: 32 heading frames minimum**, 48 for hero vehicles, consistent pivot
  at the vehicle centre
- Rendered from 3D at the locked camera elevation of **17.5°**, not drawn by hand
- Shadows as separate sprites, never baked in
- Prop art prioritises side faces; top faces are nearly invisible
- Ground decals authored stretched along the travel axis
- Naming: `world_category_name_variant` (e.g. `rug_prop_crayon_red`)
- Source files in `reference/`, exported assets in `assets/`

---

## Open questions

1. ~~Final `groundTilt`~~ **Locked at 0.30.** Vehicle art can begin.
2. ~~16 or 32 heading frames?~~ **32 minimum, 48 for hero vehicles**, measured
   above.
3. ~~Are vehicles rendered from 3D or drawn by hand?~~ **3D.** At 32–48 angles
   per vehicle per cosmetic variant, hand-drawing is not viable.
4. ~~`heightScale`: 0.85 or the geometrically consistent 0.954?~~ **0.85, and
   now chosen rather than inherited.** Rendered at both, at five heights.
   `heightScale / groundTilt` is an exchange rate between height and depth —
   2.83 at 0.85, 3.18 at 0.954 — so the consistent value buys 12% more
   height/depth ambiguity and 12% more occlusion for 10–19px of extra lift.
   Measured above.
5. ~~**Fake perspective — yes or no?**~~ **Yes, as object scaling.** Built and
   tunable. The remaining sub-question is whether the ground plane should narrow
   too, which would be true perspective and a much larger change — currently it
   does not.
6. ~~Does the rug get a full illustrated texture, or is it composed from tiles?~~
   **Tiles — two of them, mismatched, plus the one thing a tile cannot do: an
   edge.** Built and measured below, +30 operations a frame.

## Related

`03_Driving_Physics.md` — the projection this guide serves.
`05_Tracks.md` — readability rules the occlusion figures feed into.
`11_UI.md` — interface art.

## Toys, not geometric shapes (Phase 9)

Direct feedback: *"I want it to look like toys, not geometric shapes."* Fair —
a car was literally a box. Four side quads, a flat top and a triangle for a
nose, and the floor was a flat colour with a **grid** ruled across it.

### What the projection dictates

`groundTilt` is 0.30, so the camera is nearly overhead. **The top face is what
you actually see**, and that decides where detail is worth putting. The first
attempt built a proper cabin with glass on its vertical front face — correct as
geometry, and worth about two pixels on screen, because a vertical pane is
edge-on from up here.

Seen from above a toy car is four bands: bonnet, windscreen, roof, rear window.
Those four in the right order say "car" at twenty-eight pixels long, which is
what a car actually occupies at racing zoom.

So the car is now: a chamfered eight-point footprint rather than a rectangle,
wheels drawn as **footprints on the ground** poking out past the body rather
than as side-on discs, a cabin pulled in at both ends so there is a bonnet and
a boot, windscreen and rear window on the top face, a gloss streak, headlights,
a bumper, and a **dark outline** round the silhouette.

The outline earns its place twice over: it separates a car from the car it is
overlapping, and it is most of why the shape reads as moulded plastic instead
of a coloured region.

**The proportions are derived from stats the vehicle already has**, so all nine
cars gained a shape without a data migration and a car added later gets one for
free. A heavy vehicle sits taller on bigger wheels. The roof is the body colour
darkened and the outline darker still — two tints of one colour keep it
obviously one moulded object, where a third hue would read as a sticker.

### The floor was graph paper

A regular grid of full-length lines at 180-unit spacing. A bedroom rug is woven
and a sandpit is rippled; neither is graph paper.

Now a repeating **tile**, not geometry. Thousands of tufts would be thousands of
path operations a frame — a pattern is one fill, because the ground plane maps
to the screen through an affine transform and a pattern can be handed that
transform directly:

    sx = cos·x − sin·y + …
    sy = tilt·sin·x + tilt·cos·y + …

giving the matrix `(cos, tilt·sin, −sin, tilt·cos, …)`. The texture therefore
rotates with the camera and lies down with the floor exactly as printed carpet
would, instead of sliding about on top of it.

Rug tiles are tufts in offset rows with a fainter cross-thread; sand is broken
ripples running one way. The tile is built with a **seeded** generator, not
`Math.random` — a tile that differed between two renders would break every
pixel-diff check in the project, and consuming the shared random stream would
desync the AI.

Measured cost of the whole pass: **+80 operations a frame** on Rug Loop, 2,332
to 2,414.

### Still geometric

Props are extruded cylinders and blocks, and the road is a flat fill. Both are
the obvious next targets.

### Props: four shapes, not four colours (Phase 9)

Every prop was the **same extruded octagon**. A crayon, a wooden block, a
bucket and a spade differed only by fill colour, which is the literal form of
"geometric shapes rather than toys".

The fix is not more polygons. It is four silhouettes that are recognisable from
overhead, because at `groundTilt` 0.30 the top face is what a player sees and a
prop is thirty pixels across:

| | reads as | what carries it |
| --- | --- | --- |
| Crayon | long with a point | slim barrel, two-faced tip with a ridge, paper bands |
| Block | square | a square footprint — an eight-sided block is a bollard |
| Bucket | round and hollow | taper from a narrow base, rim lip, dark interior |
| Spade | a T | blade, shaft and grip at **three different heights** |

Two things that had to be got wrong first to be seen:

- **The crayon was drawn at its full collision radius** and came out a fat red
  wedge. A crayon is read almost entirely by being long and thin, so the barrel
  is now 0.36 of its height across and the tip gets a third of the length to
  taper over.
- **The spade's blade, shaft and grip were all the same height**, so they merged
  into one yellow lump. Reading it from overhead depends entirely on those being
  three different heights.

They share one extrusion helper that takes a local footprint and two heights, so
a new prop is a footprint and a lid rather than a new renderer.

### The road: printed on the rug, not laid on it (Phase 9)

The last obviously geometric surface. One flat fill, on a floor that had just
gained a weave — which read as two separate materials sitting next to each
other, when the whole conceit is that **the track is part of the rug**.

The road now takes the same tile treatment as the floor, and the two share one
`groundPattern` helper. That sharing is the point rather than tidiness: both are
printed on the same flat plane, and a road whose texture slid relative to the
rug underneath it would give the trick away immediately.

It costs **one extra fill and no extra geometry** — `fill` does not clear the
path, so the texture goes down through the same path the base colour just used.

What the surface is depends on what the track is made of, and the worlds
disagree:

| World | Surface | Why |
| --- | --- | --- |
| Town rug | the floor's own tuft geometry, lighter | printed on fabric: ink hides some pile without flattening it |
| Sandbox | dense fine grain | packed sand, finer than the loose ripples beside it |
| Stunt | seam lines and a sheen | moulded plastic has no grain — it has mould lines |

Measured across the whole art pass — cars, floor, props and road together —
Rug Loop went from **2,332 to 2,374** operations a frame. Forty-two.

### Kerbs are made of something (Phase 9)

One pale line, in every world. The track edge is the thing a driver reads most
often, so it is worth the character — and what a track edge is *made of* differs
by world:

| World | Edge | Why |
| --- | --- | --- |
| Town rug | stitched hem | the road is printed on fabric, so its border is sewn |
| Sandbox | timber with plank joints | it is the frame of the sandpit |
| Stunt | alternating light/slate blocks | moulded plastic edging |

`05_Tracks.md` is firm that road edges must be unmistakable and must never rely
on texture alone, so **every world keeps the solid continuous line underneath**.
The character is drawn on top of readability, never instead of it. The stunt
blocks are light-and-slate rather than the obvious orange-and-blue, because the
legal note in `07_World_Stunt_Track.md` binds the palette here too.

**Not drawn with `setLineDash`.** Dashing is the obvious way to draw stitching
and it is a trap: a track outline is around ten thousand world units long, so a
six-unit dash asks the rasteriser to subdivide it into a few thousand pieces,
twice, every frame. The marks are generated at a stride over the edge points
instead — about sixty per edge rather than sixteen hundred, at a spacing chosen
to look right rather than one that falls out of a dash length.

### Walls are things that were already in the room (Phase 9)

One grey-brown for every segment on every track, which drew as a single
unbroken ribbon — the last obviously geometric thing once the surfaces were
done. A bedroom track is walled in by whatever was to hand, and those things are
not identical to each other:

| World | Barrier |
| --- | --- |
| Town rug | books and blocks laid end to end |
| Sandbox | timber planks, warm and varied |
| Stunt | moulded plastic barrier sections |

Each segment takes a colour from its world's palette by a **hash of its own
position** — stable every frame, and never touching the shared random stream
the AI draws from. The drawn height varies slightly with the same hash, so the
top edge is a row of separate objects rather than one ruled line, and a dark
seam at each join stops neighbours in the same tone merging back into a ribbon.

Two things deliberately do **not** vary:

- **Jumpable barriers keep their warning colour** in every world. That is how a
  player tells at a glance what to fly over rather than avoid, and no amount of
  character is worth losing it.
- **Only the DRAWN height varies.** `H` still governs what a car has to clear.
  A barrier that looked lower than it collides would be a lie the player pays
  for, so jumpable segments do not vary at all.

### Toy pieces are toys (Phase 9)

A four-pointed gold star — the generic video-game collectible, in the one place
in this game literally called a **toy piece**. Finding every one is the only
route to the Heirloom (`09_Vehicles.md`), so they are meant to be a collection,
and five identical stars on a track is not a collection.

Four objects now — a building brick with studs, a jigsaw piece with a tab and a
blank, a five-pip die, a glass marble — chosen by a **hash of the piece's id**,
so a given piece is always the same thing and always the same between renders.

Two decisions carry it:

- **The signal stays constant.** A gold ring on the ground under every piece.
  The object varies; "there is something to collect here" must not, or variety
  costs readability.
- **They stand up and face the camera.** Drawn flat on the ground plane,
  `groundTilt` 0.30 squashes a piece to a third of its height and a brick
  becomes a sliver — the first version did exactly that and the studs and pips
  were illegible. Upright billboards are the only way the detail survives. The
  spin is faked by squeezing horizontally, like a card turning on the spot:
  cheaper than rotating geometry and it reads as the same thing.

### Boost pads say which way (Phase 9)

A flat translucent rectangle with an outline: a UI element lying on a rug, and
the last thing on the track that still looked drawn by a programmer rather than
printed by a toy company.

A speed strip on a play mat is **chevrons**, and they do a job a rectangle
cannot — they say *which way*. Three of them, scrolling forward and fading in
and out at either end, so the strip reads as "go" rather than as a coloured
patch.

**The plate keeps the authored rectangle exactly.** What you see is still what
triggers the boost; only the markings inside it are new. A prettier shape that
disagreed with its own trigger area would be the same class of lie as a barrier
drawn shorter than it collides.

A pad is authored as an axis-aligned rectangle with **no heading**, so the
direction comes from the racing line underneath it and is cached on the pad —
the line does not move. The scroll costs nothing extra: it rides the phase
already being advanced for the bobbing toy pieces.

### The rug is a rug now (Phase 9)

Open question 6, resolved by building it: **tiles, not an illustration** — but
the question was framed wrongly, and the framing is the interesting part.

The floor already had a tile. It was a *weave*: 128 units of tufts, which is
**material**, and it made the floor read as green felt going on forever. A town
rug is not felt. It is a printed picture of a town, and a printed picture is
**imagery**, which needs a tile large enough for a motif to be an object rather
than a repeat. So the floor is now three layers through the one
`groundPattern` transform — print, print, weave, all under the road:

| Layer | Size | Carries |
| --- | --- | --- |
| Field | 1024 | one playing field, one parkland with trees, a pond, a hedge, worn patches |
| Town | 768 | one cluster of house plots, one lane, garden beds |
| Weave | 128 | the pile — unchanged |

**Two print layers, at deliberately mismatched sizes.** Each tiles on its own
period, so the pair only truly repeats every 3,072 units, and the single grid a
lone tile rules across the floor never forms.

#### What had to be got wrong first

The first attempt used 640 and 448 and was generous with them — four houses, a
car park, two footpaths and a hedgerow in each. It came out as **wallpaper**.
The camera sees 1,113 × 2,319 units, so a 448 tile repeats five times across the
frame and eight down it; the eye locks onto that period immediately, and what
you get is rows of identical roofs and footpaths meeting in a regular lattice.

That is the real content of the "a single illustration looks better" argument in
the original question. It was never about fidelity. **It is about period.** An
illustration wins because it has none. A tile can win the same argument by being
bigger than it is detailed, which is the fix:

- **Tiles bigger than the frame is wide.** One or two features each, not a
  suburb in every direction.
- **Nothing spans a tile edge.** The lane in the town layer stops inside the
  tile. Drawn out to the edges it met its own copy on the other side and ruled a
  continuous diagonal across the whole floor — the single most obviously tiled
  thing in the first attempt.
- **Soft edges.** A straight edge that repeats is a grid line. Everything in the
  field layer is an ellipse.
- **Printed line art.** At the alphas readability allows, a house is a pale
  smudge. A dark outline and a ridge line turn it into a drawn shape — the same
  thing the outline does for the cars, for the same reason.

One limit is worth stating because it is not fixable and it is not the tiling's
fault. **A printed motif is only square from one camera angle.** The camera
rotates with travel, so the 30% squash falls on a different axis every corner:
driving straight up a world axis turns a house plot into a thin bar, and the
same plot is a proper rectangle a quarter of a lap later. No amount of
pre-stretching helps, because the trick `05_Tracks.md` uses for road markings —
elongate along the travel axis — needs a travel axis that stays put. It is the
reason the print is carried by **blocks of hue and value** rather than by
iconography, and it would apply identically to a single illustration.

#### The edge, which is why the answer is not simply "tiles"

A repeat has no edge, so a tiled floor is an *infinite* floor, and an infinite
green field is a field rather than a rug in a bedroom. **A rug is an object
lying on the floor, and what says so is that it stops.**

So the rug gets a bound edge: binding tape, stitching along its inside, and a
dark lip against the boards. The arena is the outer road edge plus 400 units and
the tape is 62 wide, so the binding sits about **twelve car lengths past the
barrier** — in shot from the road at the edges of the map, never anywhere a car
can reach it. This is the piece neither option in the original question would
have produced, because both were about *texture*.

#### Readability and cost

`05_Tracks.md` requires the road to be unmistakable, so the print is hue and a
few percent of value, and never a pale hard edge — that is the kerb's job and
stays the kerb's alone. Measured on the same frame with the layers switched off
and on, mean luminance: **road 66.5 either way**, rug 124.9 → 125–136. The
value gap the track is read by is untouched, and the greyscale pass still has
the road as the darkest thing on screen and the kerb as the brightest line.

Cost, same frame, layers off then on: **3,955 → 3,985 operations. Thirty** —
two extra pattern fills and the hem. Measured the other way, by swapping the
old two-path `drawGround` back in on a live frame, the rug's ground quad costs
**+24** and **sand and the stunt floor are 6 operations *cheaper* than before**:
the quad's path is now built once and filled per layer rather than rebuilt per
texture, which was already paying for two paths to draw one.

### Cars are moulded, not coloured (Phase 12)

The same note as Phase 9, one level down: *"real materials, visible — you should
be able to tell what each thing is made of."* The floor, the road, the kerbs,
the walls and the props had all been given a material by then. **The cars had
not.** A car was a chamfered footprint, a cabin, a windscreen and an outline —
nine of them differing only in hue and dimensions, every face a flat fill, and
every one lit identically no matter which way it was pointing.

There is a light in the room now (`Projection.light`). This is what it is for.

#### First: what this camera actually shows you of a car

The guide says in one place that the top face is what you see, and in another
that a prop's sides are 1.62x the area of its top. For a car both are half
right, and the exact answer decides everything else. Red Racer, 28 x 16 x 11:

| face | screen area | seen? |
| --- | --- | --- |
| top of the shell | 28 x 16 x 0.30 = **134** | **always, all of it** |
| one flank | 28 x 5.1 x 0.85 = 120 | only the near one |
| the nose | 16 x 5.1 x 0.85 = 69 | **never** |

**A side face is an extrusion downward from its own footprint edge**, so on the
far side of the car it hangs into the middle of the top polygon — which is
drawn immediately afterwards and covers it. Traced on Red Racer: the nose quad
occupies screen rows -10.8 to -6.5, and the bonnet drawn over it covers -10.8
to -2.4. Only the near edges hang out past the silhouette.

That has two consequences, and the first is a bug that had been shipping for
three phases.

#### The bumper was painted on the bonnet

**It was drawn on the nose elevation, and drawn last.** So it was not a bumper
at all: it was a pale slab two thirds of the width of the car, lying across the
middle of the paint like a badly-placed racing stripe. It is plainly there in
the before shot, and it is the brightest thing on every car in the frame.

Nothing had ever looked. It is exactly the rule the windscreen learned in Phase
9 — a vertical pane at this camera is worth about two pixels — and the lesson
had been applied to the glass and to nothing else.

The bumper is now a bar across the front of the TOP face. So are the lamps, and
they had to be folded **into** it: bumper and lamps were separate features 0.10
and 0.12 of a car-length apart, which the depth squash turns into 0.4 of a
pixel at racing zoom, so three pale marks landed on top of one another and the
nose read as a smear. There is room for exactly one feature across the front of
a car at this size. It is a bar with two lights in it.

#### What makes a shell read as moulded

Five things, in the order they earn their place:

1. **Every flank lit separately.** Each footprint edge carries the outward
   normal it has in the car's own frame, cached on the shape, so the world
   angle is that plus the heading and `faceLight()` does the rest. This is the
   difference between a coloured region with an outline and a solid object.
2. **Shoulders.** A moulded shell is crowned — it curves over — so the flank
   facing the light is bright and the other is not, and the change happens at
   the shoulder rather than at the outline. Two inset bands along the long
   edges of the top face, which is where most of the car is.
3. **A catch on the moulded edge.** The parting line of the mould runs round
   the widest point of the shell, and that line is the silhouette. It is
   stroked twice: dark all the way round for separation, then white over only
   the edges facing the light. One extra path, and it is the cheapest thing
   here that says "shiny".
4. **A sheen that moves.** The gloss was one pale streak nailed to the car's
   left at a fixed 0.18 — a decal, which stayed put through every corner while
   the shadow under the car swung right round. It now sits on whichever flank
   faces the light and walks across as the car turns.
5. **The mould line**, down the centre of the shell and the roof, as two
   hairlines a hair apart: a single dark line is a scratch, a dark line with a
   pale one beside it is a raised ridge. Which side gets which is the light's
   decision, so the ridge catches on one side going up the straight and on the
   other coming back.

Plus **wear** — three rubbed patches on the corners of the bonnet and boot,
seeded off the vehicle id so a given car always wears the same way and no two
wear alike. *"A brand-new toy car is boring; a loved one has history."*

#### Two things that had to be got wrong first

- **A lengthwise streak is not a streak.** The first sheen lit the roof and the
  bonnet as separate panels and came out as a pale *blob* on the paint: the
  length axis is squashed to 30%, so a 7-unit panel is 2 units tall on screen
  and a highlight inside it is square. Anything meant to read as a line along
  the car has to run the **whole length** of it — nose to tail, with the cabin
  interrupting it — or the squash eats it. This is the mirror of the rule for
  ground markings, and it catches you the opposite way round.
- **The sheen and the mould line had to be split by panel.** Drawn in one pass
  at the end, the shell's own centre line was ruled straight across the cabin
  standing three units above it, and the whole visible field behind the cabin
  was left bare — one line in the wrong place and a conspicuous gap where it
  belonged. They are now drawn with the panel they belong to, so the cabin can
  occlude them.

#### Material is now visible, not just audible

`09_Vehicles.md` has carried an open item since Phase 10: the `material` field
existed, `13_Audio.md` read it, and the renderer ignored it.
`Renderer.MATERIAL_LOOK` is its visual twin — flank swing, sheen, edge catch,
mould line, and what colour shows under the chipped paint. Die-cast swings
widest and keeps the hardest edge; wood does not shine **at all** and has no
mould line, so the Heirloom gets grain instead; lithographed tin is the
shiniest thing on the grid. The table and the reasoning are in that document.

Rendered nine cars at six headings each, twice — once with the camera following
the car, which is the player's own view and the case where the silhouette never
rotates and **only the light moves**, and once with the camera fixed, which is
a rival ahead. The wooden car reads flat and matte against eight that all walk
their highlight round as they turn.

#### Cost, and the culling that paid for it

Measured on one frame of Rug Route, ten seconds in, four cars on screen:

| | per car | whole frame |
| --- | --- | --- |
| before | 181.0 | 4,296 |
| all of the above | 246.3 | 4,557 |
| **shipped, with back-face culling** | **200.3** | **4,373** |

Lighting the faces individually made it worth knowing what they cost, and the
trace answered it: **a car emitted eight side quads a frame and at least four
of them were painted and then covered.** The projection is a rotation and a
positive squash, so it preserves orientation — a footprint wound
counter-clockwise stays counter-clockwise on screen, nearer is further down the
screen, and a face is visible exactly when its edge runs leftward in screen x.
One subtraction per edge, and the same test culls the cabin.

**Only when the car is upright.** On a loop or a corkscrew `up` swings the body
through the vertical, the extrusion is no longer downward, and a far face is
genuinely visible; those frames draw all eight exactly as before.

Net **+19.3 operations per car**, +77 on a four-car frame — against the +65 the
material work costs on its own. Tints are quantised to 1/24 and cached per base
colour per vehicle, so `shade()` is not parsing a hex string a hundred times a
frame for fifteen distinct values.

All 22 events measured **0.00** against the committed baseline. This is a
render-only pass and nothing in it can be seen by a lap time.
