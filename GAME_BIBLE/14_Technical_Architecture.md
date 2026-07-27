# 14 — Technical Architecture

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | JavaScript (ES modules) | No build step required initially |
| Engine | **Phaser 3** | Input, sprites, cameras, audio, scenes, tilemaps |
| Physics | **Custom** for vehicles; Phaser Arcade for overlaps only | See `03_Driving_Physics.md` |
| Rendering | Phaser WebGL renderer, Canvas fallback | |
| Persistence | LocalStorage | See `15_Save_System.md` |
| Delivery | Static files, no server | |

### Why Phaser

Provides input handling, sprite management, cameras, animation, audio, scene
management and browser compatibility. Using it for everything except vehicle
handling — the one place where control over feel matters more than convenience.

### Why not a physics engine for vehicles

Reasoning in full in `03_Driving_Physics.md`. Summary: Arcade physics is AABB-only,
Matter.js fights the custom projection and aims at realism we don't want, and arcade
vehicle handling is a few hundred lines that we need total control over.

### Loading Phaser

Phaser is roughly 1MB. Two options:

1. **CDN `<script>` tag** — no build step, instant start, external dependency.
2. **Vendored local copy** — self-contained, no network dependency, slightly more setup.

**Recommend vendoring a pinned copy** into `assets/vendor/`. It keeps the project
genuinely self-contained, avoids a CDN outage breaking the game, and pins the version.

A build step (Vite) becomes worthwhile around Phase 4 when the module count grows.
Not before.

## Project layout

```
bedroom-racers/
├── index.html
├── src/
│   ├── main.js               Phaser config and boot
│   ├── scenes/
│   │   ├── BootScene.js
│   │   ├── MenuScene.js
│   │   ├── GarageScene.js
│   │   ├── TrackSelectScene.js
│   │   ├── RaceScene.js
│   │   ├── ResultsScene.js
│   │   └── PauseScene.js
│   ├── systems/
│   │   ├── VehicleController.js   Custom physics integration
│   │   ├── RaceManager.js         Countdown, laps, positions, results
│   │   ├── TrackManager.js        Layout, spawns, checkpoints, hazards
│   │   ├── AIDriver.js            Waypoint following
│   │   ├── ProgressionManager.js  Medals, stars, unlocks
│   │   ├── SaveManager.js         LocalStorage
│   │   ├── InputManager.js        Keyboard, touch, gamepad
│   │   └── Projection.js          World→screen, depth sorting
│   ├── entities/
│   │   ├── Vehicle.js
│   │   ├── Prop.js
│   │   └── Hazard.js
│   ├── data/
│   │   ├── vehicles.js
│   │   ├── tracks/
│   │   ├── events.js
│   │   └── surfaces.js
│   └── ui/
│       ├── HUD.js
│       └── widgets/
├── assets/
│   ├── vendor/
│   ├── sprites/
│   ├── audio/
│   └── fonts/
└── GAME_BIBLE/
```

## Core systems

### Game State Manager
Phaser's scene system. Handles main menu, garage, track selection, race, results,
pause.

Pause runs as a **parallel scene** over a paused RaceScene, so pausing is instant and
state-preserving — required by "pause at any time" in `02_Mechanics.md`.

### Vehicle Controller
Acceleration, steering, friction, drifting, boosting, collision response, surface
effects. The core of the game. See `03_Driving_Physics.md`.

Must be **usable by both player and AI** with only the input source differing. AI
produces the same input struct a keyboard does — this guarantees AI cannot cheat, per
`04_AI.md`.

```js
{ steer: -1..1, throttle: 0..1, brake: 0..1, drift: bool, boost: bool }
```

### Race Manager
Countdown, laps, checkpoints, racer positions, finish order, timers, results.

Position calculation: sort by (laps completed, checkpoints passed, distance to next
checkpoint). Cheap and correct.

### Track Manager
Track layout, spawn positions, checkpoints, hazards, shortcuts, surface zones,
collectibles. Loads track data (`05_Tracks.md`) and instantiates the world.

### AI Driver
Waypoint following, overtaking, obstacle avoidance, boost use, difficulty behaviour,
crash recovery. See `04_AI.md`.

### Progression Manager
Medals, stars, unlocks, vehicle ownership, cosmetic ownership, track completion.

### Save Manager
LocalStorage for settings, best times, unlocks, selected vehicle, completed
objectives. See `15_Save_System.md`.

### Projection
World→screen transform, depth sorting, shadow placement.

**Isolated deliberately.** Nothing else in the codebase should know about
`GROUND_TILT`. If the tilt value changes — and it will — exactly one file changes.

```js
const GROUND_TILT  = 0.62;
const HEIGHT_SCALE = 0.85;

export function project(x, y, z = 0) {
  return { sx: x, sy: y * GROUND_TILT - z * HEIGHT_SCALE };
}
export function depthOf(y) { return y; }
```

## Render pipeline

1. Update simulation on the flat XY plane. **No projection awareness anywhere.**
2. For each drawable, compute `project(x, y, z)`.
3. Set sprite depth from world `y`.
4. Draw shadows at `project(x, y, 0)`.
5. Draw sprites at the projected position, selecting the heading frame from
   `heading` (`12_Art_Guide.md`).

The separation between steps 1 and 2 is the most important architectural boundary in
the project. Violating it — letting any gameplay code read a projected coordinate —
makes the perspective impossible to change later.

## Data-driven content

Tracks, vehicles and events are configuration objects, never code.

```js
const vehicle = {
  id: "red-racer", name: "Red Racer",
  maxSpeed: 280, acceleration: 160, handling: 0.85,
  weight: 1.0, boostPower: 1.15, sprite: "red-racer.png"
};

const event = {
  id: "rug-route-01", name: "Rug Route Rookie Circuit",
  trackId: "town-rug-loop", mode: "standard-race",
  laps: 3, opponents: 5,
  rewards: { bronze: 1, silver: 2, gold: 3 }
};
```

Adding content must never require touching a system file. This is the "expandable
structure" pillar as an engineering rule. See `16_Content_Pipeline.md`.

## Performance

Browser performance is a listed risk. Budget targets:

- **60fps on a mid-range laptop**, 30fps floor on a low-end phone
- Hard cap on simultaneous particles; **pool everything**
- Cap simultaneous audio sources (`13_Audio.md`)
- Culling for off-screen props
- Sprite atlases, not individual images
- Fixed 60Hz simulation timestep with an accumulator, decoupled from render

Fixed timestep is also required for deterministic Time Trial ghosts (`04_AI.md`).

**Profile on a real low-end device before Phase 3 is called complete**, not after.

## Testing

No formal framework initially. Priorities as the project grows:

- Physics integration determinism (same inputs → same result)
- Lap/checkpoint validation against exploits
- Save migration (`15_Save_System.md`)

These are the three places where bugs are expensive and hard to spot by playing.

## Open questions

1. Build step from Phase 4, or stay build-free? Vite is the obvious choice if needed.
2. TypeScript? Would help with data schemas but adds a build step immediately.
3. How is track data authored and loaded — inline JS modules or fetched JSON?
   JSON is tool-friendly, JS modules avoid a fetch. See `16_Content_Pipeline.md`.

## Related

`03_Driving_Physics.md` — the vehicle model.
`16_Content_Pipeline.md` — how data gets made.
`17_Claude_Rules.md` — coding conventions.
