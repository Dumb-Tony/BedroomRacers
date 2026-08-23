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
2. ~~Should there be an explicit export/import (a save code) so players can move
   progress between browsers?~~ **Resolved in Phase 9: yes — one code, on the
   main menu, carrying progress and deliberately not settings.** It was cheap,
   and it is the whole answer to "no cloud saves". See the section below.
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

## Save codes — resolved (Phase 9)

LocalStorage is keyed by origin **and** browser profile. A player who finishes
the sandbox world on the desktop and opens the same link on a laptop, or in a
private window, or after their browser tidies up site data, arrives at zero
stars with no way to say otherwise. There is no server and there is never going
to be one, so the only thing that can carry progress across is the player:
a code they copy out of one browser and paste into another.

Implemented in `SaveManager` (the codec) and `Screens` (the panel).

### The shape

```
BR01-CHK1234-ABCDE-FGHJK-…

BR       marker
01       save version, in plain digits
CHK1234  FNV-1a 32 of the payload, as 7 alphabet characters
rest     Crockford base32 of the payload, grouped in fives
```

Measured on a save with 27 stars, all 18 events medalled and recorded, all
eight tracks holding lap records, 19 toy pieces and four cars:

| | |
| --- | --- |
| payload as JSON | 1245 bytes |
| after LZW | 740 bytes |
| final code | **1436 characters** (1197 significant, the rest are dashes) |
| a fresh save | 156 characters |

That is a paste, not a retype, and it is sized for it.

**Crockford base32, not base64.** The code leaves the game and travels through
whatever the player has to hand — a chat window, an email, a note app, a photo
of a screen. Base64's `+/=` and its case sensitivity all survive a clipboard
and none of them survive being read back off a screen. Crockford's alphabet has
no `I`, `L`, `O` or `U`, folds `O→0` and `I/L→1` on the way in, and ignores
case. The decoder strips **everything** that is not an alphabet character
first, so line wraps, spaces, quotes and stray dashes are all free.

**LZW, with a method byte.** The payload is JSON full of repeated ids —
`sandbox-`, `-01`, the same nine objective names forty times — which is exactly
what LZW eats: 1245 bytes down to 740, a 40% saving straight off the length of
the thing a human has to select. The first byte says whether the body is packed
or raw, and the encoder ships whichever is smaller, so a payload that does not
compress can never come out *longer* than not bothering.

**Full string ids, not indexes.** Encoding events and pieces as indexes into
`BR.EVENTS` would roughly halve the code, and it was rejected. Content is added
between builds; an index means a code written before a new event silently lands
its medals on the wrong ones, and it does it plausibly — gold on the event next
door, which nobody will ever report as a bug. A string id is either recognised
or ignored. LZW gives most of the length back anyway, precisely because the ids
repeat.

### Validation, in order

Every step is passed before the next is attempted, and **nothing touches the
live save until all of them have passed**. A rejected code leaves the existing
progress byte-identical — that is the property the harness checks after every
single kind of failure, in memory and in LocalStorage.

1. **Length and marker.** Longer than 20 000 characters, or not starting `BR`,
   and it is refused before any work is done.
2. **Version, in the clear.** The two digits are read as digits. A code from a
   **newer build is refused here** — before a single byte of the body is
   decoded. A newer build may mean anything at all by those bytes, and reading
   the half we recognise is exactly how a save ends up plausible and wrong.
   This is the same rule `load()` applies to a stored save that is too new.
3. **Checksum.** FNV-1a 32 over the payload bytes. This is what catches the
   character that got flipped, dropped, autocorrected or lost to a truncated
   selection. Not a security hash — a save code is not a secret and cannot be
   made into one without a server.
4. **Unpacking.** An unknown method byte is refused rather than guessed at.
5. **JSON.**
6. **The version again, from inside the payload.** It must agree with the
   header. A body cannot be spliced onto a header that lies about it.
7. **Every field, by type.** Stars must be a non-negative integer, medals one
   of five known characters, times null or a finite non-negative number, id
   lists arrays of short non-empty strings. `__proto__`, `constructor` and
   `prototype` are refused as ids, because assigning those as object keys
   reaches the prototype rather than the map. One bad field rejects the
   **whole** code; there is no partial import.

Only then is a new save built — from `defaults()` outward, not merged over the
old one, so anything the code does not carry comes back at its default rather
than being inherited from whoever was playing in this browser before. It is
written through `saveNow()`, not the 400ms debounce: the player has just
confirmed something destructive and a refresh one tick later must not resurrect
what it replaced.

**Export verifies itself.** `exportCode()` decodes the code it just built and
compares it against the snapshot; if they differ it returns `null` and the game
says it could not build a code. Encoding is the one step with nobody downstream
to catch it, and a broken code is only ever discovered on the machine that has
nothing on it.

### What it deliberately does not carry

**Settings.** This is the same line `reset()` draws, from the other side.
Volume, difficulty, minimap size and auto-accelerate describe the *place* you
are playing — headphones or a tinny laptop, a phone or a desk, a screen you can
see the minimap on or one you cannot. Progress is something the player earned
and should follow them; settings are something the seat needs and should stay
where they are. `reset()` keeps settings and drops progress; import keeps this
browser's settings and takes the progress. Both say the same thing.

The practical case decides it too: the commonest import is desktop → phone, and
having the phone's minimap and volume overwritten by the desktop's is a worse
first five seconds than any amount of saved typing.

**Timestamps.** `created` describes this save slot, not the progress that moved
into it.

**The player 2–4 vehicle slots.** Couch setup, not progress. `selectedVehicle`
does travel, but only if the code actually owns the car — an unowned selection
is repaired downstream by `selectedVehicleFor()` anyway.

