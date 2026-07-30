# 02 — Mechanics

This document covers **what the player can do**. For how it is implemented and
tuned, see `03_Driving_Physics.md`.

## Design stance

Steering should feel responsive and exaggerated rather than realistic. Every verb
below is tuned for readability and delight over fidelity. If a choice is between
"correct" and "reads well at a glance", choose the latter.

## The verbs

### Steering
The player turns left and right. Turn rate scales with speed — sluggish when
crawling, tightest in the mid range, slightly reduced at top speed so high-speed
straights feel committed.

### Acceleration
Automatic in the default control mode. This is deliberate: it removes a button for
young players and keeps the hands on steering and drift. Advanced controls expose
manual throttle.

### Braking and reverse
Braking helps with sharp turns. Holding brake after stopping engages reverse.
Reverse is slow — it exists to recover from a wall, not as a tactic.

### Drifting
The core skill. Initiated while turning. A drift should:

- Allow tighter cornering than steering alone
- Build boost energy
- Produce visual tire or dust effects that vary by surface
- Reward controlled timing
- Stay forgiving enough for younger players

A successful drift fills part of the boost meter. Longer, better-controlled drifts
fill more. See `03_Driving_Physics.md` for the charge model.

**Drift must be the most satisfying thing in the game.** It is the primary
mitigation for the "driving feels too simple" risk.

### Boost
Temporarily increases speed. Earned through:

- Drifting
- Driving over boost pads
- Performing jumps
- Collecting batteries or energy tokens
- Driving close to obstacles without crashing
- Maintaining a clean racing line

Multiple earn sources is intentional — it means several play styles all keep the
meter moving, and no single source becomes mandatory.

### Jumping
Ramps and environmental objects launch vehicles into the air. Landing cleanly grants
a small boost. Landing badly (heavily off-axis) costs speed but never causes a
crash — see collisions.

Because the camera is angled, height is legible: the vehicle rises up the screen
while its shadow stays on the ground plane.

Possible ramps: books, rulers, building blocks, folded cardboard, plastic track
launchers, sand hills.

### Collisions
Collisions are playful, not punishing. Impacts may cause brief speed loss, spinning,
bouncing, toy-like plastic or metal sound effects, and small environmental reactions.

**Recovery must be fast.** A collision that removes control for more than about a
second reads as frustrating rather than funny. Target: full control returns within
0.4–0.8 seconds even on a heavy hit.

### Drafting
Following closely behind another vehicle gradually builds speed or boost.
Introduced after the basic prototype works — it is a depth mechanic, not a core one.

## Control schemes

### Desktop — Simple (default)
Vehicle accelerates automatically.

| Input | Action |
| --- | --- |
| `←` / `A` | Steer left |
| `→` / `D` | Steer right |
| `Space` | Drift / brake |
| `Shift` | Boost |
| `Esc` | Pause |

### Desktop — Advanced

| Input | Action |
| --- | --- |
| `↑` / `W` | Accelerate |
| `↓` / `S` | Brake / reverse |
| `A` / `D` | Steer |
| `Space` | Drift |
| `Shift` | Boost |
| `Esc` | Pause |

### Split-screen — two to four players

Built alongside local multiplayer (`01_Game_Loop.md`). The keyboard is split
**physically**, seats running left to right across it, so nobody reaches across
anybody.

| Seat | Steer | Throttle / brake | Drift | Boost |
| --- | --- | --- | --- | --- |
| Player 2 | `A D` | `W S` | `Left Shift` | `Space` |
| Player 4 | `F H` | `T G` | `R` | `Y` |
| Player 3 | `J L` | `I K` | `U` | `O` |
| Player 1 | `← →` | `↑ ↓` | `Right Shift` | `Enter` |

24 distinct keys, verified free of collisions, and each profile reads only its
own.

**Single-player controls are unchanged.** Muscle memory built on
arrows-or-WASD with Space and Shift is not worth breaking for a second player,
so the solo profile keeps every one of those bindings.

**No numpad.** Laptops do not have one, and a control scheme that excludes half
the machines is not a control scheme.

`Ctrl` is deliberately unused — `Ctrl+W` closes the tab.

### The rollover ceiling

**Four players will exceed what most keyboards can physically report.** Cheap
membrane keyboards register roughly six simultaneous keys and ghost above that;
four drivers holding steer plus drift is already eight or more. Nothing in
software can fix it.

Practical consequences: four-player is best on a mechanical keyboard with
n-key rollover, and three is a much safer number on unknown hardware. Gamepad
support would be the real answer — it is not built.

Each viewport labels its own driver and their controls, and highlights that
driver in the results standings rather than every human.

### Mobile
Large buttons, minimal text. Options to support:

- Large left and right steering buttons
- Drift button
- Boost button
- Optional tilt steering
- Optional virtual joystick

Touch targets must be sized for a child's thumb and positioned to avoid the palm
occluding the track. Test in landscape first.

### Gamepad

> **Built.** Standard mapping, up to four pads.

| Input | Action |
| --- | --- |
| Left stick | Steering — **analog** |
| D-pad ← → | Steering, as a fallback |
| Right trigger | Accelerate (only when auto-accelerate is off) |
| Left trigger / B | Brake, reverse |
| **A** or left bumper | Drift |
| **X** or right bumper | Boost |
| Start | Pause |

**Seats claim connected pads in order.** Seat one takes the first pad; anyone
without one falls back to their keyboard profile. Two pads and four players is a
perfectly sensible arrangement, and each viewport shows whichever set of controls
that seat is actually using.

**A pad beats the keyboard** for a seat that has one, so a stray keypress from
someone else cannot fight it.

### Analog steering is the real gain

The keyboard can only ask for −1, 0 or 1. A stick asks for anything between, and
`VehicleController` already multiplies `steer` by a turn rate — so proportional
steering needed no change to the simulation at all.

Measured over the same three seconds: full lock turns 4.64 radians, half lock
turns **1.34**. Not half, because the grip and speed curves are non-linear — which
is exactly the fine control a keyboard cannot give.

The deadzone is 0.18 and the remaining range is **rescaled**, so a stick can still
reach full lock rather than topping out at 82%.

### This one is unverified on hardware

The Gamepad API is stubbed for testing — mapping, deadzone, seat claiming, edge
detection and a car actually driven by a pad are all confirmed, but **no physical
controller has been connected**. Real pads vary in mapping and deadzone
behaviour, so expect to adjust.

## Input principles

- **All controls remappable.** Listed in accessibility (`11_UI.md`).
- **No input buffering longer than ~120ms.** Arcade responsiveness beats forgiveness.
- **Never require simultaneous three-button input** in the simple scheme.
- **Pause must work at any time**, including mid-air and during the countdown.

## Related

`03_Driving_Physics.md` — the model behind these verbs.
`10_Items.md` — pickups layered on top (post-MVP).
`11_UI.md` — how the player learns these controls.
