/* =============================================================================
   TRACK MANAGER — turns a track definition into playable geometry.
   =============================================================================
   A track is DATA (05_Tracks.md). This file is the only thing that knows how to
   turn that data into walls, checkpoints, racing lines and surface lookups, so
   adding a track never means touching a system.

   A road is authored as a handful of control points plus a width. Everything
   else — the smooth centreline, both kerbs, the collision walls, the racing
   line, the checkpoint gates — is generated. Hand-authoring all of that per
   track is exactly what 16_Content_Pipeline.md warns does not scale.
   ========================================================================== */

window.BR = window.BR || {};

BR.TrackManager = {

  /* Catmull-Rom through the control points: the curve passes through every
     point, so the authored shape is the shape you get. */
  spline(pts, per) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
      const p2 = pts[(i + 1) % n],     p3 = pts[(i + 2) % n];
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
                (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
                (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    return out;
  },

  /* Even spacing. Points bunched on corners and sparse on straights make the
     AI brake in the wrong places. */
  resample(pts, spacing) {
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
  },

  tangentAt(pts, i) {
    const n = pts.length;
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  },

  build(def) {
    const line = this.resample(this.spline(def.control, 24), 80);
    const n = line.length;
    const half = def.roadWidth / 2;

    // ── kerbs ──────────────────────────────────────────────────────────────
    const outer = [], inner = [];
    for (let i = 0; i < n; i++) {
      const t = this.tangentAt(line, i);
      const nx = -t[1], ny = t[0];
      outer.push([line[i][0] + nx * half, line[i][1] + ny * half]);
      inner.push([line[i][0] - nx * half, line[i][1] - ny * half]);
    }

    // ── walls ──────────────────────────────────────────────────────────────
    const walls = [];
    function edgeToWalls(pts, h, clearAt) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        walls.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1],
                     h: h, clearAt: clearAt });
      }
    }
    const kerbH = def.kerbHeight || 22;
    edgeToWalls(outer, kerbH, Infinity);

    /* ── shortcut ────────────────────────────────────────────────────────────
       Open the inner kerb across an arc and replace it with a straight chord.
       The chord is simply shorter than the road it bypasses, and because its
       ends ARE the kerb's ends there is no gap to escape through.

       The cut is off the centreline, so surfaceAt() reports rugGrass there
       automatically: slower and looser than the road. That is the risk half of
       the trade, and it needs no extra data. */
    let cutFrom = -1, cutTo = -1, chord = null;
    if (def.shortcut) {
      cutFrom = Math.floor(def.shortcut.fromT * n) % n;
      cutTo   = Math.floor(def.shortcut.toT   * n) % n;
    }

    function inCut(i) {
      if (cutFrom < 0) return false;
      return cutFrom <= cutTo
        ? (i >= cutFrom && i <= cutTo)
        : (i >= cutFrom || i <= cutTo);   // wraps past index 0
    }

    for (let i = 0; i < inner.length; i++) {
      if (inCut(i)) continue;
      const a = inner[i], b = inner[(i + 1) % inner.length];
      walls.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1],
                   h: kerbH, clearAt: Infinity });
    }

    /* The cut region: the arc of inner kerb that was removed, closed by the
       chord. Held as a polygon so the surface lookup is exact — this is the
       printed car park, so it drives like road. Leaving it as rug made the
       shortcut pointless: grass costs 18% top speed, and a chord only saves a
       few percent of distance, so the "shortcut" was measurably slower. */
    let cutPoly = null;
    if (cutFrom >= 0) {
      const a = inner[cutFrom], b = inner[cutTo];
      chord = [a, b];

      cutPoly = [];
      for (let i = cutFrom; ; i = (i + 1) % inner.length) {
        cutPoly.push(inner[i]);
        if (i === cutTo) break;
      }
      // Subdivided so it reads as a kerb rather than one long line.
      const segs = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 60));
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        walls.push({
          ax: a[0] + (b[0] - a[0]) * t0, ay: a[1] + (b[1] - a[1]) * t0,
          bx: a[0] + (b[0] - a[0]) * t1, by: a[1] + (b[1] - a[1]) * t1,
          h: kerbH, clearAt: Infinity,
        });
      }
    }

    // Props become walls too. Low ones can be jumped.
    const props = (def.props || []).map(function (p) {
      return { type: p.type, x: p.x, y: p.y, rot: p.rot || 0,
               r: p.r || 26, h: p.h || 20, clearAt: p.clearAt };
    });
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      const sides = 8;
      for (let s = 0; s < sides; s++) {
        const a0 = (s / sides) * Math.PI * 2 + p.rot;
        const a1 = ((s + 1) / sides) * Math.PI * 2 + p.rot;
        walls.push({
          ax: p.x + Math.cos(a0) * p.r, ay: p.y + Math.sin(a0) * p.r,
          bx: p.x + Math.cos(a1) * p.r, by: p.y + Math.sin(a1) * p.r,
          h: p.h, clearAt: p.clearAt === undefined ? Infinity : p.clearAt,
        });
      }
    }

    // ── racing line ────────────────────────────────────────────────────────
    const racingLine = [];
    for (let i = 0; i < n; i++) {
      const prev = line[(i - 1 + n) % n], cur = line[i], next = line[(i + 1) % n];
      const a1 = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]);
      const a2 = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
      const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
      racingLine.push({
        x: cur[0], y: cur[1],
        targetSpeed: Math.max(0.62, 1 - turn * 1.0),
        width: def.roadWidth * 0.42,
      });
    }

    // ── checkpoints ────────────────────────────────────────────────────────
    // Gates overhang the kerbs so an alternate route running alongside the road
    // still crosses them — 05_Tracks.md requires every route through the same
    // sequence. Spacing is loose enough that gates never reach another part of
    // the circuit.
    const startIdx = this.nearestIndex(line, def.finish[0], def.finish[1]);
    const overhang = def.gateOverhang || 200;
    const checkpoints = [];
    const every = def.checkpointEvery || 6;
    let id = 0;
    for (let k = 0; k < n; k += every) {
      const i = (startIdx + k) % n;
      const t = this.tangentAt(line, i);
      const nx = -t[1], ny = t[0];

      // Gates are ASYMMETRIC. Across the shortcut they must reach past the
      // chord, or a car taking the cut skips the gate entirely and the lap
      // never validates — 05_Tracks.md requires every route through the same
      // sequence. Symmetric gates cannot do that: the chord bows far deeper
      // into the infield than any fixed overhang.
      let innerReach = half + overhang;
      if (inCut(i) && chord) {
        const d = this.distToSegment(line[i][0], line[i][1],
                                     chord[0][0], chord[0][1],
                                     chord[1][0], chord[1][1]);
        innerReach = Math.max(innerReach, d + 150);
      }

      checkpoints.push({
        id: id++,
        a: [line[i][0] - nx * innerReach, line[i][1] - ny * innerReach],
        b: [line[i][0] + nx * (half + overhang), line[i][1] + ny * (half + overhang)],
        isFinish: k === 0,
      });
    }

    // ── grid, laid back down the road from the finish ──────────────────────
    const grid = [];
    for (let s = 0; s < (def.gridSlots || 6); s++) {
      const row = Math.floor(s / 2), col = s % 2;
      const i = (startIdx - 3 - row * 2 + n * 2) % n;
      const t = this.tangentAt(line, i);
      const nx = -t[1], ny = t[0];
      const off = (col === 0 ? -1 : 1) * half * 0.42;
      grid.push({
        x: line[i][0] + nx * off,
        y: line[i][1] + ny * off,
        heading: Math.atan2(t[1], t[0]),
      });
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < outer.length; i++) {
      minX = Math.min(minX, outer[i][0]); maxX = Math.max(maxX, outer[i][0]);
      minY = Math.min(minY, outer[i][1]); maxY = Math.max(maxY, outer[i][1]);
    }

    return {
      id: def.id,
      name: def.name,
      laps: def.laps || 3,
      centreline: line,
      outer: outer,
      inner: inner,
      halfWidth: half,
      walls: walls,
      wallHeight: def.kerbHeight || 22,
      racingLine: racingLine,
      checkpoints: checkpoints,
      grid: grid,
      spawn: grid[0],
      props: props,
      shortcutChord: chord,
      cutPoly: cutPoly,
      cutSurface: (def.shortcut && def.shortcut.surface) || 'rugRoad',
      ramps: def.ramps || [],
      // Pad placed at the chord's exit, computed rather than authored — a
      // hard-coded position drifted out of place every time the cut was retuned.
      boostPads: (def.boostPads || []).concat(
        (chord && def.shortcut.exitBoost)
          ? [{ x: chord[1][0] - 95, y: chord[1][1] - 95, w: 190, h: 190,
               gain: def.shortcut.exitBoost }]
          : []),
      zones: def.zones || [],
      hazards: (def.hazards || []).map(function (h) {
        return { type: h.type, path: h.path, period: h.period, phase: h.phase || 0,
                 r: h.r || 40, h: h.h || 34, t: h.phase || 0, x: h.path[0][0],
                 y: h.path[0][1], heading: 0 };
      }),
      decoration: def.decoration || [],
      bounds: { minX: minX - 400, minY: minY - 400,
                maxX: maxX + 400, maxY: maxY + 400,
                w: maxX - minX, h: maxY - minY },
    };
  },

  distToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
  },

  pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) &&
          x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  },

  nearestIndex(pts, x, y) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i][0] - x, dy = pts[i][1] - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  },

  /**
   * Which surface is this point on?
   * Distance to the centreline rather than point-in-polygon: the road is built
   * from that centreline, so the test is exact and far cheaper.
   */
  surfaceAt(track, x, y) {
    // Explicit zones win — car parks, paper, hardwood patches.
    for (let i = 0; i < track.zones.length; i++) {
      const z = track.zones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z.type;
    }
    // The shortcut is printed car park, so it drives like road. Checked before
    // the road test because the cut sits outside the kerbs.
    if (track.cutPoly && this.pointInPoly(x, y, track.cutPoly)) {
      return track.cutSurface;
    }

    const line = track.centreline;
    let best = Infinity;
    for (let i = 0; i < line.length; i++) {
      const a = line[i], b = line[(i + 1) % line.length];
      const abx = b[0] - a[0], aby = b[1] - a[1];
      const apx = x - a[0], apy = y - a[1];
      const len2 = abx * abx + aby * aby;
      let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const dx = x - (a[0] + abx * t), dy = y - (a[1] + aby * t);
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best) <= track.halfWidth ? 'rugRoad' : 'rugGrass';
  },

  /* Moving hazards run on a fixed period so they are LEARNABLE. Randomness
     here reads as unfair — a player on lap three should be able to time the
     train (05_Tracks.md). */
  updateHazards(track, dt) {
    for (let i = 0; i < track.hazards.length; i++) {
      const h = track.hazards[i];
      h.t = (h.t + dt / h.period) % 1;
      const path = h.path;
      const f = h.t * path.length;
      const i0 = Math.floor(f) % path.length;
      const i1 = (i0 + 1) % path.length;
      const lt = f - Math.floor(f);
      const a = path[i0], b = path[i1];
      h.x = a[0] + (b[0] - a[0]) * lt;
      h.y = a[1] + (b[1] - a[1]) * lt;
      h.heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  },

  /* Hazards shove rather than stop. Playful, not punishing. */
  resolveHazards(track, v) {
    for (let i = 0; i < track.hazards.length; i++) {
      const h = track.hazards[i];
      if (v.z >= h.h) continue;
      const dx = v.x - h.x, dy = v.y - h.y;
      const d = Math.hypot(dx, dy);
      const rsum = h.r + v.radius;
      if (d >= rsum || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d;
      v.x += nx * (rsum - d);
      v.y += ny * (rsum - d);
      const vn = v.vel.x * nx + v.vel.y * ny;
      if (vn < 0) {
        v.vel.x -= 1.6 * vn * nx;
        v.vel.y -= 1.6 * vn * ny;
        v.vel.x *= 0.72; v.vel.y *= 0.72;
      }
    }
  },

  /* Boost pads. A pad tops the meter up rather than firing, so spending it
     stays the player's decision (02_Mechanics.md). */
  checkBoostPads(track, v) {
    for (let i = 0; i < track.boostPads.length; i++) {
      const p = track.boostPads[i];
      if (v.x < p.x || v.x > p.x + p.w) continue;
      if (v.y < p.y || v.y > p.y + p.h) continue;
      v.boostMeter = Math.min(1, v.boostMeter + (p.gain || 0.5));
      return;
    }
  },
};
