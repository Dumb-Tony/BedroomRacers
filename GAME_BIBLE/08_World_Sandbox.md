# 08 — World: Sandbox Speedway

> **BUILT (Phase 6).** All four tracks shipped. The compaction mechanic is
> implemented and measured, and the AI reads the sand.
>
> Source: `src/systems/SandGrid.js`, `src/data/tracks/sandbox-*.js`.

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

## Dunes — RESOLVED, surface effect only

Open question 4 asked whether dunes are purely a surface effect or need slope in
the physics model. **Surface only. Nothing was built.**

Slope was prototyped as a real force in the flat simulation — `a = −g·∇h` over a
field of Gaussian bumps, applied in `VehicleController` after the overspeed
decay, reading a height field and never the projection — measured against a
matched control, and then deleted. What follows is why.

### The bar a dune had to clear

The ground under this world already varies, and it varies a lot. Terminal speed
at full throttle on the flat, and what 4000 units of straight costs:

| surface | terminal speed | 4000 units |
|---|---|---|
| `looseSand` | 233 | 17.40s |
| `sand` (loose) | 281 | 14.50s |
| `packedSand` | 349 | 11.72s |
| `rugRoad` | 350 | 11.68s |

Compaction is worth **68 units/sec of top speed and 2.78s over 4000 units**, and
the player is the one who puts it there.

### 1. The engine out-muscles gravity, so slope barely changes speed

Terminal speed on sand, full throttle, on a constant grade:

| grade | uphill | downhill | 2000 up + 2000 down, vs 4000 flat |
|---|---|---|---|
| 4% | 279.9 | 281.8 | +0.02s |
| 8% | 279.0 | 287.1 | 0.00s |
| 14% | 277.7 | 287.4 | +0.08s |
| 20% | 276.3 | 288.4 | +0.22s |

A **20% grade — steeper than a sandbox could hold — costs 4.5 units/sec**. The
engine has 684 units/sec² of authority on sand; gravity at 20% has 280, and the
car is speed-capped rather than power-capped, so it simply sits at its ceiling
either way. Slope is a fifteenth of the mechanic already in the ground.

### 2. There is no free speed on the way down

Rolling friction on sand is 0.986 a tick — 241 units/sec² at the ceiling — plus
132 of drag. A descent has to beat 373 units/sec² before it hands anything back,
and gravity does not reach that until a **27% grade**. Coasting from 287 with the
throttle off, speed left after 1500 units:

| grade | 5% | 10% | 20% | 27% | 35% | 50% |
|---|---|---|---|---|---|---|
| speed | 72 | 131 | 228 | 286 | 289 | 292 |

Below 27% a dune charges you for the climb and refunds nothing over the crest.
Above it the ceiling takes the refund instead: at 20% the car spends **412 ticks
of a 4000-unit descent above its own top speed**, being bled off by
`overspeedDecay`.

**This is the loop trap wearing different clothes** (`18_Roadmap.md`, Phase 9). A
lap is a closed height loop, so gravity does exactly zero net work over one. All
that is left are the terms that do not cancel — quadratic drag costs more on the
fast half than the slow half returns, and the cap discards the rest — and every
one of them is a loss.

### 3. On a real lap it is a rounding error, or a tax

Dune Dash, three laps, technician on `normal`, seeded, quickest of three seeds,
in the style of `tools/pays.sh`. The control changes nothing and reads exactly
0.00, so the runs are reproducible and everything else is the feature:

| config | best lap | race | vs baseline |
|---|---|---|---|
| flat sand (baseline) | 28.93 | 94.14 | — |
| flat sand (control) | 28.93 | 94.14 | **0.00** |
| crest dunes, h30 | 29.03 | 93.96 | +0.10 |
| crest dunes, h60 | 29.03 | 94.31 | +0.10 |
| crest dunes, h100 | 28.97 | 94.89 | +0.03 |
| flank dunes, h60 | 29.63 | 95.37 | +0.70 |
| flank dunes, h100 | 30.02 | 96.47 | +1.08 |

**Crest dunes** — where the whole road rises and falls — land inside a tenth of a
second in either direction. **Flank dunes** — a side slope across the racing line
— cost **1.08s a lap**, past the 0.60s bar `pays.sh` calls a trap.

### 4. And it does not move the racing line, it only jostles it

