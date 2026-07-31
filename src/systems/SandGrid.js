/* =============================================================================
   SAND GRID — the racing line is not painted on, it is worn in.
   =============================================================================
   The signature mechanic of Sandbox Speedway. 08_World_Sandbox.md set out three
   options for sand and recommended this one:

     1. Decal trails only — nearly free, and loses the interesting part.
     2. A coarse compaction grid — driving packs the sand, packed sand is
        faster. THIS ONE.
     3. Real height deformation — expensive, and reintroduces the elevation
        problem this world exists to avoid.

   Option 2 is the reason to build this world at all. It turns the "replayable
   tracks" pillar into a mechanic: lap one is slow and vague everywhere, and by
   lap three there is a fast line that the players themselves put there. Two
   drivers who choose different lines get different tracks.

   A COARSE grid on purpose. Cells are about two car lengths, so compaction
   reads as a route rather than as tyre tracks — Particles already draws the
   tracks. Fine cells would be invisible at speed and cost far more to sample.

   Reset per race, not per lap. Within a race the line builds and matters; across
   races everyone starts from flat sand again, so a fresh grid is a fresh
   problem rather than a track that is permanently solved.
   ========================================================================== */

window.BR = window.BR || {};

BR.SandGrid = {

  CELL: 70,            // world units — roughly two and a half car lengths

  /* Compaction per second under one car. MEASURED, not guessed — see below.
     A car at racing speed crosses a cell in about 0.28s, so one pass leaves a
     cell roughly a quarter packed and it takes three or four to firm up.

     Tuned against the TIME TRIAL, where one car wears its own line and the arc
     is undiluted. Solo lap times across the rate sweep:

         2.6   32.8, 29.2, 29.1   line finished during lap one — no lap-3 story
         1.6   33.7, 29.9, 29.2   arc present but crowded into lap two
         1.0   34.4, 30.9, 29.5   three distinct laps, full pace at the flag
         0.6   35.0, 32.0, 30.9   never finishes forming inside three laps
         0.35  35.3, 32.8, 32.2   barely packs at all

     Careful with the headline number: lap one is slow in EVERY race because it
     starts from a standstill, worth about 2s here. The figures above are net of
     a matched control run with packing switched off, so the ~2.9s at rate 1.0
     is what the SAND is doing and nothing else.

     A full grid wears the line in faster than a lone car — five sets of tyres,
     one line. That is physical and it reads correctly, so it is left alone. */
  PACK_RATE: 1.0,
  SPREAD: 0.35,        // how much a pass affects neighbouring cells

  active: false,
  cols: 0, rows: 0,
  originX: 0, originY: 0,
  cells: null,         // Float32Array, 0 = loose, 1 = packed
  touched: null,       // indices with any compaction, for cheap iteration

  /** Sized to a track's bounds. Called once when a sandy track is built. */
  init(bounds) {
    this.originX = bounds.minX;
    this.originY = bounds.minY;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / this.CELL));
    this.rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / this.CELL));
    this.cells = new Float32Array(this.cols * this.rows);
    this.touched = [];
    this.active = true;
  },

  disable() { this.active = false; this.touched = []; },

  reset() {
    if (!this.cells) return;
    // Only the touched cells can be non-zero, so clearing those is enough.
    for (let i = 0; i < this.touched.length; i++) this.cells[this.touched[i]] = 0;
    this.touched = [];
  },

  indexAt(x, y) {
    const cx = Math.floor((x - this.originX) / this.CELL);
    const cy = Math.floor((y - this.originY) / this.CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -1;
    return cy * this.cols + cx;
  },

  /** 0..1 compaction at a world position. */
  at(x, y) {
    if (!this.active) return 0;
    const i = this.indexAt(x, y);
    return i < 0 ? 0 : this.cells[i];
  },

  bump(i, amount) {
    if (i < 0) return;
    const was = this.cells[i];
    if (was === 0 && amount > 0) this.touched.push(i);
    const next = was + amount;
    this.cells[i] = next > 1 ? 1 : next;
  },

  /**
   * A car passes over. Called from the fixed step, so packing is frame-rate
   * independent — a 144Hz machine must not wear a line in faster.
   *
   * Weight matters: a heavier car packs harder. That gives the Green Pickup
   * something to be good at beyond winning contact.
   */
  drive(v, dt) {
    if (!this.active || !v.grounded) return;
    const amount = this.PACK_RATE * dt * (v.spec.weight || 1);
    const i = this.indexAt(v.x, v.y);
    this.bump(i, amount);

    // Bleed into the neighbours so a line has width and does not read as a
    // single-cell scratch.
    if (i >= 0 && this.SPREAD > 0) {
      const side = amount * this.SPREAD;
      const cx = i % this.cols, cy = (i / this.cols) | 0;
      if (cx > 0)             this.bump(i - 1, side);
      if (cx < this.cols - 1) this.bump(i + 1, side);
      if (cy > 0)             this.bump(i - this.cols, side);
      if (cy < this.rows - 1) this.bump(i + this.cols, side);
    }
  },

  /** Bounds of a cell, for drawing. */
  cellRect(i) {
    const cx = i % this.cols, cy = (i / this.cols) | 0;
    return { x: this.originX + cx * this.CELL,
             y: this.originY + cy * this.CELL,
             w: this.CELL, h: this.CELL };
  },
};
