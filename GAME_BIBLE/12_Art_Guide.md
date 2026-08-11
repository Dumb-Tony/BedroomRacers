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

### heightScale is not geometrically consistent

An axonometric camera at elevation *e* compresses ground depth by sin(*e*) and
lifts height by cos(*e*). With `groundTilt` at 0.30, consistency would need
`heightScale` of **0.954**. It is 0.85, so verticals sit about **11% shorter**
than the ground plane implies.

That is small enough to read as a deliberate flattening rather than an error, and
it has never actually been chosen — 0.85 was a guess from before the tilt moved,
and it was slightly *too tall* for 0.62 as well. Worth a decision:

- **0.95** — geometrically honest, everything gets visibly taller, and every jump
  reads higher.
- **0.85** — keep, and treat the squash as style.

Changing it alters how every jump reads, so it belongs to whoever is tuning feel,
not to this document.

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
4. **`heightScale`: 0.85 or the geometrically consistent 0.954?** A feel decision,
   because it changes how every jump reads.
5. ~~**Fake perspective — yes or no?**~~ **Yes, as object scaling.** Built and
   tunable. The remaining sub-question is whether the ground plane should narrow
   too, which would be true perspective and a much larger change — currently it
   does not.
6. Does the rug get a full illustrated texture, or is it composed from tiles?
   Tiles are cheaper and support layout variants; a single illustration looks
   better. The 30% vertical compression argues for tiles, since fine detail is
   lost anyway.

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