Mean lateral offset from the centreline, sampled ten times a second all race, on
a road 320 wide:

| config | signed offset | mean \|offset\| | worst | airborne | launches |
|---|---|---|---|---|---|
| flat sand | −34.8 | 34.8 | 88.6 | 1.65s | 3 |
| crest slope, h100 | −51.6 | 53.6 | 149.1 | 1.60s | 3 |
| flank slope, h100 | −24.5 | 46.3 | 148.5 | 1.60s | 3 |

A route *decision* would show up as the signed offset settling somewhere new. It
does not. Under flank slope the mean drifts back toward the centre while the
spread and the peak both grow to 149 units on a 160-unit half-width — the driver
is not picking a different line, it is being shoved off the one it wanted and
steering back. That is the second half of why the 1.08s is a tax: it is time
spent correcting, not time spent choosing.

**A crest also never launches anything.** Airborne time and launch count are
unchanged across every configuration — the three jumps are the plank on the
bucket that was already there. A slope force cannot throw a car into the air in
this model, because `v.z` is height above a flat plane and nothing follows the
ground. The spectacle half of a dune already belongs to `ramps`, which `pays.sh`
prices at −0.08s a lap on this very track for about two seconds of air.

### It could not have been drawn anyway

`Renderer.drawGround` projects the entire world as one flat quad at z = 0, and
`07`'s elevation model is one height per **centreline** point — a function of lap
fraction, not a field over the sandbox. A flank dune is not expressible in
either. So every sideways shove measured above is a shove from a hill that is not
on screen, and `AIDriver.readSand` states the rule that breaks in its own
comment: the AI is allowed to read the compaction grid precisely *because the
grid is drawn*, and "the moment an AI knows something invisible, the racing stops
feeling fair".

Making a dune visible and legible therefore means a 2D height field in the
renderer, in the AI and in collision — which is option 3 from the sand
deformation question, "expensive, and reintroduces the elevation problem this
world exists to avoid". The measurements price the reward for that at a tenth of
a second a lap of nothing.

### A dune you can *see* is already free

The look does not need the physics. Twelve elevation keys on Dune Dash — six
dunes round the lap, `z` easing between 0 and 34 — draw a rolling ridge using the
`07` model exactly as it ships:

| | best lap | race | falls |
|---|---|---|---|
| no elevation | 28.93 | 94.14 | 0 |
| six dunes drawn, z 0..34 | 28.93 | 94.14 | 0 |

Identical to the tick, because `z` is a render property there and the simulation
never learns about it. The 34 is the one constraint worth writing down:
`Recovery.FLOOR_Z` is 40, and a deck below that counts as the bedroom floor, so
leaving the road stays ordinary off-road driving. Author a sandbox ridge taller
than 40 and wandering wide becomes a fall off a cliff, which is not what a
sandbox does to you.

### The trap in measuring it

**The sign of the crest result flips with the height.** At h30 the race comes out
0.18s *quicker* than flat; at h100, 0.75s slower. Measure one height, and the
honest report is either "dunes make the track faster" or "dunes cost most of a
second" — both confident, both wrong. A perturbation whose direction depends on
how big you made it is not a mechanic, and only sweeping the height showed that.
The control column reading exactly 0.00 is what made a 0.10s difference legible
enough to notice the flip at all.

## Water — BUILT

Puddles are a zone type at grip 0.42, less than half the road. Three sit just off
the natural line on Dune Dash, so they punish a lazy entry rather than sitting in
the middle of the course. The hose has been left on.

Flowing water and the sprinkler hazard are **not built**.

## Tracks — all four built

Each one argues with the compaction mechanic from a different side, using only
rules already in the code. Wear-in measured as *coverage of the racing line /
number of breaks in it*, by lap:

| Track | Width | L1 | L2 | L3 | The idea |
| --- | --- | --- | --- | --- | --- |
| **Dune Dash** | 320 | 0.95/4 | 1.00/0 | 1.00/0 | open — learn that sand packs |
| **The Big Dig** | 230 | 0.92/6 | 0.97/2 | 0.98/1 | narrow — nowhere else to be |
| **Bucket Brigade** | 290 | 0.81/7 | 0.92/5 | 0.95/5 | vertical — obstacles on the line |
| **Tide Pool** | 300 | 0.84/8 | 0.88/6 | 0.88/6 | interrupted — water never packs |

