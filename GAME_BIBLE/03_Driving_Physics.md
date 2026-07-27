# 03 — Driving Physics

> **DRAFT.** The model and structure below are settled. The **numbers are not** —
> they are plausible starting values, not tuned ones. Real values can only come from
> building Phase 1 and driving it. Expect every constant here to change.

## Perspective: the single most important rule

The camera is **slightly angled 2.5D**, not pure top-down.

**The simulation is flat 2D. The tilt is a render-time projection only.**

Physics never knows about the camera angle. The vehicle exists on a flat XY plane
with a separate scalar `z` for height. Nothing in the driving model reads the
projection constants.

```js
const GROUND_TILT  = 0.62;  // vertical squash of the ground plane
const HEIGHT_SCALE = 0.85;  // how much world z lifts a sprite on screen

function project(x, y, z = 0) {
  return { sx: x, sy: y * GROUND_TILT - z * HEIGHT_SCALE };
}
```

Consequences:

- **Depth sorting** uses world `y`. Higher `y` draws in front.
- **Shadows** are drawn at `project(x, y, 0)` — always on the ground, never lifted.
  The gap between vehicle and shadow *is* the height cue.
- **Collision and steering maths are unchanged** from a top-down game. Do not
  compensate for the tilt anywhere in the simulation.
- **Rotating a single sprite no longer works.** See `12_Art_Guide.md`.

Tuning `GROUND_TILT` toward 1.0 approaches top-down; toward 0.4 approaches a low
chase view. 0.62 is a starting guess. Expect to tune this **early**, because it
changes how far ahead the player can see, which changes track design.

## Vehicle model

Classic arcade separation of **facing** from **motion**. The gap between the two is
the drift.

### State

```js
{
  x, y,          // world position on the flat plane
  z, vz,         // height and vertical velocity (jumps only)
  heading,       // facing angle, radians
  vel: {x, y},   // velocity vector, world units/sec
  angularVel,    // for collision spins
  driftCharge,   // 0..1, accumulates while drifting
  boostMeter,    // 0..1
  boostTime,     // remaining boost seconds
  surface,       // current surface type, see 05_Tracks.md
  grounded       // z <= 0
}
```

### Per-frame integration

1. Read input.
2. Compute `forward` and `lateral` unit vectors from `heading`.
3. Decompose `vel` into forward and lateral components.
4. **Apply grip** — multiply the lateral component by a grip factor. This is the
   entire drift mechanic. High grip means the car goes where it points; low grip
   means it slides.
5. Apply engine force along `forward`, capped at effective max speed.
6. Apply rolling friction and drag.
7. Recompose `vel`, integrate position.
8. Integrate `z` under gravity if airborne.
9. Resolve collisions.

Grip is the lever. Everything else is trim.

### Starting constants

Units are world units/second. Assume roughly **1 world unit = 1 screen pixel at
zoom 1**, and a car is about 28 units long.

> **Corrected in Phase 1.** The grip constants were originally written as
> `gripNormal: 0.92 / gripDrifting: 0.62` under the description "lateral
> velocity retained per frame". That is inverted — retaining *less* lateral
> velocity means *more* grip, so as written, pressing drift made the car grippier.
> Renamed to `lateralRetention*` so the direction is unambiguous, and the values
> replaced with measured ones.

```js
const PHYSICS = {
  // Grip — the drift lever.
  // Fraction of LATERAL velocity RETAINED per tick.
  // LOW = killed fast = grippy.  HIGH = persists = slidey.
  lateralRetentionNormal: 0.86,  // driving normally
  lateralRetentionDrift:  0.94,  // drift held
  retentionBlendRate:      6.0,  // how snappily grip changes on press/release

  // Steering
  turnRateBase:    2.6,    // radians/sec at optimal speed
  turnSpeedFloor:  40,     // below this, steering authority ramps in
  turnSpeedPeak:   180,    // speed of maximum turn rate
  turnRateAtMax:   0.75,   // multiplier on turn rate at top speed
  driftTurnBonus:  1.35,   // steering multiplier while drifting

  // Longitudinal
  engineForce:     420,
  brakeForce:      640,
  reverseMaxSpeed: 70,
  rollingFriction: 0.985,
  dragCoefficient: 0.0016,

  // Boost
  boostForce:      760,
  boostMaxSpeedMul: 1.28,
  boostDuration:   1.4,    // seconds per activation
  boostDrainRate:  0.55,   // meter units/sec while active

  // Drift charge
  driftChargeRate:     0.42,  // meter/sec while drifting above min angle
  driftMinAngle:       0.18,  // radians of slip before charge accrues
  driftChargeFalloff:  1.2,   // charge decay/sec after releasing drift

  // Jumps
  gravity:         1400,
  landingGraceAngle: 0.5,  // radians of heading/velocity mismatch tolerated
  cleanLandingBoost: 0.15, // meter awarded

  // Collisions
  collisionRestitution: 0.45,
  collisionSpeedLoss:   0.35,
  spinRecoveryTime:     0.6,   // seconds, hard cap
};
```

