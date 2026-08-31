/* =============================================================================
   TRACK — Three Seater  (The Sofa)
   =============================================================================
   The introduction to the sofa, and to the one thing this world does that no
   other world does: THE ROAD IS THE SLOWEST GROUND ON IT.

   20_World_Sofa.md carries the argument. In short: the road is the knitted
   throw dragged over the cushions — `blanket`, 1.05 grip at 0.70 top speed, the
   grippiest and slowest surface in the game. Everywhere else, leaving the road
   costs you speed and the road is where the grip is. Here the road is where the
   grip is AND where the speed is not, and the only quick ground on the sofa is
   the hard flat things somebody left on it: a hardback, the remote, a magazine.

   So the ladder, in the order a player should meet it:

     blanket   the throw          0.70 speed / 1.05 grip   the road
     rugGrass  biscuit crumbs     0.82 / 0.95              a free step up
     paper     a magazine         1.00 / 0.60              fast, and treacherous
     hardwood  a hardback, the remote  1.12 / 0.78         the prize
     puddle    a spilled drink    0.95 / 0.42              the punishment
     looseSand deep, unpressed plush  0.68 / 0.66          off the throw

   This track lays that ladder out as a LESSON. Every fast patch is a step to
   one side of the line the car takes on its own, so reaching one is a decision
   and never a tax — you have to aim at it, and aiming at it costs you the
   corner if you get it wrong. Down the Back is where they move onto the line.

   ── AND IT IS FLAT, WHICH IS THE OTHER HALF OF THE POINT ───────────────────
   The kitchen table had to give up `shortcut` entirely: a cut polygon lies
   outside the inner kerb by construction, `drawElevatedRoad` fills only the
   band between the kerbs, and on a deck 420 units up that draws as an
   invisible bridge over a hole (19_World_Kitchen_Table.md). A sofa seat is
   flat and nothing is under it, so this world gets the mechanic back and both
   tracks carry a real chord across the mouth of a real detour, the way
   05_Tracks.md has asked since Phase 3.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['sofa-three-seater'] = {
  id: 'sofa-three-seater',
  name: 'Three Seater',
  world: 'sofa',
  laps: 3,

  /* A corner sofa seen from above: the long seat runs west to east, and the
     unit returns north at the far end. The interesting piece of that plan is
     the INSIDE CORNER — a concave notch where the return meets the seat, which
     makes the only chicane in the game. Every other corner on every other
     track turns one way; this one turns back.

     Measured lap: filled in below from the built geometry, not from these
     points — the spline lengthens what is authored here. */
  control: [
    [1350, 2560],   //  0  the front of the seat, heading +x. Finish is along here
    [2200, 2530],
    [2830, 2380],
    [3300, 2040],   //  3  turn-in for the far arm
    [3490, 1590],   //  4  the far end, round the corner unit
    [3220, 1170],   //  5
    [2750,  900],   //  6  shortcut entry — the back cushions, running -x
    [2470,  700],   //  7  the detour: the throw rides up over the hardback
    [2060,  830],   //  8  shortcut exit
    [1600, 1070],   //  9  THE INSIDE CORNER — the road bends back on itself
    [1520, 1440],   // 10
    [1180, 1780],   // 11
    [ 700, 2020],   // 12  the near arm
    [ 880, 2470],   // 13
  ],

  /* NO `elevation`. The sofa seat is flat, and — unlike the kitchen table — it
     is deliberately NOT declared as altitude either. Recovery.check treats any
     deck above FLOOR_Z as a cliff, and falling off is the fifth world's
     mechanic, not this one's. A car that runs wide here sinks into the plush
     and has to drive out of it, which is a slower and more forgiving mistake. */

  /* ── the sofa, not the rug ────────────────────────────────────────────── */
  baseSurface: 'blanket',    // the throw: 0.70 top speed on 1.05 grip
  offSurface:  'looseSand',  /* the bare cushion, deep and never sat on. The
                                surface table is a set of MODIFIERS, and the
                                sandbox's never-driven sand — 0.66 grip, 0.68
                                speed, 0.62 accel — is exactly what deep pile
                                does to a toy car: it does not slow you down so
                                much as stop you steering or accelerating out.
                                And it is the only entry in BR.SURFACES slower
                                than the throw, which this world REQUIRES: an
                                off-road faster than the road is a free
                                shortcut round the outside of every corner. */

  groundColour: '#b09a7c',   // oatmeal upholstery, worn pale on the seats
  roadColour:   '#6e3330',   // the red wool throw, dragged over the cushions
  weaveColour:  'rgba(46,28,12,0.075)',   // the pile of the sofa's own fabric

  /* A living room in the evening under one lamp: warmer and dimmer than the
     rug's afternoon window (198,176,140). */
  haze: '188,156,124',

  roadWidth: 300,            // wide, like Dune Dash and Breakfast Run: on the
                             // world's first track the surface is the lesson
  kerbHeight: 24,            // the back cushions, a stack of books, the arms
  gateOverhang: 220,
  checkpointEvery: 6,
  gridSlots: 8,

  finish: [2200, 2530],

  /* ── Shortcut: straight on over the hardback ─────────────────────────────
     The rule 05_Tracks.md learned the hard way is that a shortcut needs a
     DETOUR to bypass. A chord across an ordinary convex corner measured 0.03
     seconds, because turning in and back out costs more than the 10% of
     distance a chord across a 90-degree arc saves — and on a compact circuit
     every corner is that case. The detour has to sit on a STRAIGHT, where the
     road's own direction is already the chord's.

     So: a big hardback is lying open on the back cushions, and you cannot
     drape a blanket flat over a book. The throw rides up over it and back
     down, and the shortcut is simply not following it.

     Built, the chord is 575 units against 800 of road bypassed, and the bulge
     stands 171 off its own chord with a 53-degree apex.

     THE RISK IS THE SURFACE, which is this world's version of everything. The
     cut is the book itself: `hardwood`, 1.12 top speed on 0.78 grip, against a
     road that is 0.70 on 1.05. It is the fastest ground on the track and the
     least willing to change direction, and it puts you back on the throw at
     the entry to the inside corner — the one place on the lap that asks for
     two direction changes in a row.

     ── THE APEX WAS AT y 467 AND THE SHORTCUT WAS WORTH 2.62s A LAP ────────
     Which is not a shortcut, it is the route. 05_Tracks.md asks for 0.5-1.5s,
     and the two calibrated examples already in the game measure 1.37 (the rug)
     and 1.16 (the boulevard) on the same forced-line harness — AIDriver has no
     idea shortcuts exist, so the only way to measure one is to move the racing
     line onto the chord and drive it.

     THE FIRST FIX WAS THE WRONG ONE, and it is worth writing down because it
     was a good theory. The cut is `hardwood` against a `blanket` road — both
     shorter AND 60% faster — so the surface looked like the obvious culprit.
     Swapping the two tracks' cut surfaces moved this one from -2.66 to -2.62
     and the other from -0.24 to -0.24. FOUR HUNDREDTHS AND NOTHING. What a
     shortcut is paved with is very nearly irrelevant to what it saves.

     What it saves is the CORNER it does not have to take. At y 467 this was a
     98-degree apex the technician had to crawl round: the forced line drove
     only 352 units less per lap and gained 2.62 seconds doing it, which is an
     effective 134 units/sec on a track where the cars run at 250. The time was
     never in the distance. Three apex heights, measured:

       y 467   98 degrees   chord saves 573   -2.62s per lap
       y 610   74 degrees               350   -1.94
       y 700   53 degrees               225   -1.72

     and 700 is where it stops, because a fourth step leaves nothing to bypass:
     the forced line already drives only 129 units less per lap and takes all
     of its 1.72 seconds out of the corner rather than the distance. It sits a
     quarter above the rug's 1.37 on the same harness, which is the closest
     honest comparison available. */
  shortcut: {
    fromXY: [2750,  900],
    toXY:   [2060,  830],
    surface: 'hardwood',
    exitBoost: 0.40,
  },

  /* ── The ladder, laid out as a lesson ────────────────────────────────────
     RECTANGLES ARE CORNER-ANCHORED. x,y is the low corner, never the middle;
     `surfaceAt` tests `x <= p <= x + w`, so the rectangle is not a bounding box
     around the surface change, it IS the surface change. Six were once authored
     as centres across the sandbox and three ramps could not fire.

     Every one of these is placed against a MEASURED centreline point from the
     built geometry — printed out, not estimated — and every one on this track
     is on ONE SIDE of the line rather than across it. Reaching a fast patch
     here is a decision that costs you the corner if you get it wrong; Down the
     Back is where they move onto the line and stop being optional. */
  zones: [
    /* The front straight, in two lanes, and this is the whole world in one
       place. INNER: biscuit crumbs, 0.82 top speed against the throw's 0.70 —
       a free step up, and the inside is also the right side for the corner
       coming. OUTER: the TV remote, 1.12 on 0.78 grip, the fastest ground on
       the lap and it takes you wide. The quick lane is the wrong lane. */
    { type: 'rugGrass', x: 1950, y: 2380, w: 400, h: 170 },
    { type: 'hardwood', x: 2380, y: 2460, w: 300, h: 150 },
    /* A magazine hanging over the outer edge at the far apex. `paper` is 1.00
       top speed on 0.60 GRIP: nothing on the sofa punishes running wide like
       finding something fast out there. */
    { type: 'paper',    x: 3530, y: 1490, w: 230, h: 260 },
    /* The drink somebody put down, soaked into the cushion on the exit of the
       far end. 0.42 grip — the sofa's one true punishment, and deliberately
       off the natural line on the world's introductory track. */
    { type: 'puddle',   x: 3400, y: 1150, w: 220, h: 220 },
    /* A paperback face-down on the inside of the run back down. Take it and
       you arrive at the detour entry on the wrong side of the road. */
    { type: 'hardwood', x: 2900, y: 1150, w: 260, h: 200 },

    /* ── THE HARDBACK THE SHORTCUT GOES OVER ─────────────────────────────
       And this one is a zone rather than decoration, which took rendering the
       cut and looking at it to work out.

       NOTHING IN THE RENDERER FILLS `cutPoly`, in any world. The rug's car
       park and the boulevard's cardboard tunnel have always drawn as bare
       ground with a dashed chord across the mouth, which on those tracks is
       harmless because leaving the road there is a shortcut anyway. Here it
       is a lie in the most expensive direction: off the throw is `looseSand`
       — 0.66 grip, the slowest ground on the sofa — so a cut that draws as
       bare cushion reads as somewhere you must not go, when it is in fact the
       fastest line on the lap.

       A zone fixes it honestly rather than cosmetically. `surfaceAt` checks
       zones BEFORE `cutPoly`, and drawZones paints `hardwood` as lit boards
       with a dark outline, so the rectangle drawn is exactly the surface driven
       — the same contract every other zone in the game keeps. It is sized to
       fill as much of the wedge as a rectangle can, which means it reaches a
       little way onto the road at both junctions. That is not a compromise:
       the book really does stick out from under the throw where the two meet,
       and both routes share those few units either way. */
    { type: 'hardwood', x: 2330, y:  890, w: 230, h: 110 },
  ],

  /* A paperback propped against a cushion at the very start of the front
     straight. Travel there is +x — measured, the tangent at that point is
     (0.995, 0.031) — so the wedge rises toward +x.

     IT WAS 435 UNITS FURTHER ON, AND THAT PUT IT INSIDE THE STARTING GRID.
     The grid is laid back from the finish index: eight slots at centreline
     points 11, 9, 7 and 5, which on this track is x 1985 down to x 1510. A
     ramp at 1785 sat under the third row, so half the field would have
     launched off it before the lights went out — and no numeric check has any
     opinion about that. It is at 1350 now, seventy units clear of the last
     slot, so the jump belongs to the run to the flag rather than to the start.

     Measured envelope for launch 470 is an apex of 52 and a landing at 142
     (16_Content_Pipeline.md). */
  ramps: [
    { x: 1350, y: 2435, w: 90, h: 250, rise: [1, 0], launch: 470 },
  ],

  boostPads: [
    // At the end of the front straight, OUTER — the payment for having taken
    // the remote and gone wide.
    { x: 2879, y: 2338, w: 170, h: 170, gain: 0.40 },
    // Inside of the far end, which is the line that avoids both the magazine
    // and the drink. The safe line is not unpaid here.
    { x: 3309, y: 1533, w: 170, h: 170, gain: 0.45 },
    // The run to the flag.
    { x:  975, y: 2458, w: 170, h: 170, gain: 0.40 },
  ],

  /* One hazard, because one thing to time is enough to learn at once. A
     cushion shifting as somebody leans on the sofa, sliding across the S-bend
     on a strict period so it is learnable (05_Tracks.md). The path runs
     between the measured kerb points and no further. */
  hazards: [
    { type: 'toyTrain', period: 8.5, r: 48, h: 36,
      path: [[1650, 1261], [1455, 1254], [1650, 1261]] },
  ],

  /* Sofa things at toy-car scale. `bucket` is a mug of tea, `crayon` a biro,
     `block` a wooden brick that went down the side months ago, `spade` a
     slipper lying flat — low enough to drive over, which is what a spade
     already was. All seven sit at about 0.65 of the half width, and the tall
     ones are kept off the insides of corners (05_Tracks.md: at 17.5 degrees a
     prop hides ground behind it out to 2.83 times its height). */
  props: [
    { type: 'crayon', x: 1668, y: 2465, r: 30, h: 24, rot: 2.2 },   // t 0.04 in
    { type: 'bucket', x: 1996, y: 2646, r: 34, h: 44, rot: 0.0 },   // t 0.08 out
    { type: 'spade',  x: 3369, y: 1739, r: 30, h: 18, rot: 1.1 },   // t 0.31 in
    { type: 'block',  x: 2951, y: 1126, r: 28, h: 34, rot: 0.6 },   // t 0.44 in
    { type: 'crayon', x: 1745, y: 1085, r: 30, h: 24, rot: 1.7 },   // t 0.67 in
    { type: 'block',  x: 1265, y: 1588, r: 30, h: 36, rot: 0.9 },   // t 0.77 out
    { type: 'crayon', x:  822, y: 2034, r: 30, h: 24, rot: 2.7 },   // t 0.85 in
  ],

  /* ── THE REST OF THE SOFA ────────────────────────────────────────────────
     Decoration has no collision, so it is free to be exactly what it looks
     like — and here it is carrying more weight than in any other world,
     because this one has no room.

     `Renderer.ROOMS` is keyed by world and has no fallback: an unknown world
     draws no floor beyond the play surface, no skirting and no furniture, so
     `drawGround` fills the bounds quad and everything past it is the bare
     backdrop. Rendered, that is a hard diagonal seam across the top of the
     frame where the beige stops. The five entries this world would need are
     four lines in a file it does not own (see 20_World_Sofa.md), so instead
     the surround is built out of the one thing a track file CAN place: the
     back cushions, both arms and the front edge of the seat, drawn past the
     kerbs and out over the seam. A sofa is one object and its surround is
     more of the same object, which is the one case where this works.

     Everything here is measured to clear the outer kerb — the closest is the
     front edge at 46 units — because decoration draws AFTER the road and a
     quad over the road would paint out the thing a driver reads. */
  decoration: [
    { type: 'building', x:  600, y: -320, w: 2900, h:  600, colour: '#a3906f' },  // the back cushions
    { type: 'building', x:  700, y: 2760, w: 2600, h:  700, colour: '#b3a081' },  // the front edge of the seat
    { type: 'building', x: 3680, y: 1150, w:  760, h: 1000, colour: '#9c8965' },  // the far arm
    { type: 'building', x: -180, y: 1450, w:  680, h: 1150, colour: '#9c8965' },  // the near arm
    { type: 'building', x: 1880, y: 1420, w:  980, h:  660, colour: '#9a8767' },  // the middle seat cushion
    { type: 'building', x: 2380, y:  915, w:  130, h:   50, colour: '#d8ccb0' },  // the hardback's page block
  ],

  /* One piece on each route through the detour, so completing the set means
     driving both. Authored track-relative, never in world coordinates — that
     is how a piece once ended up 521 units from the road, behind a wall. */
  collectibles: [
    { id: 'ts-1', t: 0.52, offset:  0    },   // the top of the bulge: the long way round
    { id: 'ts-2', cut: 0.5               },   // on the book: the short way
    { id: 'ts-3', t: 0.30, offset:  0.75 },   // wide at the far end, out by the magazine
    { id: 'ts-4', t: 0.85, offset: -0.75 },   // tight round the near arm
  ],
};
