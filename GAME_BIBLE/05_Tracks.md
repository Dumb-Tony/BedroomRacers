# 05 — Tracks

## Anatomy of a track

A track is data, not code. Every track is composed of:

| Element | Purpose |
| --- | --- |
| **Surface zones** | Polygons tagged with a surface type; drive feel |
| **Collision geometry** | Walls and barriers as line segments |
| **Checkpoints** | Ordered gates for lap validation and respawn |
| **Spawn positions** | Grid slots, ordered |
| **Racing lines** | Waypoint lists for AI (`04_AI.md`) |
| **Props** | Static and dynamic objects |
| **Hazards** | Moving or triggered dangers |
| **Ramps** | Launch volumes with direction and strength |
| **Boost pads** | Trigger volumes granting boost |
| **Collectibles** | Stars, tokens, hidden toy pieces |
| **Decoration** | Non-interactive visual dressing |

## Track data format

```js
{
  id: "town-rug-loop",
  name: "Rug Route Rookie Circuit",
  world: "town-rug",
  bounds: { w: 4200, h: 3000 },
  laps: 3,

  surfaces: [
    { type: "rugRoad", poly: [[x,y], ...] },
    { type: "rugGrass", poly: [[x,y], ...] }
  ],
  walls: [ { a: [x,y], b: [x,y] } ],
  checkpoints: [
    { id: 0, a: [x,y], b: [x,y], isFinish: true }
  ],
  spawns: [ { x, y, heading } ],
  racingLines: [ { id: "main", waypoints: [...] } ],
  props:  [ { type: "crayon", x, y, rot, dynamic: false } ],
  hazards:[ { type: "toyTrain", path: [...], period: 8.0 } ],
  ramps:  [ { poly: [...], dir: [x,y], strength: 0.8 } ],
  boostPads: [ { poly: [...] } ],
  collectibles: [ { type: "star", x, y } ],
  decoration: [ ... ]
}
```

Anything that can be data must be data. If authoring a track requires writing
JavaScript, the pipeline has failed — see `16_Content_Pipeline.md`.

## Surface types

Handling values live in `03_Driving_Physics.md`. Design intent:

| Surface | Intent |
| --- | --- |
| **Printed rug roads** | The default. Predictable, the baseline everything else is judged against |
| **Rug grass** | Mild penalty. Cutting a corner across grass is a real choice, not a punishment |
| **Hardwood floor** | Fast but low grip. Rewards smooth input, punishes panic |
| **Blanket / clothing** | Soft, slow, uneven. Used to close off routes softly rather than with walls |
| **Plastic track** | Best surface. Fast and grippy — a reward, usually on an optional route |
| **Paper** | Slippery, and may shift when driven over. Chaotic by design |
| **Book covers** | Hard, slightly fast. Usually elevated routes or ramp approaches |

Every surface must be **identifiable by sight alone** before it is driven on.

## Checkpoints and lap validation

Checkpoints are ordered gates defined as line segments. A lap counts only when all
checkpoints have been crossed in order and the finish line is crossed last.

This prevents reverse-driving exploits and gives respawn anchors for free.

Rules:
- Checkpoint spacing must be tight enough that no shortcut can skip one.
- Every alternate route must pass through the same checkpoint sequence.
- Respawn places the vehicle at the last valid checkpoint, facing along the racing
  line, after a short delay.

## Alternate routes and shortcuts

Shortcuts are the replayability pillar in practice. Guidelines:

- **Every track has at least one.** Non-negotiable from Phase 3 onward.
- A shortcut should be **visible but not obvious** — findable by a curious player on
  lap two, not hidden behind pixel-hunting.
- Shortcuts carry **risk**: a jump that can be missed, a narrow gap, a hazard, a
  slower surface at the entry.
- Time saved should be modest — around 0.5–1.5 seconds. A shortcut that dominates
  turns the track into one route.
- Shortcuts must respect checkpoint order.

## Hazards

### Static
Building blocks, crayons, books, shoes, toy figures, puzzle pieces, cups, game
pieces, stuffed animals.

### Moving
Toy trains, rolling pencils, bouncing balls, wind-up toys, remote-controlled toys,
swinging cords, falling blocks, opening toy-box lids.

Moving hazards should be **periodic and learnable**, not random. A player on lap
three should be able to time the train. Randomness here reads as unfair.

### Surface
Spilled water, rug folds, loose paper, sand, mud, soap, sticky candy, dust patches.

### Interactive
Buttons that change routes, switches that activate ramps, gates that open
temporarily, fans that push vehicles, magnets that pull metal cars, launchers that
fire vehicles forward.

Interactive hazards are the strongest expression of the "interactive toy worlds"
pillar. Prioritise at least one per track from Phase 3.

## Prop behaviour

| Class | Behaviour |
| --- | --- |
| **Static** | Solid, immovable. Walls in disguise |
| **Knockable** | Displaced by impact, costs the player speed |
| **Destructible** | Breaks apart, minimal speed cost. Satisfying to hit |
| **Dynamic** | Simulated — rolls, falls, topples |

Bias toward knockable and destructible. A bedroom full of immovable objects feels
like a museum, not a play space.

## Readability rules

"Tracks may be hard to read" is a listed project risk. Mitigations are mandatory,
not optional:

- Road edges must have **visible boundaries** — kerbs, barriers, or a hard colour
  change. Never rely on surface texture alone.
- **Directional arrows** printed on the rug at every ambiguous junction.
- Alternate route entries get a **distinct visual marker** used consistently
  game-wide.
- The **critical path must be the widest, brightest path.**
- Any blind corner needs either a camera pull-back or a landmark visible before it.
- Test every track at mobile screen size before considering it finished.

## Track authoring checklist

Before a track is considered complete:

- [ ] Drivable start to finish without getting stuck
- [ ] Checkpoints prevent all reverse and skip exploits
- [ ] At least one shortcut, with genuine risk
- [ ] At least one ramp or jump
- [ ] At least one moving hazard
- [ ] AI completes a clean lap on all three difficulties
- [ ] AI never permanently stuck
- [ ] Readable at mobile resolution
- [ ] Surface transitions visible and audible
- [ ] Lap time in the 30–50 second range for a three-lap race
- [ ] Collectibles placed, none unreachable
- [ ] Spawn grid does not cause first-corner pileups

## Open questions

1. **Authoring tool.** Hand-written JSON will not scale past two or three tracks.
   Options: Tiled tilemaps, a custom in-browser editor, or SVG paths exported from a
   drawing tool. See `16_Content_Pipeline.md`.
2. **Elevation representation.** Bridges and under-bed sections need layered
   collision. Simplest model is discrete "floor levels" with transition zones rather
   than continuous height.
3. **Track size vs zoom.** Depends on the `GROUND_TILT` decision in
   `03_Driving_Physics.md`. Do not author real tracks until that is settled.

## Related

`06_World_Town_Rug.md` — the flagship tracks.
`04_AI.md` — racing line authoring.
`16_Content_Pipeline.md` — how tracks get made.
