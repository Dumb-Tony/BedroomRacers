# Bedroom Racers — working rules

A browser racing game about toy cars on childhood play spaces. Vanilla JS, zero
dependencies, no build tooling.

**The full design bible is `GAME_BIBLE/`.** Twenty documents, each recording not
just what was decided but what was measured and what went wrong. Read the one
covering whatever you are about to touch. The rules below are the ones that have
already cost real time when forgotten.

---

## Where you are

`C:\Dev\BedroomRacers` is this game, and the whole of it. The repo is **public**
(`Dumb-Tony/BedroomRacers`), source and bible and all.

`C:\Dev\ClaudeGaming` is a **different repository holding a different game** on
its `SCP` branch. This project used to live inside it on `main` under a
`bedroom-racers/` prefix and no longer does. Never edit it, never `git checkout`
in it, and never merge between the two. If you find a stale worktree of it,
leave it alone — another session may be live there.

**Commit early.** A branch switch once wiped a whole turn of uncommitted work.
Files verified as written kept coming back missing while `git status` read clean,
which looked like a linter reverting them. It was a checkout. Stage explicit
paths rather than `git add .`.

## Building

```bash
./tools/build-artifact.sh
```

Run it after **any** source change. It bundles 40 files into `dist/play.html`,
which is the thing that gets published; `index.html` is the dev page. `dist/` is
gitignored — it is generated, and the published copy lives in the publish repo.

**A new source file must be registered in BOTH `index.html` and the `FILES` list
in `tools/build-artifact.sh`.** The build has a drift guard, but it cannot catch
a file missing from both — that shipped once with `BR.Items` undefined.

No ES modules. They are blocked by CORS over `file://` and this machine has no
Node or Python to serve from. Classic `<script>` tags, load order matters.

## Publishing

```bash
./tools/share.sh      # one sendable file: dist/bedroom-racers.html
./tools/publish.sh    # that file -> https://dumb-tony.github.io/bedroom-racers-play/
```

`dist/play.html` is a **fragment** — the artifact host wraps it in a document,
so it has no `<!doctype>`. A browser opening it directly falls into quirks mode,
where the box model changes and the layout is not the one that was tested.
`share.sh` adds the wrapper and then verifies it: doctype, charset, nothing
reaching for the network, and a real boot from a `file://` URL checking
`document.compatMode`.

The site is a **separate public repo** (`Dumb-Tony/bedroom-racers-play`) holding
nothing but the built HTML. That was originally for privacy, which no longer
applies now this repo is public; it stays because the deliverable is one bundled
file rather than a servable tree, and because the live URL must not change.

**Verify before posting a link, and compare git blob hashes rather than byte
counts** — the working copy is CRLF and Pages serves LF, so a byte comparison is
off by one per line and never matches. The `pages/builds/latest` API lies in both
directions: it describes the previous build for a while after a push, and goes
stale on a deploy that worked. What the URL actually returns is the only truth,
and it can take a few minutes. `publish.sh` already polls content for this
reason.

## The architecture rule everything else rests on

**The simulation is flat 2D. Only the renderer knows the camera is tilted.**
Nothing in `src/systems/` or `src/entities/` may see a projected coordinate.

That boundary is why elevation, loops and corkscrews cost a few dozen lines each
instead of a rewrite: `level` decides what collides, `z` decides where it draws,
and `v.z` still means *height above the track surface* while the deck height
lives separately in `v.roadZ`.

It also decides features. Dunes were prototyped as real slope in the sim and
deleted: the engine out-muscles gravity at any grade a sandbox could hold, and
the same dunes drawn as elevation keys — a render property — returned an
identical lap to the tick. When something wants to be 3D, check whether it can
be *drawn* 3D first.

## Content is data

Tracks, vehicles and events are definitions, not code. Adding one should never
mean touching a system. If it does, the system is wrong.

Three traps that have each shipped broken:

- **Every rectangle is anchored at its CORNER, not its centre** — zones, ramps,
  boost pads and rails all test `x <= p <= x + w`. Six were authored as centres:
  three ramps that could not fire, a boost pad in the sand, two puddles beside
  the road. `TrackManager.findStrayRects()` now warns; heed it.
