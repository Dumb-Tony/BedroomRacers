# 08 — World: Sandbox Speedway

> **DRAFT — not designed.** The source GDD contains a concept sentence and a feature
> wishlist. What follows is scaffolding plus the design problems to solve.
> **Do not build from this document.**
>
> That said, this is the **recommended first expansion** — see below.

## Concept

A backyard sandbox transformed into an off-road racing world. Loose sand, carved
trenches, buried obstacles, construction toys and half-finished sandcastles.

Where the town rug is about following printed roads, the sandbox is about **routes
that don't exist until someone drives them**. Tracks are dug, not printed.

## Wishlist from the GDD

Sand dunes, toy construction vehicles, buried shortcuts, sand castles, plastic
buckets, shovels used as bridges, water puddles, marble hazards, collapsing tunnels.

## Why this should be the first expansion

Unlike the stunt track (`07`), this world is **flat**. It fits the existing
simulation almost entirely:

- No elevation model needed. Dunes are surface types with a slope hint, not geometry.
- No loops, no banking, no inversion.
- Existing waypoint AI works unmodified.
- Existing collision model works unmodified.

The genuinely new element is **deformable sand**, and even that has a cheap version.
Building this world proves the modular-world architecture at low technical risk,
which is exactly what a first expansion should do.

## New systems this world implies

### Sand deformation
The signature feature. Vehicles should leave tracks in sand, and repeated passes
should carve a faster racing line.

Options, cheapest first:

1. **Decal trails only.** Tyre marks are visual, no gameplay effect.
   *Nearly free. Loses the interesting part.*
2. **Surface grid.** A coarse grid tracking "compacted" state; compacted sand is
   faster. Vehicles compact cells they cross.
   *Moderate. Genuinely interesting — the racing line emerges over three laps, which
   is exactly the "replayable tracks" pillar.*
3. **Height deformation.** Real displacement with berms and ruts.
   *Expensive, and reintroduces the elevation problem this world otherwise avoids.*

**Recommendation: option 2.** It is the whole reason to build this world.

### Water
Puddles as a surface type (very low grip) is trivial. Flowing water or a sprinkler
is a moving surface hazard — new, but bounded.

### Buried shortcuts
Routes hidden under sand, revealed by driving over them or by a construction toy.
Fits the "visible but not obvious" shortcut rule in `05_Tracks.md` and gives this
world a distinct discovery flavour.

## Track concepts

Rough directions only, not designs:

- **Dune Dash** — introductory loop over rolling sand, teaching the compaction line
- **The Big Dig** — a trench circuit through a half-built construction site
- **Bucket Brigade** — narrow routes over and through upturned buckets and shovels
- **Tide Pool** — water hazards and a collapsing wet-sand tunnel

## Open questions

1. Which sand deformation model? (Recommend 2 above.)
2. Does compaction persist across laps only, or across the whole event?
3. How does compaction interact with AI racing lines — should AI seek compacted sand?
   (If yes, this makes AI feel genuinely smart for very little code.)
4. Are dunes purely a surface effect, or do they need slope in the physics model?
5. Outdoor lighting is a departure from the warm indoor identity in `12_Art_Guide.md`.
   Does the game's look survive daylight, or does this need its own art treatment?

## Related

`05_Tracks.md` — surface types and shortcut rules.
`07_World_Stunt_Track.md` — the higher-risk alternative expansion.
`12_Art_Guide.md` — the indoor art identity this world tests.
