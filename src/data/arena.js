/* =============================================================================
   TEST ARENA — Phase 1 only. This is NOT a track.
   =============================================================================
   No laps, no checkpoints, no theme, no art. Its only job is to provide enough
   variety of corner radius to answer the Phase 1 feel questions:

     - a long straight (does top speed feel committed?)
     - a fast sweeper  (does drift beat steering through a corner?)
     - a tight hairpin (can you overcommit and scrub speed?)
     - a chicane       (does grip recover predictably on release?)
     - a ramp          (does the z/shadow pipeline read correctly?)

   Real tracks use the full schema in 05_Tracks.md and cannot be authored until
   groundTilt is locked. See 16_Content_Pipeline.md.
   ========================================================================== */

window.BR = window.BR || {};

/* Rounded rectangle as a closed polygon. */
function roundedRect(x, y, w, h, r, steps) {
  steps = steps || 8;
  const pts = [];
  const corners = [
    [x + w - r, y + r,     -Math.PI / 2, 0],
    [x + w - r, y + h - r,  0,           Math.PI / 2],
    [x + r,     y + h - r,  Math.PI / 2, Math.PI],
    [x + r,     y + r,      Math.PI,     Math.PI * 1.5],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/* Closed polygon -> wall segments.
   `h` is render height. `clearAt` is the height at which a vehicle passes
   OVER the wall — Infinity for structural walls that can never be jumped. */
function polyToSegments(pts, opts) {
  opts = opts || {};
  const h = opts.h === undefined ? 26 : opts.h;
  const clearAt = opts.clearAt === undefined ? Infinity : opts.clearAt;
  const segs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], h: h, clearAt: clearAt });
  }
  return segs;
}

function box(x, y, w, h, r) {
  return roundedRect(x, y, w, h, r === undefined ? 18 : r, 4);
}

const OUTER  = roundedRect(0, 0, 3000, 2000, 220, 10);
const ISLAND = roundedRect(260, 260, 2480, 1480, 180, 10);

/* Chicane on the bottom straight — offset blocks forcing a left-right flick.
   This is the main test for grip recovery after releasing drift. */
const CHIC_A = box(1120, 1740, 280, 78);
const CHIC_B = box(1620, 1922, 280, 78);

/* Freestanding blocks in the wide corners, for glancing-blow testing. */
const BLOCK_1 = box(2790, 900,  130, 200);
const BLOCK_2 = box(120,  1020, 130, 200);

/* Low barrier on the top straight, just past the ramp. Travel here is -x, so
   the ramp sits at HIGHER x and you fly over this. Clearable at z >= 22, which
   a full-speed launch manages and a half-speed one does not — that gap is the
   whole point of a jump. The lane at y 145..255 goes around it. */
const HURDLE = box(1440, 30, 44, 115, 6);

BR.ARENA = {
  bounds: { w: 3000, h: 2000 },

  /* Where the car starts and where R returns it to. Bottom straight,
     facing +x, with room to build speed before the chicane. */
  spawn: { x: 620, y: 1870, heading: 0 },

  polygons: [OUTER, ISLAND, CHIC_A, CHIC_B, BLOCK_1, BLOCK_2, HURDLE],

  walls: [].concat(
    polyToSegments(OUTER),
    polyToSegments(ISLAND),
    polyToSegments(CHIC_A),
    polyToSegments(CHIC_B),
    polyToSegments(BLOCK_1),
    polyToSegments(BLOCK_2),
    polyToSegments(HURDLE, { h: 20, clearAt: 20 })
  ),

  wallHeight: 26,

  /* One ramp on the top straight, where travel is -x.
     A SHORT kicker, not a zone. It used to be 200 units long, which meant the
     car launched, landed back inside the trigger, and launched again — the
     straight read as a trampoline rather than a jump. 70 units is about two
     and a half car lengths: you cross it once and you are gone.

     Landing on a ramp cannot re-fire it either — see Collision.checkRamps.

     `rise` is the up-slope direction, used to draw the wedge the right way
     round. Launch scales with entry speed, so a crawl barely leaves the floor
     and fails to clear the hurdle. */
  ramps: [
    { x: 1500, y: 30, w: 70, h: 115, rise: [-1, 0], launch: 460 },
  ],
};
