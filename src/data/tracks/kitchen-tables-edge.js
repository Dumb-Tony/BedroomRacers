/* =============================================================================
   TRACK — Table's Edge  (Kitchen Table)
   =============================================================================
   The second table track, and a deliberate division of labour with the first.

   Breakfast Run is wide, has one gap in the barrier, and puts it on the outside
   of a corner you are already braking for. It exists to teach that the ground
   runs out.

   This one is 280 wide instead of 320, and it has TWO gaps. One is the same
   idea sharpened — the east end, 1319 units of it against Breakfast Run's 1257,
   with the sugar slick moved out of the run-off and onto the braking zone. The
   other is the whole point of the track: 1051 measured units of missing kerb
   down the OUTSIDE OF THE FRONT STRAIGHT, the fastest ground in the game, taken
   flat out on the run to the flag.

   Nothing here is new. Both gaps are the `openEdges` list Shelf Run already
   used for a hole in a plastic rail, on a deck declared the way Shelf Run
   declares its shelf. What changed is where they are pointed: Shelf Run's gap
   punishes a mistake at the far end of the lap, and these two sit on the two
   places you most want to be flat out.

   ── EVERYTHING VISIBLE MUST SIT ON THE DECK ─────────────────────────────────
   As Breakfast Run. Props, hazard paths, pads and pieces are all authored
   against measured centreline points at about 0.62 of the half width, because
   the renderer fills only the band between the kerbs and anything beyond it is
   drawn hanging over the kitchen floor.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['kitchen-tables-edge'] = {
  id: 'kitchen-tables-edge',
  name: "Table's Edge",
  world: 'kitchen',
  laps: 3,

  /* Measured lap: 10187 units, 850 shorter than Breakfast Run and quicker by
     more than that, because on laminate it is grip rather than distance that
     costs the time. */
  control: [
    [1300, 2800],   //  0  the front straight, heading +x. THE KERB STOPS HERE
    [2700, 2900],
    [3850, 2790],
    [4500, 2360],   //  3  turn-in for the east end
    [4700, 1720],   //  4  the east end — the second gap
    [4320, 1200],   //  5
    [3500,  980],   //  6  the back side, tighter than Breakfast Run's
    [2500,  900],   //  7
    [1700, 1080],   //  8
    [1150, 1450],   //  9
    [ 480, 1880],   // 10  out west, hard against the corner of the table
    [ 700, 2400],   // 11
    [1000, 2680],   // 12
  ],

  /* Same table, same height, same one flat deck. See the note in
     kitchen-breakfast-run.js: the elevation model is being used for altitude
     rather than for shape, because Recovery.check ignores any deck at or below
     FLOOR_Z and a fall is the entire identity of this world. */
  elevation: [
    { t: 0.00, z: 420, level: 0 },
    { t: 0.50, z: 420, level: 0 },
  ],

  baseSurface: 'hardwood',
  offSurface:  'paper',

  groundColour: '#7f8a93',
  roadColour:   '#e3d3b0',
  weaveColour:  'rgba(52,60,68,0.11)',
  skirtColour:  'rgba(146,104,58,0.92)',
  haze: '226,220,206',

  roadWidth: 280,            // 40 narrower than Breakfast Run
  kerbHeight: 26,
  gateOverhang: 210,
  checkpointEvery: 6,
  gridSlots: 8,

  /* At the FAR end of the front straight, on purpose. The grid is laid nine
     centreline points back from the line, so putting the flag here means the
     field starts past the gap and meets it for the first time at the end of
     lap one, strung out. A starting field jostling for room alongside a
     four-hundred-unit drop is not a first corner, it is a cull. */
  finish: [3600, 2800],

  /* ── THE TWO GAPS ────────────────────────────────────────────────────────
     Lap fractions run from control[0], not from the finish line.

       0.015 → 0.115   the front straight, outer. 1051 measured units of
                       nothing, and because the flag is at the far end of this
                       straight it is the last thing between you and the lap
                       time rather than the first thing after the lights.
       0.330 → 0.440   the east end, outer. 1319 units, and the sugar is on the
                       entry rather than beside it.

     Both are OUTER only. Every inner kerb on the track is intact, so there is a
     complete lap available that never goes near an edge. It is just the slow
     one. */
  openEdges: [
    { from: 0.015, to: 0.115, side: 'outer' },
    { from: 0.330, to: 0.440, side: 'outer' },
  ],

  /* ── The alternate route ─────────────────────────────────────────────────
     No `shortcut` here either, and for the reason recorded at length in
     kitchen-breakfast-run.js: a cut polygon lies outside the inner kerb, the
     renderer fills only between the kerbs, and on a deck 420 units up that
     makes a shortcut an invisible bridge over a hole.

     The east end carries the same two-line trade as Breakfast Run — sugar
     across the entry and a place mat down the inside, against clean laminate,
     the strongest boost pad on the track and a toy piece out past where the
     kerb stops. This track adds a second trade on the front straight, where the
     crumb drift sits down the INSIDE: the safe half of the fastest road in the
     game is also the draggy half.

     MEASURED, same test as Breakfast Run — seeded, three seeds, quickest taken,
     control column repeating to 0.00:

       free line   95.47
       inside      +2.07   (and twelve impacts: the short line here is not
                            merely slow, it is full of things)
       outside     +0.07

     2.00 seconds between the two lines, against Breakfast Run's 0.38. That gap
     between the two tracks is the point of having both: the first one makes the
     edge tempting, this one makes it the only way round that is worth
     anything. */

  /* Corner-anchored rectangles. See the note in Breakfast Run.

     The difference from Breakfast Run is placement, not vocabulary: the sugar
     moves from beside the line to across the braking zone of a corner whose
     outer kerb is missing, and the crumbs move from a verge to the inside of a
     straight, where avoiding them means moving toward the edge. */
  zones: [
    // Spilled sugar, across the entry to the east end. 0.42 grip, and what it
    // takes the grip away from is the corner you cannot run wide in.
    { type: 'puddle',   x: 4320, y: 2180, w: 300, h: 300 },
    // Place mat down the inside of that same corner, covering the whole short
    // line. The answer to the sugar, and it costs 30% of your top speed.
    { type: 'blanket',  x: 4380, y: 1530, w: 230, h: 660 },
    // Crumbs down the inside of the front straight — the safe half of the road
    // is also the draggy half.
    { type: 'rugGrass', x: 1900, y: 2700, w: 900, h: 200 },
    // A spread newspaper on the back side, tight in.
    { type: 'paper',    x: 2760, y: 940,  w: 460, h: 200 },
    // Place mat at the west end, where the road is already hard against the
    // corner of the table.
    { type: 'blanket',  x: 480,  y: 1600, w: 300, h: 300 },
  ],

  /* A wooden spoon lying across the back side. Travel there is -x. */
  ramps: [
    { x: 3020, y: 800, w: 90, h: 250, rise: [-1, 0], launch: 460 },
  ],

  boostPads: [
    // Onto the front straight: a full meter handed over 300 units before the
    // kerb stops.
    { x: 1080, y: 2650, w: 190, h: 180, gain: 0.40 },
    // East end, OUTER, inside the gap — the reward half of the trade.
    { x: 4575, y: 1323, w: 180, h: 190, gain: 0.55 },
    // Off the back side, on the run down to the west end.
    { x: 1661, y: 1045, w: 180, h: 180, gain: 0.40 },
  ],

  /* Two, on different periods so they drift out of phase and the lap never
     feels memorised after one go — the trick Bedside Boulevard uses. The tea
     tray slides across the back side; the cutlery drawer is at the west end,
     out where the road is already tight against the corner. Both paths run
     kerb to kerb and no further, for the reason in Breakfast Run. */
  hazards: [
    { type: 'toyTrain', period: 7.5,  r: 48, h: 38,
      path: [[2662, 981], [2664, 813], [2662, 981]] },
    { type: 'toyTrain', period: 10.5, r: 44, h: 34,
      path: [[681, 1802], [589, 1662], [681, 1802]] },
  ],

  props: [
    { type: 'spade',  x: 2817, y: 2986, r: 30, h: 18, rot: 2.1 },   // t 0.15 out
    { type: 'crayon', x: 3522, y: 2769, r: 32, h: 26, rot: 0.4 },   // t 0.23 in
    { type: 'block',  x: 4199, y: 1234, r: 28, h: 34, rot: 1.4 },   // t 0.48 in
    { type: 'bucket', x: 3473, y: 887,  r: 34, h: 44, rot: 0.0 },   // t 0.55 out
    { type: 'crayon', x: 2202, y: 1024, r: 30, h: 24, rot: 1.7 },   // t 0.68 in
    { type: 'block',  x: 884,  y: 1693, r: 30, h: 36, rot: 0.6 },   // t 0.83 in
  ],

  decoration: [
    { type: 'building', x: 2200, y: 1600, w: 1100, h: 700, colour: '#6d7680' },
    { type: 'building', x: 4700, y: 2500, w: 620,  h: 640, colour: '#8a6a45' },
    { type: 'pond',     x: 900,  y: 3000, w: 760,  h: 420, colour: '#9a5f4a' },
  ],

  collectibles: [
    { id: 'te-1', t: 0.83, offset: -0.75 },   // tight at the west end
    { id: 'te-2', t: 0.07, offset:  0.75 },   // hard against the missing kerb on
                                              // the front straight
    { id: 'te-3', t: 0.39, offset:  0.75 },   // and again at the east end
    { id: 'te-4', t: 0.60, offset: -0.75 },   // on the newspaper. The one that
                                              // is not a dare.
  ],
};
