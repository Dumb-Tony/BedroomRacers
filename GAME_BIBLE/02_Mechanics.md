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

### Split-screen — two players

Built alongside local multiplayer (`01_Game_Loop.md`). The keyboard is split
**physically**, so neither player reaches across the other.

| | Steer | Throttle / brake | Drift | Boost |
| --- | --- | --- | --- | --- |
| Player 1 | `← →` | `↑ ↓` | `Right Shift` | `Enter` |
| Player 2 | `A D` | `W S` | `Left Shift` | `Space` |

**Single-player controls are unchanged.** Muscle memory built on
arrows-or-WASD with Space and Shift is not worth breaking for a second player,
so the solo profile keeps every one of those bindings.

`Ctrl` is deliberately unused — `Ctrl+W` closes the tab.

Each half of the screen labels its own driver and their controls, and highlights
that driver in the results standings rather than every human.

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

| Input | Action |
| --- | --- |
| Left stick | Steering |
| Right trigger | Accelerate |
| Left trigger | Brake / reverse |
| Face button | Drift |
| Face button | Boost |
| Menu button | Pause |

## Input principles

- **All controls remappable.** Listed in accessibility (`11_UI.md`).
- **No input buffering longer than ~120ms.** Arcade responsiveness beats forgiveness.
- **Never require simultaneous three-button input** in the simple scheme.
- **Pause must work at any time**, including mid-air and during the countdown.

## Related

`03_Driving_Physics.md` — the model behind these verbs.
`10_Items.md` — pickups layered on top (post-MVP).
`11_UI.md` — how the player learns these controls.
