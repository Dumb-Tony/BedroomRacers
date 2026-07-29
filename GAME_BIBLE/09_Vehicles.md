# 09 — Vehicles

## Philosophy

Every vehicle should be easy to understand and visually distinctive. Differences must
be **noticeable but balanced** — player preference should matter more than finding
the dominant pick.

The test: a player should be able to describe a vehicle's personality after one race
without reading its stats.

## Stat model

| Stat | Range | Affects |
| --- | --- | --- |
| `maxSpeed` | world units/sec | Top speed cap |
| `acceleration` | force units | `engineForce` |
| `handling` | 0..1 multiplier | `turnRateBase` and `gripNormal` |
| `weight` | 0.6..1.5 | Collision outcomes, momentum, resistance to being pushed |
| `boostPower` | multiplier | `boostForce` and `boostMaxSpeedMul` |

Mapping into physics constants is defined in `03_Driving_Physics.md`.

**Weight is the most interesting stat** and the easiest to under-use. Heavy vehicles
should genuinely win contact and genuinely lose corners. Do not flatten it in the
name of balance.

## Data schema

```js
{
  id: "red-racer",
  name: "Red Racer",
  description: "Steady, dependable, a little scratched. Been here the longest.",
  maxSpeed: 280,
  acceleration: 160,
  handling: 0.85,
  weight: 1.0,
  boostPower: 1.15,
  sprite: "red-racer",
  unlock: { type: "default" }
}
```

Vehicles are data. Adding one must never require touching the vehicle controller.

## Starter roster

Five vehicles, chosen to cover the stat space without overlap.

### Red Racer — balanced
Medium speed, medium acceleration, medium handling, medium weight.
The default and the yardstick. Every other vehicle is described relative to this one.

### Blue Buggy — off-road
Medium-low speed, high handling, strong on rough surfaces, medium weight.
Suffers least from `rugGrass` and `blanket` penalties. Rewards shortcut hunting.

### Yellow Rocket — speed
High speed, medium acceleration, low handling, low weight.
Fastest in a straight line, hardest to corner, loses every collision. The expert pick
and the classic trap for new players.

### Green Pickup — heavy
Medium-low speed, medium acceleration, medium-low handling, high weight.
Wins contact, shrugs off hazards, understeers. The stress-free pick.

### Purple Micro — nimble
Medium speed, high acceleration, high handling, low weight.
Best out of corners and after crashes. Punished hard in traffic.

### Coverage check

| | Speed | Accel | Handling | Weight |
| --- | --- | --- | --- | --- |
| Red Racer | ●●● | ●●● | ●●● | ●●● |
| Blue Buggy | ●●○ | ●●● | ●●●● | ●●● |
| Yellow Rocket | ●●●●● | ●●● | ●○○ | ●● |
| Green Pickup | ●●○ | ●●● | ●●○ | ●●●●● |
| Purple Micro | ●●● | ●●●●● | ●●●● | ●● |

No vehicle dominates another on every axis. Verify this again whenever the roster
grows.

## Future vehicle types

Monster truck, formula-style toy car, police car, fire engine, school bus,
construction vehicle, futuristic light-up car, wind-up car, wooden toy car,
remote-control buggy, miniature van, plastic dinosaur car, rocket-powered fantasy car.

Each should bring a **material** as much as a stat spread — the wooden car should feel
and sound wooden. Material is characterisation. See `12_Art_Guide.md` and `13_Audio.md`.

Some of these imply mechanics rather than stats:
- **Wind-up car** — periodic self-boost that must be re-wound
- **Remote-control buggy** — different handling model entirely, possibly signal loss
  under the bed
- **Light-up car** — carries its own light in dark sections

Flagged as tempting scope creep. Stat-only variants first.

## Cosmetic customisation

Paint colours, decals, wheels, antennas, number stickers, trail effects, boost
effects, toy wear levels, wind-up keys, tiny flags.

**Cosmetics never affect performance.** If vehicle upgrades are ever added, they must
be a separate, clearly-labelled system — never smuggled in through cosmetics.

"Toy wear levels" is the standout idea: letting players choose how battered their car
looks, from mint-in-box to loved-to-death. It expresses the game's whole theme
through customisation.

## Garage

The garage lets players select vehicles, view statistics, change paint and cosmetics,
preview locked vehicles, and read short descriptions.

Presented as a toy shelf or carrying case — a display of a collection, not a spec
sheet. Locked vehicles show as empty slots with a silhouette, so the shape of what's
missing is visible.

Descriptions should have personality (see Red Racer above). This is the main place
the light framing story from `00_Vision.md` surfaces.

## Balance process

1. Ship five starters with hand-authored stats.
2. Track per-vehicle usage and win rates once telemetry exists.
3. Adjust only if one vehicle is both most-used and highest-winning.
4. Prefer buffing weak vehicles over nerfing strong ones — players notice nerfs.

**Do not balance before Phase 3.** Stats are meaningless until the physics stops
moving.

## Open questions

1. ~~Should the starter roster all be unlocked from the start?~~ **Resolved in
   Phase 4: two to start, three to earn.** Red Racer and Blue Buggy are owned
   from the beginning; Purple Micro at 3 stars, Green Pickup at 6, Yellow Rocket
   at 9. Handing out a vehicle early is the clearest possible demonstration that
   progression does something, and Yellow Rocket last means the fastest car is
   the reward rather than the trap a new player falls into.
2. Is `boostPower` a real fifth stat or noise? It may be more legible folded into
   acceleration.
3. Do vehicles have per-surface modifiers (Blue Buggy's off-road strength), or is that
   emergent from handling and weight? Explicit modifiers are clearer but add a data
   dimension.

## Related

`03_Driving_Physics.md` — how stats become behaviour.
`12_Art_Guide.md` — how vehicles are drawn, including the rotation problem.
`15_Save_System.md` — ownership and cosmetic persistence.