- **Every wall on an elevated track needs a `level`.** One missing and it becomes
  an invisible barrier across whatever passes underneath.
- **Place things against measured centreline points**, not estimates. Build the
  track, print the points, then author.

## Target times are measured, never guessed

```bash
./tools/calibrate.sh            # did any event's lap time move?
./tools/calibrate.sh --update   # accept what it measured as the new baseline
```

Run it after anything that could change how long a lap takes: the driving model,
rails, ramps, pads, AI, track data, grid layout. It drives the `technician` AI on
`normal` in seat one, five seeds, median, across all twenty-six events, and diffs
against the committed baseline in `tools/reference-times.txt`.

**When something moves, scale that event's targets by the ratio you measured.
Never recompute them from a ratio you believe in.** This is not a style
preference; the alternative has already gone wrong. See the trap below.

**Never move the Technician's `targetSpeedMul` or the `normal` difficulty.** Every
target time in the game is calibrated against that exact pairing.

## Verification

This is the part that has gone wrong most, so it gets the most space.

**A stopwatch cannot verify a picture.** The loop measured perfectly — full
rotation, correct apex, correct exit — and drew as a flat vertical slab for two
commits, because every check was a number. If a claim is about what something
*looks like*, render a frame and look at it.

**A coherent story is not evidence. The control is.** Fifteen events were
recalibrated on a theory that fitted every number available: each standard race
read 2-4s quicker than its recorded reference, no time trial on an untouched
track did, races have opponents and time trials do not, and an AI commit had just
landed. It explained the sign, it explained which events were spared, and it was
wrong — items do not exist in standard races, so that commit could not have
touched them. Building six older commits and measuring each showed the race times
were **identical at every one**, including the commit that wrote those very
references. Nothing had drifted; the old numbers came from a stand-in nobody had
written down. The three time trials that appeared to validate the model agreed
only because solo events measure the same either way — precisely the subset that
could not detect the problem.

The lesson has a general form: **compare the game to itself, not to an
assumption.** A formula-based check asks "does this match what I expect?" and
cannot tell a regression from a disagreement about units. A committed baseline
asks "what changed since last time?", which is always a real effect. That is why
`calibrate.sh` stores measured times instead of checking a ratio, and why its
header says so at length.

**Test the thing you changed, not its side effects.** Harness bugs with this
shape have each cost real time:

- Timing anything: `performance.now()` does not advance under headless virtual
  time. Every measurement reads zero.
- Pixel-diffing two renders: `render()` eases the camera each call, so the second
  frame is from a different viewpoint. Particles and bob phase drift too.
- Reading `gain.value`: Web Audio param automation does not advance headless.
  A broken ambience shipped because `Audio.update` returns early when the context
  is not running, so the smoke test passed over code that threw.
- Testing a save: `save()` is debounced 400ms, and nulling the cache makes the
  pending write bail.
- Testing falling on a track with no gap in its rail.
- Emptying a list on `arena` to make a control run: **arenas are cached and
  reused**, so it mutates the cached track and every later run in the same page
  gets the stripped version. The harness then reported that a rail made no
  difference, having deleted every rail in the game first.
- Chrome exits silently when another instance holds the `--user-data-dir`, which
  reads exactly like the page hanging. **Use a unique profile per run** (`-$$`).
  A rendering change was blamed and rewritten twice for a lock left behind by an
  unrelated browser window.

When a check fails, **suspect the harness first**. A bad test looks exactly like
a real defect until you look.

**Measure a control before believing a delta.** Run the *unchanged*
configuration twice, exactly as you run the changed one; whatever the two differ
by is your noise floor, and nothing smaller is a result. Without one, a check
reported that a track's boost pads cost 0.37s a lap — re-measured against a
control, that track's noise was 0.87s and the pads came out at +1.20s.

**Then seed the randomness rather than widening the bar.** The AI wanders and
errs on purpose, so anything driven by it is noisy by design and a bar derived
from a noisy control is itself noisy — the check started failing at random,
which is worse than not having one. `tools/pays.sh` overrides `Math.random` with
a seeded generator and runs fixed seeds; its control column now reads exactly
0.00 and doubles as a determinism check.

