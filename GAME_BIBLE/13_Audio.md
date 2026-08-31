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

Built in Phase 11, and *sparingly* turned out to be the whole answer — see
*The vrrrooom is punctuation, not texture* below. It is not the engine. It fires
once, on GO.

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
| Wind | Broadband noise, level going with the **cube** of speed. Added Phase 11 |
| Surface | Filtered noise in two voices — a lowpass for the body and a bandpass for the grain — from a per-world table. Leaving the road is audible before it is visible |
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

The announcer, and nothing else on this list. Music is procedural rather than
composed - it works, but a real soundtrack is a different job.

Environmental sound came off this list in Phase 10 and the vocal engine
imitation in Phase 11.

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

1. ~~Is the vocal "vrrrooom" a core identity element or a novelty that wears
   thin?~~ **RESOLVED in Phase 11: BOTH, and that is what decides where it
   goes.** It is core identity and it wears thin, and the two are not in
   conflict because they are claims about different *durations*. It is now a
   once-per-race punctuation mark on GO and is not on the engine at all. See
   the section below.
2. ~~Do opponents get full audio, or a reduced mix?~~ **RESOLVED: a reduced mix,
   and a drastic one.** Channels are allocated per HUMAN, capped at four. Rivals
   get no engine of their own — just a single proximity layer mixed into the
   listener's channel by how near the closest one is. The draft guessed six cars
   would be unmanageable; the grid now runs eight and it is a non-issue, because
   opponent count and voice count were never linked.
3. ~~Music per world, or per track?~~ **Resolved in Phase 9: per world**, and it
   is sufficient. The four sandbox tracks want the same sandbox — a tune each
   would stop the world being a place. See the section below.
4. ~~Does the under-bed section (`06_World_Town_Rug.md`) get muffled audio
   processing?~~ **RESOLVED in Phase 11: yes, and it is one filter exactly as
   the draft guessed.** A 1600 Hz lowpass across the driver's own channel, on
   the boards and the socks lying on them. See *Under the bed is a box* below.

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

**There are four now.** The kitchen table arrived in a later phase with no bed
and no room of its own, so both kitchen tracks raced to the bedroom floor's tune
under a bedroom clock ticking. That is the audio version of the bug the art pass
found when it caught carpet pile printed on the kitchen tiles: a world is a
place or it is not. Fixed in Phase 11 — see the table below.

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
| Kitchen | E, 659 | 0.206 | **lydian** | triangle | **square** | 4200Hz chink |

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
- **The kitchen is a hard room at breakfast.** Lydian is major with the fourth
  raised, and that one interval is the brightest thing available; the register
  is the highest in the game because glazed tile and laminate ring where a rug
  absorbs. Timbre is not on the distinctness list above — the rug and the
  sandbox deliberately share sine-over-triangle, since both are soft rooms —
  but triangle over square was the one pair nothing else had taken.

Measured with the kitchen in: four tempos, four roots, four shaker characters.

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
  audible whatever you are driving. Phase 11 turned two floors into twelve and
  the rule did not change: material scales every one of them by the same
  factor, so the *size* of every transition is identical in every car. Measured
  across all four materials, the road-to-rug ratio comes out to a single value.
- **Drift is untouched** — measured at 1200 Hz in all four. That is tyres against
  the *floor*: it belongs to the surface, not to the shell. Phase 11 followed
  that reasoning to its conclusion and gave the FLOOR a say in it, so the figure
  is now 1200 × the surface's `slide` — 1032 Hz on the rug road, 1500 on
  varnished boards. Still identical across all four materials, which is what
  this row is claiming.
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

## The house going on around the race (Phase 10)

Environmental sound, which this document has listed under "Still missing" since
the first draft while being unusually clear about why it matters:

> Distant household sounds carry the framing story from `00_Vision.md` — the
> toys are racing while the house goes on around them... Used sparingly, this
> does more for the premise than any cutscene would.

**Sparingly is the entire design.** A race is ninety seconds of engine, tyres
and collisions; anything continuous underneath becomes noise you stop hearing
and then cannot unhear. Measured, it fires **21 events a minute on the rug, 12
in the sandbox, 13 on the stunt track**, and the loudest thing in it is 0.055.

Per world, because the room is part of the world:

| | what you hear |
| --- | --- |
| Town rug | a bedroom clock ticking, a floorboard, a door closing elsewhere, plastic settling |
| Sandbox | wind across an open pit, a spade knocking the frame |
| Stunt | moulded track flexing, a television two rooms away, plastic tapping the dresser |
| Kitchen | the fridge cycling, a tap not quite off, china settling on the drainer, a chair foot on tile |

