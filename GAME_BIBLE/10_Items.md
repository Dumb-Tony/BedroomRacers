# 10 — Items and Pickups

> **Post-MVP.** Items are explicitly excluded from the first prototype. The initial
> build must prove that **driving alone** is fun. Adding items early hides handling
> problems behind chaos.
>
> Do not implement any of this before Phase 5.

## Design stance

Item combat stays playful, readable and limited enough that racing skill remains the
dominant factor. This is a racing game with items, not an item game with cars.

Concretely:
- No item should reliably reverse a race outcome on its own.
- Every incoming item must be **visible and avoidable** with enough warning.
- Nothing removes control for longer than the collision cap in
  `03_Driving_Physics.md` (0.4–0.8s).
- Nothing is invisible, instant and unavoidable.

## Item roster

### Boost Battery
Immediately fills part of the boost meter.
*The baseline. Purely positive, no target, no skill check.*

### Wind-Up Key
Temporary acceleration increase.
*Distinct from boost — affects how fast you reach top speed, not the cap. Best out of
corners.*

### Shield Bubble
Protects from one collision or hazard.
*Defensive. Also the answer to "I was hit at the worst moment" complaints.*

### Magnet
Pulls nearby collectibles toward the player.
*Useless in Standard Race, essential in Collectathon. Good example of a mode-specific
item.*

### Toy Hammer
Short shockwave pushing nearby racers away.
*Close range, no aim required. Reads clearly and is fair — you have to get near
someone.*

### Sticky Blob
Drops a slowing hazard behind the vehicle.
*Defensive trap. Visible on the track surface, so it can be dodged.*

### Paper Aeroplane
Flies forward and briefly disrupts the racer it hits.
*The only projectile. Slow enough to dodge, which is what keeps it fair.*

### Building Block Barrier
Places a small temporary obstacle behind the player.
*Blocks a line rather than punishing a hit. Rewards placement.*

## Distribution

Not yet designed. The key decision is whether items are **position-weighted** (players
behind get stronger items) — the standard arcade solution.

Given `04_AI.md` already commits to gentle, invisible catch-up assistance, adding
position-weighted items on top risks stacking two comeback systems. Pick one as the
primary.

**Leaning:** mild position weighting on item pickups, and drop the separate
rubber-banding, because item-based comebacks are *visible and understandable* while
speed rubber-banding is invisible and feels like a lie when noticed.

Unresolved. Do not implement both at full strength.

## Item slot

One slot, no stacking, no holding a second item. Simple to read on the HUD, simple to
reason about, and prevents defensive item-holding from dominating.

## Open questions

1. Position-weighted distribution vs the `04_AI.md` assistance model — which is
   primary? (Above.)
2. Do AI drivers use items, and how well? Needs a decision layer in `04_AI.md`.
3. Are items per-mode configurable in event data? Probably yes — Magnet only makes
   sense in collection modes.
4. Should items exist in Standard Race at all, or be reserved for a distinct
   "Item Race" mode? Keeping the flagship mode item-free protects the pure-racing
   identity and makes Time Trial comparisons meaningful.

Question 4 is worth taking seriously. It is a legitimate design position that this
game does not need items in its main mode.

## Related

`01_Game_Loop.md` — modes items would appear in.
`04_AI.md` — the assistance model items interact with.
`11_UI.md` — item slot presentation.

---

## RESOLVED (Phase 7) — built, and all four questions answered

Source: `src/systems/Items.js`.

### Q4 — should items exist in Standard Race? **No. They get their own mode.**

The draft called this "a legitimate design position", and by the time there were
sixteen events the evidence had arrived:

- **Six of them are Time Trials.** A mode built on comparing your line against
  your own ghost is worth protecting, and so is the standard race it is measured
  against.
- The flagship already has four sources of variance that reward *driving* —
  drift-charged boost, shortcuts, worn sand, and speed-gated loops. It is not
  short of things to do with a corner.
- **Local multiplayer** is the one place a flat skill gap makes racing dull, and
  that is exactly what an item mode is for.

Item races are opt-in per event (`items: true`), which also answers **Q3**: yes,
per-mode, in event data. Two ship — Toybox Scramble and Sandbox Scrap.

Verified: a flagship race records **zero pickups and zero stun-ticks** with the
same track and the same eighteen boxes present on it.

### Q1 — weighting vs assistance: **items are the comeback, and the only one**

In an item race `ai.catchUp` is forced to 1, so the invisible speed nudge is off
entirely. Never both — the draft's own warning, now enforced in one line rather
than remembered. Measured over 20,000 rolls:

| | leader | last |
| --- | --- | --- |
| offensive items | 11.4% | **44.8%** |
| Boost Battery | 29.6% | 10.1% |

### Q2 — do AI drivers use items? **Yes, through the same input field**

An `itemSkill` per personality: Technician 0.95 waits for a target, Speedster
0.6 empties the slot, Rookie 0.25 sits on it. Offensive items are held until a
rival is within 340 units or patience runs out. The only opponent state read is
distance to the nearest car, which is on screen for a player anyway.

### The design stance, checked rather than hoped for

- **Nothing exceeds the control cap.** `MAX_STUN` is 0.8s, matching
  `03_Driving_Physics.md`. Asked for 99 seconds, `stun()` returns 0.8.
- **A shield eats exactly one hit** and is spent.
- **Nothing is invisible** — boxes and drops are drawn for their whole life.

**A projectile has to be faster than a car.** The Paper Aeroplane was authored at
330 to be "slow enough to dodge" against a field doing ~350, so fired from behind
it simply fell away and a full item race produced **exactly zero hits**. At 520
it closes at ~170/sec: a couple of seconds of warning, which is dodgeable rather
than unusable. The stance said an item must be avoidable and never said it had to
be able to *land*. It should have.
