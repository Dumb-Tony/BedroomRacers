/* =============================================================================
   TRACK — Dresser Drop  (Plastic Stunt Track)
   =============================================================================
   The first track that leaves the floor.

   07_World_Stunt_Track.md called elevation "the single largest technical
   question in the project" and blocked all content on deciding a model first.
   The answer is option 1 — DISCRETE LEVELS WITH A CONTINUOUS RENDER HEIGHT —
   and this track is the thing that had to exist to prove it.

   The lap: away from the skirting board, up the ramp onto the dresser, a long
   run along the top, then the drop back down and UNDER the section you were
   just on. That crossover is the whole point. It is the one thing a flat track
   cannot express, and it is the reason the level index exists: the kerbs of the
   upper deck must not be walls to a car passing beneath them.

   Nothing about the driving changed. Grip, steering, drift and gravity are the
   same numbers they were on the bedroom rug — `level` decides what can collide
   with what and `z` decides where it draws. That separation is the reason this
   world cost a track file and a few dozen lines instead of a rewrite.

   ── legal note, from the bible ──────────────────────────────────────────────
   Evoke modular plastic stunt track without copying branded designs, connector
   shapes, logos or colour trade dress. The originality bar is HIGHER here than
   anywhere else in the game. Hence: violet and teal rather than the obvious
   orange and blue, and no connector geometry is drawn at all.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['stunt-dresser-drop'] = {
  id: 'stunt-dresser-drop',
  name: 'Dresser Drop',
  world: 'stunt',
  laps: 3,

  /* A FIGURE-EIGHT, not a ring.

     This matters and it caught me out: on a simple convex loop the elevated
     stretch and the floor stretch are on opposite sides of the circuit and
     never meet, so there is nothing to pass over and the level index is never
     exercised. A crossover needs the path to actually double back across
     itself, which means a figure-eight.

     The two strands cross around (2600, 2050): once early in the lap on the
     floor, once past halfway up on the dresser. */
  control: [
    [2400, 2300],   // t~0.00 — through the crossing, at floor level
    [3300, 1750],
    [4200, 1900],
    [4500, 2600],
    [3900, 3150],
    [3000, 3050],
    [2750, 2250],   // t~0.50 — back through the crossing, up on the dresser
    [2100, 1500],
    [1200, 1450],
    [ 700, 2050],
    [ 900, 2800],
    [1700, 3000],
  ],

  /* ── ELEVATION ───────────────────────────────────────────────────────────
     `t` is the fraction round the lap, `z` the render height, `level` the deck
     for collision. Level steps at the key; z eases between keys.

     Author the level change at the key where a climb STARTS, so the ramp
     belongs to the deck it is heading for and cannot collide with what it is
     about to pass over.

     The crossing is at t~0.02 and t~0.52. The first must be on the floor and
     the second up in the air, or there is no crossover to speak of.

         0.00  floor — the first pass through the crossing
         0.14  start climbing
         0.28  up on the dresser, 300 units
         0.62  still up there; t~0.52 passes OVER the floor strand
         0.72  dropping back down
         0.90  floor again, running to the line */
  elevation: [
    { t: 0.00, z:   0, level: 0 },
    { t: 0.14, z:   0, level: 1 },   // ramp begins; already deck 1
    { t: 0.28, z: 300, level: 1 },
    { t: 0.62, z: 300, level: 1 },
    { t: 0.72, z:   0, level: 0 },   // dropping back to the floor
    { t: 0.90, z:   0, level: 0 },
  ],

  /* Moulded plastic, not printed rug. Flat bright colour with no texture,
     because injection-moulded ABS has none. */
  groundColour: '#2f2a33',       // the bedroom floor, in shadow under the track
  roadColour:   '#7b5cc4',       // violet track piece
  weaveColour:  'rgba(255,255,255,0.05)',
  skirtColour:  'rgba(52,38,86,0.92)',   // the underside of the moulding
  haze: '92,78,124',

  roadWidth: 300,
  kerbHeight: 34,                // moulded side rails, taller than a rug kerb
  gateOverhang: 200,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [1650, 2960],

  /* No shortcut. The crossover is already the thing this track is asking you
     to read, and a second route through it would make the level test ambiguous
     before it has been proven once. */

  zones: [],

  /* The launch along the top of the dresser. Corner-anchored and placed from a
     measured centreline point — t 0.60, road at (2046,1475) heading west, up on
     deck 1. TrackManager lifts it to the deck height automatically. */
  ramps: [
    { x: 1998, y: 1325, w: 96, h: 300, rise: [-1, 0], launch: 560 },
  ],

  /* ── THE LOOP ────────────────────────────────────────────────────────────
     On the floor, on the long run out of the crossing where there is room to
     have built up speed. t 0.08, road at (3055,1843) heading roughly east.

     Arrive under minSpeed and you are simply not taken round — you drive along
     the floor beneath it. The loop is a reward for carrying speed, not a tax on
     arriving slowly (Rails.js). */
  rails: [
    {
      x: 2985, y: 1743, w: 140, h: 200,
      dir: [0.89, -0.45],          // the road's heading at t 0.08
      radius: 115,                 // 230 tall
      /* Ground covered, which is now also what PACES the ride (Rails.js). At
         150 the loop parked the car for 1.8 seconds and was a net time loss, so
         the fastest line through here was to arrive too slow to be allowed on
         it. 380 against 410 units of measured straight road at this mouth. */
      length: 380,
      width: 150,
      minSpeed: 230,
      exitBoost: 0.35,
    },

    /* ── THE CORKSCREW ────────────────────────────────────────────────────
       Up on the dresser, along the long northern run — t 0.36, road at
       (3697,3186) heading west. Two turns over 420 units.

       Where the loop turns about the lateral axis and pitches the car over
       backwards, this one turns about the travel axis and rolls it, spiralling
       sideways through the middle and returning to the line at the end. Same
       rail, same capture, same release; only the axis differs (Rails.frameAt).

       Shorter and lower than the loop because it sits on the raised deck
       already, and 300 units up is high enough to be reading. */
    {
      x: 3627, y: 3086, w: 140, h: 200,
      dir: [-0.996, 0.087],        // the road's heading at t 0.36
      kind: 'corkscrew',
      turns: 2,
      radius: 82,
      length: 420,
      width: 150,
      minSpeed: 210,
      exitBoost: 0.3,
    },

    /* ── THE MAGNETIC BOOSTER ─────────────────────────────────────────────
       On the floor, on the long straight out of the start/finish line and into
       the crossing. Mouth centred on the measured centreline point at index
       127, (1972,2785), heading -49 degrees; the ride runs 520 units to
       (2305,2385), which is centreline index 133.5. Measured deviation from
       the road at the midpoint of that chord: 6 units, against a half-width of
       150 — the straightest stretch on the track, which is what a fixed
       direction needs.

       WHY HERE AND NOT ON THE DRESSER. Three reasons, in order of how much
       they cost to learn:

         - The straight is 1100 units long and the car is already at its cap
           for all of it, so a booster is the only thing that can make it
           faster. Somewhere the car is slowing anyway, a ride that holds speed
           through a corner would be worth far more, and would also delete the
           corner.
         - A rail takes its deck height from the first car to ride it
           (Rails.check sets `deckZ` at capture), so a booster on the raised
           deck would draw on the bedroom floor until someone rode it. The
           corkscrew already has that quirk; a second one is not worth adding.
         - It ends 1050 units short of the loop's mouth. Chaining the throw
           straight into the loop was tempting and is wrong: two rides back to
           back is 2.1 seconds of not driving, and the rule that keeps rails
           tolerable is that the ride is short (Rails.js).

       NO METER (`exitBoost: 0`), unlike the loop and the corkscrew. The throw
       IS the reward, paid immediately. A booster that also filled the meter
       would be a boost pad with extra steps, which is the thing this was built
       not to be.

       The mouth is 150 square, which on this diagonal grabs anything within
       106 units of the line — the whole width the AI ever uses here, measured
       at -98 on the lap out of the grid and -20 on the flying laps. */
    {
      x: 1897, y: 2710, w: 150, h: 150,
      dir: [0.6398, -0.7685],      // the chord to centreline index 133.5
      kind: 'booster',
      length: 520,
      width: 190,                  // a magnetised track SECTION, not a groove:
                                   // wider than the loop's ribbon, and leaving
                                   // 55 units of violet either side so it reads
                                   // as a strip laid on the road rather than as
                                   // the road
      minSpeed: 200,               // lower than the loop's 230 — a booster is
                                   // help rather than spectacle — but not zero:
                                   // a car nudged onto it while spun should not
                                   // be straightened out and fired down the road
      exitBoost: 0,
      /* HARD ALTERNATING BANDS, dark against bright, which is what a magnet
         looks like and — more to the point — is nothing like a boost pad. The
         first version was flat mid-teal, and rendered it sat 800 units from the
         pad at t 0.88, which the renderer draws in mint (#4fd8a8). Two
         differently-shaped teal patches on the same stretch of floor is exactly
         the readability the legal note's palette was supposed to buy. */
      colour:     '#17414a',
      altColour:  '#31c7bd',
      railColour: '#9ff5ea',
    },
  ],

  boostPads: [
    { x: 1322, y: 2938, w: 185, h: 165, gain: 0.4 },   // t 0.88, on the floor
    { x: 4230, y: 1700, w: 165, h: 185, gain: 0.4 },   // t 0.20, on the climb
  ],

  hazards: [],

  /* All three sit beside FLOOR sections. A prop takes the height of the nearest
     centreline point, so one placed next to the raised deck hangs in mid-air
     off the side of it. */
  props: [
    { type: 'block',  x: 1900, y: 3150, r: 32, h: 38, rot: 0.4 },
    { type: 'crayon', x:  600, y: 2700, r: 30, h: 26, rot: 1.6 },
    { type: 'block',  x: 2250, y: 2500, r: 30, h: 36, rot: 2.2 },
  ],

  /* The furniture the track is built over. Drawn on the floor, so the raised
     deck reads as passing above it. */
  decoration: [
    { type: 'building', x: 2100, y: 1500, w: 900, h: 700, colour: '#413a4d' },
    { type: 'building', x: 3300, y: 2100, w: 420, h: 360, colour: '#4a4257' },
  ],

  collectibles: [
    { id: 'sd-1', t: 0.36, offset:  0.7 },    // up on the dresser
    { id: 'sd-2', t: 0.55, offset: -0.7 },
    { id: 'sd-3', t: 0.82, offset:  0.7 },    // down under the crossover
    { id: 'sd-4', t: 0.05, offset: -0.7 },
  ],
};
