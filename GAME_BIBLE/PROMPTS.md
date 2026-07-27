# PROMPTS

Reusable starting prompts for each development phase. Adjust freely — these are
starting points, not scripture.

Every prompt assumes `GAME_BIBLE/17_Claude_Rules.md` has been read first.

---

## Session opener

Use at the start of any working session:

```
Read GAME_BIBLE/17_Claude_Rules.md and GAME_BIBLE/18_Roadmap.md.

We're working on Bedroom Racers. Tell me which phase we're in and what's
outstanding before we start anything.
```

---

## Phase 1 — Driving Test

The original GDD prototype prompt, updated for decisions made since — angled 2.5D
rather than top-down, custom physics rather than an engine, vendored Phaser.

```
Help me build the Phase 1 driving test for Bedroom Racers using HTML, CSS,
JavaScript and Phaser 3.

Read these first:
  GAME_BIBLE/03_Driving_Physics.md   (the vehicle model and projection)
  GAME_BIBLE/14_Technical_Architecture.md  (structure and stack)
  GAME_BIBLE/17_Claude_Rules.md      (working rules)

The game uses a slightly angled 2.5D perspective. The simulation is flat 2D;
the tilt is a render-time projection only. Nothing in the simulation may read
GROUND_TILT.

Build:
1. A Phaser project that scales responsively, with Phaser vendored locally.
2. A Projection module implementing project() and depth sorting.
3. One player vehicle, drawn procedurally — no art assets yet.
4. A ground shadow drawn at z=0, separate from the vehicle sprite.
5. Custom vehicle physics per 03_Driving_Physics.md: forward/lateral velocity
   decomposition with grip as the drift lever. Do not use a physics engine.
6. Automatic acceleration, steering on arrows or A/D.
7. Drift on Space — a grip modifier plus steering bonus, not a state machine.
8. Boost on Shift, with a drift-charge meter.
9. A simple test arena with collision walls.
10. Smooth camera follow.
11. On-screen speed and boost readout.
12. Fixed 60Hz simulation timestep with an accumulator, decoupled from render.
13. All tuning constants in one named config object, commented with what each
    does to the feel.

Do not add: tracks, laps, AI, checkpoints, menus, art, audio.

Return every file and explain how to run it locally.
```

### Phase 1 tuning follow-up

```
Drive the test arena and adjust. The feel targets are in 03_Driving_Physics.md
under "Feel targets". Tell me which specific target is failing before changing
any constant, and update the bible with the new values once we settle.
```

### Phase 1 tilt decision

```
Help me settle GROUND_TILT. Add a runtime control to adjust it live so I can
see how it changes visibility distance and how the car reads at speed.

This blocks all vehicle art and track authoring — 12_Art_Guide.md and
05_Tracks.md both depend on it.
```

---

## Phase 2 — Race Structure

```
Phase 1 is complete and the feel targets pass. Build Phase 2 per
GAME_BIBLE/18_Roadmap.md.

Read: 04_AI.md, 05_Tracks.md, 01_Game_Loop.md

Add:
- Start countdown
- Checkpoints as ordered line-segment gates, with lap validation that prevents
  reverse-driving and skip exploits
- Finish conditions and race timer
- Three AI opponents using waypoint following. AI must produce the same input
  struct as the keyboard and use the same vehicle controller — no special
  physics.
- Position tracking (laps, checkpoints passed, distance to next)
- Results screen
- Instant retry, under 2 seconds to countdown

Keep the test arena geometry. This phase is about race structure, not track
design.
```

---

## Phase 3 — Vertical Slice

```
Build the Rug Route Rookie Circuit as a polished vertical slice.

Read: 06_World_Town_Rug.md, 05_Tracks.md, 12_Art_Guide.md, 11_UI.md

The track must pass the full authoring checklist in 05_Tracks.md, including
one shortcut, one jump, and one moving hazard.

Before writing any track data, confirm GROUND_TILT is locked and tell me which
content pipeline approach we're using per 16_Content_Pipeline.md.
```

---

## Bible maintenance

```
We decided <X> in this session. Update the relevant GAME_BIBLE docs, including
any open questions this resolves or any DRAFT status this clears.
```

```
Review GAME_BIBLE/ for anything now contradicted by the code, and anything
still marked DRAFT that we've since settled. List discrepancies before
changing anything.
```

---

## Track authoring

```
Author a new track for <world> called <name>.

Read 05_Tracks.md for the schema and the authoring checklist, and the relevant
world doc for theme.

Produce the track data, then walk me through the checklist item by item and
tell me honestly which ones it doesn't yet meet.
```

---

## Review

```
Review the current build against GAME_BIBLE/18_Roadmap.md exit criteria for
the phase we're in. Be honest about what doesn't pass — I'd rather know now
than build on top of it.
```

```
Check the codebase against the architectural rules in 17_Claude_Rules.md,
especially: does any gameplay code read projected coordinates or GROUND_TILT,
and could a new vehicle or track be added without touching src/systems/?
```

---

## Related

`18_Roadmap.md` — what each phase contains.
`17_Claude_Rules.md` — the working agreement these assume.
