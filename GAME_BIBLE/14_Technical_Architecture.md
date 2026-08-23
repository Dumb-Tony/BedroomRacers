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

1. ~~Build step from Phase 4, or stay build-free?~~ **RESOLVED: a build STEP,
   never a build system.** `tools/build-artifact.sh` bundles thirty-six files
   into one sendable `dist/play.html`. Vite is not an option at any price --
   this machine has no Node.js. See the section below.
2. ~~TypeScript?~~ **RESOLVED: no.** `tsc` needs the Node runtime this machine
   does not have, and the data errors that actually shipped were valid objects
   of the right shape. `findStrayRects()` catches those; a type declaration
   could not.
3. ~~How is track data authored and loaded?~~ **RESOLVED: JS modules, bundled.**
   `fetch()` is blocked by CORS over `file://`, which is how the sendable build
   is opened, and `share.sh` verifies the artifact makes no external requests.

## Related

`03_Driving_Physics.md` — the vehicle model.
`16_Content_Pipeline.md` — how data gets made.
`17_Claude_Rules.md` — coding conventions.

## View culling (Phase 8)

Doubling the field to seven opponents raised the question of what a frame
actually costs. It could not be answered directly — **`performance.now()` does
not advance under headless virtual time**, so every wall-clock measurement in
this environment reads zero. Counting work instead found the real problem:

Of ~300 wall segments on a track, only **44-61 were anywhere near the viewport**
and roughly a quarter were behind the camera outright. All ~300 were projected,
pushed into the depth sort, sorted and drawn — **and again for every viewport**,
so a four-player split screen was pushing ~1,300 drawables a frame with ~85%
waste. Behind-camera geometry is worse than wasted: it projects to mirrored
coordinates and was being drawn.

Walls, props, hazards and loop segments are now culled before the sort.
Measured: **~81% of wall geometry removed**, with the same picture.

### A point test is not enough

The first version tested each wall by its midpoint and wrongly rejected about
one wall per camera position — a segment popping in and out at the screen edge,
which is exactly where it is most noticeable. The cause is specific: **a wall
whose midpoint is behind the camera can still have an endpoint in front of it
and on screen.**

Anything with extent is now tested by its extent — both ends, floor and top, kept
if any point survives. Four projections instead of one, against 81% of the
geometry not being drawn at all.

### Verifying a cull

Pixel-diffing a culled frame against an unculled one **does not work here**, and
two attempts proved it. `render()` eases the camera on every call, so rendering
twice moves it — the first diff was 19% of the frame and was measuring camera
drift. Pinning the camera cut it to 4%, which was then particles and bob phase
advancing between captures.

The right test is of the **predicate, not the pixels**: for every object the cull
rejects, project its full extent and assert no part lands inside the viewport.
That isolates the thing being changed. Result: **0 false rejects** across 24
camera positions on four tracks.

## The cull was throwing away two thirds of what you could see (Phase 9)

Everything above is wrong in one specific, expensive way — and the section
immediately above it is *why that survived*.

The predicate contained `if (p.depth < 0) continue;`, commented "behind the
camera". `depth` is documented in `Projection.js` as camera-space distance where
**LARGER MEANS NEARER**, so everything **in front** of the car has *negative*
depth. The test discarded the half of the screen a driver is looking at.

Measured on Rug Loop at one camera position: of the **81** wall segments actually
inside the viewport, the cull kept **28**. Dresser Drop, 34 of 74. Roughly **two
thirds of the visible walls were never drawn.**

The celebrated "81% of wall geometry removed, with the same picture" was mostly
removing geometry that belonged on screen. "A quarter behind the camera outright"
was the same misreading: in an axonometric projection **nothing** is behind the
camera. There is no divide by depth, so no singularity and no near plane — the
sx/sy box is a complete visibility test by itself, and the depth line is simply
deleted.

### How a verified check verified nothing

The predicate test asked: *for everything the cull rejects, does any part land
inside the viewport?* — and computed "inside the viewport" from the same model of
visibility the predicate used. Both agreed that things in front of the camera
were behind it. **A check built on the assumption it is testing will confirm that
assumption.** It reported 0 false rejects and was, on its own terms, right.

What catches this is comparing against the *picture*, because the picture has no
opinions: render with culling off, render with it on, require them to match.

