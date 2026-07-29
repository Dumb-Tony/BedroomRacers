/* =============================================================================
   GHOST — records POSITIONS, not inputs.
   =============================================================================
   15_Save_System.md proposed storing inputs rather than positions, on the
   grounds that inputs are smaller and the simulation is deterministic. Both
   halves of that turned out to be wrong, and it was built the other way first
   before being measured:

   1. INPUT REPLAY DIVERGES. Determinism holds for bit-identical inputs, but a
      ghost has to be STORED, and storing steer costs bytes. Quantised to 1/100
      the error is invisible for a few seconds and catastrophic over ninety —
      measured worst-case deviation was 3514 units, most of the width of the
      rug. Steering is chaotically sensitive: two cars a hundredth of a degree
      apart take different lines through a corner, and it compounds.

   2. INPUTS ARE NOT SMALLER. Inputs must be captured every tick — 2 bytes at
      60Hz is 120 bytes/sec. Positions can be sampled at 10Hz and interpolated:
      5 bytes at 10Hz is 50 bytes/sec. Less than half, and exact.

   So a ghost is an animation, not a re-simulation. It is not driven through
   VehicleController at all, which also removes any chance of it perturbing the
   live race.

   Encoding, five bytes per sample at 10Hz:
     int16  x
     int16  y
     uint8  heading, 256 steps (1.4 degrees — invisible at this size)

   About 4.5KB for a ninety-second run, 6KB base64'd. Stored under its own key
   so it can be dropped independently when quota is tight.
   ========================================================================== */

window.BR = window.BR || {};

BR.Ghost = {

  KEY_PREFIX: 'bedroomracers.ghost.',
  RATE: 10,                    // samples per second
  MAX_SAMPLES: 10 * 60 * 6,    // six minutes; a runaway recording is a bug

  recording: null,
  playback: null,

  /* ── recording ─────────────────────────────────────────────────────────── */

  startRecording() {
    this.recording = { x: [], y: [], h: [], n: 0, tick: 0, interval: 0 };
  },

  /**
   * Called once per simulation tick with the vehicle and the timestep.
   *
   * Counts TICKS rather than accumulating seconds. A float accumulator looks
   * equivalent and is not: 6 * (1/60) is 0.09999999999999999, which is less
   * than 0.1, so a "sample every 0.1s" test silently needs a seventh tick and
   * records at 8.7Hz instead of 10. apply() then maps race time to the wrong
   * sample and the ghost drifts steadily out of sync — it recorded 75.8
   * seconds of an 87 second run before this was caught.
   */
  capture(v, dt) {
    const r = this.recording;
    if (!r || r.n >= this.MAX_SAMPLES) return;
    if (!r.interval) r.interval = Math.max(1, Math.round((1 / this.RATE) / dt));
    const due = (r.tick % r.interval) === 0;
    r.tick++;
    if (!due) return;
    r.x.push(Math.round(v.x));
    r.y.push(Math.round(v.y));
    r.h.push(Math.round(((v.heading % (Math.PI * 2)) + Math.PI * 2) %
                        (Math.PI * 2) / (Math.PI * 2) * 255) & 255);
    r.n++;
  },

  stopRecording() {
    const r = this.recording;
    this.recording = null;
    return r;
  },

  encode(rec) {
    if (!rec || !rec.n) return null;
    const bytes = new Uint8Array(rec.n * 5);
    const dv = new DataView(bytes.buffer);
    for (let i = 0; i < rec.n; i++) {
      dv.setInt16(i * 5, rec.x[i], true);
      dv.setInt16(i * 5 + 2, rec.y[i], true);
      bytes[i * 5 + 4] = rec.h[i];
    }
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(s);
  },

  decode(b64) {
    if (!b64) return null;
    let bin;
    try { bin = atob(b64); } catch (e) { return null; }
    const n = Math.floor(bin.length / 5);
    if (n < 2) return null;
    const bytes = new Uint8Array(n * 5);
    for (let i = 0; i < n * 5; i++) bytes[i] = bin.charCodeAt(i);
    const dv = new DataView(bytes.buffer);
    const x = new Int16Array(n), y = new Int16Array(n), h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = dv.getInt16(i * 5, true);
      y[i] = dv.getInt16(i * 5 + 2, true);
      h[i] = (bytes[i * 5 + 4] / 255) * Math.PI * 2;
    }
    return { x: x, y: y, h: h, n: n };
  },

  /* ── storage — its own key, droppable independently ────────────────────── */

  key(trackId, vehicleId) {
    return this.KEY_PREFIX + trackId + '.' + vehicleId;
  },

  store(trackId, vehicleId, rec, time) {
    if (!BR.SaveManager.storageOk || !rec) return false;
    const existing = this.best(trackId, vehicleId);
    if (existing && existing.time <= time) return false;   // slower — keep the old one
    const payload = this.encode(rec);
    if (!payload) return false;
    try {
      window.localStorage.setItem(this.key(trackId, vehicleId),
        JSON.stringify({ time: time, data: payload }));
      return true;
    } catch (e) {
      return false;   // quota — a ghost is the first thing worth losing
    }
  },

  best(trackId, vehicleId) {
    if (!BR.SaveManager.storageOk) return null;
    try {
      const raw = window.localStorage.getItem(this.key(trackId, vehicleId));
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o.time !== 'number' || !o.data) return null;
      return o;
    } catch (e) {
      return null;   // a corrupt ghost is not worth a crash
    }
  },

  clear(trackId, vehicleId) {
    try { window.localStorage.removeItem(this.key(trackId, vehicleId)); } catch (e) {}
  },

  /* ── playback ──────────────────────────────────────────────────────────── */

  load(trackId, vehicleId) {
    const stored = this.best(trackId, vehicleId);
    if (!stored) { this.playback = null; return null; }
    const dec = this.decode(stored.data);
    if (!dec) { this.playback = null; return null; }
    this.playback = { rec: dec, time: stored.time };
    return this.playback;
  },

  hasGhost() { return !!this.playback; },

  /**
   * Position the ghost vehicle at race time `t`. Interpolated between samples,
   * so 10Hz storage still moves smoothly at any frame rate.
   * @returns {boolean} false once the ghost has finished its run
   */
  apply(v, t) {
    const p = this.playback;
    if (!p) return false;
    const rec = p.rec;

    const f = t * this.RATE;
    const i0 = Math.floor(f);
    if (i0 >= rec.n - 1) {
      v.x = rec.x[rec.n - 1];
      v.y = rec.y[rec.n - 1];
      v.heading = rec.h[rec.n - 1];
      v.prevX = v.x; v.prevY = v.y; v.prevHeading = v.heading;
      return false;
    }
    if (i0 < 0) return true;

    const i1 = i0 + 1, lt = f - i0;
    v.prevX = v.x; v.prevY = v.y; v.prevHeading = v.heading;
    v.x = rec.x[i0] + (rec.x[i1] - rec.x[i0]) * lt;
    v.y = rec.y[i0] + (rec.y[i1] - rec.y[i0]) * lt;
    v.heading = rec.h[i0] + BR.M.wrapAngle(rec.h[i1] - rec.h[i0]) * lt;
    return true;
  },
};
