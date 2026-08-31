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

  // Shared upright, for every car not on a ride.
  UP: { x: 0, y: 0, z: 1 },

  /* Slack around the viewport when culling. Objects are tested by a single
     point but occupy real space, so this must comfortably exceed the largest
     thing drawn — a loop ribbon segment, which reaches ~240 units. */
  CULL_PAD: 340,
  // Switched off only by the verification harness, to prove the culled frame
  // is pixel-identical to the unculled one.
  CULL: true,

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
  /* Cameras live on the VIEW, not on the renderer. Split-screen needs one per
     player, and a singleton camera is exactly the thing that makes adding a
     second viewport painful later. */
  snapCameraTo(x, y, yaw) {
    const views = BR.Game && BR.Game.views;
    if (!views) return;
    for (let i = 0; i < views.length; i++) {
      const v = views[i].vehicle;
      views[i].cam.x = v ? v.x : x;
      views[i].cam.y = v ? v.y : y;
      views[i].cam.yaw = v ? v.heading : (yaw || 0);
      views[i].cam.z = v ? (v.roadZ || 0) : 0;
      /* The feel state resets too. A race starts stationary, so the zoom must
         start at rest rather than easing down from wherever the last one ended
         — and a shake left running across a restart would rattle the starting
         grid of the next race. */
      views[i].cam.zoom = BR.CAMERA.zoom;
      views[i].cam.kick = 0;
      views[i].cam.shake = 0;
      views[i].cam.wasBoosting = false;
      views[i].cam.lastImpacts = v ? (v.impacts || 0) : 0;
    }
  },

  /**
   * Motion streaks at the edges of the view.
   *
   * The projection has no perspective, so nothing flows past the camera to say
   * how fast you are going: the ground under a car at 350 units/sec looks
   * exactly like the ground under a car at 100. These are the flow, drawn
   * rather than derived.
   *
   * SCREEN SPACE, after the camera transform is unwound, and only near the
   * edges — a streak across the middle of the screen sits on top of the road
   * you are trying to read. They fade in from `streakSpeed` so ordinary driving
   * never has them, which is what keeps them meaning "fast" rather than
   * meaning "moving".
   */
  drawSpeedStreaks(ctx, v, W, H) {
    if (!v) return;
    const C = BR.CAMERA;
    const speed = Math.hypot(v.vel.x, v.vel.y);
    if (speed < C.streakSpeed) return;

    const top = (v.spec && v.spec.maxSpeed) || 300;
    const over = (speed - C.streakSpeed) / Math.max(1, top * 1.15 - C.streakSpeed);
    const a = Math.min(C.streakMax, over * C.streakMax);
    if (a <= 0.01) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    /* Deterministic placement from a fixed table rather than Math.random, for
       the same reason the pays check is seeded: streaks that jump about at
       random every frame read as static, and a renderer that consumes the
       random stream makes anything downstream of it unreproducible. */
    const N = 14;
    for (let i = 0; i < N; i++) {
      const f = (i * 0.6180339887) % 1;                 // golden-ratio spread
      const yy = f * H;
      const len = 40 + ((i * 37) % 60);
      // Left and right bands only, mirrored, well clear of the middle.
      const inset = ((i * 53) % 70);
      ctx.moveTo(inset, yy);       ctx.lineTo(inset + len, yy);
      ctx.moveTo(W - inset, yy);   ctx.lineTo(W - inset - len, yy);
    }
    ctx.stroke();
    ctx.restore();
  },

  updateCamera(cam, v, ix, iy, dt) {
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

    const dYaw = M.wrapAngle(targetYaw - cam.yaw);
    cam.yaw += dYaw * (1 - Math.exp(-C.yawRate * dt));

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
    cam.x = M.lerp(cam.x, tx, k);
    cam.y = M.lerp(cam.y, ty, k);

    /* Follow the DECK, never the jump. v.roadZ is the ground the car is
       standing on; v.z is how far it has left it. Tracking the first keeps a
       raised section framed, tracking the second would undo the gap between car
       and shadow that every height cue depends on. */
    cam.z = M.lerp(cam.z || 0, v.roadZ || 0, k);

    this.updateFeel(cam, v, speed, dt);
  },

  /**
   * Speed pull-back, boost punch and impact shake.
   *
   * PER CAMERA, not global. `BR.CAMERA.zoom` is one number for the whole game,
   * but in split screen four cars are at four different speeds — a shared zoom
   * would have one player's boost pull back everybody else's view.
   *
   * All of it is render-only. Nothing here is readable by the simulation.
   */
  updateFeel(cam, v, speed, dt) {
    const C = BR.CAMERA;
    const M = BR.M;

    /* Pull back with speed. Measured against the car's OWN top speed rather
       than a constant, so a slow car at full chat gets the same sense of
       flat-out as a fast one — the feeling is "this is as quick as I go", not
       "this is 350 units/sec". */
    const top = (v.spec && v.spec.maxSpeed) || 300;
    const frac = M.clamp(speed / (top * 1.15), 0, 1);
    const target = C.zoom * (1 - C.speedZoom * frac);
    if (cam.zoom === undefined) cam.zoom = target;
    cam.zoom = M.lerp(cam.zoom, target, 1 - Math.exp(-C.zoomRate * dt));

    // ── boost punch ────────────────────────────────────────────────────────
    // Edge-triggered on the boost starting, exactly like Audio does with its
    // counters: a fixed step can run several times per frame, and re-kicking
    // per sub-step would hold the view punched in for the whole boost.
    if (v.boosting && !cam.wasBoosting) cam.kick = C.boostKick;
    cam.wasBoosting = !!v.boosting;
    cam.kick = (cam.kick || 0) * Math.exp(-C.boostKickDecay * dt);

    /* ── impact shake ──────────────────────────────────────────────────────
       Driven off the `impacts` COUNTER, which the vehicle increments in the
       fixed step and which Audio already edge-detects once per rendered frame
       for the same reason. Reading a boolean would miss two hits in one frame
       and reading it per sub-step would shake once per tick of contact. */
    const impacts = v.impacts || 0;
    if (cam.lastImpacts === undefined) cam.lastImpacts = impacts;
    if (impacts > cam.lastImpacts) {
      const sev = M.clamp(v.lastImpact || 0.5, 0, 1);
      cam.shake = Math.min(C.shakeMax, (cam.shake || 0) + C.shakePerImpact * sev);
    }
    cam.lastImpacts = impacts;
    cam.shake = (cam.shake || 0) * Math.exp(-C.shakeDecay * dt);
    // Phase advances in REAL time so the wobble does not stall when the
    // simulation is paused mid-shake.
    cam.shakeT = (cam.shakeT || 0) + dt;
  },

  /**
   * @param {object} v      vehicle
   * @param {object} arena
   * @param {number} alpha  0..1 interpolation between the last two sim states
   * @param {number} dt     real frame delta, for camera smoothing only
   */
  /**
   * Draws every viewport. One in single player, two side by side in split
   * screen.
   *
   * Side-by-side rather than stacked: this camera is only 17.5 degrees above
   * the floor, so depth ahead is the scarce resource and a short wide viewport
   * throws it away. Two tall narrow views keep the sightline.
   */
  render(game, alpha, dt) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(0, 0, this.w, this.h);

    const views = game.views;
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      ctx.save();
      ctx.beginPath();
      ctx.rect(view.x, view.y, view.w, view.h);
      ctx.clip();
      ctx.translate(view.x, view.y);
      this.renderView(ctx, view, game, alpha, dt);
      ctx.restore();
    }

    // Three players leave a quadrant spare; a live standings board is more use
    // there than an empty corner.
    if (game.spareQuadrant) this.drawStandings(ctx, game.spareQuadrant, game);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    if (views.length > 1) ctx.fillRect(views[1].x - 2, 0, 4, this.h);
    if (views.length > 2) ctx.fillRect(0, views[2].y - 2, this.w, 4);
  },

  /* Live order of the whole field, for the spare quadrant in a three-player
     split. Compact by design — it is a glance, not a results card. */
  drawStandings(ctx, rect, game) {
    const RM = BR.RaceManager;
    if (!RM || !RM.racers) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    ctx.fillStyle = 'rgba(18,16,14,0.9)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const list = RM.standings();
    const pad = Math.max(14, rect.w * 0.06);
    let y = rect.y + pad;

    ctx.textBaseline = 'top';
    ctx.font = '700 11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('RUNNING ORDER', rect.x + pad, y);
    y += 24;

    const rowH = Math.min(26, (rect.h - pad * 2 - 24) / Math.max(1, list.length));
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      ctx.font = (r.isPlayer ? '700 ' : '600 ') + '12px ui-monospace, Consolas, monospace';
      ctx.fillStyle = r.isPlayer ? '#ece6da' : 'rgba(255,255,255,0.5)';
      ctx.fillText(r.position + '.  ' + r.name, rect.x + pad, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('L' + (r.lap + 1), rect.x + rect.w - pad, y);
      ctx.textAlign = 'left';
      y += rowH;
    }
    ctx.restore();
  },

  renderView(ctx, view, game, alpha, dt) {
    const M = BR.M;
    const Pj = BR.Projection;
    const arena = game.arena;
    const racers = game.vehicles;
    const v = view.vehicle;
    const W = view.w, H = view.h;

    // Interpolate between simulation states so a 144Hz display is smooth on a
    // 60Hz sim.
    const ix = M.lerp(v.prevX, v.x, alpha);
    const iy = M.lerp(v.prevY, v.y, alpha);
    const ih = v.prevHeading + M.wrapAngle(v.heading - v.prevHeading) * alpha;

    this.updateCamera(view.cam, v, ix, iy, dt);

    // Hand the camera to the projection BEFORE anything projects. Everything
    // downstream comes back already camera-relative, so the only transform
    // left is centring.
    Pj.setCamera(view.cam.x, view.cam.y, view.cam.yaw, view.cam.z);

    /* THE EFFECTIVE ZOOM FOR THIS VIEW, this frame. `BR.CAMERA.zoom` is the
       base; the camera pulls back with speed and punches in on a boost, and in
       split screen each seat does that independently. Everything downstream
       that scales a line width by zoom must read THIS, not the constant, or
       kerbs and dashes change thickness as the view moves. */
    const cam = view.cam;
    this.zoom = cam.zoom || BR.CAMERA.zoom;

    ctx.save();
    // horizonBias pushes the car down the screen so more road is visible
    // ahead of it. This is what makes the camera read as "behind" the car.
    // Shake is applied HERE, in screen space, so it moves the picture without
    // moving the camera — nothing that reads cam.x/cam.y is disturbed by it.
    let shx = 0, shy = 0;
    if (cam.shake > 0.05) {
      const t = (cam.shakeT || 0) * BR.CAMERA.shakeHz;
      shx = Math.sin(t) * cam.shake;
      shy = Math.cos(t * 1.37) * cam.shake * 0.7;   // 1.37 so it is not a line
    }
    ctx.translate(W / 2 + shx, H * BR.CAMERA.horizonBias + shy);
    const zoomNow = this.zoom * (1 + (cam.kick || 0));
    ctx.scale(zoomNow, zoomNow);
    this.zoom = zoomNow;

    /* Cull bounds for THIS viewport, computed once and hung on the renderer so
       everything drawn before the depth sort can use them too. They used to be
       locals declared further down, which meant the road — the single most
       expensive thing on screen — was drawn above them and could not be culled
       at all. Measured: a phone viewport with 28% of a desktop's area was
       costing 92-98% as much to draw. */
    this.setCullBounds(view);

    this.drawGround(ctx, arena);
    this.drawRoad(ctx, arena);
    this.drawDecoration(ctx, arena);
    this.drawBoostPads(ctx, arena);
    if (game.items) this.drawItems(ctx, arena);
    this.drawCollectibles(ctx, arena, dt);
    this.drawFinishLine(ctx, arena);
    this.drawMarks(ctx);
    this.drawRamps(ctx, arena);

    // ── depth sort: walls and the vehicle interleave ───────────────────────
    // Sorted on CAMERA-space depth, not world y. With a rotating camera,
    // "further away" depends on where the camera is looking.
    /* ── CULLING ───────────────────────────────────────────────────────────
       Everything below used to go into the sort regardless of where it was.
       Measured on a seven-opponent grid: of ~300 wall segments, only 44-61 were
       anywhere near the viewport and a quarter were behind the camera outright
       — about 85% waste, paid again for every viewport, so roughly 1,300
       drawables a frame in four-player split screen.

       The margin is deliberately generous. A wall is tested by its MIDPOINT,
       and a segment is ~80 units long standing up to 60 high, so a tight bound
       would pop the ends of walls in and out at the screen edge. `CULL_PAD`
       costs a few extra draws and removes the entire class of bug. */
    const B = this.cullBounds;
    const halfW = B.halfW, top = B.top, bot = B.bot, PAD = B.pad;
    const cullOn = B.on;

    /* A point test is not enough, and the failure is specific: a wall whose
       MIDPOINT is behind the camera can still have an endpoint in front of it
       and on screen. Measured, the midpoint-only version wrongly rejected
       ~1 wall per camera position — which is a segment popping in and out at
       the screen edge, exactly where it is most noticeable.

       So anything with extent is tested by its extent: keep it if ANY sampled
       point is in front of the camera and inside the padded viewport. Four
       projections instead of one, against 82% of the geometry not being drawn
       at all. */
    /* NO DEPTH TEST. There used to be one — `if (p.depth < 0) continue;`,
       commented "behind the camera" — and it was backwards.

       `depth` is documented in Projection.js as camera-space distance where
       LARGER MEANS NEARER, so everything IN FRONT of the car has NEGATIVE depth.
       The test therefore threw away the road ahead and the walls beside it,
       which is the entire half of the screen a driver is looking at. Measured
       on Rug Loop: of the 81 wall segments actually inside the viewport, the
       test kept 28. **Two thirds of the visible walls were being discarded.**

       There is no near plane to reject against anyway. The projection is
       axonometric — no divide by depth, so no singularity behind the eye — and
       the sx/sy box is an exact visibility test on its own. Dropping the depth
       line makes culling correct, and it still removes half the geometry. */
    const anyVisible = function (pts) {
      if (!cullOn) return true;
      for (let k = 0; k < pts.length; k++) {
        const p = Pj.project(pts[k][0], pts[k][1], pts[k][2] || 0);
        if (p.sx < -halfW - PAD || p.sx > halfW + PAD) continue;
        if (p.sy < top - PAD || p.sy > bot + PAD) continue;
        return true;
      }
      return false;
    };
    const visible = function (x, y, z) {
      return anyVisible([[x, y, z || 0]]);
    };

    const drawables = [];
    for (let i = 0; i < arena.walls.length; i++) {
      const w = arena.walls[i];
      // Both ends, floor and top — a wall is a quad, not a point.
      const wz = w.z || 0;
      const wh = wz + (w.h === undefined ? arena.wallHeight : w.h);
      if (!anyVisible([[w.ax, w.ay, wz], [w.bx, w.by, wz],
                       [w.ax, w.ay, wh], [w.bx, w.by, wh]])) continue;
      drawables.push({
        key: Math.max(Pj.depthAt(w.ax, w.ay), Pj.depthAt(w.bx, w.by)),
        wall: w,
      });
    }
    for (let i = 0; i < arena.props.length; i++) {
      const p = arena.props[i];
      if (!visible(p.x, p.y, p.z)) continue;
      drawables.push({ key: Pj.depthAt(p.x, p.y), prop: p });
    }
    for (let i = 0; i < arena.hazards.length; i++) {
      const hz = arena.hazards[i];
      if (!visible(hz.x, hz.y, hz.z)) continue;
      drawables.push({ key: Pj.depthAt(hz.x, hz.y), hazard: hz });
    }
    /* Loops go in as INDIVIDUAL RIBBON SEGMENTS rather than one object. A loop
       is taller than anything else on the track and the car passes both behind
       and in front of it within a second, so sorting it as a single unit puts
       the car wholly in front of the loop or wholly behind it — and the moment
       it is meant to sell is exactly the one in between. */
    const rails = arena.rails || [];
    for (let i = 0; i < rails.length; i++) {
      const R = rails[i];
      for (let s = 0; s < this.RING_SEGS; s++) {
        const p = BR.Rails.ringPoint(R, s / this.RING_SEGS, 0);
        // A loop is tall, so its segments are culled with extra vertical slack.
        if (!visible(p[0], p[1], p[2])) continue;
        drawables.push({ key: Pj.depthAt(p[0], p[1]), rail: R, seg: s });
      }
    }
    for (let i = 0; i < racers.length; i++) {
      const c = racers[i];
      const cx = M.lerp(c.prevX, c.x, alpha);
      const cy = M.lerp(c.prevY, c.y, alpha);
      // The deck under the car is interpolated too, or a car climbing a ramp
      // steps up in 60Hz jerks while everything around it moves smoothly.
      const cdeck = M.lerp(c.prevRoadZ || 0, c.roadZ || 0, alpha);
      const cz = cdeck + M.lerp(c.prevZ, c.z, alpha);
      const ch = c.prevHeading + M.wrapAngle(c.heading - c.prevHeading) * alpha;
      // Interpolating the up VECTOR rather than an angle: it never wraps, so
      // the last few degrees of a ride cannot come out as a backflip.
      const pu = c.prevUp || this.UP, nu = c.up || this.UP;
      const cu = { x: M.lerp(pu.x, nu.x, alpha),
                   y: M.lerp(pu.y, nu.y, alpha),
                   z: M.lerp(pu.z, nu.z, alpha) };
      drawables.push({ key: Pj.depthAt(cx, cy), car: c,
                       cx: cx, cy: cy, cz: cz, ch: ch, deck: cdeck, up: cu });
    }
    drawables.sort((a, b) => a.key - b.key);

    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      if (d.wall)        this.drawWall(ctx, d.wall, arena.wallHeight, arena);
      else if (d.rail)   this.drawRailSegment(ctx, d.rail, d.seg);
      else if (d.prop)   this.drawProp(ctx, d.prop);
      else if (d.hazard) this.drawHazard(ctx, d.hazard);
      else               this.drawVehicle(ctx, d.car, d.cx, d.cy, d.cz, d.ch,
                                          d.car === v, d.deck, d.up);
    }

    this.drawDust(ctx);

    ctx.restore();

    // Viewport space, after the camera transform is unwound.
    this.drawSpeedStreaks(ctx, v, W, H);
    this.drawDepthFade(ctx, arena, W, H);
    BR.HUD.draw(ctx, view, game, W, H);
    BR.CornerHint.draw(ctx, game, view, W, H);
    // The map is a plan view and must not inherit the tilt or the rotation.
    BR.MiniMap.draw(ctx, game, view, W, H);
  },

  /**
   * Depth fade — warm haze toward the far edge.
   *
   * Drawn in SCREEN space as a single vertical gradient rather than by tinting
   * each object, and that shortcut is exact rather than lazy: for anything on
   * the ground plane, sy = ry * groundTilt, so screen row is a monotonic
   * function of camera depth. Fading down the screen IS fading with distance.
   *
   * The one artifact is that a tall object near the camera is lifted up the
   * screen by heightScale and picks up a little haze at its top. That reads as
   * atmosphere rather than as a bug, so it is left alone.
   *
   * The fade stops short of the car — everything below horizonBias is behind
   * you and near, and hazing it would look like fog rolling in backwards.
   */
  drawDepthFade(ctx, arena, w, h) {
    const C = BR.CAMERA;
    if (!C.depthFade || C.depthFade <= 0.005) return;

    const haze = (arena && arena.haze) || this.DEFAULT_HAZE;
    const end = Math.max(1, h * C.horizonBias * C.depthFadeEnd);

    let g = this._fadeCache;
    if (!g || g.h !== end || g.strength !== C.depthFade || g.haze !== haze) {
      const grad = ctx.createLinearGradient(0, 0, 0, end);
      grad.addColorStop(0.00, 'rgba(' + haze + ',' + C.depthFade.toFixed(3) + ')');
      // Falls off faster than linear, so the near half stays clean.
      grad.addColorStop(0.45, 'rgba(' + haze + ',' + (C.depthFade * 0.34).toFixed(3) + ')');
      grad.addColorStop(1.00, 'rgba(' + haze + ',0)');
      g = this._fadeCache = { grad: grad, h: end, strength: C.depthFade, haze: haze };
    }

    ctx.fillStyle = g.grad;
    ctx.fillRect(0, 0, w, end);
  },

  /* Warm afternoon light, per 12_Art_Guide.md. A track may override it —
     the under-bed and night-light states want their own. */
  DEFAULT_HAZE: '198,176,140',
  _fadeCache: null,

  /* Chequered finish line, painted on the ground plane. */
  drawFinishLine(ctx, arena) {
    const Pj = BR.Projection;
    const fz = arena.finishZ || 0;
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
          Pj.project(ax + dx * t0 + nx * o0, ay + dy * t0 + ny * o0, fz),
          Pj.project(ax + dx * t1 + nx * o0, ay + dy * t1 + ny * o0, fz),
          Pj.project(ax + dx * t1 + nx * o1, ay + dy * t1 + ny * o1, fz),
          Pj.project(ax + dx * t0 + nx * o1, ay + dy * t0 + ny * o1, fz),
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

  /* The rug itself: printed green, with a faint weave so the scale of the cars
     against the fibres reads (12_Art_Guide.md). */
  drawGround(ctx, arena) {
    const Pj = BR.Projection;
    const b = arena.bounds;

    ctx.beginPath();
    const c = [
      Pj.project(b.minX, b.minY, 0), Pj.project(b.maxX, b.minY, 0),
      Pj.project(b.maxX, b.maxY, 0), Pj.project(b.minX, b.maxY, 0),
    ];
    ctx.moveTo(c[0].sx, c[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].sx, c[i].sy);
    ctx.closePath();
    ctx.fillStyle = arena.groundColour;
    ctx.fill();

    /* ── TEXTURE ───────────────────────────────────────────────────────────
       This was a regular grid of full-length lines at 180-unit spacing, which
       is the single most programmer-art thing on screen: a bedroom rug is
       woven, and sand is rippled, and neither is graph paper.

       Drawn as a repeating TILE rather than as geometry. Thousands of little
       tufts would be thousands of path operations a frame; a pattern is ONE
       fill, because the ground plane maps to the screen through an affine
       transform and a pattern can be handed that transform directly.

       The mapping, from Projection.project with z = 0:

         sx = cos·x − sin·y + …
         sy = tilt·sin·x + tilt·cos·y + …

       so the matrix is (cos, tilt·sin, −sin, tilt·cos, …) — the camera's yaw,
       squashed vertically by groundTilt. The texture therefore rotates and lies
       down with the floor exactly as painted-on carpet would.

       `fill` does not clear the path, so every layer below goes down through
       the same four points the base colour just used: up to four fills and one
       path, where the rug used to cost two paths for one texture. */
    const layers = this.groundLayers(arena);
    for (let L = 0; L < layers.length; L++) {
      const pat = this.groundPattern(ctx, layers[L]);
      if (!pat) continue;
      ctx.fillStyle = pat;
      ctx.fill();
    }

    this.drawRugEdge(ctx, arena, c);
  },

  /* Which tiles this floor is made of, bottom to top. The weave is the
     material and goes on last; anything before it is PRINT, and print is
     under the pile rather than on top of it. */
  groundLayers(arena) {
    const key = 'layers:' + arena.id;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];
    const out = [];
    if (arena.world === 'town-rug') {
      out.push(this.rugPrintTile('field'));
      out.push(this.rugPrintTile('town'));
    }
    out.push(this.groundTile(arena));
    this._tiles[key] = out;
    return out;
  },

  /* ── THE PRINTED RUG ───────────────────────────────────────────────────────
     12_Art_Guide.md open question 6: a full illustrated texture, or tiles?
     Tiles — but a 128-unit tile is MATERIAL, and a printed town rug is
     IMAGERY. A pond has to be a pond, which means a tile several hundred units
     across so a motif can be an object rather than a repeat.

     TWO layers at deliberately mismatched sizes, 1024 and 768. Each tiles on
     its own period, so the pair only truly repeats every 3,072 units, and the
     grid a single tile would rule across the floor never appears. That is the
     whole reason there are two and not one.

     THE FIRST ATTEMPT FAILED BY BEING GENEROUS. Tiles of 640 and 448 carrying
     four houses, a car park, two footpaths and a hedgerow apiece came out as
     WALLPAPER: the camera sees 1,113 x 2,319 units, so a 448 tile repeats five
     times across the frame and eight down it, and the eye locks onto the
     period instantly. Rows of identical roofs, and the paths meeting in a
     regular lattice.

     That is the real content of the "a single illustration looks better"
     argument in the open question — not fidelity, PERIOD. So the answer is
     tiles that are bigger than they are detailed. Each carries one or two
     features, nothing spans an edge (a shape crossing the tile boundary
     becomes a continuous lattice line the moment it repeats), and the period
     is longer than the frame is wide.

     Everything is still drawn NINE times, offset by ±S on each axis, so a
     shape that does reach an edge continues on the far side rather than being
     cut off. Build-time only: the tile is made once and cached.

     Contrast is deliberately low. 05_Tracks.md requires the road to be
     unmistakable, so the print is hue and a few percent of value — never a
     pale hard edge, which is the kerb's job and must stay the kerb's alone. */
  rugPrintTile(layer) {
    const key = 'rugprint:' + layer;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = layer === 'field' ? 1024 : 768;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');

    // Seeded, for the reasons groundTile is: a floor that differed between two
    // renders would break every pixel check, and Math.random is the AI's.
    let seed = layer === 'field' ? 90210 : 4471;
    const rnd = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    // Draw once per wrap offset, so nothing is clipped at a seam.
    const wrap = function (fn) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          g.save(); g.translate(ox * S, oy * S); fn(); g.restore();
        }
      }
    };
    const blob = function (x, y, rx, ry, fill) {
      wrap(function () {
        g.fillStyle = fill;
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      });
    };
    const patch = function (x, y, w, h, r, fill) {
      wrap(function () {
        g.fillStyle = fill;
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, h, r);
        else g.rect(x, y, w, h);
        g.fill();
      });
    };

    if (layer === 'field') {
      /* The landscape the town is printed on. Three features in a thousand
         units, all soft-edged: a straight edge repeating is a grid line, and
         at 30% vertical compression nothing smaller than a car survives to be
         worth the risk anyway. */
      blob(300, 300, 210, 150, 'rgba(150,186,104,0.20)');        // playing field
      blob(268, 268, 120, 84, 'rgba(160,194,110,0.12)');
      blob(760, 690, 150, 104, 'rgba(120,166,90,0.20)');         // parkland
      blob(268, 754, 118, 70, 'rgba(92,146,186,0.26)');          // the pond
      blob(250, 742, 74, 42, 'rgba(140,190,214,0.16)');          // shallow end
      wrap(function () {                                         // printed rim
        g.strokeStyle = 'rgba(38,32,26,0.20)';
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(268, 754, 118, 70, 0, 0, Math.PI * 2);
        g.stroke();
      });

      // A hedge, as a short arc of separate bushes rather than a boundary
      // line — a line that reaches the tile edge tiles into a fence.
      for (let i = 0; i < 8; i++) {
        blob(190 + i * 30, 452 + Math.sin(i * 0.7) * 12, 17, 10,
             'rgba(46,88,52,0.24)');
      }
      // Trees in the park.
      for (let i = 0; i < 6; i++) {
        blob(660 + rnd() * 200, 610 + rnd() * 160, 20 + rnd() * 9,
             12 + rnd() * 5, 'rgba(46,88,52,0.22)');
      }
      /* Worn smooth by years of play. 06_World_Town_Rug.md is explicit that
         pristine reads as a product shot. Big and faint, so they read as the
         pile being crushed rather than as a stain. */
      for (let i = 0; i < 4; i++) {
        blob(rnd() * S, rnd() * S, 130 + rnd() * 90, 80 + rnd() * 54,
             'rgba(255,246,224,0.04)');
      }
    } else {
      /* The town, and it is one small town in 768 units rather than a suburb
         in every direction. This is the layer that says RUG rather than lawn,
         so it carries the only warm hues in the print. */
      /* Printed line art, not a colour blotch. The dark outline is the same
         trick that made the cars read as moulded toys rather than coloured
         regions, and it does the same job here: without it a house at this
         alpha is a pale smudge, and with it the eye reads a drawn shape. */
      const house = function (x, y, w, h, roof) {
        patch(x, y, w, h, 5, 'rgba(232,222,198,0.24)');
        patch(x, y, w, h * 0.52, 4, roof);
        wrap(function () {
          g.strokeStyle = 'rgba(38,32,26,0.26)';
          g.lineWidth = 3;
          g.beginPath();
          if (g.roundRect) g.roundRect(x, y, w, h, 5); else g.rect(x, y, w, h);
          g.stroke();
          g.beginPath();
          g.moveTo(x, y + h * 0.52); g.lineTo(x + w, y + h * 0.52);
          g.stroke();
        });
      };
      house(150, 210, 86, 64, 'rgba(178,92,72,0.26)');
      house(262, 232, 68, 56, 'rgba(96,110,150,0.24)');
      house(160, 314, 74, 58, 'rgba(178,140,72,0.24)');
      house(596, 566, 80, 62, 'rgba(120,92,142,0.22)');

      /* The lane the houses sit on. It STOPS inside the tile — a path drawn
         out to the edges met its own copy on the other side and ruled a
         continuous diagonal lattice over the whole floor, which was the single
         most obviously tiled thing in the first attempt. */
      g.lineCap = 'round';
      wrap(function () {
        g.strokeStyle = 'rgba(214,198,158,0.14)';
        g.lineWidth = 17;
        g.beginPath();
        g.moveTo(120, 400); g.quadraticCurveTo(300, 350, 372, 196);
        g.stroke();
      });

      // Gardens: a scatter of printed flowerbeds, beside the plots only.
      for (let i = 0; i < 11; i++) {
        blob(130 + rnd() * 230, 190 + rnd() * 200, 5 + rnd() * 4, 3 + rnd() * 3,
             rnd() > 0.5 ? 'rgba(216,110,96,0.20)' : 'rgba(232,196,96,0.20)');
      }
    }

    this._tiles[key] = cv;
    return cv;
  },

  /* ── THE EDGE OF THE RUG ───────────────────────────────────────────────────
     The one thing no tile can give, and the reason the answer to question 6 is
     not simply "tiles". A repeat has no edge, so a tiled floor is an infinite
     floor — and an infinite green field is a green field, not a rug in a
     bedroom. A rug is an OBJECT lying on a floor, and what says so is that it
     stops.

     The arena is the track plus 400 units, so the binding sits a couple of car
     lengths beyond the outer barrier: visible from the road, never on it. */
  drawRugEdge(ctx, arena, c) {
    if (arena.world !== 'town-rug') return;
    const Pj = BR.Projection;
    const b = arena.bounds;
    const HEM = 62;

    const inner = [
      Pj.project(b.minX + HEM, b.minY + HEM, 0),
      Pj.project(b.maxX - HEM, b.minY + HEM, 0),
      Pj.project(b.maxX - HEM, b.maxY - HEM, 0),
      Pj.project(b.minX + HEM, b.maxY - HEM, 0),
    ];

    // The binding tape, as a frame: outer loop one way, inner loop the other.
    ctx.beginPath();
    ctx.moveTo(c[0].sx, c[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].sx, c[i].sy);
    ctx.closePath();
    ctx.moveTo(inner[0].sx, inner[0].sy);
    for (let i = 3; i > 0; i--) ctx.lineTo(inner[i].sx, inner[i].sy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(96,74,58,0.60)';
    ctx.fill();

    // Stitching along the inside of the tape, and a darker outer lip so the
    // rug reads as having a thickness the floor does not.
    ctx.lineWidth = 2 / BR.Renderer.zoom;
    ctx.strokeStyle = 'rgba(232,220,196,0.28)';
    ctx.beginPath();
    ctx.moveTo(inner[0].sx, inner[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(inner[i].sx, inner[i].sy);
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 3 / BR.Renderer.zoom;
    ctx.strokeStyle = 'rgba(28,22,18,0.45)';
    ctx.beginPath();
    ctx.moveTo(c[0].sx, c[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].sx, c[i].sy);
    ctx.closePath();
    ctx.stroke();
  },

  /**
   * A tile turned into a pattern that lies down on the ground plane.
   *
   * Shared by the floor and the road, which is the point: both are printed on
   * the same flat plane, and a road whose texture slid about relative to the
   * rug it is printed on would give the whole trick away.
   */
  groundPattern(ctx, tile) {
    if (!tile) return null;
    const pat = ctx.createPattern(tile, 'repeat');
    if (!pat || !pat.setTransform) return null;
    const Pj = BR.Projection;
    const cs = Pj._cos, sn = Pj._sin, t = Pj.groundTilt;
    const ox = -Pj.camX, oy = -Pj.camY;
    pat.setTransform(new DOMMatrix([
      cs, t * sn,
      -sn, t * cs,
      cs * ox - sn * oy,
      t * (sn * ox + cs * oy) + (Pj.camZ || 0) * Pj.heightScale,
    ]));
    return pat;
  },

  /**
   * The road surface.
   *
   * It was one flat fill — the last obviously geometric surface in the game.
   * What it should be depends on what the track is made of, and the worlds
   * disagree:
   *
   *   rug     the road is PRINTED ON THE FABRIC, so the weave shows through it.
   *           This is the one that matters: a smooth road on a woven floor
   *           reads as two separate materials, and the whole conceit is that
   *           the track is part of the rug.
   *   sand    packed grain, finer than the loose sand beside it.
   *   plastic moulded, so it gets seam lines and a sheen rather than a grain.
   */
  roadTile(arena) {
    const key = 'road:' + arena.id;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');

    // Seeded, for the same reasons as the floor tile: reproducible renders,
    // and never touching the random stream the AI draws from.
    let seed = 7717;
    const rnd = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    if (arena.world === 'stunt') {
      // Moulded plastic: long seams along the track and a soft sheen.
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const x = 18 + i * 44;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,0.07)';
      g.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const x = 21 + i * 44;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
      }
    } else if (arena.sandy) {
      // Packed grain: dense flecks, finer than the ripples off the road.
      for (let i = 0; i < 240; i++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
        g.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
      }
    } else {
      /* Rug: the SAME tuft geometry as the floor, so the print sits on the
         weave rather than beside it. Lighter, because a printed road hides
         some of the pile without flattening it. */
      g.strokeStyle = 'rgba(255,255,255,0.055)';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      const pitch = 16;
      for (let row = 0; row * pitch < S; row++) {
        const y = row * pitch + 4;
        const off = (row % 2) * (pitch / 2);
        for (let col = -1; col * pitch < S + pitch; col++) {
          const x = col * pitch + off + 2;
          const j = (rnd() - 0.5) * 2.4;
          g.beginPath();
          g.moveTo(x, y + j);
          g.lineTo(x + pitch * 0.44, y + j + (rnd() - 0.5) * 2);
          g.stroke();
        }
      }
      // A little print speckle, so it reads as ink on cloth rather than paint.
      for (let i = 0; i < 90; i++) {
        g.fillStyle = 'rgba(0,0,0,0.055)';
        g.fillRect(rnd() * S, rnd() * S, 2, 2);
      }
    }

    this._tiles[key] = cv;
    return cv;
  },

  /* One tile per world, built once and cached. 128 world units square, which
     at racing speed is small enough to read as texture rather than as a
     repeating motif. */
  groundTile(arena) {
    const key = arena.id;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const weave = arena.weaveColour || 'rgba(0,0,0,0.055)';

    /* Deterministic pseudo-randomness. A tile built from Math.random would
       differ between the two renders of a pixel-diff check and, worse, consume
       the shared random stream the AI draws from. */
    let seed = 1337;
    const rnd = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    if (arena.sandy) {
      /* Sand: broken ripples running one way, like wind over a sandpit. Long
         and shallow, never closed, so it reads as drift rather than as rows. */
      g.strokeStyle = weave;
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        const y = rnd() * S;
        const x0 = rnd() * S, len = 22 + rnd() * 46;
        g.beginPath();
        g.moveTo(x0, y);
        g.quadraticCurveTo(x0 + len / 2, y + (rnd() - 0.5) * 7, x0 + len, y);
        g.stroke();
      }
    } else {
      /* Rug: tufts in offset rows, the way a loop pile actually sits. Short
         dashes rather than continuous lines is the whole difference between
         woven cloth and graph paper. */
      g.strokeStyle = weave;
      g.lineWidth = 2.6;
      g.lineCap = 'round';
      const pitch = 16;
      for (let row = 0; row * pitch < S; row++) {
        const y = row * pitch + 4;
        const off = (row % 2) * (pitch / 2);
        for (let col = -1; col * pitch < S + pitch; col++) {
          const x = col * pitch + off + 2;
          const jitter = (rnd() - 0.5) * 2.4;
          g.beginPath();
          g.moveTo(x, y + jitter);
          g.lineTo(x + pitch * 0.44, y + jitter + (rnd() - 0.5) * 2);
          g.stroke();
        }
      }
      // A second, fainter pass across the weft, so the weave has two threads
      // rather than one set of stripes.
      g.strokeStyle = 'rgba(255,255,255,0.035)';
      g.lineWidth = 1.6;
      for (let col = 0; col * 22 < S; col++) {
        const x = col * 22 + 9;
        g.beginPath();
        g.moveTo(x, 0); g.lineTo(x + 3, S);
        g.stroke();
      }
    }

    this._tiles[key] = cv;
    return cv;
  },

  /* Printed road: a filled ring between the kerbs, with a dashed centre line.
     Road edges must be unmistakable — "never rely on surface texture alone"
     (05_Tracks.md readability rules). */
  /**
   * Road that leaves the floor.
   *
   * A flat road is one even-odd fill of two loops, which is cheap and exact.
   * That cannot work once the track crosses over itself: the two loops are a
   * single path, so the deck passing overhead fills in the same pass as the one
   * underneath and whichever is drawn second wins regardless of which is
   * actually on top.
   *
   * So an elevated track is drawn as a strip of quads sorted back to front,
   * each at its own height, with a skirt down the edges for the thickness of
   * the plastic and a pillar every so often holding the raised sections up.
   * Quads are stroked in their own fill colour to close the hairline seams that
   * appear between abutting fills.
   */
  drawElevatedRoad(ctx, arena) {
    const Pj = BR.Projection;
    const o = arena.outer, ip = arena.inner, n = o.length;
    const SKIRT = 26;

    const segs = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      segs.push({ i: i, j: j,
                  key: Math.max(Pj.depthAt(o[i][0], o[i][1]),
                                Pj.depthAt(ip[j][0], ip[j][1])) });
    }
    segs.sort(function (a, b) { return a.key - b.key; });

    const quad = function (a, b, c, d) {
      ctx.beginPath();
      const pa = Pj.project(a[0], a[1], a[2]); ctx.moveTo(pa.sx, pa.sy);
      const pb = Pj.project(b[0], b[1], b[2]); ctx.lineTo(pb.sx, pb.sy);
      const pc = Pj.project(c[0], c[1], c[2]); ctx.lineTo(pc.sx, pc.sy);
      const pd = Pj.project(d[0], d[1], d[2]); ctx.lineTo(pd.sx, pd.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();                       // seal the seam
    };

    ctx.lineWidth = 1 / BR.Renderer.zoom;
    ctx.lineJoin = 'round';

    for (let s = 0; s < segs.length; s++) {
      const i = segs[s].i, j = segs[s].j;
      const oi = o[i], oj = o[j], ii = ip[i], ij = ip[j];

      // Pillars first — they are behind everything they hold up.
      if (oi[2] > 40 && i % 6 === 0) {
        const mx = (oi[0] + ii[0]) / 2, my = (oi[1] + ii[1]) / 2;
        const pTop = Pj.project(mx, my, oi[2] - SKIRT);
        const pBot = Pj.project(mx, my, 0);
        ctx.strokeStyle = 'rgba(38,32,46,0.55)';
        ctx.lineWidth = 9 / BR.Renderer.zoom;
        ctx.beginPath();
        ctx.moveTo(pTop.sx, pTop.sy); ctx.lineTo(pBot.sx, pBot.sy);
        ctx.stroke();
        ctx.lineWidth = 1 / BR.Renderer.zoom;
      }

      // Skirts: the moulded thickness of the track piece.
      ctx.fillStyle = arena.skirtColour;
      ctx.strokeStyle = arena.skirtColour;
      quad(oi, oj, [oj[0], oj[1], oj[2] - SKIRT], [oi[0], oi[1], oi[2] - SKIRT]);
      quad(ii, ij, [ij[0], ij[1], ij[2] - SKIRT], [ii[0], ii[1], ii[2] - SKIRT]);

      // The driving surface.
      ctx.fillStyle = arena.roadColour;
      ctx.strokeStyle = arena.roadColour;
      quad(oi, oj, ij, ii);
    }
  },

  /* Cull bounds for the viewport being drawn. Kept on the renderer so anything
     drawn before the depth sort can reach them. */
  setCullBounds(view) {
    this.cullBounds = {
      halfW: view.w / 2 / BR.Renderer.zoom,
      top:  -view.h * BR.CAMERA.horizonBias / BR.Renderer.zoom,
      bot:   view.h * (1 - BR.CAMERA.horizonBias) / BR.Renderer.zoom,
      pad:   this.CULL_PAD,
      on:    this.CULL,
    };
  },

  // No depth test — see the note on `anyVisible`. In an axonometric projection
  // the sx/sy box is the whole of visibility.
  onScreen(x, y, z) {
    const B = this.cullBounds;
    if (!B || !B.on) return true;
    const p = BR.Projection.project(x, y, z || 0);
    if (p.sx < -B.halfW - B.pad || p.sx > B.halfW + B.pad) return false;
    if (p.sy < B.top - B.pad || p.sy > B.bot + B.pad) return false;
    return true;
  },

  /**
   * Contiguous runs of road that are worth drawing, as [start, end] index pairs
   * into the edge arrays.
   *
   * A ring cannot simply have its off-screen segments skipped — the fill needs
   * a closed shape. But a RUN of consecutive segments can be closed on itself:
   * outer[a..b] followed by inner[b..a] reversed is a ribbon that fills exactly
   * like the corresponding slice of the full ring.
   *
   * Runs, not one span, because a figure-eight crosses itself: two separate
   * stretches of road are on screen at once and drawing the arc between them
   * would put the whole far side back in.
   *
   * One segment of padding either side, so a partially-visible segment at the
   * edge of the screen is never clipped short.
   */
  /* Road culling on its own switch, separate from CULL. Toggling CULL turns off
     wall, prop and hazard culling too, so it cannot answer "did the ROAD change"
     — which is the only question that matters when the road is what was
     rewritten. Harnesses flip this one. */
  CULL_ROAD: true,

  roadRuns(outer, inner) {
    const n = outer.length;
    if (!this.CULL_ROAD || !this.cullBounds || !this.cullBounds.on) {
      return [[0, n - 1]];
    }

    const keep = new Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      // Either edge visible keeps the segment: on a wide road the inner kerb
      // can be on screen while the outer one is not.
      keep[i] = this.onScreen(outer[i][0], outer[i][1], outer[i][2]) ||
                this.onScreen(inner[i][0], inner[i][1], inner[i][2]);
      if (keep[i]) any = true;
    }
    if (!any) return [];

    const grown = new Array(n);
    for (let i = 0; i < n; i++) {
      grown[i] = keep[i] || keep[(i + n - 1) % n] || keep[(i + 1) % n];
    }

    // Walk from a gap so a run spanning index 0 is not split into two.
    let start = 0;
    while (start < n && grown[start]) start++;
    if (start === n) return [[0, n - 1]];          // everything visible

    const runs = [];
    let i = 0, cur = null;
    while (i < n) {
      const idx = (start + i) % n;
      if (grown[idx]) {
        if (cur === null) cur = [idx, idx];
        else cur[1] = idx;
      } else if (cur) {
        runs.push(cur); cur = null;
      }
      i++;
    }
    if (cur) runs.push(cur);
    return runs;
  },

  drawRoad(ctx, arena) {
    const Pj = BR.Projection;

    // Edge points carry their height as a third component, so the outline
    // follows the road up a ramp without knowing anything about elevation.
    function trace(pts) {
      for (let i = 0; i < pts.length; i++) {
        const p = Pj.project(pts[i][0], pts[i][1], pts[i][2] || 0);
        if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
    }

    /* Walk a run forwards, wrapping. `[a, b]` where b < a means it crosses the
       end of the array. */
    const n = arena.outer.length;
    const runLen = function (r) {
      return (r[1] - r[0] + n) % n + 1;
    };
    // The ribbon for one run: out along the outer edge, back along the inner.
    const traceRun = function (r) {
      const len = runLen(r);
      for (let k = 0; k < len; k++) {
        const p = arena.outer[(r[0] + k) % n];
        const q = Pj.project(p[0], p[1], p[2] || 0);
        if (k === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
      }
      for (let k = len - 1; k >= 0; k--) {
        const p = arena.inner[(r[0] + k) % n];
        const q = Pj.project(p[0], p[1], p[2] || 0);
        ctx.lineTo(q.sx, q.sy);
      }
      ctx.closePath();
    };
    // One edge of a run, for the kerbs — open, so it is not closed back on
    // itself across the screen.
    const traceEdge = function (pts, r) {
      const len = runLen(r);
      for (let k = 0; k < len; k++) {
        const p = pts[(r[0] + k) % n];
        const q = Pj.project(p[0], p[1], p[2] || 0);
        if (k === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
      }
    };

    const runs = this.roadRuns(arena.outer, arena.inner);
    const whole = runs.length === 1 && runLen(runs[0]) === n;

    if (arena.elevated) {
      this.drawElevatedRoad(ctx, arena);
    } else if (whole) {
      // Everything on screen: the original ring, which is the cheapest form.
      ctx.beginPath();
      trace(arena.outer);
      trace(arena.inner);
      ctx.fillStyle = arena.roadColour;
      ctx.fill('evenodd');
      /* Surface texture, over the base colour and through the SAME path —
         `fill` does not clear the path, so a second fill costs one more fill
         and no more geometry. See `roadTile`. */
      const rp = this.groundPattern(ctx, this.roadTile(arena));
      if (rp) { ctx.fillStyle = rp; ctx.fill('evenodd'); }
    } else {
      ctx.beginPath();
      for (let i = 0; i < runs.length; i++) traceRun(runs[i]);
      ctx.fillStyle = arena.roadColour;
      ctx.fill();
      const rp = this.groundPattern(ctx, this.roadTile(arena));
      if (rp) { ctx.fillStyle = rp; ctx.fill(); }
    }

    // Compacted sand, drawn over the loose surface. Only touched cells are
    // visited, so this costs nothing on a track nobody has driven yet and stays
    // bounded by the line people actually take.
    if (arena.sandy && BR.SandGrid.active) this.drawCompaction(ctx);

    /* ── KERBS ─────────────────────────────────────────────────────────────
       Culled the same way as the fill — these are two more full traces of the
       track outline, so together with it the whole ring was being walked THREE
       times a frame regardless of what the camera could see.

       They were one pale line. What a track edge is MADE OF differs by world,
       and the edge is the thing a driver reads most often, so it is worth the
       character:

         rug     stitched. The road is printed on fabric, so its border is
                 hemmed — a solid line with machine stitching over it.
         sandbox the wooden frame of the sandpit, with plank joints.
         stunt   moulded plastic edging, alternating light and dark.

       05_Tracks.md is firm that road edges must be unmistakable and must never
       rely on texture alone, so EVERY world keeps a solid continuous line
       underneath. The character is drawn on top of readability, never instead
       of it. */
    const kerbPath = function () {
      ctx.beginPath();
      if (whole) {
        trace(arena.outer);
        // A second sub-path — one beginPath holds both, so the two edges are
        // one stroke rather than two.
        trace(arena.inner);
      } else {
        for (let i = 0; i < runs.length; i++) {
          traceEdge(arena.outer, runs[i]);
          traceEdge(arena.inner, runs[i]);
        }
      }
    };
    const Z = BR.Renderer.zoom;

    // The readable base, in every world.
    ctx.lineWidth = 3 / Z;
    ctx.strokeStyle = 'rgba(236,230,218,0.55)';
    kerbPath();
    ctx.stroke();

    /* The decoration is built as SEGMENTS, not with setLineDash.
       Dashing is the obvious way to draw stitching and it hung the game. A
       track outline is around ten thousand world units long, so a six-unit dash
       asks the rasteriser to subdivide it into a few thousand pieces — twice,
       for two edges, every frame, on a software rasteriser. The smoke test
       stopped finishing at all.

       Generating the marks at a stride over the edge points instead puts the
       count under this code's control: about sixty per edge rather than
       sixteen hundred, at a spacing chosen to look right rather than one that
       falls out of a dash length. */
    const marks = function (pts, stride, frac, phase) {
      const n = pts.length;
      const step = function (r) {
        const from = r ? r[0] : 0;
        const count = r ? ((r[1] - r[0] + n) % n + 1) : n;
        for (let k = phase; k < count; k += stride) {
          const a = pts[(from + k) % n];
          const b = pts[(from + k + 1) % n];
          const p0 = Pj.project(a[0], a[1], a[2] || 0);
          const p1 = Pj.project(a[0] + (b[0] - a[0]) * frac,
                                a[1] + (b[1] - a[1]) * frac,
                                (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * frac);
          ctx.moveTo(p0.sx, p0.sy);
          ctx.lineTo(p1.sx, p1.sy);
        }
      };
      if (whole) step(null);
      else for (let i = 0; i < runs.length; i++) step(runs[i]);
    };

    if (arena.world === 'stunt') {
      /* Alternating blocks. Deliberately light-and-slate rather than the
         obvious orange-and-blue — the legal note in 07_World_Stunt_Track.md
         binds the palette here as much as anywhere. */
      ctx.lineWidth = 5 / Z;
      ctx.strokeStyle = 'rgba(244,240,232,0.85)';
      ctx.beginPath();
      marks(arena.outer, 2, 0.98, 0); marks(arena.inner, 2, 0.98, 0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(64,74,86,0.85)';
      ctx.beginPath();
      marks(arena.outer, 2, 0.98, 1); marks(arena.inner, 2, 0.98, 1);
      ctx.stroke();
    } else if (arena.sandy) {
      // Plank joints: a short break every few points, so the edge reads as
      // timber laid end to end rather than as one moulded strip.
      ctx.lineWidth = 5 / Z;
      ctx.strokeStyle = 'rgba(150,110,68,0.75)';
      ctx.beginPath();
      marks(arena.outer, 1, 0.88, 0); marks(arena.inner, 1, 0.88, 0);
      ctx.stroke();
    } else {
      // Stitching: a fine thread along the hem, broken like machine stitch.
      ctx.lineWidth = 1.6 / Z;
      ctx.strokeStyle = 'rgba(255,252,244,0.70)';
      ctx.beginPath();
      marks(arena.outer, 1, 0.55, 0); marks(arena.inner, 1, 0.55, 0);
      ctx.stroke();
    }

    // The shortcut chord gets its own marking so the alternate route is
    // visible but not shouted about — findable on lap two (05_Tracks.md).
    if (arena.shortcutChord) {
      const a = Pj.project(arena.shortcutChord[0][0], arena.shortcutChord[0][1], 0);
      const z = Pj.project(arena.shortcutChord[1][0], arena.shortcutChord[1][1], 0);
      ctx.setLineDash([14 / BR.Renderer.zoom, 12 / BR.Renderer.zoom]);
      ctx.strokeStyle = 'rgba(255,211,77,0.7)';
      ctx.lineWidth = 4 / BR.Renderer.zoom;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(z.sx, z.sy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Centre line, dashed, following the road.
    const line = arena.centreline;
    ctx.strokeStyle = 'rgba(236,230,218,0.30)';
    ctx.lineWidth = 4 / BR.Renderer.zoom;
    ctx.beginPath();
    for (let i = 0; i < line.length; i += 4) {
      const a = Pj.project(line[i][0], line[i][1], 0);
      const j = (i + 2) % line.length;
      const b2 = Pj.project(line[j][0], line[j][1], 0);
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b2.sx, b2.sy);
    }
    ctx.stroke();
  },

  /* Packed sand, drawn as darker patches over the loose surface. Iterates only
     the cells anyone has actually touched, so it costs nothing on lap one and
     stays bounded by the line people take. */
  drawCompaction(ctx) {
    const Pj = BR.Projection;
    const G = BR.SandGrid;
    const list = G.touched;

    for (let k = 0; k < list.length; k++) {
      const t = G.cells[list[k]];
      if (t < 0.05) continue;
      const r = G.cellRect(list[k]);
      const p = [
        Pj.project(r.x, r.y, r.z||0), Pj.project(r.x + r.w, r.y, r.z||0),
        Pj.project(r.x + r.w, r.y + r.h, r.z||0), Pj.project(r.x, r.y + r.h, r.z||0),
      ];
      ctx.beginPath();
      ctx.moveTo(p[0].sx, p[0].sy);
      for (let i = 1; i < 4; i++) ctx.lineTo(p[i].sx, p[i].sy);
      ctx.closePath();
      // Damp, packed sand: darker and a little cooler than the loose stuff.
      ctx.fillStyle = 'rgba(120,92,58,' + (0.55 * t).toFixed(3) + ')';
      ctx.fill();
    }
  },

  /* Printed buildings and a pond inside the loop, so the circuit reads as a
     town rather than a ring of tarmac. No collision — it is rug print. */
  drawDecoration(ctx, arena) {
    const Pj = BR.Projection;
    for (let i = 0; i < arena.decoration.length; i++) {
      const d = arena.decoration[i];
      const pts = [
        [d.x, d.y], [d.x + d.w, d.y], [d.x + d.w, d.y + d.h], [d.x, d.y + d.h],
      ];
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const p = Pj.project(pts[k][0], pts[k][1], 0);
        if (k === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.fillStyle = d.colour;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },

  /* Item boxes, and anything an item left on the track. Everything here is
     drawn for its whole life — the design stance forbids anything invisible,
     instant and unavoidable (10_Items.md), and a trap you cannot see is all
     three at once. */
  drawItems(ctx, arena) {
    const Pj = BR.Projection;

    for (let i = 0; i < arena.itemBoxes.length; i++) {
      const b = arena.itemBoxes[i];
      if (b.cooldown > 0) continue;
      const p = Pj.project(b.x, b.y,
                           (b.z || 0) + 18 + Math.sin(this.bobPhase + i) * 4);
      const k = Pj.scaleAt(p.depth) * 19;
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy - k);
      ctx.lineTo(p.sx + k, p.sy);
      ctx.lineTo(p.sx, p.sy + k);
      ctx.lineTo(p.sx - k, p.sy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,211,77,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#ece6da';
      ctx.lineWidth = 2 / BR.Renderer.zoom;
      ctx.stroke();
    }

    const drops = (BR.Game && BR.Game.drops) || [];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const plane = d.kind === 'plane';
      const p = Pj.project(d.x, d.y, (d.z || 0) + (plane ? 24 : 4));
      const k = Pj.scaleAt(p.depth) * (plane ? 14 : 24);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, k, k * Pj.groundTilt * (plane ? 1 : 1.7),
                  0, 0, Math.PI * 2);
      ctx.fillStyle = plane ? 'rgba(236,230,218,0.95)'
                            : 'rgba(200,139,224,0.8)';
      ctx.fill();
    }
  },

  /* Boost pads: chevrons pointing the way you are meant to be going. */
  /* The direction of travel across a boost pad, cached on the pad itself.
     A pad is authored as an axis-aligned rectangle with no heading, so there
     is nothing in the data that says which way "forward" is — it comes from
     the racing line underneath. Computed once: the line does not move. */
  padDir(arena, p) {
    if (p._dir) return p._dir;
    const line = arena.centreline;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < line.length; i++) {
      const d = (line[i][0] - cx) * (line[i][0] - cx) +
                (line[i][1] - cy) * (line[i][1] - cy);
      if (d < bestD) { bestD = d; best = i; }
    }
    const a = line[best], b = line[(best + 1) % line.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    p._dir = [dx / m, dy / m];
    return p._dir;
  },

  /* Boost pads.
     They were flat translucent rectangles with an outline: a UI element lying
     on a rug, and the last thing on the track that still looked drawn by a
     programmer rather than printed by a toy company.

     A speed strip on a play mat is CHEVRONS, and they do a job a rectangle
     cannot — they say which way. The plate keeps the authored footprint
     exactly, so what you see is still what triggers; only the markings inside
     it are new. */
  drawBoostPads(ctx, arena) {
    const Pj = BR.Projection;
    for (let i = 0; i < arena.boostPads.length; i++) {
      const p = arena.boostPads[i];
      const z = p.z || 0;

      // The plate: the authored rectangle, unchanged.
      ctx.beginPath();
      const pts = [
        [p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h],
      ];
      for (let k = 0; k < 4; k++) {
        const q = Pj.project(pts[k][0], pts[k][1], z);
        if (k === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(79,216,168,0.30)';
      ctx.fill();
      ctx.strokeStyle = '#4fd8a8';
      ctx.lineWidth = 2.5 / BR.Renderer.zoom;
      ctx.stroke();

      /* Chevrons along the direction of travel, scrolling forward. The scroll
         is what makes a printed strip read as "go" rather than as a coloured
         patch — and it is free, because the phase is already being advanced
         for the bobbing toy pieces. */
      const d = this.padDir(arena, p);
      const nx = -d[1], ny = d[0];
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      // Fit the arrows inside the plate whichever way it is oriented.
      const half = Math.min(p.w, p.h) * 0.34;
      const reach = Math.min(p.w, p.h) * 0.42;

      ctx.strokeStyle = 'rgba(236,255,246,0.85)';
      ctx.lineWidth = 4 / BR.Renderer.zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const N = 3;
      for (let c = 0; c < N; c++) {
        // Each chevron slides forward and wraps, so the strip flows.
        const t = ((this.bobPhase * 0.42 + c / N) % 1) - 0.5;
        const along = t * reach * 2.2;
        // Fade at both ends, so they appear and vanish rather than popping.
        ctx.globalAlpha = 1 - Math.abs(t) * 1.8;
        if (ctx.globalAlpha <= 0.02) continue;
        const tipX = cx + d[0] * (along + half * 0.7);
        const tipY = cy + d[1] * (along + half * 0.7);
        const backX = cx + d[0] * (along - half * 0.35);
        const backY = cy + d[1] * (along - half * 0.35);
        const l = Pj.project(backX + nx * half, backY + ny * half, z);
        const m = Pj.project(tipX, tipY, z);
        const r = Pj.project(backX - nx * half, backY - ny * half, z);
        ctx.beginPath();
        ctx.moveTo(l.sx, l.sy);
        ctx.lineTo(m.sx, m.sy);
        ctx.lineTo(r.sx, r.sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  },

  /* Toy pieces. Only UNFOUND ones are drawn, so returning to a track shows
     exactly what is still missing rather than a field of things you already
     have. Bobbing and spinning, because a stationary object on a rug is
     invisible at speed. */
  bobPhase: 0,

  /* The four things a toy piece can be. Named rather than indexed so a fifth
     is a word in this list and a branch below, not a magic number. */
  PIECE_KINDS: ['brick', 'jigsaw', 'die', 'marble'],

  drawCollectibles(ctx, arena, dt) {
    const list = arena.collectibles;
    if (!list || !list.length) return;
    const Pj = BR.Projection;
    const P = BR.ProgressionManager;
    this.bobPhase += dt * 2.2;

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (P.hasPiece(c.id)) continue;

      const bob = 14 + Math.sin(this.bobPhase + i) * 5;
      const spin = this.bobPhase * 0.9 + i;

      // Shadow keeps it anchored to the deck it is sitting on.
      const g = Pj.project(c.x, c.y, c.z || 0);
      const k2 = Pj.scaleAt(g.depth);
      ctx.beginPath();
      ctx.ellipse(g.sx, g.sy, 11 * k2, 11 * k2 * Pj.groundTilt, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,' +
        (0.3 * Pj.shadowAlphaAt(g.depth)).toFixed(3) + ')';
      ctx.fill();

      /* ── THE SIGNAL, kept constant ─────────────────────────────────────
         A gold ring on the ground under every piece. The piece itself is now
         a different object each time, and without a constant cue that variety
         would cost readability — "there is something to collect here" has to
         look the same whatever the thing turns out to be. */
      ctx.beginPath();
      ctx.ellipse(g.sx, g.sy, 17 * k2, 17 * k2 * Pj.groundTilt, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,211,77,0.55)';
      ctx.lineWidth = 2.4 / BR.Renderer.zoom;
      ctx.stroke();

      /* ── THE PIECE ─────────────────────────────────────────────────────
         It was a four-pointed gold star: the generic video-game collectible,
         in the one place in this game literally called a TOY PIECE. Finding
         every one is the only route to the Heirloom (09_Vehicles.md), so they
         are meant to be bits of a real toy collection — and five identical
         stars on a track is not a collection.

         Four objects, chosen by a hash of the piece's id so a given piece is
         always the same thing, and always the same thing between renders. */
      const P4 = this.PIECE_KINDS;
      let hsh = 0;
      for (let s = 0; s < (c.id || '').length; s++) hsh = (hsh * 31 + c.id.charCodeAt(s)) | 0;
      const kind = P4[Math.abs(hsh + i) % P4.length];

      /* UPRIGHT AND FACING THE CAMERA — not laid on the ground plane.
         Drawn flat on the plane, `groundTilt` 0.30 squashes a piece to a third
         of its height and a brick becomes a sliver. A collectible has to read
         instantly, so it stands up and faces the viewer, which is also the only
         way the pips on a die or the studs on a brick are legible at all.

         The spin is faked by squeezing horizontally, like a card turning on the
         spot: cheaper than rotating the geometry, and it reads as the same
         thing. */
      const centre = Pj.shrink(Pj.project(c.x, c.y, (c.z || 0) + bob), g, k2);
      const squeeze = 0.28 + 0.72 * Math.abs(Math.cos(spin));
      const pp = function (fx, fy) {
        return { sx: centre.sx + fx * squeeze * k2, sy: centre.sy + fy * k2 };
      };
      const shape = function (pts, fill, line) {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
          const p = pp(pts[k][0], pts[k][1]);
          if (k === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        if (line) {
          ctx.strokeStyle = line;
          ctx.lineWidth = 1.8 / BR.Renderer.zoom;
          ctx.stroke();
        }
      };
      const dot = function (fx, fy, r, fill) {
        const p = pp(fx, fy);
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, r * k2, r * k2, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill; ctx.fill();
      };
      const dark = 'rgba(60,40,10,0.70)';

      if (kind === 'brick') {
        // A building brick, studs up. The studs are the whole read.
        shape([[-15, -10], [15, -10], [15, 10], [-15, 10]], '#e05545', dark);
        [[-7.5, -5], [7.5, -5], [-7.5, 5], [7.5, 5]].forEach(function (s) {
          dot(s[0], s[1], 3.6, '#f5806f');
        });
      } else if (kind === 'jigsaw') {
        // A jigsaw piece: a square with a tab out one side and a blank in the
        // other. That asymmetric silhouette is recognisable at any size.
        shape([[-13, -13], [4, -13], [4, -19], [12, -13], [13, -13],
               [13, 13], [4, 13], [4, 7], [-4, 13], [-13, 13]],
              '#5aa8d8', dark);
        dot(-4, -3, 2.6, 'rgba(255,255,255,0.5)');
      } else if (kind === 'die') {
        // A die, five up.
        shape([[-12, -12], [12, -12], [12, 12], [-12, 12]], '#f2efe6', dark);
        [[-6, -6], [6, -6], [0, 0], [-6, 6], [6, 6]].forEach(function (s) {
          dot(s[0], s[1], 2.4, '#2a2622');
        });
      } else {
        // A marble: a glass bead with a twist of colour and a highlight.
        const p = pp(0, 0);
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, 13 * k2, 13 * k2, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#7ec8a9'; ctx.fill();
        ctx.strokeStyle = dark; ctx.lineWidth = 1.8 / BR.Renderer.zoom; ctx.stroke();
        shape([[-8, -2], [0, -7], [8, -2], [0, 4]], 'rgba(255,255,255,0.55)', null);
        dot(-5, -5, 2.4, 'rgba(255,255,255,0.85)');
      }
    }
  },

  /* [side, top] per prop type. Was a pair of two-way ternaries on 'crayon',
     which silently made every unknown type a blue block — and carried a dead
     variable holding a 7-digit hex that was never a colour.

     Sandbox props are plastic: brighter and flatter than the bedroom's waxy
     crayons, because moulded plastic in daylight is not painted wood at night. */
  PROP_COLOURS: {
    crayon: ['#c8452f', '#e86952'],
    block:  ['#2f6fd8', '#4f8ef2'],
    bucket: ['#d1462f', '#f26a4e'],   // red plastic, lighter round the rim
    spade:  ['#f2b134', '#ffd166'],   // yellow, and low enough to drive over
  },

  /* Extruded octagon. Crayons and blocks are the scale cue — a crayon the size
     of a fallen tree. */
  /**
   * A prop looks like the thing it is named after.
   *
   * Every one of them used to be the SAME extruded octagon: a crayon, a wooden
   * block, a bucket and a spade differed only by colour. That is the literal
   * form of "geometric shapes rather than toys", and the fix is not more
   * polygons — it is four silhouettes that are recognisable from overhead,
   * because `groundTilt` 0.30 means the top face is what a player sees.
   *
   * They share one extrusion helper, so a new prop is a footprint and a lid
   * rather than a new renderer.
   */
  drawProp(ctx, p) {
    const Pj = BR.Projection;
    const pz = p.z || 0;
    const anchor = Pj.project(p.x, p.y, pz);
    const k = Pj.scaleAt(anchor.depth);
    const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
    const col = this.PROP_COLOURS[p.type] || this.PROP_COLOURS.block;

    // Local frame: fx along the prop's rotation, fy across, h up from its base.
    const lp = function (fx, fy, h) {
      return Pj.shrink(
        Pj.project(p.x + fx * c - fy * s, p.y + fx * s + fy * c, pz + h),
        anchor, k);
    };
    const poly = function (pts, fill, stroke, w) {
      ctx.beginPath();
      ctx.moveTo(pts[0].sx, pts[0].sy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w || 1; ctx.stroke(); }
    };
    /* Extrude a local footprint between two heights: far side walls first so
       near ones overdraw, then the lid. */
    const extrude = function (foot, h0, h1, side, lid, line) {
      const n = foot.length;
      const order = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ay = p.y + foot[i][0] * s + foot[i][1] * c;
        const by = p.y + foot[j][0] * s + foot[j][1] * c;
        order.push({ i: i, j: j, key: (ay + by) / 2 });
      }
      order.sort(function (a, b) { return a.key - b.key; });
      for (let e = 0; e < order.length; e++) {
        const i = order[e].i, j = order[e].j;
        /* Each side shaded by the way it actually faces, so a block has a lit
           edge and a dark one and stops reading as a flat sticker. The footprint
           is in the prop's local frame, so the normal is rotated into world
           space before it is asked about the light. */
        const ex = foot[j][0] - foot[i][0], ey = foot[j][1] - foot[i][1];
        const lnx = ey, lny = -ex;                       // outward for CCW feet
        const wnx = lnx * c - lny * s, wny = lnx * s + lny * c;
        const shade = Pj.faceLight(Math.atan2(wny, wnx)) * 0.22;
        poly([lp(foot[i][0], foot[i][1], h0), lp(foot[j][0], foot[j][1], h0),
              lp(foot[j][0], foot[j][1], h1), lp(foot[i][0], foot[i][1], h1)],
             BR.Renderer.shade(side, shade));
      }
      const top = foot.map(function (q) { return lp(q[0], q[1], h1); });
      poly(top, lid, line, 1.2);
      return top;
    };

    /* Ground shadow: the sweep of the prop's footprint from where it stands to
       where the light throws it, not a disc parked underneath. A tall crayon
       and a flat block used to cast the same circle, so height was invisible on
       anything that was not moving. `lp` takes LOCAL coordinates, so the world
       offset is rotated into the prop's own frame first. */
    const soff = Pj.lightOffset(p.h || 0);
    const slx =  soff.dx * c + soff.dy * s;
    const sly = -soff.dx * s + soff.dy * c;
    const sbase = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bx = Math.cos(a) * p.r, by = Math.sin(a) * p.r;
      sbase.push([bx, by]);
      sbase.push([bx + slx, by + sly]);
    }
    const sh = this.hull2d(sbase).map(function (q) { return lp(q[0], q[1], 0); });
    poly(sh, 'rgba(0,0,0,' + (0.32 * Pj.shadowAlphaAt(anchor.depth)).toFixed(3) + ')');

    const R = p.r, H = p.h;
    const dark = this.shade(col[0], -0.45);

    if (p.type === 'crayon') {
      /* A crayon LYING DOWN, which is the only way one ends up on a rug: a
         long barrel with a conical tip and a paper wrapper round the middle.
         Drawn along the prop's own rotation, so a scatter of them does not all
         point the same way. */
      /* SLIMMER than the collision radius suggests. Drawn at full width it came
         out a fat red wedge; a crayon is read almost entirely by being long and
         thin with a point on one end, so the barrel is 0.36 of its height
         across and the tip gets a third of the length to taper over. */
      const half = R, rad = H * 0.36, tipAt = half * 0.34;
      extrude([[-half, -rad], [tipAt, -rad], [tipAt, rad], [-half, rad]],
              0, H * 0.78, col[0], col[1], dark);
      // The point. Two faces so it has a ridge down the middle rather than
      // being a flat triangle — that ridge is what makes it look sharpened.
      poly([lp(tipAt, -rad, H * 0.78), lp(half, -rad * 0.12, H * 0.78),
            lp(half, 0, H * 0.55), lp(tipAt, 0, H * 0.78)],
           this.shade(col[1], -0.10), dark, 1);
      poly([lp(tipAt, rad, H * 0.78), lp(half, rad * 0.12, H * 0.78),
            lp(half, 0, H * 0.55), lp(tipAt, 0, H * 0.78)],
           this.shade(col[0], -0.10), dark, 1);
      // Paper wrapper: two narrow bands round the barrel, not one wide one.
      [[-0.62, -0.48], [-0.30, -0.16]].forEach(function (b) {
        poly([lp(half * b[0], -rad, H * 0.78 + 0.1), lp(half * b[1], -rad, H * 0.78 + 0.1),
              lp(half * b[1], rad, H * 0.78 + 0.1), lp(half * b[0], rad, H * 0.78 + 0.1)],
             'rgba(252,248,240,0.88)');
      });

    } else if (p.type === 'bucket') {
      /* A pail: narrow at the base, wide at the rim, with a lip and a dark
         interior. The taper is what makes it a bucket instead of a tin. */
      const n = 10, botR = R * 0.72;
      const foot = [], rim = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        foot.push([Math.cos(a) * botR, Math.sin(a) * botR]);
        rim.push([Math.cos(a) * R, Math.sin(a) * R]);
      }
      // Tapered wall, drawn as its own quads since the two rings differ.
      const order = [];
      for (let i = 0; i < n; i++) order.push({ i: i, j: (i + 1) % n,
        key: p.y + (foot[i][0] * s + foot[i][1] * c) });
      order.sort(function (a, b) { return a.key - b.key; });
      for (let e = 0; e < order.length; e++) {
        const i = order[e].i, j = order[e].j;
        poly([lp(foot[i][0], foot[i][1], 0), lp(foot[j][0], foot[j][1], 0),
              lp(rim[j][0], rim[j][1], H), lp(rim[i][0], rim[i][1], H)], col[0]);
      }
      poly(rim.map(function (q) { return lp(q[0], q[1], H); }), col[1], dark, 1.4);
      // The hollow, inset and dark — a solid lid would read as a drum.
      poly(rim.map(function (q) { return lp(q[0] * 0.78, q[1] * 0.78, H - 0.4); }),
           this.shade(col[0], -0.5));
      // Handle, arcing over.
      ctx.strokeStyle = this.shade(col[0], -0.3);
      ctx.lineWidth = Math.max(1, 2.4 * k / this.zoom);
      ctx.beginPath();
      const h0 = lp(-R * 0.96, 0, H), h1 = lp(0, 0, H * 1.85), h2 = lp(R * 0.96, 0, H);
      ctx.moveTo(h0.sx, h0.sy);
      ctx.quadraticCurveTo(h1.sx, h1.sy, h2.sx, h2.sy);
      ctx.stroke();

    } else if (p.type === 'spade') {
      /* A sand spade: a blade with a shaft and a cross-grip. Low enough to
         drive over, so it is mostly read from directly above. */
      /* HEIGHTS HAVE TO DIFFER or the three parts merge into one yellow lump,
         which is exactly what the first version did. A spade is a flat blade,
         a thin shaft standing above it, and a crossbar on top — reading it
         from overhead depends entirely on those being three different heights. */
      const bw = R * 0.80, blade = H * 0.40;
      // Blade: widest at the far end, like a scoop.
      extrude([[-R * 0.10, -bw * 0.52], [R * 0.62, -bw],
               [R * 0.98, -bw * 0.60], [R * 0.98, bw * 0.60],
               [R * 0.62, bw], [-R * 0.10, bw * 0.52]],
              0, blade, col[0], col[1], dark);
      // Shaft: narrow and tall, so it stands clear of the blade.
      extrude([[-R * 0.88, -bw * 0.17], [-R * 0.06, -bw * 0.17],
               [-R * 0.06, bw * 0.17], [-R * 0.88, bw * 0.17]],
              0, H, col[0], col[1], dark);
      // Grip: a crossbar at the very top of the shaft.
      extrude([[-R * 1.04, -bw * 0.58], [-R * 0.80, -bw * 0.58],
               [-R * 0.80, bw * 0.58], [-R * 1.04, bw * 0.58]],
              H * 0.55, H, this.shade(col[0], -0.16), col[1], dark);

    } else {
      /* Wooden alphabet block: SQUARE, not an octagon, with a bevelled lid and
         a letter face. The square footprint alone does most of the work — an
         eight-sided block is a bollard. */
      const q = R * 0.82;
      const foot = [[-q, -q], [q, -q], [q, q], [-q, q]];
      extrude(foot, 0, H * 0.9, col[0], col[1], dark);
      // Bevel: a slightly inset lid, which is what catches the light on a
      // wooden block and stops the top reading as a flat sticker.
      const inset = foot.map(function (f) { return [f[0] * 0.82, f[1] * 0.82]; });
      poly(inset.map(function (f) { return lp(f[0], f[1], H); }),
           this.shade(col[1], 0.10), dark, 1.1);
      // A letter, drawn as two strokes so it reads at size without a font.
      ctx.strokeStyle = this.shade(col[0], -0.55);
      ctx.lineWidth = Math.max(1, 2.6 * k / this.zoom);
      ctx.beginPath();
      const a1 = lp(-q * 0.34, -q * 0.40, H + 0.1), a2 = lp(q * 0.30, 0, H + 0.1);
      const a3 = lp(-q * 0.34, q * 0.40, H + 0.1);
      ctx.moveTo(a1.sx, a1.sy); ctx.lineTo(a2.sx, a2.sy); ctx.lineTo(a3.sx, a3.sy);
      ctx.stroke();
    }
  },

  /* Toy train. Runs on a strict period so it can be timed. */
  drawHazard(ctx, hz) {
    const Pj = BR.Projection;
    const L = hz.r, W = hz.r * 0.62, H = hz.h;
    const c = Math.cos(hz.heading), s = Math.sin(hz.heading);
    const local = [[L, -W], [L, W], [-L, W], [-L, -W]];
    const world = local.map(function (p) {
      return [hz.x + p[0] * c - p[1] * s, hz.y + p[0] * s + p[1] * c];
    });

    const anchor = Pj.project(hz.x, hz.y, 0);
    const k = Pj.scaleAt(anchor.depth);
    const PT = function (wx, wy, wz) {
      return Pj.shrink(Pj.project(wx, wy, wz), anchor, k);
    };

    // The train is the tallest thing that moves, so it is where a shadow that
    // ignores the light is most obvious. Same sweep as the props.
    const toff = Pj.lightOffset(H);
    const tsh = this.hull2d(world.concat(world.map(function (p) {
      return [p[0] + toff.dx, p[1] + toff.dy];
    })));
    ctx.beginPath();
    for (let i = 0; i < tsh.length; i++) {
      const p = PT(tsh[i][0], tsh[i][1], 0);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,' +
      (0.34 * Pj.shadowAlphaAt(anchor.depth)).toFixed(3) + ')';
    ctx.fill();

    const base = world.map(function (p) { return PT(p[0], p[1], 0); });
    const top  = world.map(function (p) { return PT(p[0], p[1], H); });
    ctx.fillStyle = '#8c4a2f';
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      ctx.beginPath();
      ctx.moveTo(base[i].sx, base[i].sy);
      ctx.lineTo(base[j].sx, base[j].sy);
      ctx.lineTo(top[j].sx, top[j].sy);
      ctx.lineTo(top[i].sx, top[i].sy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      if (i === 0) ctx.moveTo(top[i].sx, top[i].sy);
      else ctx.lineTo(top[i].sx, top[i].sy);
    }
    ctx.closePath();
    ctx.fillStyle = '#c46a44';
    ctx.fill();
  },

  // ── walls ────────────────────────────────────────────────────────────────

  /* Segments around one loop. More than the eye needs, because the silhouette
     is a circle and a coarse ring reads as a polygon at this camera angle. */
  RING_SEGS: 34,

  /**
   * One slice of the loop's ribbon: the surface the car is carried on, plus a
   * rail up each side so it reads as moulded channel rather than a flat band.
   */
  drawRailSegment(ctx, R, s) {
    const Pj = BR.Projection;
    const t0 = s / this.RING_SEGS, t1 = (s + 1) / this.RING_SEGS;

    // Side rails stand off along the SURFACE NORMAL, which on a corkscrew
    // points sideways through the middle of the ride, not upwards.
    const P = function (t, side, lift) {
      const p = BR.Rails.ringPoint(R, t, side, lift);
      return Pj.project(p[0], p[1], p[2]);
    };

    // Driving surface.
    const a0 = P(t0, -1, 0), b0 = P(t0, 1, 0);
    const a1 = P(t1, -1, 0), b1 = P(t1, 1, 0);
    ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy); ctx.lineTo(b0.sx, b0.sy);
    ctx.lineTo(b1.sx, b1.sy); ctx.lineTo(a1.sx, a1.sy);
    ctx.closePath();
    // Banded, so the loop's rotation is legible while you are going round it.
    ctx.fillStyle = (s % 2) ? R.colour : R.altColour;
    ctx.fill();
    ctx.strokeStyle = R.colour;
    ctx.lineWidth = 1 / BR.Renderer.zoom;
    ctx.stroke();

    // Side rails.
    ctx.strokeStyle = R.railColour;
    ctx.lineWidth = 3.5 / BR.Renderer.zoom;
    for (let side = -1; side <= 1; side += 2) {
      const q0 = P(t0, side, 20), q1 = P(t1, side, 20);
      ctx.beginPath();
      ctx.moveTo(q0.sx, q0.sy); ctx.lineTo(q1.sx, q1.sy);
      ctx.stroke();
    }
  },

  /* What the barrier round a track is MADE OF, per world. It was one grey
     brown for every segment on every track, which drew as a single unbroken
     ribbon — the most obviously "geometric" thing left once the surfaces were
     done. A bedroom track is walled in by things that were already in the
     room, and they are not identical to each other.

       town rug   books and blocks laid end to end
       sandbox    timber planks, warm and varied
       stunt      moulded plastic barrier sections

     Jumpable barriers keep their warning colour in every world. That is
     readability, not decoration: it is how a player tells at a glance what to
     fly over rather than avoid, and no amount of character is worth losing
     it. */
  WALL_PALETTES: {
    'town-rug': [
      ['#7d4a4a', '#a97070'], ['#43607d', '#6d8bab'], ['#4f6b47', '#7a996f'],
      ['#8a7250', '#b39a74'], ['#6a4f74', '#94769c'], ['#7a6a56', '#a3927b'],
    ],
    sandbox: [
      ['#8a6238', '#b98d59'], ['#7d5730', '#ad7f4e'], ['#946c40', '#c39763'],
      ['#6f4d2c', '#9c7146'],
    ],
    stunt: [
      ['#d8d3c8', '#f2eee4'], ['#49525f', '#6d7787'],
    ],
  },

  drawWall(ctx, w, fallbackH, arena) {
    const Pj = BR.Projection;
    const H = w.h === undefined ? fallbackH : w.h;

    // Jumpable barriers are drawn in a warning colour so a player can tell at
    // a glance what they are meant to fly over rather than avoid.
    const jumpable = isFinite(w.clearAt);

    /* A stable per-segment identity, hashed from the wall's own position. Not
       random: it has to be the same every frame, and it must not touch the
       shared random stream the AI draws from. */
    const world = (arena && arena.world) || 'town-rug';
    const pal = this.WALL_PALETTES[world] || this.WALL_PALETTES['town-rug'];
    const hash = Math.abs(Math.round(w.ax * 0.37 + w.ay * 0.71));
    const tone = pal[hash % pal.length];

    /* Drawn height varies a little, so the top edge is a row of separate
       objects rather than one ruled line. DRAWN ONLY — `H` still governs what
       a car has to clear, and a barrier that looked lower than it collides
       would be a lie the player pays for. Jumpable ones do not vary at all,
       for exactly that reason. */
    const vary = jumpable ? 1 : 0.90 + (hash % 7) * 0.033;
    const Hd = H * vary;

    // Barriers stand on their own deck, not on the bedroom floor.
    const wz = w.z || 0;
    const a0 = Pj.project(w.ax, w.ay, wz);
    const b0 = Pj.project(w.bx, w.by, wz);
    let a1 = Pj.project(w.ax, w.ay, wz + Hd);
    let b1 = Pj.project(w.bx, w.by, wz + Hd);

    // Height shrinks with depth, computed PER ENDPOINT. Scaling the segment as
    // a whole would step the top edge between neighbouring segments; per
    // endpoint it varies continuously along the wall, with no seam.
    if (Pj.depthScale > 0) {
      a1 = Pj.shrink(a1, a0, Pj.scaleAt(a0.depth));
      b1 = Pj.shrink(b1, b0, Pj.scaleAt(b0.depth));
    }

    ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy);
    ctx.lineTo(b0.sx, b0.sy);
    ctx.lineTo(b1.sx, b1.sy);
    ctx.lineTo(a1.sx, a1.sy);
    ctx.closePath();
    /* LIT BY WHICH WAY IT FACES. A barrier ring used to be one flat tone the
       whole way round the track, so a wall on the near side and a wall on the
       far side were the same colour and the ring read as a printed band rather
       than as a row of standing objects.

       The face drawn is the one turned toward the camera, so the normal is the
       segment's perpendicular with the sign that points that way. Kept to a
       gentle range: these carry the track's readable colour coding, and a light
       strong enough to be dramatic would start hiding which barrier is which. */
    const nx0 = -(w.by - w.ay), ny0 = (w.bx - w.ax);
    const mx = (w.ax + w.bx) / 2, my = (w.ay + w.by) / 2;
    const sgn = ((Pj.camX - mx) * nx0 + (Pj.camY - my) * ny0) < 0 ? -1 : 1;
    const lit = Pj.faceLight(Math.atan2(ny0 * sgn, nx0 * sgn));

    ctx.fillStyle = jumpable ? this.shade('#9c5f2a', lit * 0.16)
                             : this.shade(tone[0], lit * 0.18);
    ctx.fill();

    // The top edge, in the segment's own lighter tone — brighter still when
    // this face is the one turned into the light.
    ctx.beginPath();
    ctx.moveTo(a1.sx, a1.sy);
    ctx.lineTo(b1.sx, b1.sy);
    ctx.strokeStyle = jumpable ? '#e0b46a' : this.shade(tone[1], lit * 0.12);
    ctx.lineWidth = 2.5 / BR.Renderer.zoom;
    ctx.stroke();

    /* The join to the next one. Without it, neighbouring segments in the same
       tone merge back into the ribbon this is trying to break up — the seam is
       what says "these are separate objects standing in a row". */
    ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy);
    ctx.lineTo(a1.sx, a1.sy);
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1.2 / BR.Renderer.zoom;
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
      ctx.lineWidth = 3 / BR.Renderer.zoom;
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

  drawVehicle(ctx, v, x, y, z, heading, isPlayer, deckZ, up) {
    // `z` is absolute height; `deckZ` is the track surface under the car. On a
    // flat track both the shadow and the anchor sit at 0 exactly as before.
    const ground = deckZ || 0;
    const U = up || this.UP;
    const Pj = BR.Projection;
    const spec = v.spec;

    // A ghost is your own best run replayed. Translucent so it reads as a
    // reference rather than a car you might hit.
    if (v.isGhost) {
      ctx.save();
      ctx.globalAlpha = 0.38;
    }
    const L = spec.length / 2, W = spec.width / 2, H = spec.height;
    const c = Math.cos(heading), s = Math.sin(heading);

    // Footprint corners, rotated in WORLD space then projected. This is the
    // architecture in miniature: rotate flat, project last.
    const local = [[L, -W], [L, W], [-L, W], [-L, -W]];
    const world = local.map(function (p) {
      return [x + p[0] * c - p[1] * s, y + p[0] * s + p[1] * c];
    });

    // Everything about this car shrinks with distance, about the point where
    // it meets the floor — so it stays planted while getting smaller.
    const anchor = Pj.project(x, y, ground);
    const shrinkK = Pj.scaleAt(anchor.depth);
    const PT = function (wx, wy, wz) {
      return Pj.shrink(Pj.project(wx, wy, wz), anchor, shrinkK);
    };

    /* ── shadow: on the deck the car is driving on, not on the floor.
       The GAP between car and shadow is the only height cue there is
       (03_Driving_Physics.md) — so it has to mean JUMP height. Casting it on
       the floor of the room would make a car parked on a raised section look
       permanently airborne and destroy the cue everywhere it matters. */
    const height = z - ground;
    const lift = BR.M.clamp(height / 90, 0, 1);

    /* THROWN ALONG THE LIGHT, and no longer faded out by height.

       It used to sit directly beneath the car and be multiplied by
       (1 - lift * 0.55), so at the top of a jump the only height cue in the
       game was at 0.19 alpha on a dark road. It vanished exactly when it was
       needed, and a jump stopped reading as a jump.

       Both halves of that were wrong about shadows. One does not stay under
       its caster as the caster rises, and it does not dissolve — it slides away
       along the light and goes softer. So the cue is now the DISPLACEMENT,
       which grows along a fixed world axis and cannot be mistaken for the car
       merely being drawn further up the screen, and the opacity holds. */
    const off = Pj.lightOffset(height);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = PT(world[i][0] + off.dx, world[i][1] + off.dy, ground);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    // Softer with height, never absent. Distance still lifts it toward the haze.
    ctx.fillStyle = 'rgba(0,0,0,' +
      (0.42 * (1 - lift * 0.18) * Pj.shadowAlphaAt(anchor.depth)).toFixed(3) + ')';
    ctx.fill();

    // ── boost ring, on the ground around the car (vehicle-attached meter).
    //    Drawn as an ellipse squashed by groundTilt so it sits ON the plane.
    //    Player only — a ring under every opponent is noise, not information.
    if (isPlayer && v.boostMeter > 0.001) {
      const g = anchor;
      const rr = spec.length * 0.86 * shrinkK;
      ctx.beginPath();
      ctx.ellipse(g.sx, g.sy, rr, rr * Pj.groundTilt, 0,
                  -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.boostMeter);
      ctx.strokeStyle = v.boosting ? '#ffd34d'
        : (v.boostMeter >= BR.PHYSICS.boostMinToFire ? '#4fd8a8' : '#69a2ff');
      ctx.lineWidth = 3 / BR.Renderer.zoom + 1.5;
      ctx.stroke();
    }

    /* ── DRIFT CHARGE ──────────────────────────────────────────────────────
       `v.driftCharge` is commented "DISPLAY ONLY" in Vehicle.js and was
       displayed NOWHERE. The only thing reading it was Debug.js, which is
       stripped from the shipped bundle — so a value whose entire purpose is to
       be shown was invisible in the actual game.

       That also broke a stated rule. 13_Audio.md: "All gameplay-critical audio
       must have a visual equivalent - no information exists in sound alone",
       and the same document calls the drift-charge-full cue "the single most
       important sound in the game". It had no visual equivalent at all.

       03_Driving_Physics.md open question 3 asks whether drift needs a VISIBLE
       CHARGE TIER, "given we rejected discrete tiers". Both halves can be true:
       the mechanic stays continuous, and only the PRESENTATION is quantised.
       A bar creeping up is unreadable in the middle of a slide, when the car is
       sideways and the player is looking at the apex. A pip lighting is a
       single unmistakable event, seen without being looked at.

       Lit versus unlit rather than hue-versus-hue, so it survives colour
       blindness — the brightness and the fill both carry it. */
    if (isPlayer && v.driftCharge > 0.02) {
      const g = anchor;
      const rr = spec.length * 1.12 * shrinkK;
      const N = 3;
      const gap = 0.30;                       // radians of space between pips
      const span = (Math.PI * 2 - gap * N) / N;
      // Fades out as the charge decays after a drift is released, so the pips
      // do not linger over a car that is no longer earning anything.
      ctx.globalAlpha = Math.min(1, v.driftCharge * 4);

      for (let t = 0; t < N; t++) {
        // Filled proportionally WITHIN the tier, so it is a meter up close and
        // three pips at a glance. The quantised read is the point; the partial
        // fill just stops it feeling like it jumps from nothing.
        const lo = t / N, hi = (t + 1) / N;
        const f = BR.M.clamp((v.driftCharge - lo) / (hi - lo), 0, 1);
        const a0 = -Math.PI / 2 + t * (span + gap);

        // The empty socket, always drawn, so you can see what is still to earn.
        ctx.beginPath();
        ctx.ellipse(g.sx, g.sy, rr, rr * Pj.groundTilt, 0, a0, a0 + span);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 2 / BR.Renderer.zoom + 1;
        ctx.stroke();

        if (f > 0.001) {
          ctx.beginPath();
          ctx.ellipse(g.sx, g.sy, rr, rr * Pj.groundTilt, 0, a0, a0 + span * f);
          /* Same colour language as the boost ring directly inside it, because
             this charge becomes that boost: blue while it is only building,
             green once the tier is banked, gold on the last one. */
          ctx.strokeStyle = f >= 1
            ? (t === N - 1 ? '#ffd34d' : '#4fd8a8')
            : '#69a2ff';
          ctx.lineWidth = 3 / BR.Renderer.zoom + 1.6;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ── which way is up ───────────────────────────────────────────────────
       Upright, up is (0,0,1) and this is the extrusion it has always been.
       On a ride it comes from the rail: a loop swings it backwards through the
       vertical, a corkscrew swings it out sideways. At either halfway point the
       body is below its own footprint and the car is genuinely upside down.

       Rotation is about the car's MID-HEIGHT, not its floor — pivoting on the
       floor edge would make it heave up and down through the ride instead of
       turning on the spot.

       `lp` takes a point in the car's own frame — x forward, y left, h up from
       the deck — all the way to the screen. Everything below is authored in
       those coordinates, so the shapes can be read as a side elevation and the
       flat-rotate-then-project rule is obeyed in one place instead of five. */
    const lp = function (fx, fy, h) {
      const wx = x + fx * c - fy * s;
      const wy = y + fx * s + fy * c;
      const dh = h - H / 2;
      return PT(wx + U.x * dh, wy + U.y * dh, z + H / 2 + U.z * dh);
    };

    const S = this.shapeFor(spec);

    /* ── WHEELS ────────────────────────────────────────────────────────────
       The single strongest "this is a toy car and not a box" cue there is, and
       there were none: the car was four side quads, a flat top and a triangle
       for a nose.

       Drawn BEFORE the body so the body overlaps their inner halves, which is
       what makes them read as sitting under the arches rather than stuck on the
       sides. They stand proud of the body by `S.track` and the body floats at
       `S.ride`, so there is a visible gap of daylight under the car — that gap
       is most of the toy look. */
    const wr = S.wheelR;
    ctx.fillStyle = S.tyre;
    for (let i = 0; i < 4; i++) {
      const fx = (i < 2 ? L * 0.56 : -L * 0.58);
      const side = (i % 2 ? 1 : -1);
      /* Drawn as a FOOTPRINT, not a side-on slab. The camera sits at
         groundTilt 0.30 — almost overhead — so what you actually see of a car
         is its top, and a wheel drawn as a vertical disc facing sideways is
         edge-on and invisible. These are little rounded rectangles lying on the
         ground, poking out past the body, which is what a wheel looks like from
         above and is the strongest silhouette cue the car has. */
      const wy0 = side * (W * 0.74), wy1 = side * (W + S.track);
      const quad = [
        lp(fx - wr, wy0, S.ride * 0.5), lp(fx + wr, wy0, S.ride * 0.5),
        lp(fx + wr * 0.9, wy1, S.ride * 0.5), lp(fx - wr * 0.9, wy1, S.ride * 0.5),
      ];
      ctx.beginPath();
      ctx.moveTo(quad[0].sx, quad[0].sy);
      for (let k = 1; k < 4; k++) ctx.lineTo(quad[k].sx, quad[k].sy);
      ctx.closePath();
      ctx.fill();
    }

    /* ── BODY ──────────────────────────────────────────────────────────────
       A chamfered footprint rather than a rectangle. Eight points instead of
       four is cheap and it kills the hard corners that made the old shape read
       as a brick — moulded plastic has no sharp edges anywhere. */
    const foot = S.foot(L, W);
    const n = foot.length;
    const bot = foot.map(function (p) { return lp(p[0], p[1], S.ride); });
    const top = foot.map(function (p) { return lp(p[0], p[1], S.ride + S.bodyH); });

    // Sides, far edges first so nearer ones overdraw them.
    const edges = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = [x + foot[i][0] * c - foot[i][1] * s, y + foot[i][0] * s + foot[i][1] * c];
      const b = [x + foot[j][0] * c - foot[j][1] * s, y + foot[j][0] * s + foot[j][1] * c];
      edges.push({ i: i, j: j, key: (a[1] + b[1]) / 2 });
    }
    edges.sort(function (a, b) { return a.key - b.key; });

    ctx.fillStyle = spec.colorBody;
    for (let e = 0; e < edges.length; e++) {
      const i = edges[e].i, j = edges[e].j;
      ctx.beginPath();
      ctx.moveTo(bot[i].sx, bot[i].sy);
      ctx.lineTo(bot[j].sx, bot[j].sy);
      ctx.lineTo(top[j].sx, top[j].sy);
      ctx.lineTo(top[i].sx, top[i].sy);
      ctx.closePath();
      ctx.fill();
    }

    /* Bonnet — the top of the lower body, and the face the camera mostly sees.
       OUTLINED. A dark line round the silhouette is what separates one car from
       the car it is overlapping, and it is most of why moulded plastic reads as
       moulded plastic rather than as a coloured region. */
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(top[i].sx, top[i].sy); else ctx.lineTo(top[i].sx, top[i].sy);
    }
    ctx.closePath();
    ctx.fillStyle = spec.colorTop;
    ctx.fill();
    ctx.strokeStyle = S.line;
    ctx.lineWidth = Math.max(0.6, 1.6 * shrinkK / this.zoom);
    ctx.stroke();

    /* ── CABIN ─────────────────────────────────────────────────────────────
       Set back from the nose, narrower than the body. This is what gives the
       silhouette a bonnet and a roof instead of one slab, and it is the second
       half of reading as a car rather than a wedge. */
    const cf = S.cabinF * L, cb = -S.cabinB * L, cw = W * S.cabinW;
    const cabFoot = [[cf, -cw], [cf, cw], [cb, cw], [cb, -cw]];
    const cz0 = S.ride + S.bodyH;
    const cz1 = cz0 + S.cabinH;
    const cbot = cabFoot.map(function (p) { return lp(p[0], p[1], cz0); });
    const ctop = cabFoot.map(function (p) { return lp(p[0], p[1], cz1); });

    const cEdges = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = [x + cabFoot[i][0] * c - cabFoot[i][1] * s,
                 y + cabFoot[i][0] * s + cabFoot[i][1] * c];
      const b = [x + cabFoot[j][0] * c - cabFoot[j][1] * s,
                 y + cabFoot[j][0] * s + cabFoot[j][1] * c];
      cEdges.push({ i: i, j: j, key: (a[1] + b[1]) / 2, front: i === 0 });
    }
    cEdges.sort(function (a, b) { return a.key - b.key; });
    for (let e = 0; e < cEdges.length; e++) {
      const i = cEdges[e].i, j = cEdges[e].j;
      ctx.beginPath();
      ctx.moveTo(cbot[i].sx, cbot[i].sy);
      ctx.lineTo(cbot[j].sx, cbot[j].sy);
      ctx.lineTo(ctop[j].sx, ctop[j].sy);
      ctx.lineTo(ctop[i].sx, ctop[i].sy);
      ctx.closePath();
      // The forward face is glass. Dark and cool against the body colour, so
      // the car has a front without needing the old nose triangle.
      ctx.fillStyle = cEdges[e].front ? S.glass : spec.colorBody;
      ctx.fill();
    }

    /* Roof. A DIFFERENT colour from the bonnet, which is the whole reason the
       cabin reads as a cabin — drawn in `colorTop` like the bonnet, the two
       merged into one lighter slab and the car went back to being a block. */
    const quad = function (pts, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(pts[0].sx, pts[0].sy);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].sx, pts[k].sy);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    quad(ctop, S.roof, S.line);

    /* ── WINDSCREEN AND REAR WINDOW ────────────────────────────────────────
       On the TOP face, not on the cabin's vertical front. At groundTilt 0.30
       the camera is nearly overhead, so a vertical pane is edge-on and
       contributes about two pixels — the first version put the glass there and
       it may as well not have existed. Seen from above, a toy car is a bonnet,
       a windscreen, a roof and a back window, and those four bands in the right
       order are what says "car" at twenty-eight pixels long. */
    quad([lp(cf + L * 0.20, -cw * 0.94, cz1 - 0.2), lp(cf + L * 0.20, cw * 0.94, cz1 - 0.2),
          lp(cf, cw * 0.98, cz1), lp(cf, -cw * 0.98, cz1)], S.glass, null);
    quad([lp(cb, -cw * 0.94, cz1), lp(cb, cw * 0.94, cz1),
          lp(cb - L * 0.13, cw * 0.86, cz1 - 0.2), lp(cb - L * 0.13, -cw * 0.86, cz1 - 0.2)],
         S.glassBack, null);

    // Gloss: one pale streak along the roof. Painted plastic has a highlight
    // and matte cardboard does not.
    quad([lp(cf * 0.86, -cw * 0.56, cz1 + 0.02), lp(cb * 0.86, -cw * 0.56, cz1 + 0.02),
          lp(cb * 0.86, -cw * 0.14, cz1 + 0.02), lp(cf * 0.86, -cw * 0.14, cz1 + 0.02)],
         'rgba(255,255,255,0.18)', null);

    /* Headlights. Two dots, and they do more than they should — they give the
       car a FACE, which is the difference between a toy and a wedge. */
    const hz = S.ride + S.bodyH + 0.02;
    ctx.fillStyle = S.lamp;
    [-1, 1].forEach(function (side) {
      quad([lp(L * 0.95, side * W * 0.34, hz), lp(L * 0.95, side * W * 0.60, hz),
            lp(L * 0.84, side * W * 0.62, hz), lp(L * 0.84, side * W * 0.36, hz)],
           S.lamp, null);
    });
    // And a bumper, in the trim colour, so the nose is not bare.
    quad([lp(L * 0.99, -W * 0.66, S.ride + S.bodyH * 0.42),
          lp(L * 0.99, W * 0.66, S.ride + S.bodyH * 0.42),
          lp(L * 0.99, W * 0.66, S.ride + S.bodyH * 0.06),
          lp(L * 0.99, -W * 0.66, S.ride + S.bodyH * 0.06)], spec.colorTrim, null);

    if (v.isGhost) ctx.restore();
  },

  /* Proportions, derived from the stats a vehicle already has so every car in
     the roster gained a shape without a data migration — and so a car added
     later gets one for free.

     The derivations are characterisation, not arithmetic for its own sake:
     a heavy vehicle sits taller on bigger wheels, a nimble one is squat with
     its cabin further back. 09_Vehicles.md: "material is characterisation". */
  shapeFor(spec) {
    if (spec._shape) return spec._shape;
    const heavy = BR.M.clamp((spec.weight - 0.6) / 0.9, 0, 1);
    const H = spec.height;
    const s = {
      wheelR: Math.max(3.2, spec.length * (0.15 + 0.02 * heavy)),
      track:  spec.width * 0.17,          // how far the wheels stand proud
      ride:   H * (0.20 + 0.10 * heavy),
      bodyH:  H * 0.46,
      cabinH: H * (0.34 + 0.08 * heavy),
      /* A CABIN, not a lid. At 0.30/0.86 it ran almost the whole length of the
         car and there was no bonnet left — the silhouette went back to being a
         slab with a stripe on it. Pulled in at both ends there is a bonnet in
         front and a boot behind, which is the profile that says "car" before
         any of the detail is legible. */
      cabinF: 0.14,                       // cabin front, as a fraction of L
      cabinB: 0.58,                       // cabin back
      cabinW: 0.78,
      tyre:  '#231e1b',
      /* The roof is the body colour DARKENED, not the bonnet's lighter tint.
         Two tints of one colour keep the car obviously one moulded object while
         still separating bonnet from cabin — a third hue would read as a
         sticker. */
      roof:  this.shade(spec.colorBody, -0.18),
      line:  this.shade(spec.colorBody, -0.62),
      glass: 'rgba(126,178,206,0.92)',
      glassBack: 'rgba(126,178,206,0.62)',
      lamp:  'rgba(255,244,214,0.95)',
      foot: this.chamferedFootprint,
    };
    spec._shape = s;
    return s;
  },

  /* Lighten or darken a #rrggbb by a fraction. Kept here rather than authored
     per vehicle so a car added later gets a matching roof and outline for
     free — and so the two can never drift apart in the data. */
  shade(hex, amt) {
    const h = (hex || '#888888').replace('#', '');
    const n = parseInt(h.length === 3
      ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    const f = function (v) {
      const t = amt < 0 ? 0 : 255;
      return Math.round((t - v) * Math.abs(amt) + v);
    };
    const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  },

  /**
   * Convex hull of [x, y] pairs, counter-clockwise (Andrew's monotone chain).
   *
   * For shadows. A solid lit from one side does not cast its own footprint
   * where it stands — it casts the SWEEP of that footprint from where it
   * stands to where the light throws it. That sweep is the hull of the base
   * and the base offset, and taking the hull rather than drawing both shapes
   * matters: two overlapping fills at the same alpha double-darken down the
   * middle and the join reads as a crease.
   */
  hull2d(pts) {
    if (pts.length < 4) return pts.slice();
    const p = pts.slice().sort(function (a, b) {
      return a[0] === b[0] ? a[1] - b[1] : a[0] - b[0];
    });
    const cross = function (o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };
    const build = function (src) {
      const out = [];
      for (let i = 0; i < src.length; i++) {
        while (out.length >= 2 &&
               cross(out[out.length - 2], out[out.length - 1], src[i]) <= 0) out.pop();
        out.push(src[i]);
      }
      out.pop();
      return out;
    };
    return build(p).concat(build(p.reverse()));
  },

  /* Eight points: a rectangle with its corners cut. Cheap, and it removes the
     hard right-angles that made the old shape read as a brick. */
  chamferedFootprint(L, W) {
    const cx = L * 0.26, cy = W * 0.34;
    return [
      [L, -W + cy], [L, W - cy],
      [L - cx, W], [-L + cx * 0.8, W],
      [-L, W - cy], [-L, -W + cy],
      [-L + cx * 0.8, -W], [L - cx, -W],
    ];
  },
};
