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
     driver, not separate code paths (04_AI.md). */
  FIELD: [
    { vehicle: 'yellow-rocket', personality: 'speedster',  name: 'Yellow Rocket' },
    { vehicle: 'blue-buggy',    personality: 'technician', name: 'Blue Buggy' },
    { vehicle: 'green-pickup',  personality: 'bully',      name: 'Green Pickup' },
    { vehicle: 'purple-micro',  personality: 'rookie',     name: 'Purple Micro' },
    { vehicle: 'red-racer',     personality: 'technician', name: 'Red Racer II' },
  ],

  playerVehicleId: 'red-racer',
  difficulty: 'normal',

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
    this.playerVehicleId = BR.ProgressionManager.selectedVehicle();

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

    const player = BR.Vehicle.create(this.playerVehicleId,
                                     grid[0].x, grid[0].y, grid[0].heading);
    this.vehicle = player;
    // Easy softens collisions for the PLAYER only — opponents keep normal
    // physics, so it reads as being tougher rather than as rivals being limp.
    const diff = BR.AIDriver.DIFFICULTY[this.difficulty] ||
                 BR.AIDriver.DIFFICULTY.normal;
    player.forgiveness = diff.forgiveness;
    this.vehicles.push(player);
    const playerRacer = {
      vehicle: player, isPlayer: true, ai: null,
      name: BR.VEHICLES[this.playerVehicleId].name,
    };
    this.racers.push(playerRacer);
    this.actors.push({ v: player, kind: 'player', racer: playerRacer });

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
      const n = Math.min(this.OPPONENTS, grid.length - 1);
      for (let i = 0; i < n; i++) {
        const spec = this.FIELD[i % this.FIELD.length];
        const g = grid[i + 1];
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
    BR.Renderer.snapCameraTo(grid[0].x, grid[0].y, grid[0].heading);

    // Cached tracks keep hazard state between races — put it back.
    BR.TrackManager.resetHazards(this.arena);

    this.stats = { driftSeconds: 0 };
    this.recorded = false;
  },

  /* Swap the player's car and restart. The grid slot stays the same so the
     comparison between vehicles is fair. */
  setVehicle(id) {
    this.playerVehicleId = id;
    this.buildRace();
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
    this.playerVehicleId = BR.ProgressionManager.selectedVehicle();
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

    this.stats = { driftSeconds: 0 };
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

    BR.Renderer.render(this.vehicles, this.vehicle, this.arena, alpha, dt);
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
        input = BR.Input.sample();
        if (!locked) BR.Ghost.capture(v, dt);
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

      // Objective tracking. Accumulated in the fixed step so it is frame-rate
      // independent — a player on a 144Hz monitor must not earn drift stars
      // faster than one on 60Hz.
      if (act.kind === 'player' && v.grounded && v.slip > BR.PHYSICS.driftMinAngle &&
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

    BR.Particles.emitForVehicle(this.vehicle, dt);
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