**Prefer a control that physically cannot respond to the change.** When the
starting grid was fixed, the six time trials all moved by exactly 0.00 because
they have no opponents — a column that could not have moved is worth more than
one that merely did not.

**Ask whether the feature is worth using, not just whether it works.** Loops
were a net time loss for three phases with every check green, because every
check asked whether the ride happened. It did. The fastest line was to skip it.
`tools/pays.sh` exists to ask the other question.

**Never verify a predicate against its own assumptions.** View culling was
checked by asking "does anything the cull rejects land inside the viewport?" —
computing "inside the viewport" from the same model of visibility the cull used.
Both believed things in front of the camera were behind it, so the check passed
while two thirds of the visible walls went undrawn. Compare against the
*output*, which has no opinions.

**Pixel-diff two renders with `dt = 0`.** The camera ease, particles and every
other animation are functions of `dt`, so with a real one two frames of the same
scene never match and the diff measures drift. With zero they freeze. Then judge
on magnitude and structure, not on how many pixels differ: recomposing identical
geometry leaves isolated single-channel ±1 noise, while missing geometry is a
contiguous block differing by tens.

**A feature that never fires is a feature that does not exist.** Count events
over a real race, not just presence.

**Read the code you are reasoning about, then check it against reality.** Two
cars spawned at identical coordinates at the start of every standard race — one
inside the other, with five grid slots empty — because a loop still counted
opponents from the front after the player moved to mid-grid. The comment above it
described the old behaviour and read as correct. A harness printing where every
car actually is found it in one run.

## The tools

- `tools/smoke.sh` — does anything throw, anywhere? 55 checks across every track,
  screen, event and split-screen layout. Run before every commit.
- `tools/pays.sh` — does each track feature earn its place? Strips ramps, pads and
  rails in turn and compares. Slow; run when driving or track features change.
- `tools/calibrate.sh` — did any lap time move? Run when anything could have
  changed one. A **render-only change must show 0.00 on all 26 events**; if one
  moves, the change leaked into the simulation.
- `tools/shot.sh <eventId> [seconds] [outfile]` — render one frame and save it,
  so a claim about how something LOOKS can be checked by looking. Deterministic
  and seeded, so a before/after pair means something. `AIR=1` holds until the car
  is airborne, for anything about height, shadows or landings.

Per-feature harnesses stay **throwaway and in the scratchpad**. They are sharp
because each answers one question. Only promote one to `tools/` when the question
it answers will recur.

### Rendering a frame by hand: four ways to get an empty picture

Use `shot.sh`. If you ever must roll your own, these all produce a frame with the
HUD and the speed streaks floating over an empty floor, which looks precisely
like the renderer having broken:

- **`render(game, alpha, dt)` takes THREE arguments.** `render(game, 0)` reads
  naturally as "no time step" and actually passes `dt: undefined`. The camera
  feel maths goes NaN and every world-space thing projects to nowhere.
- **The view cameras are updated inside the frame path.** A correct `render()`
  call on its own still draws the world through a camera that was never pointed.
- **Stopping the loop stops the compositing.** A page that has ceased drawing
  hands Chrome a surface from before it ever painted, so the capture is blank
  even when hundreds of frames rendered correctly first. `shot.sh` freezes the
  CLOCK instead — `dt` goes to 0, the loop keeps running — and then reads the
  canvas with `toDataURL` rather than racing `--screenshot`.
- **Unseeded `Math.random`** makes two runs of the same command different races,
  so a before/after pair shows you the AI wandering, not your change.

An hour went into blaming an innocent art change for the first two before the
argument list was simply read. Suspect the harness first, and give it a control:
rendering the same scene from the build *before* the change is what settled it.

## Audio

Everything is synthesised — no sample files, and the artifact CSP would block
them. Sounds are **edge-detected off counters once per rendered frame**, never
called from inside the fixed step: a fixed step can run several times per frame
and would machine-gun the sound.

## Style

Match the surrounding code. Comments explain *why*, and especially what was tried
and failed — that is what stops the next person reintroducing it. Semicolons,
two-space indent, single quotes.
