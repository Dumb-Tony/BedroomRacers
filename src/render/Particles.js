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

  init() {
    this.marks = [];
    this.dust = [];
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
    d.x = x; d.y = y; d.z = 1 + Math.random() * 3;
    d.vx = vx + (Math.random() - 0.5) * 40;
    d.vy = vy + (Math.random() - 0.5) * 40;
    d.vz = 18 + Math.random() * 30;
    d.max = 0.5 + Math.random() * 0.35;
    d.life = d.max;
    d.r = 3 + 6 * strength + Math.random() * 3;
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
   * Emit for a vehicle. Called from the render layer because emission rate is
   * a visual concern, not a simulation one — the sim stays deterministic.
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

    if (Math.random() < strength * 0.9) {
      this.addDust(v.x, v.y, -v.vel.x * 0.15, -v.vel.y * 0.15, strength);
    }
  },
};
