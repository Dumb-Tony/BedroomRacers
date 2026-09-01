# 21 — The First Run

What happens the first time somebody opens this game, and what happens every
time after that.

Built in `src/ui/Coach.js` and three new screens in `src/ui/Screens.js`.

## The problem

A first-time player pressed RACE and was dropped onto the rug knowing nothing.

The game has drifting, a drift charge, a boost meter with a threshold you have
to reach before you can spend it, six surfaces that behave differently, hidden
toy pieces, boost pads, three stars an event, a star gate across 26 events, time
trials with ghosts, and split screen for four. **None of it was explained
anywhere.**

The only thing the game had ever said out loud was a strip of tape across the
countdown with the key bindings on it, which fades out 2.2 seconds after the
lights go green (`11_UI.md`, Phase 9) — and even that was the *second* attempt,
because for a long time the solo player was the one seat that got no label at
all.

## The shape of the answer

Three things, in the order the player meets them.

1. **A welcome card**, instead of the menu, on a save that has never been
   played. One question, two answers.
2. **The lessons**, which are the real Rookie Shakedown with a printed leaflet
   on it. Not a tutorial mode.
3. **Settings and Credits**, which `11_UI.md` has listed on the main menu since
   its first draft and which never existed.

### Track 1 is the tutorial, taken literally

`11_UI.md` has always said teaching here is diegetic and that track 1 is the
tutorial. The strongest reading of that is not a separate practice track: it is
**the first event, with a coach in the passenger seat**. Real rivals, real
stars, real medal. If the player ignores every card they still finish a race
they can be proud of, and if they read every card they have learned the whole
game by the chequered flag.

Nothing is added to `src/data/events.js` for this. The coach names one event id
and the lessons are written about that rug.

## The lessons

Six, in `Coach.LESSONS`. Each is a card: a headline, a line of body, and where
there is a control involved, the control's name on a moulded key cap.

| | when it appears | when it is satisfied |
| --- | --- | --- |
| **steer** | immediately, over the countdown | 1.6s of actually driving |
| **drift** | a real bend is under 620 units ahead | `driftCharge` passes 0.28 |
| **boost** | the meter reaches `boostMinToFire` | the player fires it |
| **rug** | the car has been off the road 0.45s | nothing — it just says its piece |
| **pieces** | 26 seconds into the race | — |
| **stars** | the final lap, or 55 seconds | — |

Not taught, on purpose: **items** (the Shakedown has none, and a control for a
thing that cannot happen teaches nothing), **jumps** (no ramps on the rug),
**split screen** and **time trials** (both are menu choices this player has not
made yet). Every lesson is about something that will happen in the next ninety
seconds.

### The drift prompt comes from the track

"Drift here" on a stopwatch is wrong the moment a player arrives at the corner
early or late, and it would be a second copy of the track's corner data — the
exact failure `CornerHint.js` exists to avoid. The lesson asks
`CornerHint.findCorner()` for the next real bend on the racing line the AI
already drives. Move a waypoint and the prompt moves with it.

The `done` test is `driftCharge`, which only rises while the car is genuinely
sliding past `driftMinAngle` above `driftMinSpeed`. **Holding the button in a
straight line does not count**, which is the whole point of the lesson.

The surface lesson works the same way from the other side: it reads
`arena.offSurface` rather than the string `'rugRoad'`, so it does not go stale
the first time a world is added.

### Nothing is a gate

Every lesson with something to do carries a **patience**, 20–22 seconds. If the
player has not done it by then the coach moves on and never mentions it again.
There is no failure state, no repeat, and no "try again" — a tutorial that nags
teaches that the game will not shut up.

The informational cards linger 4.5–5.5 seconds and go.

### The order is a priority, not a queue

This is the one thing that was got badly wrong first, and it was invisible in
the code.

The lessons ran as a strict queue: each waited for its own `ready`, and nothing
behind it could start. Logging a full guided lap against the technician AI
showed **the surface lesson sitting at the head of the line for forty-five
seconds** waiting for a mistake that driver never makes — and because it
blocked, **toy pieces and stars were never taught at all**. The two beats that
explain the entire progression model were held up by an optional one about the
carpet.

`update()` now takes the **first lesson that is ready**, not the next one in
line. List order is the tie-break, so a corner and a full boost meter arriving
together still teach the drift first. One explicit dependency exists — nothing
says "spend the boost" before the player has been told where boost comes from —
and it is the only ordering that is enforced.

Measured over one guided race, technician AI on normal, seeded:

```
shown  steer   clock  0.0    done 1.6
shown  drift   clock  8.3    (patience expired — that driver does not drift)
shown  pieces  clock 39.0
shown  boost   clock 49.1    done 49.1
shown  stars   clock 55.0
5 of 6 taught, never shown: rug
```

`rug` is the correct omission: the technician never leaves the road, so it is
never told to stay on it. Forcing the off-road condition teaches all six.

### The copy has to be true for as long as the card is up

