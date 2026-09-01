# 06 — Progression and the Career

How a player gets from the first race to the last thing the game has to say to
them. `01_Game_Loop.md` describes the loop; this describes the arc the loop is
strung along, and what happens when it runs out.

This file did not exist until the ladder had 26 events in it. Two other
documents already pointed at a progression doc that was never written, and the
gap is not a filing problem — a ladder nobody wrote down is a ladder nobody
checks, which is exactly what happened. See **The ladder was unplayable** below.

## The shape of it

| | |
| --- | --- |
| Worlds | 6 — town rug, bedside boulevard, sandbox, stunt track, kitchen table, sofa |
| Tracks | 12 |
| Events | 26 |
| Stars | 78 — three per event |
| Toy pieces | 48 — four per track |
| Vehicles | 5 driveable, plus the Heirloom |
| Last gate | 44 stars |

The order of the ladder is the order the worlds were built, and that order is a
teaching order, not a release order. The rug teaches cornering on forgiving
ground. The boulevard adds a hard surface. The sandbox adds ground that changes
under you. The stunt track leaves the floor. The kitchen table takes the grip
away. The sofa inverts the surface model entirely — the road is the slowest
thing on it. Nothing in this file may reorder those worlds; the gates move, the
sequence does not.

## The three currencies

**Medals** come from finishing position, or from the clock in a time trial.
They are per event, they never go down, and they are the record of what you did.
Platinum is the mastery tier and is not available on Easy.

**Stars** come from objectives, one per objective, three per event. They are the
only thing that opens gates. They are cumulative and never spent — a gate is a
threshold, not a purchase.

**Toy pieces** are found on track, permanently, on contact. They buy nothing and
gate nothing. They exist so that there is one reward in the game that thorough
exploration earns and skill cannot: the Heirloom (`09_Vehicles.md`).

## What a star may ask for

Nine objective predicates exist, and they fall into three rungs. Every event
carries **one of each**.

| Rung | Predicates | What it means |
| --- | --- | --- |
| **Show up** | `finish` | You completed the event |
| **Race well** | `podium`, `clean`, `drifter`, `lap` | Ordinary competent play |
| **Master it** | `win`, `spotless`, `ttGold` | Genuinely hard |

Two rules govern the mix, and both are checkable by simulation rather than by
opinion:

1. **Every event pays something for showing up.** No event may award the
   reference driver nothing. An event that does is not a challenge, it is a
   dead end — you race, you finish, and the game declines to acknowledge it.

2. **No gate may exceed what the reference driver can have earned by the time
   they reach it, less a two-star buffer.** Gates are a running total minus
   slack. They are not a step.

### Predicates that do not mean what they look like

- **`win` and `podium` are free in a time trial.** There is one car, so
  `position` is always 1. Neither may ever appear on a time-trial event; it
  would be a star awarded for pressing start.
- **`spotless` is *not* free in a time trial.** It is `position === 1 && zero
  impacts`, so with the position half free it reduces to *nothing touched* —
  a genuine and quite hard objective about care rather than pace. This is why
  the last star in the game is a `spotless` on a time trial.
- **`clean` counts wall impacts, not just contact with other cars.** It works
  in a time trial and means "three laps without a real hit".
- **`ttPlat` is not used anywhere.** Beating the platinum time already awards
  the platinum *medal*. Making it a star as well pays twice for one act, and
  makes mastery load-bearing for progression — see below.
- **`lap` reads its threshold from the event** (`lapUnder`, default 29). It used
  to be a hardcoded event id inside `ProgressionManager.checkObjectives`.

## The ladder was unplayable, and nothing caught it

The ladder grew from 14 events to 26 across six worlds. Every gate kept the
rigid `+3` step it was given when there were 14, so the last gate walked out to
**59 of the 78 stars that exist** — 76% of everything in the game.

Nothing checked whether 59 could be earned. `calibrate.sh` asks whether any lap
time has moved and would have passed on a completely unreachable ladder;
`smoke.sh` asks whether anything throws. Neither has an opinion about
progression.

Simulated from a wiped save, playing only events the gating actually opened:

| Stand-in | Stars earned | Events reached | Events unreachable |
| --- | --- | --- | --- |
| Technician on `normal` | **2 of 78** | 2 of 26 | 24 |
| Bully on `normal` | **2 of 78** | 2 of 26 | 24 |
| Rookie on `normal` | **2 of 78** | 2 of 26 | 24 |

All three died in the same place. `rug-route-01` awarded `finish` and `podium`,
which is 2 stars. The next event, `rug-route-02`, opened at 2 — and asked for
`win`, `drifter` and `lap`, of which the reference earned **none**: it finished
second or third, banked 4.2 seconds of drift against a 6-second bar, and lapped
30.03 against a 29-second target. With no third star obtainable anywhere, the
gate at 3 never opened, and the other 24 events were dead content.

**The gate spacing was not the root cause.** Driving every event with the gates
ignored shows the real ceiling: of the 78 stars, the reference could reach
**32**, and a weaker stand-in **31**. No gate above 32 could ever open however
the steps were spaced, because every objective in the ladder except `finish` and
a single `podium` asked for play above the reference.

Two structural faults produced that ceiling:

- **Five events awarded the reference nothing at all** — `rug-route-02`,
  `rug-route-03`, `sb-04`, `kt-02`, `sf-02`. Each asked only for wins, spotless
  runs and lap records.
- **Every time trial put both of its hard stars on the clock.** Nine were
  `finish` + `ttGold` + `ttPlat`, and by construction gold is 0.951 × the
  reference and platinum 0.885 × it — so the driver the times are *calibrated
  against* cannot beat either. That is 19 stars behind above-reference pace.

### What was changed

