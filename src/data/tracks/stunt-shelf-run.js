/* =============================================================================
   TRACK — Shelf Run  (Plastic Stunt Track)
   =============================================================================
   The second stunt track, and a deliberate division of labour with the first.

   Dresser Drop was carrying the whole world on its own: a loop, a corkscrew, a
   climb and a crossover, with about 15% of its lap spent on rails. That is a
   lot for one track and it left nothing for a second to do.

   So this one goes the other way. ONE ride, and everything else is height:
   THREE decks rather than two — the floor, the dresser, and the shelf above it
   — which means the crossing here is not one storey but two. The floor strand
   passes under the top deck with well over four hundred units of air above it,
   and you drive both of them within twenty seconds of each other.

   Where Dresser Drop is the trick track, this is the tall one.

   ── legal note, still binding ───────────────────────────────────────────────
   Original palette and no connector geometry (07_World_Stunt_Track.md). Teal
   and slate here rather than Dresser Drop's violet, so the two read as
   different sets of pieces from the same box.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['stunt-shelf-run'] = {
  id: 'stunt-shelf-run',
  name: 'Shelf Run',
  world: 'stunt',
  laps: 3,

  /* A figure-eight again, because a crossover needs the path to double back
     across itself and a convex loop never does (learned the hard way on
     Dresser Drop). Different proportions: one long lobe out east, one tight
     one west, so it does not drive like the same circuit. */
  control: [
    [2500, 1900],
    [3200, 2500],
    [4100, 2750],
    [4700, 2200],
    [4450, 1400],
    [3600, 1100],
    [3000, 1450],
    [2100, 2350],
    [1350, 2950],
    [ 700, 2500],
    [ 800, 1750],
    [1600, 1450],
  ],

  /* ── ELEVATION, three decks ──────────────────────────────────────────────
     Level steps at each key; z eases between them. Author the level change at
     the key where a climb STARTS, so a ramp belongs to the deck it is heading
     for and cannot collide with what it passes over.

         0.00  floor
         0.16  start climbing to the dresser
         0.30  deck 1, 210 up
         0.44  climbing again, to the shelf
         0.56  deck 2, 440 up — the high run
         0.70  the long drop, all the way back to the floor
         0.86  floor again, running to the line */
  elevation: [
    { t: 0.00, z:   0, level: 0 },
    { t: 0.16, z:   0, level: 1 },
    { t: 0.30, z: 210, level: 1 },
    { t: 0.44, z: 210, level: 2 },
    { t: 0.56, z: 440, level: 2 },
    { t: 0.70, z: 440, level: 0 },
    { t: 0.86, z:   0, level: 0 },
  ],

  groundColour: '#26313a',       // the floor, in shadow under the shelf
  roadColour:   '#2f8f9e',       // teal track piece
  weaveColour:  'rgba(255,255,255,0.045)',
  skirtColour:  'rgba(20,54,62,0.92)',
  haze: '64,96,110',

  roadWidth: 300,
  kerbHeight: 34,
  gateOverhang: 200,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [1500, 1500],

  zones: [],

  /* One ride, on the floor stretch where there is room to have built speed.
     Placed against a measured centreline point — see the note in
     16_Content_Pipeline.md about corner-anchored rectangles. */
  rails: [
    {
      // t 0.13, road at (3597,2677) heading east, on the floor and well clear
      // of the crossing — a ring under the shelf would fight it for space.
      x: 3527, y: 2577, w: 140, h: 200,
      dir: [0.944, 0.331],
      radius: 120,
      length: 150,
      width: 150,
      minSpeed: 230,
      exitBoost: 0.35,
      colour: '#37a8b8', altColour: '#2b8593', railColour: '#b6e6ee',
    },
  ],

  ramps: [],

  boostPads: [
    { x: 2765, y: 2119, w: 175, h: 165, gain: 0.4 },   // t 0.05, the run in
    { x: 4300, y: 1600, w: 165, h: 180, gain: 0.4 },   // t 0.30, on the dresser
  ],
  hazards: [],

  props: [
    { type: 'block',  x: 2300, y: 1250, r: 32, h: 38, rot: 0.4 },
    { type: 'crayon', x:  620, y: 2900, r: 30, h: 26, rot: 1.6 },
  ],

  /* The furniture it is all built over. */
  decoration: [
    { type: 'building', x: 3300, y: 1500, w: 900, h: 800, colour: '#33404a' },
    { type: 'building', x: 1100, y: 1900, w: 700, h: 700, colour: '#3a4854' },
  ],

  collectibles: [
    { id: 'sr-1', t: 0.34, offset:  0.7 },   // on the dresser
    { id: 'sr-2', t: 0.60, offset: -0.7 },   // up on the shelf
    { id: 'sr-3', t: 0.90, offset:  0.7 },   // back on the floor
    { id: 'sr-4', t: 0.08, offset: -0.7 },
  ],
};
