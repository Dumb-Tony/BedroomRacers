/* =============================================================================
   AUDIO — everything synthesised, no sample files.
   =============================================================================
   Not a stylistic choice: a published build runs under a strict CSP with no
   external requests, so there is nothing to load. Web Audio it is.

   13_Audio.md ranks the three jobs, and the order matters because the first is
   the one that gets cut under deadline pressure:

     1. GAMEPLAY FEEDBACK — surface, drift, boost readiness, collisions
     2. SCALE — small plastic sounds in a large room
     3. MOOD

   Two rules this module obeys:

   - It NEVER runs inside the fixed simulation step. Audio observes state and
     detects edges once per rendered frame. Firing sounds from inside the sim
     would trigger them several times per frame and couple audio to physics,
     which would break determinism (15_Save_System.md needs it for ghosts).

   - The player is always louder than the field. Six cars each with a full
     engine, drift and collision voice would overwhelm both the mix and the
     CPU, so opponents share ONE proximity layer.

   Browsers block audio until a user gesture. resume() is safe to call as often
   as you like and is wired to the first click or keypress.
   ========================================================================== */

window.BR = window.BR || {};

BR.Audio = {

  ctx: null,
  ready: false,
  failed: false,

  sfxVolume: 0.8,
  musicVolume: 0.32,
  musicEnabled: true,

  master: null, sfxBus: null, musicBus: null,
  noiseBuf: null,

  // continuous voices, created once and left running at zero gain — cheaper
  // than allocating per frame, and it avoids clicks on start and stop
  engine: null, rattle: null, drift: null, pack: null, boostAir: null,

  // edge-detection state
  prev: null,
  musicNext: 0,
  musicStep: 0,

  /* ── setup ─────────────────────────────────────────────────────────────── */

  init() {
    if (this.ctx || this.failed) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.failed = true; return; }
      const ctx = this.ctx = new AC();

      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.musicBus.connect(this.master);

      // One second of white noise, reused by every noise voice.
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.engine   = this.makeEngine();
      this.rattle   = this.makeNoiseVoice(900, 1.2);
      this.drift    = this.makeNoiseVoice(1600, 4.0);
      this.boostAir = this.makeNoiseVoice(700, 0.9);
      this.pack     = this.makeEngine();

      this.prev = null;
      this.ready = true;
    } catch (e) {
      this.failed = true;
    }
  },

  /* Browsers suspend audio until the user interacts. Safe to call repeatedly. */
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(function () {});
    }
  },

  setVolumes(sfx, music) {
    if (sfx !== undefined) this.sfxVolume = sfx;
    if (music !== undefined) this.musicVolume = music;
    if (!this.ready) return;
    this.sfxBus.gain.value = this.sfxVolume;
    this.musicBus.gain.value = this.musicEnabled ? this.musicVolume : 0;
  },

  /* Toy motor: two detuned saws through a lowpass. Small and buzzy rather than
     throaty — this is a three-inch car, not a V8. */
  makeEngine() {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(this.sfxBus);
    o1.frequency.value = 70; o2.frequency.value = 71.5;
    o1.start(); o2.start();
    return { o1: o1, o2: o2, filt: filt, gain: g };
  },

  makeNoiseVoice(freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(this.sfxBus);
    src.start();
    return { src: src, filt: filt, gain: g };
  },

  /* ── one-shots ─────────────────────────────────────────────────────────── */

  blip(freq, dur, type, vol, sweepTo) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol === undefined ? 0.25 : vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  },

  thud(vol, freq, dur, q) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.4), t + dur);
    filt.Q.value = q || 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  },

  /* Collisions are playful, not violent. Severity picks pitch and length, so a
     graze ticks and a square hit clunks — 02_Mechanics.md. */
  collide(severity) {
    const s = Math.max(0, Math.min(1, severity));
    this.thud(0.10 + 0.35 * s, 420 - 220 * s, 0.09 + 0.16 * s, 1.2);
    if (s > 0.55) this.blip(180 + 60 * (1 - s), 0.16, 'triangle', 0.13, 90);
  },

  /* THE most important sound in the game (13_Audio.md). Must be unmistakable
     without looking, and clearly different from "boost available". */
  boostFull() { this.blip(880, 0.12, 'triangle', 0.2, 1320); },
  boostReady() { this.blip(560, 0.07, 'sine', 0.11); },
  boostFire() {
    this.blip(300, 0.32, 'sawtooth', 0.16, 900);
    this.thud(0.18, 1400, 0.3, 0.7);
  },

  landing(clean) {
    if (clean) { this.thud(0.2, 900, 0.09, 2.2); this.blip(1200, 0.1, 'sine', 0.13, 1700); }
    else { this.thud(0.3, 260, 0.19, 1.0); }
  },

  checkpoint() { this.blip(1000, 0.05, 'sine', 0.07); },
  lap(isFinal) {
    this.blip(700, 0.1, 'triangle', 0.16, 1050);
    if (isFinal) { const s = this; setTimeout(function () { s.blip(1050, 0.16, 'triangle', 0.16, 1400); }, 110); }
  },
  countdownTick() { this.blip(520, 0.13, 'square', 0.13); },
  go()            { this.blip(880, 0.3, 'square', 0.17, 1320); },
  finish(won) {
    const s = this;
    const notes = won ? [660, 880, 1100, 1320] : [660, 560, 500];
    notes.forEach(function (f, i) {
      setTimeout(function () { s.blip(f, 0.22, 'triangle', 0.16); }, i * 110);
    });
  },
  pad() { this.blip(760, 0.09, 'sine', 0.12, 1140); },

  /* ── per-frame ─────────────────────────────────────────────────────────── */

  /**
   * Observes state and detects edges. Called ONCE per rendered frame, never
   * from inside the fixed simulation step.
   */
  update(game, dt) {
    if (!this.ready || this.ctx.state !== 'running') return;

    const v = game.vehicle;
    const RM = BR.RaceManager;
    const P = BR.PHYSICS;
    const speed = Math.hypot(v.vel.x, v.vel.y);
    const ratio = Math.min(1, speed / v.spec.maxSpeed);
    const now = this.ctx.currentTime;
    const racing = RM && RM.racers && RM.state === RM.STATE.RACING;

    if (!this.prev) {
      this.prev = {
        boost: v.boostMeter, boosting: v.boosting, grounded: v.grounded,
        impacts: v.impacts || 0, landingFlash: v.landingFlash,
        cps: 0, lap: 0, countdown: 99, state: '',
      };
    }
    const p = this.prev;

    // ── engine ────────────────────────────────────────────────────────────
    // Silent on the grid so the countdown is clean.
    const engOn = racing || RM.state === RM.STATE.FINISHED;
    const base = 62 + ratio * 210 + (v.boosting ? 40 : 0);
    this.engine.o1.frequency.setTargetAtTime(base, now, 0.05);
    this.engine.o2.frequency.setTargetAtTime(base * 1.012, now, 0.05);
    this.engine.filt.frequency.setTargetAtTime(600 + ratio * 1500, now, 0.08);
    this.engine.gain.gain.setTargetAtTime(engOn ? 0.035 + ratio * 0.05 : 0, now, 0.1);

    // ── surface ───────────────────────────────────────────────────────────
    // The tyre note must change the instant the surface does, so the player
    // learns the map by feel (13_Audio.md).
    const rough = v.surface === 'rugGrass' ? 1 : 0.32;
    this.rattle.filt.frequency.setTargetAtTime(
      v.surface === 'rugGrass' ? 420 : 1100, now, 0.05);
    this.rattle.gain.gain.setTargetAtTime(
      v.grounded && engOn ? ratio * 0.05 * rough : 0, now, 0.06);

    // ── drift ─────────────────────────────────────────────────────────────
    // Pitch tracks slip angle, so how hard you are sliding is audible.
    const slip = Math.min(1, v.slip / 0.9);
    this.drift.filt.frequency.setTargetAtTime(1200 + slip * 1400, now, 0.04);
    this.drift.gain.gain.setTargetAtTime(
      v.grounded && racing ? slip * ratio * 0.11 : 0, now, 0.05);

    // ── boost ─────────────────────────────────────────────────────────────
    this.boostAir.gain.gain.setTargetAtTime(v.boosting ? 0.07 : 0, now, 0.06);
    this.boostAir.filt.frequency.setTargetAtTime(v.boosting ? 1500 : 700, now, 0.15);

    if (v.boosting && !p.boosting) this.boostFire();

    // Meter thresholds. Rising only — the sound marks earning it, not spending.
    if (v.boostMeter >= 1 && p.boost < 1) this.boostFull();
    else if (v.boostMeter >= P.boostMinToFire && p.boost < P.boostMinToFire) this.boostReady();
    // A pad grants a big jump all at once.
    if (v.boostMeter - p.boost > 0.25) this.pad();

    // ── landing ───────────────────────────────────────────────────────────
    if (v.grounded && !p.grounded) this.landing(v.lastLanding === 'clean');

    // ── collisions ────────────────────────────────────────────────────────
    const impacts = v.impacts || 0;
    if (impacts > p.impacts) this.collide(v.lastImpact || 0.4);

    // ── opponents: one shared proximity layer, never a voice each ─────────
    let nearest = Infinity, nearSpeed = 0;
    for (let i = 0; i < game.vehicles.length; i++) {
      const o = game.vehicles[i];
      if (o === v) continue;
      const d = Math.hypot(o.x - v.x, o.y - v.y);
      if (d < nearest) { nearest = d; nearSpeed = Math.hypot(o.vel.x, o.vel.y); }
    }
    const near = nearest < 460 ? 1 - nearest / 460 : 0;
    const nr = Math.min(1, nearSpeed / 350);
    this.pack.o1.frequency.setTargetAtTime(58 + nr * 180, now, 0.08);
    this.pack.o2.frequency.setTargetAtTime(58 * 1.02 + nr * 180, now, 0.08);
    this.pack.gain.gain.setTargetAtTime(engOn ? near * near * 0.03 : 0, now, 0.12);

    // ── race events ───────────────────────────────────────────────────────
    if (RM && RM.racers) {
      const me = RM.player();
      if (me.cpsPassed > p.cps && me.lap === p.lap) this.checkpoint();
      if (me.lap > p.lap) this.lap(me.lap === RM.laps - 1);
      p.cps = me.cpsPassed; p.lap = me.lap;

      if (RM.state === RM.STATE.COUNTDOWN) {
        const n = Math.ceil(RM.countdown);
        if (n < p.countdown) { if (n > 0) this.countdownTick(); p.countdown = n; }
      } else if (p.countdown !== -1 && p.state === RM.STATE.COUNTDOWN) {
        this.go(); p.countdown = -1;
      }
      if (RM.state === RM.STATE.FINISHED && p.state !== RM.STATE.FINISHED) {
        this.finish(me.position === 1);
      }
      p.state = RM.state;
    }

    p.boost = v.boostMeter; p.boosting = v.boosting;
    p.grounded = v.grounded; p.impacts = impacts;

    this.music(racing, RM);
  },

  /* ── music ─────────────────────────────────────────────────────────────
     Sparse toy percussion over a pulse. Toy percussion is the connective
     tissue across every world in 13_Audio.md, so it is what a procedural bed
     should be made of. Deliberately thin — a dense generative loop grates
     long before a race is over.

     Scheduled against the audio clock, not setInterval, so it does not drift. */
  SCALE: [0, 3, 5, 7, 10, 12, 15],

  music(racing, RM) {
    if (!this.musicEnabled || this.musicVolume <= 0) return;
    const ctx = this.ctx;
    if (!racing) { this.musicNext = 0; return; }

    const finalLap = RM && RM.player().lap === RM.laps - 1;
    const beat = finalLap ? 0.208 : 0.227;   // a small lift for the last lap
    // Resync if we have fallen behind — a backgrounded tab stops calling
    // update() while the audio clock keeps running, and without this the
    // catch-up loop would schedule every missed note at once.
    if (this.musicNext === 0 || this.musicNext < ctx.currentTime - 0.5) {
      this.musicNext = ctx.currentTime + 0.08;
    }

    while (this.musicNext < ctx.currentTime + 0.3) {
      const t = this.musicNext;
      const s = this.musicStep;

      if (s % 4 === 0) this.note(110, t, 0.22, 'triangle', 0.16);          // pulse
      if (s % 8 === 2 || s % 8 === 6) this.noiseHit(t, 0.05, 0.06);        // shaker
      if (s % 2 === 0) {
        const deg = this.SCALE[(s * 3 + (s % 6)) % this.SCALE.length];
        this.note(392 * Math.pow(2, deg / 12), t, 0.16, 'sine', 0.09);     // xylophone
      }
      if (finalLap && s % 4 === 2) {
        this.note(196, t, 0.14, 'triangle', 0.07);
      }

      this.musicStep = (s + 1) % 64;
      this.musicNext += beat;
    }
  },

  note(freq, at, dur, type, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(this.musicBus);
    o.start(at); o.stop(at + dur + 0.02);
  },

  noiseHit(at, dur, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(at); src.stop(at + dur + 0.02);
  },
};
