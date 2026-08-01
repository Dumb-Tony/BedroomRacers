/* =============================================================================
   TRACK — Tide Pool  (Sandbox Speedway)
   =============================================================================
   The hose has been left running for an hour and the low end of the pit has
   flooded. This is the last sandbox track and the one that argues with the
   world's own mechanic.

   THE IDEA IS THAT YOU CANNOT WEAR A LINE THROUGH WATER. Compaction only
   happens on 'sand' — main.js packs nothing under a car crossing a puddle, and
   nothing ever will, because water is not a surface that firms up. Tide Pool
   puts SEVEN puddles across the racing line rather than beside it, so the line
   you spend three laps wearing in arrives in pieces with gaps you have to
   re-find every lap.

   That needed no new system. It is the compaction rule already in the code,
   read the other way round and then built a track around.

   The puddles are placed so the fast line clips them and a wider, slower line
   misses them. Grip 0.42 against 0.97 on packed sand is a big enough gap that
   the choice is real rather than obvious.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['sandbox-tide-pool'] = {
  id: 'sandbox-tide-pool',
  name: 'Tide Pool',
  world: 'sandbox',
  laps: 3,

  control: [
    [1000, 2950],
    [2300, 3100],
    [3500, 2950],
    [4250, 2500],
    [4400, 1880],
    [3950, 1300],
    [3100, 1020],
    [2150,  990],
    [1300, 1250],
    [ 800, 1800],
    [ 740, 2420],
  ],

  sandy: true,
  baseSurface: 'sand',
  offSurface:  'looseSand',

  /* Wet sand: darker, greyer, and cooler than anywhere else in the sandbox.
     The haze goes with it — this corner of the pit is in shade. */
  groundColour: '#a89372',
  roadColour:   '#93805f',
  weaveColour:  'rgba(70,74,80,0.13)',
  haze: '196,196,190',

  roadWidth: 300,
  kerbHeight: 20,
  gateOverhang: 210,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [1650, 3030],

  shortcut: {
    fromXY: [4250, 2500],
    toXY:   [3950, 1300],
    surface: 'sand',
    exitBoost: 0.4,
  },

  /* ON the line, not beside it. This is the track. Sized so a committed driver
     can straddle the edge of one rather than being forced through the middle. */
  /* ON the line, not beside it — placed from measured centreline points, and
     corner-anchored like every rectangle in a track definition. Sized so a
     committed driver can straddle the edge of one rather than being forced
     through the middle. */
  zones: [
    { type: 'puddle', x: 1800, y: 2990, w: 300, h: 200 },   // t 0.10
    { type: 'puddle', x: 2780, y: 2960, w: 260, h: 210 },   // t 0.20
    { type: 'puddle', x: 4110, y: 2050, w: 210, h: 280 },   // t 0.40
    { type: 'puddle', x: 3470, y: 1040, w: 280, h: 200 },   // t 0.55
    { type: 'puddle', x: 2440, y:  875, w: 300, h: 190 },   // t 0.65
    { type: 'puddle', x: 1100, y: 1185, w: 220, h: 250 },   // t 0.80
    { type: 'puddle', x:  620, y: 1975, w: 200, h: 260 },   // t 0.90
  ],

  ramps: [
    // t 0.70, road at (2108,996) heading west
    { x: 2063, y: 856, w: 90, h: 280, rise: [-1, 0], launch: 440 },
  ],

  boostPads: [
    { x: 3290, y: 2900, w: 180, h: 165, gain: 0.4 },   // t 0.25
    { x: 4260, y: 1640, w: 165, h: 180, gain: 0.4 },   // t 0.45
  ],

  hazards: [
    { type: 'toyTrain', period: 10, r: 54, h: 42,
      path: [[3000, 1600], [3000, 2300], [3000, 1600]] },
  ],

  props: [
    { type: 'bucket', x: 2650, y: 2600, r: 32, h: 44, rot: 0.5 },
    { type: 'spade',  x: 4450, y: 2750, r: 28, h: 24, rot: 1.7 },
    { type: 'bucket', x: 1450, y: 1700, r: 30, h: 42, rot: 2.3 },
    { type: 'block',  x: 3600, y: 1750, r: 32, h: 38, rot: 0.9 },
    { type: 'spade',  x:  980, y: 2850, r: 28, h: 24, rot: 2.9 },
  ],

  /* The flooded end, and what is left of the castles that were there first. */
  decoration: [
    { type: 'pond',     x: 2400, y: 1700, w: 620, h: 460, colour: '#3f8ba8' },
    { type: 'pond',     x: 3300, y: 2250, w: 300, h: 240, colour: '#4795b0' },
    { type: 'building', x: 1750, y: 2350, w: 320, h: 250, colour: '#8d7a58' },
  ],

  collectibles: [
    { id: 'tp-1', cut: 0.5 },
    { id: 'tp-2', t: 0.26, offset: -0.75 },
    { id: 'tp-3', t: 0.58, offset:  0.75 },
    { id: 'tp-4', t: 0.86, offset: -0.75 },
  ],
};
