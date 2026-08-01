/* =============================================================================
   TRACK — The Big Dig  (Sandbox Speedway)
   =============================================================================
   Dune Dash teaches you that sand packs down. This one charges you for it.

   THE IDEA IS WIDTH. Dune Dash is 320 units across and deliberately open, so a
   worn line is one option among several. The Big Dig is 230 — barely wider than
   two sand cells — dug down between trench walls you cannot climb. There is
   almost exactly one line, everyone is packing the same one, and running wide to
   pass costs you loose sand at the worst possible moment.

   That inverts the Dune Dash lesson without inventing a single new system.

   Measured: the line actually completes LATER here, not sooner — coverage runs
   0.94 / 0.98 / 1.00 by lap against Dune Dash's 0.96 / 1.00 / 1.00, because the
   drivers' lateral wander is a bigger fraction of a narrow road. The point is
   not that the groove arrives quickly. It is that there is nowhere else to be
   while you wait for it, and running wide to pass costs you loose sand at the
   worst possible moment.

   Trench walls are 60 high with no clearAt, so the ramp cannot post you out of
   the circuit — the one place this track is generous.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['sandbox-big-dig'] = {
  id: 'sandbox-big-dig',
  name: 'The Big Dig',
  world: 'sandbox',
  laps: 3,

  /* Tighter and more angular than Dune Dash. Two genuine hairpins at the
     eastern end, and one long northern drag to recover on. */
  control: [
    [1100, 2820],
    [2400, 2960],
    [3500, 2820],
    [4150, 2380],
    [4200, 1780],
    [3700, 1330],
    [2850, 1200],
    [1950, 1330],
    [1350, 1760],
    [ 880, 2260],
  ],

  sandy: true,
  baseSurface: 'sand',
  offSurface:  'looseSand',

  /* Dug out and damp — a shade darker than the dry surface of Dune Dash, so the
     two sandbox tracks do not read as the same place twice. */
  groundColour: '#b2925a',
  roadColour:   '#a07e4a',
  weaveColour:  'rgba(96,72,44,0.13)',
  haze: '214,192,150',

  roadWidth: 230,          // narrow ON PURPOSE — see the header
  kerbHeight: 60,          // trench walls, not berms. No clearAt: unjumpable.
  gateOverhang: 175,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [1800, 2900],

  /* A trench wall that has already given way. Cuts the second hairpin. */
  shortcut: {
    fromXY: [4200, 1780],
    toXY:   [2850, 1200],
    surface: 'sand',
    exitBoost: 0.35,
  },

  /* Water collecting in the bottom of the dig, where water does collect.
     Trenches leave nowhere to go around them, so these are smaller than Dune
     Dash's — an unavoidable hazard has to be survivable.

     Corner-anchored, like every rectangle in a track definition. Placed against
     measured centreline points rather than eyeballed. */
  zones: [
    { type: 'puddle', x: 3880, y: 2490, w: 180, h: 150 },   // t 0.35
    { type: 'puddle', x: 1525, y: 1460, w: 160, h: 170 },   // t 0.80
  ],

  /* A plank over the trench on the northern drag. t 0.675, heading west. */
  ramps: [
    { x: 2528, y: 1105, w: 90, h: 220, rise: [-1, 0], launch: 420 },
  ],

  boostPads: [
    { x: 1400, y: 2830, w: 175, h: 160, gain: 0.4 },   // t 0.05
    { x: 4130, y: 2180, w: 160, h: 175, gain: 0.4 },   // t 0.40
  ],

  /* The digger that made all this, still working. Slower period than Dune
     Dash's because a narrow trench gives you less room to time it. */
  hazards: [
    { type: 'toyTrain', period: 11.5, r: 56, h: 44,
      path: [[3300, 2880], [3300, 2560], [3300, 2880]] },
  ],

  props: [
    { type: 'bucket', x: 2050, y: 2900, r: 32, h: 44, rot: 0.3 },
    { type: 'spade',  x: 4020, y: 2540, r: 30, h: 26, rot: 1.9 },
    { type: 'bucket', x: 3200, y: 1150, r: 30, h: 42, rot: 1.1 },
    { type: 'block',  x: 1150, y: 1900, r: 32, h: 38, rot: 0.8 },
    { type: 'spade',  x: 1000, y: 2600, r: 28, h: 24, rot: 2.4 },
  ],

  /* Spoil heaps and the pit they came out of. */
  decoration: [
    { type: 'building', x: 2300, y: 1850, w: 520, h: 420, colour: '#94743f' },
    { type: 'building', x: 3050, y: 2200, w: 300, h: 260, colour: '#a4844f' },
    { type: 'pond',     x: 1750, y: 2350, w: 340, h: 240, colour: '#4a90ad' },
  ],

  collectibles: [
    { id: 'bd-1', cut: 0.5 },
    { id: 'bd-2', t: 0.14, offset: -0.7 },
    { id: 'bd-3', t: 0.48, offset:  0.7 },
    { id: 'bd-4', t: 0.78, offset: -0.7 },
  ],
};
