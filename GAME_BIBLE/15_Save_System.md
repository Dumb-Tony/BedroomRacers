# 15 — Save System

> **BUILT — Phase 4.** The schema below is implemented in
> `src/systems/SaveManager.js`, minus the cosmetics and collection sections,
> which have no content behind them yet.
>
> Every failure mode in the table further down is covered and tested:
> corrupt JSON is backed up and replaced without throwing, a save from a newer
> build is backed up rather than guessed at, missing fields merge from defaults,
> the migration chain runs, and with storage unavailable the game loads
> in-memory and stays fully playable — writes simply return false.
>
> Writes are debounced at 400ms because LocalStorage is synchronous and writing
> per lap caused visible hitches.

## Constraints

- **LocalStorage only.** No accounts, no server, no cloud sync — all explicitly out of
  scope (`18_Roadmap.md`).
- **Single local profile.** No profile switching in v1.
- ~5MB limit per origin. Not a real constraint at this data volume, but ghost replay
  data could change that.
- **Can vanish at any time.** Users clear browser data. The game must handle a missing
  or corrupt save without breaking.

## What persists

| Category | Contents |
| --- | --- |
| **Settings** | Volumes, control scheme, keybindings, accessibility toggles, difficulty |
| **Progression** | Medals, stars, unlocked tracks, unlocked modes, completed objectives |
| **Ownership** | Owned vehicles, owned cosmetics, per-vehicle cosmetic selections |
| **Records** | Best lap and best total per track, per vehicle |
| **State** | Selected vehicle, last track played |
| **Collection** | Toy pieces found, sets completed |

## Schema

```js
{
  version: 1,
  created: 1690000000000,
  updated: 1690000000000,

  settings: {
    musicVolume: 0.7,
    sfxVolume: 0.9,
    controlScheme: "simple",     // "simple" | "advanced"
    keybindings: {},             // overrides only
    difficulty: "normal",
    reducedShake: false,
    reducedFlashing: false,
    highContrast: false,
    colorblindMode: "off",
    steeringAssist: true,
    autoAccelerate: true
  },

  progression: {
    stars: 0,
    events: {
      "rug-route-01": {
        medal: "silver",         // null | "bronze" | "silver" | "gold" | "platinum"
        objectives: ["first-place", "no-crash"],
        played: 12
      }
    },
    unlockedTracks: ["town-rug-loop"],
    unlockedModes: ["standard-race"]
  },

  ownership: {
    vehicles: ["red-racer", "blue-buggy"],
    cosmetics: [],
    loadouts: {
      "red-racer": { paint: "default", wheels: "default", wear: "loved" }
    }
  },

  records: {
    "town-rug-loop": {
      bestLap:   { time: 31450, vehicle: "red-racer" },
      bestTotal: { time: 98120, vehicle: "red-racer" }
    }
  },

  collection: {
    piecesFound: ["dino-head", "dino-tail"],
    setsCompleted: []
  },

  state: {
    selectedVehicle: "red-racer",
    lastTrack: "town-rug-loop"
  }
}
```

Stored under a single key: `bedroomracers.save.v1`.

Times are **integer milliseconds**. Never store formatted time strings.

## Versioning and migration

The `version` field exists from day one, even at version 1. Retrofitting versioning
onto an unversioned save format is genuinely painful, and this game expects a long
content tail.

Migration rules:

1. On load, read `version`.
2. If lower than current, run migrations in sequence.
3. If higher than current (user downgraded), **do not attempt to read it** — back it
   up under a separate key and start fresh.
4. If the save is unparseable, back it up and start fresh. Never delete a save the
   game cannot read.

```js
const MIGRATIONS = {
  // 1: (save) => { ...; save.version = 2; return save; }
};
```

**Additive changes are always safe.** Prefer adding optional fields with sensible
defaults over restructuring. Load should merge against defaults so a missing field is
never a crash.

## Write policy

- Write on **meaningful events**: race finish, setting change, unlock, vehicle
  selection.
- **Never write per-frame or per-lap.** LocalStorage is synchronous and will cause
  frame hitches.
- Debounce settings writes (~500ms) so slider drags produce one write.
- Wrap every write in try/catch — quota errors and private-browsing restrictions are
  real and must not crash the game.

## Failure handling

| Failure | Response |
| --- | --- |
| No save exists | Create defaults silently |
| Corrupt JSON | Back up to `bedroomracers.save.corrupt.<timestamp>`, start fresh |
| Version too new | Back up, start fresh |
| LocalStorage unavailable | Run in-memory, warn once, never block play |
| Quota exceeded | Drop ghost data first, then records, never settings |

The game must be fully playable with storage disabled. Progression is lost on refresh;
that is acceptable and must not be a hard failure.

