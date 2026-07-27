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
