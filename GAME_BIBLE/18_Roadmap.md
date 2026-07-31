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
- [ ] A first-time player can drift without spinning out
- [ ] A well-timed drift is faster than steering through a corner
- [ ] Overcommitted drifts scrub speed
- [ ] Counter-steering feels controllable
- [ ] Collisions are funny, and control returns within ~0.8s
- [ ] `GROUND_TILT` value is decided and locked
- [ ] Fixed timestep confirmed working

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
- [ ] Three-lap race completes reliably
- [ ] Checkpoint order prevents reverse and skip exploits
- [ ] Three AI opponents complete clean laps and never get permanently stuck
- [ ] Positions are always correct
- [ ] Retry to countdown is under 2 seconds
- [ ] Passing an opponent feels good

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
- [ ] Track passes the full authoring checklist in `05_Tracks.md`
- [ ] Readable at mobile resolution
- [ ] Profiled on a real low-end device, hitting frame budget
- [ ] The shortcut is findable by a curious player on lap two
- [ ] Someone outside the project plays it and wants another go

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
- [ ] Progress survives a browser restart
- [ ] Corrupt and missing saves handled without crashing
- [ ] Save schema versioned with a migration path
- [ ] Game fully playable with storage disabled

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

Not yet chosen. The strongest candidates:

- **The AI should seek worn sand** (`08` open question 3). Small, and it makes
  opponents look genuinely smart while turning a player's line into something
  that can be exploited against them.
- **More sandbox tracks** — The Big Dig, Bucket Brigade, Tide Pool. The world is
  built; these are content.
- **The plastic stunt track** (`07`), which needs the elevation model decided
  first and is the largest remaining technical risk in the project.
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
