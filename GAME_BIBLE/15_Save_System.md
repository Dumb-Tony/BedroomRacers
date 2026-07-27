# 15 — Save System

> **DRAFT.** The GDD specifies only "use LocalStorage". The schema below is a proposal.
> It will need revision once progression is actually built (Phase 4).

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
3. Ghost storage format — inputs or positions? Depends on determinism holding.
4. Does the game need a manual "reset progress" option? Probably yes, in settings,
   with confirmation.

## Related

`14_Technical_Architecture.md` — SaveManager placement.
`01_Game_Loop.md` — what progression means.
