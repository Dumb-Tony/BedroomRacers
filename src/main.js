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

  vehicle: null,
  arena: null,
  accumulator: 0,
  lastTime: 0,
  paused: false,

  start() {
    this.arena = BR.ARENA;

    BR.Input.init();
    BR.Particles.init();
    BR.Renderer.init(document.getElementById('game'));

    this.setVehicle('red-racer');
    BR.Renderer.snapCameraTo(this.vehicle.x, this.vehicle.y);

    BR.Debug.init(this);

    const self = this;
    requestAnimationFrame(function (t) { self.frame(t); });
  },

  setVehicle(id) {
    const sp = this.arena.spawn;
    this.vehicle = BR.Vehicle.create(id, sp.x, sp.y, sp.heading);
  },

  reset() {
    const sp = this.arena.spawn;
    BR.Vehicle.reset(this.vehicle, sp.x, sp.y, sp.heading);
    BR.Renderer.snapCameraTo(sp.x, sp.y);
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

    // ── one-shot keys ──────────────────────────────────────────────────────
    if (BR.Input.tapped('KeyR')) this.reset();
    if (BR.Input.tapped('KeyP') || BR.Input.tapped('Escape')) this.paused = !this.paused;
    if (BR.Input.tapped('KeyH')) BR.Debug.toggle();
    if (BR.Input.tapped('KeyT')) BR.Input.autoAccelerate = !BR.Input.autoAccelerate;

    // ── fixed-step simulation ──────────────────────────────────────────────
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

    BR.Renderer.render(this.vehicle, this.arena, alpha, dt);
    BR.Debug.update(this, dt);
    BR.Input.clearTaps();
  },

  /** One fixed simulation tick. */
  step(dt) {
    const input = BR.Input.sample();

    BR.VehicleController.step(this.vehicle, input, dt);

    // Ramps before walls: a launched car should already be airborne when wall
    // resolution runs, so it can clear ground-level geometry.
    BR.Collision.checkRamps(this.vehicle, this.arena.ramps);

    // Airborne vehicles ignore ground-level walls. That is what makes jumps
    // into shortcuts work later (03_Driving_Physics.md "Jump model").
    if (this.vehicle.grounded) {
      BR.Collision.resolveWalls(this.vehicle, this.arena.walls);
    }

    BR.Particles.emitForVehicle(this.vehicle, dt);
  },
};

window.addEventListener('load', function () { BR.Game.start(); });
