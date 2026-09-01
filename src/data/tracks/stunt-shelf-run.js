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
  /* The deck is a moulded plastic track piece, not carpet. Declaring nothing
     silently defaulted it to rugRoad/rugGrass — see the commit that added this. */
  baseSurface: 'plastic',
  offSurface:  'hardwood',
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

  /* ── THE GAP ─────────────────────────────────────────────────────────────
     No rail on the outside of the shelf, 440 units up, through the fastest
     part of the high run. Run wide here and there is nothing to catch you.

     This is what open question 4 in 07_World_Stunt_Track.md was waiting for:
     both stunt tracks previously ran unbroken barriers, so the elevation model
     had never had to answer what happens when a car leaves a raised deck.
     Recovery.js answers it — you fall, you watch, you get put back where you
     last legitimately were.

     The OUTSIDE of the corner only. The inside keeps its rail, so there is
     always a safe line: the gap costs you nothing if you do not run wide. */
  openEdges: [
    { from: 0.55, to: 0.66, side: 'outer' },
  ],

  /* NO `shortcut` CHORD, and the fork below is what stands in for it. A chord
     cuts across a detour and needs ground under it; two of this track's three
     decks are 210 and 440 units up with a bedroom floor underneath, so a cut
     between them is a bridge to nowhere — the same reason both kitchen tracks
     record for going without one. The route choice here is the gate: same
     stretch of road, two entry speeds, two payouts. See 05_Tracks.md, which now
     asks every track without a chord to say what it has instead. */
  zones: [],

  /* One ride, and it is a FORK — the track's switching gate.

     Both branches share the mouth at t 0.13, on the floor stretch where there
     is room to have built speed and well clear of the crossing. Which one you
     get is decided by the lane you are in when you reach it, so the choice is
     made on the approach, by the line you take, rather than by a button.

     THE TRADE IS A BET, not a toll. Both branches cover the same stretch of
     road at the speed you were already doing (see the pacing note in Rails.js),
     so neither costs time. What separates them is what they ask and what they
     pay:

       low road   — 230 at the mouth, +0.22 boost. The sure thing.
       high road  — 320 at the mouth, +0.60 boost. Nearly three times as much.

     Miss the high road's entry speed and you get NOTHING — not the corkscrew,
     and not the low road either. You drive along the floor underneath, which is
     what a lone loop already does to anyone who arrives slowly. Committing to
     the left lane and arriving at 310 is the whole risk, and it is what makes
     this a decision rather than a skill check.

     Placed against a measured centreline point — see the note in
     16_Content_Pipeline.md about corner-anchored rectangles. Lanes are ±70 on a
     300-wide road, so each 150-wide ribbon sits inside the kerbs. Length 400
     against 440 units of measured straight road at this mouth. */
  rails: [
    {
      /* HIGH ROAD — right lane. Road at (3597,2677) heading east.

         WHICH SIDE IS NOT COSMETIC. The branches exit 140 units apart across
         the road, and what follows is a corner, so the lane you leave in is
         worth more than the boost you leave with. Built the other way round —
         high road on the left — the corkscrew measured 0.43s a lap SLOWER than
         the loop despite paying nearly three times the boost, because it spat
         the car out on the wrong side for what came next. The harder entry gets
         the better exit; the cheap one takes the long way round. */
      gate: 'shelf-fork', lane: -70,
      x: 3527, y: 2577, w: 140, h: 200,
      dir: [0.944, 0.331],
      kind: 'corkscrew',
      turns: 2,
      /* Tighter than it looks like it wants to be. Pacing a ride by ground
         distance made it 1.17s rather than 4.3s, and two turns in that time at
         radius 115 whips the car sideways 24.6 units a tick — four times what
         driving at 340 covers. 78 puts the swing at 13.9 a tick, matching
         Dresser Drop's corkscrew, which is the one that has actually been
         looked at. */
      radius: 78,
      length: 400,
      width: 150,
      minSpeed: 320,
      exitBoost: 0.60,
      colour: '#37a8b8', altColour: '#2b8593', railColour: '#b6e6ee',
    },
    {
      // LOW ROAD — left lane. Same mouth, same heading, cheaper entry.
      gate: 'shelf-fork', lane: 70,
      x: 3527, y: 2577, w: 140, h: 200,
      dir: [0.944, 0.331],
      kind: 'loop',
      turns: 1,
      radius: 120,
      length: 400,
      width: 150,
      minSpeed: 230,
      exitBoost: 0.22,
      colour: '#5c7a8c', altColour: '#465e6d', railColour: '#a8c2d1',
    },
  ],

  ramps: [],

  boostPads: [
    { x: 2765, y: 2119, w: 175, h: 165, gain: 0.4 },   // t 0.05, the run in
    { x: 4534, y: 1566, w: 165, h: 180, gain: 0.4 },   // t 0.30, on the dresser
  ],
  hazards: [],

  /* BOTH BESIDE FLOOR SECTIONS, and on this track that is a harder constraint
     than it sounds. A prop takes the height of the nearest CENTRELINE point,
     so what matters is not how far it is from the road but which stretch of
     road is nearest — and on a figure-eight with three decks, most of the
     west half of the room is nearest to the long drop rather than to the floor
     underneath it.

     The crayon used to sit at (620,2900). Measured: 303 units from a road
     whose half-width is 150, nearest centreline index 101, lifted to z 394.5.
     Rendered and looked at — it hung in the air off the outside of the drop,
     over the floorboards, and its collision octagon hung there with it, drawn
     as a grey barrier ring round nothing. Counted inside drawProp, so it is
     post-cull: DRAWN in 661 of the 2410 frames of a lap. Eleven seconds a lap,
     not a corner case.

     So it is over here instead, beside the opening straight at t 0.12, where
     the nearest centreline point is on the floor and z resolves to 0. Same
     room, same distance off the road, standing on something. */
  props: [
    { type: 'block',  x: 2300, y: 1250, r: 32, h: 38, rot: 0.4 },   // z 0, 441 out
    { type: 'crayon', x: 3520, y: 2960, r: 30, h: 26, rot: 1.6 },   // z 0, 293 out
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
