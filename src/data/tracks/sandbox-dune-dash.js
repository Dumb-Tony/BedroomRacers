/* =============================================================================
   TRACK — Dune Dash  (Sandbox Speedway)
   =============================================================================
   The first track outside the bedroom, and the introduction to sand.

   18_Roadmap.md chose this world over the plastic stunt track for Phase 6
   because it is FLAT: no elevation model, no loops, no banking, and the existing
   waypoint AI and collision work unchanged. That made it a real test of the
   modular-world architecture rather than a rewrite wearing a new coat.

   THE SAND IS THE POINT. Loose sand is slow and vague; driving over it packs it
   down, and packed sand is nearly as quick as road. So lap one is a scramble and
   by lap three there is a fast line that the drivers themselves wore in
   (08_World_Sandbox.md, SandGrid.js).

   Deliberately wide and open. A player learning that the ground changes under
   them does not also need narrow. The Big Dig and Bucket Brigade are where that
   gets tight.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['sandbox-dune-dash'] = {
  id: 'sandbox-dune-dash',
  name: 'Dune Dash',
  world: 'sandbox',
  laps: 3,

  /* A rolling loop with one long drag down the south side, so there is
     somewhere for a worn-in line to actually pay off. */
  control: [
    [1000, 2900],
    [2500, 3050],
    [3700, 2850],
    [4350, 2350],
    [4500, 1700],
    [4100, 1150],
    [3300,  880],
    [2300,  820],
    [1400, 1020],
    [ 850, 1500],
    [ 700, 2150],
  ],

  /* ── the sandbox, not the bedroom ────────────────────────────────────── */
  sandy: true,
  baseSurface: 'sand',       // compactable, see SandGrid
  offSurface:  'looseSand',  // off the dug track. A mistake, not a shortcut.
  groundColour: '#c8a86a',   // dry sand
  roadColour:   '#b8945a',   // the dug course, slightly damper
  weaveColour:  'rgba(120,92,58,0.10)',   // wind ripples rather than rug weave

  /* Outdoors and bright — the first world not lit by a bedroom lamp.
     08_World_Sandbox.md open question 5 asked whether the game's look survives
     daylight. This is the experiment. */
  haze: '236,214,170',

  roadWidth: 320,            // wide: learning the sand is enough to learn
  kerbHeight: 20,            // low sand berms rather than kerbs
  gateOverhang: 220,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [1800, 2980],

  /* Cuts the inside of the eastern sweep. Same rule as the rug: the road makes
     a detour and the shortcut is not following it. */
  shortcut: {
    fromXY: [4350, 2350],
    toXY:   [4100, 1150],
    surface: 'sand',
    exitBoost: 0.4,
  },

  /* ── Standing water ──────────────────────────────────────────────────────
     Grip 0.42 — less than half the road. The hose has been left on and these
     are where it pooled. Placed just off the natural line, so they punish a
     lazy entry rather than sitting in the middle of the course. */
  zones: [
    { type: 'puddle', x: 2600, y: 3020, w: 300, h: 190 },
    { type: 'puddle', x: 3980, y: 1420, w: 220, h: 260 },
    { type: 'puddle', x: 1080, y: 1420, w: 260, h: 220 },
  ],

  /* A plank propped on a bucket. */
  ramps: [
    { x: 2900, y: 700, w: 90, h: 260, rise: [-1, 0], launch: 450 },
  ],

  boostPads: [
    { x: 1300, y: 2860, w: 190, h: 170, gain: 0.4 },
    { x: 4380, y: 1780, w: 170, h: 190, gain: 0.4 },
  ],

  /* A toy digger working the far side of the pit, on a strict period. */
  hazards: [
    { type: 'toyTrain', period: 9.5, r: 54, h: 42,
      path: [[3050, 1350], [3050, 2150], [3050, 1350]] },
  ],

  /* Buckets and spades, in place of crayons and blocks. */
  props: [
    { type: 'block',  x: 2450, y: 2600, r: 34, h: 40, rot: 0.4 },
    { type: 'block',  x: 3750, y: 2500, r: 30, h: 36, rot: 1.2 },
    { type: 'crayon', x: 4600, y: 1450, r: 32, h: 26, rot: 2.1 },
    { type: 'block',  x: 1900, y: 1150, r: 32, h: 38, rot: 0.7 },
    { type: 'crayon', x: 620,  y: 1850, r: 30, h: 24, rot: 1.5 },
    { type: 'block',  x: 1150, y: 3080, r: 28, h: 34, rot: 2.6 },
  ],

  /* Half-built castles in the middle of the pit. */
  decoration: [
    { type: 'building', x: 2200, y: 1700, w: 480, h: 380, colour: '#a8834e' },
    { type: 'building', x: 2900, y: 2300, w: 360, h: 300, colour: '#b8935e' },
    { type: 'pond',     x: 3500, y: 1750, w: 420, h: 300, colour: '#4f9fc0' },
  ],

  collectibles: [
    { id: 'sb-1', cut: 0.5 },
    { id: 'sb-2', t: 0.22, offset:  0.8 },
    { id: 'sb-3', t: 0.55, offset: -0.8 },
    { id: 'sb-4', t: 0.84, offset:  0.8 },
  ],
};
