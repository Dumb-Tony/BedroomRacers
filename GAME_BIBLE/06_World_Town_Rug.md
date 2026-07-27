# 06 — World: Town Rug Bedroom

The flagship environment. This world carries the entire first release; everything
else is expansion.

## Concept

A child's bedroom, inspired by the colourful town-map rugs common in bedrooms and
playrooms during the 1990s. The rug is printed with roads, buildings, parking
spaces, railways, rivers, houses, schools and fire stations. **These printed
elements are the track network.**

The scale makes toy vehicles feel small while keeping the rug readable. Furniture
looms at the edges of the arena; the rug is the world, and the room is the horizon.

> **Legal note.** Inspired by nostalgic play rugs, never copying a specific product.
> All layouts, building designs, colour schemes and printed iconography must be
> original. No recognisable brand shapes, logos or trade dress. This is a real risk
> — the reference material for this genre is heavily branded.

## Visual identity

- Bright green rug areas
- Dark printed roads with worn white markings
- Colourful simplified buildings
- Painted intersections
- Parking lots
- Rivers and bridges
- Railway lines
- Slightly worn rug fibres
- Plastic and die-cast toy cars
- Warm bedroom lighting
- Large furniture around the arena edges

The rug should look **used** — faded print, a frayed corner, a coffee-cup ring, a
patch worn smooth by years of play. Pristine reads as a product shot; worn reads as
someone's childhood.

## Landmarks

Bed, toy box, bookshelf, dresser, night-light, pillow tunnel, block castle, toy
train set, stuffed animal pile, scattered crayons, building bricks, board-game
pieces, socks, plastic dinosaurs, model buildings, pencil bridge, paper ramp.

Landmarks serve navigation, not just decoration. Every one should be identifiable
from across the room and usable in a sentence like "turn left at the dinosaur".

## Lighting states

The same room at different times, reusing all geometry:

| State | Mood | Use |
| --- | --- | --- |
| **Sunny afternoon** | Bright, warm, high contrast | Default, tutorial tracks |
| **Bedtime lamp** | Warm pools of light, long shadows | Mid-game events |
| **Night-light** | Dim, blue-shifted, small bright halo | Under-bed and secret events |
| **Rainy day** | Cool, flat, window rain shadows | Variety |
| **Holiday string lights** | Coloured point lights | Seasonal / special events |

Lighting states are a cheap content multiplier — a night version of a known track
plays differently without new geometry. Use deliberately, not to pad the roster.

---

## Tracks

### 1. Rug Route Rookie Circuit
**Purpose:** Tutorial and introductory race. This is the first thing anyone plays.

A simple loop around the centre of the town rug.

- Wide roads, gentle turns
- One small book ramp
- Basic boost pads
- Minimal hazards
- Clear signage

Teaches steering, drifting, boosting, collision recovery, crossing the finish line.

Tutorial delivery should be **diegetic** — printed road signs and rug arrows rather
than modal popups. A player who ignores every prompt must still be able to finish.

### 2. School Run Sprint
**Theme:** Point-to-point from the rug's neighbourhood to the printed school.

- Tight residential turns
- Pencil obstacles
- Shortcut through a parking lot
- Moving toy school bus hazard
- Ruler jump near the finish

First track with a genuine risk/reward shortcut. The parking lot is faster but the
bus patrols it.

### 3. Bedside Boulevard
**Theme:** A longer circuit leaving the rug and running beneath the bed.

- Rug-to-hardwood transition
- Low-light section under the bed
- Dust-ball hazards
- Lost toy collectibles
- Socks that slow vehicles
- Shortcut through a cardboard tunnel

The surface change is the lesson: hardwood is faster but grip drops sharply. Also
the first use of a lighting state as gameplay — the under-bed section is genuinely
darker.

### 4. Block City Grand Prix
**Theme:** A technical circuit through a city built from building blocks.

- Narrow streets, sharp corners
- Falling block hazards
- Elevated bridge section
- Destructible barriers
- Multiple route choices

The most technically demanding track. Falling blocks are the strongest candidate for
needing real rigid-body simulation — see the escape hatch in `03_Driving_Physics.md`.

### 5. Train Crossing Trouble
**Theme:** A race repeatedly crossing a working toy train set.

- Timed railway crossings
- Moving train hazard
- Train tunnel shortcut
- Railway bridge jump
- Risk-and-reward alternate routes

The train must be **strictly periodic** so players can learn its timing. The tunnel
shortcut is only viable in the gap between passes — that tension is the track.

### 6. Toy Box Descent
**Theme:** A downhill race starting on top of an open toy box, ending on the rug.

- Steep cardboard ramps
- Falling toy hazards
- Plastic track segments
- Large final jump
- Fast, chaotic pacing

Point-to-point, not a loop. The showpiece track — most likely to need elevation
support beyond simple floor levels (`05_Tracks.md`, open question 2).

---

## Build order

Only track 1 is in scope for the MVP. Track 1 as a polished vertical slice is
Phase 3. Tracks 2–6 are Phase 5 content.

Suggested order after track 1: **2 → 3 → 5 → 4 → 6**, easiest technical
requirements first. Block City and Toy Box Descent both need systems that don't
exist yet.

## Region mapping

The track-select screen shows the bedroom from above, with physical areas as
regions (`11_UI.md`):

| Region | Tracks |
| --- | --- |
| Town rug | 1, 2 |
| Under the bed | 3 |
| Toy box | 6 |
| Desk | Future |
| Window area | Future |
| Closet | Future |

## Related

`05_Tracks.md` — track anatomy and the authoring checklist.
`12_Art_Guide.md` — how this world is drawn.
`13_Audio.md` — its musical identity.
