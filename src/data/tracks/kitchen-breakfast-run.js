/* =============================================================================
   TRACK — Breakfast Run  (Kitchen Table)
   =============================================================================
   The introduction to the table, and to the drop.

   19_World_Kitchen_Table.md: this world is composed entirely out of parts that
   already existed. No new surface, no physics change, nothing added to
   TrackManager. Wiped laminate is `hardwood` — the fastest base surface in the
   game and the second least grippy — and the things left on the table after
   breakfast are `blanket`, `puddle`, `rugGrass` and `paper`, which between them
   already describe a place mat, a sugar slick, a crumb drift and a spread
   newspaper better than any new entry in BR.SURFACES would.

   THE EDGE IS THE POINT. The table is 420 units off the kitchen floor, and the
   barrier round it is whatever happens to be standing on it. Where nothing is
   standing, nothing stops you: `openEdges` takes the outer kerb away across the
   east end and Recovery.js does the rest. Measured: the car leaves the deck,
   drops the full 420, and is back on the road 2.02 seconds later with 30% of
   the speed it had. This track has ONE gap, because learning that the ground
   runs out is enough to learn at once. Table's Edge is where it gets serious.

   The other half of the world is grip. Laminate gives 0.78 against the rug's
   1.00 while carrying 12% more top speed, so the table is quick everywhere and
   trustworthy nowhere. The place mats invert it — 1.05 grip at 0.70 speed — so
   the only genuinely grippy ground on the track is also the slowest, and both
   mats sit on the INSIDE of the two end corners. That is this world's alternate
   route; the note on it is below.

   ── EVERYTHING VISIBLE MUST SIT ON THE DECK ─────────────────────────────────
   `Renderer.drawElevatedRoad` fills only the band between the two kerbs. Any
   prop, hazard, pad or piece further from the centreline than `roadWidth / 2`
   is drawn hanging in the air over the kitchen floor. The first pass of this
   track had all seven props and a whole hazard path out there, and every
   numeric check passed; it took rendering a frame and looking at it.
   Everything below is authored against MEASURED centreline points at about
   0.65 of the half width, and there is a harness that fails on anything that
   floats.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['kitchen-breakfast-run'] = {
  id: 'kitchen-breakfast-run',
  name: 'Breakfast Run',
  world: 'kitchen',
  laps: 3,

  /* Table-shaped: long down both sides, blunt at the ends. The south side is
     2650 units of almost no steering, which is what makes a low-grip
     surface worth having — there is somewhere to spend the extra top speed
     before it has to be given back at a corner. Measured lap: 11036 units. */
  control: [
    [1150, 2880],   //  0  the long south side, heading +x. Finish is along here
    [2550, 2980],
    [3800, 2880],
    [4560, 2480],   //  3  turn-in for the east end
    [4820, 1880],   //  4  the east end — THE OUTER KERB IS MISSING HERE
    [4460, 1300],   //  5
    [3760, 1060],   //  6
    [3220,  640],   //  7  north around the fruit bowl
    [2620, 1000],   //  8
    [1880,  900],   //  9
    [1140, 1060],   // 10
    [ 600, 1520],   // 11  the west end
    [ 470, 2220],   // 12
    [ 740, 2720],   // 13
  ],

  /* ── HEIGHT, and why a flat track declares any ──────────────────────────
     One level, one height: the table top is flat and always will be. The
     elevation model is not being used for shape here, it is being used for
     ALTITUDE — `Recovery.check` ignores any deck at or below FLOOR_Z (40),
     because leaving the road on the rug is a shortcut rather than a cliff. A
     table at 420 is unambiguously a cliff, and verified as one: a car driven
     off inside the gap falls; the identical car driven off at the same angle
     and the same speed where the kerb is intact does not.

     Declaring it also buys the look for free. TrackManager marks the track
     `elevated`, so the renderer draws a raised slab with edge banding down the
     sides and legs holding it up, over a floor a long way below. */
  elevation: [
    { t: 0.00, z: 420, level: 0 },
    { t: 0.50, z: 420, level: 0 },
  ],

  /* ── the table, not the bedroom ──────────────────────────────────────── */
  baseSurface: 'hardwood',   // wiped laminate: 1.12 top speed at 0.78 grip
  offSurface:  'paper',      // the morning's post, spread where nobody eats.
                             // 0.60 grip — off the road here is not slow, it is
                             // SLIPPERY, which is the worst way to leave a road
                             // that ends in a drop

  groundColour: '#7f8a93',   // the kitchen floor, four hundred units down
  roadColour:   '#e3d3b0',   // pale beech laminate under a kitchen light
  weaveColour:  'rgba(52,60,68,0.11)',   // grout lines on the floor tiles
  skirtColour:  'rgba(146,104,58,0.92)', // the table's edge banding, side on

  /* Bright, cool and overhead. The sandbox proved daylight works
     (08_World_Sandbox.md q5); this is the same argument indoors, under a bulb
     rather than the sun. */
  haze: '226,220,206',

  roadWidth: 320,            // wide, like Dune Dash: the surface is the lesson
  kerbHeight: 26,            // cereal boxes, the salt, a stack of side plates
  gateOverhang: 220,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [1900, 2925],

  /* ── THE GAP ─────────────────────────────────────────────────────────────
     1257 measured units of missing kerb round the outside of the east end,
     through the quickest corner on the lap. Lap fractions run from control[0],
     not from the finish line.

     The OUTSIDE only. The inside keeps its barrier, so there is always a line
     that costs nothing but time. */
  openEdges: [
    { from: 0.335, to: 0.425, side: 'outer' },
  ],

  /* ── THE ALTERNATE ROUTE, and the one this track does not have ───────────
     05_Tracks.md requires every track to offer a second way round, with real
     risk and a modest reward. This one does NOT use the `shortcut` chord, and
     that is a finding rather than an omission.

     A shortcut was authored first, across the mouth of a detour, exactly the
     way the rug and the sandbox do it. It measured well: 259 units saved
     against the rug's 334, which is worth around half a second. Then it was
     rendered and looked at, and the cut was a HOLE. `drawElevatedRoad` fills
     only the band between the two kerbs, and a cut polygon lies outside the
     inner kerb by construction. On the rug that is invisible, because the rug
     is underneath it. On a table there is nothing underneath, so the shortcut
     drew as an invisible bridge over four hundred units of air with its yellow
     dashed marker painted on the kitchen floor below. `shortcut` and
     `elevation` do not compose — see 19_World_Kitchen_Table.md.

     What replaces it is the mechanic this world owns. Through the east end
     there are two lines through the same gates:

       INSIDE   shorter, with the barrier intact behind it — and spilled sugar
                across the entry and a place mat down the whole length of it.
                Nothing can go wrong and nothing goes quickly.
       OUTSIDE  clean laminate at full speed along the missing kerb, with the
                strongest boost pad on the track and a toy piece out there. The
                price of getting it wrong is not a scrape, it is the floor.

     Both are on the deck, both are drawn, and both pass the same checkpoints,
     because both are inside the road.

     ── AND IT HAD TO BE MEASURED INTO EXISTENCE ─────────────────────────────
     tools/pays.sh exists because loops were a net time LOSS for three phases
     while every check said the feature worked. So the same question was asked
     of this: force the line inside, force it outside, and see which lap is
     quicker. Seeded, three seeds, quickest taken, with a control column that
     repeated to 0.00 so any delta is real.

     The first answer was that it was not a choice at all — 0.17s between the
     two, which is nothing. The mat alone could not do it, because a corner is
     grip-limited rather than speed-limited and `blanket` hands back in grip
     most of what its 0.70 cap takes. Adding the sugar to the inside entry, and
     lengthening the mat to cover the whole short line, moved it to:

       inside   +0.18 against the free line
       outside  -0.20 against the free line

     0.38s apart, and the edge line is now quicker than the line the AI picks
     for itself. Under the 0.5-1.5s a shortcut is supposed to be worth
     (05_Tracks.md), and deliberately so on the world's introductory track: the
     boost pad and the toy piece are the rest of the payment, and the lap time
     is the smaller half of the reason to go out there. Table's Edge measures
     2.00s on the same test. */

  /* ── What was left on the table ──────────────────────────────────────────
     RECTANGLES ARE CORNER-ANCHORED. x,y is the low corner, not the middle;
     TrackManager reports any that never reach the road.

     The sugar is `puddle`, 0.42 grip at 0.95 top speed: it takes almost nothing
     off the speedometer and almost everything off the steering. Placed off the
     natural line rather than across it, so it punishes a lazy entry rather than
     taxing everybody equally — Table's Edge is where it moves onto the line.

     Crumbs are `rugGrass`, 0.95 grip at 0.82. The only forgiving thing here. */
  zones: [
    // Place mat down the whole INSIDE of the east end — 820 units of it, not
    // the 460 it started as. See the note above: it has to cover the entire
    // short line or the geometry outruns the surface.
    { type: 'blanket',  x: 4400, y: 1450, w: 340, h: 900 },
    // Place mat, west end. No gap there, so this one is just a slow corner.
    { type: 'blanket',  x: 450,  y: 2020, w: 300, h: 420 },
    // Spilled sugar, wide on the exit of the south straight.
    { type: 'puddle',   x: 4180, y: 2680, w: 320, h: 260 },
    // Sugar again, tight on the run down the north side.
    { type: 'puddle',   x: 1760, y: 760,  w: 260, h: 240 },
    /* And once more, tight into the east end, ahead of the mat. Sugar and mat
       together are what make the short line the slow line: without this the
       inside and the outside measured 0.17s apart, which is not a choice. */
    { type: 'puddle',   x: 4240, y: 2250, w: 320, h: 340 },
    // Toast crumbs on the north side, where they are just weather.
    { type: 'rugGrass', x: 2300, y: 830,  w: 340, h: 240 },
  ],

  /* A spatula propped on a jam-jar lid, halfway down the south straight.
     Travel there is +x, so the wedge rises toward +x. */
  ramps: [
    { x: 2100, y: 2830, w: 90, h: 250, rise: [1, 0], launch: 470 },
  ],

  /* Three, and the middle one is the whole risk-and-reward argument: it sits on
     the OUTER side of the east end, inside the gap. Taking the safe line over
     the place mat means not getting it. */
  boostPads: [
    { x: 1300, y: 2830, w: 190, h: 170, gain: 0.40 },   // onto the long straight
    { x: 4833, y: 1828, w: 170, h: 190, gain: 0.55 },   // east end, OUTER,
                                                        // inside the gap. Worth
                                                        // more than the others
                                                        // because it is the
                                                        // only thing paying for
                                                        // the risk.
    { x: 2382, y: 995,  w: 170, h: 180, gain: 0.40 },   // off the north side
  ],

  /* The butter dish, sliding back and forth across the north side every time
     somebody leans on the table. Strict period, so it is learnable
     (05_Tracks.md). The path runs kerb to kerb and no further — 208 units,
     both ends measured to sit inside the deck, because a hazard that wanders
     off the table is a hazard drawn in mid-air. */
  hazards: [
    { type: 'toyTrain', period: 8.5, r: 50, h: 38,
      path: [[3029, 854], [2894, 695], [3029, 854]] },
  ],

  /* Breakfast things at toy-car scale. `bucket` is a mug, `crayon` a
     breadstick, `block` a sugar cube, `spade` a butter knife lying flat — low
     enough to drive over, which is what a spade already was.

     All seven stand ON the table, near a kerb rather than beyond it, at about
     0.65 of the half width. Tall ones are kept off the insides of corners
     (05_Tracks.md: at 17.5 degrees a prop hides ground behind it out to 2.83
     times its height). */
  props: [
    { type: 'spade',  x: 2181, y: 3074, r: 30, h: 18, rot: 1.9 },   // t 0.10 out
    { type: 'crayon', x: 2744, y: 2875, r: 32, h: 26, rot: 0.5 },   // t 0.15 in
    { type: 'block',  x: 3605, y: 2813, r: 28, h: 34, rot: 1.1 },   // t 0.23 in
    { type: 'bucket', x: 4133, y: 1066, r: 34, h: 44, rot: 0.0 },   // t 0.48 out
    { type: 'crayon', x: 1928, y: 796,  r: 30, h: 24, rot: 2.2 },   // t 0.70 out
    { type: 'block',  x: 1399, y: 1075, r: 30, h: 36, rot: 0.8 },   // t 0.75 in
    { type: 'crayon', x: 631,  y: 2396, r: 30, h: 24, rot: 2.7 },   // t 0.93 in
  ],

  /* Drawn on the FLOOR plane, not the table — decoration is never lifted onto a
     deck. On the stunt tracks that is how the furniture underneath gets drawn,
     and here it is exactly right: this is the kitchen you are driving above,
     and what you land on. */
  decoration: [
    { type: 'building', x: 4900, y: 1500, w: 620, h: 700, colour: '#8a6a45' },
    { type: 'building', x: 2400, y: 1500, w: 900, h: 800, colour: '#6d7680' },
    { type: 'pond',     x: 3700, y: 3200, w: 700, h: 420, colour: '#9a5f4a' },
  ],

  collectibles: [
    { id: 'kt-1', t: 0.57, offset:  0.75 },   // outside of the fruit-bowl bulge
    { id: 'kt-2', t: 0.40, offset:  0.75 },   // out in the gap, beside the pad.
                                              // The dare.
    { id: 'kt-3', t: 0.72, offset: -0.75 },   // tight on the north side
    { id: 'kt-4', t: 0.05, offset:  0.75 },   // wide on the main straight
  ],
};
