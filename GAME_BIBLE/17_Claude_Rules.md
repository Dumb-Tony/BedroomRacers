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

1. Should there be a `CLAUDE.md` at the repo root pointing here? Probably yes, once
   code exists, so conventions load automatically.
2. Is there a preferred JS style (semicolons, quotes, formatter)? Worth pinning before
   there is much code.
3. Testing expectations — is any automated testing wanted before Phase 4?

## Related

`14_Technical_Architecture.md` — the technical rules referenced here.
`18_Roadmap.md` — phase boundaries.
