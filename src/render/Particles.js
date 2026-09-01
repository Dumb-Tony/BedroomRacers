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

  /* ── WHAT EACH FLOOR THROWS UP ───────────────────────────────────────────
     Every surface used to throw the same beige puff, because the colour was a
     literal in the draw call — one sandy `rgba(214,198,170)` for sand, carpet,
     floorboards, a puddle and a red sofa throw alike.

     `rate` is emission INDEPENDENT OF SLIDING, which is the other half of it.
     Sand sprays because you are driving on sand, not because you are sideways;
     a plastic track piece throws almost nothing however hard you provoke it.
     That makes the effect a reading of the ground rather than of the driver,
     which is what 12_Art_Guide asks of it — effects are a gameplay signal, and
     "what am I on" is the signal that matters here.

     `rise` and `drag` are how it behaves once up: sand is heavy and drops back,
     lint hangs, water spray is fast and short-lived. */
  DUST_LOOK: {
    rugRoad:    { col: '190,180,158', rate: 0.10, size: 0.85, rise: 0.9, life: 1.00 },
    rugGrass:   { col: '150,170,120', rate: 0.30, size: 1.00, rise: 0.9, life: 1.05 },
    hardwood:   { col: '188,168,138', rate: 0.05, size: 0.70, rise: 0.7, life: 0.80 },
    blanket:    { col: '196,150,150', rate: 0.22, size: 1.10, rise: 0.7, life: 1.20 },
    plastic:    { col: '205,205,210', rate: 0.02, size: 0.60, rise: 0.6, life: 0.70 },
    paper:      { col: '224,216,196', rate: 0.14, size: 0.90, rise: 1.1, life: 1.10 },
    bookCover:  { col: '186,170,150', rate: 0.06, size: 0.75, rise: 0.8, life: 0.85 },
    sand:       { col: '214,198,170', rate: 0.55, size: 1.15, rise: 1.0, life: 0.95 },
    packedSand: { col: '206,188,158', rate: 0.30, size: 1.00, rise: 0.9, life: 0.90 },
    looseSand:  { col: '222,206,178', rate: 0.80, size: 1.30, rise: 1.1, life: 1.00 },
    puddle:     { col: '206,226,236', rate: 0.70, size: 0.90, rise: 1.4, life: 0.55 },
  },

  lookFor(name) {
    return this.DUST_LOOK[name] || this.DUST_LOOK.rugRoad;
  },

  /* Dust puff — kicked up and away from the slide. */
  addDust(x, y, vx, vy, strength, look) {
    const L = look || this.DUST_LOOK.rugRoad;
    const d = this.dust[this.dustIdx];
    this.dustIdx = (this.dustIdx + 1) % this.DUST_POOL;
    d.x = x; d.y = y; d.z = 1 + this.rnd() * 3;
    d.vx = vx + (this.rnd() - 0.5) * 40;
    d.vy = vy + (this.rnd() - 0.5) * 40;
    d.vz = (18 + this.rnd() * 30) * L.rise;
    d.max = (0.5 + this.rnd() * 0.35) * L.life;
    d.life = d.max;
    d.r = (3 + 6 * strength + this.rnd() * 3) * L.size;
    d.col = L.col;
    d.drag = 0.94;
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
      const k = d.drag === undefined ? 0.94 : d.drag;
      d.vx *= k; d.vy *= k;
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
  emitForVehicle(v, dt, isPlayer) {
    if (!v.grounded) return;

    const speed = Math.hypot(v.vel.x, v.vel.y);
    const fast = BR.M.clamp(speed / 120, 0, 1);
    const strength = BR.M.clamp((v.slip - 0.10) / 0.55, 0, 1) * fast;
    const L = this.lookFor(v.surface);
    // Opponents emit, but thinner: eight cars at the player's rate would flush
    // a 160-slot pool in one corner and the player's own trail would vanish.
    const share = isPlayer === false ? 0.45 : 1;

    /* Two kinds of dust, and keeping them apart is the point. SLIDING throws
       it up whatever you are on; SPEED throws it up because of what you are on.
       Sand sprays down a straight and a plastic track piece does not, so the
       floor is legible from the trail without looking down. */
    const ground = L.rate * fast * fast * share;
    if (this.rnd() < ground * 0.9) {
      this.addDust(v.x, v.y, -v.vel.x * 0.10, -v.vel.y * 0.10, 0.35 + 0.4 * fast, L);
    }

    if (strength <= 0.02) return;

    /* Two marks, one per rear wheel — but NOT every tick.
       Laying a pair per car per tick was affordable while only the humans did
       it. With the whole field emitting, eight cars put 16 marks a tick into a
       420-slot ring, which recycles the entire pool in under a second — so
       trails would disappear faster than they were drawn, and the fix for
       "rivals leave no marks" would have deleted the player's own.

       At this rate a car at full speed lays a mark roughly every 17 units,
       which is under its own length, so the trail still reads as continuous. */
    if (this.rnd() < 0.34 * share) {
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      const back = -v.spec.length * 0.30;
      const half = v.spec.width * 0.40;
      for (let side = -1; side <= 1; side += 2) {
        const ox = back * c - (half * side) * s;
        const oy = back * s + (half * side) * c;
        this.addMark(v.x + ox, v.y + oy, v.heading, strength);
      }
    }

    if (this.rnd() < strength * 0.9 * share) {
      this.addDust(v.x, v.y, -v.vel.x * 0.15, -v.vel.y * 0.15, strength, L);
    }
  },

  /* ── landing ─────────────────────────────────────────────────────────────
     A car dropping out of the air used to arrive in total silence, visually:
     the shadow met the wheels and nothing happened. A ring of whatever the
     floor is made of, thrown outward, is the cheapest way to say "that landed"
     — and it reads at exactly the moment the player is looking, because they
     have just been in the air wondering where they will come down. */
  landing(v, force) {
    const L = this.lookFor(v.surface);
    const n = 3 + Math.round(4 * force);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd() * 0.6;
      const sp = 40 + 90 * force * this.rnd();
      this.addDust(v.x, v.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + 0.5 * force, L);
    }
  },

  /* ── impact ──────────────────────────────────────────────────────────────
     Thrown FORWARD of the contact and against the direction of travel, so it
     reads as something coming off the car rather than a puff appearing beside
     it. Uses the floor's own colour: a toy car hitting a skirting board does
     not strike sparks, it scuffs whatever it is standing on. */
  impact(v, severity) {
    const L = this.lookFor(v.surface);
    const n = 2 + Math.round(5 * severity);
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 60 + 140 * severity * this.rnd();
      this.addDust(v.x, v.y, Math.cos(a) * sp - v.vel.x * 0.2,
                   Math.sin(a) * sp - v.vel.y * 0.2, 0.5 + 0.5 * severity, L);
    }
  },
};
