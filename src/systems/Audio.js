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

   Three rules this module obeys:

   - It NEVER runs inside the fixed simulation step. Audio observes state and
     detects edges once per rendered frame. Firing sounds from inside the step
     would trigger them several times per frame and couple audio to physics,
     which would break the determinism Time Trial ghosts depend on.

   - EVERY HUMAN GETS A CHANNEL. In split screen both players are "the player",
     so each has their own engine, tyres, drift and collisions, panned to match
     their side of the screen. Player two racing in player one's soundtrack was
     the state of things before this.

   - Opponents stay cheap. Each channel collapses the whole AI field into ONE
     proximity layer; six cars with full voices would swamp the mix and the CPU.

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

  MAX_CHANNELS: 4,
  channels: null,

  prev: null,          // global race state, not per player
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

      // Both channels are built up front and silenced when unused. Creating
      // them on demand would allocate mid-race, and reconnecting a running
      // graph clicks.
      this.channels = [];
      for (let i = 0; i < this.MAX_CHANNELS; i++) this.channels.push(this.makeChannel());

      this.prev = null;
      this.ready = true;
    } catch (e) {
      this.failed = true;
    }
  },

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

  /* One player's entire soundstage: their car, their tyres, their rivals. */
  makeChannel() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 1;

    let panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      out.connect(panner);
      panner.connect(this.sfxBus);
    } else {
      out.connect(this.sfxBus);   // older browsers just get it centred
    }

    return {
      out: out, panner: panner,
      engine:   this.makeEngine(out),
      rattle:   this.makeNoiseVoice(900, 1.2, out),
      drift:    this.makeNoiseVoice(1600, 4.0, out),
      boostAir: this.makeNoiseVoice(700, 0.9, out),
      pack:     this.makeEngine(out),
      prev: null,
    };
  },

  setPan(ch, pan) {
    if (ch.panner) ch.panner.pan.value = pan;
  },

  /** Route a one-shot to a given human's channel. Falls back to centre. */
  channelOut(humanIndex) {
    if (!this.ready || !this.channels) return null;
    const ch = this.channels[humanIndex || 0];
    return ch ? ch.out : null;
  },

  /* Toy motor: two detuned saws through a lowpass. Small and buzzy rather than
     throaty — this is a three-inch car, not a V8. */
  makeEngine(dest) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(dest);
    o1.frequency.value = 70; o2.frequency.value = 71.5;
    o1.start(); o2.start();
    return { o1: o1, o2: o2, filt: filt, gain: g };
  },

  makeNoiseVoice(freq, q, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start();
    return { src: src, filt: filt, gain: g };
  },

  /* ── one-shots. `dest` routes to a player's channel; omit for centre. ──── */

  blip(freq, dur, type, vol, sweepTo, dest) {
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
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  },

  thud(vol, freq, dur, q, dest) {
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
    src.connect(filt); filt.connect(g); g.connect(dest || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  },

  /* Collisions are playful, not violent. Severity picks pitch and length, so a
     graze ticks and a square hit clunks — 02_Mechanics.md. */
  collide(severity, dest) {
    const s = Math.max(0, Math.min(1, severity));
    this.thud(0.10 + 0.35 * s, 420 - 220 * s, 0.09 + 0.16 * s, 1.2, dest);
    if (s > 0.55) this.blip(180 + 60 * (1 - s), 0.16, 'triangle', 0.13, 90, dest);
  },

  /* THE most important sound in the game (13_Audio.md). Must be unmistakable
     without looking, and clearly different from "boost available". */
  boostFull(dest)  { this.blip(880, 0.12, 'triangle', 0.2, 1320, dest); },
  boostReady(dest) { this.blip(560, 0.07, 'sine', 0.11, null, dest); },
  boostFire(dest) {
    this.blip(300, 0.32, 'sawtooth', 0.16, 900, dest);
    this.thud(0.18, 1400, 0.3, 0.7, dest);
  },

  landing(clean, dest) {
    if (clean) {
      this.thud(0.2, 900, 0.09, 2.2, dest);
      this.blip(1200, 0.1, 'sine', 0.13, 1700, dest);
    } else {
      this.thud(0.3, 260, 0.19, 1.0, dest);
    }
  },

  checkpoint(dest) { this.blip(1000, 0.05, 'sine', 0.07, null, dest); },
  lap(isFinal, dest) {
    this.blip(700, 0.1, 'triangle', 0.16, 1050, dest);
    if (isFinal) {
      const s = this;
      setTimeout(function () { s.blip(1050, 0.16, 'triangle', 0.16, 1400, dest); }, 110);
    }
  },
  pad(dest) { this.blip(760, 0.09, 'sine', 0.12, 1140, dest); },

  // Race-wide, so centred rather than on anyone's channel.
  countdownTick() { this.blip(520, 0.13, 'square', 0.13); },
  go()            { this.blip(880, 0.3, 'square', 0.17, 1320); },
  finish(won) {
    const s = this;
    const notes = won ? [660, 880, 1100, 1320] : [660, 560, 500];
    notes.forEach(function (f, i) {
      setTimeout(function () { s.blip(f, 0.22, 'triangle', 0.16); }, i * 110);
    });
  },

  /* ── per-frame ─────────────────────────────────────────────────────────── */

  /**
   * Observes state and detects edges. Called ONCE per rendered frame, never
   * from inside the fixed simulation step.
   */
  update(game, dt) {
    if (!this.ready || this.ctx.state !== 'running') return;

    const RM = BR.RaceManager;
    const racing = RM && RM.racers && RM.state === RM.STATE.RACING;
    const engOn = racing || (RM && RM.state === RM.STATE.FINISHED);

    const humans = [];
    for (let i = 0; i < game.racers.length; i++) {
      if (game.racers[i].isPlayer) humans.push(game.racers[i]);
    }

    // Pan each channel to where its viewport actually is, rather than by index.
    // That way two side by side spread wide, four in quadrants pan by column,
    // and one sits centre — all from the same rule.
    const screenW = BR.Renderer.w || 1280;
    for (let i = 0; i < this.channels.length; i++) {
      const view = game.views && game.views[i];
      let pan = 0;
      if (view && humans.length > 1) {
        const centre = (view.x + view.w / 2) / screenW;
        pan = Math.max(-1, Math.min(1, (centre * 2 - 1) * 1.1));
      }
      this.setPan(this.channels[i], pan);
    }

    for (let i = 0; i < this.channels.length; i++) {
      const ch = this.channels[i];
      if (i < humans.length) this.updateChannel(ch, humans[i], game, racing, engOn);
      else this.silence(ch);
    }

    this.updateRace(RM);
    this.music(racing, RM);
  },

  silence(ch) {
    const now = this.ctx.currentTime;
    ch.engine.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.rattle.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.drift.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.boostAir.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.pack.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.prev = null;
  },

  updateChannel(ch, racer, game, racing, engOn) {
    const v = racer.vehicle;
    const P = BR.PHYSICS;
    const now = this.ctx.currentTime;
    const dest = ch.out;

    const speed = Math.hypot(v.vel.x, v.vel.y);
    const ratio = Math.min(1, speed / v.spec.maxSpeed);

    if (!ch.prev) {
      ch.prev = { boost: v.boostMeter, boosting: v.boosting, grounded: v.grounded,
                  impacts: v.impacts || 0, cps: racer.cpsPassed, lap: racer.lap };
    }
    const p = ch.prev;

    // ── engine ────────────────────────────────────────────────────────────
    const base = 62 + ratio * 210 + (v.boosting ? 40 : 0);
    ch.engine.o1.frequency.setTargetAtTime(base, now, 0.05);
    ch.engine.o2.frequency.setTargetAtTime(base * 1.012, now, 0.05);
    ch.engine.filt.frequency.setTargetAtTime(600 + ratio * 1500, now, 0.08);
    ch.engine.gain.gain.setTargetAtTime(engOn ? 0.035 + ratio * 0.05 : 0, now, 0.1);

    // ── surface ───────────────────────────────────────────────────────────
    // The tyre note must change the instant the surface does, so the player
    // learns the map by feel (13_Audio.md).
    const rough = v.surface === 'rugGrass' ? 1 : 0.32;
    ch.rattle.filt.frequency.setTargetAtTime(
      v.surface === 'rugGrass' ? 420 : 1100, now, 0.05);
    ch.rattle.gain.gain.setTargetAtTime(
      v.grounded && engOn ? ratio * 0.05 * rough : 0, now, 0.06);

    // ── drift: pitch tracks slip, so how hard you slide is audible ────────
    const slip = Math.min(1, v.slip / 0.9);
    ch.drift.filt.frequency.setTargetAtTime(1200 + slip * 1400, now, 0.04);
    ch.drift.gain.gain.setTargetAtTime(
      v.grounded && racing ? slip * ratio * 0.11 : 0, now, 0.05);

    // ── boost ─────────────────────────────────────────────────────────────
    ch.boostAir.gain.gain.setTargetAtTime(v.boosting ? 0.07 : 0, now, 0.06);
    ch.boostAir.filt.frequency.setTargetAtTime(v.boosting ? 1500 : 700, now, 0.15);

    if (v.boosting && !p.boosting) this.boostFire(dest);
    if (v.boostMeter >= 1 && p.boost < 1) this.boostFull(dest);
    else if (v.boostMeter >= P.boostMinToFire && p.boost < P.boostMinToFire) {
      this.boostReady(dest);
    }
    if (v.boostMeter - p.boost > 0.25) this.pad(dest);

    // ── landing and collisions ────────────────────────────────────────────
    if (v.grounded && !p.grounded) this.landing(v.lastLanding === 'clean', dest);
    const impacts = v.impacts || 0;
    if (impacts > p.impacts) this.collide(v.lastImpact || 0.4, dest);

    // ── this player's own progress ────────────────────────────────────────
    if (racer.cpsPassed > p.cps && racer.lap === p.lap) this.checkpoint(dest);
    if (racer.lap > p.lap) {
      this.lap(BR.RaceManager && racer.lap === BR.RaceManager.laps - 1, dest);
    }

    // ── rivals: ONE proximity layer, measured from THIS player ────────────
    let nearest = Infinity, nearSpeed = 0;
    for (let i = 0; i < game.vehicles.length; i++) {
      const o = game.vehicles[i];
      if (o === v) continue;
      const d = Math.hypot(o.x - v.x, o.y - v.y);
      if (d < nearest) { nearest = d; nearSpeed = Math.hypot(o.vel.x, o.vel.y); }
    }
    const near = nearest < 460 ? 1 - nearest / 460 : 0;
    const nr = Math.min(1, nearSpeed / 350);
    ch.pack.o1.frequency.setTargetAtTime(58 + nr * 180, now, 0.08);
    ch.pack.o2.frequency.setTargetAtTime(58 * 1.02 + nr * 180, now, 0.08);
    ch.pack.gain.gain.setTargetAtTime(engOn ? near * near * 0.03 : 0, now, 0.12);

    p.boost = v.boostMeter; p.boosting = v.boosting;
    p.grounded = v.grounded; p.impacts = impacts;
    p.cps = racer.cpsPassed; p.lap = racer.lap;
  },

  /* Countdown, GO and the finish fanfare belong to the race, not to a player,
     so they stay centred and fire once however many people are playing. */
  updateRace(RM) {
    if (!RM || !RM.racers) return;
    if (!this.prev) this.prev = { countdown: 99, state: '' };
    const p = this.prev;

    if (RM.state === RM.STATE.COUNTDOWN) {
      // Re-arm on ENTERING the countdown. Without this the tracker stays at
      // the -1 left by the previous race's GO, every later countdown fails the
      // n < previous test, and the lights go out in silence from the second
      // race of a session onwards.
      if (p.state !== RM.STATE.COUNTDOWN) p.countdown = 99;

      const n = Math.ceil(RM.countdown);
      if (n < p.countdown) { if (n > 0) this.countdownTick(); p.countdown = n; }
    } else if (p.countdown !== -1 && p.state === RM.STATE.COUNTDOWN) {
      this.go(); p.countdown = -1;
    }
    if (RM.state === RM.STATE.FINISHED && p.state !== RM.STATE.FINISHED) {
      this.finish(RM.player().position === 1);
    }
    p.state = RM.state;
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
      if (finalLap && s % 4 === 2) this.note(196, t, 0.14, 'triangle', 0.07);

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
