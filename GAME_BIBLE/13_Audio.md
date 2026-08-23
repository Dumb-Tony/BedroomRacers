# 13 — Audio

## Role of audio

Audio does three jobs here, in priority order:

1. **Gameplay feedback** — surface changes, drift charge, boost readiness, collisions.
   A skilled player should be able to drive competently with their eyes half on the
   HUD, guided by sound.
2. **Scale reinforcement** — small plastic sounds in a large room. Audio carries the
   toy fantasy as much as the art does.
3. **Mood** — nostalgia, warmth, energy.

Job 1 is the one that gets cut under deadline pressure and shouldn't be.

## Music

Energetic, playful, nostalgic. Influences: upbeat electronic, toy percussion,
pop-punk-inspired racing music, chiptune elements, light orchestral adventure themes.

Each environment gets its own musical identity. The town rug is the reference point:
warm, bright, a little wistful under the energy.

Toy percussion — xylophone, music box, tin drum, rattle — is the connective tissue
across worlds. It should be present everywhere, in different guises.

### Practical constraints

- Browser delivery means **file size matters**. Loopable tracks of 60–90 seconds beat
  long linear compositions.
- Music must duck cleanly for callouts and the announcer.
- Consider a **final-lap variation** — a layer added or tempo lift. Cheap, effective.

## Vehicle sounds

A mixture of realistic and imaginative: small electric motors, plastic wheel rattles,
wind-up clicking, exaggerated engine noises, childlike vocal imitation of engines,
metallic toy impacts.

**The childlike vocal engine imitation is the most distinctive idea in the audio
direction.** A child going "vrrrooom" is instantly the whole game in one sound. Worth
prototyping early, even if it ends up used sparingly or only on specific vehicles.

### Per-vehicle material

Sound follows material (`09_Vehicles.md`):

| Material | Character | Built |
| --- | --- | --- |
| Die-cast metal | Heavier, ringing impacts, low rattle | Green Pickup, Orange Tipper |
| Glossy plastic | Light, hollow, clattering | Red Racer, Blue Buggy, Yellow Rocket, Teal Scout, Cream Camper |
| Wood | Dull knock, no ring | Heirloom |
| Wind-up | Mechanical ratchet under the engine | Purple Micro |

All four are implemented in Phase 10 — `BR.Audio.MATERIALS`, driven by a
`material` field on each vehicle. See *Nine cars, four materials*.

## Gameplay-critical sounds

These are not decoration. Each must be distinguishable in a busy mix:

| Event | Requirement |
| --- | --- |
| **Surface change** | Tyre note changes immediately and audibly on every transition |
| **Drift engaged** | Continuous slide tone, pitch tracking slip angle |
| **Drift charge full** | A clear, unmissable cue — the player must know without looking |
| **Boost available** | Distinct from charge-full |
| **Boost active** | Sustained, obviously different from normal engine |
| **Clean landing** | Positive confirmation, distinct from a bad landing |
| **Collision** | Severity communicated by sound, playful not violent |
| **Checkpoint / lap** | Short, non-intrusive, unambiguous |
| **Hazard approach** | Warning with enough lead time to react |

The drift-charge-full cue is the single most important sound in the game.

## Environmental sounds

Bedroom clock ticking, toy train whistle, floor creaks, distant household sounds,
plastic blocks falling, rug friction, pages flipping, wind through an open window.

Distant household sounds carry the framing story from `00_Vision.md` — the toys are
racing while the house goes on around them. A muffled TV, footsteps in a hallway, a
door closing somewhere. Used sparingly, this does more for the premise than any
cutscene would.

## Announcer

Optional. An energetic announcer introduces races and reacts to major moments.

The lighter alternative is text callouts (`11_UI.md`): `Great Drift!`, `Shortcut!`,
`Perfect Landing!`, `Final Lap!`, `New Best Time!`.

**Recommend starting with text callouts only.** Voice work is expensive, hard to
change, adds significant download size, and gets repetitive fast in a game built
around replaying short races. Revisit once the game is otherwise complete.

