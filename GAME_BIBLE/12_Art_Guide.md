# 12 — Art Guide

## Overall style

Colourful, warm, playful, slightly stylised. **No photorealism.** Objects are
recognisable at a glance with exaggerated proportions.

The reference point is not a modern mobile game. It is a 1990s toy catalogue
photographed in someone's bedroom on a Saturday afternoon.

## The perspective constraint

The camera is **slightly angled 2.5D**, and it is a **rotating chase camera** — it
sits behind the car and turns so the direction of travel points up the screen.
This is an art constraint before it is a technical one.

```
GROUND_TILT = 0.62   // ground plane is vertically squashed
```

### The rotating camera makes this harder, not easier

It is tempting to think a chase camera reduces vehicle art, since the player's car
is nearly always seen from behind. **It does not.** Opponents can be at any angle
relative to the camera — through hairpins, when being lapped, when spun out — and
they must use the same asset as the player. Full 360° coverage still stands.

What the rotating camera *adds* is a cost that a fixed camera did not have:

**Every prop with height is now seen from all sides.** With a fixed camera, a
crayon, a block or a shoe could be one sprite drawn at one angle forever. With the
camera rotating around them, a fixed sprite visibly "turns to follow you", which
reads as badly wrong.

Affected and unaffected:

| Asset | Impact |
| --- | --- |
| Flat ground decals — road print, rug pattern, markings, tyre marks | **None.** They live on the plane and rotate with it correctly |
| Vehicles | Unchanged — already needed 360° coverage |
| Props with height — blocks, crayons, furniture, toys | **New cost.** Need multi-angle frames, or geometry, or to be restyled as flat |
| Walls and barriers | Fine if drawn as extruded geometry, as the prototype does |

Cheapest mitigations, in order: keep small props flat where the fiction allows
(a fallen crayon is nearly flat anyway); build tall props as simple extruded
geometry rather than sprites; reserve multi-angle sprite sheets for the few hero
props that genuinely need them.

**This needs deciding before prop art starts**, and it is a stronger argument for
3D-sourced assets than the vehicle pipeline was.

### The rotation problem

**A single overhead sprite rotated 360° does not work at an angle.** It reads as
correct top-down and pancaked at a tilt. This applies to vehicles and to every
prop with height.

Options:

| Approach | Cost | Result |
| --- | --- | --- |
| **Pre-rendered heading frames** | 16–32 frames per vehicle | Correct. The standard solution |
| Rotate a flat sprite | Free | Wrong. Cars appear to lie flat and spin |
| Non-rotating billboard | Free | Unusable — no facing information |
| Real 3D models | High | Correct, but abandons the 2D pipeline |

**Decision: pre-rendered heading frames.** 16 frames (22.5° increments) is the
starting target; go to 32 if rotation reads as steppy at speed.

Practical pipeline: build vehicles as simple 3D models, render 16 orthographic views
at the camera tilt, export as a sprite sheet. This keeps the 2D runtime while making
new vehicles and cosmetic variants cheap.

**For the prototype, draw vehicles procedurally** with Phaser Graphics — a rotated
body shape with a shadow and a squash factor. Ugly, instantly tunable, and it lets
`GROUND_TILT` change without re-rendering anything. Do not commission vehicle art
until the tilt value is locked (`03_Driving_Physics.md`, open question 1).

### Depth sorting

Objects sort by world `y`. Shadows are drawn at ground level, always separate from the
sprite. **The gap between a vehicle and its shadow is the only height cue** — it must
be clearly visible on every surface, including dark ones.

### Props at an angle

Tall objects (block towers, furniture, crayons on their side) need a visible vertical
face, not just a top. Anything drawn purely as a top-down footprint will look painted
onto the floor.

## Toy vehicle style

Vehicles look **manufactured**, from materials such as painted die-cast metal, glossy
plastic, wood, rubber, and clear plastic, with stickers.

Character comes from wear: minor scratches, chipped paint, worn wheels, a peeling
sticker, a slightly bent axle. A brand-new toy car is boring; a loved one has history.

Material should be visible at gameplay zoom — the wooden car reads as wood from across
the room, not just in the garage.

## Scale cues

The player must be **constantly** reminded these are toys. Scale is the whole
conceit, and it is lost the moment the frame could be any racing game.

- Visible rug fibres
- Large dust particles
- Massive pencils and crayons
- Towering furniture
- Oversized carpet seams
- Huge human footprints or handprints
- Stickers used as road signs

Rule of thumb: **every frame should contain at least one object of unmistakable
real-world scale.** If a screenshot could be a normal racing game, the shot has failed.

## Lighting

Warm afternoon or evening bedroom light as the default. Variations are listed in
`06_World_Town_Rug.md` and reuse the same geometry.

Lighting is a mood tool and a cheap content multiplier. It is also a readability
risk — the night-light and under-bed states must never make the track unreadable.
Test both against the readability rules in `05_Tracks.md`.

## Colour

- **Track surfaces stay readable.** Roads are the darkest value; drivable areas are
  clearly distinct from non-drivable.
- **Vehicles are saturated and distinct** — they must pop against every surface.
- **Decoration is desaturated relative to gameplay elements.** The rug print is
  colourful but must never compete with a car for attention.
- **Hazards use a consistent warning language** across all worlds.

Verify with a colourblind simulation and a greyscale pass. If the track reads in
greyscale, it reads for everyone.

## UI art

Covered in `11_UI.md`. Stickers, notebook labels, cardboard signs, crayon lettering.
Hand-cut, hand-lettered, slightly wonky, nothing perfectly aligned.

## Effects

Particle effects vary by surface — dust from rug, scuffs from hardwood, sand spray,
water splash. This is a **gameplay signal**, not decoration: it is how a player knows
what they are driving on without looking at the ground.

Effects must be poolable and capped. Browser performance is a listed risk; a drifting
pack of six cars is the worst case and needs a hard particle budget.

## Legal constraint

Every world in this game is inspired by heavily-branded real products — town-map play
rugs, plastic stunt track systems, die-cast car lines.

**All layouts, object designs, colour schemes, connector geometry, printed iconography
and logos must be original.** Reference the *category*, never the product. When in
doubt, change it.

This applies to the reference material in `reference/` too — collect it for mood, do
not trace it.

## Asset conventions

To be finalised with the pipeline (`16_Content_Pipeline.md`). Starting position:

- Sprite sheets, power-of-two where practical
- Vehicles: 16 heading frames, consistent pivot at the vehicle centre
- Shadows as separate sprites, never baked in
- Naming: `world_category_name_variant` (e.g. `rug_prop_crayon_red`)
- Source files in `reference/`, exported assets in `assets/`

## Open questions

1. Final `GROUND_TILT` — blocks all vehicle art. Phase 1.
2. 16 or 32 heading frames?
3. Are vehicles rendered from 3D or drawn by hand? 3D is cheaper for 16 angles plus
   cosmetic variants; hand-drawn has more character.
4. Does the rug get a full illustrated texture, or is it composed from tiles? Tiles
   are cheaper and support procedural layout variants; a single illustration looks
   better.

## Related

`03_Driving_Physics.md` — the projection this guide serves.
`06_World_Town_Rug.md` — the flagship world's visual identity.
`11_UI.md` — interface art.
