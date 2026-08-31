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
  /* ── THE SENSE OF SPEED ─────────────────────────────────────────────────
     Measured before it was touched: at 336 units/sec a point fixed to the
     ground crosses the screen at 110 px/sec, on a view 595px tall. The screen
     takes FIVE SECONDS to scroll once. That is the whole of the "it doesn't
     feel fast enough" complaint, and it is arithmetic rather than taste.

     groundTilt is 0.30, so forward motion is compressed to 30% on screen — and
     forward is the direction you are travelling. Sideways motion is drawn at
     full rate; the one axis that matters is the one that is squashed. The tilt
     cannot move (every piece of art in the game is built at 0.30, 12_Art_Guide)
     and the projection has no perspective to stretch, so the flow the eye reads
     has to be supplied.

     THE OLD STREAKS SUPPLIED NONE OF IT, in two separate ways:

       - They did not MOVE. Fourteen lines at fixed positions, redrawn in the
         same places every frame. Static marks are an overlay, not motion; the
         eye reads speed from things TRAVELLING across the retina.
       - They ran the WRONG WAY. They were horizontal, and the camera rotates so
         travel is up the screen — so they lay across the direction of motion.
         Perpendicular streaks say "moving sideways", which is what a car does
         in a slide, not what it does at 340.

     Now they run ALONG the axis of travel and scroll down it at the ground's
     own rate, so what the edge of the screen does is honest: it is the flow the
     projection cannot give you, drawn where peripheral vision reads speed
     rather than over the road you are trying to look at. */
  drawSpeedStreaks(ctx, v, W, H, cam) {
    if (!v) return;
    const C = BR.CAMERA;
    const speed = Math.hypot(v.vel.x, v.vel.y);
    if (speed < C.streakSpeed) return;

    const top = (v.spec && v.spec.maxSpeed) || 300;
    const over = (speed - C.streakSpeed) / Math.max(1, top * 1.15 - C.streakSpeed);
    const a = Math.min(C.streakMax, over * C.streakMax);
    if (a <= 0.01) return;

    // How far the streaks have travelled, accumulated in updateFeel from the
    // real ground flow. Falls back to 0 so a view without feel state still
    // draws something rather than throwing.
    const phase = (cam && cam.flowPhase) || 0;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();

    /* Deterministic placement from a fixed table rather than Math.random, for
       the same reason pays.sh is seeded: a renderer that consumes the shared
       random stream makes everything downstream of it unreproducible. The
       MOTION now comes from the phase, not from re-rolling positions. */
    const N = 18;
    const len = 46 + 120 * over;            // longer the faster you go
    const span = H + len;
    for (let i = 0; i < N; i++) {
      const f = (i * 0.6180339887) % 1;                 // golden-ratio spread
      // Scrolls DOWN the screen, wrapping. Travel is up the screen, so the
      // world goes the other way.
      const yy = ((f * span) + (phase % span) + span) % span - len;
      const inset = 6 + ((i * 53) % 74);
      ctx.moveTo(inset, yy);       ctx.lineTo(inset, yy + len);
      ctx.moveTo(W - inset, yy);   ctx.lineTo(W - inset, yy + len);
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

    /* ── how far the ground has actually flowed ────────────────────────────
       The streaks scroll at the rate a point fixed to the ground crosses the
       screen: speed * groundTilt * zoom. Taking the REAL number rather than a
       pleasant-looking constant is the point — the edge of the screen then
       tells the truth about how fast you are going, and it speeds up and slows
       down with the car instead of running at its own tempo.

       A multiplier on top, because honest is not the same as legible: at
       ground rate the streaks are as slow as the floor, which is the very
       thing that does not read. `streakFlow` is how much faster than the world
       the periphery is allowed to move. */
    cam.flowPhase = (cam.flowPhase || 0) +
      speed * BR.Projection.groundTilt * (cam.zoom || C.zoom) * C.streakFlow * dt;

    // Speed rumble: a state, not an event. Eased rather than snapped, or it
    // flickers on and off at the threshold every time the car brushes it.
    const rumTarget = C.rumbleMax * frac * frac;      // squared: only near the top
    cam.rumble = M.lerp(cam.rumble || 0, rumTarget, 1 - Math.exp(-6 * dt));
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

    /* ── speed rumble ──────────────────────────────────────────────────────
       A second, much smaller tremor that rises with speed and never stops
       while you are quick. The impact shake above is an EVENT; this is a
       STATE, and the two are deliberately different in size and rate — a
       rumble you can consciously see is a broken camera, so the ceiling is a
       couple of pixels.

       It is here because the honest cue is not available: the ground only
       flows past at 110 px/sec at full speed (groundTilt compresses the one
       axis you travel along), and a still camera over a slow-moving floor is
       what reads as sliding. A car at the limit should feel slightly out of
       control, and the cheapest true version of that is that the picture will
       not sit perfectly still. */
    const rum = cam.rumble || 0;
    if (rum > 0.01) {
      const rt = (cam.shakeT || 0) * BR.CAMERA.rumbleHz;
      shx += Math.sin(rt * 1.11) * rum;
      shy += Math.sin(rt) * rum * 0.8;
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

    /* The room comes in two halves and the ground goes between them. The floor
       beyond the play surface, and the shadow the surface drops on it, must be
       UNDER it; everything that stands up must be over it, because drawGround
       fills the whole bounds quad in one pass with no regard for depth. */
    this.drawRoomFloor(ctx, arena);
    this.drawGround(ctx, arena);
    this.drawRoom(ctx, arena);
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
    this.drawSpeedStreaks(ctx, v, W, H, view.cam);
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

  /* ══ THE ROOM ══════════════════════════════════════════════════════════════
     What lies BEYOND the play surface.

     Until now the world stopped at `arena.bounds` and outside it was the
     cleared canvas — flat dark nothing. That is the one thing left undoing the
     rug. 12_Art_Guide.md argues at length that a rug is an OBJECT LYING ON A
     FLOOR and what says so is that it stops; then it stopped against nothing,
     and a thing lying on nothing is not lying on anything. Same for the rest:
     a sandpit with no ground under it is a sand-coloured rectangle, and a
     table with a 420-unit drop off the side is only a table if you can see
     what you would land on.

     WHAT THIS IS NOT is a modelled bedroom. Every rule below exists to keep the
     room from competing with the track:

       - It is DIM. Floors are darkened and desaturated against the surface
         they surround, and nothing out here carries a bright hue or a hard
         pale edge — pale hard edges are the kerb's, and stay the kerb's.
       - It is BEYOND THE BARRIER, always. The nearest thing the room draws is
         at `arena.bounds`, which is the outer road edge plus 400: past the
         wall, and on the rug past the binding tape as well.
       - It is HAZED, for free. `drawDepthFade` runs in screen space after
         everything, and the room lives in the top of the frame where the fade
         is strongest, so it comes out of the same atmosphere the far track
         does rather than being desaturated by hand twice.
       - NOTHING HERE COLLIDES. It is drawn and nothing else — no entry in
         `arena.walls`, `props` or `hazards`, nothing the simulation can see.

     TWO KINDS OF SURROUND, and the difference is the whole point:

       town-rug, sandbox   the play surface is an OBJECT resting on the floor,
                           so the surround is a DIFFERENT material and the
                           break is meant to be seen: boards under the rug,
                           grass under the sandpit.
       stunt, kitchen      the arena's own ground plane already IS the room
                           floor — `groundColour` on those tracks is commented
                           "the bedroom floor" and "the kitchen floor, four
                           hundred units down". So the surround is derived from
                           that colour and simply CONTINUES, and the seam at
                           the bounds must not be visible at all.

     THE LIGHT AGREES WITH EVERYTHING ELSE. Faces are shaded through
     `Pj.faceLight` from the world angle of their outward normal, and the play
     surface throws a shadow onto the floor below it through `Pj.lightOffset` —
     the rug's own thickness on the boards, the sandpit's frame on the grass,
     the track's raised deck onto the bedroom floor, and the table onto the
     kitchen tiles. That last one is worth more than the furniture.          */

  /* How far past `arena.bounds` the walls stand, and it is a MEASURED number
     rather than a taste one. groundTilt 0.30 buys a very short horizon: the top
     of the viewport is `h * horizonBias / zoom / groundTilt` world units ahead
     of the camera, which on the 595-tall canvas the shot harness renders is
     1,069 — barely nine car lengths. `arena.bounds` is already the outer road
     edge plus 400, so a wall at 900 past THAT is 1,300 ahead of a car on the
     outside of the circuit and is never on screen at all. The first version
     used 900 and rendered an empty band of floor every time.

     420 puts the skirting 820 units past the outer kerb: seven car lengths, far
     enough that nothing can be mistaken for road and nothing can be reached,
     close enough to be inside the horizon from the outer half of any track. A
     full-window canvas sees nearly twice as far and simply gets more room. */
  ROOM_OUT: 420,

  ROOMS: {
    'town-rug': {
      floor: '#7a5734',                  // varnished pine, warm and dark
      tile: 'boards',
      sill: 18,                          // the rug's own thickness
      wall: '#a8a08e', skirt: '#d8d1bf', skirtH: 96, wallH: 820,
    },
    'stunt': {
      floor: null,                       // continue arena.groundColour
      tile: 'boards',
      sill: 0,
      wall: '#575064', skirt: '#6d667a', skirtH: 96, wallH: 820,
    },
    'kitchen': {
      floor: null,                       // continue arena.groundColour
      tile: 'flags',
      sill: 0,
      wall: '#9aa0a4', skirt: '#c4c8c8', skirtH: 96, wallH: 820,
    },
    'sandbox': {
      /* Outdoors — 08_World_Sandbox.md opens on "a backyard sandbox". So no
         skirting and no plaster: grass, and a fence at the end of it. */
      floor: '#5f7042',
      tile: 'grass',
      sill: 84,                          // the pit stands proud of the lawn
      pit: true,                         // ...and has sides holding it up
      wall: '#6b5a3f', skirt: '#7d6a4a', skirtH: 40, wallH: 210,
    },
  },

  /* Small props standing in the surround, placed against the BOUNDS rather
     than in world coordinates, so one list serves every track in a world and a
     new track inherits its room for nothing.

       side   0 = -x, 1 = +x, 2 = -y, 3 = +y
       along  0..1 down that edge
       out    0..1 across the band, 0 at the bounds and 1 at the wall
       w      along the wall,  d  out from it,  h  up

     Deliberately few. The brief for this world is "the odd furniture leg, a
     scattered toy", and a dozen objects out here would be a second scene
     rather than a hint of one.

     Every depth obeys `out * ROOM_OUT + d / 2 <= ROOM_OUT`, or the back of the
     thing goes through the wall. And every height is kept well under 420,
     because heightScale draws a 400-tall object 340 pixels up a 595-pixel
     view — furniture out here occupies a startling amount of screen and the
     first pass at these numbers put a chest of drawers across the top third
     of the frame. */
  ROOM_PROPS: {
    'town-rug': [
      { kind: 'box', side: 3, along: 0.30, out: 0.52, w: 1900, d: 360, h: 330,
        colour: '#7d5c3e' },                        // a chest of drawers
      { kind: 'leg', side: 1, along: 0.24, out: 0.42, r: 54, h: 260,
        colour: '#6b4e35' },                        // the foot of the bed
      { kind: 'leg', side: 1, along: 0.53, out: 0.42, r: 54, h: 260,
        colour: '#6b4e35' },
      { kind: 'box', side: 0, along: 0.61, out: 0.30, w: 118, d: 118, h: 118,
        colour: '#3f6cb4' },                        // a block, off the rug
      { kind: 'leg', side: 2, along: 0.44, out: 0.42, r: 82, h: 150,
        colour: '#b0503c' },                        // the tin the crayons live in
    ],
    'stunt': [
      { kind: 'box', side: 3, along: 0.44, out: 0.50, w: 2300, d: 380, h: 400,
        colour: '#5d4d58' },                        // the dresser, named on the box
      { kind: 'box', side: 0, along: 0.36, out: 0.40, w: 720, d: 400, h: 230,
        colour: '#4c4351' },                        // the toy box
      { kind: 'leg', side: 1, along: 0.58, out: 0.40, r: 58, h: 300,
        colour: '#493e47' },
    ],
    'kitchen': [
      { kind: 'box', side: 3, along: 0.50, out: 0.54, w: 2600, d: 340, h: 360,
        colour: '#8e8070' },                        // the run of units
      { kind: 'leg', side: 0, along: 0.34, out: 0.40, r: 40, h: 240,
        colour: '#7b5d3f' },                        // a chair, pushed in
      { kind: 'leg', side: 0, along: 0.46, out: 0.40, r: 40, h: 240,
        colour: '#7b5d3f' },
      { kind: 'leg', side: 2, along: 0.63, out: 0.38, r: 40, h: 240,
        colour: '#7b5d3f' },
    ],
    'sandbox': [
      { kind: 'leg', side: 2, along: 0.33, out: 0.44, r: 108, h: 210,
        colour: '#9a5f40' },                        // a terracotta pot
      { kind: 'box', side: 1, along: 0.56, out: 0.34, w: 130, d: 420, h: 40,
        colour: '#8b7450' },                        // a plank, put down and left
    ],
  },

  /* ── the floor, and the shadow the play surface drops on it ───────────────
     Drawn BEFORE drawGround, because the play surface is meant to cover the
     inner part of both: the shadow is a full offset copy of the surface's
     footprint and what survives is the crescent that sticks out on the side
     the light is going. Getting that for one quad is the whole reason it is
     drawn underneath rather than clipped. */
  drawRoomFloor(ctx, arena) {
    const R = this.ROOMS[arena.world];
    if (!R) return;
    const Pj = BR.Projection;
    const b = arena.bounds;
    const OUT = this.ROOM_OUT;
    const z = -R.sill;

    /* A RING, not a rectangle. The room floor under the arena is never seen —
       the play surface covers it — and filling it anyway costs two full-screen
       fills a frame at the widest part of the view, paid again per viewport.
       The hole is pulled INSIDE the bounds by sill * 2.83, which is exactly
       how far a plane `sill` below the surface slides down the screen relative
       to it (heightScale / groundTilt, the exchange rate in Projection.js), so
       the sandpit's lawn cannot open a gap along the near edge. */
    const IN = R.sill * (Pj.heightScale / Pj.groundTilt) + 120;
    const o = [
      Pj.project(b.minX - OUT, b.minY - OUT, z),
      Pj.project(b.maxX + OUT, b.minY - OUT, z),
      Pj.project(b.maxX + OUT, b.maxY + OUT, z),
      Pj.project(b.minX - OUT, b.maxY + OUT, z),
    ];
    const i = [
      Pj.project(b.minX + IN, b.minY + IN, z),
      Pj.project(b.maxX - IN, b.minY + IN, z),
      Pj.project(b.maxX - IN, b.maxY - IN, z),
      Pj.project(b.minX + IN, b.maxY - IN, z),
    ];
    ctx.beginPath();
    ctx.moveTo(o[0].sx, o[0].sy);
    for (let k = 1; k < 4; k++) ctx.lineTo(o[k].sx, o[k].sy);
    ctx.closePath();
    ctx.moveTo(i[0].sx, i[0].sy);                   // wound the other way, so
    for (let k = 3; k > 0; k--) ctx.lineTo(i[k].sx, i[k].sy);   // it is a hole
    ctx.closePath();

    ctx.fillStyle = R.floor || this.shade(arena.groundColour, 0.05);
    ctx.fill();
    const pat = this.roomPattern(ctx, this.roomTile(arena, R), z);
    if (pat) { ctx.fillStyle = pat; ctx.fill(); }

    /* CONTACT SHADOW. A rug is 18 units thick and a sandpit frame stands 110
       above the lawn, so neither throws much — 14 and 87 units. Two copies at
       different offsets rather than one, because the near half of a shadow
       this shallow is nearly opaque and the far half is nearly gone, and a
       single flat alpha reads as a painted border instead. */
    if (R.sill > 0) {
      // The pit throws from the TOP of its frame and from the frame's outer
      // face, not from the sand — 96 out and 30 higher than the sand it holds.
      const G = R.pit ? 96 : 0;
      const H = R.sill + (R.pit ? 30 : 0);
      const steps = [[2.1, 0.10], [1.0, 0.17]];
      for (let s = 0; s < steps.length; s++) {
        const off = Pj.lightOffset(H * steps[s][0]);
        ctx.beginPath();
        const q = [[b.minX - G, b.minY - G], [b.maxX + G, b.minY - G],
                   [b.maxX + G, b.maxY + G], [b.minX - G, b.maxY + G]];
        for (let k = 0; k < 4; k++) {
          const p = Pj.project(q[k][0] + off.dx, q[k][1] + off.dy, z);
          if (k === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(24,18,14,' + steps[s][1] + ')';
        ctx.fill();
      }
    }
  },

  /* ── everything in the room that stands up ────────────────────────────────
     Drawn AFTER drawGround and BEFORE drawRoad, and both halves of that matter.

     After the ground, because anything with height reaches up the screen over
     ground that is behind it, and drawGround fills the whole bounds quad in
     one go regardless of depth — a wall drawn first would be erased by the
     floor it stands behind.

     Before the road, because the road is nearer than all of it. The painter's
     order comes out right on its own here: the room is convex and everything
     it draws is outside the bounds, so the only ground it can ever paint over
     is ground further away than itself. */
  drawRoom(ctx, arena) {
    const R = this.ROOMS[arena.world];
    if (!R) return;
    this.drawDeckShadow(ctx, arena);
    this.drawRoomWalls(ctx, arena, R);
    this.drawRoomProps(ctx, arena, R);
  },

  /**
   * The shadow the raised deck drops on the floor a long way below it.
   *
   * This is the cheapest height cue in the game and the one the elevated
   * worlds were missing. Dresser Drop puts you 300 units up and Shelf Run 440,
   * and the only thing that ever said so was a pillar every sixth segment.
   *
   * ONE PATH, ONE FILL, however many pieces go into it. Overlapping fills at
   * the same alpha double-darken where they meet and every join reads as a
   * crease — the same trap `hull2d` exists to avoid on props. Collected as
   * subpaths of a single path and filled once, the alpha is applied to the
   * union instead.
   *
   * The kitchen is the exception and it is a deliberate one: a table is a
   * SOLID, so its shadow is the whole outer ring filled in, not a ribbon.
   * Drawing the ribbon there would put a doughnut of daylight on the kitchen
   * floor under the middle of the table.
   */
  drawDeckShadow(ctx, arena) {
    if (!arena.elevated) return;
    const Pj = BR.Projection;
    const o = arena.outer, ip = arena.inner;
    if (!o || !o.length) return;
    const n = o.length;
    const FLOOR = 40;                 // Recovery's FLOOR_Z: below it is not a drop
    let drew = false;

    ctx.beginPath();
    if (arena.world === 'kitchen') {
      const off = Pj.lightOffset(o[0][2] || 0);
      for (let k = 0; k < n; k += 2) {
        const p = Pj.project(o[k][0] + off.dx, o[k][1] + off.dy, 0);
        if (!drew) { ctx.moveTo(p.sx, p.sy); drew = true; }
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
    } else {
      /* Every SECOND segment, spanning two. A shadow 240 units from the thing
         casting it does not need the deck's own 80-unit resolution, and this
         is the widest part of the view — the same argument the road makes for
         culling, one step further. */
      for (let k = 0; k < n; k += 2) {
        const j = (k + 2) % n;
        const zk = o[k][2] || 0;
        if (zk <= FLOOR) continue;
        const a = Pj.lightOffset(zk), c = Pj.lightOffset(o[j][2] || 0);
        if (!this.onScreen(o[k][0] + a.dx, o[k][1] + a.dy, 0) &&
            !this.onScreen(ip[k][0] + a.dx, ip[k][1] + a.dy, 0)) continue;
        const q = [
          Pj.project(o[k][0]  + a.dx, o[k][1]  + a.dy, 0),
          Pj.project(o[j][0]  + c.dx, o[j][1]  + c.dy, 0),
          Pj.project(ip[j][0] + c.dx, ip[j][1] + c.dy, 0),
          Pj.project(ip[k][0] + a.dx, ip[k][1] + a.dy, 0),
        ];
        ctx.moveTo(q[0].sx, q[0].sy);
        for (let m = 1; m < 4; m++) ctx.lineTo(q[m].sx, q[m].sy);
        ctx.closePath();
        drew = true;
      }
    }
    if (!drew) return;
    ctx.fillStyle = 'rgba(16,12,18,0.30)';
    ctx.fill();
  },

  /**
   * A straight run of upright board: a skirting, a stretch of wall, the side
   * of a sandpit.
   *
   * BACKFACE CULLED, and not as an optimisation. The camera is INSIDE the room,
   * so at most two of the four walls are ever turned toward it; drawing the
   * other two paints the near ones across the floor in front of the car,
   * because their quads run up the screen exactly like the far ones do.
   *
   * `nrm` is the WORLD angle of the face's outward normal — the direction it
   * looks. `Projection.project` builds camera-space y as x*_sin + y*_cos and
   * documents larger as nearer, so a face is turned toward the viewer exactly
   * when its normal has a positive one. That same angle goes to `faceLight`,
   * so the wall you are driving toward is lit by the room's own light rather
   * than by a constant chosen from one camera angle.
   */
  roomBoard(ctx, ax, ay, bx, by, z0, z1, nrm, colour, amt) {
    const Pj = BR.Projection;
    if (Math.cos(nrm) * Pj._sin + Math.sin(nrm) * Pj._cos <= 0) return;

    // Sampled along its length, not by its corners: these runs are thousands
    // of units long and a corner test drops a wall whose middle is in shot.
    let on = false;
    for (let s = 0; s <= 10 && !on; s++) {
      const t = s / 10;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      on = this.onScreen(x, y, z0) || this.onScreen(x, y, z1);
    }
    if (!on) return;

    const p = [Pj.project(ax, ay, z0), Pj.project(bx, by, z0),
               Pj.project(bx, by, z1), Pj.project(ax, ay, z1)];
    ctx.beginPath();
    ctx.moveTo(p[0].sx, p[0].sy);
    for (let k = 1; k < 4; k++) ctx.lineTo(p[k].sx, p[k].sy);
    ctx.closePath();
    ctx.fillStyle = this.shade(colour, (amt === undefined ? -0.10 : amt) +
                                       Pj.faceLight(nrm) * 0.14);
    ctx.fill();
  },

  /* The four sides of the room, plus — in the sandbox — the four sides of the
     pit. The pit is the part that makes the sand read as being CONTAINED: a
     timber frame standing 30 units proud of the sand, with the lawn 84 below
     it, so the sand is visibly held up rather than painted on. */
  drawRoomWalls(ctx, arena, R) {
    const b = arena.bounds;
    const OUT = this.ROOM_OUT;
    const HALF = Math.PI / 2;
    const z = -R.sill;

    // side: 0 = -x, 1 = +x, 2 = -y, 3 = +y. `nrm` looks INTO the room.
    const runs = [
      { x0: b.minX - OUT, y0: b.minY - OUT, x1: b.minX - OUT, y1: b.maxY + OUT, n: 0 },
      { x0: b.maxX + OUT, y0: b.maxY + OUT, x1: b.maxX + OUT, y1: b.minY - OUT, n: Math.PI },
      { x0: b.maxX + OUT, y0: b.minY - OUT, x1: b.minX - OUT, y1: b.minY - OUT, n: HALF },
      { x0: b.minX - OUT, y0: b.maxY + OUT, x1: b.maxX + OUT, y1: b.maxY + OUT, n: -HALF },
    ];
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k];
      this.roomBoard(ctx, r.x0, r.y0, r.x1, r.y1,
                     z + R.skirtH, z + R.wallH, r.n, R.wall, -0.06);
      this.roomBoard(ctx, r.x0, r.y0, r.x1, r.y1,
                     z, z + R.skirtH, r.n, R.skirt, -0.14);
    }

    if (!R.pit) return;

    /* THE PIT FRAME. Corners overlap by the frame's own width so the four runs
       meet as a mitre rather than leaving a notch of lawn at each corner. */
    const W = 96, TOP = 30;
    const sides = [
      { x0: b.minX, y0: b.minY - W, x1: b.minX, y1: b.maxY + W, n: 0,  ox: -W, oy: 0 },
      { x0: b.maxX, y0: b.maxY + W, x1: b.maxX, y1: b.minY - W, n: Math.PI, ox: W, oy: 0 },
      { x0: b.maxX + W, y0: b.minY, x1: b.minX - W, y1: b.minY, n: HALF, ox: 0, oy: -W },
      { x0: b.minX - W, y0: b.maxY, x1: b.maxX + W, y1: b.maxY, n: -HALF, ox: 0, oy: W },
    ];
    const Pj = BR.Projection;
    for (let k = 0; k < sides.length; k++) {
      const s = sides[k];
      // The inside of the board, from the sand it holds up to its top edge.
      this.roomBoard(ctx, s.x0, s.y0, s.x1, s.y1, 0, TOP, s.n, R.wall, -0.20);
      // The outside, dropping to the lawn — only ever seen from behind.
      this.roomBoard(ctx, s.x0 + s.ox, s.y0 + s.oy, s.x1 + s.ox, s.y1 + s.oy,
                     -R.sill, TOP, s.n + Math.PI, R.wall, -0.12);
      // The top edge, which is the piece that reads as a plank on its side.
      if (!this.onScreen((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, TOP)) continue;
      const q = [Pj.project(s.x0, s.y0, TOP), Pj.project(s.x1, s.y1, TOP),
                 Pj.project(s.x1 + s.ox, s.y1 + s.oy, TOP),
                 Pj.project(s.x0 + s.ox, s.y0 + s.oy, TOP)];
      ctx.beginPath();
      ctx.moveTo(q[0].sx, q[0].sy);
      for (let m = 1; m < 4; m++) ctx.lineTo(q[m].sx, q[m].sy);
      ctx.closePath();
      ctx.fillStyle = this.shade(R.skirt, 0.04);
      ctx.fill();
    }
  },

  /* Furniture and dropped toys, placed against the bounds. Each one is an
     axis-aligned box or an upright cylinder with a cast shadow — the same
     sweep `drawProp` uses, for the same reason: a shadow parked under a thing
     says nothing about how tall it is. */
  drawRoomProps(ctx, arena, R) {
    const list = this.ROOM_PROPS[arena.world];
    if (!list) return;
    const b = arena.bounds;
    const OUT = this.ROOM_OUT;
    const z = -R.sill;

    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      let cx, cy, hx, hy;
      if (d.side < 2) {
        cx = d.side === 0 ? b.minX - d.out * OUT : b.maxX + d.out * OUT;
        cy = b.minY + d.along * (b.maxY - b.minY);
        hx = (d.d || 0) / 2; hy = (d.w || 0) / 2;      // long axis runs in y
      } else {
        cy = d.side === 2 ? b.minY - d.out * OUT : b.maxY + d.out * OUT;
        cx = b.minX + d.along * (b.maxX - b.minX);
        hx = (d.w || 0) / 2; hy = (d.d || 0) / 2;
      }
      if (d.kind === 'leg') { hx = d.r; hy = d.r; }
      /* Both ends and the top, not just the centre. A run of kitchen units is
         2,600 units long and the centre point is off screen for most of the
         stretch where one end of it is in plain view — the same mistake the
         wall cull made before it started sampling. */
      if (!this.onScreen(cx, cy, z) && !this.onScreen(cx, cy, z + d.h) &&
          !this.onScreen(cx - hx, cy - hy, z + d.h) &&
          !this.onScreen(cx + hx, cy + hy, z + d.h)) continue;
      this.roomSolid(ctx, cx, cy, hx, hy, z, z + d.h, d.colour, d.kind === 'leg');
    }
  },

  /**
   * One box or upright cylinder standing on the room floor.
   *
   * Two visible faces at most and usually two, because an axis-aligned box has
   * exactly two faces turned toward any camera. Same backface test as
   * `roomBoard`, same light.
   */
  roomSolid(ctx, cx, cy, hx, hy, z0, z1, colour, round) {
    const Pj = BR.Projection;
    const HALF = Math.PI / 2;

    // Shadow first: the sweep of the footprint from where it stands to where
    // the light throws it, hulled so the two ends do not double-darken.
    const off = Pj.lightOffset(z1 - z0);
    const base = [];
    const N = round ? 10 : 4;
    for (let i = 0; i < N; i++) {
      const a = round ? (i / N) * Math.PI * 2 : Math.PI / 4 + (i / 4) * Math.PI * 2;
      const bx = cx + Math.cos(a) * hx * (round ? 1 : Math.SQRT2);
      const by = cy + Math.sin(a) * hy * (round ? 1 : Math.SQRT2);
      base.push([bx, by]);
      base.push([bx + off.dx, by + off.dy]);
    }
    const hull = this.hull2d(base);
    ctx.beginPath();
    for (let i = 0; i < hull.length; i++) {
      const p = Pj.project(hull[i][0], hull[i][1], z0);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(20,14,12,0.26)';
    ctx.fill();

    const quad = function (ax, ay, bx, by, fill) {
      const p = [Pj.project(ax, ay, z0), Pj.project(bx, by, z0),
                 Pj.project(bx, by, z1), Pj.project(ax, ay, z1)];
      ctx.beginPath();
      ctx.moveTo(p[0].sx, p[0].sy);
      for (let k = 1; k < 4; k++) ctx.lineTo(p[k].sx, p[k].sy);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const faces = [
      [0,        cx + hx, cy - hy, cx + hx, cy + hy],
      [Math.PI,  cx - hx, cy + hy, cx - hx, cy - hy],
      [HALF,     cx + hx, cy + hy, cx - hx, cy + hy],
      [-HALF,    cx - hx, cy - hy, cx + hx, cy - hy],
    ];
    for (let i = 0; i < 4; i++) {
      const f = faces[i];
      if (Math.cos(f[0]) * Pj._sin + Math.sin(f[0]) * Pj._cos <= 0) continue;
      quad(f[1], f[2], f[3], f[4],
           this.shade(colour, -0.24 + Pj.faceLight(f[0]) * 0.20));
    }

    // The lid, in the light. Round things get an ellipse instead of a square,
    // which is the whole of the difference between a bed leg and a shoebox at
    // groundTilt 0.30 — the top face is most of what a player sees.
    ctx.beginPath();
    if (round) {
      const c = Pj.project(cx, cy, z1);
      ctx.ellipse(c.sx, c.sy, hx, hy * Pj.groundTilt, 0, 0, Math.PI * 2);
    } else {
      const c = [Pj.project(cx - hx, cy - hy, z1), Pj.project(cx + hx, cy - hy, z1),
                 Pj.project(cx + hx, cy + hy, z1), Pj.project(cx - hx, cy + hy, z1)];
      ctx.moveTo(c[0].sx, c[0].sy);
      for (let k = 1; k < 4; k++) ctx.lineTo(c[k].sx, c[k].sy);
      ctx.closePath();
    }
    ctx.fillStyle = this.shade(colour, 0.08);
    ctx.fill();
  },

  /**
   * groundPattern, for a plane that is not the play surface's.
   *
   * The same matrix, with the plane's own height folded into the translation.
   * The play surface's textures keep going through `groundPattern` untouched;
   * this exists because the floor under a sandpit is 84 units BELOW the sand,
   * and a pattern built for z = 0 slides 71 pixels out of register with the
   * quad it is filling (heightScale, the same exchange rate as everywhere).
   */
  roomPattern(ctx, tile, z) {
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
      t * (sn * ox + cs * oy) + ((Pj.camZ || 0) - z) * Pj.heightScale,
    ]));
    return pat;
  },

  /**
   * The material the room floor is made of. Built once and cached, like every
   * other tile here.
   *
   * TRANSLUCENT MARKS ONLY, no opaque colour except in the grass. The base is
   * a flat fill underneath — sometimes authored, sometimes derived from the
   * track's own `groundColour` so the seam at the bounds cannot be seen — and
   * a tile that painted its own base would put a visible rectangle around
   * every arena on the two worlds where the floor is meant to continue.
   *
   * Tiles are 512, four times the weave's 128. A floorboard is a big object
   * and the room is at the top of the frame where the period would be most
   * obvious, so the boards are wide and the joints are staggered across two
   * rows — a butt joint repeating every 512 would rule a ladder across the
   * whole floor, which is the failure the rug print already had to solve.
   */
  roomTile(arena, R) {
    const key = 'room:' + R.tile;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');

    // Seeded, as every tile in this file is: a floor that differed between two
    // renders would break every pixel check, and Math.random is the AI's.
    let seed = 20918;
    const rnd = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    if (R.tile === 'boards') {
      const BW = 128;                                   // board width
      for (let r = 0; r < S / BW; r++) {
        const y = r * BW;
        // The joint between boards: a dark gap with the lit arris just below
        // it, which is what actually reads as "these are separate planks".
        g.fillStyle = 'rgba(0,0,0,0.30)';
        g.fillRect(0, y, S, 3);
        g.fillStyle = 'rgba(255,238,206,0.055)';
        g.fillRect(0, y + 3, S, 2);
        // Butt joints, offset per row so they never line up into a ladder.
        const at = ((r * 197) % S);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(at, y + 4, 2.5, BW - 5);
        // Grain: long shallow streaks along the board, never across it.
        for (let i = 0; i < 7; i++) {
          const gy = y + 10 + rnd() * (BW - 20);
          const x0 = rnd() * S, len = 90 + rnd() * 200;
          g.strokeStyle = rnd() > 0.45 ? 'rgba(46,30,16,0.10)'
                                       : 'rgba(255,230,190,0.045)';
          g.lineWidth = 1 + rnd() * 2.4;
          g.beginPath();
          g.moveTo(x0, gy);
          g.quadraticCurveTo(x0 + len / 2, gy + (rnd() - 0.5) * 5, x0 + len, gy);
          g.stroke();
        }
      }

    } else if (R.tile === 'flags') {
      // Kitchen floor tiles: one 256 flag in each quarter, with grout between
      // and each flag a slightly different value so the grid is a floor rather
      // than graph paper.
      const F = 256;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const v = (rnd() - 0.5) * 0.05;
          g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v.toFixed(3) + ')'
                              : 'rgba(0,0,0,' + (-v).toFixed(3) + ')';
          g.fillRect(c * F, r * F, F, F);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(0, 0, S, 5); g.fillRect(0, F, S, 5);
      g.fillRect(0, 0, 5, S); g.fillRect(F, 0, 5, S);

    } else {
      /* Grass. Mottle and tufts, and NOT ONE STRAIGHT LINE — a lawn has no
         period at all, so anything ruled here would be the only thing in the
         room the eye could lock onto. */
      for (let i = 0; i < 26; i++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(126,150,84,0.16)'
                                  : 'rgba(38,58,30,0.16)';
        g.beginPath();
        g.ellipse(rnd() * S, rnd() * S, 40 + rnd() * 70, 26 + rnd() * 50,
                  rnd() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      g.lineCap = 'round';
      for (let i = 0; i < 150; i++) {
        const x = rnd() * S, y = rnd() * S, a = -1.2 - rnd() * 0.9, L = 7 + rnd() * 9;
        g.strokeStyle = rnd() > 0.4 ? 'rgba(30,50,26,0.30)'
                                    : 'rgba(150,176,104,0.24)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
        g.stroke();
      }
    }

    this._tiles[key] = cv;
    return cv;
  },

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
    } else if (arena.sandy) {
      /* Damp, at a period long enough to be geography rather than texture.
         A sandpit is not uniformly dry and the difference is the first thing
         anyone sees in one. */
      out.push(this.dampTile(arena));
    }
    out.push(this.groundTile(arena));
    this._tiles[key] = out;
    return out;
  },

  /* ── ONE LAMP, BAKED INTO THE TILES ──────────────────────────────────────
     `groundPattern` hands a tile straight to the ground plane's affine
     transform, and that transform maps tile space onto WORLD space one for
     one: tile x IS world x. So a highlight drawn toward a fixed direction in a
     tile is lit from that direction in the room for ever, however the camera
     turns — which is exactly what BR.Projection.light is, a source fixed to
     the room rather than to the screen.

     Every material below therefore lights its bumps with these two vectors and
     nothing else, so the pile of the rug, the pits in the sand, the chamfer on
     a floorboard and the bevel on a kitchen tile all agree about where the
     window is. Baked at build time: the light does not move during a race. */
  tileLight() {
    const L = BR.Projection.light;
    return {
      hx: -Math.cos(L.dir), hy: -Math.sin(L.dir),   // toward the light
      sx:  Math.cos(L.dir), sy:  Math.sin(L.dir),   // the way a shadow falls
    };
  },

  /* Deterministic pseudo-randomness for tile building. Math.random is the
     AI's — a tile that consumed it would desync every ghost, and a tile that
     differed between two renders would break every pixel check in the
     project. */
  tileRnd(seed) {
    let s = seed | 0;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  },

  /* Restate a colour at a different alpha.

     `weaveColour` is authored per track and carries the HUE of that floor's
     own shadow — Tide Pool's is cool and grey where Dune Dash's is warm — and
     that is worth keeping. Its ALPHA was chosen for a texture that was barely
     there, and "you cannot tell what anything is made of" is the complaint
     this pass exists to answer, so the tiles restate it rather than obey it. */
  ink(col, a) {
    const m = /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/.exec(col || '');
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')';
    const h = /^#([0-9a-f]{6})$/i.exec(col || '');
    if (h) {
      const n = parseInt(h[1], 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) +
             ',' + a + ')';
    }
    return 'rgba(0,0,0,' + a + ')';
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

    const S = layer === 'field' ? 1024 : 960;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const LT = this.tileLight();

    // Seeded, for the reasons groundTile is: a floor that differed between two
    // renders would break every pixel check, and Math.random is the AI's.
    const rnd = this.tileRnd(layer === 'field' ? 90210 : 4471);

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
      /* WOOL, not grass. Before anything is printed, the whole tile takes a
         flat warm wash. The rug's authored green is a bright, saturated
         outdoor green, and outdoor green plus soft shapes is the entire reason
         the floor read as a fairway; a rug is dyed yarn and dyed yarn is
         duller and warmer than a lawn. Measured on the base colour it moves
         (92,138,74) to about (105,134,80) — a sixth of the chroma out and a
         little warmth in, which is a change of MATERIAL rather than of hue,
         and small enough that 05_Tracks.md's value gap does not notice.

         It belongs here rather than in the track data because it is a
         rendering decision about what the surface is made of, and because the
         floor colour is also the mini-map's and the haze's. */
      g.fillStyle = 'rgba(150,120,100,0.22)';
      g.fillRect(0, 0, S, S);

      /* The landscape the town is printed on. Soft-edged, because a straight
         edge that repeats is a grid line, and because the only hard geometry
         on a play rug is the man-made part — which is the other layer's job. */
      blob(300, 300, 210, 150, 'rgba(150,186,104,0.22)');        // playing field
      blob(268, 268, 120, 84, 'rgba(160,194,110,0.14)');
      blob(770, 700, 160, 108, 'rgba(112,160,86,0.26)');         // parkland
      blob(268, 754, 118, 70, 'rgba(78,140,186,0.42)');          // the pond
      blob(250, 742, 74, 42, 'rgba(150,196,220,0.26)');          // shallow end
      wrap(function () {                                         // printed rim
        g.strokeStyle = 'rgba(38,32,26,0.26)';
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(268, 754, 118, 70, 0, 0, Math.PI * 2);
        g.stroke();
        // Ripples, printed as three flat arcs. A pond on a rug is a blue shape
        // with lines on it; a pond without them is a puddle of ink.
        g.strokeStyle = 'rgba(236,248,255,0.20)';
        g.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.ellipse(268, 736 + i * 18, 62 - i * 12, 9, 0, 0.15, Math.PI - 0.15);
          g.stroke();
        }
      });

      /* THE PITCH, and it is the most important thing in this layer.

         The rug read as a golf course, and the reason is that everything
         printed on it was organic: soft green blobs, soft tan blobs, a soft
         pond. Nothing said a PERSON had drawn it. A five-a-side pitch is the
         cheapest possible fix — a rounded rectangle with a painted line round
         it, a halfway line and a centre circle is unmistakably a printed
         diagram of somewhere, and it costs six strokes. */
      wrap(function () {
        g.save();
        g.translate(300, 300);
        g.strokeStyle = 'rgba(244,250,238,0.22)';
        g.lineWidth = 4;
        g.strokeRect(-150, -96, 300, 192);
        g.beginPath(); g.moveTo(0, -96); g.lineTo(0, 96); g.stroke();
        g.beginPath(); g.ellipse(0, 0, 44, 30, 0, 0, Math.PI * 2); g.stroke();
        g.strokeRect(-150, -46, 34, 92);
        g.strokeRect(116, -46, 34, 92);
        g.restore();
      });

      // A hedge, as a short arc of separate bushes rather than a boundary
      // line — a line that reaches the tile edge tiles into a fence.
      for (let i = 0; i < 8; i++) {
        blob(190 + i * 30, 452 + Math.sin(i * 0.7) * 12, 17, 10,
             'rgba(46,88,52,0.28)');
      }
      // Trees in the park, each with a printed shadow on the shadow side and a
      // lit crown — the same lamp as the pile under them.
      for (let i = 0; i < 7; i++) {
        const tx = 650 + rnd() * 220, ty = 600 + rnd() * 180;
        const tr = 20 + rnd() * 9;
        blob(tx + LT.sx * 9, ty + LT.sy * 9, tr, tr * 0.62,
             'rgba(28,52,32,0.20)');
        blob(tx, ty, tr, tr * 0.62, 'rgba(52,100,58,0.30)');
        blob(tx + LT.hx * 5, ty + LT.hy * 5, tr * 0.6, tr * 0.38,
             'rgba(126,176,96,0.22)');
      }
      /* Worn smooth by years of play. 06_World_Town_Rug.md is explicit that
         pristine reads as a product shot. Big and faint, so they read as the
         pile being crushed rather than as a stain. */
      for (let i = 0; i < 4; i++) {
        blob(rnd() * S, rnd() * S, 130 + rnd() * 90, 80 + rnd() * 54,
             'rgba(255,246,224,0.05)');
      }
    } else {
      /* ── THE TOWN, which is the layer that has to say RUG ─────────────────
         06_World_Town_Rug.md: "printed with roads, buildings, parking spaces,
         railways, rivers, houses, schools and fire stations. THESE PRINTED
         ELEMENTS ARE THE TRACK NETWORK." The old version of this layer had
         four pale house plots and one lane that stopped in mid air, and the
         result was a park with some patches in it.

         What was missing is the ROADS. A town rug is read by its road network
         before anything else — it is the one motif nobody mistakes for
         landscape — and the reason there was not one is the tiling rule:
         anything that reaches a tile edge meets its own copy and rules a
         lattice across the entire floor. A road that stops in mid air looks
         wrong, so the answer is a road that never needed an edge: a CLOSED
         LOOP, complete inside its own tile, with a spur to a car park that
         ends somewhere on purpose.

         It sits at 960 units against the field layer's 1024, so the two share
         no period shorter than 15,360 — sixteen frame widths — and the single
         grid a lone tile would rule never forms.

         READABILITY. 05_Tracks.md requires the racing road to be unmistakable.
         A printed lane is 46 units wide against the real road's 320 — a
         SEVENTH of it, under three car widths — and it is a pale grey against
         the road's near-black, so the two can never be confused: one is a
         narrow lighter stripe with a printed dash down it, the other is twenty
         car widths of the darkest value on screen with a lit kerb down each
         side. */
      const road = function (fn, width, col) {
        wrap(function () {
          g.lineJoin = 'round'; g.lineCap = 'round';
          g.strokeStyle = 'rgba(46,40,32,0.20)';
          g.lineWidth = width + 7;
          fn(); g.stroke();
          g.strokeStyle = col;
          g.lineWidth = width;
          fn(); g.stroke();
        });
      };
      const loop = function () {
        g.beginPath();
        if (g.roundRect) { g.roundRect(200, 210, 560, 470, 150); g.closePath(); }
        else g.rect(200, 210, 560, 470);
      };
      const spur = function () {
        g.beginPath();
        g.moveTo(480, 680); g.quadraticCurveTo(470, 790, 372, 828);
      };
      road(loop, 46, 'rgba(146,142,134,0.62)');
      road(spur, 40, 'rgba(146,142,134,0.56)');

      /* Worn white markings, down the middle of the loop. `setLineDash` is
         banned for the KERBS because a ten-thousand-unit outline dashed at six
         units asks the rasteriser for two thousand pieces every frame — none
         of which applies here, where the path is 2,000 units long and stroked
         exactly once, at build time. */
      wrap(function () {
        g.setLineDash([20, 26]);
        g.strokeStyle = 'rgba(250,246,230,0.26)';
        g.lineWidth = 3.5;
        loop(); g.stroke();
        g.setLineDash([]);
      });

      // A crossing, where the lane meets the top of the loop.
      wrap(function () {
        g.strokeStyle = 'rgba(250,246,230,0.30)';
        g.lineWidth = 7;
        for (let i = 0; i < 5; i++) {
          const x = 372 + i * 15;
          g.beginPath(); g.moveTo(x, 187); g.lineTo(x, 233); g.stroke();
        }
      });

      /* The car park, which is on the list in 06 and is the one printed motif
         that survives the 30% vertical squash from any angle: bays are a comb,
         and a comb is legible edge-on. */
      patch(300, 792, 168, 96, 6, 'rgba(120,116,110,0.40)');
      wrap(function () {
        g.strokeStyle = 'rgba(250,246,230,0.24)';
        g.lineWidth = 3;
        for (let i = 1; i < 6; i++) {
          const x = 300 + i * 28;
          g.beginPath(); g.moveTo(x, 796); g.lineTo(x, 884); g.stroke();
        }
        g.strokeStyle = 'rgba(46,40,32,0.20)';
        g.lineWidth = 3;
        g.beginPath();
        if (g.roundRect) g.roundRect(300, 792, 168, 96, 6);
        else g.rect(300, 792, 168, 96);
        g.stroke();
      });

      /* Printed line art, not a colour blotch. The dark outline is the same
         trick that made the cars read as moulded toys rather than coloured
         regions, and it does the same job here: without it a house at this
         alpha is a pale smudge, and with it the eye reads a drawn shape. */
      const house = function (x, y, w, h, roof) {
        patch(x, y, w, h, 5, 'rgba(236,226,202,0.34)');
        patch(x, y, w, h * 0.52, 4, roof);
        wrap(function () {
          g.strokeStyle = 'rgba(38,32,26,0.34)';
          g.lineWidth = 3.5;
          g.beginPath();
          if (g.roundRect) g.roundRect(x, y, w, h, 5); else g.rect(x, y, w, h);
          g.stroke();
          g.beginPath();
          g.moveTo(x, y + h * 0.52); g.lineTo(x + w, y + h * 0.52);
          g.stroke();
          // A door and two windows on the wall face. Three marks, and they are
          // what turns a rectangle with a roof into a house.
          g.fillStyle = 'rgba(38,32,26,0.24)';
          g.fillRect(x + w * 0.44, y + h * 0.66, w * 0.14, h * 0.34);
          g.fillRect(x + w * 0.16, y + h * 0.66, w * 0.13, h * 0.18);
          g.fillRect(x + w * 0.71, y + h * 0.66, w * 0.13, h * 0.18);
        });
      };
      // Along the lane, facing it — which is the other half of why a printed
      // town reads as a town: the houses have a road to be on.
      house(232, 100, 104, 76, 'rgba(178,92,72,0.34)');
      house(392, 92,  92, 70,  'rgba(96,110,150,0.32)');
      house(560, 108, 98, 72,  'rgba(178,140,72,0.32)');
      house(806, 350, 96, 74,  'rgba(120,92,142,0.30)');
      house(64,  392, 96, 74,  'rgba(88,132,102,0.30)');
      house(300, 704, 88, 66,  'rgba(178,92,72,0.28)');

      // Gardens: printed flowerbeds, on the plots and nowhere else.
      for (let i = 0; i < 14; i++) {
        blob(120 + rnd() * 640, 190 + rnd() * 460, 5 + rnd() * 4, 3 + rnd() * 3,
             rnd() > 0.5 ? 'rgba(216,110,96,0.24)' : 'rgba(232,196,96,0.24)');
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
  roadTile(arena) {
    const key = 'road:' + arena.id;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    let cv;
    if (arena.world === 'stunt') {
      cv = this.plasticTile();
    } else if (arena.sandy) {
      cv = this.packedSandTile(arena);
    } else if (arena.world === 'kitchen') {
      cv = this.laminateTile();
    } else {
      /* Rug: the SAME pile as the floor, so the print sits ON the weave rather
         than beside it. Weaker, because ink hides some of the pile without
         flattening it — and the surface a car spends the whole race looking at
         is the one place a texture must not shout. */
      cv = this.pileTile('rgba(0,0,0,1)', 0.55);
    }

    this._tiles[key] = cv;
    return cv;
  },

  /* Moulded plastic: long seams along the track and a soft sheen. Injection
     moulding leaves mould lines and nothing else — no grain, no weave. */
  plasticTile() {
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
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
    return cv;
  },

  /* Packed sand: the same grain as the loose stuff beside it, pressed flat.
     Finer, denser, and with the pits filled in — which is exactly what
     driving over it does, and is why it is the same tile with the relief
     turned off rather than a different texture. */
  packedSandTile(arena) {
    const S = 192;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(7717);
    const weave = arena.weaveColour || 'rgba(96,72,44,0.13)';
    for (let i = 0; i < 2200; i++) {
      const t = rnd();
      g.fillStyle = t > 0.5 ? 'rgba(255,248,228,0.06)' : this.ink(weave, 0.10);
      g.fillRect(rnd() * S, rnd() * S, 1.2, 1.2);
    }
    // Tyre-swept streaks, along the road rather than across it.
    g.strokeStyle = this.ink(weave, 0.06);
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const y = rnd() * S, x0 = rnd() * S, len = 40 + rnd() * 80;
      g.beginPath();
      g.moveTo(x0, y);
      g.quadraticCurveTo(x0 + len / 2, y + (rnd() - 0.5) * 4, x0 + len, y);
      g.stroke();
    }
    return cv;
  },

  /* ── LAMINATE ────────────────────────────────────────────────────────────
     The table top, which was being drawn with CARPET PILE on it — the kitchen
     fell through to the rug branch, so the one surface in the game whose whole
     character is "wipe-clean" had a weave.

     Laminate is a printed photograph of wood under a sheet of plastic, and the
     giveaway is that the two are different materials: the grain is soft and
     warm and wanders, and the sheen over it is hard, straight and cool. Both
     are here, and the sheen is aligned to the room's light like everything
     else on the floor. */
  laminateTile() {
    const S = 192;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(3529);
    const L = this.tileLight();

    // The printed grain: long, warm, and never quite parallel.
    for (let i = 0; i < 46; i++) {
      const y = rnd() * S;
      g.strokeStyle = 'rgba(150,112,64,' + (0.05 + rnd() * 0.08).toFixed(3) + ')';
      g.lineWidth = 0.8 + rnd() * 2.2;
      g.beginPath();
      g.moveTo(-6, y);
      g.bezierCurveTo(S * 0.3, y + (rnd() - 0.5) * 7,
                      S * 0.7, y + (rnd() - 0.5) * 7, S + 6, y);
      g.stroke();
    }
    // Board joints every 64 units, dark with a pale shoulder — a laminate
    // board is printed, but the join between two of them is real.
    for (let k = 0; k < 3; k++) {
      const y = 32 + k * 64;
      g.strokeStyle = 'rgba(126,92,52,0.20)';
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      g.strokeStyle = 'rgba(255,252,242,0.10)';
      g.lineWidth = 1.4;
      const lit = y + (L.hy < 0 ? -2 : 2);
      g.beginPath(); g.moveTo(0, lit); g.lineTo(S, lit); g.stroke();
    }
    // The plastic over the top: a hard, flat sheen, and the fine scratches a
    // hundred wipes with a cloth leave in it.
    g.fillStyle = 'rgba(255,253,246,0.05)';
    g.fillRect(0, 18, S, 26);
    g.fillRect(0, 120, S, 16);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 26; i++) {
      const y = rnd() * S, x0 = rnd() * S, len = 20 + rnd() * 60;
      g.beginPath();
      g.moveTo(x0, y); g.lineTo(x0 + len, y + (rnd() - 0.5) * 2);
      g.stroke();
    }
    return cv;
  },

  /* One tile per world, built once and cached.

     WHAT THE FLOOR IS MADE OF, which is the whole job. Four worlds fell through
     to one rug weave before this: the sandpit had it in brown, the bedroom
     floor under the stunt track had it in near-black, and the KITCHEN FLOOR had
     carpet pile printed on its tiles. A floor you cannot name is the failure
     mode the brief calls out, so each world now builds its own material and the
     shared code is the lighting, not the texture. */
  groundTile(arena) {
    const key = 'ground:' + arena.id;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    let cv;
    if (arena.sandy)                    cv = this.sandTile(arena.weaveColour);
    else if (arena.world === 'stunt')   cv = this.woodTile(0.36, 4801);
    else if (arena.world === 'kitchen') cv = this.kitchenFloorTile(arena);
    else                                cv = this.pileTile(arena.weaveColour, 1);

    this._tiles[key] = cv;
    return cv;
  },

  /* ── THE PILE ────────────────────────────────────────────────────────────
     The rug's material, and the single thing that decides whether the floor is
     a rug or a lawn. It was one set of faint dashes at 5% black, which at this
     camera is a suggestion of texture rather than a texture — and a green field
     with a suggestion of texture on it is a golf course.

     A tuft is drawn THREE times: a dark root offset the way the light throws
     shadows, the gap between (the base colour, showing through), and a pale
     crest offset toward the light. That is what makes it read as loops
     standing up off a backing rather than as hatching printed on a floor, and
     it is why the mean brightness barely moves while the local contrast
     triples — the crest gives back what the root takes.

     16 units a tuft is deliberate and it is not the size of real carpet. A car
     is 28 units long, so a tuft is over half a car: these are the OVERSIZED
     RUG FIBRES on 12_Art_Guide.md's list of scale cues, and they are how a
     frame says "these are toys" without a crayon in shot.

     `strength` scales the whole thing: 1 on the rug, less under the printed
     road, where ink hides some of the pile without flattening it. */
  pileTile(weave, strength) {
    const key = 'pile:' + weave + ':' + strength;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = 128, P = 16;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(1337);
    const L = this.tileLight();
    const k = strength === undefined ? 1 : strength;

    /* The backing, and the reason the rug reads as woven rather than as felt:
       a coarse rib every four rows, running across the pile. */
    g.strokeStyle = this.ink(weave, 0.07 * k);
    g.lineWidth = 5;
    for (let y = P * 2; y < S; y += P * 4) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
    }

    /* MEASURED, and then doubled. The first pass at this put the root at 0.17
       and the crest at 0.115 and moved the rug's standard deviation from 6.8 to
       10.1 — a real texture, and still not one you notice at racing zoom
       without going looking for it. These values are what "you can tell it is
       fabric" costs. The mean is the number that must not move, and it does
       not: the crest gives back what the root takes. */
    const root  = this.ink(weave, 0.30 * k);
    const crest = 'rgba(255,250,230,' + (0.22 * k).toFixed(3) + ')';
    g.lineCap = 'round';

    for (let row = 0; row * P < S; row++) {
      const y = row * P + 4;
      const off = (row % 2) * (P / 2);
      for (let col = -1; col * P < S + P; col++) {
        const x = col * P + off + 2;
        const j  = (rnd() - 0.5) * 2.6;
        const dy = (rnd() - 0.5) * 1.8;
        const len = P * 0.46;
        // Root first, so the crest sits on top of its own shadow.
        g.strokeStyle = root;  g.lineWidth = 4.8;
        g.beginPath();
        g.moveTo(x + L.sx * 1.9, y + j + L.sy * 1.9);
        g.lineTo(x + len + L.sx * 1.9, y + j + dy + L.sy * 1.9);
        g.stroke();
        g.strokeStyle = crest; g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(x + L.hx * 1.5, y + j + L.hy * 1.5);
        g.lineTo(x + len + L.hx * 1.5, y + j + dy + L.hy * 1.5);
        g.stroke();
      }
    }

    // The weft: the thread the tufts are knotted through, running the other
    // way. Faint and slightly off vertical, so the weave has two directions
    // and never reads as ruled lines.
    g.strokeStyle = 'rgba(255,252,240,' + (0.07 * k).toFixed(3) + ')';
    g.lineWidth = 1.8;
    for (let col = 0; col * 22 < S; col++) {
      const x = col * 22 + 9;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, S); g.stroke();
    }
    this._tiles[key] = cv;
    return cv;
  },

  /* ── SAND ────────────────────────────────────────────────────────────────
     Grain, and it has to be actual grain: the sandpit was the rug's tuft
     geometry in brown, which is a woven sandpit.

     256 units rather than 128. Noise is the one texture whose PERIOD is
     visible even when its content is not — a 128 tile of flecks repeats every
     147px across the frame and the eye finds the lattice in it, the same
     failure the print layers had at 448. At 256 the repeat is 294px and there
     is nothing in it to lock onto.

     Three scales, because that is what sand has: the grains themselves, the
     pits and shoulders between them (a dark crescent on the shadow side and a
     bright one toward the light, which is the only reason a flat fleck field
     reads as depth), and long broken ripples under everything where the wind
     or a hand has dragged it. Plus a few specks of mica — sand sparkles, and
     twenty bright pixels in a tile is the cheapest way there is to say so. */
  sandTile(weave) {
    const key = 'sand:' + weave;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(2711);
    const L = this.tileLight();

    // Drift: long, shallow, never closed, so it reads as wind rather than rows.
    g.strokeStyle = this.ink(weave, 0.10);
    g.lineWidth = 3.2;
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const y = rnd() * S, x0 = rnd() * S, len = 40 + rnd() * 90;
      g.beginPath();
      g.moveTo(x0, y);
      g.quadraticCurveTo(x0 + len / 2, y + (rnd() - 0.5) * 9, x0 + len, y);
      g.stroke();
    }

    // Pits: a shaded shoulder and a lit one, half a unit apart. This is the
    // whole difference between "sand" and "brown noise".
    for (let i = 0; i < 150; i++) {
      const x = rnd() * S, y = rnd() * S, r = 1.6 + rnd() * 2.6;
      g.fillStyle = this.ink(weave, 0.22);
      g.beginPath();
      g.ellipse(x + L.sx * r * 0.6, y + L.sy * r * 0.6, r, r * 0.7, 0, 0, 6.283);
      g.fill();
      g.fillStyle = 'rgba(255,250,232,0.19)';
      g.beginPath();
      g.ellipse(x + L.hx * r * 0.6, y + L.hy * r * 0.6, r * 0.8, r * 0.55,
                0, 0, 6.283);
      g.fill();
    }

    // The grains. Single pixels at 1 unit each: a grain is meant to be at the
    // limit of what the screen can hold, and anything bigger is gravel.
    for (let i = 0; i < 2600; i++) {
      const t = rnd();
      g.fillStyle = t > 0.55 ? 'rgba(255,248,226,0.30)'
                  : t > 0.18 ? this.ink(weave, 0.30)
                             : 'rgba(150,116,66,0.24)';
      g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
    }

    // Mica. Sparse and bright — 20 in 65,000 square units.
    for (let i = 0; i < 20; i++) {
      g.fillStyle = 'rgba(255,255,246,0.62)';
      g.fillRect(rnd() * S, rnd() * S, 1.4, 1.4);
    }
    this._tiles[key] = cv;
    return cv;
  },

  /* Damp sand, at a period long enough to be geography rather than texture.

     The sandpit is not uniformly dry: it is damp where it has been dug and
     patted down, and those patches are darker and smoother. SandGrid.js draws
     the damp that the RACE makes, cell by cell, and this is the damp that was
     there before anybody drove — the two are deliberately the same colour
     family so a fresh patch of packed sand looks like more of what is already
     on the floor rather than like a decal.

     All ellipses, nothing within 90 units of a tile edge, for the reason the
     rug print layers give at length: a straight edge that repeats is a grid
     line and a motif that crosses a seam is a lattice. */
  dampTile(arena) {
    const key = 'damp:' + arena.id;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = 768;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(6553);
    const weave = arena.weaveColour || 'rgba(96,72,44,0.13)';

    for (let i = 0; i < 5; i++) {
      const x = 120 + rnd() * (S - 240), y = 120 + rnd() * (S - 240);
      const rx = 70 + rnd() * 110, ry = 45 + rnd() * 70;
      g.fillStyle = this.ink(weave, 0.16);
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.283); g.fill();
      // A slightly wetter core, so a patch has a shape rather than an edge.
      g.fillStyle = this.ink(weave, 0.12);
      g.beginPath();
      g.ellipse(x + rx * 0.1, y, rx * 0.6, ry * 0.58, 0, 0, 6.283);
      g.fill();
    }
    // Dry, wind-blown high spots: the same shapes the other way up.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(255,246,220,0.07)';
      g.beginPath();
      g.ellipse(140 + rnd() * (S - 280), 140 + rnd() * (S - 280),
                90 + rnd() * 110, 55 + rnd() * 60, 0, 0, 6.283);
      g.fill();
    }

    this._tiles[key] = cv;
    return cv;
  },

  /* ── WOOD ────────────────────────────────────────────────────────────────
     Boards, running along world x, with grain along them.

     The stunt world's floor is the bedroom floor seen from a track bolted to
     the dresser above it, and Bedside Boulevard's fast half is the same boards
     under the bed. It was flat near-black in one and invisible in the other.

     The tile carries HUE as well as texture, which is what lets one function
     serve a floor in deep shadow and a lit patch of hallway: the planks are
     laid down in warm brown at `tone` alpha over whatever base colour the
     track authored, so the stunt floor stays as dark as its own note asks
     ("in shadow under the track") and comes out warm and grained rather than
     black and blank.

     Six planks in 256 units — 43 units each, a car and a half wide — because
     at 30% vertical compression a realistically narrow board is a hairline. */
  woodTile(tone, seed) {
    const key = 'wood:' + tone + ':' + seed;
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];

    const S = 256, N = 6, PH = S / N;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(seed);
    const L = this.tileLight();

    for (let i = 0; i < N; i++) {
      const y = i * PH;
      // Every board out of the same tree and none of them the same.
      const warm = 0.82 + rnd() * 0.36;
      g.fillStyle = 'rgba(' + Math.round(118 * warm) + ',' +
                              Math.round(80 * warm) + ',' +
                              Math.round(46 * warm) + ',' + tone.toFixed(2) + ')';
      g.fillRect(0, y, S, PH);

      // Grain: long, nearly parallel, wandering. Drawn wrapped in x so it runs
      // off one side of the tile and back on at the other.
      g.strokeStyle = 'rgba(58,36,18,' + (0.10 * tone / 0.3).toFixed(3) + ')';
      for (let k = 0; k < 7; k++) {
        const gy = y + 3 + rnd() * (PH - 6);
        g.lineWidth = 0.8 + rnd() * 1.6;
        g.beginPath();
        g.moveTo(-8, gy);
        g.bezierCurveTo(S * 0.3, gy + (rnd() - 0.5) * 5,
                        S * 0.7, gy + (rnd() - 0.5) * 5, S + 8, gy);
        g.stroke();
      }

      /* The joint between boards, and the varnish on it. A dark gap with a lit
         chamfer on the side the light comes from is the entire read of "these
         are separate planks with a shine on them" — one line without the other
         is a ruled grid. */
      const lit = L.hy < 0 ? -1.6 : 1.6;
      g.strokeStyle = 'rgba(24,14,6,' + (0.55 * tone / 0.3).toFixed(3) + ')';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      g.strokeStyle = 'rgba(255,238,208,' + (0.10 * tone / 0.3).toFixed(3) + ')';
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(0, y + lit); g.lineTo(S, y + lit); g.stroke();

      // One end joint per board, staggered, so the floor is laid rather than
      // extruded.
      const ex = rnd() * S;
      g.strokeStyle = 'rgba(24,14,6,' + (0.40 * tone / 0.3).toFixed(3) + ')';
      g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(ex, y + 1); g.lineTo(ex, y + PH - 1); g.stroke();
    }

    this._tiles[key] = cv;
    return cv;
  },

  /* ── KITCHEN FLOOR ───────────────────────────────────────────────────────
     Four hundred units below the table, and the thing you look at all the way
     down. It was pile, in grey.

     Tiles of 150 units — a real 300mm floor tile at this game's scale, where a
     car is 28 units to a 60mm die-cast — with grout between them, a speckled
     glaze, and a bevel: dark on the shadow side of every tile, bright on the
     lit side. The bevel is doing the work. Grout lines alone draw a grid;
     grout plus a lit edge draws a floor made of separate slabs.

     The grout runs at 75 and 225 in a 300 tile rather than at 0 and 150, so
     nothing lands on a seam and the spacing across the seam is still exactly
     150. */
  kitchenFloorTile(arena) {
    const S = 300, T = 150;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(9091);
    const L = this.tileLight();
    const weave = arena.weaveColour || 'rgba(52,60,68,0.11)';

    /* Four slabs, no two fired quite alike. The slab that straddles the tile
       seam is drawn at all four wrap offsets, so its two halves get the SAME
       tone — one slab cut in half by the repeat, rather than two slabs that
       happen to touch. */
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const a = (rnd() - 0.5) * 0.05;
        g.fillStyle = a > 0 ? 'rgba(255,255,255,' + a.toFixed(3) + ')'
                            : 'rgba(0,0,0,' + (-a).toFixed(3) + ')';
        const x = i * T - 75, y = j * T - 75;
        for (let ox = 0; ox <= 1; ox++) {
          for (let oy = 0; oy <= 1; oy++) {
            g.fillRect(x + ox * S, y + oy * S, T, T);
          }
        }
      }
    }

    // Glaze speckle. Fine and two-tone, which is what stops a large flat tile
    // from being a swatch.
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.055)'
                                : 'rgba(20,26,32,0.05)';
      g.fillRect(rnd() * S, rnd() * S, 1.3, 1.3);
    }

    // Grout, and the bevel that makes it a joint rather than a line.
    const grout = this.ink(weave, 0.42);
    const lx = L.hx < 0 ? -2.4 : 2.4, ly = L.hy < 0 ? -2.4 : 2.4;
    for (let k = 0; k < 2; k++) {
      const p = 75 + k * T;
      g.strokeStyle = grout; g.lineWidth = 5;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
      g.strokeStyle = 'rgba(255,255,250,0.10)'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(p + lx, 0); g.lineTo(p + lx, S); g.stroke();
      g.beginPath(); g.moveTo(0, p + ly); g.lineTo(S, p + ly); g.stroke();
    }
    return cv;
  },

  /* ── ZONES: the patches of something else on the floor ────────────────────
     Every zone in the game was INVISIBLE.

     Bedside Boulevard's whole north side is hardwood — 12% more top speed on
     22% less grip — and nothing on screen said so. The kitchen's place mats,
     spilled sugar, crumbs and scattered post were the same: six surfaces, six
     changes to how the car behaves, and one uniform colour under all of them.
     `12_Art_Guide.md` is explicit that surface is a GAMEPLAY SIGNAL and not
     decoration, and a signal nobody can see is not one.

     Three rules hold the readability line:

       - Nothing here is opaque. A zone tints the floor it lies on; the road
         keeps its own value through every one of them, so the darkest thing on
         a rug is still the road and the brightest line is still the kerb.
       - Zones are drawn between the road fill and the KERBS, exactly where the
         packed sand goes, so no patch can ever cover the edge a driver reads.
       - THE RECTANGLE IS KEPT EXACTLY, however un-spill-like a rectangular
         spill of sugar is. `surfaceAt` tests `x <= p <= x + w`, so the
         rectangle is not a bounding box, it IS the surface change — and a
         prettier shape that disagreed with what it triggers is the same class
         of lie as a barrier drawn shorter than it collides. Boost pads keep
         their authored plate for the same reason. Decoration, which has no
         collision at all, is free to be the ellipse it looks like.

     They sit at the deck's own height, cached per zone the way a boost pad
     caches its direction: the kitchen's place mats are on a table 420 units
     up, and drawn at zero they were on the floor below it. */
  drawZones(ctx, arena) {
    const zones = arena.zones;
    if (!zones || !zones.length) return;
    const Pj = BR.Projection;

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (z.w === undefined || z.h === undefined) continue;
      const zz = this.zoneZ(arena, z);
      const p = [
        Pj.project(z.x, z.y, zz), Pj.project(z.x + z.w, z.y, zz),
        Pj.project(z.x + z.w, z.y + z.h, zz), Pj.project(z.x, z.y + z.h, zz),
      ];
      const path = function () {
        ctx.beginPath();
        ctx.moveTo(p[0].sx, p[0].sy);
        for (let k = 1; k < 4; k++) ctx.lineTo(p[k].sx, p[k].sy);
        ctx.closePath();
      };

      if (z.type === 'hardwood') {
        /* Bare boards where the rug stops. Warm, lit, and laid in the same
           direction as every other board in the game — it is one room. */
        path();
        ctx.fillStyle = 'rgba(146,104,60,0.62)';
        ctx.fill();
        const pat = this.groundPattern(ctx, this.woodTile(0.52, 3313));
        if (pat) { ctx.fillStyle = pat; ctx.fill(); }
        ctx.strokeStyle = 'rgba(38,26,14,0.35)';
        ctx.lineWidth = 3 / this.zoom;
        path(); ctx.stroke();

      } else if (z.type === 'blanket') {
        /* Cloth: a sock under the bed, a place mat on the table. Woven, so it
           gets the pile tile — the same material logic as the rug, at a
           different colour, which is the point of having one. */
        path();
        ctx.fillStyle = 'rgba(196,116,104,0.55)';
        ctx.fill();
        const pat = this.groundPattern(ctx, this.pileTile('rgba(60,20,16,1)', 1.1));
        if (pat) { ctx.fillStyle = pat; ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,236,224,0.30)';
        ctx.lineWidth = 2 / this.zoom;
        path(); ctx.stroke();

      } else if (z.type === 'puddle') {
        /* Water in the sandpit, spilled sugar on the table. Both are the same
           shape of thing — a wet, glossy patch — and both keep the surface
           under them visible, because you have to be able to see the road you
           are about to lose grip on. */
        const sugar = arena.world === 'kitchen';
        path();
        ctx.fillStyle = sugar ? 'rgba(255,252,242,0.50)'
                              : 'rgba(64,116,146,0.46)';
        ctx.fill();
        if (sugar) {
          const pat = this.groundPattern(ctx, this.sandTile('rgba(168,146,104,0.5)'));
          if (pat) { ctx.fillStyle = pat; ctx.fill(); }
        } else {
          // A sky reflection, offset toward the light like every other
          // highlight on the floor.
          const L = this.tileLight();
          const cx = (p[0].sx + p[2].sx) / 2, cy = (p[0].sy + p[2].sy) / 2;
          ctx.beginPath();
          ctx.ellipse(cx + L.hx * 14, cy + L.hy * 14 * Pj.groundTilt,
                      Math.abs(p[1].sx - p[0].sx) * 0.22,
                      Math.abs(p[2].sy - p[1].sy) * 0.22, 0, 0, 6.283);
          ctx.fillStyle = 'rgba(226,244,255,0.22)';
          ctx.fill();
        }
        ctx.strokeStyle = sugar ? 'rgba(214,200,168,0.35)'
                                : 'rgba(180,220,238,0.30)';
        ctx.lineWidth = 2 / this.zoom;
        path(); ctx.stroke();

      } else if (z.type === 'paper') {
        // The morning's post, face up on the table.
        path();
        ctx.fillStyle = 'rgba(248,246,238,0.72)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,112,96,0.35)';
        ctx.lineWidth = 2 / this.zoom;
        path(); ctx.stroke();
        // Printed lines, running along the sheet.
        ctx.strokeStyle = 'rgba(120,112,96,0.22)';
        ctx.lineWidth = 1.6 / this.zoom;
        ctx.beginPath();
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          const ax = p[0].sx + (p[3].sx - p[0].sx) * t;
          const ay = p[0].sy + (p[3].sy - p[0].sy) * t;
          const bx = p[1].sx + (p[2].sx - p[1].sx) * t;
          const by = p[1].sy + (p[2].sy - p[1].sy) * t;
          ctx.moveTo(ax + (bx - ax) * 0.12, ay + (by - ay) * 0.12);
          ctx.lineTo(ax + (bx - ax) * 0.88, ay + (by - ay) * 0.88);
        }
        ctx.stroke();

      } else if (z.type === 'rugGrass') {
        // Crumbs. Not a tint — a scatter, because that is what makes the
        // player believe somebody had breakfast here.
        path();
        ctx.fillStyle = 'rgba(206,176,124,0.22)';
        ctx.fill();
        const pat = this.groundPattern(ctx, this.crumbTile());
        if (pat) { ctx.fillStyle = pat; ctx.fill(); }
      }
    }
  },

  /* The deck a zone lies on. A zone is authored as a flat rectangle with no
     height, which is right — the simulation is flat — so the renderer asks the
     centreline where that part of the track is in the air, and caches the
     answer on the zone. Cached for the reason `padDir` caches a boost pad's
     heading: neither the zone nor the track moves. */
  zoneZ(arena, z) {
    if (z._z !== undefined) return z._z;
    let out = 0;
    if (arena.elevated) {
      const line = arena.centreline, elev = arena.elevation;
      const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
      let best = Infinity;
      for (let i = 0; i < line.length; i++) {
        const dx = line[i][0] - cx, dy = line[i][1] - cy;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; out = elev[i].z; }
      }
    }
    z._z = out;
    return out;
  },

  /* Crumbs: what is left on a table after breakfast, at a period long enough
     that the same crumb is never obviously in two places at once. */
  crumbTile() {
    const key = 'crumbs';
    this._tiles = this._tiles || {};
    if (this._tiles[key] !== undefined) return this._tiles[key];
    const S = 192;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const rnd = this.tileRnd(1201);
    const L = this.tileLight();
    for (let i = 0; i < 120; i++) {
      const x = rnd() * S, y = rnd() * S, r = 1.2 + rnd() * 2.4;
      g.fillStyle = 'rgba(58,40,20,0.30)';
      g.beginPath();
      g.ellipse(x + L.sx * 1.6, y + L.sy * 1.6, r, r * 0.75, rnd() * 3, 0, 6.283);
      g.fill();
      g.fillStyle = 'rgba(224,186,128,0.55)';
      g.beginPath();
      g.ellipse(x, y, r * 0.85, r * 0.6, rnd() * 3, 0, 6.283);
      g.fill();
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

    /* The elevated deck had NO surface texture at all. A flat road is filled
       twice through one path — colour, then the material — and none of that
       reached this branch, so the kitchen table, whose entire character is
       wiped laminate, was a cream rectangle, and both stunt decks were flat
       plastic colour.

       `over` is that second fill, through the SAME path: `fill` does not clear
       it, so a textured quad costs one more fill and no more geometry. It is
       one op per surface quad and nothing at all on the skirts, which are seen
       edge-on and would only alias. */
    const quad = function (a, b, c, d, over) {
      ctx.beginPath();
      const pa = Pj.project(a[0], a[1], a[2]); ctx.moveTo(pa.sx, pa.sy);
      const pb = Pj.project(b[0], b[1], b[2]); ctx.lineTo(pb.sx, pb.sy);
      const pc = Pj.project(c[0], c[1], c[2]); ctx.lineTo(pc.sx, pc.sy);
      const pd = Pj.project(d[0], d[1], d[2]); ctx.lineTo(pd.sx, pd.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();                       // seal the seam
      if (over) { ctx.fillStyle = over; ctx.fill(); }
    };
    const surface = this.groundPattern(ctx, this.roadTile(arena));

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
      quad(oi, oj, ij, ii, surface);
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

    /* The patches of something else: floorboards under the bed, place mats and
       spilled sugar on the table. HERE, between the road fill and the kerbs,
       for the same reason the packed sand goes here — a surface patch may
       change what the floor is made of and may never cover the edge a driver
       reads the track by. */
    this.drawZones(ctx, arena);

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
      /* ROUND, not square. The cells are a grid and the grid was drawn: packed
         sand came out as a chequerboard of hard-edged tiles following the car,
         which reads as a debug overlay rather than as sand somebody has driven
         flat. A round patch costs the same one path and one fill.

         1.3 RATHER THAN 1.0, which is the part that had to be rendered to be
         seen: the ellipse inscribed in a cell is the obvious choice and it
         came out as POLKA DOTS. Inscribed ellipses meet only at the edge
         midpoints, so every cell corner stays dry and a driven line reads as a
         row of discs rather than as a track. Over-inflating them until they
         overlap is what makes neighbours merge, and the alpha comes down to
         pay for the extra area. */
      const c0 = Pj.project(r.x + r.w / 2, r.y + r.h / 2, r.z || 0);
      const c1 = Pj.project(r.x + r.w, r.y + r.h / 2, r.z || 0);
      const c2 = Pj.project(r.x + r.w / 2, r.y + r.h, r.z || 0);
      ctx.beginPath();
      ctx.ellipse(c0.sx, c0.sy,
                  (Math.abs(c1.sx - c0.sx) + Math.abs(c2.sx - c0.sx)) * 1.3,
                  (Math.abs(c1.sy - c0.sy) + Math.abs(c2.sy - c0.sy)) * 1.3,
                  0, 0, Math.PI * 2);
      // Damp, packed sand: darker and a little cooler than the loose stuff.
      ctx.fillStyle = 'rgba(120,92,58,' + (0.40 * t).toFixed(3) + ')';
      ctx.fill();
    }
  },

  /* Printed buildings and a pond inside the loop, so the circuit reads as a
     town rather than a ring of tarmac. No collision — it is rug print.

     And PRINT is the word that was not being honoured. Each of these was one
     flat quad at 85% over the floor, which is paint on lino: an authored pond
     came out as a hard blue parallelogram, and next to a rug that now has a
     visible pile it was the most obviously computer-drawn thing left on the
     floor. Ink on cloth does not hide the cloth, so where the shape really is
     print the floor's own material is filled straight back over it through the
     same path, and every shape gets the dark printed outline that turns a
     coloured region into a drawn thing — the same trick as the cars, the
     houses in the print layer, and for the same reason. */
  drawDecoration(ctx, arena) {
    if (!arena.decoration.length) return;
    const Pj = BR.Projection;
    const print = arena.world === 'town-rug' || arena.sandy;
    const mat = print ? this.groundPattern(ctx, this.groundTile(arena)) : null;
    const L = this.tileLight();
    for (let i = 0; i < arena.decoration.length; i++) {
      const d = arena.decoration[i];
      const pts = [
        [d.x, d.y], [d.x + d.w, d.y], [d.x + d.w, d.y + d.h], [d.x, d.y + d.h],
      ];
      const p = [];
      for (let k = 0; k < 4; k++) p.push(Pj.project(pts[k][0], pts[k][1], 0));

      /* A POND IS NOT A RECTANGLE, and the authored data does not claim it is:
         it gives a bounding box, and the renderer was drawing the box. Water
         gets the ellipse inside it instead, walked as fourteen points on the
         GROUND PLANE rather than as a screen-space ellipse — the camera turns,
         and a shape drawn round on screen would be the only thing on the floor
         that did not turn with it. Everything else keeps its footprint: a
         building plot really is rectangular. */
      const round = d.type === 'pond' && arena.world !== 'kitchen';
      ctx.beginPath();
      if (round) {
        const ex = d.x + d.w / 2, ey = d.y + d.h / 2;
        for (let k = 0; k < 14; k++) {
          const a = k / 14 * Math.PI * 2;
          const q = Pj.project(ex + Math.cos(a) * d.w / 2,
                               ey + Math.sin(a) * d.h / 2, 0);
          if (k === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy);
        }
      } else {
        for (let k = 0; k < 4; k++) {
          if (k === 0) ctx.moveTo(p[k].sx, p[k].sy);
          else ctx.lineTo(p[k].sx, p[k].sy);
        }
      }
      ctx.closePath();
      ctx.fillStyle = d.colour;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      /* The floor's material back over the top — but only where the thing
         really is print. On the rug and in the sandpit these are a painted
         plot and a heap of sand, and the pile or the grain belongs through
         them. On the kitchen and stunt tracks `decoration` is the FURNITURE on
         the floor below the deck, and grout lines through a cupboard would be
         a worse lie than the flat fill was. */
      if (mat && d.type !== 'pond') { ctx.fillStyle = mat; ctx.fill(); }
      ctx.strokeStyle = 'rgba(32,26,20,0.34)';
      ctx.lineWidth = 3 / this.zoom;
      ctx.stroke();

      /* A pond gets what the printed pond in the rug tile gets: a rim, flat
         ripple arcs, and a bright edge on the side the light comes from. It is
         four strokes and it is the difference between water and a blue
         rectangle. */
      if (round) {
        const cx = (p[0].sx + p[2].sx) / 2, cy = (p[0].sy + p[2].sy) / 2;
        const rx = Math.abs(p[1].sx - p[0].sx) / 2 + Math.abs(p[3].sx - p[0].sx) / 2;
        const ry = Math.abs(p[1].sy - p[0].sy) / 2 + Math.abs(p[3].sy - p[0].sy) / 2;
        ctx.strokeStyle = 'rgba(232,248,255,0.26)';
        ctx.lineWidth = 2 / this.zoom;
        for (let k = 1; k <= 3; k++) {
          ctx.beginPath();
          ctx.ellipse(cx, cy + (k - 2) * ry * 0.34, rx * (0.62 - k * 0.11),
                      ry * 0.10, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.ellipse(cx + L.hx * rx * 0.26, cy + L.hy * ry * 0.26,
                    rx * 0.3, ry * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(236,250,255,0.20)';
        ctx.fill();
      }
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
    const MAT = S.mat;

    const quad = function (pts, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(pts[0].sx, pts[0].sy);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].sx, pts[k].sy);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    };

    /* ── WHERE THE LIGHT IS, IN THE CAR'S OWN FRAME ────────────────────────
       `light.dir` is the direction the light TRAVELS, so the direction back
       toward the source is dir + PI. Resolved into the car's local axes it
       gives one number, `litY`: which flank the sheen belongs on, +1 for the
       car's left, -1 for its right.

       This is the whole reason the light was worth having. The camera keeps
       the direction of travel pointing up the screen, so a car's silhouette
       never rotates — the ONLY thing that changes as it goes round a corner
       is where the highlight sits. A gloss streak painted on a fixed side, as
       this had, is a decal. One that walks across the roof through a corner is
       a curved plastic surface. */
    const litY = Math.sin(Pj.light.dir + Math.PI - heading);
    const lineW = Math.max(0.6, 1.6 * shrinkK / this.zoom);
    const sheen = MAT.spec * (0.45 + 0.55 * Math.abs(litY));
    const sheenCol = sheen > 0.02
      ? 'rgba(255,255,255,' + sheen.toFixed(3) + ')' : null;

    /* ── THE MOULD LINE ────────────────────────────────────────────────────
       The thing that says "this was made in a factory, in two halves", and the
       detail this pass was asked for first. It runs down the centre of the
       shell, over the nose, the bonnet and the roof.

       TWO hairlines a hair apart, never one. A single dark line is a scratch;
       a dark line with a pale one beside it is a raised ridge, and which side
       gets which is decided by the light — so the ridge catches on one side
       going up the straight and on the other coming back.

       Drawn per PANEL, because the shell and the roof are at different heights
       and this camera lifts the roof three units up the screen. Ruled in one
       pass at the end it painted the bonnet's own seam across the cabin above
       it and left the whole visible field behind the cabin bare — one line in
       the wrong place and a conspicuous gap where it belonged. */
    const seamPair = function (x0, x1, h) {
      const sw = Math.max(W * 0.06, lineW * 0.62);
      const off = litY >= 0 ? sw : -sw;
      ctx.lineWidth = lineW * 0.8;
      ctx.globalAlpha = (v.isGhost ? 0.38 : 1) * MAT.seam;
      for (let k = 0; k < 2; k++) {
        const a = lp(x0, (k ? off : -off), h), b = lp(x1, (k ? off : -off), h);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = k ? S.seamLit : S.seamDark;
        ctx.stroke();
      }
      ctx.globalAlpha = v.isGhost ? 0.38 : 1;
    };

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
      const wq = [
        lp(fx - wr, wy0, S.ride * 0.5), lp(fx + wr, wy0, S.ride * 0.5),
        lp(fx + wr * 0.9, wy1, S.ride * 0.5), lp(fx - wr * 0.9, wy1, S.ride * 0.5),
      ];
      ctx.beginPath();
      ctx.moveTo(wq[0].sx, wq[0].sy);
      for (let k = 1; k < 4; k++) ctx.lineTo(wq[k].sx, wq[k].sy);
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

    /* EVERY FLANK LIT SEPARATELY. They were all one flat `colorBody`, which is
       what made a car read as a coloured region with an outline round it rather
       than as a solid object: eight faces pointing eight ways, all exactly the
       same value. Each footprint edge carries the outward normal it has in the
       car's own frame (cached on the shape — the footprint never changes), so
       the world angle is that plus the heading and faceLight() does the rest.

       The amplitude is per MATERIAL and deliberately small. Die-cast swings
       widest because painted metal does; wood barely moves because a matte
       surface is nearly Lambertian and does not glint. Pushed further it looks
       better on one car standing still and starts eating the body colour, which
       is the one thing on a vehicle that is load-bearing — hue is how a player
       knows who just took the inside line, on screen and on the minimap. */
    /* ── AND HALF OF THEM ARE NEVER SEEN ───────────────────────────────────
       Traced, because lighting the faces individually made it worth knowing
       what they cost: a car emitted eight side quads a frame and at least four
       of them were painted and then covered.

       A side face is an extrusion DOWNWARD from its own footprint edge — the
       quad runs from the top face's edge down to the ride height — so on the
       far side of the car it hangs into the middle of the top polygon, which
       is drawn immediately afterwards and covers it completely. Only the near
       edges hang out past the silhouette where they can be seen. Confirmed in
       the trace: Red Racer's nose quad occupies screen rows -10.8 to -6.5 and
       the bonnet drawn over it covers -10.8 to -2.4.

       The projection is a rotation and a positive squash, so it preserves
       orientation: a footprint wound counter-clockwise stays counter-clockwise
       on screen, and for such a polygon the outward screen normal of an edge
       is (dsy, -dsx). Nearer is further DOWN the screen, so a face is visible
       exactly when dsx < 0. One subtraction per edge.

       ONLY WHEN UPRIGHT. On a loop or a corkscrew the extrusion is not
       vertical — `up` swings the body out sideways and through the vertical —
       and a face on the far side is then genuinely visible. Those frames draw
       all eight, which is what they did before. */
    const upright = U.z > 0.999;
    const faces = [];
    for (let i = 0; i < n; i++) faces[i] = Pj.faceLight(heading + S.normals[i]);
    for (let e = 0; e < edges.length; e++) {
      const i = edges[e].i, j = edges[e].j;
      if (upright && bot[j].sx >= bot[i].sx) continue;
      ctx.beginPath();
      ctx.moveTo(bot[i].sx, bot[i].sy);
      ctx.lineTo(bot[j].sx, bot[j].sy);
      ctx.lineTo(top[j].sx, top[j].sy);
      ctx.lineTo(top[i].sx, top[i].sy);
      ctx.closePath();
      ctx.fillStyle = this.tintOf(S.tints, spec.colorBody, faces[i] * MAT.body - 0.04);
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
    ctx.lineWidth = lineW;
    ctx.stroke();

    /* ── THE SHOULDERS OF THE SHELL ────────────────────────────────────────
       The single most valuable thing on the car, and it took a render to see
       why. At this camera the whole nose elevation of a car is hidden behind
       its own bonnet — measured on Red Racer, the nose face occupies screen
       rows -10.8 to -6.5 and the top face covers -10.8 to -2.4 — so the flat
       `colorTop` bonnet is most of what a player ever looks at, and it was one
       unshaded colour with nothing on it.

       A moulded shell is CROWNED: it curves over, so the flank facing the
       light is bright and the other is not, and the transition happens at the
       shoulder rather than at the outline. Two inset bands along the long
       edges give that for two quads, and they run the full length of the car —
       which matters, because the length axis is squashed to 30% and anything
       short comes out as a blob rather than a band. */
    if (MAT.body > 0.01) {
      const shz = S.ride + S.bodyH + 0.01;
      for (let sd = -1; sd <= 1; sd += 2) {
        const a = sd > 0 ? foot[2] : foot[6], b = sd > 0 ? foot[3] : foot[7];
        const t = this.tintOf(S.tintsTop, spec.colorTop,
                              Pj.faceLight(heading + sd * Math.PI / 2) * MAT.body * 0.95);
        quad([lp(a[0], a[1] * 0.95, shz), lp(b[0], b[1] * 0.95, shz),
              lp(b[0], b[1] * 0.64, shz), lp(a[0], a[1] * 0.64, shz)], t, null);
      }
    }

    /* ── THE CATCH ON THE EDGE ─────────────────────────────────────────────
       The parting line of the mould runs round the widest point of the shell,
       and that line is exactly this outline. On a real toy it is the edge that
       catches the light: a hard bright rim on the side facing the window, and
       nothing at all on the other side.

       So the same ring is stroked twice — once dark, all the way round, for
       separation, and once white over only the edges actually facing the light.
       One extra path per car, and it is the single cheapest thing here that
       says "shiny". */
    if (MAT.rim > 0.01) {
      ctx.beginPath();
      let open = false;
      for (let i = 0; i < n; i++) {
        if (faces[i] > 0.30) {
          const j = (i + 1) % n;
          if (!open) ctx.moveTo(top[i].sx, top[i].sy);
          ctx.lineTo(top[j].sx, top[j].sy);
          open = true;
        } else open = false;
      }
      ctx.strokeStyle = 'rgba(255,255,255,' + MAT.rim.toFixed(2) + ')';
      ctx.lineWidth = lineW * 1.15;
      ctx.stroke();
    }

    /* ── WEAR ──────────────────────────────────────────────────────────────
       12_Art_Guide.md: "a brand-new toy car is boring; a loved one has
       history". Three rubbed patches on the corners of the bonnet and the
       boot, which is where a toy car that lives in a box actually loses its
       paint. Seeded off the vehicle id, so a given car always wears the same
       way and two cars never wear alike — and never off Math.random(), which
       would both differ between renders and desync the AI by drawing from the
       shared stream.

       Colour comes from the material, because what is UNDER the paint differs:
       pale grey metal on the die-cast, lighter raw plastic on the mouldings,
       bare wood on the Heirloom. Kept off the cabin, which is drawn over it. */
    const wz = S.ride + S.bodyH + 0.03;
    ctx.globalAlpha = (v.isGhost ? 0.38 : 1) * MAT.wear;
    ctx.beginPath();                       // one path, three patches, one fill
    for (let i = 0; i < S.wear.length; i++) {
      const m = S.wear[i];
      const p0 = lp(m[0] - m[2], m[1] - m[3], wz), p1 = lp(m[0] + m[2], m[1] - m[3], wz);
      const p2 = lp(m[0] + m[2], m[1] + m[3], wz), p3 = lp(m[0] - m[2], m[1] + m[3], wz);
      ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy);
      ctx.closePath();
    }
    ctx.fillStyle = MAT.chip;
    ctx.fill();
    ctx.globalAlpha = v.isGhost ? 0.38 : 1;

    /* The sheen on the SHELL, drawn here rather than with the roof's so the
       cabin lands on top of it and breaks it — a highlight that runs nose to
       tail, interrupted where the cabin stands, is what a glossy toy looks
       like from above. Running its full length is also the only way it reads
       as a streak at all: the first version lit the bonnet alone, and 30%
       depth squash turned a 7-unit panel into a 2-unit square that came out
       as a pale blob sitting on the paint. */
    if (sheenCol) {
      const bc = litY * W * 0.42, bh = W * 0.13, bz = S.ride + S.bodyH + 0.02;
      quad([lp(L * 0.90, bc - bh, bz), lp(-L * 0.90, bc - bh, bz),
            lp(-L * 0.90, bc + bh, bz), lp(L * 0.90, bc + bh, bz)], sheenCol, null);
    }

    // The parting line down the shell, nose to tail. Same reason as the sheen
    // for drawing it here: the cabin has to be able to interrupt it.
    if (MAT.seam > 0.01) seamPair(L * 0.97, -L * 0.97, S.ride + S.bodyH + 0.05);

    /* Wood takes no mould line, so the Heirloom gets the thing it would
       actually have instead: two long grain marks down the shell. */
    if (MAT.grain) {
      ctx.beginPath();
      [0.34, -0.46].forEach(function (g) {
        const a = lp(L * 0.92, W * g, S.ride + S.bodyH + 0.05);
        const b = lp(-L * 0.92, W * g * 0.72, S.ride + S.bodyH + 0.05);
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
      });
      ctx.strokeStyle = S.seamDark;
      ctx.lineWidth = lineW * 0.7;
      ctx.globalAlpha = (v.isGhost ? 0.38 : 1) * 0.45;
      ctx.stroke();
      ctx.globalAlpha = v.isGhost ? 0.38 : 1;
    }

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
      // Same back-face test as the body, for the same reason: the roof is
      // drawn straight after and covers whatever hangs inward.
      if (upright && cbot[j].sx >= cbot[i].sx) continue;
      ctx.beginPath();
      ctx.moveTo(cbot[i].sx, cbot[i].sy);
      ctx.lineTo(cbot[j].sx, cbot[j].sy);
      ctx.lineTo(ctop[j].sx, ctop[j].sy);
      ctx.lineTo(ctop[i].sx, ctop[i].sy);
      ctx.closePath();
      // The forward face is glass. Dark and cool against the body colour, so
      // the car has a front without needing the old nose triangle.
      ctx.fillStyle = cEdges[e].front ? S.glass
        : this.tintOf(S.tints, spec.colorBody,
                      Pj.faceLight(heading + this.CABIN_N[i]) * MAT.body - 0.04);
      ctx.fill();
    }

    /* Roof. A DIFFERENT colour from the bonnet, which is the whole reason the
       cabin reads as a cabin — drawn in `colorTop` like the bonnet, the two
       merged into one lighter slab and the car went back to being a block. */
    ctx.lineWidth = lineW;
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

    /* ── SHEEN, THE ROOF HALF ──────────────────────────────────────────────
       The gloss used to be one pale streak nailed to the car's left, at a
       fixed 0.18. That is a sticker: it stayed on the left through every
       corner of the game while the shadow under the car swung right round.
       Now it sits on whichever flank faces the light and walks across as the
       car turns, and it is the same streak as the one on the shell below —
       one highlight down a car that happens to have a cabin in the way.

       `litY` is 0 when the light is straight up the car's nose, so the streak
       is weakest there and strongest side-on, which is what a crowned surface
       does. It is CENTRED then OFFSET rather than spanning from the middle out
       to the lit edge: the first version did the latter and at the two
       headings where the light ran along the car the streak collapsed to zero
       width, so the sheen blinked out twice a lap.

       Wood gets `spec: 0` and is skipped entirely — an old wooden car does not
       shine, and that is the point of it. */
    if (sheenCol) {
      const rc = litY * cw * 0.44, rh = cw * 0.17;
      quad([lp(cf * 0.90, rc - rh, cz1 + 0.02), lp(cb * 0.90, rc - rh, cz1 + 0.02),
            lp(cb * 0.90, rc + rh, cz1 + 0.02), lp(cf * 0.90, rc + rh, cz1 + 0.02)],
           sheenCol, null);
    }

    /* The roof's own length of the parting line. It skips the glass at both
       ends: the windscreen and rear window are painted on this shell rather
       than moulded into it, and a mould line ruled across them would cut the
       one shape that makes the car read as a car in half. */
    if (MAT.seam > 0.01) seamPair(cf, cb, cz1 + 0.05);

    /* ── THE NOSE ──────────────────────────────────────────────────────────
       A moulded bar across the very front in the trim colour, with the two
       lamps set into its outer ends. All on the TOP face.

       THE BUMPER WAS ON THE FRONT ELEVATION, and that was the worst thing on
       the car. At `groundTilt` 0.30 a body 5 units tall lifts 4.3 units up the
       screen while its own top face reaches 8.4 units down it, so the nose
       face is entirely behind the bonnet — traced on Red Racer, the nose
       occupies screen rows -10.8 to -6.5 and the top face covers -10.8 to
       -2.4. Drawn last, the bumper was therefore painted straight over the
       middle of the bonnet: a pale slab two thirds of the width of the car,
       lying across the paint like a racing stripe. It is plainly there in the
       before shot and reads as a marking rather than as a part.

       This is the same rule the windscreen already learned two phases ago and
       the guide states outright — a vertical pane at this camera is worth
       about two pixels. It applies to every face, not just the glass.

       ONE BAND, NOT THREE. The bumper and the two lamps were separate features
       0.10 and 0.12 of a car-length apart, which the 30% depth squash turns
       into 0.4 of a pixel at racing zoom: three pale marks landing on top of
       each other, and the nose came out as a smear rather than as a face.
       There is room for exactly one feature across the front of a car at this
       size, so the lamps now sit INSIDE the bumper, at its outer ends, with
       the trim colour showing between them. That is also what a toy car's
       front looks like from above — a bar with two lights in it. */
    const hz = S.ride + S.bodyH + 0.04;
    quad([lp(L * 0.99, -W * 0.58, hz), lp(L * 0.99, W * 0.58, hz),
          lp(L * 0.86, W * 0.64, hz), lp(L * 0.86, -W * 0.64, hz)],
         spec.colorTrim, null);
    [-1, 1].forEach(function (side) {
      quad([lp(L * 0.97, side * W * 0.32, hz), lp(L * 0.97, side * W * 0.56, hz),
            lp(L * 0.88, side * W * 0.60, hz), lp(L * 0.88, side * W * 0.34, hz)],
           S.lamp, null);
    });

    if (v.isGhost) ctx.restore();
  },

  /* Proportions, derived from the stats a vehicle already has so every car in
     the roster gained a shape without a data migration — and so a car added
     later gets one for free.

     The derivations are characterisation, not arithmetic for its own sake:
     a heavy vehicle sits taller on bigger wheels, a nimble one is squat with
     its cabin further back. 09_Vehicles.md: "material is characterisation". */
  /* ── WHAT A CAR IS MADE OF, AS LIGHT ───────────────────────────────────────
     09_Vehicles.md has carried an open item since Phase 10 titled "Still open:
     the visual half": every vehicle declares a `material`, 13_Audio.md gives
     each one a voice, and "a die-cast car should catch light differently from a
     moulded plastic one and a wooden one should not shine at all, and none of
     that is drawn yet — the field exists and the renderer ignores it". This
     table is the renderer no longer ignoring it.

     None of it is a stat. Every number here is an alpha or a tint, and the
     amplitudes are small on purpose: a vehicle's HUE is the only thing telling
     a player who just went past, here and on the minimap, so material may
     modulate the colour and may never compete with it.

       body   how far a flank swings between facing the light and facing away
       spec   the sheen on the top faces. Wood is 0 and means it
       rim    the white catch along the moulded shoulder
       seam   how plainly the parting line of the mould shows
       wear   opacity of the rubbed patches; chip is what is under the paint  */
  MATERIAL_LOOK: {
    // Injection-moulded shell: a hard bright rim, a tight sheen, and the
    // clearest parting line of the four — a cheap toy is not tidied up.
    plastic: { body: 0.13, spec: 0.30, rim: 0.30, seam: 1.00,
               wear: 0.26, chip: '#f4f1e8' },
    // Die-cast: painted metal swings widest between its lit and unlit faces,
    // and the seam is a filed-down line on the base rather than a ridge.
    metal:   { body: 0.19, spec: 0.24, rim: 0.44, seam: 0.45,
               wear: 0.34, chip: '#c9ccd2' },
    // Wood does not shine. It is nearly Lambertian, it has no mould at all,
    // and the Heirloom is the one car in the room a player should be able to
    // pick out by the fact that nothing on it catches the light.
    wood:    { body: 0.09, spec: 0.00, rim: 0.10, seam: 0.00,
               wear: 0.36, chip: '#d8bb8e', grain: 1 },
    // Lithographed tin: the shiniest thing on the grid, and a folded seam
    // rather than a moulded one, so it is there but faint.
    windup:  { body: 0.16, spec: 0.42, rim: 0.48, seam: 0.35,
               wear: 0.32, chip: '#e6e0cd' },
  },

  /* Outward normals of the cabin's four faces, in the car's own frame: nose,
     left, tail, right. The cabin is a rectangle at every size, so unlike the
     footprint these never need computing. */
  CABIN_N: [0, Math.PI / 2, Math.PI, -Math.PI / 2],

  /* A QUANTISED TINT CACHE. shade() parses a hex string and builds a new one on
     every call, and lighting the faces individually asks for a dozen per car —
     a hundred string allocations a frame at a full grid, for maybe fifteen
     distinct values. Rounded to 1/24 the eye cannot tell the difference and the
     map settles after the first corner.

     ONE CACHE PER BASE COLOUR, which is why the cache is a parameter rather
     than looked up from the shape: a single map keyed only on the amount would
     hand back a tint of the body colour when the shoulder asked for a tint of
     the roof colour, and the bug would look like a paint fault rather than a
     cache fault. */
  tintOf(cache, hex, amt) {
    const k = amt < -1 ? -24 : amt > 1 ? 24 : Math.round(amt * 24);
    let t = cache[k];
    if (t === undefined) t = cache[k] = this.shade(hex, k / 24);
    return t;
  },

  shapeFor(spec) {
    if (spec._shape) return spec._shape;
    const heavy = BR.M.clamp((spec.weight - 0.6) / 0.9, 0, 1);
    const H = spec.height;
    const s = {
      /* CHUNKIER than they were. A toy car's wheels are over-scaled — the
         mould has to survive a child — and they are the strongest thing in the
         silhouette saying this is an object rather than a marker. Raised from
         0.15 and a 0.17 track; beyond this they start to read as a buggy. */
      wheelR: Math.max(3.4, spec.length * (0.17 + 0.025 * heavy)),
      track:  spec.width * 0.20,          // how far the wheels stand proud
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
      mat:  this.MATERIAL_LOOK[spec.material] || this.MATERIAL_LOOK.plastic,
      tints: {},        // tints of colorBody, for the flanks
      tintsTop: {},     // tints of colorTop, for the shoulders of the shell
      // The two sides of the parting ridge. Both are tints of the body, never
      // a third hue — the same rule the roof and the outline already follow.
      seamDark: this.shade(spec.colorBody, -0.50),
      seamLit:  this.shade(spec.colorTop, 0.42),
    };

    /* Outward normal of every footprint edge, in the car's OWN frame. The
       footprint is fixed for a given vehicle, so these are computed once here
       and the per-frame cost of lighting a flank is one addition and the cosine
       inside faceLight(). Normal of edge a->b is (dy, -dx): checked against the
       nose edge, which must come out pointing along +x. */
    const foot = this.chamferedFootprint(spec.length / 2, spec.width / 2);
    s.normals = [];
    for (let i = 0; i < foot.length; i++) {
      const j = (i + 1) % foot.length;
      s.normals.push(Math.atan2(-(foot[j][0] - foot[i][0]), foot[j][1] - foot[i][1]));
    }

    /* Rubbed paint, seeded off the vehicle id — never off Math.random(), which
       would differ between two renders of the same frame and, worse, consume
       the shared stream the AI draws from. Kept to the corners of the bonnet
       and the boot, clear of the cabin drawn over them, and inside the chamfer
       so a patch cannot hang off the edge of the shell it is worn into. */
    let h = 2166136261;
    for (let i = 0; i < spec.id.length; i++) {
      h = Math.imul(h ^ spec.id.charCodeAt(i), 16777619);
    }
    const rnd = function () {
      h = (h + 0x6D2B79F5) | 0;
      let x = Math.imul(h ^ (h >>> 15), 1 | h);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const L = spec.length / 2, W = spec.width / 2;
    /* One patch forward, one aft, one either way, and the sides alternate.
       Three free draws put two of them within half a patch of each other on
       Red Racer and they read as one smudge rather than as wear. */
    const side = rnd() < 0.5 ? -1 : 1;
    const ends = [1, -1, rnd() < 0.5 ? -1 : 1];
    s.wear = [];
    for (let i = 0; i < 3; i++) {
      const fx = ends[i] * L * (0.63 + rnd() * 0.24);
      const fy = side * (i === 1 ? -1 : 1) * W * (0.24 + rnd() * 0.32);
      s.wear.push([fx, fy, L * (0.05 + rnd() * 0.05), W * (0.07 + rnd() * 0.07)]);
    }

    spec._shape = s;
    return s;
  },

  /* Lighten or darken a #rrggbb by a fraction. Kept here rather than authored
     per vehicle so a car added later gets a matching roof and outline for
     free — and so the two can never drift apart in the data. */
  /**
   * Lighten (amt > 0) or darken (amt < 0) a colour.
   *
   * TAKES BACK WHAT IT RETURNS. It used to accept only `#rrggbb` while
   * returning `rgb(r,g,b)`, so shading an already-shaded colour — which reads as
   * the most natural thing in the world — ran parseInt over "rgb(140,90,60)",
   * got NaN, and produced "rgb(NaN,NaN,NaN)".
   *
   * Nothing throws on that. The canvas silently IGNORES an invalid fillStyle
   * and keeps whatever was set last, so the failure is a shape drawn in some
   * other object's colour rather than an error. It was already live in two
   * places: the spade's grip is extruded from a pre-shaded side, and the
   * interface work found the same trap turning its boost channel black and
   * making the FOCUSED button the darkest thing on screen, because focus
   * lightens.
   */
  shade(col, amt) {
    let r, g, b;
    const s = col || '#888888';
    if (s.charCodeAt(0) === 35) {                 // '#'
      const h = s.slice(1);
      const n = parseInt(h.length === 3
        ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
      const m = s.match(/-?\d+(\.\d+)?/g);
      if (!m || m.length < 3) { r = g = b = 136; }
      else { r = +m[0]; g = +m[1]; b = +m[2]; }
    }
    const f = function (v) {
      const t = amt < 0 ? 0 : 255;
      return Math.round((t - v) * Math.abs(amt) + v);
    };
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
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
