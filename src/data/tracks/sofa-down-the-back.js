/* =============================================================================
   TRACK — Down the Back  (The Sofa)
   =============================================================================
   The second sofa track, and a deliberate division of labour with the first.

   Three Seater lays the surface ladder out as a lesson: every fast patch sits
   a little to one side of the line, so reaching one is an invitation. This one
   puts them ON the line, END TO END, and points the resulting speed at the
   tightest corner in the world.

   THE CHAIN is the whole track. Down the back cushions — where everything a
   family loses ends up — four hard flat things lie nose to tail across the
   road: a hardback, the TV guide, the remote, a magazine. Threading all four
   is the quick lap. It is also 800 units of accelerating on 0.78 and 0.60 grip
   between props somebody dropped, and it delivers you to the near arm — the
   only hairpin on the sofa — carrying speed the throw cannot take away from
   you quickly enough, over the tea somebody put down on the cushion.

   The road is 50 units narrower than Three Seater's and the chain fills most
   of what is left. That is the difference between the two tracks: the first
   asks whether you can be bothered to aim at the fast ground, the second asks
   whether you can get off it in time.
   ========================================================================== */

window.BR = window.BR || {};
BR.TRACKS = BR.TRACKS || {};

BR.TRACKS['sofa-down-the-back'] = {
  id: 'sofa-down-the-back',
  name: 'Down the Back',
  world: 'sofa',
  laps: 3,

  /* Long and thin, which is what a sofa is. Two long straights, a sweeping far
     end round the arm, and a near end tight enough to be the only hairpin in
     the world. No chicane here — Three Seater owns the inside corner. */
  control: [
    [1050, 1900],   //  0  shortcut entry — the front of the seat, heading +x
    [1400, 2330],   //  1  the detour: the throw sags off the front of the seat
    [1750, 1930],   //  2  shortcut exit
    [2500, 1990],   //  3  the finish is along here
    [3080, 1830],   //  4
    [3400, 1400],   //  5  the far arm
    [3120,  930],   //  6
    [2450,  800],   //  7  the back cushions, running -x — THE CHAIN
    [1700,  790],   //  8
    [1100,  880],   //  9
    [ 640, 1180],   // 10  the near arm: the hairpin the chain is aimed at
    [ 600, 1620],   // 11
  ],

  // Flat, and not declared as altitude. See the note in sofa-three-seater.js.

  baseSurface: 'blanket',
  offSurface:  'looseSand',

  groundColour: '#b09a7c',
  roadColour:   '#6e3330',
  weaveColour:  'rgba(46,28,12,0.075)',
  haze: '188,156,124',

  roadWidth: 250,            // 50 narrower than Three Seater
  kerbHeight: 24,
  gateOverhang: 200,
  checkpointEvery: 6,
  gridSlots: 8,

  /* At the FAR end of the front straight, on purpose, and for the reason
     Table's Edge puts its flag at the far end of its own: the grid is laid
     nine centreline points back from the line, so the field starts along the
     front straight and does not reach the chain until it is most of a lap old
     and strung out. Eight cars arriving at four hard patches together would
     not be a chain, it would be a pile. */
  finish: [2700, 1980],

  /* ── Shortcut: straight on over the Sunday papers ─────────────────────────────
     Same shape of detour as Three Seater's and for the same measured reason
     (the note there carries it): it sits on a STRAIGHT, because on a compact
     circuit a chord across a corner is the 0.03-second case 05_Tracks.md
     warns about. The throw sags off the front of the seat and climbs back on;
     the cut carries straight on across the papers it sagged around. Built, the
     chord is 584 against 1120 units of road bypassed, and the sag stands 415
     off its own chord with a 100-degree bend at the bottom of it.

     What differs from Three Seater is what you are driving over. That cut is a
     hardback — quick, and grippy enough to hold. This one is `paper`, 1.00 top
     speed on 0.60 GRIP, the loosest thing on the sofa short of a spilled
     drink. Straight-line speed is 43% up on the throw, the exit turns back
     onto the front straight, and there is nothing under the wheels to turn
     with. It is also the first thing on the lap: the flag sits at the far end
     of this straight, so the cut is what you arrive at, not what you leave.

     ── THE SAG WAS AT y 2280 AND THE SHORTCUT WAS WORTH 0.24s A LAP ─────────
     Which 05_Tracks.md has a name for: the 0.03-second case, a shortcut that
     is not a choice. The calibrated examples measure 1.37 (the rug) and 1.16
     (the boulevard) on the same forced-line harness.

     Swapping this cut's surface to `hardwood` — 60% more top speed — moved it
     from -0.24 to -0.24. NOTHING. Three Seater's swap moved 0.04 the other
     way. What a shortcut saves is not the ground it is paved with, it is the
     CORNER it does not have to take, and this sag was a 92-degree bend the
     technician barely had to lift for. Three sag depths, measured:

       y 2280    92 degrees   365 off the chord, saving 461   -0.24s per lap
       y 2420   110                504                  690   -1.69
       y 2330   100                415                  536   -1.42

     1.42 against the rug's 1.37 on the same harness. The surface then went
     back to being a question about what a sofa has on it rather than a lever
     for lap time, which is where it belonged all along. */
  shortcut: {
    fromXY: [1050, 1900],
    toXY:   [1750, 1930],
    surface: 'paper',
    exitBoost: 0.45,
  },

  /* ── THE CHAIN ───────────────────────────────────────────────────────────
     RECTANGLES ARE CORNER-ANCHORED — x,y is the low corner, and the rectangle
     IS the surface change rather than a box around it. Every one below is
     placed against a measured centreline point from the built geometry.

     Four hard flat things lie end to end down the back cushions, and they
     ALTERNATE SIDES: hardback inner, TV guide outer, remote inner, magazine
     outer. Each is about a half-width across, so the quick lap is a slalom
     rather than a free gift, and the last one leaves you on the OUTSIDE of the
     road with the hairpin next. Then the tea, straight across the braking
     zone, at 0.42 grip.

     That sequence is the entire track. Three Seater asks whether you can be
     bothered to aim at the fast ground; this one asks whether you can get off
     it in time. */
  zones: [
    // Crumbs on the inner half of the front straight. The only forgiving thing
    // here, and the only fast patch on the track that is also the right line.
    { type: 'rugGrass', x: 2000, y: 1830, w: 500, h: 120 },
    // The drink, out on the exit of the far arm. Off the line, like Three
    // Seater's — this track does its damage down the back.
    { type: 'puddle',   x: 3380, y: 1060, w: 200, h: 200 },

    // ── the chain, east to west, in the order you meet it ──────────────────
    { type: 'hardwood', x: 2480, y:  830, w: 320, h: 120 },   // a hardback, INNER
    { type: 'paper',    x: 2180, y:  660, w: 270, h: 120 },   // the TV guide, OUTER
    { type: 'hardwood', x: 1850, y:  790, w: 270, h: 115 },   // the remote, INNER
    { type: 'paper',    x: 1500, y:  675, w: 300, h: 115 },   // a magazine, OUTER

    /* The tea. ON the line, across the braking zone for the only hairpin in
       the world, at the end of the only place on the sofa where you can build
       real speed. Table's Edge moved its sugar out of the run-off and onto the
       braking zone for exactly this reason; this is the same idea with the
       whole straight aimed at it. */
    { type: 'puddle',   x: 1080, y:  760, w: 220, h: 220 },

    /* THE SUNDAY PAPERS THE SHORTCUT GOES OVER. A zone rather than decoration, for
       the reason set out at length in sofa-three-seater.js: nothing in the
       renderer fills `cutPoly` in any world, and a cut that draws as bare
       cushion reads as the one place you must not go when it is the fastest
       line on the lap. `surfaceAt` checks zones before `cutPoly` and drawZones
       paints `paper` as a white sheet with printed lines, so what is drawn is
       exactly what is driven. */
    { type: 'paper',    x: 1240, y: 1820, w: 340, h: 110 },
  ],

  /* A hardback propped on the arm at the entry to the back straight. Travel
     there is -x. Launch 460 lands the car at about 140 units, which is on the
     first link of the chain — you arrive at the book in the air. */
  ramps: [
    { x: 2900, y: 712, w: 90, h: 250, rise: [-1, 0], launch: 460 },
  ],

  boostPads: [
    // Onto the back straight, just before the ramp and the chain.
    { x: 3036, y:  845, w: 170, h: 170, gain: 0.40 },
    // Inside of the far arm — the line that misses the spilled drink.
    { x: 3223, y: 1363, w: 170, h: 170, gain: 0.45 },
    // Out of the hairpin, on the climb back to the front straight.
    { x:  754, y: 1697, w: 170, h: 170, gain: 0.40 },
  ],

  /* Two, on different periods so they drift out of phase and the lap never
     feels memorised after one go — the trick Bedside Boulevard uses. The
     second one sits in the gap between the third and fourth links of the
     chain, which is the one place on the straight you were planning to be
     flat out and straight. Both paths run between measured kerb points and no
     further. */
  hazards: [
    { type: 'toyTrain', period: 7.5,  r: 44, h: 34,
      path: [[2318, 1899], [2297, 2060], [2318, 1899]] },
    { type: 'toyTrain', period: 10.5, r: 40, h: 32,
      path: [[1704,  871], [1695,  709], [1704,  871]] },
  ],

  /* What goes down the back of a sofa. `crayon` is a biro, `block` a wooden
     brick, `bucket` a mug, `spade` a slipper lying flat. Two of them are in
     the chain on purpose: threading four hard patches is harder when there is
     something standing between them. */
  props: [
    { type: 'crayon', x: 1981, y: 2010, r: 30, h: 24, rot: 0.6 },   // t 0.18 out
    { type: 'bucket', x: 2468, y: 2073, r: 34, h: 44, rot: 0.0 },   // t 0.24 out
    { type: 'block',  x: 3376, y: 1660, r: 28, h: 34, rot: 1.3 },   // t 0.38 out
    { type: 'crayon', x: 2491, y:  885, r: 30, h: 24, rot: 2.1 },   // t 0.58 in, beside the hardback
    { type: 'block',  x: 1857, y:  702, r: 28, h: 32, rot: 0.4 },   // t 0.67 out, in the chain
    { type: 'spade',  x:  835, y: 1106, r: 30, h: 18, rot: 1.6 },   // t 0.82 in, low, in the hairpin
  ],

  /* The rest of the sofa, for the reason set out in sofa-three-seater.js: this
     world has no `Renderer.ROOMS` entry, so anything past the bounds quad is
     bare backdrop, and the surround has to be built out of the one thing a
     track file can place. All four clear the outer kerb by a measured margin,
     because decoration draws after the road. */
  decoration: [
    { type: 'building', x:  700, y: -400, w: 2900, h:  700, colour: '#a3906f' },  // the back cushions
    { type: 'building', x:  800, y: 2620, w: 2400, h:  700, colour: '#b3a081' },  // the front edge of the seat
    { type: 'building', x: 3620, y: 1000, w:  760, h: 1000, colour: '#9c8965' },  // the far arm
    { type: 'building', x: -140, y: 1000, w:  540, h: 1000, colour: '#9c8965' },  // the near arm
    { type: 'building', x: 1700, y: 1150, w: 1200, h:  600, colour: '#9a8767' },  // the seat cushions
    { type: 'building', x: 1320, y: 1865, w:  160, h:   50, colour: '#b9b2a2' },  // columns of print, on the papers
  ],

  collectibles: [
    { id: 'db-1', cut: 0.5               },   // on the papers, in the cut
    { id: 'db-2', t: 0.60, offset: -0.75 },   // inner, deep in the chain
    { id: 'db-3', t: 0.42, offset:  0.75 },   // wide at the far arm, in the drink
    { id: 'db-4', t: 0.87, offset: -0.75 },   // tight out of the hairpin
  ],
};
