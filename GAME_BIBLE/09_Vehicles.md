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

**That second sentence is flavour, not mechanics, and Phase 11 measured why it
has to be** — see *Per-surface modifiers*, below. The field spends 0.20% of its
driving time on `rugGrass` and 0.00% on `blanket`. There is nowhere to spend an
off-road stat. The character stays; the stat does not exist.

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
3. ~~Do vehicles have per-surface modifiers (Blue Buggy's off-road strength), or is
   that emergent from handling and weight?~~ **RESOLVED: neither — it is flavour
   text, and the prototype was deleted.** Built, measured, and worth 0.008s a lap
   on the surfaces the roster description actually names, against a 0.18s noise
   floor. See *Per-surface modifiers*, below, for where the whole budget went.

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

## Per-surface modifiers — resolved (Phase 11): flavour text, and deleted

Open question 3 asked whether Blue Buggy's off-road strength is a real modifier
or emergent from handling and weight. It was built, measured against the roster
it was supposed to differentiate, and **deleted**. It is neither: it is a
sentence in a car description, and the reason it can only ever be a sentence is
that the game has nowhere to put it.

The prototype was an `offRoad` stat scaling the PENALTY half of a surface entry
by `1/k` and leaving the bonus half alone — an off-road car should suffer less
on loose sand, not go faster on hardwood. `k = 1` short-circuited to the
existing code path, so the two arms of every A/B below differ by exactly this
one stat. Confirmed: the `k = 1` arm reproduced `tools/reference-times.txt` to
the hundredth on all four time trials (93.92 / 92.03 / 92.38 / 108.43).

### 1. Where does a car actually drive?

Every event, the calibration stand-in (Technician on `normal`, seat one), three
seeds, accumulating the surface under the wheels every fixed step:

| | share of driving time |
| --- | --- |
| `rugRoad` | the whole of 9 of the 18 events |
| `sand` / `packedSand` | 82-99% of the four sandbox events |
| `hardwood` | 22.8% of Bedside Boulevard |
| `puddle` | 1.2-18.7% of the sandbox |
| `looseSand` | 0.85% |
| **`rugGrass`** | **0.79% for the Speedster, 0.00% for every other personality** |
| **`blanket`** | **0.00%** |
| **`bookCover`** | **0.00%** |
| **`paper`** | never referenced by any track |

**Four of the eight tracks are one surface from start to finish.** Town Rug
Loop, Shelf Run and Dresser Drop measured 100.00% `rugRoad` for the entire
field, on every personality, on every seed. A per-surface stat is inert there by
construction.

That table was taken with all four personalities driving, not just the tidy one,
precisely because the Rookie's `lineAccuracy` of 0.65 is the closest thing the
project has to a sloppy player. It did not help: the Rookie touched `rugGrass`
for 0.00% of its time. The only car that found any grass at all was the
Speedster, which is the personality that runs wide.

### 2. What is a second on each surface worth?

The AI follows an authored line and cannot go shortcut-hunting, so exposure
alone cannot settle it. Driving the controller directly on a forced surface, ten
seconds of full throttle, `k = 1` against a generous `k = 1.25`:

| surface | top speed, k=1 → k=1.25 | distance | **seconds bought per 10s spent there** |
| --- | --- | --- | --- |
| `rugRoad`, `hardwood`, `bookCover`, `packedSand` | unchanged | +0.00% | **0.000** |
| `puddle` | 325 → 328 | +1.37% | 0.135 |
| `rugGrass` | 286 → 294 | +4.37% | **0.419** |
| `sand` (unpacked) | 281 → 293 | +4.41% | 0.422 |
| `blanket` | 240 → 260 | +8.46% | 0.780 |
| `looseSand` | 233 → 255 | +9.42% | 0.861 |

Multiply the two tables together. **0.20% of a 90-second lap is 0.18 seconds on
grass, and 0.18s × 0.0419 = 0.008 seconds.** The quietest event in the game has
a 0.18s seed-to-seed spread and the loudest has 3.50s, so Blue Buggy's signature
ability is between **24 and 470 times smaller than the noise it would have to be
seen through**. `blanket` — the other surface named in the description — is
worth more per second and gets zero seconds, so it multiplies out to exactly
nothing.

For the stat to clear even the quietest noise floor a player would have to spend
**4.3 seconds of every lap on carpet**. They will not, and the reason is in the
same table: grass costs 18% of top speed and the most generous off-road stat
gives back 4.4%. **The penalty is four times the biggest plausible bonus.** An
off-road car on grass still does 294 against 350 on the road — 16% down. No
value of this stat ever makes rough ground a line worth taking, which means
"rewards shortcut hunting" is not a thing the stat can do.

### 3. Where it does move lap times, it is not the feature that was asked for

Six cars, eight tracks, five seeds, time trials, control against a designer's
spread (Blue Buggy 1.25, Green Pickup 1.15, Red Racer and Heirloom 1.00, Purple
Micro 0.90, Yellow Rocket 0.85):

| track | biggest per-car change | roster spread from existing stats | what `offRoad` adds |
| --- | --- | --- | --- |
| Town Rug Loop | **0.00s** | 25.77s | 0.00s (0.0%) |
| Shelf Run | **0.00s** | 27.40s | 0.00s (0.0%) |
| Dresser Drop | **0.00s** | 27.12s | 0.00s (0.0%) |
| Bedside Boulevard | 0.52s on a 120s lap | 28.17s | 0.53s (1.9%) |
| Dune Dash | 1.52s | 21.28s | 2.75s (12.9%) |
| Bucket Brigade | 1.55s | 20.32s | 2.77s (13.6%) |
| Tide Pool | 1.38s | 23.50s | 2.63s (11.2%) |

Bedside Boulevard is the track this whole idea was for — the only one with
authored surface *variety* — and its largest movement, 0.52s, sits inside that
same car's own ±1.18s seed spread. It is invisible because its 22.8% of
non-road driving is `hardwood`, which is *faster* than rug and therefore a bonus
the stat deliberately does not touch. The surfaces that would have been penalised
get 0.00%.

The sandbox numbers are real and above the noise, and they are still not the
feature. **On those four tracks sand IS the road**, so there is no line choice to
reward: `offRoad` is a fifth top-speed stat that switches on for half the game
and off for the other half. It would also make a platinum time mean something
different depending on which car you picked, and time-trial targets are
absolute — the game has no machinery for that and should not grow any.

### 4. And it cannot do the job even at absurd magnitude

The point of the stat was to make the off-road car good off-road. Measured on
Dune Dash, Blue Buggy laps in 103.32s and Yellow Rocket in 83.63s: the
off-road specialist is **19.7 seconds behind** before the stat is applied,
because 313 against 413 top speed is an order of magnitude more lap time than
any surface modifier can pay. The treatment above claws back 1.52s — **7.7% of
the gap**. An isolation sweep on one car with every other stat held identical
put `k` at 2.00, twice any shippable value, and bought 4.10s: **21% of the gap,
and Blue Buggy is still fifteen seconds slower in the sand than the car that is
supposed to be bad in it.** Swamped by the stats that already exist.

### 5. Nor is it emergent

The other half of the original question. Surface grip enters the controller as
`retention^(handling × S.grip)`, an exponent the handling stat already
multiplies, so the roster might already degrade at different rates. Straight-line
distance on each surface as a fraction of that same car's own `rugRoad` figure:

| | handling | on `rugGrass` | on `looseSand` |
| --- | --- | --- | --- |
| Red Racer | 0.85 | 81.61% | 66.67% |
| Green Pickup | 0.74 | 82.18% | 67.17% |
| Blue Buggy | 1.00 | 82.21% | 67.20% |
| Heirloom | 1.05 | 82.28% | 67.18% |
| Yellow Rocket | 0.62 | 82.45% | 68.06% |
| Purple Micro | 0.98 | 82.50% | 68.05% |

**0.89 points of spread on grass and 1.39 on loose sand — and it does not track
`handling` at all.** The best and worst rows are 0.98 and 0.85, with 0.62 in
between; the ordering is an artifact of where each car's cruising speed sits on
the quadratic drag curve, not a design axis. Every car loses the same fraction of
its pace on rough ground, so there is no emergent off-road specialist either.

### What would have to be true first

This is a **content** finding, not a stat one, and it is the right way round: the
stat was fine and the world had no use for it. Reopening it needs tracks to
change first, not vehicles —

- penalty surfaces painted where a **line choice** exists, rather than as the
  base surface of a whole track or as the punishment for leaving one;
- and a penalty small enough that going off-road is an option rather than a
  mistake. At `rugGrass`'s current −18% top speed the detour has to be shorter
  than the road by more than any car can make up.

Until both are true, re-run the exposure census before writing any code: if
`rugGrass` and `blanket` are still under a percent of driving time, the answer
has not changed. No stat can be worth more than the ground it stands on.

**Prototype deleted. `material` is still the only non-stat field a vehicle
carries, and `offRoad` never became a second one.** No lap time moved — all
eighteen events measured identical to the committed baseline.
