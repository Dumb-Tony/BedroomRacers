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
  material: "plastic",           // NOT a stat — see Material, below
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

### Heirloom — collection reward

A battered wooden car, and the mysterious vehicle under the bed from
`20_Narrative.md`. **Not bought with stars.** The only route to it is finding
every toy piece across every track, which makes exploration the one thing stars
cannot buy.

Medium top speed, best handling on the roster, real weight, strong boost. A
momentum car: deliberately not the fastest thing in the game, because a reward
for thorough play should be *characterful* rather than dominant — the roster
already learned that lesson with Yellow Rocket.

*"Older than everything else in this room. Nobody remembers whose it was."*

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

**The audio half of that is built — see *Material* below.** The roster does not
need new vehicle *types* to carry material; the cars already here are made of
things, and saying so was the cheap two thirds of this idea.

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

### Car and driver pairing — resolved in Phase 5

**Yellow Rocket drives like a Rookie.** Its top speed is 18% above the player's
starter, and paired with the Speedster bundle that made it win every race on
every difficulty — measured, the finishing position did not change between Easy
and Hard. Easy slowed the field but not below a car nearly a fifth faster in a
straight line.

The fix was pairing, not statistics. The fastest car now has the most timid
driver, which turns raw pace into something a player can out-drive rather than
something they cannot answer. Purple Micro takes the Speedster bundle and starts
further back, so the quickest driver has to come through the field.

Effective straight-line pace at Normal, against the player's 350:

| | Pace | vs player |
| --- | --- | --- |
| Purple Micro (Speedster) | 372 | **+6.3%** |
| Red Racer II (Technician) | 347 | −1% |
| Yellow Rocket (Rookie) | 330 | −6% |
| Blue Buggy (Technician) | 310 | −11% |
| Green Pickup (Bully) | 288 | −18% |

The fastest rival's advantage dropped from **+17.9% to +6.3%** — a gap good
driving can close.

It also gives escalation from the roster rather than the difficulty slider:
Purple Micro only appears from four opponents up, so the rookie event stays
winnable and later events add a genuine rival.

Measured over three runs per setting with an identical player pace: the player
wins all three on Easy and Normal, and takes 1st, 3rd, 3rd on Hard with Purple
Micro winning two. Difficulty now changes outcomes, which it previously did not.

**Caveat on that measurement.** The stand-in player is a consistent AI; real
players vary far more. And margins to the nearest rival could not be measured,
because when the player wins the race ends before the rest of the field finishes.

## Open questions

1. ~~Should the starter roster all be unlocked from the start?~~ **Resolved in
   Phase 4: two to start, three to earn.** Red Racer and Blue Buggy are owned
   from the beginning; Purple Micro at 3 stars, Green Pickup at 6, Yellow Rocket
   at 9. Handing out a vehicle early is the clearest possible demonstration that
   progression does something, and Yellow Rocket last means the fastest car is
   the reward rather than the trap a new player falls into.
2. ~~Is `boostPower` a real fifth stat or noise?~~ **RESOLVED: real, and one of
   the strongest.** A 46.6% spread in boost distance from that stat alone, and a
   72.1% spread across the roster against `maxSpeed`'s 35%. Not folded into
   acceleration — see the section below for why that would delete a design axis
   rather than simplify one.