If an announcer is added: keep lines short, vary them heavily, and make them fully
disableable.

## Accessibility

- Separate music and SFX volume sliders (`11_UI.md`)
- All gameplay-critical audio must have a visual equivalent — no information exists in
  sound alone
- Subtitle support for any voiced content
- Avoid sudden loud stingers; the audience includes noise-sensitive players

## Built in Phase 3 — everything is synthesised

There are **no sample files**. A published build runs under a strict CSP with no
external requests, so there is nothing to load and nothing to fall back to. Every
sound is generated with Web Audio at runtime.

That constraint turned out to suit the priority order above: synthesis is good at
exactly the gameplay-feedback layer this document ranks first, and weakest at
recorded texture, which is mood.

| Sound | How |
| --- | --- |
| Engine | Two detuned oscillators through a lowpass; pitch and cutoff track speed. Small and buzzy, not throaty — a three-inch car |
| Surface | Filtered noise. Rug drops the cutoff and raises the level, so leaving the road is audible before it is visible |
| Drift | Bandpassed noise, centre frequency tracking **slip angle**, so how hard you are sliding is heard |
| Boost ready / full | Two clearly different cues. Full is a rising two-note chime — the most important sound in the game |
| Collision | Noise burst through a sweeping bandpass. Severity picks pitch and length, so a graze ticks and a square hit clunks |
| Landing | Bright tick plus chime when clean, dull thud when not |
| Checkpoint / lap / countdown | Short tones, with a second note on the final lap |
| Material | Per vehicle. Changes the oscillator pair, detune, cutoff, filter Q, tyre rattle and what happens *after* an impact — see below |
| Opponents | **One proximity layer per listener**, never a voice each |
| Music | Sparse procedural toy percussion over a pulse, scheduled against the audio clock. Lifts slightly on the final lap |

### Two rules the implementation obeys

**Audio never runs inside the fixed simulation step.** It observes state and
detects edges once per rendered frame. Firing from inside the step would trigger
sounds several times per frame and couple audio to physics, breaking the
determinism that Time Trial ghosts depend on (`15_Save_System.md`).

**The player is always louder than the field.** Six cars each with a full engine,
drift and collision voice would overwhelm the mix and the CPU, so opponents
collapse into a single layer whose level tracks the nearest car.

### Every human gets a channel

In split screen both players are "the player". Each has their own engine, tyres,
drift, boost, collisions and rival-proximity layer, and their own edge-detection
state — so a collision on the left does not sound on the right.

**Channels are panned to match the split**: player one to the left, player two to
the right, which is also where their car is. A single player sits centre. Both
channels are built at startup and silenced when unused, because allocating
mid-race and reconnecting a running graph both click.

Sounds that belong to the RACE rather than to a driver — the countdown, GO and
the finish fanfare — stay centred and fire once however many people are playing.

One trap this uncovered, and it affected single player too: the countdown
tracker was left at its finished value between races, so **the lights went out in
silence from the second race of a session onwards**. It now re-arms on entering
the countdown. Verified across three consecutive races.

Measured over a full race: 121 oscillators created in ~93 seconds, about 1.3 per
second. One-shots are not leaking voices.

### Still missing

Environmental sound and the announcer. Music is procedural rather than composed
— it works, but a real soundtrack is a different job.

**Per-vehicle material character was on this list until Phase 10.** It is built:
every car declares what it is made of and the whole channel changes with it. See
*Nine cars, four materials* below for what varies and what deliberately does not.

## Technical

- Web Audio directly. No engine sound manager, because there is no engine
- Nothing to download, so no format fallback chain is needed
- **Cap simultaneous sounds** — six drifting cars plus hazards plus music will
  overwhelm the mix and the CPU. Prioritise player-vehicle sounds over opponents'
- Mobile browsers require a user gesture before audio starts. Handle this at the first
  menu interaction, never mid-race

## Open questions

1. Is the vocal "vrrrooom" a core identity element or a novelty that wears thin?
   Prototype early.
