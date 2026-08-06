# 18 — Roadmap

## Principle

**One enjoyable race before anything else.** Every phase below exists to protect that
priority. The project's failure mode is building content on top of driving that isn't
fun yet.

Do not start a phase before the previous one meets its exit criteria.

---

## Phase 1 — Driving Test

A small test arena. No track design, no art, no menus.

**Build:**
- One vehicle, procedurally drawn (`12_Art_Guide.md`)
- Custom physics integration (`03_Driving_Physics.md`)
- Steering, acceleration, braking
- Drift with grip modulation
- Boost with a charge meter
- Collision walls
- Camera follow
- The angled projection and shadow rendering
- On-screen speed and boost readout

**Explicitly not:** tracks, laps, AI, art, audio, menus.

**Exit criteria** — the feel targets from `03_Driving_Physics.md`:
- [~] A first-time player can drift without spinning out — NEEDS A HUMAN
- [x] A well-timed drift is faster than steering through a corner — 196 ticks against 231
- [x] Overcommitted drifts scrub speed — 344 units/sec after 1s of full-lock drift, 61 after 3s
- [~] Counter-steering feels controllable — NEEDS A HUMAN
- [x] Control returns within ~0.8s — spinRecoveryTime is 0.6. Whether they are FUNNY needs a human
- [x] `GROUND_TILT` decided and locked at 0.30 (17.5° elevation), and the art guide is written around it
- [x] Fixed timestep confirmed — 60Hz, 6-step ceiling, decoupled from render

**The tilt decision blocks all art and all track authoring.** Settle it here.

This phase can take as long as it takes. It is the only phase where that's true.

---

## Phase 2 — Race Structure

Turn the test arena into a race.

**Build:**
- Start countdown
- Checkpoints and lap validation
- Finish conditions
- Race timer
- Basic waypoint AI (`04_AI.md`)
- Position tracking
- Results screen
- Instant retry

**Exit criteria:**
- [x] Three-lap race completes reliably — 8 of 8 tracks finished
- [x] Checkpoint order prevents skip exploits — teleporting to the last gate and over the line credited 0 laps
- [x] AI never permanently stuck — worst stall 401 ticks (6.7s) and it recovered; every race finished
- [x] Positions always correct — 0 ordering violations sampled twice a second across a full race
- [x] Retry to countdown under 2s — reset is effectively instant (<1ms; tracks are cached)
- [~] Passing an opponent feels good — NEEDS A HUMAN

This is the **Minimum Viable Prototype**. At its end, the core question — is racing
toy cars across a bedroom fun? — should have an honest answer.

---

## Phase 3 — Town Rug Vertical Slice

One polished track. Near-final art direction.

**Build:**
- Rug Route Rookie Circuit (`06_World_Town_Rug.md`)
- Near-final art for that track
- Environmental props
- Sound effects and music
- One shortcut
- One jump
- One moving hazard
- Several vehicle choices
- HUD (`11_UI.md`)

**Exit criteria:**
- [x] All 8 tracks build clean — no stray rectangles, no levelless walls
- [x] Renders at 375x812 without error, and the HUD scales below its 900px reference
- [ ] Profiled on a real low-end device — CANNOT BE DONE HERE, needs hardware
- [~] Shortcut findable on lap two — NEEDS A HUMAN
- [~] Someone outside the project wants another go — NEEDS A HUMAN. The real criterion

That last one is the real criterion.

---

## Phase 4 — Progression

**Build:**
- Event map
- Medals and stars
- Unlockable vehicles
- Save data (`15_Save_System.md`)
- Garage

**Exit criteria:**
- [x] Progress survives a restart — written, in-memory copy dropped, read back intact
- [x] Corrupt and missing saves both recover to a usable save without throwing
- [x] Schema versioned (`bedroomracers.save.v1`, VERSION 1) with a MIGRATIONS table
- [x] Fully playable with storage disabled — load and save swallow it, and a race runs

---

## Phase 5 — Additional Content

**Build:**
- More town-rug tracks (suggested order 2 → 3 → 5 → 4 → 6)
- More vehicles
- Time Trials with ghosts
- Collectibles
- Additional hazards
- Difficulty levels
- Items, if the answer to `10_Items.md` open question 4 is yes

**Blocking dependency:** the content pipeline (`16_Content_Pipeline.md`) must be
resolved before track 2. Hand-authoring does not scale past track 1.

---

## Phase 6 — New Environment ✅

