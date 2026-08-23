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

  /* ── PER-VEHICLE MATERIAL ─────────────────────────────────────────────────
     09_Vehicles.md: "Each should bring a MATERIAL as much as a stat spread —
     the wooden car should feel and sound wooden. Material is characterisation."
     13_Audio.md then names four and what each should do:

       die-cast metal  heavier, ringing impacts, low rattle
       glossy plastic  light, hollow, clattering
       wood            dull knock, no ring
       wind-up         mechanical ratchet under the engine

     GLOSSY PLASTIC IS THE REFERENCE, and its numbers are exactly what shipped
     before this table existed — most of the roster is a plastic toy car, so
     the common case must not change. The other three are defined against it,
     the same way the town rug is the reference for the three music beds.

     WHAT A MATERIAL MAY NOT TOUCH. Audio's first job is gameplay feedback and
     its third is mood (13_Audio.md ranks them), so material only ever changes
     the mood layer of a cue and never the part carrying information:

       - Engine pitch still tracks speed; material shifts the whole curve by a
         constant, so "faster is higher" survives.
       - The rug/road tyre split is still 420 vs 1100 scaled together, so
         leaving the road is exactly as audible in every car.
       - Drift is untouched. That is tyres against the FLOOR — it belongs to
         the surface, not to the shell.
       - The clean-landing chime is untouched. It is the cue that says the
         landing was clean, and a car you cannot hear it on would be a car
         punished for its material.

     `pitch`, `cut*`, `rattle*` and `hit*` are multipliers on the shipped
     values; `ring`, `clatter` and `ratchet` are additions that only some
     materials have at all. */
  MATERIALS: {
    /* Light, hollow, clattering — and the fallback for anything undeclared. */
    plastic: {
      id: 'plastic', label: 'glossy plastic',
      o1: 'sawtooth', o2: 'square',     // square is the hollow half
      detune: 1.012, engQ: 3.0, pitch: 1.00,
      cutBase: 600, cutSpan: 1500, engGain: 1.00,
      rattleHz: 1.00, rattleQ: 1.2, rattleGain: 1.00,
      hitHz: 1.00, hitLen: 1.00, hitQ: 1.4, hitGain: 1.00, hitTone: 'triangle',
      ringHz: 0, ringDur: 0,
      clatter: 2,                       // the loose pieces, after the hit
      ratchet: 0, rateBase: 0, rateSpan: 0, clickHz: 2600, clickQ: 7,
    },
    /* Die-cast: heavier, ringing impacts, low rattle. Two saws rather than a
       saw and a square, because the square is what makes plastic sound empty
       and a metal car is not. Tighter detune, so it beats slowly instead of
       warbling; a higher Q for the resonance a metal shell has. */
    metal: {
      id: 'metal', label: 'die-cast metal',
      o1: 'sawtooth', o2: 'sawtooth',
      detune: 1.006, engQ: 4.5, pitch: 0.90,
      cutBase: 520, cutSpan: 1150, engGain: 1.10,
      rattleHz: 0.60, rattleQ: 2.6, rattleGain: 1.15,
      hitHz: 0.86, hitLen: 1.50, hitQ: 3.2, hitGain: 1.20, hitTone: 'triangle',
      ringHz: 2100, ringDur: 0.45,      // the whole point of this row
      clatter: 0,
      ratchet: 0, rateBase: 0, rateSpan: 0, clickHz: 2600, clickQ: 7,
    },
    /* Wood: dull knock, no ring. Everything that could resonate is taken away
       — lowest cutoff on the roster, Q under 1 in both the body and the hit,
       no ring partial and no clatter. The knock is also the SHORTEST, because
       what makes wood sound like wood is how fast it stops. */
    wood: {
      id: 'wood', label: 'wood',
      o1: 'triangle', o2: 'sawtooth',
      detune: 1.021, engQ: 1.4, pitch: 0.94,
      cutBase: 420, cutSpan: 900, engGain: 0.92,
      rattleHz: 0.78, rattleQ: 0.7, rattleGain: 0.85,
      hitHz: 0.72, hitLen: 0.55, hitQ: 0.8, hitGain: 0.95, hitTone: 'sine',
      ringHz: 0, ringDur: 0,
      clatter: 0,
      ratchet: 0, rateBase: 0, rateSpan: 0, clickHz: 2600, clickQ: 7,
    },
    /* Wind-up: a mechanical ratchet under the engine. Tin, so both oscillators
       are squares and the detune is the widest here — a wind-up toy is not in
       tune with itself. The ratchet rate tracks speed, which is the sound of a
       spring unwinding faster. */
    windup: {
      id: 'windup', label: 'wind-up tin',
      o1: 'square', o2: 'square',
      detune: 1.030, engQ: 2.2, pitch: 1.08,
      cutBase: 700, cutSpan: 1700, engGain: 0.95,
      rattleHz: 1.18, rattleQ: 1.9, rattleGain: 1.00,
      hitHz: 1.06, hitLen: 0.85, hitQ: 2.0, hitGain: 0.90, hitTone: 'square',
      ringHz: 0, ringDur: 0,
      clatter: 1,                       // one tick: the mechanism jolting
      ratchet: 0.055, rateBase: 9, rateSpan: 30, clickHz: 2600, clickQ: 7,
    },
  },

  /** A spec's material, or plastic. An undeclared car is a plastic toy car —
      the roster's common case — never a silent one. */
  materialFor(spec) {
    return (spec && this.MATERIALS[spec.material]) || this.MATERIALS.plastic;
  },

  /* Applied on CHANGE, never per frame. Oscillator type and filter Q can be
     set on a running node, so swapping cars re-materialises the existing graph
     rather than rebuilding it — the channels are built up front precisely
     because reconnecting a running graph clicks, and rebuilding one mid-race
     would throw that away. */
  applyMaterial(ch, m) {
    ch.material = m.id;
    ch.engine.o1.type = m.o1;
    ch.engine.o2.type = m.o2;
    ch.engine.filt.Q.value = m.engQ;
    ch.rattle.filt.Q.value = m.rattleQ;
    ch.ratchet.filt.frequency.value = m.clickHz;
    ch.ratchet.filt.Q.value = m.clickQ;
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
      ratchet:  this.makeRatchet(out),
      pack:     this.makeEngine(out),
      // Which material this channel is currently wearing. Null until the first
      // frame, so applyMaterial always runs once.
      material: null,
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

  /* The wind-up ratchet: narrow-banded noise GATED by a square LFO, so the
     click rate is a parameter rather than a schedule.

     Built as a graph on purpose. The obvious implementation is to fire a tick
     per frame at the right interval, and that is exactly the shape of bug the
     counters exist to prevent — it would run on the render clock, drift with
     frame rate, and machine-gun the moment the fixed step ran twice. An LFO
     runs on the audio thread and cannot do any of that.

     The gating trick: an AudioParam's value is its intrinsic value PLUS every
     signal connected to it. Hold both at `a` and a ±a square swings the gain
     between 0 and 2a — silence for half of each period, which is a ratchet. */
  makeRatchet(dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 2600; filt.Q.value = 7;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square'; lfo.frequency.value = 1;
    const amp = ctx.createGain(); amp.gain.value = 0;
    lfo.connect(amp); amp.connect(g.gain);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(); lfo.start();
    return { src: src, filt: filt, gain: g, lfo: lfo, amp: amp };
  },

  /* ── one-shots. `dest` routes to a player's channel; omit for centre. ────
     `delay` schedules against the AUDIO clock, not setTimeout — a clatter is
     several pieces knocking a few tens of milliseconds apart, and setTimeout
     cannot be trusted at that resolution. Optional, so every existing caller
     keeps the timing it had. */

  blip(freq, dur, type, vol, sweepTo, dest, delay) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
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

  thud(vol, freq, dur, q, dest, delay) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
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
     graze ticks and a square hit clunks — 02_Mechanics.md. `mat` is what the
     car is made of; omitted, it is a plastic one. */
  collide(severity, dest, mat) {
    const m = mat || this.MATERIALS.plastic;
    const s = Math.max(0, Math.min(1, severity));
    this.thud((0.10 + 0.35 * s) * m.hitGain, (420 - 220 * s) * m.hitHz,
              (0.09 + 0.16 * s) * m.hitLen, m.hitQ, dest);
    if (s > 0.55) {
      this.blip((180 + 60 * (1 - s)) * m.hitHz, 0.16 * m.hitLen, m.hitTone,
                0.13 * m.hitGain, 90 * m.hitHz, dest);
    }
    this.shell(s, dest, m);
  },

  /* WHAT THE SHELL DOES AFTER THE HIT — the part that is actually the
     material. The thud above is the contact and every car has one; this is the
     object still moving afterwards, and it is where metal, plastic and wood
     stop being the same event at different pitches.

     Wood has neither branch. "Dull knock, no ring" is a statement about what
     is ABSENT, so the wooden car's impact is over when the knock is. */
  shell(s, dest, m) {
    if (m.ringHz) {
      /* Two partials at 1:1.51. An integer ratio reads as a musical note; an
         irrational-ish one reads as struck metal, which is the difference
         between a chime and a die-cast car hitting a skirting board. */
      const v = 0.05 + 0.07 * s, d = m.ringDur * (0.6 + 0.4 * s);
      this.blip(m.ringHz, d, 'sine', v, m.ringHz * 0.86, dest);
      this.blip(m.ringHz * 1.51, d * 0.7, 'sine', v * 0.5, m.ringHz * 1.30, dest);
    }
    // Loose pieces, landing after the car has. Scheduled on the audio clock.
    for (let i = 0; i < m.clatter; i++) {
      this.thud(0.05 + 0.05 * s, 1500 + i * 620, 0.035, 5, dest, 0.045 + i * 0.04);
    }
  },

  /* THE most important sound in the game (13_Audio.md). Must be unmistakable
     without looking, and clearly different from "boost available". */
  boostFull(dest)  { this.blip(880, 0.12, 'triangle', 0.2, 1320, dest); },
  boostReady(dest) { this.blip(560, 0.07, 'sine', 0.11, null, dest); },
  boostFire(dest) {
    this.blip(300, 0.32, 'sawtooth', 0.16, 900, dest);
    this.thud(0.18, 1400, 0.3, 0.7, dest);
  },

  /* A landing is the car hitting the floor, so it takes the material too —
     except for the chime, which does not vary. That chime IS the "you landed
     clean" cue (13_Audio.md's gameplay-critical table), and a car whose
     confirmation was quieter or duller than everyone else's would be a car
     penalised for what it is made of. Character sits on top of readability,
     never instead of it. */
  landing(clean, dest, mat) {
    const m = mat || this.MATERIALS.plastic;
    if (clean) {
      this.thud(0.2 * m.hitGain, 900 * m.hitHz, 0.09 * m.hitLen, 2.2, dest);
      this.blip(1200, 0.1, 'sine', 0.13, 1700, dest);
    } else {
      this.thud(0.3 * m.hitGain, 260 * m.hitHz, 0.19 * m.hitLen, m.hitQ, dest);
      this.shell(0.7, dest, m);
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

  /* ── the quiet features ───────────────────────────────────────────────────
     Items, loops, corkscrews, falling and recovery all shipped silent. They are
     the moments that need sound MOST — a loop taken in silence reads as a
     cutscene, and being hit by something you neither saw nor heard is the exact
     complaint 10_Items.md's design stance exists to prevent.

     Built from the same primitives as everything else (blip, thud), so none of
     it needs a sample file — the CSP would block one anyway (13_Audio.md). */

  // Rising two-tone: you have gained something.
  itemPickup(dest) {
    this.blip(620, 0.06, 'triangle', 0.11, 880, dest);
    this.blip(930, 0.09, 'sine', 0.08, 1240, dest);
  },
  /* Offensive items get a harder edge than helpful ones, so what left the slot
     is audible as well as visible — useful to the person being shot at. */
  itemFire(offensive, dest) {
    if (offensive) this.blip(300, 0.13, 'sawtooth', 0.16, 140, dest);
    else           this.blip(700, 0.11, 'triangle', 0.13, 1100, dest);
  },
  // Being hit. Deliberately close to collide(), because it costs the same.
  itemHit(dest) {
    this.thud(0.20, 150, 0.16, 1.2, dest);
    this.blip(220, 0.12, 'square', 0.10, 110, dest);
  },
  // A shield absorbing something: bright and short, obviously a save.
  shieldPop(dest) { this.blip(1180, 0.07, 'sine', 0.13, 1760, dest); },

  // Boarding a ride. The pitch climb IS the loop.
  railBoard(dest) { this.blip(340, 0.34, 'triangle', 0.14, 900, dest); },
  railExit(dest)  { this.blip(880, 0.12, 'sine', 0.13, 620, dest); },

  /* Going over the edge, and being put back. The fall is a departure; the
     recovery a small mechanical clunk — you were placed, not rescued. */
  fall(dest) { this.blip(660, 0.5, 'sine', 0.15, 120, dest); },
  recover(dest) {
    this.thud(0.16, 190, 0.1, 1.0, dest);
    this.blip(480, 0.08, 'triangle', 0.09, 660, dest);
  },

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
    // Nothing is moving while paused, so a held engine tone would sit there
    // droning at whatever speed the car happened to be doing.
    const paused = !!(BR.Game && BR.Game.paused);
    const racing = !paused && RM && RM.racers && RM.state === RM.STATE.RACING;
    const engOn = !paused && (racing || (RM && RM.state === RM.STATE.FINISHED));

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
    this.ambience(racing);
  },

  silence(ch) {
    const now = this.ctx.currentTime;
    ch.engine.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.rattle.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.drift.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.boostAir.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.pack.gain.gain.setTargetAtTime(0, now, 0.08);
    // The ratchet is gated by two gains summed into one param, so BOTH have to
    // go to zero — leaving the LFO amplitude up would keep it ticking at half
    // level on a silenced channel.
    ch.ratchet.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.ratchet.amp.gain.setTargetAtTime(0, now, 0.08);
    ch.prev = null;
  },

  updateChannel(ch, racer, game, racing, engOn) {
    const v = racer.vehicle;
    const P = BR.PHYSICS;
    const now = this.ctx.currentTime;
    const dest = ch.out;

    const speed = Math.hypot(v.vel.x, v.vel.y);
    const ratio = Math.min(1, speed / v.spec.maxSpeed);

    /* What this car is made of. Cheap to look up every frame, and only
       re-applied when it actually changes — which is at most once a race,
       when a channel starts voicing a different car. */
    const m = this.materialFor(v.spec);
    if (ch.material !== m.id) this.applyMaterial(ch, m);

    if (!ch.prev) {
      ch.prev = { boost: v.boostMeter, boosting: v.boosting, grounded: v.grounded,
                  impacts: v.impacts || 0, cps: racer.cpsPassed, lap: racer.lap,
                  picks: v.itemPickups || 0, fires: v.itemFires || 0,
                  hits: v.stunHits || 0, pops: v.shieldPops || 0,
                  onRail: !!v.rail, recovers: v.recovered || 0,
                  falling: !!v.falling };
    }
    const p = ch.prev;

    // ── engine ────────────────────────────────────────────────────────────
    // The speed curve is unchanged; the material shifts the whole of it, so a
    // heavier car sits lower everywhere without "faster is higher" breaking.
    const base = (62 + ratio * 210 + (v.boosting ? 40 : 0)) * m.pitch;
    ch.engine.o1.frequency.setTargetAtTime(base, now, 0.05);
    ch.engine.o2.frequency.setTargetAtTime(base * m.detune, now, 0.05);
    ch.engine.filt.frequency.setTargetAtTime(m.cutBase + ratio * m.cutSpan, now, 0.08);
    ch.engine.gain.gain.setTargetAtTime(
      engOn ? (0.035 + ratio * 0.05) * m.engGain : 0, now, 0.1);

    /* The ratchet. Silent on everything that is not a wind-up, so this costs
       three parameter writes and no voices on the rest of the roster. Rate
       tracks speed — a spring unwinding faster — and it is a GRAPH, so
       nothing here fires anything; see makeRatchet. */
    const rLevel = (engOn && m.ratchet) ? m.ratchet * (0.45 + 0.55 * ratio) : 0;
    ch.ratchet.lfo.frequency.setTargetAtTime(
      (m.rateBase + ratio * m.rateSpan) || 1, now, 0.08);
    ch.ratchet.gain.gain.setTargetAtTime(rLevel * 0.5, now, 0.07);
    ch.ratchet.amp.gain.setTargetAtTime(rLevel * 0.5, now, 0.07);

    // ── surface ───────────────────────────────────────────────────────────
    // The tyre note must change the instant the surface does, so the player
    // learns the map by feel (13_Audio.md). Material scales BOTH ends of the
    // rug/road split by the same factor, so the size of the change — the part
    // carrying the information — is identical in every car.
    const rough = v.surface === 'rugGrass' ? 1 : 0.32;
    ch.rattle.filt.frequency.setTargetAtTime(
      (v.surface === 'rugGrass' ? 420 : 1100) * m.rattleHz, now, 0.05);
    ch.rattle.gain.gain.setTargetAtTime(
      v.grounded && engOn ? ratio * 0.05 * rough * m.rattleGain : 0, now, 0.06);

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
    // Both take the material: this is the car's own body hitting something.
    if (v.grounded && !p.grounded) this.landing(v.lastLanding === 'clean', dest, m);
    const impacts = v.impacts || 0;
    if (impacts > p.impacts) this.collide(v.lastImpact || 0.4, dest, m);

    /* ── items, rides and falls ───────────────────────────────────────────
       Edge-detected off counters here rather than called from the fixed step,
       for the same reason impacts are: a fixed step can run several times in
       one rendered frame, and firing a sound per sub-step machine-guns it. */
    const picks = v.itemPickups || 0, fires = v.itemFires || 0;
    const hits  = v.stunHits || 0,    pops  = v.shieldPops || 0;
    const recs  = v.recovered || 0;
    if (picks > p.picks) this.itemPickup(dest);
    if (fires > p.fires) this.itemFire(v.lastItemOffensive, dest);
    if (hits  > p.hits)  this.itemHit(dest);
    if (pops  > p.pops)  this.shieldPop(dest);
    if (recs  > p.recovers) this.recover(dest);

    const onRail = !!v.rail;
    if (onRail && !p.onRail)  this.railBoard(dest);
    if (!onRail && p.onRail)  this.railExit(dest);
    if (v.falling && !p.falling) this.fall(dest);

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
    p.picks = picks; p.fires = fires; p.hits = hits; p.pops = pops;
    p.recovers = recs; p.onRail = onRail; p.falling = !!v.falling;
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

  /* ── one bed per world ───────────────────────────────────────────────────
     13_Audio.md open question 3: "music per world, or per track? Per world is
     cheaper and probably sufficient." Per world, and it IS sufficient — the
     four sandbox tracks want the same sandbox, and a tune each would stop the
     world being a place.

     The rule the document sets is that **toy percussion is the connective
     tissue** across worlds: xylophone, shaker and pulse present everywhere,
     "in different guises". So what varies is key, register, tempo, timbre and
     mode — never the instrumentation. Three worlds should sound like three
     rooms in one house, not three different games.

     The town rug is named as the reference point — "warm, bright, a little
     wistful under the energy" — so its numbers are exactly what shipped before
     this table existed, and the other two are defined against it. */
  MUSIC: {
    'town-rug': {
      name: 'the bedroom floor',
      beat: 0.227, root: 392, bass: 110,
      scale: [0, 3, 5, 7, 10, 12, 15],       // minor-ish: the wistful part
      lead: 'sine', pulse: 'triangle',       // soft xylophone over a round pulse
      leadVol: 0.09, bassVol: 0.16, shaker: 0.06, shakerHz: 5000,
      step: 3,
    },
    sandbox: {
      /* Outdoors, and the middle of the day. Major pentatonic has no minor
         third to be wistful about, which is the entire difference in one
         interval. A fifth up and a little quicker; the shaker drops in pitch
         because sand is not a rattle, it is a brush. */
      name: 'out in the sandbox',
      beat: 0.214, root: 587, bass: 147,
      scale: [0, 2, 4, 7, 9, 12, 14],
      lead: 'sine', pulse: 'triangle',
      leadVol: 0.075, bassVol: 0.13, shaker: 0.05, shakerHz: 3200,
      step: 2,
    },
    stunt: {
      /* Moulded plastic, up on the furniture. A square lead is the one timbre
         that is unmistakably a toy electronic, and the pulse goes to sawtooth
         an octave down to push rather than to sit underneath. Quickest of the
         three, because this is the world with the loops in it. */
      name: 'the plastic track',
      beat: 0.198, root: 466, bass: 87,
      scale: [0, 2, 3, 7, 9, 10, 12],        // dorian-ish: driving, not sad
      lead: 'square', pulse: 'sawtooth',
      leadVol: 0.055, bassVol: 0.11, shaker: 0.045, shakerHz: 6500,
      step: 5,
    },
  },

  bedFor(world) { return this.MUSIC[world] || this.MUSIC['town-rug']; },

  /* ── AMBIENCE — the house going on around the race ───────────────────────
     13_Audio.md has always listed environmental sound under "Still missing",
     and is unusually specific about why it matters: "Distant household sounds
     carry the framing story from 00_Vision.md - the toys are racing while the
     house goes on around them... Used sparingly, this does more for the
     premise than any cutscene would."

     SPARINGLY IS THE WHOLE DESIGN. A race is ninety seconds of engine, tyres
     and collisions; anything continuous underneath it becomes noise you stop
     hearing and then cannot unhear. These fire every few seconds at most, and
     always quietly.

     On the SFX bus, not the music bus. This is diegetic world sound, so a
     player who turns the music down to hear the driving should keep the room
     they are driving in. */
  AMBIENCE: {
    'town-rug': {
      every: [2.6, 5.2],
      voices: [
        // A bedroom clock, the most recognisable "indoors at night" sound there
        // is, and the cheapest: two clicks a couple of hundred ms apart.
        { w: 4, play: function (A, d) {
            A.blip(2400, 0.012, 'square', 0.030, 1900, A.sfxBus, d);
            A.blip(2100, 0.010, 'square', 0.022, 1700, A.sfxBus, d + 0.52);
          } },
        // A floorboard, somewhere behind you.
        { w: 3, play: function (A, d) {
            A.thud(0.045, 96, 0.26, 2.2, A.sfxBus, d);
          } },
        // A door closing elsewhere in the house. Low, soft, and gone.
        { w: 2, play: function (A, d) {
            A.thud(0.055, 62, 0.34, 1.1, A.sfxBus, d);
          } },
        // Plastic settling on the rug.
        { w: 3, play: function (A, d) {
            A.blip(880, 0.05, 'triangle', 0.028, 520, A.sfxBus, d);
            A.blip(700, 0.04, 'triangle', 0.020, 430, A.sfxBus, d + 0.07);
          } },
      ],
    },
    sandbox: {
      every: [3.2, 6.4],
      voices: [
        // Wind across an open sandpit: a long breath of filtered noise.
        { w: 5, play: function (A, d) { A.gust(d, 1.6, 0.040, 520); } },
        { w: 3, play: function (A, d) { A.gust(d, 2.4, 0.030, 340); } },
        // A spade knocking the frame.
        { w: 2, play: function (A, d) { A.thud(0.040, 150, 0.18, 3.0, A.sfxBus, d); } },
      ],
    },
    stunt: {
      every: [3.0, 6.0],
      voices: [
        // Moulded track flexing under the weight of a car.
        { w: 4, play: function (A, d) {
            A.blip(420, 0.09, 'triangle', 0.026, 300, A.sfxBus, d);
          } },
        // A distant television, two floors of nothing in particular.
        { w: 3, play: function (A, d) { A.gust(d, 1.9, 0.026, 260); } },
        // Something plastic tapping the dresser.
        { w: 3, play: function (A, d) {
            A.blip(1500, 0.02, 'square', 0.024, 1200, A.sfxBus, d);
          } },
      ],
    },
  },

  /* A long soft band of noise — wind, or a television through a wall. */
  gust(delay, dur, vol, hz) {
    if (!this.ready) return;
    const ctx = this.ctx, at = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(at); src.stop(at + dur + 0.05);
  },

  /* ITS OWN RANDOM NUMBERS, and this is not fussiness.
     `Math.random` is the stream the AI's wander and mistake rolls come out of.
     Audio runs once per RENDERED frame, so if ambience drew from it the
     sequence the AI sees would depend on frame rate — and Time Trial ghosts
     replay recorded inputs through a simulation that must land in the same
     place every time. Sound would silently desync the game.
     mulberry32, seeded once, touched by nothing else. */
  _ambSeed: 20260819,
  ambRandom() {
    let s = this._ambSeed | 0;
    s = (s + 0x6D2B79F5) | 0;
    this._ambSeed = s;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  ambNext: 0,

  ambience(racing) {
    if (!this.ready || this.sfxVolume <= 0) return;
    const ctx = this.ctx;
    if (!racing) { this.ambNext = 0; return; }

    const arena = BR.Game && BR.Game.arena;
    const bed = this.AMBIENCE[(arena && arena.world) || 'town-rug'] ||
                this.AMBIENCE['town-rug'];

    // Resync after a backgrounded tab, exactly as the music scheduler does, or
    // the catch-up loop fires every missed event at once.
    if (this.ambNext === 0 || this.ambNext < ctx.currentTime - 1) {
      this.ambNext = ctx.currentTime + 1.2;
      return;
    }
    while (this.ambNext < ctx.currentTime + 0.4) {
      const r = this.ambRandom();
      let total = 0;
      for (let i = 0; i < bed.voices.length; i++) total += bed.voices[i].w;
      let pick = r * total, v = bed.voices[0];
      for (let i = 0; i < bed.voices.length; i++) {
        pick -= bed.voices[i].w;
        if (pick <= 0) { v = bed.voices[i]; break; }
      }
      /* blip and thud take a delay RELATIVE to ctx.currentTime, so the
         absolute instant this scheduler works in is converted here. Same
         instant either way; the conversion just has to happen once, at the
         boundary, rather than in every voice. */
      v.play(this, this.ambNext - ctx.currentTime);
      const lo = bed.every[0], hi = bed.every[1];
      this.ambNext += lo + this.ambRandom() * (hi - lo);
    }
  },

  music(racing, RM) {
    if (!this.musicEnabled || this.musicVolume <= 0) return;
    const ctx = this.ctx;
    if (!racing) { this.musicNext = 0; return; }

    const arena = BR.Game && BR.Game.arena;
    const world = (arena && arena.world) || 'town-rug';
    const M = this.bedFor(world);

    /* Starting a race in a different world restarts the phrase. Carrying the
       step count across a key change drops the new bed halfway through a bar of
       the old one, which reads as a glitch rather than as a new place. */
    if (world !== this.musicWorld) {
      this.musicWorld = world;
      this.musicStep = 0;
      this.musicNext = 0;
    }

    const finalLap = RM && RM.player().lap === RM.laps - 1;
    /* The last-lap lift, as a RATIO rather than a fixed pair of numbers. Held
       absolute, every world would speed up to the same tempo on the last lap
       and three identities would collapse into one at the moment they matter
       most. */
    const beat = M.beat * (finalLap ? 0.916 : 1);

    // Resync if we have fallen behind — a backgrounded tab stops calling
    // update() while the audio clock keeps running, and without this the
    // catch-up loop would schedule every missed note at once.
    if (this.musicNext === 0 || this.musicNext < ctx.currentTime - 0.5) {
      this.musicNext = ctx.currentTime + 0.08;
    }

    while (this.musicNext < ctx.currentTime + 0.3) {
      const t = this.musicNext;
      const s = this.musicStep;

      if (s % 4 === 0) this.note(M.bass, t, 0.22, M.pulse, M.bassVol);     // pulse
      if (s % 8 === 2 || s % 8 === 6) {
        this.noiseHit(t, 0.05, M.shaker, M.shakerHz);                      // shaker
      }
      if (s % 2 === 0) {
        const deg = M.scale[(s * M.step + (s % 6)) % M.scale.length];
        this.note(M.root * Math.pow(2, deg / 12), t, 0.16, M.lead, M.leadVol);
      }
      // Final-lap layer, a fifth above the pulse rather than a fixed pitch.
      if (finalLap && s % 4 === 2) {
        this.note(M.bass * 1.78, t, 0.14, M.pulse, M.bassVol * 0.44);
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

  // `hz` is the highpass corner: high is a rattle, low is a brush. Defaulted so
  // any existing caller keeps the sound it had.
  noiseHit(at, dur, vol, hz) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass';
    f.frequency.value = hz || 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(at); src.stop(at + dur + 0.02);
  },
};
