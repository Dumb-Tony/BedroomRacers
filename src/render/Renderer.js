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
  // Camera focus in WORLD space, plus the yaw the view is rotated to.
  camX: 0, camY: 0, camYaw: 0,
  ready: false,

  // Matches the hurdle height, so the ramp visibly lifts you exactly enough.
  RAMP_HEIGHT: 20,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // The game must not assume it owns the window — it may be embedded in a
    // panel that resizes without the window doing so.
    if (window.ResizeObserver && canvas.parentElement) {
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;

    // Size to the containing element, falling back to the viewport.
    const host = this.canvas.parentElement;
    const box = host ? host.getBoundingClientRect() : null;
    const w = Math.max(1, Math.round(box && box.width  ? box.width  : window.innerWidth));
    const h = Math.max(1, Math.round(box && box.height ? box.height : window.innerHeight));

    this.dpr = dpr;
    this.w = w; this.h = h;
    this.canvas.width  = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
  },

  /* Jump the camera straight to the car with no easing. Used on spawn and
     reset, so the view doesn't sweep across the arena. */
  snapCameraTo(x, y, yaw) {
    this.camX = x;
    this.camY = y;
    this.camYaw = yaw || 0;
  },

  updateCamera(v, ix, iy, dt) {
    const C = BR.CAMERA;
    const M = BR.M;

    // ── yaw: follow the DIRECTION OF TRAVEL, not the heading ───────────────
    // Following the nose would swing the view sideways every time the car
    // drifts. Following velocity keeps the view pointed where the car is
    // actually going, and the car visibly yaws within the frame instead.
    const speed = Math.hypot(v.vel.x, v.vel.y);
    const forward = v.vel.x * Math.cos(v.heading) + v.vel.y * Math.sin(v.heading);

    let targetYaw;
    if (speed > C.yawMinSpeed && forward > 0) {
      targetYaw = Math.atan2(v.vel.y, v.vel.x);
    } else {
      // Crawling, stopped, or reversing. Velocity direction is noise here, and
      // reversing would otherwise whip the camera through 180 degrees.
      targetYaw = v.heading;
    }

    const dYaw = M.wrapAngle(targetYaw - this.camYaw);
    this.camYaw += dYaw * (1 - Math.exp(-C.yawRate * dt));

    // ── position: world space, ground plane only ───────────────────────────
    // Deliberately ignores z — a camera that tracks height bounces on jumps.
    let tx = ix, ty = iy;
    if (C.lookAhead > 0) {
      const ax = v.vel.x * C.lookAhead;
      const ay = v.vel.y * C.lookAhead;
      const mag = Math.hypot(ax, ay);
      const scale = mag > C.lookAheadMax ? C.lookAheadMax / mag : 1;
      tx += ax * scale;
      ty += ay * scale;
    }

    const k = 1 - Math.exp(-C.followRate * dt);   // frame-rate independent lerp
    this.camX = M.lerp(this.camX, tx, k);
    this.camY = M.lerp(this.camY, ty, k);
  },

  /**
   * @param {object} v      vehicle
   * @param {object} arena
   * @param {number} alpha  0..1 interpolation between the last two sim states
   * @param {number} dt     real frame delta, for camera smoothing only
   */
  /**
   * @param {Array}  racers  every vehicle in the race
   * @param {object} player  the vehicle the camera follows
   */
  render(racers, player, arena, alpha, dt) {
    const ctx = this.ctx;
    const M = BR.M;
    const Pj = BR.Projection;
    const v = player;

    // Interpolate between simulation states so a 144Hz display is smooth on a
    // 60Hz sim.
    const ix = M.lerp(v.prevX, v.x, alpha);
    const iy = M.lerp(v.prevY, v.y, alpha);
    const ih = v.prevHeading + M.wrapAngle(v.heading - v.prevHeading) * alpha;

    this.updateCamera(v, ix, iy, dt);

    // Hand the camera to the projection BEFORE anything projects. Everything
    // downstream comes back already camera-relative, so the only transform
    // left is centring.
    Pj.setCamera(this.camX, this.camY, this.camYaw);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // Room floor behind the arena.
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    // horizonBias pushes the car down the screen so more road is visible
    // ahead of it. This is what makes the camera read as "behind" the car.
    ctx.translate(this.w / 2, this.h * BR.CAMERA.horizonBias);
    ctx.scale(BR.CAMERA.zoom, BR.CAMERA.zoom);

    this.drawGround(ctx, arena);
    this.drawGrid(ctx, arena);
    this.drawFinishLine(ctx, arena);
    this.drawMarks(ctx);
    this.drawRamps(ctx, arena);

    // ── depth sort: walls and the vehicle interleave ───────────────────────
    // Sorted on CAMERA-space depth, not world y. With a rotating camera,
    // "further away" depends on where the camera is looking.
    const drawables = [];
    for (let i = 0; i < arena.walls.length; i++) {
      const w = arena.walls[i];
      drawables.push({
        key: Math.max(Pj.depthAt(w.ax, w.ay), Pj.depthAt(w.bx, w.by)),
        wall: w,
      });
    }
    for (let i = 0; i < racers.length; i++) {
      const c = racers[i];
      const cx = M.lerp(c.prevX, c.x, alpha);
      const cy = M.lerp(c.prevY, c.y, alpha);
      const cz = M.lerp(c.prevZ, c.z, alpha);
      const ch = c.prevHeading + M.wrapAngle(c.heading - c.prevHeading) * alpha;
      drawables.push({ key: Pj.depthAt(cx, cy), car: c, cx: cx, cy: cy, cz: cz, ch: ch });
    }
    drawables.sort((a, b) => a.key - b.key);

    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      if (d.wall) this.drawWall(ctx, d.wall, arena.wallHeight);
      else        this.drawVehicle(ctx, d.car, d.cx, d.cy, d.cz, d.ch, d.car === v);
    }

    this.drawDust(ctx);

    ctx.restore();

    BR.HUD.draw(ctx, v, this.w, this.h);
  },

  /* Chequered finish line, painted on the ground plane. */
  drawFinishLine(ctx, arena) {
    const Pj = BR.Projection;
    const cps = arena.checkpoints;
    if (!cps || !cps.length) return;

    const f = cps[0];
    const ax = f.a[0], ay = f.a[1], bx = f.b[0], by = f.b[1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;   // along the direction of travel
    const depth = 34;
    const squares = 12;

    for (let i = 0; i < squares; i++) {
      for (let row = 0; row < 2; row++) {
        if ((i + row) % 2 === 0) continue;
        const t0 = i / squares, t1 = (i + 1) / squares;
        const o0 = (row - 1) * depth, o1 = row * depth;
        const p = [
          Pj.project(ax + dx * t0 + nx * o0, ay + dy * t0 + ny * o0, 0),
          Pj.project(ax + dx * t1 + nx * o0, ay + dy * t1 + ny * o0, 0),
          Pj.project(ax + dx * t1 + nx * o1, ay + dy * t1 + ny * o1, 0),
          Pj.project(ax + dx * t0 + nx * o1, ay + dy * t0 + ny * o1, 0),
        ];
        ctx.beginPath();
        ctx.moveTo(p[0].sx, p[0].sy);
        for (let k = 1; k < 4; k++) ctx.lineTo(p[k].sx, p[k].sy);
        ctx.closePath();
        ctx.fillStyle = 'rgba(240,236,228,0.85)';
        ctx.fill();
      }
    }
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

  drawWall(ctx, w, fallbackH) {
    const Pj = BR.Projection;
    const H = w.h === undefined ? fallbackH : w.h;

    // Jumpable barriers are drawn in a warning colour so a player can tell at
    // a glance what they are meant to fly over rather than avoid.
    const jumpable = isFinite(w.clearAt);

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
    ctx.fillStyle = jumpable ? '#9c5f2a' : '#6b5f52';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(a1.sx, a1.sy);
    ctx.lineTo(b1.sx, b1.sy);
    ctx.strokeStyle = jumpable ? '#e0b46a' : '#a4907c';
    ctx.lineWidth = 2.5 / BR.CAMERA.zoom;
    ctx.stroke();
  },

  // ── ramp ─────────────────────────────────────────────────────────────────

  /* The wedge must slope along the direction of travel, not across it, so the
     ramp's `rise` vector decides which pair of edges is the high one. */
  drawRamps(ctx, arena) {
    const Pj = BR.Projection;

    for (let i = 0; i < arena.ramps.length; i++) {
      const r = arena.ramps[i];
      const x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.h;
      const rise = r.rise || [0, -1];

      let loA, loB, hiA, hiB;
      if (rise[0] < 0)      { hiA = [x0, y0]; hiB = [x0, y1]; loA = [x1, y0]; loB = [x1, y1]; }
      else if (rise[0] > 0) { hiA = [x1, y0]; hiB = [x1, y1]; loA = [x0, y0]; loB = [x0, y1]; }
      else if (rise[1] < 0) { hiA = [x0, y0]; hiB = [x1, y0]; loA = [x0, y1]; loB = [x1, y1]; }
      else                  { hiA = [x0, y1]; hiB = [x1, y1]; loA = [x0, y0]; loB = [x1, y0]; }

      const p0 = Pj.project(loA[0], loA[1], 0);
      const p1 = Pj.project(loB[0], loB[1], 0);
      const p2 = Pj.project(hiB[0], hiB[1], this.RAMP_HEIGHT);
      const p3 = Pj.project(hiA[0], hiA[1], this.RAMP_HEIGHT);

      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.closePath();
      ctx.fillStyle = '#b8873f';
      ctx.fill();

      // Lip along the top edge, so the launch point is unmistakable.
      ctx.beginPath();
      ctx.moveTo(p3.sx, p3.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3 / BR.CAMERA.zoom;
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

  drawVehicle(ctx, v, x, y, z, heading, isPlayer) {
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
    //    Player only — a ring under every opponent is noise, not information.
    if (isPlayer && v.boostMeter > 0.001) {
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
