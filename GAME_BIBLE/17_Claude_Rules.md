# 17 — Claude Rules

> **DRAFT — needs your review.** Not derived from the GDD; this is a proposed working
> agreement for AI-assisted development on this project. Edit freely. The value is in
> it being *yours*, not in it being complete.

## Purpose

This document tells Claude how to work on Bedroom Racers. Read it at the start of any
session that touches code.

## The bible is the source of truth

- Design questions are answered by `GAME_BIBLE/`, not by inference or by what seems
  reasonable in the moment.
- If code and bible disagree, **stop and flag it**. Either the code is wrong or the
  bible is stale. Do not silently pick one.
- If a decision is made in conversation that contradicts the bible, **update the
  bible in the same session**. An out-of-date bible is worse than none, because it
  gets trusted.
- Docs marked **DRAFT** contain unresolved questions. Do not build load-bearing
  systems on a DRAFT section without flagging the risk first.

## Architectural rules

These are not style preferences. Breaking them causes rework.

1. **The simulation is flat 2D. The tilt is render-only.** No gameplay code reads
   projected coordinates or knows `GROUND_TILT`. Projection lives in one file.
   (`03_Driving_Physics.md`, `14_Technical_Architecture.md`)

2. **Content is data, never code.** Adding a vehicle, track, event or cosmetic must
   not require editing anything in `src/systems/`. (`16_Content_Pipeline.md`)

3. **AI uses the same vehicle controller as the player.** AI produces the same input
   struct a keyboard does. AI never gets special physics. (`04_AI.md`)

4. **No physics engine for vehicles.** Custom integration. Arcade physics for overlap
   tests only. (`03_Driving_Physics.md`)

5. **Fixed timestep simulation**, decoupled from render. Required for determinism.

6. **Never break the retry loop.** Retry-to-countdown stays under 2 seconds.
   (`01_Game_Loop.md`)

## Scope discipline

The project's largest risk is scope, not difficulty. The GDD's scope-control list is
binding.

**Not in the first playable build:** online multiplayer, open-world exploration,
vehicle damage modelling, story cinematics, realistic vehicle simulation,
user-generated tracks, accounts, cloud saves, cosmetic shops, weather simulation.

When a good idea arrives mid-task:
- Note it in the relevant bible doc under open questions
- Do not implement it
- Do not expand the current task to accommodate it

**Finish the current phase before starting the next.** Phases are in `18_Roadmap.md`.

## Working style

- **Prefer the smallest change that works.** This is a prototype until it isn't.
- **Do not write speculative abstraction.** Build for the second case when the second
  case arrives, not before. The exception is the data-driven rule above, which is a
  pillar.
- **Comment the why, not the what.** Physics constants especially — every tuning value
  should say what it does to the feel.
- **Match surrounding code.** Consistency beats personal preference.
- **No new dependencies without asking.** Phaser is the dependency budget.

## Development tooling is not shipped

`index.html` is the **development page**; `dist/play.html` is the **release**.
`tools/build-artifact.sh` keeps a `DEV_ONLY` list of files that the dev page
loads and the bundle deliberately omits — currently the tuning panel.

The build's drift check knows about that list, so a dev-only file does not trip
the "loaded by index.html but not bundled" guard, and a genuinely forgotten file
still does.

Anything guarded this way must be **optional at every call site**
(`if (BR.Debug) …`), because in the shipped build it simply is not there.

Player-facing settings belong in the pause menu, not the tuning panel. If a
player would reasonably want to change it mid-session, it is not developer
tooling.

## Tuning values

Every constant in `03_Driving_Physics.md` is a guess until someone drives it.

- Keep tuning constants in **named config objects**, never inline magic numbers.
- When a value changes through playtesting, **update the bible with the new value**.
- If asked to "make it feel better", ask which specific feel target from
  `03_Driving_Physics.md` is failing. "Better" is not actionable.

## When to stop and ask

- A bible document contradicts itself or the code
- A task requires resolving an open question
- The change would break one of the architectural rules
- The work is drifting outside the current roadmap phase
- Something in the GDD looks legally risky (see below)

Do not guess on any of these. Guessing costs more than asking.

## Legal caution

Every world here is inspired by heavily-branded real products. **All layouts, object
designs, colour schemes, connector geometry, printed iconography and logos must be
original.** Reference the category, never the product.