## Ghost data

Time Trial ghosts (`01_Game_Loop.md`) are the one item that could realistically
threaten the quota.

Options: store only the best ghost per track, cap recorded frames, or store inputs
rather than positions. **Input recording is far smaller** and works given the fixed
timestep in `14_Technical_Architecture.md` — but it requires strict determinism.

Deferred to Phase 5. Ghosts live under a separate storage key so they can be dropped
independently.

## Open questions

1. Are records per-vehicle or per-track only? Per-vehicle is more interesting and
   multiplies storage and UI complexity.
2. Should there be an explicit export/import (a save code) so players can move
   progress between browsers? Cheap, and a real answer to "no cloud saves".
3. ~~Ghost storage format — inputs or positions?~~ **Resolved in Phase 5:
   POSITIONS.** This document argued for inputs, on the grounds that they are
   smaller and the simulation is deterministic. Both halves were wrong, and it
   was built the input way first before being measured.

   **Input replay diverges.** Determinism holds for bit-identical inputs, but a
   stored ghost must quantise steer to keep the file small. At 1/100 the error
   is invisible for a few seconds and catastrophic over ninety — measured
   worst-case deviation was 3514 units, most of the width of the rug. Steering
   is chaotically sensitive; two cars a hundredth of a degree apart take
   different lines, and it compounds every corner.

   **Inputs are not smaller.** They must be captured every tick: 2 bytes at
   60Hz is 120 bytes/sec. Positions can be sampled at 10Hz and interpolated —
   5 bytes at 10Hz is 50 bytes/sec. Measured at **58 bytes/sec**, about 5KB for
   a 90-second run.

   So a ghost is an animation, not a re-simulation, and is never driven through
   the vehicle controller. Verified: the replayed line matches the recorded run
   to within **1 unit**.

   One trap worth recording. Sampling used a float accumulator against 0.1s,
   which silently recorded at 8.7Hz instead of 10 because `6 * (1/60)` is
   `0.09999999999999999` — just under the threshold, so every sample waited an
   extra tick. The ghost drifted steadily out of sync. Count ticks, not seconds.
4. ~~Does the game need a manual "reset progress" option?~~ **Resolved in
   Phase 8: yes — on the main menu, two-step, and it keeps settings.** Not "in
   settings": this game has no settings screen, and inventing one to hold a
   single button would be worse than the button. See the section below.

## Related

`14_Technical_Architecture.md` — SaveManager placement.
`01_Game_Loop.md` — what progression means.

## Reset progress — resolved (Phase 8)

The only destructive action in the game, so it is the only one built to resist
being taken by accident.

**Three things guard it, and none of them is a modal.**

1. **It only exists when there is something to lose.** With a fresh save the
   control is not drawn at all — no region, nothing to click. An offer to erase
   nothing is noise, and it is the one button whose absence nobody notices.
2. **Two presses, and the second one is not "are you sure".** Arming swaps the
   button for a line that names the actual numbers: *"Erase 14 stars, 6 medals,
   12 pieces and every lap record?"* A player who has forgotten what they have
   deserves to be told before the press, not after. The alternative — a generic
   confirmation — trains people to click through it.
3. **Walking away disarms it.** Any screen change clears the armed flag, so a
   stray click cannot leave a destructive button primed for whoever sits down
   next. On a game meant for a shared living room that matters more than it
   would elsewhere.

**Settings survive the reset.** Volume, difficulty, minimap size and
auto-accelerate are how someone has set the game up to be *played* — not
something they earned. Wiping progress should not also turn the sound back up
and undo an accessibility choice. Stars, medals, objectives, records, toy pieces
and vehicle ownership all go.

Written through `saveNow()` rather than the 400ms debounce: the player has just
confirmed a destructive action and a refresh one tick later must not resurrect
it.

### The layout bug this found

The control was first anchored to `h - 52`. At 1280x800 and 1024x640 that is
fine; at 820x420 and below it landed **on top of the difficulty buttons**, and
because `hit()` takes the last matching region the reset won. Pressing
DIFFICULTY would have armed a progress wipe.

It is now anchored to `Math.max(h - 52, by + 70)` — pinned low on a normal
window, below the content on a cramped one. Verified across five viewport sizes:
no reset region overlaps any other region at any of them.

That check also surfaced something **pre-existing and unrelated**: the main menu
already overflows its canvas at 820x420 and below, because the block starts at
`h * 0.44` and then advances in fixed pixels. At 600x360 the difficulty row
draws at y=336 on a 360-tall canvas. Proportional start, fixed gaps — it cannot
hold. Not fixed here; noted so it is not rediscovered as a reset bug.
