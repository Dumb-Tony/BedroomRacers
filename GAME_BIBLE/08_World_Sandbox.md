# 08 — World: Sandbox Speedway

> **BUILT (Phase 6).** One track shipped — Dune Dash. The compaction mechanic is
> implemented and measured. Three further track concepts remain unbuilt.
>
> Source: `src/systems/SandGrid.js`, `src/data/tracks/sandbox-dune-dash.js`.

## Concept

A backyard sandbox transformed into an off-road racing world. Loose sand, carved
trenches, buried obstacles, construction toys and half-finished sandcastles.

Where the town rug is about following printed roads, the sandbox is about **routes
that don't exist until someone drives them**. Tracks are dug, not printed.

## Why this was the first expansion

Unlike the stunt track (`07`), this world is **flat**, so it fits the existing
simulation almost entirely: no elevation model, no loops, no banking, and the
waypoint AI and collision model work unmodified.

**This held up.** Dune Dash needed zero changes to `AIDriver.js`, `Collision.js`,
`RaceManager.js` or `Projection.js`. The only simulation change was
`VehicleController` reading an optional `v.surfaceMod` instead of a fixed surface
name — three lines. Everything else was a new file (`SandGrid.js`) and content.

That is the second confirmation of the modular-world claim, after Bedside
Boulevard proved the content pipeline (`16_Content_Pipeline.md`).

## Sand deformation — RESOLVED, option 2

Open question 1 asked which model. The three candidates were decal trails, a
coarse compaction grid, or real height deformation. **Option 2 was built.**

`SandGrid.js` holds a `Float32Array` of 0..1 compaction over 70-unit cells —
about two and a half car lengths, coarse on purpose so compaction reads as a
*route* rather than as tyre tracks (`Particles.js` already draws those). Driving
over a cell packs it; packed sand is nearly as quick as road:

| surface | grip | max speed | accel |
|---|---|---|---|
| `sand` (loose, initial) | 0.74 | 0.82 | 0.76 |
| `packedSand` (worn in) | 0.97 | 1.02 | 0.98 |
| `looseSand` (off course) | 0.66 | 0.68 | 0.62 |
| `puddle` | 0.42 | 0.95 | 0.70 |

`TrackManager.surfaceModsAt()` blends between loose and packed by compaction and
returns *numbers*, not a surface name — the transition is continuous, so there is
no step change under the player as a cell crosses a threshold.

Only touched cells are iterated for drawing and clearing, so an untouched grid
costs nothing.

### The measured result

The justification for building this world was that the racing line emerges over
three laps. That claim was tested rather than assumed.

**Lap one is slow in every race**, because it starts from a standstill — worth
about 2s here and 1.5s on the rug. So a lap1-vs-lap3 gap proves nothing on its
own. Every figure below is net of a **matched control run**: the identical race,
same AI, with packing switched off.

Time trial (one car wearing its own line), by `PACK_RATE`:

| rate | solo laps | net of control | still gaining on lap 3 |
|---|---|---|---|
| 2.6 | 32.8, 29.2, 29.1 | +1.7s | no — finished during lap one |
| 1.6 | 33.7, 29.9, 29.2 | +2.5s | yes, but crowded into lap two |
| **1.0** | **34.4, 30.8, 29.6** | **+2.8s** | **yes** |
| 0.6 | 35.0, 32.0, 30.9 | +2.1s | never finishes forming |
| 0.35 | 35.3, 32.8, 32.2 | +1.1s | barely packs at all |

**`PACK_RATE: 1.0`.** Three distinct laps, each meaningfully quicker, arriving at
full pace as the race ends. One pass at racing speed packs a cell to about 0.28,
so it takes three or four to firm up.

Two more results worth keeping:

- **Packing is worth 12.5s over a full race** versus sand that never firms up
  (91.1s against 103.6s). The mechanic is not a garnish.
- **A full grid wears the line in faster than a lone car** — five sets of tyres,
  one line, so the arc compresses to roughly lap one (32.8, 29.1, 29.1). That is
  physical and it reads correctly, so it is left alone. The time trial is where
  the wear-in story is told cleanly, which is the right division of labour.

Heavier cars pack harder (`amount × spec.weight`), which gives the Green Pickup
something to be good at beyond winning contact.

## Compaction persistence — RESOLVED, per race

Open question 2. **Reset per race**, not per lap and not permanently.

Per lap would throw away the mechanic. Permanent would let the track become
solved: a player who ground out twenty laps would hand every later player a
finished line, and the "replayable tracks" pillar dies. Per race means a fresh
grid is a fresh problem, and it keeps ghost replay honest — a ghost recorded on a
worn line replays against a track that starts flat again.

## Water — BUILT

Puddles are a zone type at grip 0.42, less than half the road. Three sit just off
the natural line on Dune Dash, so they punish a lazy entry rather than sitting in
the middle of the course. The hose has been left on.

Flowing water and the sprinkler hazard are **not built**.

## Track concepts

- **Dune Dash** — **BUILT.** Wide introductory loop, one long southern drag so a
  worn line has somewhere to pay off. Deliberately open: learning that the ground
  changes under you is enough to learn at once.
- **The Big Dig** — a trench circuit through a half-built construction site
- **Bucket Brigade** — narrow routes over and through upturned buckets and shovels
- **Tide Pool** — water hazards and a collapsing wet-sand tunnel

## Open questions

1. ~~Which sand deformation model?~~ **Resolved: option 2, measured above.**
2. ~~Does compaction persist across laps only, or the whole event?~~ **Resolved:
   per race.**
3. **How does compaction interact with AI racing lines — should AI seek compacted
   sand?** Still open, and now the most interesting one. The AI currently follows
   the static racing line and packs it by coincidence. AI that *sought* worn sand
   would look genuinely smart for very little code — and would make a player's
   line something opponents exploit, which cuts both ways and is worth having.
4. **Are dunes purely a surface effect, or do they need slope in the physics
   model?** Still open. Dune Dash sidesteps it — the sand is flat and only its
   firmness varies. A dune that is actually a *hill* needs `07`'s elevation model.
5. ~~Does the game's look survive daylight?~~ **Resolved: yes, with per-track
   colour.** Tracks now carry their own `groundColour`, `roadColour`,
   `weaveColour` and `haze`; the sandbox runs a bright `236,214,170` haze against
   the rug's `198,176,140`. The depth cues built in Phase 5 (fade, scaling,
   shadow falloff) do the work of keeping it readable, and they are tuned per
   track rather than globally. Daylight needed data, not a new art treatment.

## Deferred

Buried shortcuts (open question in the original draft — the "visible but not
obvious" discovery flavour), the sprinkler hazard, and the three unbuilt tracks.

## Related

`05_Tracks.md` — surface types and shortcut rules.
`07_World_Stunt_Track.md` — the higher-risk alternative expansion, still unbuilt.
`12_Art_Guide.md` — the indoor art identity this world tested and survived.
`16_Content_Pipeline.md` — the authoring approach this world reused unchanged.
