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

Three ways to give depth back. **Two are built.**

1. ~~**Scale with depth.**~~ **Built.** A little fake perspective — see below.
2. ~~**Fade with depth.**~~ **Built.** Warm haze toward the far edge.
3. **Shadow size.** Tightening shadows with distance is a strong depth cue for
   free. **Still open**, though depth scaling now shrinks a vehicle's shadow with
   the rest of it, so this would only add contrast falloff.

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
