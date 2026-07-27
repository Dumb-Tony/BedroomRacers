# 07 — World: Plastic Stunt Track

> **DRAFT — not designed.** The source GDD contains a concept sentence and a feature
> wishlist for this world, nothing more. What follows is scaffolding plus the design
> problems that need solving. **Do not build from this document.**
>
> This world is Phase 6 at the earliest. It should not be designed until the town rug
> is complete and shipped.

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

## Open questions

1. Which elevation model? (Above — blocking.)
2. Does the vehicle model survive, or does this world need its own?
3. Are the racing lines in `04_AI.md` sufficient for AI on multi-level track, or does
   AI need level-aware waypoints?
4. What does falling off do here? Under-track recovery is a whole subsystem.
5. Is this actually the right second world? Sandbox Speedway (`08`) is flat and
   reuses the existing model almost entirely — it may be a far cheaper expansion.

## Recommendation

Ship the town rug. Then build **Sandbox Speedway** as the first expansion, because it
proves the modular-world architecture at low technical risk. Come back to the stunt
track once there is real evidence the architecture holds.

## Related

`03_Driving_Physics.md` — the flat-plane assumption this world challenges.
`08_World_Sandbox.md` — the lower-risk alternative expansion.
`18_Roadmap.md` — where expansions sit.