2. ~~Do opponents get full audio, or a reduced mix?~~ **RESOLVED: a reduced mix,
   and a drastic one.** Channels are allocated per HUMAN, capped at four. Rivals
   get no engine of their own — just a single proximity layer mixed into the
   listener's channel by how near the closest one is. The draft guessed six cars
   would be unmanageable; the grid now runs eight and it is a non-issue, because
   opponent count and voice count were never linked.
3. ~~Music per world, or per track?~~ **Resolved in Phase 9: per world**, and it
   is sufficient. The four sandbox tracks want the same sandbox — a tune each
   would stop the world being a place. See the section below.
4. Does the under-bed section (`06_World_Town_Rug.md`) get muffled audio processing?
   It would be a strong effect for one filter.

## Related

`02_Mechanics.md` — the verbs audio must communicate.
`11_UI.md` — callouts and accessibility.
`12_Art_Guide.md` — matching visual effects.

## The quiet features (Phase 8)

Items, loops, corkscrews, falling and recovery all shipped **silent**. Four
features, none of which made a sound — on a game whose audio is otherwise fully
synthesised and per-channel.

They are the moments that need it most. A loop taken in silence reads as a
cutscene rather than a ride. Being hit by an item you neither saw nor heard is
the exact complaint `10_Items.md`'s design stance exists to prevent — "nothing
invisible, instant and unavoidable" is a claim about *perception*, and half of
perception is sound.

Eight voices added, from the same primitives as everything else — no sample
files, which the CSP would block anyway:

| voice | |
| --- | --- |
| `itemPickup` | rising two-tone: you have gained something |
| `itemFire` | harder edge for offensive items, so the slot's contents are audible to whoever is about to be hit |
| `itemHit` | close to `collide()`, because it costs the same |
| `shieldPop` | bright and short, obviously a save |
| `railBoard` / `railExit` | the pitch climb *is* the loop |
| `fall` / `recover` | a departure, then a mechanical clunk — you were placed, not rescued |

### Counters, not booleans

All of it is **edge-detected off counters once per rendered frame**, exactly as
impacts already were, and never called from inside the fixed step. A fixed step
can run several times per rendered frame, and firing a sound per sub-step
machine-guns it.

`stun()` counts a *new* hit only — a second item landing mid-stun extends the
timer but is not a fresh event, and sounding it twice would double up.

### A voice that never fires is a voice that does not exist

Presence checks are not enough. Counted over real races: 9 pickups, 8 fires, 6
hits, 6 rail boardings. Three voices fired **zero** times — and one of those was
the test's fault: falls were measured on Dresser Drop, which has no gap in its
rail, so falling there is impossible by construction. Shield pops and falls were
then verified directly instead of hoping a race would reach them.

## Three worlds, three beds (Phase 9)

Open question 3, resolved: **per world.** Four sandbox tracks want the same
sandbox; a tune each would stop the world being a place, and it would also
triple the tuning surface for no gain a player could name.

There are three worlds, not four — Bedside Boulevard is `world: 'town-rug'`,
which is right. It is the same bedroom floor at night, not a different room.

### What varies, and what deliberately does not

This document's own rule decides it: **toy percussion is the connective tissue
across worlds, "present everywhere, in different guises."** So the
instrumentation never changes — pulse, xylophone lead and shaker are in all
three. What changes is key, register, tempo, mode and timbre. They should sound
like three rooms in one house, not three different games.

| | key | tempo | mode | lead | pulse | shaker |
| --- | --- | --- | --- | --- | --- | --- |
| Town rug | G, 392 | 0.227 | minor-ish | sine | triangle | 5000Hz rattle |
| Sandbox | D, 587 | 0.214 | major pentatonic | sine | triangle | 3200Hz brush |
| Stunt | B♭, 466 | 0.198 | dorian-ish | **square** | **sawtooth** | 6500Hz tick |

The town rug is the reference this document already named — *"warm, bright, a
little wistful under the energy"* — so its numbers are exactly what shipped
before the table existed, and the other two are defined against it.

The reasoning behind each is one line long, which is the point of doing it in
intervals rather than in samples:

