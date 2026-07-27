# Bedroom Racers

A browser-based arcade racing game where toy vehicles race across oversized childhood
play spaces. The flagship environment is a bedroom floor covered by a nostalgic
town-map rug, where printed roads become the track and everyday objects become
obstacles, ramps and hazards.

**Status:** Pre-production. Design documentation complete, no code yet.

---

## Repository layout

```
bedroom-racers/
├── GAME_BIBLE/     Design source of truth (see below)
├── assets/         Art, audio, and data files
├── reference/      Mood boards, inspiration, research
└── README.md
```

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
| `06_World_Town_Rug.md` | Flagship environment and its six tracks |
| `07_World_Stunt_Track.md` | Future world — plastic stunt tracks |
| `08_World_Sandbox.md` | Future world — sandbox speedway |
| `09_Vehicles.md` | Stats model, roster, cosmetics |
| `10_Items.md` | Pickups and item combat (post-MVP) |
| `11_UI.md` | HUD, menus, results, accessibility |
| `12_Art_Guide.md` | Visual direction and sprite specifications |
| `13_Audio.md` | Music, SFX, callouts |
| `14_Technical_Architecture.md` | Engine choice, systems, render pipeline |
| `15_Save_System.md` | LocalStorage schema and migration |
| `16_Content_Pipeline.md` | How new tracks and vehicles get authored |
| `17_Claude_Rules.md` | Working conventions for AI-assisted development |
| `18_Roadmap.md` | Phases, milestones, scope control |
| `PROMPTS.md` | Reusable prompts for each development phase |

Docs marked **DRAFT** contain open questions that need resolving — usually because
the answer can only come from building and playing something first.

## Running the game

Nothing to run yet. Once Phase 1 exists, this section will cover local setup.

## Design constraints worth knowing up front

- **Perspective is slightly angled 2.5D**, not pure top-down. The simulation is
  flat 2D; the tilt is a render-time projection only. See `03_Driving_Physics.md`.
- **No online multiplayer, no accounts, no server** in the first playable build.
- **Family-friendly.** No realistic violence, no gambling mechanics, no loot boxes.
- **Nostalgia without infringement.** Childhood play spaces are the inspiration;
  layouts, objects, brands and visual designs must be original.