**Ghosts.** They live under their own storage key precisely so they can be
dropped independently, and a 5KB replay per track would multiply the code by an
order of magnitude for something nobody moves browsers to keep.

**Unknown keys.** `merge()` keeps them for a stored save, because that save was
written by some version of this game. A code arrives from outside and gets no
such benefit of the doubt.

**Cheating is not defended against.** Anyone willing to read this file can hand
themselves 54 stars. There is no server, so there is no version of this that
works, and the alternative — no export at all — punishes only the honest player
who changed laptops. The validation exists to stop a mangled code destroying a
save, not to stop a determined one inflating it.

### The panel, and why it is real DOM

The game is a canvas. A canvas cannot be selected, cannot receive a paste, and
cannot host a text field — so the save code is the one place this game puts HTML
on the screen.

The obvious cheap route was `navigator.clipboard` for export and `window.prompt`
for import. Both were rejected as the *primary* path:

- `navigator.clipboard.writeText` needs a secure context and a permission the
  artifact host controls. It is tried first and its failure costs nothing, but
  it cannot be the only way out.
- `window.prompt` is a single-line box, and it **throws the pasted text away**
  the moment the code is rejected. On a 1400-character code that is the
  difference between fixing a paste and giving up.

A textarea does all three jobs and degrades to the same floor every time: **the
code is visible and selectable.** Copying is a convenience layered on top —
clipboard API, then the old `execCommand` path, then nothing — and every layer
is allowed to fail without the feature failing. Styles are set through the CSSOM
rather than a `style` attribute, because the published page runs under a CSP
with no `unsafe-inline`.

The panel also takes the keyboard while it is open. `Screens` listens for keys
on `window`, so without that guard every character typed into the box would also
arrive as menu navigation — pasting a code would scroll the event list and
Escape would walk out of the screen mid-paste.

### Importing is destructive, so it is built like the reset

Import is the only action in the game that can destroy progress the player did
not set out to destroy. It gets the same three guards as RESET PROGRESS:

1. **Two presses.** CHECK THE CODE only decodes — it writes nothing. The second
   press is the one that replaces anything.
2. **The confirmation names both sides**, rather than asking "are you sure":
   *"That code holds 27 stars, 15 medals, 19 toy pieces. This browser has 3
   stars, 1 medal, 2 toy pieces, and all of it — plus every lap record — is
   replaced."* A generic confirmation trains people to click through it.
3. **Walking away disarms it.** Any screen change closes the panel, including
   one sitting on the confirmation.

With **nothing** to lose there is no confirmation, because there is nothing to
confirm — an empty save goes straight in.

And the visibility rule runs the *opposite* way to the reset's. COPY MY CODE and
RESET PROGRESS appear only once there is something to copy or lose; **USE A SAVE
CODE is always there**, including on a brand new browser, because a brand new
browser is precisely where somebody needs to bring progress in.

### The bug this found

The menu decided whether to show RESET PROGRESS by walking the events map and
counting anything with a truthy `medal`. `'none'` is truthy, and `drawEvents`
calls `eventRecord()` for every event, which **creates** a `{medal: 'none'}` row
— so simply opening the event list on a fresh save gave the player eighteen
medals and offered to erase them. Both counts now come from
`SaveManager.saveTally()`, which is also what the import confirmation quotes, so
there is one definition of "what you have" rather than two.

### Layout

The three controls share **one row** rather than stacking. A second row has to
start higher, and at 900x500 the first thing above it is the difficulty blurb —
the same collision that made RESET PROGRESS armable by pressing DIFFICULTY (see
the section above). The row keeps the existing `Math.max(h - 52, by + 70)`
anchor, so the vertical footprint is unchanged; the caption above it is drawn
only when there is room for it. Verified across 1280x800, 1024x640, 900x500,
820x420 and 375x812: no save-code region overlaps any other region at any of
them.

### Verified

A harness appended to a built `dist/play.html` and run in headless Chrome —
**54 checks**, covering the round trip (stars, medals, objectives, played
counts, best times, lap records, toy pieces, owned vehicles and the selected
car, all compared field by field), settings *not* travelling, truncation at
three different lengths, a lost character, empty and nonsense input, **170
single-character flips at positions spread across the whole body — every one
refused**, a damaged checksum, a genuine v2 code refused by a v1 build, a v2
body wearing a v1 header, eleven hostile payload shapes, mangling that must
*not* break a code (lowercase, line breaks, `O`/`0` and `I`/`L`/`1`), base32 and
UTF-8 round trips, **300 fuzzed LZW round trips** plus a 60 000-byte input that
forces the code width from 9 bits to 15, immediate persistence, a simulated
reload, and the whole UI path from the menu button to the replaced save.

Then the harness was checked against itself. **Nine faults were injected** — a
decoder with no checksum, a snapshot that forgets pieces, another that forgets
records, an import that wipes before it validates, a build that thinks v2 is
current, a v2 body under a v1 header, an import that relies on the 400ms
debounce, an LZW decoder that grows its code width one step late, and a CHECK
button that imports immediately — and **all nine were caught**. A suite that
passes on its first run has not yet been shown to be capable of failing.

One control missed on the first attempt, which was worth more than the eight
that landed: rewriting a v2 code's header to `BR01` was still refused, because
the payload states its version a second time and that guard caught it
independently. The fault had only defeated one of two. Removing both is the
same thing as *being* a v2 build, which is what the control does now.

The menu and both panel states were also rendered and looked at, because a
stopwatch cannot verify a picture and this milestone moved a row of controls.