### Steering curve

Turn rate is a function of speed, not a constant:

```
speed < turnSpeedFloor   → ramp in linearly from ~30%
speed ≈ turnSpeedPeak    → 100% of turnRateBase
speed → maxSpeed         → lerp down to turnRateAtMax
```

This gives the car weight without making it feel unresponsive, and it makes
high-speed straights feel committed rather than twitchy.

## Drift model

Drift is not a separate state machine. It is a **grip modifier plus a steering
bonus**, which keeps it continuous and forgiving.

- Holding drift lerps grip from `gripNormal` toward `gripDrifting`.
- Slip angle = angle between `heading` and velocity direction.
- Charge accrues while slip exceeds `driftMinAngle`, at a rate scaled by slip
  magnitude (bigger slides charge faster, up to a cap).
- Releasing drift lerps grip back at `gripRecoverRate`.
- Charge converts to boost meter. It does **not** auto-fire — the player spends it.

**Deliberately not doing:** discrete drift tiers (blue/orange/purple sparks). Tiers
reward holding a drift for a fixed duration, which encourages drifting on straights.
A continuous model rewards drifting *where corners actually are*. Revisit only if
playtesting shows players can't read their charge state.

### Feel targets

These are the acceptance criteria for Phase 1. If these aren't true, keep tuning
before adding anything else.

- A player can initiate, hold and exit a drift **without spinning out** on their
  first attempt.
- A well-timed drift through a corner is **faster** than steering through it.
- A drift held too long **scrubs speed** — there is a cost to overcommitting.
- Counter-steering out of a slide feels controllable, not like fighting the car.
- Releasing drift mid-corner recovers grip predictably.

### Measured, Phase 1

Automated 90-degree corner test at full entry speed, Red Racer. Ticks are at
60Hz, so lower is faster through the corner.

| `lateralRetentionDrift` | Max slip | Ticks | Speed kept |
| --- | --- | --- | --- |
| *(steering only)* | 14° | 55 | 94% |
| 0.90 | 27° | 40 | 85% |
| 0.92 | 33° | 40 | 84% |
| **0.94** *(default)* | **40°** | **40** | **84%** |
| 0.96 | 50° | 41 | 88% |
| 0.97 | 56° | 42 | 91% |

Two targets are confirmed by measurement rather than opinion:

- **Drift beats steering** — 40 ticks vs 55, roughly 27% faster, across the
  entire usable range of the constant.
- **Overcommitting scrubs speed** — two seconds of continuous full-lock drift
  drops the car from 237 to 125 units/sec.

The remaining targets are subjective and still need a human driving. The value
above was chosen for how the slide *looks*: past about 50° the car is near
sideways and reads as comical rather than skilful.

## Jump model

```js
// On ramp contact
vz = rampLaunchVelocity * (speed / maxSpeed);

// Per frame while airborne
vz -= gravity * dt;
z  += vz * dt;
grounded = false;

// Steering authority is reduced but not zero — allow air correction
turnRate *= 0.35;

// On landing (z <= 0)
const mismatch = angleBetween(heading, velocityDirection);
if (mismatch < landingGraceAngle) awardBoost(cleanLandingBoost);
else applySpeedLoss(mismatch);
z = 0; vz = 0; grounded = true;
```

Collision with ground-level walls is **suspended while airborne** — that is what
makes jumps into shortcuts work. Airborne vehicles still collide with objects that
have height (block towers, furniture).

## Surface handling

Surface modifies grip, max speed and acceleration multiplicatively. Surface types
are defined in `05_Tracks.md`.