The first major expansion. **Sandbox Speedway** was chosen over the plastic stunt
track because it is flat and reuses the existing simulation, making it a genuine
test of the modular-world architecture at low risk. The stunt track breaks the
flat-plane assumption and still needs an elevation model decided first
(`07_World_Stunt_Track.md`).

**Built:**
- Dune Dash — the first track outside the bedroom
- Sand compaction (`SandGrid.js`) — the racing line is worn in, not painted on
- Four surfaces: `sand`, `packedSand`, `looseSand`, `puddle`
- Per-track world colour and haze, so daylight works without a new art treatment
- Two events: Dune Dash (8 stars) and Sandbox Time Trial (12 stars)

**Exit criteria:**
- [x] A new world added without changing the simulation — only `VehicleController`
      moved, by three lines, to read an optional surface modifier
- [x] The racing line measurably emerges: **+2.8s over three solo laps, net of a
      matched control run with packing disabled**
- [x] Packing pays over a full race: **12.5s against sand that never firms up**
- [x] Compaction resets per race, so no track becomes permanently solved
- [x] Bedroom tracks unaffected — the grid is inert on non-sandy tracks
- [x] Frame-rate independent (packing runs in the fixed step)

**Verified, and it mattered:** the wear-in arc was tuned against measurement, not
feel. At the first-guess rate the line finished forming during lap one and laps
two and three were identical — the mechanic worked but the *story* did not.

The same pass caught a separate and worse problem: Bedside and Sandbox had
hand-guessed target times, leaving gold 18-37 seconds off the pace. Every medal
on both worlds was free on the first attempt. Target times are now derived from a
simulated reference run — see the ratios recorded at the top of `events.js`.

---

## Phase 7 — Next

**Done since Phase 6 closed:** AI that seeks worn sand (`08` open question 3,
`04_AI.md`). A `sandReading` trait per personality — the Technician gains about a
second a lap, the Rookie a fifth of one. It follows a line it did not make,
settling halfway onto a band packed one cell off the racing line, so a player's
line is now something opponents can take off them.

That work also hardened the target-time method: a single reference run swung 8
seconds on a time trial, so calibration now takes the quickest of four.

**Also done:** the three remaining sandbox tracks — The Big Dig, Bucket Brigade
and Tide Pool. Twelve events across three worlds now. They were meant to be pure
content and were not: between them they found the missing prop avoidance in the
AI (`04_AI.md` step 6, specified six phases ago and never built), a `sandReading`
bug that only appears on narrow roads, and six rectangle features authored as
centres when the format anchors at the corner — three ramps that could not fire,
a boost pad in the sand, two puddles beside the road. `TrackManager` now reports
strays on every build.

**Also done: the plastic stunt track has started** (`07`). The elevation model —
called "the single largest technical question in the project" — is decided,
built and measured: discrete levels for collision, continuous height for render.
The simulation did not change at all, because `v.z` still means height above the
track surface and the deck height lives separately in `v.roadZ`. One track ships
on it, Dresser Drop, which climbs onto the dresser and crosses back under itself.

Fourteen events across four worlds now.

**And the loop** (`07` option 3, `Rails.js`). The car is captured at the mouth,
carried round at constant speed and released the way the loop points; roll is a
render property and the simulation never learns that up has moved. Arrive under
`minSpeed` and you are not taken round at all — you drive along the floor
beneath it, which makes the loop a reward for carrying speed rather than a tax
on arriving slowly. The AI needed no changes: it drives the line, the line goes
through the mouth.

**And the corkscrew**, which is the same rail turning about the travel axis
instead of the lateral one — a function and a flag, not a second system. It also
forced a fix to the loop: orientation is now a `up` VECTOR rather than a roll
angle, because one number cannot say which axis is turning, and the loop had
been barrel-rolling the car where a pitch belongs.

**And falling off** (`07` open question 4, `Recovery.js`) — the last open
question that world had. A track can now author a gap in its rail
(`openEdges`), and going through one drops you: 0.85s of tumbling fall, a
landing on the carpet, then a lift back to the last centreline point you
legitimately occupied, keeping 30% of your speed. Measured cost 1.18 seconds.
Not a checkpoint reset, because losing a lap for clipping an edge stops people
taking the risk at all.

**Shelf Run** is the second stunt track, and the one with the gap: three decks,
a two-storey crossover, and one ride rather than four.

