/* =============================================================================
   PARTICLES — tyre marks and dust.
   =============================================================================
   Not decoration. 02_Mechanics.md requires drifting to "create visual tire or
   dust effects", and 12_Art_Guide.md makes effects a GAMEPLAY SIGNAL — how the
   player reads what surface they're on and how hard they're sliding.

   Fixed-size pools, no allocation after init. Browser performance is a listed
   risk and a drifting pack of six cars is the worst case (14_Technical_
   Architecture.md).

   Positions are world-space and flat. Projection happens at draw time.
   ========================================================================== */

window.BR = window.BR || {};

BR.Particles = {

  MARK_POOL: 420,
  DUST_POOL: 160,

  marks: [],
  dust: [],
  markIdx: 0,
  dustIdx: 0,

  /* ── ITS OWN RANDOM STREAM ───────────────────────────────────────────────
     The docstring on emitForVehicle used to say it was "called from the render
     layer because emission rate is a visual concern, not a simulation one — the
     sim stays deterministic." That was the intent and the wiring did not match
     it: the call sits inside Game.step(), the FIXED SIMULATION TICK, and every
     emission drew six numbers from the shared Math.random.

     That is the stream the AI takes its wander and its deliberate mistakes
     from. So how hard the player happened to be sliding shifted the sequence
     underneath the opponents — not randomly, but really: a scrappier lap gave
     the field different mistakes than a clean one. Nothing about that is
     wanted, and nobody would ever look for it.

     A private generator means emission cannot reach the simulation at all, from
     wherever it is called. Fixing it MOVES LAP TIMES, because the shared stream
     stops being consumed and every draw after it shifts — the targets were
     re-measured with tools/calibrate.sh and rescaled by the ratio measured. */
  _seed: 0x9E3779B9,

  rnd() {
    let s = this._seed | 0;
    s = (s + 0x6D2B79F5) | 0;
    this._seed = s;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  init() {
    this.marks = [];
    this.dust = [];
    this._seed = 0x9E3779B9;      // reset, so a restart looks the same
    for (let i = 0; i < this.MARK_POOL; i++) {
      this.marks.push({ x: 0, y: 0, a: 0, life: 0, max: 1, rot: 0, w: 0 });
    }
    for (let i = 0; i < this.DUST_POOL; i++) {
      this.dust.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 0 });
    }
    this.markIdx = 0;
    this.dustIdx = 0;
  },

  /* Tyre mark — a ground decal at the wheel line. */
  addMark(x, y, rot, strength) {
    const m = this.marks[this.markIdx];
    this.markIdx = (this.markIdx + 1) % this.MARK_POOL;
    m.x = x; m.y = y; m.rot = rot;
    m.max = 2.2;
    m.life = m.max;
    m.a = 0.10 + 0.32 * strength;
    m.w = 3 + 3 * strength;
  },

  /* Dust puff — kicked up and away from the slide. */
  addDust(x, y, vx, vy, strength) {
    const d = this.dust[this.dustIdx];
    this.dustIdx = (this.dustIdx + 1) % this.DUST_POOL;
    d.x = x; d.y = y; d.z = 1 + this.rnd() * 3;
    d.vx = vx + (this.rnd() - 0.5) * 40;
    d.vy = vy + (this.rnd() - 0.5) * 40;
    d.vz = 18 + this.rnd() * 30;
    d.max = 0.5 + this.rnd() * 0.35;
    d.life = d.max;
    d.r = 3 + 6 * strength + this.rnd() * 3;
  },

  update(dt) {
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      if (m.life > 0) m.life -= dt;
    }
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.vz -= 40 * dt;
      d.vx *= 0.94; d.vy *= 0.94;
      if (d.z < 0) { d.z = 0; d.vz = 0; }
    }
  },

  /**
   * Emit for a vehicle.
   *
   * CALLED FROM INSIDE Game.step(), the fixed simulation tick — not from the
   * render layer, whatever the old comment here claimed. That is deliberate and
   * worth keeping: emitting per FRAME would make the amount of dust depend on
   * the frame rate, so a fast machine would lay a denser trail than a slow one.
   * Per tick it is the same everywhere.
   *
   * The price of living in the sim is that it must not touch the simulation's
   * randomness, which is what `rnd()` above is for.
   */
  emitForVehicle(v, dt) {
    if (!v.grounded) return;

    const speed = Math.hypot(v.vel.x, v.vel.y);
    const strength = BR.M.clamp(
      (v.slip - 0.10) / 0.55, 0, 1) * BR.M.clamp(speed / 120, 0, 1);
    if (strength <= 0.02) return;

    // Two marks, one per rear wheel.
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const back = -v.spec.length * 0.30;
    const half = v.spec.width * 0.40;
    for (let side = -1; side <= 1; side += 2) {
      const ox = back * c - (half * side) * s;
      const oy = back * s + (half * side) * c;
      this.addMark(v.x + ox, v.y + oy, v.heading, strength);
    }

    if (this.rnd() < strength * 0.9) {
      this.addDust(v.x, v.y, -v.vel.x * 0.15, -v.vel.y * 0.15, strength);
    }
  },
};