```js
const SURFACES = {
  rugRoad:   { grip: 1.00, maxSpeed: 1.00, accel: 1.00 },
  rugGrass:  { grip: 0.95, maxSpeed: 0.82, accel: 0.90 },
  hardwood:  { grip: 0.78, maxSpeed: 1.12, accel: 1.05 },
  blanket:   { grip: 1.05, maxSpeed: 0.70, accel: 0.75 },
  plastic:   { grip: 1.10, maxSpeed: 1.15, accel: 1.10 },
  paper:     { grip: 0.60, maxSpeed: 1.00, accel: 0.85 },
  bookCover: { grip: 0.90, maxSpeed: 1.05, accel: 1.00 },
};
```

Surface transitions must be **audible and visible** — a tire-note change and a
particle change — so players learn the map through feel.

## Vehicle stat mapping

Vehicle stats from `09_Vehicles.md` map onto physics constants as multipliers:

| Stat | Affects |
| --- | --- |
| `maxSpeed` | Top speed cap |
| `acceleration` | `engineForce` |
| `handling` | `turnRateBase` and `gripNormal` |
| `weight` | Collision outcomes, momentum, resistance to being pushed |
| `boostPower` | `boostForce` and `boostMaxSpeedMul` |

Weight is the interesting one: heavy vehicles win collisions and lose corners.

## Collision response

Circle colliders. Cars are approximated as circles, not rotated rectangles — this is
correct for the game, not a shortcut. Circle collision is forgiving, never wedges,
and matches the "playful not punishing" requirement.

- **Car vs wall:** reflect velocity about the wall normal, scale by
  `collisionRestitution`, apply speed loss scaled by impact angle. Glancing blows
  should barely register.
- **Car vs car:** exchange momentum weighted by `weight`. The lighter car moves more.
- **Car vs prop:** props may be knocked, toppled or destroyed. See `05_Tracks.md`.
- **Spin:** only on hard, near-perpendicular impacts. Hard-capped at
  `spinRecoveryTime` regardless of impact force.

Never let a collision remove control for longer than the cap. Frustration scales
non-linearly with lost control time.

## Physics engine decision

**Use custom integration. Do not use a physics engine for vehicles.**

Reasoning:

- Phaser Arcade physics is AABB-only — no rotated bodies. Fine for triggers,
  useless for vehicle response.
- Matter.js gives real rigid bodies but fights the custom projection, is heavier,
  and its tuning surface is aimed at realism we explicitly don't want.
- Arcade vehicle handling is ~200 lines of custom code and gives total control over
  feel. For a game whose entire risk is "does driving feel good", that control is
  the point.

**Use Phaser Arcade physics only for overlap tests** — checkpoints, pickups, hazard
trigger zones. Cheap, and no interaction with vehicle motion.

**Escape hatch:** if a later track genuinely needs rigid-body stacking (falling block
towers in Block City Grand Prix), add Matter.js as a *separate simulation* for those
props only. Do not migrate the vehicle model.

## Open questions

1. **`GROUND_TILT` value.** 0.62 is still a guess. Affects visibility distance and
   therefore track design. **Blocks all vehicle art and track authoring.** Live
   slider exists in the Phase 1 debug panel — drag it and decide.
2. ~~**Fixed vs variable timestep.**~~ **Resolved in Phase 1.** Fixed 60Hz
   accumulator with render interpolation, capped at 6 steps per frame.
   Determinism verified: identical input sequences produce bit-identical
   positions over 300 ticks including wall collisions.
3. **Does drift need a visible charge tier** for readability, given we rejected
   discrete tiers? Playtest with children specifically.
4. **Camera behaviour** — pure follow, or look-ahead biased by velocity? Both are
   implemented; set `CAMERA.lookAhead` to 0 to compare.
5. **Air control amount.** 0.35 is arbitrary. Too much trivialises jump shortcuts;
   too little makes landings feel arbitrary.
6. **Wall riding.** *(New, found in Phase 1.)* A car that deflects off a wall
   slides along it while keeping full speed, because only the normal component of
   velocity is damped. That is correct physics and it makes glancing blows feel
   good — but it also means leaning on a wall through a corner is free. Real
   arcade racers usually add a tangential scrub. Needs a decision before Phase 3,
   since it changes how barriers get placed in track design (`05_Tracks.md`).

## Related

`02_Mechanics.md` — the player-facing description of these systems.
`09_Vehicles.md` — stat definitions.
`14_Technical_Architecture.md` — where this code lives.