Flag anything that drifts toward a specific real product — this is easy to do by
accident while chasing nostalgia, and expensive to unwind later.

## Git

- Commit or push only when asked.
- One logical change per commit.
- Bible updates can share a commit with the code they describe — that pairing is
  useful history.

## Open questions

1. ~~Should there be a `CLAUDE.md` at the repo root pointing here?~~
   **RESOLVED: yes**, written in Phase 8. It carries the rules that have already
   cost real time when forgotten — corner-anchored rectangles, measured target
   times, the file that must be registered in two places, the verification traps
   — and points here for everything else. It exists because this project kept
   rediscovering its own lessons: the same class of mistake recurred five times
   in one session before anything wrote them down where a session would look.
2. ~~Is there a preferred JS style?~~ **RESOLVED:** semicolons, two-space indent,
   single quotes, and match the surrounding code. No formatter — the project is
   deliberately toolchain-free (`14_Technical_Architecture.md`), and adding one
   just to enforce style would be the first dependency.
3. ~~Testing expectations — is any automated testing wanted?~~ **RESOLVED: no
   suite, but yes to a smoke test.** Keep the per-feature harnesses, which are
   sharp because each answers one question; add one blunt instrument that
   notices when something is on fire. See the section below.

## Related

`14_Technical_Architecture.md` — the technical rules referenced here.
`18_Roadmap.md` — phase boundaries.

## The smoke test (Phase 8) — answering open question 3

Open question 3 asked whether the throwaway-harness habit should be consolidated
into a suite. **The answer is no suite, but yes to a smoke test**, and a commit
that shipped the events screen throwing on every frame is what settled it.

The per-feature harnesses in this project are sharp but **narrow**: each is
written to answer one question and is blind to everything else. Six of them ran
in one session without noticing that `drawEvents` could not draw. So:

```bash
./tools/smoke.sh          # run before every commit
```

Builds, loads the bundle in headless Chrome, and answers exactly one question —
**does anything throw?** — across every track, every screen at three viewport
sizes, every event, split screen at 2/3/4 players, and menu navigation. 43
checks. It makes no claims about behaviour: not lap times, not feel, not
appearance. Exits non-zero, so it can gate anything.

It is deliberately blunt. The sharp harnesses stay; this is the thing that
notices when something is on fire.

### Proving a smoke test

A smoke test that cannot catch the bug that motivated it is theatre, so the bug
was reintroduced on purpose. That exposed two faults in the harness itself:

- **The uncaught-error handler flooded.** The game runs its own animation loop,
  so a screen that throws while drawing throws every frame — hundreds of
  identical entries buried the real failure. Now deduped.
- **The result extraction could not read a failure.** A PASS report is one line
  and a `sed` matched it; a FAIL report is many lines and the same `sed` silently
  dropped it, so a genuine failure surfaced as "the page did not finish". The
  harness was discarding the very thing it exists to show. Now an `awk` range.

Both were found only by making it fail on purpose. **Run a new check against a
known-broken build before trusting a green one.**

## The second blunt instrument (Phase 9) — `tools/pays.sh`

The smoke test asks whether anything throws. It cannot ask whether a feature is
worth using, and that turned out to matter: **loops were a net time loss for
three phases while every check passed.** A rail was paced by the arc length of
its ribbon, so the fastest line through a loop was to arrive too slowly to be
allowed on one. Nothing caught it because nothing had ever compared a lap with
the feature against a lap without it — every check asked whether the feature
*worked*, and it did, perfectly and expensively.

```bash
./tools/pays.sh           # when rails, ramps, pads or the driving model change
```

Strips ramps, boost pads and rails in turn from all six time trials and reports
what each is worth. **Slow — about 72 races — so it is not a pre-commit check.**

### A number without an error bar is how the loop survived

The most important thing in it is the **control column**: an identical
configuration that changes nothing, measured exactly like everything else.
Whatever it differs from baseline by is the measurement's own noise.

It nearly was not there, and adding it changed the conclusion twice.

1. **Without a control**, the check reported that Tide Pool's boost pads cost
   0.37s a lap. Plausible, actionable, and entirely false.
