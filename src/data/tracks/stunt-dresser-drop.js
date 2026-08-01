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
      radius: 115,                 // 230 tall; ~2.1s at racing speed
      length: 150,                 // ground covered, so the exit clears the entry
      width: 150,
      minSpeed: 230,
      exitBoost: 0.35,
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