The drift card's first headline was "HERE COMES A CORNER". A render at 37
seconds had it still saying that, two corners after the one it arrived for. A
card that is true for one second and a lie for the next nineteen is worse than
a card that is merely dull, so it reads "CORNERS WANT A DRIFT" now.

The boost card said "THAT SLIDE WAS FUEL", which is a lovely line and often
false: the meter also fills from boost pads, and a Rug Route car **starts the
race parked on one**. A player who has not managed a drift yet can reach that
card with a green bar and be congratulated for something they never did. It
names both sources now, which gets the pads taught for free.

## Where it is drawn

Top centre, immediately under the clock. Everything else is spoken for: the car
and the road ahead of it are the middle and lower screen, the corner arrow is
bottom-centre under the car **by design**, speed and boost are bottom-left, the
map is bottom-right, and the control tape is on the bottom edge.

Two things push it down, both read from what was actually laid out this frame
rather than recomputed:

- **A phone's pause button** sits in the top right with a generous hit box, and
  on a narrow screen the card reaches it.
- **The position and lap plates**, because the card is centred and nearly full
  width on a phone. A render at 375x812 had its top-left corner sitting across
  the bottom of `LAP 1/3`.

The body **wraps rather than condensing**. `fillText`'s `maxWidth` squeezes the
glyphs, and `11_UI.md` has already ruled on that once for the event rows: a
line squeezed to fit is present and unreadable. The longest lesson is 78
characters against a 347-wide card on a phone, so this is not an edge case, it
is every card.

The HUD's own control tape is suppressed while the lessons are running. They
occupy the same two seconds of countdown, and the first card names the steering
control on a key cap of its own.

## Three vocabularies

A tutorial that only knows the keyboard is wrong on a phone. Telling a phone to
press SHIFT is worse than saying nothing — the same conclusion
`HUD.drawSoloControls` reached about the tape.

| | steer | drift | boost | pause |
| --- | --- | --- | --- | --- |
| keyboard | `← →` or `A D` | SPACE | SHIFT | ESC |
| gamepad | the stick | A | X | START |
| touch | ◀ ▶ | DRIFT | BOOST | II |

Written as "pause any time with X" rather than "X pauses", because the touch
vocabulary starts with a glyph and "II pauses, any time" is not a sentence.

## Getting out of it

Two ways, because neither covers everybody.

- **SKIP on the leaflet**, a real button with a real region pushed through
  `Screens.button`, so it uses the same hit test and the same plastic as
  everything else. Pointer and thumb.
- **SKIP THE LESSONS on the pause card**, which appears only while they are
  running. Keyboard, pad, and anything else — `Screens`' key handler
  deliberately ignores the keyboard while a race is being driven, so the
  leaflet's own button cannot be reached by a pad.

Escaping off the welcome card counts as declining it, not dodging it.

## The flag lives in settings

`settings.taught`, not `progression` and not `state`.

`SaveManager` draws one line down the middle of a save and draws it twice:
`reset()` keeps settings and drops progress, and `importCode()` keeps **this
device's** settings and takes the code's progress. Both say the same thing —
progress belongs to the player, settings belong to the seat.

Having been shown how to drive belongs to the seat. Somebody who wipes their
stars to run the ladder again has not forgotten what the drift button is, and
somebody pasting a save code into a new browser has certainly played before.
Either would be handed the first-run flow again if this lived with progress,
which is exactly the "never appear again once done" the feature is for.

And because it is a setting rather than a trophy, undoing it is allowed:
**SHOW THE LESSONS AGAIN** sits in Settings next to the other things about how
this seat is set up. It restarts the same guided event, and it forces the game
to one player first — two people on a sofa do not need to be told what the
drift button is one card at a time, and an exhibition race awards none of the
stars the last lesson is about.

## What it costs the race

Nothing. `Coach.update()` reads the vehicle and the race manager and writes
nothing but its own state — no physics, no AI, no difficulty, no target time —
and it is called once per **rendered** frame from `main.frame`, never from
inside the fixed step.

**All 26 events calibrate at 0.00** with the file loaded.

## Verification

- `tools/smoke.sh` — **69 checks**, up from 55. The three new screens joined
  the size sweep (three sizes each, plus a focus check), and there is a check
  that runs the coach beside a live race, opens the pause card while it is
  running, and asserts that skipping stops it and marks the seat taught.
  - Rendering all 2700 frames of that check spent the entire virtual-time
    budget and the page never wrote its report, which `smoke.sh` reports as
    "the page did not finish" — indistinguishable from the game hanging. It
    samples every 90th frame instead.
- `tools/calibrate.sh` — 26 events, all 0.00.
- Rendered and read at 1280x800, 900x500, 820x420, 812x375 and 375x812, with
  and without touch controls, and paused.

## Related

`11_UI.md` — the screens, the kit they are made of, and the menu layout fix
this pass forced.
`02_Mechanics.md` — the verbs being taught, and the bindings the three
vocabularies mirror.
`01_Game_Loop.md` — what the stars and toy pieces the last two lessons mention
are for.
`15_Save_System.md` — the settings/progress line the flag is placed on.
