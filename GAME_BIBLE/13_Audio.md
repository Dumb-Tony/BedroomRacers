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

| Material | Character |
| --- | --- |
| Die-cast metal | Heavier, ringing impacts, low rattle |
| Glossy plastic | Light, hollow, clattering |
| Wood | Dull knock, no ring |
| Wind-up | Mechanical ratchet under the engine |

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
| Opponents | **One shared proximity layer**, never a voice each |
| Music | Sparse procedural toy percussion over a pulse, scheduled against the audio clock. Lifts slightly on the final lap |

### Two rules the implementation obeys

**Audio never runs inside the fixed simulation step.** It observes state and
detects edges once per rendered frame. Firing from inside the step would trigger
sounds several times per frame and couple audio to physics, breaking the
determinism that Time Trial ghosts depend on (`15_Save_System.md`).

**The player is always louder than the field.** Six cars each with a full engine,
drift and collision voice would overwhelm the mix and the CPU, so opponents
collapse into a single layer whose level tracks the nearest car.

Measured over a full race: 121 oscillators created in ~93 seconds, about 1.3 per
second. One-shots are not leaking voices.

### Still missing

Environmental sound, per-vehicle material character, and the announcer. Music is
procedural rather than composed — it works, but a real soundtrack is a different
job.

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
2. Do opponents get full audio, or a reduced mix? Full audio for six cars is likely
   unmanageable.
3. Music per world, or per track? Per world is cheaper and probably sufficient.
4. Does the under-bed section (`06_World_Town_Rug.md`) get muffled audio processing?
   It would be a strong effect for one filter.

## Related

`02_Mechanics.md` — the verbs audio must communicate.
`11_UI.md` — callouts and accessibility.
`12_Art_Guide.md` — matching visual effects.
