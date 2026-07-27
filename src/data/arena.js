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

/* ── RACING LINE, CHECKPOINTS AND GRID ─────────────────────────────────────
   The centreline runs midway between the outer wall and the island, so its
   bottom edge sits at exactly y = 1870 — the same straight the grid is on.

   roundedRect() emits points clockwise starting top-right, which would send
   traffic -x along the bottom. Reversed so the lap runs +x along the bottom,
   up the right side, then -x along the top — which is the direction the ramp's
   rise vector expects. */
const CENTRELINE = roundedRect(130, 130, 2740, 1740, 200, 14).slice().reverse();

/* Even spacing matters: waypoints bunched on the corners and sparse on the
   straights make AI brake in the wrong places. */
function resample(pts, spacing) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let d = carry;
    while (d < len) {
      const t = d / len;
      out.push([a[0] + dx * t, a[1] + dy * t]);
      d += spacing;
    }
    carry = d - len;
  }
  return out;
}

const LINE_PTS = resample(CENTRELINE, 90);

/* targetSpeed is authored from curvature: the tighter the bend between
   neighbouring points, the slower the AI is told to take it. */
function buildWaypoints(pts) {
  const wps = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const cur  = pts[i];
    const next = pts[(i + 1) % pts.length];
    const a1 = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]);
    const a2 = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
    let turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    // Was max(0.45, 1 - turn*1.9), which marked every corner at the 0.45 floor
    // and had the AI crawling. A 200-radius corner at turnRate 1.7 can actually
    // be carried at roughly v = turnRate * radius, far above that.
    const target = Math.max(0.62, 1 - turn * 1.0);
    wps.push({ x: cur[0], y: cur[1], targetSpeed: target, width: 110 });
  }
  return wps;
}

/* Gates across the track, perpendicular to the racing line. Spacing is tight
   enough that no shortcut or wall-ride can skip one — 05_Tracks.md. */
function buildCheckpoints(pts, every, finishIdx) {
  const cps = [];
  let id = 0;
  // Walk FROM the finish so checkpoint 0 is the finish line and the rest are
  // numbered in the direction of travel. Starting from index 0 instead would
  // put the finish wherever the polygon happened to begin.
  for (let k = 0; k < pts.length; k += every) {
    const i    = (finishIdx + k) % pts.length;
    const cur  = pts[i];
    const next = pts[(i + 1) % pts.length];
    const ang  = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const half = 190;   // track band is ~260 wide; overhang guarantees a cross
    cps.push({
      id: id++,
      a: [cur[0] - nx * half, cur[1] - ny * half],
      b: [cur[0] + nx * half, cur[1] + ny * half],
      isFinish: k === 0,
    });
  }
  return cps;
}

function nearestIndex(pts, x, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i][0] - x, dy = pts[i][1] - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const WAYPOINTS = buildWaypoints(LINE_PTS);

/* Finish line on the bottom straight, with the grid behind it. */
const FINISH_I = nearestIndex(LINE_PTS, 820, 1870);
const CHECKPOINTS = buildCheckpoints(LINE_PTS, 4, FINISH_I);

BR.ARENA = {
  bounds: { w: 3000, h: 2000 },

  /* Single-car Phase 1 spawn. Kept so the driving test still works. */
  spawn: { x: 620, y: 1870, heading: 0 },

  racingLine: WAYPOINTS,
  checkpoints: CHECKPOINTS,

  /* Staggered grid behind the finish line, two abreast. Offset across the
     track so the pack does not all pile into the first corner on the same
     line — 05_Tracks.md authoring checklist. */
  grid: [
    { x: 700, y: 1826, heading: 0 },
    { x: 700, y: 1914, heading: 0 },
    { x: 610, y: 1826, heading: 0 },
    { x: 610, y: 1914, heading: 0 },
    { x: 520, y: 1826, heading: 0 },
    { x: 520, y: 1914, heading: 0 },
  ],

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
