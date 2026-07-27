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

  start() {
    this.arena = BR.ARENA;

    BR.Input.init();
    BR.Particles.init();
    BR.Renderer.init(document.getElementById('game'));

    this.buildRace();
    BR.Debug.init(this);

    const self = this;
    requestAnimationFrame(function (t) { self.frame(t); });
  },

  buildRace() {
    const grid = this.arena.grid;
    this.racers = [];
    this.vehicles = [];

    const player = BR.Vehicle.create(this.playerVehicleId,
                                     grid[0].x, grid[0].y, grid[0].heading);
    this.vehicle = player;
    this.vehicles.push(player);
    this.racers.push({
      vehicle: player, isPlayer: true, ai: null,
      name: BR.VEHICLES[this.playerVehicleId].name,
    });

    const n = Math.min(this.OPPONENTS, grid.length - 1);
    for (let i = 0; i < n; i++) {
      const spec = this.FIELD[i % this.FIELD.length];
      const g = grid[i + 1];
      const car = BR.Vehicle.create(spec.vehicle, g.x, g.y, g.heading);
      this.vehicles.push(car);
      this.racers.push({
        vehicle: car, isPlayer: false, name: spec.name,
        ai: BR.AIDriver.create(spec.personality, this.difficulty),
      });
    }

    BR.RaceManager.init(this.arena, this.racers, this.LAPS);
    BR.Renderer.snapCameraTo(grid[0].x, grid[0].y, grid[0].heading);
  },

  /* Swap the player's car and restart. The grid slot stays the same so the
     comparison between vehicles is fair. */
  setVehicle(id) {
    this.playerVehicleId = id;
    this.buildRace();
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

    if (BR.Input.tapped('KeyR')) this.reset();
    if (BR.Input.tapped('KeyP') || BR.Input.tapped('Escape')) this.paused = !this.paused;
    if (BR.Input.tapped('KeyH')) BR.Debug.toggle();
    if (BR.Input.tapped('KeyT')) BR.Input.autoAccelerate = !BR.Input.autoAccelerate;

    if (!this.paused) {
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
    BR.Debug.update(this, dt);
    BR.Input.clearTaps();
  },

  /** One fixed simulation tick. */
  step(dt) {
    const RM = BR.RaceManager;
    const locked = RM.isLocked();

    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const v = r.vehicle;

      // AI produces the same input struct a keyboard does, and it goes through
      // the same controller. No special physics — that is what stops it
      // cheating (04_AI.md).
      let input = r.isPlayer
        ? BR.Input.sample()
        : BR.AIDriver.drive(r.ai, v, this.arena, dt);

      // Nobody drives until the lights go out. The sim still runs so the scene
      // is live behind the countdown.
      if (locked) {
        input = { steer: 0, throttle: 0, brake: 0, drift: false, boost: false };
      }
      // A finished car coasts to a stop rather than parking dead on the line.
      if (r.finished) {
        input = { steer: 0, throttle: 0, brake: 0, drift: false, boost: false };
      }

      BR.VehicleController.step(v, input, dt);

      // Ramps before walls: a launched car should already be airborne when wall
      // resolution runs, so it can clear low geometry on the same tick.
      BR.Collision.checkRamps(v, this.arena.ramps);

      // Walls are ALWAYS resolved. Height is handled per wall inside
      // resolveWalls — a vehicle passes over anything lower than it is.
      BR.Collision.resolveWalls(v, this.arena.walls);
    }

    this.resolveCarContacts();
    RM.update(dt);

    BR.Particles.emitForVehicle(this.vehicle, dt);
  },

  /* Car-vs-car: exchange momentum weighted by mass, so the lighter car moves
     more (09_Vehicles.md — weight decides who wins contact). */
  resolveCarContacts() {
    const list = this.vehicles;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
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