**Dune Dash** — wide and open, one long southern drag so a worn line has
somewhere to pay off. Learning that the ground changes under you is enough to
learn at once.

**The Big Dig** — trenches, 230 units across, walls too high to jump. Note the
measurement corrected the design intent: the line completes *later* here, not
sooner, because a driver's lateral wander is a bigger fraction of a narrow road.
The point is not that the groove arrives quickly — it is that there is nowhere
else to be while you wait for it.

**Bucket Brigade** — buckets in the road, each just past a spade propped up as a
ramp. Because the ramps sit on the line too, being launched over a bucket is the
default: 267 of 275 measured encounters go over the top. Going around is what
happens when you arrive too slowly to trigger the ramp, and it costs you the
packed sand. Speed keeps you out of trouble, which is a pleasant inversion for a
track full of obstacles.

> **Emergent, not designed:** a car in the air packs no sand, so every jump
> leaves a permanent hole in the worn line. Bucket Brigade ends a race at 0.95
> coverage with 5 breaks where Dune Dash reaches 1.00 with none. The flight paths
> are visible in the ground. Nobody wrote that; it falls out of the rules.

**Tide Pool** — seven puddles across the line rather than beside it. Compaction
only happens on `sand`, so water never firms up and never will. The line arrives
in sections with gaps that are still there at the flag — the only track in the
game where three laps do not produce a complete groove.

The collapsing wet-sand tunnel from the original wishlist is **not built**.

## Open questions

1. ~~Which sand deformation model?~~ **Resolved: option 2, measured above.**
2. ~~Does compaction persist across laps only, or the whole event?~~ **Resolved:
   per race.**
3. ~~Should AI seek compacted sand?~~ **Resolved: yes, built.** A `sandReading`
   trait per personality (`04_AI.md`). Worth about a second a lap to the
   Technician and a fifth of one to the Rookie, and it scales with the parameter.

   The claim to test was not "does it go faster" but **"will it follow a line it
   did not make"** — the promise that a player's line becomes something opponents
   take off them. Tested in isolation by packing a band one cell off the racing
   line and dropping a driver on the line: it settles a little over halfway
   across (35 units of 70), against a control that never leaves 0.5.

   In an ordinary race the effect on firmness is close to nil, and that is
   **correct**: the field already packs the racing line, so there is nothing
   better to find. The trait bites when the packed sand is somewhere the AI would
   not otherwise be — which is exactly when it should.
4. ~~Are dunes purely a surface effect, or do they need slope in the physics
   model?~~ **Resolved: surface effect. Slope was prototyped, measured and
   deleted** — see "Dunes" above.

   The short version: a lap is a closed height loop, so gravity does zero net
   work over one, and the car is speed-capped rather than power-capped, so the
   engine out-muscles the slope on the way up and the ceiling confiscates it on
   the way down. A **20% grade is worth 4.5 units/sec of terminal speed against
   compaction's 68**. On Dune Dash a crest dune lands inside a tenth of a second
   either way and a flank dune costs **1.08s a lap** without moving the racing
   line — it shoves the driver off the line it wanted, which is time spent
   correcting rather than choosing.

   A dune that is actually a *hill you can see* still uses `07`'s elevation
   model, and it is free: six drawn dunes on Dune Dash returned an identical lap
   to the tick, because `z` is a render property there. Keep them under
   `Recovery.FLOOR_Z` (40) or leaving the road becomes a fall.
5. ~~Does the game's look survive daylight?~~ **Resolved: yes, with per-track
   colour.** Tracks now carry their own `groundColour`, `roadColour`,
   `weaveColour` and `haze`; the sandbox runs a bright `236,214,170` haze against
   the rug's `198,176,140`. The depth cues built in Phase 5 (fade, scaling,
   shadow falloff) do the work of keeping it readable, and they are tuned per
   track rather than globally. Daylight needed data, not a new art treatment.

## Deferred

Buried shortcuts (the "visible but not obvious" discovery flavour), the sprinkler
hazard, flowing water, and the collapsing wet-sand tunnel on Tide Pool.

## Related

`05_Tracks.md` — surface types and shortcut rules.
`07_World_Stunt_Track.md` — the higher-risk alternative expansion, still unbuilt.
`12_Art_Guide.md` — the indoor art identity this world tested and survived.
`16_Content_Pipeline.md` — the authoring approach this world reused unchanged.
