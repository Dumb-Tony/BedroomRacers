# Bedroom Racers

A browser-based arcade racing game where toy vehicles race across oversized childhood
play spaces. The flagship environment is a bedroom floor covered by a nostalgic
town-map rug, where printed roads become the track and everyday objects become
obstacles, ramps and hazards.

**Status: playable.** Twelve tracks, twenty-six events, nine vehicles, single
player and split screen, ghosts, save codes and a shareable single-file build.

> This file said "Pre-production. Design documentation complete, no code yet"
> and "Nothing to run yet" through every phase of the build, long after both
> stopped being true. A README is the one document nobody re-reads and everybody
> reads first, which makes it the easiest place in the repo for a stale claim to
> survive — see the note on the bible below, which has the same hazard and a
> rule against it.

---

## Repository layout

```
bedroom-racers/
├── src/            The game. Plain <script> tags — no modules, no bundler
│   ├── config/     tuning.js — every number that changes how the car feels
│   ├── data/       tracks, vehicles, events
│   ├── entities/   the vehicle
│   ├── systems/    simulation: physics, collision, rails, AI, race, save
│   ├── render/     Renderer.js and Particles.js — render-only, always
│   └── ui/         HUD, screens, minimap, corner hints, debug panel
├── tools/          bash + PowerShell harnesses; see "The tools" below
├── GAME_BIBLE/     Design source of truth (see below)
├── assets/         Art, audio, and data files
├── reference/      Mood boards, inspiration, research
├── index.html      The DEV page — loads src/ directly. This is what you edit
└── README.md
```

`dist/` is generated and gitignored.

## Running it

**There is no Node and no npm on this machine, by design.** The game is ~40
classic `<script>` tags, which `file://` blocks as cross-origin, so it needs a
server — and the server is PowerShell:

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1     # http://localhost:8080
```

That serves the SOURCE tree, so editing a file in `src/` and reloading is the
whole local loop. `.claude/launch.json` starts the same thing.

Two builds come out of it:

- `tools/build-artifact.sh` → `dist/play.html`, the bundle every harness loads.
- `tools/share.sh` → `dist/bedroom-racers.html`, one file that opens by
  double-click with no server and no network.

`tools/publish.sh` pushes the current build to
<https://dumb-tony.github.io/bedroom-racers-play/>. The source repository is
private and stays private; the public site is a separate repo containing nothing
but the built HTML.

## The tools

Every claim in this project is expected to come with a measurement, and these
are how the measurements are taken. Full notes in each file's header.

| Tool | Answers |
| --- | --- |
| `tools/smoke.sh` | Does anything throw, anywhere? 55 checks. Run before every commit |
| `tools/calibrate.sh` | Did any lap time move? 26 events against a committed baseline |
| `tools/pays.sh` | Does each track feature earn its place? Slow — with and without |
| `tools/shot.sh` | Render one frame, deterministic and seeded, so a claim about how something LOOKS can be checked by looking |
| `tools/share.sh` | Build the sendable single file and verify it makes no external requests |

## The Game Bible

`GAME_BIBLE/` is the authoritative design reference. When design intent and code
disagree, the bible wins — or the bible gets updated. It is not a historical
archive; it describes the game as currently intended.

| Doc | Covers |
| --- | --- |
| `00_Vision.md` | High concept, pillars, audience, what makes this different |
| `01_Game_Loop.md` | Core loop, session shape, race modes |
| `02_Mechanics.md` | Driving verbs and control schemes |
| `03_Driving_Physics.md` | The vehicle model, projection maths, tuning values |
| `04_AI.md` | Opponent behaviour, personalities, difficulty |
| `05_Tracks.md` | Track anatomy, surfaces, checkpoints, data format |
| `06_World_Town_Rug.md` | The flagship environment |
| `07_World_Stunt_Track.md` | Plastic stunt track — elevation and rails |
| `08_World_Sandbox.md` | Sandbox speedway — compaction and puddles |
| `09_Vehicles.md` | Stats model, roster, cosmetics |
| `10_Items.md` | Pickups and item combat |
| `11_UI.md` | HUD, menus, results, accessibility |
| `12_Art_Guide.md` | Visual direction and sprite specifications |
| `13_Audio.md` | Music, SFX, callouts |
| `14_Technical_Architecture.md` | Engine choice, systems, render pipeline |
| `15_Save_System.md` | LocalStorage schema and migration |
| `16_Content_Pipeline.md` | How new tracks and vehicles get authored |
| `17_Claude_Rules.md` | Working conventions for AI-assisted development |
| `18_Roadmap.md` | Phases, milestones, scope control |
| `19_World_Kitchen_Table.md` | Kitchen table — the tabletop world |
| `20_World_Sofa.md` | The sofa — cushions, gaps and the slowest road in the game |
| `PROMPTS.md` | Reusable prompts for each development phase |

Docs marked **DRAFT** contain open questions that need resolving — usually because
the answer can only come from building and playing something first. **A resolved
question is struck through and answered in place**, with the measurement that
settled it, so the reasoning survives and the wrong guess is visible next to the
right one.

## What exists

Twelve tracks across five `world` values in the data — `town-rug`, `sandbox`,
`stunt`, `kitchen`, `sofa` — and twenty-six events: standard races, time trials
with ghosts, and item races. Nine vehicles. Split screen up to four.

## Design constraints worth knowing up front

- **The simulation is flat 2D and the camera is a render-time transform.** No
  gameplay code may read `Projection.js`. This is the most important boundary in
  the project and it is why a render change is expected to show 0.00 on all 26
  calibrated events.
- **The projection is axonometric, at `groundTilt` 0.30** — locked in Phase 1.
  That is a much lower, more behind-the-car view than "slightly angled 2.5D"
  implied, and it decides the art direction: the top face is what a player sees.
  See `12_Art_Guide.md`.
- **No online multiplayer, no accounts, no server.** Progress moves between
  browsers as a hand-typed save code.
- **Family-friendly.** No realistic violence, no gambling mechanics, no loot boxes.
- **Nostalgia without infringement.** Childhood play spaces are the inspiration;
  layouts, objects, brands and visual designs must be original. The bar is
  highest in the stunt world — see `07_World_Stunt_Track.md`.
