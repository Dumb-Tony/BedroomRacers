/* =============================================================================
   TRACK — Bedside Boulevard
   =============================================================================
   06_World_Town_Rug.md, track 3: a longer circuit that leaves the rug and runs
   beneath the bed. Rug-to-hardwood transition, dust and socks under there, a
   cardboard tunnel shortcut.

   THIS TRACK EXISTS TO PROVE THE PIPELINE. It was authored entirely as data —
   control points, a width and a feature list — with no change to any system.
   That is the test 16_Content_Pipeline.md set: if adding a track means editing
   src/systems/, the pipeline has failed.

   It is also the first track to use surfaces beyond rug. Hardwood is fast and
   slippery, so the long north side rewards smooth hands and punishes panic —
   the lesson track 1 never teaches.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['bedside-boulevard'] = {
  id: 'bedside-boulevard',
  name: 'Bedside Boulevard',
  world: 'town-rug',
  laps: 3,

  /* Longer and more technical than the rookie circuit: a long fast north side
     under the bed, a tight switchback at the west end, and a slow technical
     run back along the rug. */
  control: [
    [1000, 3050],
    [2600, 3150],
    [3900, 2950],
    [4700, 2500],
    [4950, 1850],
    [4600, 1300],
    [3800, 1020],
    [2700,  900],
    [1700,  980],
    [1150, 1250],
    [1350, 1750],
    [1900, 1980],
    [1750, 2450],
    [1150, 2650],
  ],

  roadWidth: 260,
  kerbHeight: 22,
  gateOverhang: 210,
  checkpointEvery: 6,
  gridSlots: 6,

  finish: [1900, 3090],

  /* ── Under the bed ───────────────────────────────────────────────────────
     Hardwood: 12% faster, and grip drops from 1.00 to 0.78. Entering it at the
     speed the rug allowed is exactly how you end up in the skirting board. */
  zones: [
    { type: 'hardwood', x: 2500, y: 780, w: 2100, h: 560 },
    { type: 'hardwood', x: 4200, y: 1200, w: 700,  h: 700 },
    // Socks. Soft, slow, and right on the racing line out of the fast section.
    { type: 'blanket',  x: 3350, y: 820,  w: 240,  h: 220 },
    { type: 'blanket',  x: 4520, y: 1620, w: 220,  h: 240 },
  ],

  /* Cardboard tunnel: cuts the west switchback. */
  shortcut: { fromT: 0.66, toT: 0.79, surface: 'bookCover', exitBoost: 0.4 },

  ramps: [
    { x: 2180, y: 2980, w: 90, h: 230, rise: [1, 0], launch: 460 },
  ],

  boostPads: [
    { x: 4740, y: 2280, w: 170, h: 170, gain: 0.4 },
    { x: 1420, y: 1080, w: 170, h: 170, gain: 0.4 },
  ],

  /* Two hazards on different periods, so they drift in and out of phase and
     the track never feels memorised after one lap. */
  hazards: [
    { type: 'toyTrain', period: 8.0,  r: 50, h: 40,
      path: [[3200, 640], [3200, 1420], [3200, 640]] },
    { type: 'toyTrain', period: 11.5, r: 44, h: 36,
      path: [[4300, 2750], [4980, 2750], [4300, 2750]] },
  ],

  props: [
    { type: 'block',  x: 2260, y: 1180, r: 32, h: 38, rot: 0.3 },
    { type: 'crayon', x: 4880, y: 1520, r: 32, h: 26, rot: 1.1 },
    { type: 'crayon', x: 1520, y: 2180, r: 30, h: 24, rot: 2.2 },
    { type: 'block',  x: 3050, y: 3220, r: 30, h: 36, rot: 0.8 },
    { type: 'block',  x: 3140, y: 3300, r: 26, h: 30, rot: 1.7 },
    { type: 'crayon', x: 900,  y: 1550, r: 30, h: 24, rot: 0.4 },
    { type: 'crayon', x: 2050, y: 2300, r: 28, h: 24, rot: 2.9 },
  ],

  decoration: [
    // The bed, filling the middle-north of the room.
    { type: 'building', x: 2600, y: 1420, w: 1500, h: 900, colour: '#4a4038' },
    { type: 'building', x: 2150, y: 2450, w: 420,  h: 320, colour: '#c4553f' },
    { type: 'building', x: 2900, y: 2500, w: 500,  h: 360, colour: '#4f7fbf' },
    { type: 'pond',     x: 3600, y: 2450, w: 420,  h: 300, colour: '#3f7fa8' },
  ],
};
