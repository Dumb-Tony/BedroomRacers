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

  /**
   * Height and level for every centreline point.
   *
   * DISCRETE LEVELS, CONTINUOUS HEIGHT — 07_World_Stunt_Track.md option 1. The
   * simulation stays resolutely 2D: `level` is an integer that decides what can
   * collide with what, and `z` is a render height that decides what it looks
   * like. Nothing about gravity, grip or steering changes, which is the whole
   * reason this option was picked over a true height field.
   *
   * `level` steps at each key; `z` eases between them, so a climb has no kink
   * at the top and the track reads as a moulded ramp rather than a folded one.
   * Author the level change at the key where the climb STARTS, so the ramp
   * belongs to the level it is heading for and cannot collide with what it
   * passes over.
   */
  resolveElevation(def, n) {
    const out = new Array(n);
    const keys = def.elevation;
    if (!keys || !keys.length) {
      for (let i = 0; i < n; i++) out[i] = { z: 0, level: 0 };
      return out;
    }
    const k = keys.slice().sort(function (a, b) { return a.t - b.t; });

    for (let i = 0; i < n; i++) {
      const t = i / n;
      // Bracketing keys, wrapping round the lap.
      let a = k[k.length - 1], at = a.t - 1;
      let b = k[0],            bt = k[0].t;
      for (let j = 0; j < k.length; j++) {
        if (k[j].t <= t) {
          a = k[j]; at = k[j].t;
          b = k[(j + 1) % k.length];
          bt = (j + 1 < k.length) ? k[j + 1].t : k[0].t + 1;
        }
      }
      const span = bt - at;
      let f = span > 1e-6 ? (t - at) / span : 0;
      f = f * f * (3 - 2 * f);                    // smoothstep
      out[i] = { z: a.z + (b.z - a.z) * f, level: a.level || 0 };
    }
    return out;
  },

  build(def) {
    const self = this;
    const line = this.resample(this.spline(def.control, 24), 80);
    const n = line.length;
    const half = def.roadWidth / 2;
    const elev = this.resolveElevation(def, n);
    const elevated = !!(def.elevation && def.elevation.length);

    // ── kerbs ──────────────────────────────────────────────────────────────
    // Edge points carry the road height as a third component, so everything
    // downstream can draw them without looking the elevation up again.
    const outer = [], inner = [];
    for (let i = 0; i < n; i++) {
      const t = this.tangentAt(line, i);
      const nx = -t[1], ny = t[0];
      outer.push([line[i][0] + nx * half, line[i][1] + ny * half, elev[i].z]);
      inner.push([line[i][0] - nx * half, line[i][1] - ny * half, elev[i].z]);
    }

    // ── walls ──────────────────────────────────────────────────────────────
    const walls = [];
    function edgeToWalls(pts, h, clearAt) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        walls.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1],
                     h: h, clearAt: clearAt,
                     // Which deck this barrier belongs to. Undefined on flat
                     // tracks, where every wall applies to everyone.
                     level: elevated ? elev[i].level : undefined,
                     z: elev[i].z });
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
      const sc = def.shortcut;
      // Authored by WORLD POSITION where possible. Lap fractions are guesswork
      // the moment a control point moves — the same trap as hand-placing
      // collectibles.
      if (sc.fromXY) {
        cutFrom = this.nearestIndex(line, sc.fromXY[0], sc.fromXY[1]);
        cutTo   = this.nearestIndex(line, sc.toXY[0],   sc.toXY[1]);
      } else {
        cutFrom = Math.floor(sc.fromT * n) % n;
        cutTo   = Math.floor(sc.toT   * n) % n;
      }
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
                   h: kerbH, clearAt: Infinity,
                   level: elevated ? elev[i].level : undefined,
                   z: elev[i].z });
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
          level: elevated ? elev[cutFrom].level : undefined,
          z: elev[cutFrom].z,
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
      const pe = elev[this.nearestIndex(line, p.x, p.y)];
      for (let s = 0; s < sides; s++) {
        const a0 = (s / sides) * Math.PI * 2 + p.rot;
        const a1 = ((s + 1) / sides) * Math.PI * 2 + p.rot;
        walls.push({
          ax: p.x + Math.cos(a0) * p.r, ay: p.y + Math.sin(a0) * p.r,
          bx: p.x + Math.cos(a1) * p.r, by: p.y + Math.sin(a1) * p.r,
          h: p.h, clearAt: p.clearAt === undefined ? Infinity : p.clearAt,
          level: elevated ? pe.level : undefined,
          z: pe.z,
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
    const every = def.checkpointEvery || 6;

    /* Which centreline points get a gate.
       NOTHING inside the bypassed section does. 05_Tracks.md requires every
       route through the same sequence, and a gate in there cannot satisfy
       that: deep in a detour the road's perpendicular points AWAY from the
       chord, so no amount of extra reach makes the shortcut cross it. Two
       gates were being skipped outright, which meant a lap taken via the
       shortcut never validated.

       Instead the junctions themselves are gated. Both routes pass through
       them by definition, because that is what a junction is. */
    const gateAt = [];
    const strictlyInsideCut = function (i) {
      return cutFrom >= 0 && inCut(i) && i !== cutFrom && i !== cutTo;
    };
    for (let k = 0; k < n; k += every) {
      const i = (startIdx + k) % n;
      if (strictlyInsideCut(i)) continue;
      gateAt.push(i);
    }
    if (cutFrom >= 0) {
      if (gateAt.indexOf(cutFrom) === -1) gateAt.push(cutFrom);
      if (gateAt.indexOf(cutTo) === -1) gateAt.push(cutTo);
    }
    // Order along the direction of travel, starting at the finish.
    gateAt.sort(function (p, q) {
      return ((p - startIdx + n) % n) - ((q - startIdx + n) % n);
    });

    const checkpoints = [];
    for (let g = 0; g < gateAt.length; g++) {
      const i = gateAt[g];
      const t = this.tangentAt(line, i);
      const nx = -t[1], ny = t[0];
      const reach = half + overhang;
      checkpoints.push({
        id: g,
        a: [line[i][0] - nx * reach, line[i][1] - ny * reach],
        b: [line[i][0] + nx * reach, line[i][1] + ny * reach],
        isFinish: i === startIdx,
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

    const out = {
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
      /* Toy pieces are authored TRACK-RELATIVE, not in world coordinates:
           { t, offset }  t is the fraction round the lap, offset is -1..1
                          across the road, 0 being the centre line
           { cut }        a fraction along the shortcut chord

         Hand-placed x/y is still honoured, but it is how the first attempt put
         a piece 521 units from the road — behind a wall, permanently
         uncollectable — and two more on grass. Authoring against the track
         makes that class of mistake impossible. */
      collectibles: (def.collectibles || []).map(function (c) {
        if (c.x !== undefined) return { id: c.id, x: c.x, y: c.y };

        if (c.cut !== undefined && chord) {
          const px = chord[0][0] + (chord[1][0] - chord[0][0]) * c.cut;
          const py = chord[0][1] + (chord[1][1] - chord[0][1]) * c.cut;

          // Pull it off the chord and into the cut. The chord IS the cut
          // polygon's closing edge, so a point exactly on it sits on the
          // boundary, where the surface test is ambiguous — it came back as
          // rug rather than as the shortcut's own surface.
          if (cutPoly && cutPoly.length) {
            const a = cutPoly[Math.min(cutPoly.length - 1,
                        Math.floor(c.cut * (cutPoly.length - 1)))];
            const inset = c.inset === undefined ? 0.35 : c.inset;
            return { id: c.id,
                     x: px + (a[0] - px) * inset,
                     y: py + (a[1] - py) * inset };
          }
          return { id: c.id, x: px, y: py };
        }

        const i = Math.floor(((c.t % 1) + 1) % 1 * n) % n;
        const tg = self.tangentAt(line, i);
        // 0.8 keeps it clear of the kerb even at full offset.
        const off = (c.offset || 0) * half * 0.8;
        return {
          id: c.id,
          x: line[i][0] - tg[1] * off,
          y: line[i][1] + tg[0] * off,
        };
      }),
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
      /* Loops. Defaults live here rather than in every track file, and `dir` is
         normalised once so Rails can trust it. */
      rails: (def.rails || []).map(function (r) {
        const len = Math.hypot(r.dir[0], r.dir[1]) || 1;
        return {
          x: r.x, y: r.y, w: r.w, h: r.h,
          dir: [r.dir[0] / len, r.dir[1] / len],
          // Listing fields explicitly means a new one has to be added HERE too.
          // kind and turns were not, so the first corkscrew was silently built
          // as a single-turn loop and every measurement of it described a loop.
          kind: r.kind || 'loop',
          turns: r.turns || 1,
          radius: r.radius || 130,
          length: r.length === undefined ? 150 : r.length,
          width: r.width || 150,
          minSpeed: r.minSpeed === undefined ? 230 : r.minSpeed,
          exitBoost: r.exitBoost === undefined ? 0.35 : r.exitBoost,
          colour:     r.colour     || '#8a63d2',
          altColour:  r.altColour  || '#6f4cb8',
          railColour: r.railColour || '#c9b3f0',
        };
      }),
      decoration: def.decoration || [],
      haze: def.haze || null,          // depth-fade colour, "r,g,b"

      /* Surfaces and colours are per world now rather than baked into the
         renderer — a sandbox is not a bedroom rug with different numbers. */
      baseSurface: def.baseSurface || 'rugRoad',
      offSurface:  def.offSurface  || 'rugGrass',
      groundColour: def.groundColour || '#5c8a4a',
      roadColour:   def.roadColour   || '#403c39',
      weaveColour:  def.weaveColour  || 'rgba(0,0,0,0.055)',
      sandy: !!def.sandy,
      skirtColour: def.skirtColour || 'rgba(38,32,46,0.85)',
      elevated: elevated,
      elevation: elev,
      levelCount: elev.reduce(function (m, e) { return Math.max(m, e.level); }, 0) + 1,
      bounds: { minX: minX - 400, minY: minY - 400,
                maxX: maxX + 400, maxY: maxY + 400,
                w: maxX - minX, h: maxY - minY },
    };

    out.strays = this.findStrayRects(out, def);

    /* EVERY wall on an elevated track must know its deck. A wall with no level
       applies to every car on every level, so it becomes an invisible barrier
       hanging in the air across whatever passes underneath.

       This is not a hypothetical either: `level` was added to edgeToWalls and
       three other places push walls directly — the inner kerb, the shortcut
       chord and the props. The inner kerb of the raised deck stayed a solid
       wall to cars on the floor below, and the first stunt track simply could
       not be driven. Nothing pointed at it; the car just stopped. */
    if (elevated) {
      const levelless = out.walls.filter(function (w) {
        return w.level === undefined;
      }).length;
      if (levelless && typeof console !== 'undefined') {
        console.warn('TRACK ' + def.id + ': ' + levelless + ' of ' +
                     out.walls.length + ' walls have no level and will block ' +
                     'every deck. Every walls.push must set one.');
      }
      out.levellessWalls = levelless;
    }

    /* Anything sitting ON the road needs the road's height, or it stays on the
       bedroom floor while the track climbs away above it. Resolved once here
       rather than per frame — none of it moves. */
    if (elevated) {
      const lift = function (item, x, y) {
        item.z = elev[self.nearestIndex(line, x, y)].z;
      };
      out.boostPads.forEach(function (p) { lift(p, p.x + p.w / 2, p.y + p.h / 2); });
      out.ramps.forEach(function (r) { lift(r, r.x + r.w / 2, r.y + r.h / 2); });
      out.collectibles.forEach(function (c) { lift(c, c.x, c.y); });
      out.props.forEach(function (p) { lift(p, p.x, p.y); });
      out.hazards.forEach(function (h) { lift(h, h.x, h.y); });
      out.finishZ = elev[self.nearestIndex(line, def.finish[0], def.finish[1])].z;
    }
    return out;
  },

  /**
   * Rectangle features that do not overlap the road, and so can never fire.
   *
   * EVERY RECTANGLE IN A TRACK DEFINITION IS ANCHORED AT ITS CORNER, not its
   * centre — zones, ramps and boost pads all test `x <= p <= x + w`. Authoring
   * one as though it were centred puts it half a box off the road, and nothing
   * complains: the ramp simply never launches and the pad never boosts.
   *
   * Three of the four ramps and a boost pad on the Sandbox tracks shipped that
   * way and were only caught by driving a car at them and noticing it stayed on
   * the ground. Silence is the wrong response to a feature that cannot fire, so
   * the build now says so.
   */
  findStrayRects(out, def) {
    const line = out.centreline, half = out.halfWidth;
    const strays = [];

    const check = function (kind, i, r) {
      for (let k = 0; k < line.length; k++) {
        const x = line[k][0], y = line[k][1];
        // The road is a band, so allow anything within half a road width of a
        // centreline point that falls inside the box.
        if (x >= r.x - half && x <= r.x + r.w + half &&
            y >= r.y - half && y <= r.y + r.h + half) {
          // Tighter test: does the box itself reach the centreline?
          const cx = Math.max(r.x, Math.min(x, r.x + r.w));
          const cy = Math.max(r.y, Math.min(y, r.y + r.h));
          if (Math.hypot(cx - x, cy - y) <= half) return;
        }
      }
      strays.push(kind + '[' + i + '] at ' + Math.round(r.x) + ',' +
                  Math.round(r.y) + ' ' + r.w + 'x' + r.h +
                  ' never touches the road');
    };

    (def.ramps || []).forEach(function (r, i) { check('ramp', i, r); });
    (def.boostPads || []).forEach(function (r, i) { check('boostPad', i, r); });
    (def.zones || []).forEach(function (r, i) { check('zone', i, r); });
    (def.rails || []).forEach(function (r, i) { check('rail', i, r); });

    if (strays.length && typeof console !== 'undefined') {
      console.warn('TRACK ' + def.id + ': ' + strays.join('; '));
    }
    return strays;
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
   * Where on the track is this point, and on which deck?
   *
   * Searched in a WINDOW around the last known index rather than globally. On a
   * track that crosses over itself the two nearest centreline points are on
   * different levels and a global search picks whichever is geometrically
   * closer — which is how a car on the upper deck gets told it is on the road
   * below it. Following the car's own progress round the lap keeps it honest.
   *
   * Falls back to a global search when the windowed answer is implausibly far,
   * which covers a reset, a big shortcut, or the first call of a race.
   */
  trackAt(track, x, y, prevIdx) {
    const line = track.centreline, n = line.length;
    const elev = track.elevation;
    let best = Infinity, bi = 0;

    if (prevIdx !== undefined && prevIdx >= 0) {
      for (let k = -16; k <= 16; k++) {
        const i = ((prevIdx + k) % n + n) % n;
        const d = (line[i][0] - x) * (line[i][0] - x) +
                  (line[i][1] - y) * (line[i][1] - y);
        if (d < best) { best = d; bi = i; }
      }
    }
    // Too far to be believable — the car is not where we thought it was.
    if (best > (track.halfWidth * 6) * (track.halfWidth * 6)) {
      best = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (line[i][0] - x) * (line[i][0] - x) +
                  (line[i][1] - y) * (line[i][1] - y);
        if (d < best) { best = d; bi = i; }
      }
    }
    return { idx: bi, level: elev[bi].level, z: elev[bi].z,
             dist: Math.sqrt(best) };
  },

  surfaceAt(track, x, y, level) {
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

    /* Distance to the centreline rather than point-in-polygon: the road is
       built from that centreline, so the test is exact and far cheaper.

       On an elevated track only segments on the CAR'S OWN DECK count. Without
       that, a car crossing over a lower road is told it is on tarmac when it is
       actually in mid-air above it — and worse, a car that falls off the upper
       deck lands on road it should have missed. */
    const line = track.centreline, elev = track.elevation;
    const filter = track.elevated && level !== undefined && level !== null;
    let best = Infinity;
    for (let i = 0; i < line.length; i++) {
      if (filter && elev[i].level !== level) continue;
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
    return Math.sqrt(best) <= track.halfWidth
      ? (track.baseSurface || 'rugRoad')
      : (track.offSurface || 'rugGrass');
  },

  /**
   * The handling modifiers under a point.
   *
   * Usually just the named surface's entry, but sand BLENDS: loose sand and
   * packed sand are the two ends of a continuum, and where a car sits between
   * them depends on how worn that patch of ground is. Returning numbers rather
   * than a name is what lets the ground be continuous instead of stepping
   * between two states.
   */
  surfaceModsAt(track, x, y, name) {
    const S = BR.SURFACES;
    const base = S[name] || S.rugRoad;
    if (name !== 'sand' || !BR.SandGrid.active) return base;

    const t = BR.SandGrid.at(x, y);
    if (t <= 0) return base;
    const packed = S.packedSand;
    return {
      grip:     base.grip     + (packed.grip     - base.grip)     * t,
      maxSpeed: base.maxSpeed + (packed.maxSpeed - base.maxSpeed) * t,
      accel:    base.accel    + (packed.accel    - base.accel)    * t,
    };
  },

  /**
   * Put every hazard back to its authored phase.
   *
   * MUST be called when a race starts. Tracks are cached and reused, so
   * without this the train carries its position over from the previous
   * attempt and sits somewhere different on every retry — which breaks the
   * learnability 05_Tracks.md requires, and breaks ghost replay outright,
   * since the ghost would meet the train at a different moment than the run
   * it was recorded from.
   */
  resetHazards(track) {
    for (let i = 0; i < track.hazards.length; i++) {
      const h = track.hazards[i];
      h.t = h.phase || 0;
      h.x = h.path[0][0];
      h.y = h.path[0][1];
      h.heading = 0;
    }
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
