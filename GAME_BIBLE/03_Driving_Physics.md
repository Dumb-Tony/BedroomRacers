# 03 — Driving Physics

> **DRAFT.** The model and structure below are settled. The **numbers are not** —
> they are plausible starting values, not tuned ones. Real values can only come from
> building Phase 1 and driving it. Expect every constant here to change.

## Perspective: the single most important rule

The camera is **slightly angled 2.5D**, and it is a **chase camera** — it sits
behind the car and **rotates** so the direction of travel always points up the
screen.

**The simulation is flat 2D. The camera is a render-time transform only.**

Physics never knows where the camera is or which way it faces. The vehicle exists
on a flat XY plane with a separate scalar `z` for height. Nothing in the driving
model reads the projection.

Three stages, strictly in this order:

```js
// 1. translate relative to the camera focus
// 2. rotate by camera yaw, so travel direction becomes screen "up"
// 3. squash the ground plane, and lift by height

const a = -(camYaw + Math.PI / 2);
const cos = Math.cos(a), sin = Math.sin(a);

function project(x, y, z = 0) {
  const dx = x - camX, dy = y - camY;
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return {
    sx: rx,
    sy: ry * GROUND_TILT - z * HEIGHT_SCALE,
    depth: ry,
  };
}
```

**Rotation must happen before the squash.** Doing it the other way round shears
the world. There is a regression test for this.

Consequences:

- **Depth sorting uses camera-space `y`**, not world `y`. With a rotating camera,
  "further away" depends on where the camera is looking.
- **Shadows** are drawn at `project(x, y, 0)` — always on the ground, never lifted.
  The gap between vehicle and shadow *is* the height cue.
- **Collision and steering maths are unchanged** from a top-down game. Do not
  compensate for the camera anywhere in the simulation.
- **Everything with height is now seen from all sides.** See `12_Art_Guide.md` —
  this is the expensive consequence.

### Camera yaw follows travel, not heading

The camera tracks the **direction of travel**, not where the nose is pointing. If
it followed the nose, drifting would swing the view sideways off the track.
Following velocity keeps the view pointed where the car is actually going, and
the car visibly yaws *within* the frame instead — which is the clearest possible
read on how hard it is sliding.

Below `yawMinSpeed` the camera falls back to heading, because velocity direction
is noise at a crawl and reversing would otherwise whip the view through 180°.

`yawRate` deliberately lags. Measured mid-drift at 4.5: true slip 43°, camera lag
behind travel 22°, so the car reads as **64° sideways on screen** — noticeably
more dramatic than it physically is. That stacking is a taste call, and a slider.

`horizonBias` places the car low on screen so more road is visible ahead. That,
not a literal camera offset, is what makes it read as being behind the car.

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

### Dialled in — Phase 1

These supersede the starting guesses above. Tuned by driving, 27 July 2026.

```
Projection: groundTilt = 0.30   heightScale = 0.85

CAMERA:   zoom 1.15 · followRate 7 · yawRate 4.5 · yawMinSpeed 25
          horizonBias 0.62 · lookAhead 0.1 · lookAheadMax 120

PHYSICS:  lateralRetentionNormal 0.86 · lateralRetentionDrift 0.97
          retentionBlendRate 6 · turnRateBase 1.7 · driftTurnBonus 1.35
          airControl 0.35 · engineForce 900 · brakeForce 640
          rollingFriction 0.986 · dragCoefficient 0.0016
          boostForce 800 · boostDuration 1.2 · boostMaxSpeedMul 1.28
          driftChargeRate 0.32 · driftMinAngle 0.18
          collisionRestitution 0.30 · collisionSpeedLoss 0.30
          gravity 1400 · rampMinSpeedFrac 0.35 · rampLipFrac 0.8
```

Vehicle top speeds were scaled **x1.25** at the same time — see below.

**`groundTilt` moved from 0.62 to 0.30**, which is a much lower, more
behind-the-car view than "slightly angled 2.5D" originally implied. This changes
the art direction materially: vehicles are seen far more from behind and far
less from above. `12_Art_Guide.md` needs revisiting before any sprite work.

Two values sit exactly on a debug slider limit — `groundTilt` at its minimum and
`engineForce` at its maximum — so neither should be treated as settled until the
ranges are widened and re-driven.

### Two speed-cap bugs found while applying these

**The engine overran the cap.** Overspeed decayed at `overspeedDecay` (400/sec)
while the engine pushed 900/sec, so the cap could never hold. Measured top speed
was 350 against a `maxSpeed` stat of 280 — the stat was decorative, and the whole
roster's top-speed spread would have flattened to nothing. The engine is now
gated off at the ceiling instead.

Because the tuning above was dialled in against that real 350, fixing the cap
would have made every car abruptly slower than the build that was signed off. All
five vehicles' `maxSpeed` were scaled x1.25 to preserve the felt speed and keep
the relative spread.

**The cap only covered forward velocity.** Lateral velocity is unbounded, so a
sustained drift let the engine keep refilling forward speed while the slide
persisted — two seconds of full-lock drift *accelerated* the car from 350 to 449.
The engine is now gated on total speed, so you cannot accelerate while sliding
sideways. That is both correct and what makes overcommitting cost you.

### Measured after tuning

| | Steering | Drifting |
| --- | --- | --- |
| Ticks through 90° | 87 | **65** |
| Speed kept | 345 / 350 | 349 / 350 |
| Max slip | 9° | 41° |

Drift still beats steering by **25%**. Overcommitting now costs speed, but only
mildly (350 → 343 over two seconds) — expected, since 0.97 retention is the
speed-preserving end of the range. Lower it toward 0.92 if the penalty should bite.

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

1. ~~**`GROUND_TILT` value.**~~ **Locked at 0.30**, which implies a camera 17.5°
   above the floor. `12_Art_Guide.md` has been rewritten around that measurement,
   so vehicle art is no longer blocked. Two follow-ons live there, both feel
   decisions rather than design ones: `heightScale` is 0.85 where geometric
   consistency wants 0.954, and the projection has no perspective at all — which
   at this angle makes a car 2000 units away draw the same size as one alongside.
2. ~~**Fixed vs variable timestep.**~~ **Resolved in Phase 1.** Fixed 60Hz
   accumulator with render interpolation, capped at 6 steps per frame.
   Determinism verified: identical input sequences produce bit-identical
   positions over 300 ticks including wall collisions.
3. **Does drift need a visible charge tier** for readability, given we rejected
   discrete tiers? Playtest with children specifically.
4. ~~**Camera behaviour** — pure follow, or look-ahead biased by velocity?~~
   **Superseded.** The camera is now a rotating chase camera following travel
   direction. `lookAhead` survives as a small extra bias, but `horizonBias` does
   most of the work. Open sub-question: is `yawRate 4.5` too much lag? It makes
   the car read 64° sideways in a 43° drift.
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