Remaining candidates:
- **Items** (`10_Items.md` open question 4) — still undecided whether the
  flagship mode should have them at all, and the oldest unanswered question in
  the bible.
- **Track-switching gates and falling track sections** (`07`) — content on the
  systems that now exist rather than new systems.
- **Items** (`10_Items.md` open question 4) — still undecided whether the
  flagship mode should have them at all.

---

## Scope control

**Not in the first playable build**, per the GDD and binding:

- Online multiplayer
- Large open-world exploration
- Detailed vehicle damage
- Complex story cinematics
- Realistic vehicle simulation
- User-generated tracks
- Account systems
- Cross-device cloud saves
- Large cosmetic shops
- Advanced weather simulation

Good ideas that arrive early go into a bible doc's open questions. They do not go into
the current phase.

---

## Definition of the first playable build

The player can:

- Open the game in a browser
- Start a race
- Control a toy car
- Complete three laps
- Race at least three AI vehicles
- Drift around corners
- Earn and activate boost
- Use one ramp or shortcut
- Encounter one moving toy hazard
- See position and lap count
- Finish the race
- View their result
- Restart without refreshing

This lands at the **end of Phase 3**. Note it exceeds the Phase 2 MVP — the ramp,
shortcut and hazard are Phase 3 additions.

The build does not need to be content-rich. It needs to demonstrate that racing toy
cars across a childhood bedroom is fun.

---

## Risk register

| Risk | Mitigation | Phase |
| --- | --- | --- |
| Driving feels too simple | Focus Phase 1 entirely on drift, traction, boost, collisions. Do not proceed until feel targets pass | 1 |
| Tracks hard to read | Readability rules in `05_Tracks.md` are mandatory. Test at mobile size | 3 |
| Nostalgia overpowers originality | All designs original. Reference the category, never the product | All |
| Browser performance | Pool particles, cap effects and audio, profile on low-end hardware | 3 |
| Scope expansion | One polished track before any second environment | All |
| AI navigation | Waypoints on authored lines. No pathfinding | 2 |
| Content pipeline doesn't scale | Resolve `16_Content_Pipeline.md` before track 2 | 5 |
| Perspective locked in too late | Decide `GROUND_TILT` in Phase 1, before any art | 1 |

The last row is added here — it is not in the GDD, and it is the one most likely to
cause expensive rework, because it invalidates art rather than code.

## Related

`00_Vision.md` — what all this is for.
`17_Claude_Rules.md` — how to work within these phases.
`PROMPTS.md` — starting points for each phase.

---

## Phase 8 — Foundation Audit ✅

Seven phases of content had been built on exit criteria that were **never
ticked**. The roadmap's own principle is "do not start a phase before the
previous one meets its exit criteria", and by Phase 7 all twenty-two boxes from
Phases 1 to 4 were still empty. Not because the work was undone — most of it had
been measured at the time — but because nobody went back and closed the loop.

Every criterion a machine can judge has now been measured against the shipping
build. Results are recorded inline above. The notable ones:

| | |
| --- | --- |
| Drift beats steering | 196 ticks against 231 through 90° |
| Overcommitted drift scrubs | 344 units/sec after 1s, **61 after 3s** |
| Control returns after a hit | 0.6s, inside the 0.8s ceiling |
| Races complete | **8 of 8 tracks** |
| Skip exploit | teleport to the last gate and over the line → **0 laps credited** |
| Position ordering | 0 violations, sampled twice a second all race |
| Save | survives a restart; corrupt, missing and disabled storage all recover |

### Three legends, and the difference matters

- `[x]` — **measured.** A number backs it.
- `[~]` — **needs a human.** Whether a drift is *satisfying*, whether collisions
  are *funny*, whether someone outside the project wants another go. A stopwatch
  cannot answer any of these, and pretending otherwise is how the loop drew as a
  flat slab for two commits while every check passed.
- `[ ]` — **genuinely not done.** Exactly one remains: profiling on a real
  low-end device, which needs hardware this environment does not have.

### What the audit itself got wrong

Two of the four save tests failed on the first run and **both were the harness**.
`get()` returns the live object but the state lives under `progression`, not
`state`; and `save()` is **debounced by 400ms**, so a test that reloads
immediately reads the previous value — and nulling the in-memory copy makes the
pending write bail entirely. The save system was correct the whole time.

Worth saying plainly, because a failing check that turns out to be a bad test is
the most expensive kind: it looks exactly like a real defect until you look.