- **Sandbox is outdoors at midday.** Major pentatonic has no minor third to be
  wistful about, and that single interval is the entire difference. The shaker
  drops in pitch because sand is a brush, not a rattle.
- **Stunt is moulded plastic up on the furniture.** A square lead is the one
  timbre that is unmistakably a toy electronic; the pulse goes to sawtooth an
  octave down to push rather than sit underneath. Quickest of the three, because
  this is the world with the loops in it.

Measured: no two worlds share a pitch set, a tempo, or a shaker character, and
the rug and the sandbox share **1 of 7** pitches — related, not transposed.

**The last-lap lift is a ratio, not a pair of numbers.** Held absolute, every
world would speed up to the same tempo on the final lap, and three identities
would collapse into one at the exact moment they matter most. As a ratio the rug
goes 0.227 → 0.208 and the stunt track 0.198 → 0.181, staying as far apart as
they started.

Changing world **restarts the phrase**. Carrying a step count across a key
change drops the new bed halfway through a bar of the old one, which reads as a
glitch rather than as arriving somewhere.

### Verifying music with the audio clock frozen

Web Audio parameter automation does not advance under headless virtual time —
already recorded as a trap — so the *sound* cannot be measured here at all.

What can be, and what is actually the content of the music, is **what the
scheduler decides**: which pitches, which timbres, at what tempo, in what order.
The harness replaces `note` and `noiseHit` with recorders and stubs the audio
clock with one it advances itself. That isolates the scheduler exactly and
sidesteps the frozen clock rather than fighting it.

## Nine cars, four materials (Phase 10)

`09_Vehicles.md`: *"Each should bring a MATERIAL as much as a stat spread — the
wooden car should feel and sound wooden. Material is characterisation."* Until
this phase every car in the game made **exactly the same noise**. The Heirloom
is described in the design as a battered wooden car and sounded like a moulded
plastic one, which is the specific failure this section closes.

Each vehicle declares `material` — one of `plastic`, `metal`, `wood`, `windup` —
and `BR.Audio.MATERIALS` turns that into a voice. It is **not a stat**: nothing
here touches speed, grip or weight, and a lap time cannot tell the difference.

Roster: **5 plastic, 2 die-cast, 1 wood, 1 wind-up.**

### Glossy plastic is the reference

Its numbers are exactly what shipped before the table existed, for the same
reason the town rug's music is: most of the roster is a plastic toy car, so the
common case must not change and the other three are defined against it. A car
that declares no material at all resolves to plastic — measured identical to a
declared plastic car, oscillators, cutoff and Q — because an undeclared toy car
is a plastic toy car, never a silent one.

### What varies

Measured off the live channel at full speed, from a probe car identical in every
way except its material:

| | oscillators | detune beat | engine pitch | cutoff idle→flat | filter Q | tyre rattle | after the hit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Glossy plastic | saw + **square** | 3.26 Hz | 272.0 | 600→2100 | 3.0 | 1100 Hz / Q1.2 | 2 clatter ticks |
| Die-cast metal | saw + saw | 1.47 Hz | 244.8 | 520→1670 | 4.5 | **660 Hz** / Q2.6 | **rings, 2100+3171 Hz** |
| Wood | **triangle** + saw | 5.37 Hz | 255.7 | **420→1320** | **1.4** | 858 Hz / Q0.7 | **nothing** |
| Wind-up | **square + square** | 8.81 Hz | 293.8 | 700→2400 | 2.2 | 1298 Hz / Q1.9 | 1 tick + ratchet |

Each column is doing one job, and the reasoning is one line long — which is the
point of doing this in synthesis parameters rather than in samples:

- **The square oscillator is what makes plastic sound empty.** Metal drops it
  for a second sawtooth, because a die-cast car is not hollow.
- **Detune is age.** The beat rate spans 1.47 Hz to 8.81 Hz — a 6x spread. Metal
  is nearly in tune with itself; the wind-up tin toy is not remotely, and a
  battered wooden car sits between them.