2. **With a control**, that track showed ±0.87s of noise and the same pads
   measured **+1.20s**. On the next run the loud track was Rug Loop instead —
   the tell that this was the method's floor, not a property of any track.
3. **The check then failed at random**, because a bar derived from one noisy
   control estimate is itself noisy. A check that fails at random gets ignored,
   which is worse than not having one.

### The fix was to remove the randomness, not to widen the bar

The noise is not incidental: the AI wanders and makes deliberate mistakes
because an opponent that never errs feels unbeatable (`04_AI.md`). That is right
for the game and ruinous for a measurement.

`pays.html` installs a **seeded** `Math.random` and runs a fixed set of three
seeds against every configuration. Runs are now reproducible, the control column
reads **exactly 0.00 on all six tracks**, and it has become a *determinism*
check rather than a noise estimate — if it ever reads non-zero, something in the
game is still random and every number in the table is worth less than it looks.

The bar is a flat 0.60s: enough to catch traps of the kind this exists for (the
loop cost 1.57s), and deliberately not fine enough to adjudicate tenths, which
still depend on which line a seed happens to take. **Under-claim rather than cry
wolf.**

Proved the same way as the smoke test: reverting the pacing to the old model
made it fail immediately — Dresser Drop rails −3.63s, Shelf Run −1.62s.

### Flakiness is worse than absence

The first budget of 45 simulated seconds per race failed The Big Dig
intermittently — the narrow trench track, where one bad start against a wall
costs several seconds and the margin was thin enough for ordinary variance to
tip it. It is now 90 seconds with an early exit, roughly double what any lap
needs, because a smoke test that cries wolf gets ignored. Verified stable across
three consecutive runs.

## The third blunt instrument (Phase 10) — `tools/calibrate.sh`

The reason this one exists is a mistake, and the mistake is more useful than the
tool.

### A coherent story is not evidence

Fifteen events were recalibrated on a theory that fitted every number available.
Each standard race measured 2-4 seconds quicker than the reference recorded
beside its target time. No time trial on an untouched track measured
differently. Races have opponents; time trials do not. An AI commit had just
landed. So the AI change had quietly handed every race a few seconds and nothing
had re-measured.

It explained the sign of the difference. It explained exactly which events were
spared. It suggested its own fix. It was wrong.

**Items do not exist in standard races** — `10_Items.md` q4, resolved, the
flagship mode is item-free — so the commit being blamed could not have touched
ten of the twelve races attributed to it. Building six older commits and
measuring each settled it: the race times were **identical at every one**,
including the very commit that had written those references. Nothing had
drifted. The recorded numbers came from a player stand-in that was never written
down, and the gap between two measuring conventions is indistinguishable from a
regression when you only ever measure once.

The three time trials that appeared to validate the model validated nothing.
They agreed because solo events measure the same under either convention, which
is precisely the subset incapable of detecting the problem. **A control that
agrees for a reason unrelated to the hypothesis is not a control.**

### Compare the game to itself, not to an assumption

The first version of this tool checked each event against its own target —
platinum ≈ 0.93 × reference — and flagged the disagreements. That version was
wrong by construction. A formula compares the game to a belief about the game,
so it cannot distinguish a regression from a disagreement about units, and it
reports both as the same red number.

`calibrate.sh` records what all eighteen events measure **today** into
`tools/reference-times.txt`, which is committed, and diffs against it. The
question becomes "what changed since last time?" — always a real effect, in the
units the game is played in. A number that moved is a finding. A number that sat
still needs nothing done to it, however wrong its target may look.

When something does move, **scale that event's targets by the ratio measured,
never by a ratio believed in.**

### Prefer a control that cannot respond

Fixing the starting grid moved every standard race by −0.65 to +0.80s and all
six time trials by **exactly 0.00**. Time trials have no opponents, so a grid bug
physically cannot reach them. A column that *could not* have moved is worth more
than one that merely did not — it is the difference between evidence and
coincidence, and it is what made the rest of that table trustworthy.

### The stand-in is written down this time

`technician` on `normal`, seat one, five seeds, median. Seat one starts mid-grid
since `PLAYER_START_BEHIND`, so it measures a lap driven through traffic — do not
read `racers[0]` as "whoever is on pole". The pairing is stated in the harness
header, because the previous one lived in a session's scratchpad and died with
it, which is half of why any of this happened.