Objectives were rebalanced to the three-rung rule, and the gates were rebuilt as
a running total of reference-reachable stars minus two. Nothing else moved: the
ladder's **order is byte-for-byte the same**, no target time was touched, no
event was added or removed, and the total is still 78 stars.

| | Before | After |
| --- | --- | --- |
| Last gate | 59 of 78 (76%) | **44 of 78 (56%)** |
| Reference-reachable stars | 32 | **48** |
| Events awarding the reference nothing | 5 | **0** |
| Stars behind platinum-tier play | 19 | **0** |
| Slack at the last gate | −27 (impossible) | **+4** |

The gates are now `0 1 2 3 5 7 9 11 13 15 17 19 21 22 24 26 28 30 32 34 36 37
39 41 43 44`. They are irregular on purpose: each one is derived from what the
events below it actually pay, and the events do not all pay the same.

### Simulated again afterwards

The same wiped-save career, replayed against the new ladder:

| Stand-in | Stars | Events reached | Races | Racing time | Result |
| --- | --- | --- | --- | --- | --- |
| Technician on `normal` | 48 of 78 | **26 of 26** | 78 | 2h 05m | no stall |
| Bully on `normal` | 48 of 78 | **26 of 26** | 78 | 2h 08m | no stall |
| Rookie on `normal` | 21 of 78 | 13 of 26 | 39 | 1h 10m | stalls at gate 22 |

The reference and the bully both finish the ladder with **four stars in hand**
and never touch a `win`, a `spotless` or a gold time on the way — which is the
whole claim this file makes, measured rather than asserted. The career is about
**two hours of racing** to open everything, and the 30 stars left over are what
the game is for afterwards.

The rookie is the slowest personality in the game — `AIDriver.js` describes it
as the beginner-friendly *opponent*, the car meant to be at the back of the
grid. A player driving that badly is losing every race to every rival, and half
the ladder is a fair outcome for that; the lever for them is the `easy`
difficulty setting, which slows the field by 10% and is exactly what it is for.
Tuning the gates down until the slowest car in the field can clear them would
cost everyone else the progression.

Because the last gate is 44 and there are 78 stars, **34 stars sit beyond the
end of the ladder**. That is deliberate. Progression should finish before the
content does, so that the last stretch of the game is played for its own sake
rather than to open a door.

## The ending

A career needs a last thing that happens. There are three, and they are three
different kinds of thorough:

| | Condition | Reward |
| --- | --- | --- |
| **Finished** | Every event raced to a medal | The ladder is done |
| **Collected** | All 48 toy pieces | The Heirloom |
| **Perfect** | Both, plus all 78 stars | Nothing left |

`ProgressionManager.careerComplete()`, `setComplete()` and `careerPerfect()`
answer these, and `careerState()` returns all of it at once. They are queries
over the save, not stored flags, so they cannot drift and they are correct the
instant a save code is imported.

`record()` returns `careerComplete: true` on the single result card that
finishes the ladder, and never again.

### The Heirloom is said twice now

It used to be said once, badly. `findPiece()` grants the Heirloom the instant
the 48th piece is touched — which is right, because a piece is banked on contact
so that quitting the lap you spent fetching it still keeps it. But the
*announcement* went with the grant: a banner drawn during the race, for 3.2
seconds, over a car the player is still driving. Miss it and the game never
mentioned it again. The rarest thing in it, the end of a 48-piece collection
spread over twelve tracks and six worlds, could be handed over while you were
looking at the next corner.

The first results card after the set completes now says it again, through the
`unlocked` list the card already draws. The marker lives in
`collection.setsCompleted`, which is already persisted and already carried by
save codes, so it happens exactly once per save and survives an export.

### What is still missing

**The ladder finishing is computed but not yet drawn.** `record()` returns
`careerComplete`, and nothing reads it. The remaining work is one block in
`HUD.drawResults`, alongside the existing `unlocked` banner:

```js
if (res && res.careerComplete) { /* stamp the card */ }
```

Until that exists, completing all 26 events produces an ordinary results card.
The Heirloom is currently the only ending the player is actually shown, and it
rewards the collection rather than the career.

## Vehicles

Three of the five driveable cars are earned with stars, early, so that
progression has something to hand out while the player is still learning:

| Vehicle | Cost |
| --- | --- |
| Purple Micro | 3 stars |
| Green Pickup | 6 stars |
| Yellow Rocket | 9 stars |
| **Heirloom** | **every toy piece** |

Under the current gates those three land across the first six or seven events.
The Heirloom is not on this scale and must never be put on it — it is the one
reward stars cannot buy (`09_Vehicles.md`).

## Checking this file

The claims here are simulated, not asserted. A career harness plays the ladder
from a wiped save, driving the player's seat with an AI while leaving the seat a
*player* seat — drift seconds, impacts and toy pieces are all accumulated inside
`kind === 'player'` branches in `main.js`, so flipping the seat to `ai` the way
`calibrate.html` does would silently report zero for three of the nine
predicates.

Objectives are taken as a **union over several attempts**, because
`rec.objectives` is a set that never loses entries — a player who retries an
event eventually collects everything they are capable of there. One run per
event under-reports by exactly the amount a player grinds.

Verify with:

- `tools/smoke.sh` — 55 checks; one per event, so this count moves if the
  ladder gains or loses an event.
- `tools/calibrate.sh` — all 26 events at 0.00. Gates and objectives are not
  timing, so any change in this file that moves a lap time is a mistake.

## Related

`01_Game_Loop.md` — the loop the arc is strung along.
`09_Vehicles.md` — the roster and the Heirloom.
`15_Save_System.md` — what persists, and what a save code carries.
`16_Content_Pipeline.md` — why an event is config and not code.