The kitchen row is Phase 11. It had been racing under the bedroom's clock.
Counted over a fresh sixty-second window of the seeded stream, the four worlds
fire 15, 12, 13 and 13 events a minute — the kitchen is in the same band as
everywhere else, which is the point of *sparingly*.

On the **SFX bus, not the music bus**. This is diegetic world sound: a player who
turns the music down to hear the driving should keep the room they are driving
in.

### It has its own random numbers, and that is not fussiness

`Math.random` is the stream the AI's wander and mistake rolls come out of. Audio
runs once per **rendered** frame, so if ambience drew from it, the sequence the
AI saw would depend on frame rate — and Time Trial ghosts replay recorded inputs
through a simulation that must land in the same place every time. **Sound would
have silently desynced the game.** Ambience carries its own seeded mulberry32,
touched by nothing else. Verified: zero `Math.random` calls across a scheduled
minute, and the same seed gives the same sequence twice.

### Smoke cannot catch a bug in here

Worth recording. The first version threw `t is not defined` in two of eleven
voices, and **smoke passed anyway** — `Audio.update` returns early unless the
audio context is actually `running`, which it never is in headless Chrome. The
43 checks say nothing about audio at all. Only a harness that stubs the context
and drives the scheduler directly can see this code, which is exactly what the
music and material harnesses already do.

## The sound of speed (Phase 11)

The most-repeated complaint about this game is that **it does not feel fast
enough**, and the constraint on fixing it is that the number may not change. So
the feeling has to come from somewhere that is not the number, and audio is one
of the two big levers — the camera is the other.

The diagnosis is short. **Everything was linear in speed.** Engine gain, tyre
level, filter cutoff: all straight lines from a crawl to flat out. A straight
line is exactly what does not read as fast, because the top third of the range
sounds like the middle third with a little more of it. Worse, the bottom of the
line was never quiet — the engine idled at 0.035 and topped out at 0.085, so
going slowly and going quickly were 8 dB apart and both of them were *on*.

Four changes, and the first one is most of it.

### 1. Speed is a curve, not a number

Every voice that carries speed now rises with a power above one, and they are
different powers on purpose:

| voice | goes with | why |
| --- | --- | --- |
| wind | speed **cubed** | roughly what aerodynamic noise really does |
| tyre roar | speed **squared** | contact noise against load |
| tyre grain | speed^1.6 | texture, so it arrives before the wind |
| engine gain | speed^1.35 | the constant presence, so the mildest curve |
| engine cutoff | speed^1.3 | opens late and fast: a dull crawl is what makes an open throttle bright |

The endpoints did not move. Plastic still idles at 62 Hz and tops out at 272,
its cutoff still runs 600 to 2100, so every number in the material table above
is still true. **Only the shape between them changed**, and the shape was the
problem.

Measured off the channel, driving the real code with a recording context:

| | crawl (5% speed) | flat out | swing |
| --- | --- | --- | --- |
| before | 0.038 | 0.101 | **8.4 dB** |
| after | 0.018 | 0.248 | **22.9 dB** |

And the voices you can hear went from **two to five**. Counted directly: at 5%
speed exactly one voice is above the audibility floor, and flat out exactly five
are. A crawl is an engine; top speed is a stack.

### 2. The top of the range is a place

`whine` is a narrow resonant band that **does not exist below 82% of the car's
maximum** and swells in as the square of what is left. Arriving at top speed is
therefore a new sound rather than the end of a ramp.

It is a band of noise and not a tone, deliberately: a pure high sine is a
stinger, and the accessibility list above is explicit that the audience includes
noise-sensitive players.

It also tells the truth about surfaces. Loose sand caps you at 0.68 and a sock
at 0.70, so **on those surfaces the whine can never happen** — the cue is not
"you are going fast", it is "this car has nothing left", and a surface that
holds you down silently withholds it.

Untouched by material, for the same reason the clean-landing chime is: a car
whose ceiling sounded duller than everyone else's would be a car penalised for
what it is made of.

### 3. A boost punches, and then settles

The old boost was a step: +40 Hz while boosting, back to normal after. A step is
not a shove.

`ch.kick` spikes to 1 on the boost edge and decays over about a third of a
second, lifting the engine pitch, the engine's cutoff, the engine's level, the
wind and the boost air **together** — and letting all five fall back to a
sustained value that is still clearly boosted. `ch.rel` does the mirror image
when the boost ends, dipping below the normal note before recovering, so a boost
has a shape at both ends instead of a step at one.

