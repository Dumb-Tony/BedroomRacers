/* =============================================================================
   RENDERER — the ONLY place that knows the camera is tilted.
   =============================================================================
   Everything drawn here goes through BR.Projection.project(). The simulation
   never sees a projected coordinate. That boundary is what lets groundTilt
   change without touching gameplay code — and it will change, because locking
   it is a Phase 1 exit criterion.

   Vehicles are drawn as EXTRUDED PRISMS from procedural geometry, not sprites.
   Deliberate: at an angle, a rotating flat sprite reads as pancaked
   (12_Art_Guide.md "The rotation problem"). Real vehicles need 16 pre-rendered
   heading frames, which cannot be produced until the tilt is locked. Drawing
   the box live means the tilt can be dragged around and judged immediately.
   ========================================================================== */

window.BR = window.BR || {};

BR.Renderer = {

  canvas: null,
  ctx: null,
  w: 0, h: 0, dpr: 1,
  cam: { x: 0, y: 0 },
  ready: false,

  RAMP_HEIGHT: 22,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.w = w; this.h = h;
    this.canvas.width  = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
  },

  snapCameraTo(x, y) {
    const p = BR.Projection.project(x, y, 0);
    this.cam.x = p.sx;
    this.cam.y = p.sy;
  },

  updateCamera(v, ix, iy, dt) {
    const C = BR.CAMERA;
    const M = BR.M;

    // Bias ahead of the car along its velocity. Ground position only — a
    // camera that follows z bounces during jumps.
    let tx = ix, ty = iy;
    if (C.lookAhead > 0) {
      const ax = v.vel.x * C.lookAhead;
      const ay = v.vel.y * C.lookAhead;
      const mag = Math.hypot(ax, ay);
      const scale = mag > C.lookAheadMax ? C.lookAheadMax / mag : 1;
      tx += ax * scale;
      ty += ay * scale;
    }

    const target = BR.Projection.project(tx, ty, 0);
    const k = 1 - Math.exp(-C.followRate * dt);   // frame-rate independent lerp
    this.cam.x = M.lerp(this.cam.x, target.sx, k);
    this.cam.y = M.lerp(this.cam.y, target.sy, k);
  },

  /**
   * @param {object} v      vehicle
   * @param {object} arena
   * @param {number} alpha  0..1 interpolation between the last two sim states
   * @param {number} dt     real frame delta, for camera smoothing only
   */
  render(v, arena, alpha, dt) {
    const ctx = this.ctx;
    const M = BR.M;
    const Pj = BR.Projection;

    // Interpolate between simulation states so a 144Hz display is smooth on a
    // 60Hz sim.
    const ix = M.lerp(v.prevX, v.x, alpha);
    const iy = M.lerp(v.prevY, v.y, alpha);
    const iz = M.lerp(v.prevZ, v.z, alpha);
    const ih = v.prevHeading + M.wrapAngle(v.heading - v.prevHeading) * alpha;

    this.updateCamera(v, ix, iy, dt);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // Room floor behind the arena.
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(BR.CAMERA.zoom, BR.CAMERA.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    this.drawGround(ctx, arena);
    this.drawGrid(ctx, arena);
    this.drawMarks(ctx);
    this.drawRamps(ctx, arena);

    // ── depth sort: walls and the vehicle interleave by world y ────────────
    const drawables = [];
    for (let i = 0; i < arena.walls.length; i++) {
      const w = arena.walls[i];
      drawables.push({ key: Pj.depthOf(Math.max(w.ay, w.by)), wall: w });
    }
    drawables.push({ key: Pj.depthOf(iy), car: true });
    drawables.sort((a, b) => a.key - b.key);

    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      if (d.wall) this.drawWall(ctx, d.wall, arena.wallHeight);
      else        this.drawVehicle(ctx, v, ix, iy, iz, ih);
    }

    this.drawDust(ctx);

    ctx.restore();

    BR.HUD.draw(ctx, v, this.w, this.h);
  },

  // ── ground ───────────────────────────────────────────────────────────────

  drawGround(ctx, arena) {
    const outer = arena.polygons[0];
    ctx.beginPath();
    for (let i = 0; i < outer.length; i++) {
      const p = BR.Projection.project(outer[i][0], outer[i][1], 0);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    ctx.fillStyle = '#4e7d43';        // placeholder rug green
    ctx.fill();

    // The island reads as a hole in the drivable area.
    const island = arena.polygons[1];
    ctx.beginPath();
    for (let i = 0; i < island.length; i++) {
      const p = BR.Projection.project(island[i][0], island[i][1], 0);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    ctx.fillStyle = '#3c3a35';
    ctx.fill();
  },

  /* Grid lines are the clearest read on how much the plane is tilted — the
     main visual aid for locking groundTilt. */
  drawGrid(ctx, arena) {
    const Pj = BR.Projection;
    const step = 150;
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1 / BR.CAMERA.zoom;
    ctx.beginPath();
    for (let x = 0; x <= arena.bounds.w; x += step) {
      const a = Pj.project(x, 0, 0), b = Pj.project(x, arena.bounds.h, 0);
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
    }
    for (let y = 0; y <= arena.bounds.h; y += step) {
      const a = Pj.project(0, y, 0), b = Pj.project(arena.bounds.w, y, 0);
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
    }
    ctx.stroke();
  },

  // ── walls ────────────────────────────────────────────────────────────────

  drawWall(ctx, w, H) {
    const Pj = BR.Projection;
    const a0 = Pj.project(w.ax, w.ay, 0);
    const b0 = Pj.project(w.bx, w.by, 0);
    const a1 = Pj.project(w.ax, w.ay, H);
    const b1 = Pj.project(w.bx, w.by, H);

    ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy);
    ctx.lineTo(b0.sx, b0.sy);
    ctx.lineTo(b1.sx, b1.sy);
    ctx.lineTo(a1.sx, a1.sy);
    ctx.closePath();
    ctx.fillStyle = '#6b5f52';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(a1.sx, a1.sy);
    ctx.lineTo(b1.sx, b1.sy);
    ctx.strokeStyle = '#a4907c';
    ctx.lineWidth = 2.5 / BR.CAMERA.zoom;
    ctx.stroke();
  },

  // ── ramp ─────────────────────────────────────────────────────────────────

  drawRamps(ctx, arena) {
    const Pj = BR.Projection;
    for (let i = 0; i < arena.ramps.length; i++) {
      const r = arena.ramps[i];
      const lo0 = Pj.project(r.x,       r.y + r.h, 0);
      const lo1 = Pj.project(r.x + r.w, r.y + r.h, 0);
      const hi0 = Pj.project(r.x,       r.y, this.RAMP_HEIGHT);
      const hi1 = Pj.project(r.x + r.w, r.y, this.RAMP_HEIGHT);

      ctx.beginPath();
      ctx.moveTo(lo0.sx, lo0.sy);
      ctx.lineTo(lo1.sx, lo1.sy);
      ctx.lineTo(hi1.sx, hi1.sy);
      ctx.lineTo(hi0.sx, hi0.sy);
      ctx.closePath();
      ctx.fillStyle = '#b8873f';
      ctx.fill();
      ctx.strokeStyle = '#e0b46a';
      ctx.lineWidth = 2 / BR.CAMERA.zoom;
      ctx.stroke();
    }
  },

  // ── particles ────────────────────────────────────────────────────────────

  drawMarks(ctx) {
    const Pj = BR.Projection;
    const marks = BR.Particles.marks;
    ctx.lineCap = 'round';
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (m.life <= 0) continue;
      const t = m.life / m.max;
      const half = 5;
      const c = Math.cos(m.rot) * half, s = Math.sin(m.rot) * half;
      const p0 = Pj.project(m.x - c, m.y - s, 0);
      const p1 = Pj.project(m.x + c, m.y + s, 0);
      ctx.strokeStyle = 'rgba(30,24,20,' + (m.a * t).toFixed(3) + ')';
      ctx.lineWidth = m.w / 2;
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.stroke();
    }
  },

  drawDust(ctx) {
    const Pj = BR.Projection;
    const dust = BR.Particles.dust;
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      if (d.life <= 0) continue;
      const t = d.life / d.max;
      const p = Pj.project(d.x, d.y, d.z);
      ctx.fillStyle = 'rgba(214,198,170,' + (0.34 * t).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, d.r * (1.4 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // ── vehicle ──────────────────────────────────────────────────────────────

  drawVehicle(ctx, v, x, y, z, heading) {
    const Pj = BR.Projection;
    const spec = v.spec;
    const L = spec.length / 2, W = spec.width / 2, H = spec.height;
    const c = Math.cos(heading), s = Math.sin(heading);

    // Footprint corners, rotated in WORLD space then projected. This is the
    // architecture in miniature: rotate flat, project last.
    const local = [[L, -W], [L, W], [-L, W], [-L, -W]];
    const world = local.map(function (p) {
      return [x + p[0] * c - p[1] * s, y + p[0] * s + p[1] * c];
    });

    // ── shadow: always at z=0. The GAP between car and shadow is the only
    //    height cue there is (03_Driving_Physics.md).
    const lift = BR.M.clamp(z / 90, 0, 1);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = Pj.project(world[i][0], world[i][1], 0);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.42 * (1 - lift * 0.55)).toFixed(3) + ')';
    ctx.fill();

    // ── boost ring, on the ground around the car (vehicle-attached meter).
    //    Drawn as an ellipse squashed by groundTilt so it sits ON the plane.
    if (v.boostMeter > 0.001) {
      const g = Pj.project(x, y, 0);
      const rr = spec.length * 0.86;
      ctx.beginPath();
      ctx.ellipse(g.sx, g.sy, rr, rr * Pj.groundTilt, 0,
                  -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.boostMeter);
      ctx.strokeStyle = v.boosting ? '#ffd34d'
        : (v.boostMeter >= BR.PHYSICS.boostMinToFire ? '#4fd8a8' : '#69a2ff');
      ctx.lineWidth = 3 / BR.CAMERA.zoom + 1.5;
      ctx.stroke();
    }

    const base = world.map(function (p) { return Pj.project(p[0], p[1], z); });
    const top  = world.map(function (p) { return Pj.project(p[0], p[1], z + H); });

    // ── sides, nearer edges last so they overdraw correctly ────────────────
    const edges = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      edges.push({ i: i, j: j, key: (world[i][1] + world[j][1]) / 2 });
    }
    edges.sort(function (a, b) { return a.key - b.key; });

    ctx.fillStyle = spec.colorBody;
    for (let e = 0; e < edges.length; e++) {
      const i = edges[e].i, j = edges[e].j;
      ctx.beginPath();
      ctx.moveTo(base[i].sx, base[i].sy);
      ctx.lineTo(base[j].sx, base[j].sy);
      ctx.lineTo(top[j].sx,  top[j].sy);
      ctx.lineTo(top[i].sx,  top[i].sy);
      ctx.closePath();
      ctx.fill();
    }

    // ── top face ───────────────────────────────────────────────────────────
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      if (i === 0) ctx.moveTo(top[i].sx, top[i].sy);
      else ctx.lineTo(top[i].sx, top[i].sy);
    }
    ctx.closePath();
    ctx.fillStyle = spec.colorTop;
    ctx.fill();

    // ── nose wedge, so heading is never ambiguous ──────────────────────────
    const nose = [[L, -W * 0.55], [L, W * 0.55], [L * 0.34, 0]].map(function (p) {
      const wx = x + p[0] * c - p[1] * s;
      const wy = y + p[0] * s + p[1] * c;
      return Pj.project(wx, wy, z + H);
    });
    ctx.beginPath();
    ctx.moveTo(nose[0].sx, nose[0].sy);
    ctx.lineTo(nose[1].sx, nose[1].sy);
    ctx.lineTo(nose[2].sx, nose[2].sy);
    ctx.closePath();
    ctx.fillStyle = spec.colorTrim;
    ctx.fill();
  },
};