3. Do vehicles have per-surface modifiers (Blue Buggy's off-road strength), or is that
   emergent from handling and weight? Explicit modifiers are clearer but add a data
   dimension.

## Related

`03_Driving_Physics.md` — how stats become behaviour.
`12_Art_Guide.md` — how vehicles are drawn, including the rotation problem.
`15_Save_System.md` — ownership and cosmetic persistence.

## Rival-only cars (Phase 8)

Every track has eight grid slots. The field could only ever supply five cars —
and the player takes one of them — so **an event asking for five opponents was
quietly fielding four**, and the grid was never full. Nothing reported it; the
count is clamped by `Math.min(OPPONENTS, grid.length - humanCount, field.length)`
and the third term silently won.

Three cars exist purely to fill it: **Orange Tipper**, **Teal Scout**, **Cream
Camper**. They carry `aiOnly: true`, which keeps them out of the garage — a car
you can see but never earn reads as a bug, not as a rival. They are not in
`BR.UNLOCKS` and are never owned.

**Their stats sit inside the existing roster's range rather than extending it.**
The point is more cars to race, not more performance to chase: the player's five
remain the whole ladder. Ordered at the back of `FIELD` so the tail of a large
grid is the slow end — a seven-car grid should stretch out behind you, not stack
four quick cars into the first corner.

Field sizes now escalate with the ladder: 3 on the shakedown, 4-5 mid-table, 6-7
on the Grand Prix, Tide Pool, Shelf Run and both item races. Verified: every
event fields exactly what it asks for, and the closest pair of grid slots is 87
units against a ~22-unit car radius.

## Material (Phase 10)

This document has always said material is characterisation and that the wooden
car should sound wooden. It did not. **Every car in the game made exactly the
same noise**, including the one whose entire description is that it is older than
everything else in the room.

Every vehicle now declares `material`, and `13_Audio.md`'s four-row table is what
reads it:

| | material | why |
| --- | --- | --- |
| Red Racer | plastic | the yardstick car is the yardstick material |
| Blue Buggy | plastic | |
| Yellow Rocket | plastic | |
| Teal Scout | plastic | |
| Cream Camper | plastic | |
| **Green Pickup** | **die-cast** | the heaviest thing on the roster should sound like it — it already wins every argument |
| **Orange Tipper** | **die-cast** | a site truck, like every real one |
| **Heirloom** | **wood** | *"a battered wooden car"*, and the only one in the room |
| **Purple Micro** | **wind-up** | *"tiny, eager, always first out of a corner"* is a description of a wind-up toy — and it is the highest acceleration and lowest weight here, which is what a wound spring does |

**`material` is not a stat.** It changes nothing a lap time can see: no speed, no
grip, no weight, no collision outcome. Five plastic, two die-cast, one wood, one
wind-up — and a car that declares nothing is a plastic toy car, never a silent
one.

### Purple Micro is wind-up in MATERIAL only

The **wind-up mechanic** — a periodic self-boost that must be re-wound — is
flagged above as tempting scope creep, and this is not it. Nothing here touches
physics.

It is here because the fourth row of the audio table needed a car. A voice with
no vehicle never fires, and this project has already learned that **a feature
that never fires is a feature that does not exist**. Assigning wind-up to the car
that already behaves like one costs a data field and gives the row a home.

What that sounds like, and the measured numbers behind it, are in
`13_Audio.md` → *Nine cars, four materials*: metal rings 3.1x longer than wood,
metal's tyre rattle sits at 660 Hz against plastic's 1100, and the wind-up's
ratchet runs 9 Hz at idle to 39 Hz flat out.

### Still open: the visual half

`12_Art_Guide.md` has not been touched. A die-cast car should catch light
differently from a moulded plastic one and a wooden one should not shine at all,
and none of that is drawn yet — the field exists and the renderer ignores it.

## `boostPower` — resolved (Phase 8): a real stat, and a strong one

Open question 2 asked whether it is a real fifth stat or noise, and suggested it
might be more legible folded into acceleration. Measured, it is neither noise nor
foldable.

**Isolated** — one car, every other stat held identical, only `boostPower` swept
across the roster's range:

| boostPower | distance gained by a boost |
| --- | --- |
| 0.92 | 109 |
| 1.00 | 121 |
| 1.10 | 136 |
| 1.15 | 140 |
| 1.30 | 160 |

A **46.6% spread** from one stat, cleanly monotonic. Across the real roster the
boost gain spreads **72.1%**, against `maxSpeed`'s 35% — it separates the cars
*more than top speed does*.

### It acts through force, not the ceiling

Worth knowing before anyone tunes it: top speed during the boost measured
346-350 **regardless of `boostPower`**. The raised ceiling
(`boostMaxSpeedMul × boostPower`) is barely reached inside the boost window, so
almost the entire effect comes from `boostForce × boostPower` — it is
acceleration, applied only while boosting.

**That is exactly why it should not be folded into `acceleration`.** The two are
the same kind of quantity on different triggers, and keeping them apart is what
lets a car be sluggish out of a corner but explosive on a boost, or the reverse.
Folding them would delete a design axis rather than simplify one.

No code change. The stat earns its place.