Measured at 70% speed, frame by frame:

| | Hz |
| --- | --- |
| normal, no boost | 209.0 |
| **peak of the punch** (frame 0) | **345.2** |
| settled, still boosting | 255.0 |
| the dip as it lets go | 181.3 |

The punch overshoots the sustained boost note by **90 Hz** and is gone in under
0.4 s. **None of this can live in a one-shot**, and that is the structural
point: what has to settle is the *continuous* voice, and a fire-and-forget blip
has no way to touch one. `boostFire()` got better too — a hard bright tick so
there is an actual transient, a sawtooth sweeping up through the engine's own
register, and a broad noise shove behind both — but the shape is in the channel.

### 4. The engine bends under drift

Slipping wheels outrun the road, so the note goes **up** while the car is
sideways and falls as it hooks up. At 60% speed a full drift lifts the engine
from 188 to 208 Hz.

This does not break the rule that engine pitch tracks speed. At any fixed slip
the curve is still monotone in speed, and the bend is itself proportional to
speed — so a stationary spin sits at exactly 62 Hz and cannot wail, which is
checked.

### What none of this is

A stat. Nothing above touches speed, grip, acceleration or any target time, and
`calibrate.sh` measures all **22 events at 0.00** against baseline. The whole
module still runs once per rendered frame and never from inside the fixed step.

## The floor is a material, not a boolean (Phase 11)

The art pass gave every world its own floor — woven pile on the rug, grains in
the sandpit, varnished boards under the stunt deck, glazed tile and wiped
laminate in the kitchen. Audio was still asking **one question**: is the surface
called `rugGrass`? Two tyre notes, for eleven entries in `BR.SURFACES` across
four worlds. Driving on floorboards sounded exactly like driving on carpet.

`BR.Audio.SURFACES` is the twin of `Renderer.roadTile` / `groundTile` /
`drawZones`, and twelve floors come out of it. Four columns, each doing one job:

| | roar (lowpass) | grain (bandpass) | flutter | slide |
| --- | --- | --- | --- | --- |
| printed rug road | 640 Hz x 0.62 | 1100 Hz x 0.45 | 0.26 | 0.86 |
| bare pile | **380 x 1.05** | **420 x 1.35** | **0.58** | 0.72 |
| varnished boards | 1500 x 1.05 | 1800 x 0.95 | 0.30 | 1.25 |
| wiped laminate | 1700 x 0.78 | 2200 x 0.60 | 0.10 | 1.30 |
| moulded plastic | **1950 x 0.70** | **2400 x 0.52** | **0.08** | **1.35** |
| a sock | **240 x 0.90** | **300 x 1.10** | 0.44 | **0.55** |
| newsprint | 1150 x 0.85 | **3100 x 1.00** | 0.46 | 1.15 |
| cardboard | 820 x 0.80 | 1450 x 0.80 | 0.24 | 0.95 |
| loose grains | 780 x 1.10 | 2700 x 1.15 | 0.07 | 0.88 |
| packed grains | 1020 x 0.80 | 2400 x 0.78 | 0.09 | 0.92 |
| deep loose sand | 560 x **1.55** | 1700 x **1.45** | **0.05** | 0.80 |
| standing water | 900 x 1.30 | **3400 x 1.25** | 0.22 | 1.10 |

Two voices rather than one, because a single filter cannot be both "dark and
loud" (pile) and "bright and hard" (boards) while also being a bed that swells
with speed. **`flutter` is how lumpy the floor is** — a sine LFO on the roar's
gain running 3.5 Hz at a crawl to 30 Hz flat out, because the strongest thing a
wheel does that says *fast* is go round. Woven pile thumps at 0.58; moulded
plastic barely moves at 0.08; sand has no period in it at all.

**`slide` closes an argument this document already made.** Drift is kept out of
the material table on the grounds that "that is tyres against the *floor*: it
belongs to the surface, not to the shell" — which is an argument that it belongs
*here*, and it was nowhere. A slide on varnished boards now squeals at 1.25x and
the same slide into a sock is a dull 0.55x scrub. Still identical across all four
materials, which is checked.

### The stunt deck was driving under the rug's name

The stunt tracks declare **no surfaces at all**, so they inherit `rugRoad` and
`rugGrass` from the defaults. A moulded plastic deck on a bedroom floor, named
after a carpet. The physics is right and the name is wrong, and audio must not
repeat the name's mistake just because it reads the same field — so the generic
names resolve through `WORLD_FLOOR`, which mirrors the renderer's branch one for
one. `hardwood` splits the same way the renderer splits it: bare pine under the
bed, wiped laminate on the kitchen table.

