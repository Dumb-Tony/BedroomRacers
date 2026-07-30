# 01 — Game Loop

## Core loop

1. Choose a vehicle
2. Select a track or event
3. Race against AI opponents or the clock
4. Drift, boost, jump, find shortcuts
5. Collect stars, tokens or hidden toy pieces
6. Earn medals and rewards
7. Unlock vehicles, cosmetics, tracks and new areas
8. Replay events to improve times and complete optional goals

## Loop timescales

### Moment to moment (seconds)
The player is thinking about the next corner. Enter, drift, exit, spend boost.
This is where the game lives or dies — see `03_Driving_Physics.md`.

### Race (90 seconds to 3 minutes)
Staying on the fastest route, passing opponents, avoiding hazards, building and
spending boost, finding shortcuts, collecting track items.

Target race length is **90–150 seconds** for a three-lap standard race. Long enough
for a comeback, short enough to retry without friction.

### Session (10–30 minutes)
Clearing a cluster of events on the map, chasing a gold medal, unlocking a vehicle
and immediately trying it.

### Long term (multiple sessions)
Unlocking every vehicle, earning gold on every event, completing collections,
discovering hidden areas, improving personal bests, unlocking new environments.

## Retry friction

Retrying must be near-instant — one button, no reload, no unskippable transition.
The whole progression model assumes players will replay events many times, so any
friction here compounds badly.

Target: **under 2 seconds** from pressing retry to the countdown starting.

## Race modes

Standard Race and Time Trial are the MVP modes. Everything else is later content.

| Mode | Description | Phase |
| --- | --- | --- |
| **Standard Race** | Compete against opponents over a set number of laps | MVP |
| **Time Trial** | Fastest possible run. Personal best ghost, bronze/silver/gold target times | Phase 5 |
| **Elimination** | Last place removed at intervals or per lap | Later |
| **Checkpoint Sprint** | Reach a sequence of checkpoints before time expires | Later |
| **Collectathon** | Collect a target number of stars, batteries or toy pieces | Later |
| **Delivery Dash** | Carry an object to a destination before time expires | Later |
| **Playground Tag** | One vehicle is "it", passed by collision | Later |
| **Toy Box Survival** | Avoid hazards, stay active as long as possible | Later |
| **Stunt Challenge** | Score points for jumps, drifts, spins, rings, clean landings | Later |

Modes are data-driven. Adding one should mean a new mode handler plus an event
config entry — never changes to the race manager itself. See `05_Tracks.md`.

## Local multiplayer — split-screen

> **Built.** Two players, two viewports, a camera each. The GDD's multiplayer
> section has no home doc in this bible, so it lives here until one exists.

Of the four local options the GDD lists, the chase camera settles which is
honest: **shared-keyboard is not possible**. One camera rotates to follow one
car's travel direction, so two players cannot share a view. Turn-based time
trials and ghost racing already exist as a side effect of Time Trial mode.

**Side by side, not stacked.** The camera sits 17.5° above the floor, so depth
ahead is the scarce resource and a short wide viewport throws it away. Two tall
narrow views keep the sightline.

**Cameras live on the view, not the renderer.** A singleton camera is exactly
what makes a second viewport painful to add later.

### Two-up is an exhibition

**No stars, medals, ghosts or records.** One save cannot represent two players'
progress, and awarding it to whoever happens to be on the left would be worse
than awarding nothing. The menu says so rather than letting it be discovered
afterwards.

The race **ends only when both humans finish**, never when the first does —
otherwise player two is cut off mid-lap. Human racers are prefixed `P1`/`P2` in
the standings, and the AI field will not take a car a human is already driving.

### Open

- **Player 2 cannot choose a car.** The garage picks player one's.
- **Audio follows player one** — engine, drift and surface are all P1's.
- Four-way split is untried; the layout takes a count, but the HUD is not
  designed for quarter-screen.
- Rendering twice roughly doubles frame cost, unprofiled on low-end hardware.

### Delivery Dash examples
Deliver a toy pizza, bring a block to the construction zone, return a missing
puzzle piece, carry a battery to a toy robot.

## Progression

### Event map
An illustrated bedroom map with event nodes. Completing events unlocks new tracks,
vehicles, race modes, cosmetics, hidden challenges and additional environments.

### Medals
Every event awards bronze, silver or gold. Optional platinum for mastery goals.

### Stars
Earned for completing objectives. Stars gate access to new areas and content.

Example objectives:
- Finish in first place
- Win without crashing
- Find the hidden shortcut
- Collect every letter or token
- Beat the target time
- Perform a certain number of drifts

Objectives should be visible **before** the race, so players can choose to chase
them, and re-checkable after. Never hide an objective behind a surprise.

### Collectible toy pieces
Tracks contain hidden pieces forming larger toy sets. Completing a set may unlock a
special vehicle, a display item, a bonus track, concept art, or a secret event.

## Failure and recovery

There is no fail state during a race beyond finishing poorly. Crashes cost time,
never a restart. Falling off an elevated route respawns the vehicle at the last
checkpoint after a short delay.

Dynamic assistance may subtly help players who fall far behind, but must never be
detectable as such. See `04_AI.md`.

## Related

`04_AI.md` — opponent behaviour during a race.
`11_UI.md` — how loop state is communicated.
`15_Save_System.md` — what persists between sessions.
