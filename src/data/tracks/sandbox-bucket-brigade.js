/* =============================================================================
   TRACK — Bucket Brigade  (Sandbox Speedway)
   =============================================================================
   The sandbox tracks so far are about the ground. This one is about what is
   standing on it.

   THE IDEA IS OBSTACLES ON THE LINE. Every other track puts its props at the
   edges, where they punish a mistake. Here the buckets are IN THE ROAD, on the
   quickest way round, each one just past a spade propped up as a ramp.

   The ramps sit on the line too, so being launched over a bucket is the DEFAULT
   — measured, 267 of 275 bucket encounters are over the top. Going around is
   what happens when you arrive too slowly to trigger the ramp at all
   (rampMinSpeedFrac), and it costs you the packed sand you spent a lap wearing
   in. Speed is the thing that keeps you out of trouble, which is a pleasant
   inversion for a track full of obstacles.

   ONE THING THAT FELL OUT OF THE RULES RATHER THAN BEING DESIGNED: a car in the
   air packs no sand, so every jump leaves a permanent hole in the worn line.
   This track finishes a race at 0.95 coverage with 5 breaks where Dune Dash
   reaches 1.00 with none — the flight paths are visible in the ground.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['sandbox-bucket-brigade'] = {
  id: 'sandbox-bucket-brigade',
  name: 'Bucket Brigade',
  world: 'sandbox',
  laps: 3,

  /* Long flowing curves rather than hairpins — the difficulty here is vertical,
     and asking for both at once is asking too much. */
  control: [
    [1050, 2900],
    [2350, 3050],
    [3550, 2900],
    [4300, 2450],
    [4450, 1820],
    [4000, 1250],
    [3150,  980],
    [2200,  960],
    [1350, 1200],
    [ 820, 1720],
    [ 760, 2350],
  ],

  sandy: true,
  baseSurface: 'sand',
  offSurface:  'looseSand',

  /* Trodden-over sand, paler where everything has been dragged about. */
  groundColour: '#cdae72',
  roadColour:   '#bd9a5f',
  weaveColour:  'rgba(126,98,60,0.10)',
  haze: '238,218,178',

  roadWidth: 290,
  kerbHeight: 22,          // low berms — the obstacles are the difficulty
  gateOverhang: 205,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [1700, 2990],

  shortcut: {
    fromXY: [4300, 2450],
    toXY:   [4000, 1250],
    surface: 'sand',
    exitBoost: 0.4,
  },

  zones: [
    { type: 'puddle', x: 2820, y: 2940, w: 260, h: 170 },   // t 0.20
    { type: 'puddle', x:  800, y: 1500, w: 220, h: 200 },   // t 0.85
  ],

  /* Spades propped against buckets.

     RECTANGLES ARE ANCHORED AT THE CORNER, not the centre (Collision.checkRamps
     tests x <= v.x <= x + w). These are placed by taking the centreline point
     and subtracting half the box, with the short side along the direction of
     travel and the long side spanning the road. Authored as centres, all three
     sat beside the road and never fired once.

     LAUNCH 650 IS MEASURED. Flight envelopes off this ramp at racing speed:

         launch   apex   lands at   clears a 46-high bucket between
           380     33      119      never
           470     52      142      51 and 94
           560     74      169      38 and 135
           650    100      189      28 and 165
           760    138      195      24 and 198

     At the first-guess 470 the window is 43 units wide and the car is back on
     the ground by 142 — with the buckets originally placed 260 out, no jump
     could have cleared one at any speed. 650 gives a 137-unit window to land
     the timing in. The lip is 80% through the box (rampLipFrac), so each
     bucket sits about 95 units past that: the middle of the window. */
  ramps: [
    // t 0.10, road at (1995,3042) heading east
    { x: 1947, y: 2902, w: 96, h: 280, rise: [ 1, 0], launch: 650 },
    // t 0.55, road at (3583,1074) heading west
    { x: 3535, y:  934, w: 96, h: 280, rise: [-1, 0], launch: 650 },
    // t 0.70, road at (2157,966) heading west
    { x: 2109, y:  826, w: 96, h: 280, rise: [-1, 0], launch: 650 },
  ],

  boostPads: [
    { x: 3010, y: 2910, w: 185, h: 165, gain: 0.4 },   // t 0.22
    { x:  655, y: 1940, w: 175, h: 185, gain: 0.4 },   // t 0.90
  ],

  hazards: [
    { type: 'toyTrain', period: 10.5, r: 54, h: 42,
      path: [[2750, 1750], [2750, 2400], [2750, 1750]] },
  ],

  /* THE PAIRS. Each bucket sits just past a ramp, in the road rather than
     beside it. clearAt matches the height so a launched car passes over and a
     grounded one does not. The blocks and spades at the edges are ordinary
     scenery. */
  /* Each bucket sits on the centreline ~95 units past its ramp's lip — the
     middle of the measured clearance window, so the jump has room to be
     slightly early or slightly late. */
  props: [
    { type: 'bucket', x: 2119, y: 3044, r: 34, h: 46, rot: 0.2, clearAt: 46 },
    { type: 'bucket', x: 3459, y: 1048, r: 34, h: 46, rot: 1.4, clearAt: 46 },
    { type: 'bucket', x: 2033, y:  992, r: 34, h: 46, rot: 2.2, clearAt: 46 },

    { type: 'spade',  x: 4480, y: 2200, r: 30, h: 26, rot: 1.1 },
    { type: 'block',  x:  700, y: 2650, r: 30, h: 36, rot: 0.6 },
    { type: 'spade',  x: 2600, y:  830, r: 28, h: 24, rot: 2.7 },
  ],

  decoration: [
    { type: 'building', x: 2150, y: 1900, w: 460, h: 360, colour: '#ab8752' },
    { type: 'building', x: 3300, y: 2250, w: 340, h: 280, colour: '#bb9762' },
    { type: 'pond',     x: 1500, y: 2200, w: 380, h: 260, colour: '#4f9fc0' },
  ],

  /* bkt-, not bb- : Bedside Boulevard already owns bb-1..4, and every piece in
     the game shares one id space (BR.allPieceIds). A clash would have let one
     track's piece silently mark another's as found, and quietly shrunk the set
     the Heirloom needs. */
  collectibles: [
    { id: 'bkt-1', cut: 0.5 },
    { id: 'bkt-2', t: 0.30, offset:  0.75 },
    { id: 'bkt-3', t: 0.62, offset: -0.75 },
    { id: 'bkt-4', t: 0.88, offset:  0.75 },
  ],
};