- **Cutoff is dullness.** Wood is the darkest thing in the game at 420→1320 Hz
  and has the lowest Q anywhere, 1.4 in the engine and 0.8 in its impacts —
  everything that could resonate has been taken away.
- **"Low rattle" is literal.** Metal's tyre note sits at 660 Hz against plastic's
  1100. Both ends of the rug/road split scale together, so the *size* of the
  surface change is identical in every car.

### The tail is what makes wood sound like wood

Severity 0.8, time from the contact to the last thing still sounding:

| | impact tail | voices created |
| --- | --- | --- |
| Wood | **0.140 s** | 1 oscillator, 1 noise burst — and then silence |
| Wind-up | 0.205 s | + one tick at +45 ms, the mechanism jolting |
| Glossy plastic | 0.238 s | + clatter at +45 ms and +85 ms |
| Die-cast metal | **0.434 s** | + two sustained partials |

**Metal rings 3.1x longer than wood.** That single ratio is most of the
character: what makes wood *sound* like wood is not its pitch, it is how fast it
stops.

The ring is two partials at **1:1.51**. An integer ratio reads as a musical note;
this one reads as struck metal, which is the difference between a chime and a
die-cast car hitting a skirting board. Wood has neither branch — *"dull knock, no
ring"* is a statement about what is **absent**, so the wooden car's impact is
over when the knock is.

### The ratchet is a graph, not a schedule

Wind-up gets a fifth voice: narrow-banded noise **gated by a square LFO**, so the
click rate is a parameter. It runs **9 Hz at idle → 39 Hz flat out**, which is a
spring unwinding faster.

The obvious implementation is to fire a tick per frame at the right interval, and
that is precisely the bug the counters exist to prevent — it would run on the
render clock, drift with frame rate, and machine-gun the moment the fixed step
ran twice in one frame. An LFO runs on the audio thread and cannot do any of
that. The gating trick is that an `AudioParam`'s value is its intrinsic value
**plus** everything connected to it: hold both at *a* and a ±*a* square swings the
gain between 0 and 2*a*. Measured, the gate is 0.028 + 0.028 → swinging 0…0.055.

Both halves must be silenced together. Leaving the LFO amplitude up on a silenced
channel keeps it ticking at half level.

### What material may not touch

Audio's first job is gameplay feedback and its third is mood. Material only ever
changes the mood layer of a cue, never the part carrying information:

- **Engine pitch still tracks speed.** Material shifts the whole curve by a
  constant, so "faster is higher" survives in every car.
- **The rug/road tyre split scales together**, so leaving the road is exactly as
  audible whatever you are driving.
- **Drift is untouched** — measured at 1200 Hz in all four. That is tyres against
  the *floor*: it belongs to the surface, not to the shell.
- **The clean-landing chime is untouched.** It is the cue that says the landing
  was clean, and a car whose confirmation was duller than everyone else's would
  be a car penalised for what it is made of.
- **Rivals stay generic.** The proximity layer collapses the whole field into one
  voice, so it has no single material to be.

Character sits on top of readability, never instead of it.

### Verified the same way the music was

Same trap, same answer: parameter automation does not advance under headless
virtual time, so the sound cannot be measured. The harness replaces the entire
`AudioContext` with a recording one — every node remembers every write to every
parameter, and the clock is a number the harness advances itself — then drives
the real `updateChannel` with a synthetic car. That measures **what the code
decides**, which is what a material actually is.

**41 checks pass.** Every one of the nine vehicles resolves to a declared
material; all four materials have at least one car, because a voice with no
vehicle never fires and a voice that never fires does not exist; all **6 pairs**
of materials differ, and they differ on *every* axis separately — 4 distinct
oscillator pairs, 4 pitches, 4 cutoffs, 4 filter Qs, 4 rattle centres, 4 beat
rates — so the distinctness is not one lucky field carrying three that are really
the same.

**The negative control is the part worth keeping.** Forcing `materialFor()` to
return plastic for every car fails **17 of the 41 checks**. Without that run, a
harness that quietly measured nothing would have looked exactly like this one.