### Pixel-diffing a culled frame does work — with `dt = 0`

The section above concluded it "does not work here" after camera drift and
particles spoiled two attempts. Those were the same cause with the same fix:
**render with `dt = 0`.** The camera ease, the particles and every other
time-driven animation are functions of `dt`; hand it zero and they freeze,
leaving only what actually changed.

The residue is a few dozen isolated pixels, one level apart, in a single channel
— the rasteriser composing identical geometry through a different path. Never
two adjacent, no shape to them. **Missing geometry cannot look like that**: it is
a contiguous block of hundreds of pixels differing by tens. Judge on magnitude
and structure, not on a count of pixels that differ at all.

Across all six tracks, four camera positions each: worst channel difference
**5 of 255**, on **0.028%** of the frame.

### The road was never culled at all

`drawRoad` traced the entire track outline **three times a frame** — once to fill
and once for each kerb — wherever the camera was. It was the most expensive thing
on screen and it was drawn in full on every device.

It is now drawn as visible **runs**. A ring cannot simply have segments skipped,
because the fill needs a closed shape, but a run of consecutive segments closes
on itself: `outer[a..b]` followed by `inner[b..a]` reversed is a ribbon that
fills exactly like that slice of the ring. Runs plural, because a figure-eight
crosses itself and two separate stretches are on screen at once — joining them
would put the whole far side back in.

**Culling now scales with the screen, which it never did.** A phone viewport is
28% of a desktop's area and was costing 92-98% as much to draw; it is now 78-87%.
Per-frame work is 42% below drawing everything.

Absolute cost went *up* against the shipped build — Rug Loop 1,565 to 2,332
operations a frame — and that is the honest trade. The old number was cheap
because the game was not drawing two thirds of the walls in front of you.

## The tooling questions, answered by what shipped (Phase 10)

Open questions 1, 2 and 3 were all asked before there was anything to look at.
There are now eight tracks, thirty-six source files and a published build, so
they can be answered from evidence instead of preference.

### 1. Build step or build-free? — **A build STEP, never a build SYSTEM**

Both, and the distinction is the whole answer. `tools/build-artifact.sh`
concatenates thirty-six source files into a single `dist/play.html`, and it is
genuinely required: the deliverable is one file a person can be sent, opened from
their downloads folder, with no server and no second request.

What was rejected is the build *system*. Vite was the obvious candidate and is
impossible here for a reason that has nothing to do with taste: **this machine
has no Node.js**. No npm, no `tsc`, no bundler, no dev server. The stack is bash
and a browser.

That constraint turned out to be a feature. The build is forty lines of `cat`
with a drift guard, it cannot break in a way that needs a lockfile to diagnose,
and the project has never spent a minute on a toolchain upgrade. The cost is
paid in exactly one place — **a new source file must be registered in BOTH
`index.html` and the `FILES` list**, and a file missing from both once shipped
with `BR.Items` undefined.

### 2. TypeScript? — **No**

Same reason, and it is not a close call: `tsc` needs Node. Adopting TypeScript
means adopting a runtime this machine does not have, to check schemas that are
authored as plain object literals and read by one program.

The thing TypeScript was wanted for — catching malformed track data — is done
instead by `TrackManager.findStrayRects()` and the smoke test, which check the
data against **how the game actually reads it** rather than against a
declaration. That catches the error TypeScript could not have: six rectangles
authored around their centres when every consumer tests `x <= p <= x + w`. Every
one of those is a valid object of the right shape.

### 3. Track data — **JS modules, bundled. Not fetched JSON**

Decided by two hard constraints rather than by tool-friendliness.

`fetch()` of a local JSON file is blocked by CORS over `file://`, and the whole
point of the sendable build is that it opens from `file://`. There is no server
to fall back on. And `tools/share.sh` verifies the built file makes **no external
fetches at all** — a runtime load would fail that check by design, because a
build that reaches for the network is a build that breaks on somebody else's
machine.

So the eight tracks in `src/data/tracks/` are `.js` files declaring object
literals onto `BR`, and there is not one `fetch`, `XMLHttpRequest` or dynamic
`import()` anywhere in `src/`. JSON's tool-friendliness would matter if there
were a tool; there is not, and `16_Content_Pipeline.md` q1 explains why one was
not needed — a track is about a hundred lines of readable data.