### The rule the table may not break

Leaving the road has to be unmistakable in **every** world. Not in a fixed
direction — newspaper on laminate is *brighter* than the laminate, and pretending
otherwise would be a lie about paper — but big. Measured as the summed absolute
log2 distance across all four columns:

| | transition | distance |
| --- | --- | --- |
| town rug | printed road to bare pile | **4.49** |
| stunt | moulded to boards | 2.25 |
| sandbox | sand to deep loose | 1.98 |
| kitchen | laminate to newsprint | **1.92** |

The smallest is nearly two octaves-equivalent of change. All twelve floors are
pairwise distinct on the same metric, and ten world/surface combinations produce
**nine** different tyre notes — the pair that collapses is the boards under the
bed and the boards under the stunt deck, which the renderer draws with the same
tile and calls "one room". Two entries agreeing there is the two tables
agreeing, not a gap in this one.

**And the sand blends**, exactly as its handling does. `SandGrid` already says
how packed a patch of ground is, so reading the same grid makes the racing line
you wore into the sandpit over three laps *audible*: the roar corner walks 780 to
1020 Hz as the line packs down.

### Do the two material tables agree?

`Renderer.MATERIAL_LOOK` is the visual twin of `Audio.MATERIALS`, and they were
authored a phase apart by different passes. Checked rather than assumed:

- **The specular order and the brightness order are identical** — wood, metal,
  plastic, wind-up in both. The shiniest car on the grid is the brightest, and it
  is the same car (the lithographed tin wind-up).
- **Wood is the floor of both.** No shine, no mould seam, no grain; darkest
  cutoff, lowest Q, no ring, no clatter, shortest tail.
- **Plastic has the clearest parting line and the most clatter**, which is the
  same fact twice: a seam is where the halves of a cheap moulding meet, and loose
  pieces are what comes off it.
- **Metal swings widest between its lit and unlit faces and rings longest.**
- Nothing with no visible seam clatters.

One column disagrees and it is left alone: the visual `wear` order says wood is
the most battered and metal second, while the audio `detune` order says the
wind-up tin is by far the most out of tune with itself and metal the least. They
are not measuring the same thing — chipped paint is not rattling apart, and a
die-cast car chips readily while staying one solid piece. Forcing them into
agreement would make both worse.

## Under the bed is a box (Phase 11)

Open question 4, resolved: **yes**, and one filter was the right guess.

`06_World_Town_Rug.md` calls the under-bed run "the first use of a lighting state
as gameplay". A lighting state the ear cannot hear is half a state. The car goes
somewhere genuinely different — enclosed, boards below, a mattress a car's length
overhead — and everything about it changed except the sound.

A **1600 Hz lowpass across the driver's own channel**, plus a 14% level lift,
swept in over a quarter of a second. The lift is not compensation, it is the
effect: inside a box everything is *closer* as well as duller, and a muffle that
only takes away reads as the volume going down.

### It has to be on the channel, not the bus

In split screen one player can be under the bed while the other is out on the
rug. On the master bus the effect would follow the wrong car, and it would take
the countdown, the music and the house down with it. On a channel it muffles that
driver's engine, their tyres, their collisions and the rivals near *them*, which
is exactly the set of things that would really be in the box with them.

The filter is built at startup, wide open at 16 kHz, rather than inserted when a
car first drives under. Reconnecting a running graph clicks — the reason the
channels are built up front in the first place — and that click would land on the
exact frame the effect exists to sell. 16 kHz rather than the top of hearing
because the highest frequency this module ever synthesises is the music shaker's
6.5 kHz corner, so at 16 kHz the filter is transparent to everything the game can
make.

### It must not eat the surface cue it sits on

The muffle dulls the boards; the boards are also the cue that says you have left
the rug. Computed rather than hoped, from the biquad response at 48 kHz:

| | attenuation at 1600 Hz / Q 0.7 |
| --- | --- |
| the boards' 1800 Hz grain | -4.2 dB |
| the rug's 420 Hz grain | -0.03 dB |
| the top octave (6 kHz) | **-14 dB** |

So the *contrast* between the two — the part carrying the information — actually
widens, from 3.1 dB to 7.3 dB, under an effect that takes 14 dB off the top of
everything. Character sits on top of readability, again.

