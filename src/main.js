/* =============================================================================
   MAIN — boot and the fixed-timestep loop.
   =============================================================================
   The simulation runs at a FIXED 60Hz, decoupled from rendering. Two reasons:

     1. Feel is reproducible. Tuning values mean the same thing on a 60Hz
        laptop and a 144Hz monitor.
     2. Determinism. Time Trial ghosts record inputs, not positions
        (15_Save_System.md), and that only works if identical inputs produce
        identical results.

   The renderer interpolates between the last two simulation states, so a high
   refresh display stays smooth without running physics faster.
   ========================================================================== */

window.BR = window.BR || {};

BR.Game = {

  FIXED_DT: 1 / 60,
  MAX_STEPS: 6,      // ceiling per frame — prevents the spiral of death

  LAPS: 3,
  OPPONENTS: 3,

  /* Grid order after the player. Personalities are parameter bundles over one
     driver, not separate code paths (04_AI.md).

     YELLOW ROCKET DRIVES LIKE A ROOKIE, deliberately. Its top speed is 18% above
     the player's starter, which with the Speedster bundle meant it won every
     race on every difficulty — measured, the finishing position did not change
     between Easy and Hard. Pairing the fastest car with the most timid driver
     turns that raw pace into something the player can out-drive instead of
     something they cannot answer.

     Purple Micro takes the Speedster bundle in exchange, and starts further back
     so the quickest driver in the field has to come through it rather than
     leading from the lights. It is also only in the field from four opponents
     up, which makes the rookie event winnable and later events genuinely harder
     — escalation from the roster rather than from the difficulty slider. */
  FIELD: [
    { vehicle: 'yellow-rocket', personality: 'rookie',     name: 'Yellow Rocket' },
    { vehicle: 'green-pickup',  personality: 'bully',      name: 'Green Pickup' },
    { vehicle: 'blue-buggy',    personality: 'technician', name: 'Blue Buggy' },
    { vehicle: 'purple-micro',  personality: 'speedster',  name: 'Purple Micro' },
    { vehicle: 'red-racer',     personality: 'technician', name: 'Red Racer II' },
  ],

  playerVehicleId: 'red-racer',
  difficulty: 'normal',

  /* 1 to 4. Above one, the screen splits and every human gets a camera, a
     control profile and an audio channel. */
  MAX_PLAYERS: 4,
  players: 1,
  views: null,
  playerVehicleIds: ['red-racer', 'blue-buggy', 'purple-micro', 'green-pickup'],

  vehicles: null,    // every vehicle, for the renderer
  racers: null,      // race entries wrapping those vehicles
  vehicle: null,     // the player's vehicle — Debug and Renderer read this
  arena: null,
  accumulator: 0,
  lastTime: 0,
  paused: false,

  TRACK_ID: 'town-rug-loop',

  event: null,          // the event being raced
  stats: null,          // per-race accumulators for objectives
  recorded: false,      // progression is banked exactly once per race

  start() {
    // Save first: settings and the chosen vehicle come from it.
    const save = BR.SaveManager.load();
    BR.ProgressionManager.applyUnlocks();   // repairs a save from an older build

    BR.Audio.sfxVolume = save.settings.sfxVolume;
    BR.Audio.musicVolume = save.settings.musicVolume;
    BR.Input.autoAccelerate = save.settings.autoAccelerate;
    if (BR.MiniMap) BR.MiniMap.size = save.settings.mapSize;
    this.difficulty = save.settings.difficulty;
    this.refreshPlayerVehicles();

    // Content is data: the track is built from a definition, never hard-coded.
    this.arena = BR.TrackManager.build(BR.TRACKS[this.TRACK_ID]);
    this.LAPS = this.arena.laps;

    BR.Input.init();
    BR.Particles.init();
    BR.Renderer.init(document.getElementById('game'));

    // Browsers block audio until the user interacts, and 13_Audio.md is
    // explicit that this must be handled at first contact rather than
    // mid-race. Any click or key does it.
    const wake = function () { BR.Audio.resume(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);

    // A race is always built, even in the menus — the track renders behind
    // them, so the game is visible rather than hidden behind a flat colour.
    this.event = BR.EVENTS[0];
    this.buildRace();
    BR.Screens.init(document.getElementById('game'));
    BR.Screens.set(BR.Screens.MENU);

    BR.Debug.init(this);

    const self = this;
    requestAnimationFrame(function (t) { self.frame(t); });
  },

  trackCache: {},

  /* Tracks are built once and reused. Rebuilding on every retry would rerun the
     spline, the kerbs and 300-odd wall segments for nothing. */
  getTrack(id) {
    if (!this.trackCache[id]) {
      this.trackCache[id] = BR.TrackManager.build(BR.TRACKS[id]);
    }
    return this.trackCache[id];
  },

  buildRace() {
    const grid = this.arena.grid;
    const timeTrial = this.event && this.event.mode === 'time-trial';

    this.racers = [];
    this.vehicles = [];
    this.actors = [];

    // More than one human is an exhibition: no ghost, and no medals, stars or
    // records (see bankResult). One save cannot attribute them.
    const humanCount = timeTrial
      ? 1
      : Math.max(1, Math.min(this.MAX_PLAYERS, this.players));
    const multi = humanCount > 1;

    // Easy softens collisions for HUMANS only — opponents keep normal physics,
    // so it reads as being tougher rather than as rivals being limp.
    const diff = BR.AIDriver.DIFFICULTY[this.difficulty] ||
                 BR.AIDriver.DIFFICULTY.normal;

    const takenCars = [];
    for (let i = 0; i < humanCount; i++) {
      const id = this.playerVehicleIds[i] ||
                 BR.ProgressionManager.selectedVehicleFor(i + 1);
      const g = grid[i];
      const car = BR.Vehicle.create(id, g.x, g.y, g.heading);
      car.forgiveness = diff.forgiveness;
      if (i === 0) this.vehicle = car;
      this.vehicles.push(car);
      takenCars.push(id);

      const racer = {
        vehicle: car, isPlayer: true, ai: null,
        // Prefixed in split screen so the results card cannot be ambiguous
        // about which line is whose.
        name: (multi ? ('P' + (i + 1) + ' ') : '') + BR.VEHICLES[id].name,
        profile: multi ? ('p' + (i + 1)) : 'solo',
      };
      this.racers.push(racer);
      this.actors.push({ v: car, kind: 'player', racer: racer,
                         profile: racer.profile, humanIndex: i });
    }

    if (timeTrial) {
      // Your best run, replayed from its recorded inputs through the same
      // controller. Not a competitor — it has no position and cannot be hit.
      BR.Ghost.startRecording();
      const g = BR.Ghost.load(this.arena.id, this.playerVehicleId);
      if (g) {
        const gv = BR.Vehicle.create(this.playerVehicleId,
                                     grid[0].x, grid[0].y, grid[0].heading);
        gv.isGhost = true;
        this.vehicles.push(gv);
        this.actors.push({ v: gv, kind: 'ghost', racer: null });
      }
    } else {
      BR.Ghost.recording = null;
      BR.Ghost.playback = null;
      // Do not hand an AI a car a human is already driving — duplicate names in
      // the standings are confusing, and duplicate cars on track worse.
      const field = this.FIELD.filter(function (f) {
        return takenCars.indexOf(f.vehicle) === -1;
      });
      const n = Math.min(this.OPPONENTS, grid.length - humanCount, field.length);
      for (let i = 0; i < n; i++) {
        const spec = field[i % field.length];
        const g = grid[i + humanCount];
        const car = BR.Vehicle.create(spec.vehicle, g.x, g.y, g.heading);
        this.vehicles.push(car);
        const racer = {
          vehicle: car, isPlayer: false, name: spec.name,
          ai: BR.AIDriver.create(spec.personality, this.difficulty),
        };
        this.racers.push(racer);
        this.actors.push({ v: car, kind: 'ai', racer: racer });
      }
    }

    BR.RaceManager.init(this.arena, this.racers, this.LAPS);
    this.layoutViews();
    BR.Renderer.snapCameraTo(grid[0].x, grid[0].y, grid[0].heading);

    // Cached tracks keep hazard state between races — put it back.
    BR.TrackManager.resetHazards(this.arena);

    this.stats = { driftSeconds: 0, piecesThisRace: 0 };
    this.recorded = false;
  },

  /* Swap player one's car and restart. The grid slot stays the same so the
     comparison between vehicles is fair. */
  setVehicle(id) {
    BR.ProgressionManager.selectVehicleFor(id, 1);
    this.refreshPlayerVehicles();
    this.buildRace();
  },

  /** Pull every slot back out of the save. */
  refreshPlayerVehicles() {
    const P = BR.ProgressionManager;
    this.playerVehicleIds = [];
    for (let s = 1; s <= this.MAX_PLAYERS; s++) {
      this.playerVehicleIds.push(P.selectedVehicleFor(s));
    }
    this.playerVehicleId = this.playerVehicleIds[0];
  },

  /* Re-read the garage and rebuild, so a change is visible on the menu
     backdrop immediately rather than only once a race starts. */
  syncPlayerVehicles() {
    this.refreshPlayerVehicles();
    this.buildRace();
  },

  /**
   * One viewport per human. Side by side rather than stacked: the camera sits
   * 17.5 degrees above the floor, so depth ahead is the scarce resource and a
   * short wide viewport throws it away.
   *
   * Rects are recomputed freely — cameras live on the view objects and are
   * preserved, so a window resize does not jolt the view.
   */
  layoutViews() {
    const humans = [];
    for (let i = 0; i < this.racers.length; i++) {
      if (this.racers[i].isPlayer) humans.push(this.racers[i]);
    }
    const n = Math.max(1, humans.length);
    const W = BR.Renderer.w || 1280, H = BR.Renderer.h || 800;

    if (!this.views || this.views.length !== n) {
      this.views = [];
      for (let i = 0; i < n; i++) this.views.push({ cam: { x: 0, y: 0, yaw: 0 } });
    }

    // 1 -> full screen. 2 -> side by side, because depth ahead is the scarce
    // resource at a 17.5 degree camera and a short wide view throws it away.
    // 3 and 4 -> quadrants, since there is no way to give four people tall
    // views on one screen.
    const cols = n === 1 ? 1 : 2;
    const rows = n <= 2 ? 1 : 2;
    const vw = Math.round(W / cols), vh = Math.round(H / rows);

    const colours = ['#ffd34d', '#69d0ff', '#7fe06a', '#ff9d6b'];
    for (let i = 0; i < n; i++) {
      const view = this.views[i];
      view.racer = humans[i] || this.racers[0];
      view.vehicle = view.racer.vehicle;
      view.x = (i % cols) * vw;
      view.y = Math.floor(i / cols) * vh;
      view.w = vw;
      view.h = vh;
      view.label = n === 1 ? null : ('P' + (i + 1) + ' — ' + view.racer.name);
      view.controls = n === 1 ? null : BR.Input.LABELS[view.racer.profile];
      view.colour = colours[i % colours.length];
    }

    // Three players leaves a quadrant spare. A live standings board is more
    // use there than an empty corner.
    this.spareQuadrant = (n === 3)
      ? { x: vw, y: vh, w: vw, h: vh }
      : null;
  },

  startEvent(event) {
    if (!event) return;
    this.event = event;
    this.arena = this.getTrack(event.trackId);
    this.LAPS = event.laps;
    this.OPPONENTS = event.opponents;
    // The PLAYER'S setting wins. An event's `difficulty` now records the
    // challenge it was designed around; the pacing across the roster is carried
    // by lap count and grid size, which a difficulty setting does not touch.
    this.difficulty = BR.SaveManager.get().settings.difficulty || 'normal';
    this.refreshPlayerVehicles();
    BR.SaveManager.get().state.lastEvent = event.id;

    this.buildRace();
    BR.Screens.activeEvent = event;
    BR.Screens.lastResult = null;
    BR.Screens.set(BR.Screens.RACE);
  },

  abandonRace() {
    BR.Screens.lastResult = null;
    this.buildRace();
  },

  /* Banked exactly once, the moment the results card appears. Doing it per
     frame would multiply stars. */
  bankResult() {
    if (this.recorded || !this.event) return;
    this.recorded = true;

    // Two-up is an exhibition. One save cannot represent two players'
    // progress, and awarding it to whoever happens to be on the left would be
    // worse than awarding nothing.
    if (this.players > 1) { BR.Screens.lastResult = null; return; }

    const RM = BR.RaceManager;
    const me = RM.player();

    // Keep the ghost only if it is faster. store() re-checks, so a slower run
    // cannot overwrite a good one even if this is called twice.
    if (this.event.mode === 'time-trial' && me.finished) {
      const rec = BR.Ghost.stopRecording();
      BR.Screens.ghostSaved =
        BR.Ghost.store(this.arena.id, this.playerVehicleId, rec, me.finishTime);
    }

    BR.Screens.lastResult = BR.ProgressionManager.record(this.event, {
      position: me.position,
      total: RM.racers.length,
      finished: me.finished,
      time: me.finishTime,
      bestLap: me.bestLap,
      collisions: this.vehicle.impacts,
      driftSeconds: this.stats.driftSeconds,
      trackId: this.arena.id,
      difficulty: this.difficulty,
    });
  },

  reset() {
    const grid = this.arena.grid;
    for (let i = 0; i < this.vehicles.length; i++) {
      const g = grid[i];
      BR.Vehicle.reset(this.vehicles[i], g.x, g.y, g.heading);
    }
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (r.ai) r.ai = BR.AIDriver.create(
        this.FIELD[(i - 1) % this.FIELD.length].personality, this.difficulty);
    }
    BR.RaceManager.reset();
    BR.Particles.init();
    BR.Renderer.snapCameraTo(grid[0].x, grid[0].y, grid[0].heading);

    // Cached tracks keep hazard state between races — put it back.
    BR.TrackManager.resetHazards(this.arena);

    this.stats = { driftSeconds: 0, piecesThisRace: 0 };
    this.recorded = false;
    BR.Screens.lastResult = null;
  },

  frame(now) {
    const self = this;
    requestAnimationFrame(function (t) { self.frame(t); });

    if (!this.lastTime) this.lastTime = now;
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // A backgrounded tab returns a huge delta. Clamping stops the car
    // teleporting through a wall on return.
    if (dt > 0.25) dt = 0.25;

    const racing = BR.Screens.state === BR.Screens.RACE;

    if (BR.Input.tapped('KeyH')) BR.Debug.toggle();
    if (BR.Input.tapped('KeyT')) BR.Input.autoAccelerate = !BR.Input.autoAccelerate;
    if (racing) {
      if (BR.Input.tapped('KeyR')) this.reset();
      if (BR.Input.tapped('KeyP')) this.paused = !this.paused;
      if (BR.Input.tapped('Escape')) { this.abandonRace(); BR.Screens.set(BR.Screens.EVENTS); }
    }

    // Hit regions are rebuilt every frame by whatever draws them, so they are
    // cleared here rather than inside any one drawer.
    BR.Screens.regions = [];

    if (racing && !this.paused) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= this.FIXED_DT && steps < this.MAX_STEPS) {
        this.step(this.FIXED_DT);
        this.accumulator -= this.FIXED_DT;
        steps++;
      }
      // Ran out of budget: drop the backlog rather than falling further behind.
      if (steps === this.MAX_STEPS) this.accumulator = 0;
    }

    const alpha = this.paused
      ? 1
      : BR.M.clamp(this.accumulator / this.FIXED_DT, 0, 1);

    // Particles use real time. They are visual only and never feed back into
    // the simulation, so their randomness cannot break determinism.
    BR.Particles.update(this.paused ? 0 : dt);

    // Viewport rects follow the window; cameras persist on the view objects.
    this.layoutViews();
    BR.Renderer.render(this, alpha, dt);
    BR.Screens.draw(BR.Renderer.ctx, BR.Renderer.w, BR.Renderer.h, dt);

    // Once per RENDERED frame, never from inside the fixed step — see Audio.js.
    BR.Audio.update(this, dt);

    if (racing && BR.RaceManager.state === BR.RaceManager.STATE.FINISHED) {
      this.bankResult();
    }

    BR.Debug.update(this, dt);
    BR.Input.clearTaps();
  },

  /** One fixed simulation tick. */
  step(dt) {
    const RM = BR.RaceManager;
    const locked = RM.isLocked();

    for (let i = 0; i < this.actors.length; i++) {
      const act = this.actors[i];
      const r = act.racer;
      const v = act.v;

      // Player, AI and ghost all produce the SAME input struct and all go
      // through the same controller. No special physics anywhere — that is what
      // stops AI cheating (04_AI.md), and it is what lets a ghost be replayed
      // from inputs alone rather than from recorded positions.
      // A ghost is an animation, not a car. It is positioned from its recording
      // after the sim runs, never driven through the controller — see Ghost.js.
      if (act.kind === 'ghost') continue;

      let input;
      if (act.kind === 'player') {
        input = BR.Input.sample(act.profile);
        // Only the first human is recorded — a ghost is one car's line.
        if (!locked && act.racer === this.racers[0]) BR.Ghost.capture(v, dt);
      } else {
        input = BR.AIDriver.drive(r.ai, v, this.arena, dt);
      }

      // Nobody drives until the lights go out. The sim still runs so the scene
      // is live behind the countdown.
      if (locked) {
        input = { steer: 0, throttle: 0, brake: 0, drift: false, boost: false };
      }
      // A finished car coasts to a stop rather than parking dead on the line.
      if (r && r.finished) {
        input = { steer: 0, throttle: 0, brake: 0, drift: false, boost: false };
      }

      // Surface under the wheels, read BEFORE stepping so grip, top speed and
      // acceleration all reflect where the car actually is. This is what makes
      // cutting a corner across the rug cost something.
      v.surface = BR.TrackManager.surfaceAt(this.arena, v.x, v.y);

      BR.VehicleController.step(v, input, dt);

      // Ramps before walls: a launched car should already be airborne when wall
      // resolution runs, so it can clear low geometry on the same tick.
      BR.Collision.checkRamps(v, this.arena.ramps);

      // Walls are ALWAYS resolved. Height is handled per wall inside
      // resolveWalls — a vehicle passes over anything lower than it is.
      BR.Collision.resolveWalls(v, this.arena.walls);

      BR.TrackManager.resolveHazards(this.arena, v);
      BR.TrackManager.checkBoostPads(this.arena, v);
      if (act.kind === 'player') this.checkCollectibles(v, act.humanIndex || 0);

      // Objective tracking. Accumulated in the fixed step so it is frame-rate
      // independent — a player on a 144Hz monitor must not earn drift stars
      // faster than one on 60Hz.
      if (act.kind === 'player' && act.racer === this.racers[0] &&
          v.grounded && v.slip > BR.PHYSICS.driftMinAngle &&
          Math.hypot(v.vel.x, v.vel.y) > BR.PHYSICS.driftMinSpeed) {
        this.stats.driftSeconds += dt;
      }
    }

    BR.TrackManager.updateHazards(this.arena, dt);
    this.resolveCarContacts();
    this.applyAssistance(dt);
    RM.update(dt);

    // Ghost is placed from the race clock, so it lines up with the run it was
    // recorded from regardless of frame rate.
    if (BR.Ghost.hasGhost()) {
      for (let i = 0; i < this.actors.length; i++) {
        if (this.actors[i].kind !== 'ghost') continue;
        BR.Ghost.apply(this.actors[i].v, locked ? 0 : RM.clock);
      }
    }

    // Marks and dust for every human — an opponent's slide is not the
    // player's business, but the other player's certainly is.
    for (let i = 0; i < this.racers.length; i++) {
      if (this.racers[i].isPlayer) {
        BR.Particles.emitForVehicle(this.racers[i].vehicle, dt);
      }
    }
  },

  /* Toy pieces. Generous pickup radius — a piece you clipped and did not get
     would be maddening, and they are already hard enough to reach. */
  checkCollectibles(v, humanIndex) {
    const P = BR.ProgressionManager;
    const list = this.arena.collectibles;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (P.hasPiece(c.id)) continue;
      const dx = v.x - c.x, dy = v.y - c.y;
      if (dx * dx + dy * dy > 62 * 62) continue;
      const got = P.findPiece(c.id);
      if (got) {
        this.stats.piecesThisRace++;
        BR.Screens.pieceToast = got;
        BR.Screens.pieceToastTime = 3.2;
        // Pans to whoever actually picked it up.
        BR.Audio.boostFull(BR.Audio.channelOut(humanIndex));
      }
    }
  },

  /* Dynamic assistance, per 04_AI.md. Two rules make it fair:

       - It only ever HELPS whoever is behind. A leading car is never slowed
         down. Holding a winning player back is the most resented mechanic in
         arcade racing, and it is what makes rubber-banding feel like a lie.
       - It is capped hard enough to compress the field without deciding the
         race.

     Disabled entirely in Time Trial, where a time has to mean something. */
  applyAssistance(dt) {
    if (!this.event || this.event.mode === 'time-trial') return;
    const RM = BR.RaceManager;
    if (RM.state !== RM.STATE.RACING) return;

    let lead = 0;
    for (let i = 0; i < this.racers.length; i++) {
      if (this.racers[i].cpsPassed > lead) lead = this.racers[i].cpsPassed;
    }

    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const behind = BR.M.clamp((lead - r.cpsPassed) / 8, 0, 1);

      if (r.ai) {
        r.ai.catchUp = 1 + behind * BR.AIDriver.MAX_CATCHUP;
      } else if (behind > 0.2 && !r.finished) {
        // A trailing player earns boost slightly faster. Small enough to be
        // invisible, and it gives them something to fight back with.
        r.vehicle.boostMeter = Math.min(1,
          r.vehicle.boostMeter + behind * 0.05 * dt);
      }
    }
  },

  /* Car-vs-car: exchange momentum weighted by mass, so the lighter car moves
     more (09_Vehicles.md — weight decides who wins contact). */
  resolveCarContacts() {
    const list = this.vehicles;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        // A ghost is a replay, not a rival. Letting it push the player would
        // also break its own determinism.
        if (a.isGhost || b.isGhost) continue;
        if (Math.abs(a.z - b.z) > 14) continue;   // one is airborne over the other

        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const rsum = a.radius + b.radius;
        if (d >= rsum || d < 1e-6) continue;

        const nx = dx / d, ny = dy / d;
        const overlap = rsum - d;

        const wa = a.spec.weight, wb = b.spec.weight;
        const total = wa + wb;
        a.x -= nx * overlap * (wb / total);
        a.y -= ny * overlap * (wb / total);
        b.x += nx * overlap * (wa / total);
        b.y += ny * overlap * (wa / total);

        const rvx = b.vel.x - a.vel.x, rvy = b.vel.y - a.vel.y;
        const sep = rvx * nx + rvy * ny;
        if (sep > 0) continue;                    // already moving apart

        const imp = -(1 + BR.PHYSICS.collisionRestitution) * sep / total;
        a.vel.x -= imp * nx * wb;
        a.vel.y -= imp * ny * wb;
        b.vel.x += imp * nx * wa;
        b.vel.y += imp * ny * wa;
      }
    }
  },
};

window.addEventListener('load', function () { BR.Game.start(); });