### Which rectangles are "under the bed"

Not `surface === 'hardwood'`: the kitchen's laminate is `hardwood` too, and it is
a table, not a bed. It is a geometric test on a town-rug track — every hardwood
zone, **plus any cloth zone lying on one**. A sock under the bed has to muffle
with the boards around it, because un-muffling for the eight car lengths of a
sock and back would pump; a place mat somewhere else on the rug is not under
anything and must not. Cached on the arena, so it costs one point-in-rect test
per player per frame.

## The vrrrooom is punctuation, not texture (Phase 11)

Open question 1, resolved: **both, and that is what decides it.** It is core
identity *and* it wears thin, and those are not in conflict because they are
claims about different durations.

**It is identity.** This document ranks scale reinforcement second of three jobs
— *"small plastic sounds in a large room; audio carries the toy fantasy as much
as the art does"* — and a child imitating an engine is the strongest scale cue a
synthesiser has access to. It says "these are toys and somebody is playing with
them" in under a second, and no arrangement of filtered noise can say it at all.

**And it wears thin immediately if it is the engine.** A vocal layer under ninety
seconds of racing is the textbook novelty outstaying its welcome. Worse, it would
break job *one*: a voice lives between roughly 200 Hz and 3 kHz, which is
precisely where the drift note (1200-2600), the tyre grain (300-3400) and both
boost cues (560-1320) already are. A continuous vroom would mask the sounds this
document says must never be cut.

**So it is kept, and taken off the engine.** A frame is established once, not
continuously, and there is exactly one moment in a race that belongs to the child
rather than to the driver: the shove at the start. It fires **once per race, on
GO**, centred like every other race-wide sound, over an empty mix, on the one
frame nobody is yet reading gameplay from sound. Verified across three
consecutive races: three vrooms, one each.

It is built as a **mouth, not an engine**, and that is what separates it from the
engine voice it sits next to:

- a sawtooth larynx that rises and settles (132 to 232 to 178 Hz) rather than
  tracking anything
- a **trill**: an LFO gating the source at 34 Hz slowing to 19 as the breath runs
  out. Fluttering lips are a periodic gate, and this one is a graph for the usual
  reason — nothing on the render clock can machine-gun it
- two bandpass **formants** sweeping down together, 480 to 300 and 1600 to 820,
  which is a vocal tract going from an open [r] to a closed [m]. The word ends
  humming, because "vrrrooom" does
- a short noise puff at the front: the lips before the voice

The honest caveat: it is synthesised from published formant values and it cannot
be *listened to* from here. The structure is right; the taste is untested.

## Verified with a running context, and a negative control

Three traps have now bitten this file, and the harness is built around all three.

1. **Parameter automation does not advance under headless virtual time.** So the
   sound is not measurable here at all. What is, and what a mix decision actually
   *is*, is the value the code writes: a recording `AudioContext` where every
   node remembers every write and the clock is a number the harness owns, then
   the real `updateChannel` driven with synthetic cars. Every number in the
   tables above came out of that.

2. **`Audio.update` returns early unless the context is `running`**, so a whole
   broken path can sit behind it and smoke walks straight past — that is exactly
   how two of eleven ambience voices shipped throwing `t is not defined`. So the
   harness *first* runs four real races, one per world, against a genuinely
   running context, and asserts that `updateChannel` was reached **5,280 times**.
   Without that count the run would look identical whether the code executed or
   not. It then calls all fifteen one-shots, all four materials' collisions and
   landings, and **every one of the fourteen ambience voices individually**,
   because a voice that never fires is a voice that does not exist.

   That assertion earned its keep on the first run: the harness was reading
   `ev.track` where the events data says `ev.trackId`, so it raced zero worlds
   and every check downstream of it was vacuous. It reported 0 calls and said so.

3. **Sounds are edge-detected off counters once per rendered frame.** The two new
   modulations — the tyre flutter and the vroom's lip trill — are both LFOs, for
   the same reason the wind-up ratchet is one. An LFO runs on the audio thread
   and cannot drift with frame rate or fire twice in a frame where the fixed step
   ran twice.

**120 checks pass. The negative control fails 18 of them.** Flattening every
surface to one floor, removing the wind and the whine, and disabling the
under-bed test — which is the module as it was — breaks "leaving the road is big
in every world", "floorboards do not sound like carpet", "the stunt deck is not
the rug road", "the top half of the range carries most of the change", "flat out
is five audible voices" and thirteen more. Without that run, a harness that
quietly measured nothing would have looked exactly like this one.
