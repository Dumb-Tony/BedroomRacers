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

   Four rules this module obeys:

   - It NEVER runs inside the fixed simulation step. Audio observes state and
     detects edges once per rendered frame. Firing sounds from inside the step
     would trigger them several times per frame and couple audio to physics,
     which would break the determinism Time Trial ghosts depend on.

   - SPEED IS A CURVE. Everything that tracks how fast the car is going does so
     with a power above one — the wind cubed, the tyre roar squared — because
     linear ramps read as gradual and the complaint this game gets is that it
     does not feel fast enough. A crawl is one quiet voice; flat out is five
     loud ones. See updateChannel.

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
         leaving the road is exactly as audible in every car. There are now
         twelve floors rather than two (see SURFACES), and material still
         scales all of them by one factor, so the SIZE of every transition is
         identical whatever you are driving.
       - Drift is untouched BY MATERIAL. That is tyres against the FLOOR — it
         belongs to the surface, not to the shell — so the surface does set its
         register, and all four materials still slide identically.
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

  /* ── WHAT THE FLOOR IS MADE OF ────────────────────────────────────────────
     The audio twin of `Renderer.roadTile` / `groundTile` / `drawZones`, and a
     twin on purpose. The art pass gave every world its own floor material —
     woven pile on the rug, grains in the sandpit, varnished boards under the
     stunt deck, glazed tile and wiped laminate in the kitchen — while audio
     still asked ONE question, `v.surface === 'rugGrass'`, and picked between
     two tyre notes for all eleven entries in `BR.SURFACES` across four worlds.
     Driving on floorboards sounded exactly like driving on carpet — which is
     the complaint verbatim. It does not now.

     Four columns, each doing one job:

       roarHz / roar   a LOWPASS on noise: the BODY of the tyre note, and the
                       single loudest thing at speed. Level goes with the
                       SQUARE of speed, so this is most of what makes flat out
                       sound different from a crawl.
       band / bandGain a BANDPASS: the TEXTURE. Where the grain of the surface
                       sits in the spectrum, and how much of it there is.
       flutter         how LUMPY it is. A sine LFO on the roar's gain, rate
                       rising with speed — woven pile thumps, moulded plastic
                       does not, and sand is a continuous hiss with no
                       periodicity in it at all.
       slide           the register a DRIFT scrubs in. 13_Audio.md's argument
                       for keeping drift out of the material table — "that is
                       tyres against the FLOOR: it belongs to the surface, not
                       to the shell" — is an argument that it belongs here.

     THE ONE RULE THIS TABLE MUST NOT BREAK: leaving the road has to be
     unmistakable in every world (13_Audio.md's gameplay-critical table). Not
     in a fixed direction — newspaper on laminate is BRIGHTER than the laminate
     and pretending otherwise would be a lie about paper — but big. Measured as
     the summed |log2| distance across all four columns, the largest transition
     is the rug's at 4.49 and the smallest is the kitchen's at 1.92. */
  SURFACES: {
    /* Printed road on the town rug. The renderer draws this with the SAME pile
       tile as the rug beside it at 0.55 strength, because ink hides some of
       the pile without flattening it — so the road is the rug, quieter and
       less lumpy, and that is exactly what these numbers say. */
    road:     { id: 'road',     roarHz: 640,  roar: 0.62, band: 1100,
                bandGain: 0.45, flutter: 0.26, slide: 0.86 },
    /* Bare pile. Dark, loud and lumpy: the loops are over half a car long
       (12_Art_Guide.md's oversized rug fibres) and they are what a tyre is
       actually hitting. The biggest surface change in the game. */
    rug:      { id: 'rug',      roarHz: 380,  roar: 1.05, band: 420,
                bandGain: 1.35, flutter: 0.58, slide: 0.72 },
    /* Varnished pine. Hard, bright, and it has joints — `woodTile` draws a
       dark gap with a lit shoulder every board, so the flutter is real
       geometry rather than flavour. Under the bed, and under the stunt deck. */
    boards:   { id: 'boards',   roarHz: 1500, roar: 1.05, band: 1800,
                bandGain: 0.95, flutter: 0.30, slide: 1.25 },
    /* Wiped laminate: a printed board under a hard clear film. Brighter than
       the pine it imitates and smoother than anything, which is precisely
       12% more top speed at 0.78 grip. */
    laminate: { id: 'laminate', roarHz: 1700, roar: 0.78, band: 2200,
                bandGain: 0.60, flutter: 0.10, slide: 1.30 },
    /* Moulded plastic track. The smoothest floor in the game — injection
       moulding leaves mould lines and nothing else — so it has the least
       flutter and the highest band. It should sound FAST, because it is. */
    moulded:  { id: 'moulded',  roarHz: 1950, roar: 0.70, band: 2400,
                bandGain: 0.52, flutter: 0.08, slide: 1.35 },
    /* A sock. Cloth is the only thing here that absorbs rather than reflects:
       lowest roar corner, lowest band, and a drift on it barely makes a
       sound. 0.70 top speed, and it sounds like it. */
    cloth:    { id: 'cloth',    roarHz: 240,  roar: 0.90, band: 300,
                bandGain: 1.10, flutter: 0.44, slide: 0.55 },
    /* Newsprint. The one surface that goes UP when you leave the road: paper
       has no body at all — the low end falls away — and a great deal of
       crinkle. 0.60 grip is the lowest on the roster and it skitters. */
    paper:    { id: 'paper',    roarHz: 1150, roar: 0.85, band: 3100,
                bandGain: 1.00, flutter: 0.46, slide: 1.15 },
    /* Cardboard: the tunnel shortcut, and the cover of a book. Card is paper
       with a body, so it sits between the newsprint and the boards. */
    card:     { id: 'card',     roarHz: 820,  roar: 0.80, band: 1450,
                bandGain: 0.80, flutter: 0.24, slide: 0.95 },
    /* Grains. Broad and hissy with almost no flutter, because a million loose
       particles have no period to them. */
    sand:     { id: 'sand',     roarHz: 780,  roar: 1.10, band: 2700,
                bandGain: 1.15, flutter: 0.07, slide: 0.88 },
    /* The same grain pressed flat — the renderer uses the same tile with the
       pits filled in, and this is the same voice with the hiss taken out. */
    packed:   { id: 'packed',   roarHz: 1020, roar: 0.80, band: 2400,
                bandGain: 0.78, flutter: 0.09, slide: 0.92 },
    /* Off the dug track. Loudest and draggiest thing in the game: the point of
       loose sand is that it is a mistake, and it should sound like one. */
    loose:    { id: 'loose',    roarHz: 560,  roar: 1.55, band: 1700,
                bandGain: 1.45, flutter: 0.05, slide: 0.80 },
    /* Standing water, and spilled sugar. Bright, hissy, and frictionless in
       the worst way. */
    water:    { id: 'water',    roarHz: 900,  roar: 1.30, band: 3400,
                bandGain: 1.25, flutter: 0.22, slide: 1.10 },
  },

  /* Which floor a world's generic ON-ROAD and OFF-ROAD names mean. Mirrors the
     branch in `Renderer.roadTile` and `Renderer.groundTile` one for one:
     plasticTile over woodTile on the stunt track, packedSandTile over sandTile
     in the pit, laminateTile over the morning's post in the kitchen, and the
     rug's own pile printed and bare.

     THIS TABLE EXISTS BECAUSE THE STUNT TRACKS DECLARE NO SURFACES AT ALL, so
     they inherit `rugRoad` / `rugGrass` from the defaults — a moulded plastic
     deck on a bedroom floor, driving under the names of a carpet. The physics
     is right and the NAME is wrong, and audio must not repeat the name's
     mistake just because it reads the same field. */
  WORLD_FLOOR: {
    'town-rug': { road: 'road',     off: 'rug' },
    sandbox:    { road: 'packed',   off: 'loose' },
    stunt:      { road: 'moulded',  off: 'boards' },
    kitchen:    { road: 'laminate', off: 'paper' },
  },

  /* A NAMED surface means the same thing wherever it appears — a sock is a
     sock on the rug or on the table. One exception, and the renderer has the
     same one: `hardwood` is bare pine under the bed and wiped laminate on the
     kitchen table, drawn with woodTile in one and laminateTile in the other.
     `null` means the world decides; see WORLD_FLOOR. */
  SURFACE_NAMES: {
    rugRoad: null, rugGrass: null,
    hardwood: 'boards',            // ...unless kitchen — see surfaceFor
    blanket: 'cloth', paper: 'paper', bookCover: 'card',
    plastic: 'moulded', puddle: 'water',
    sand: 'sand', packedSand: 'packed', looseSand: 'loose',
  },

  /**
   * The floor under one car, as a voice.
   *
   * SAND BLENDS, exactly as its handling does: `BR.SURFACES.sand` and
   * `packedSand` are the two ends of one continuum and SandGrid says where a
   * patch of ground sits between them. Reading the same grid here makes the
   * racing line you have worn into the sandpit over three laps AUDIBLE — the
   * feature the physics already had, in the ear.
   *
   * Blended into a per-channel scratch object rather than allocating one every
   * frame per player.
   */
  surfaceFor(ch, arena, v) {
    const world = (arena && arena.world) || 'town-rug';
    const name = v.surface;
    let id = this.SURFACE_NAMES[name];
    if (id === undefined) id = null;
    if (id === 'boards' && world === 'kitchen') id = 'laminate';
    if (id === null) {
      const F = this.WORLD_FLOOR[world] || this.WORLD_FLOOR['town-rug'];
      id = (name === 'rugGrass') ? F.off : F.road;
    }
    const S = this.SURFACES[id] || this.SURFACES.road;

    if (id !== 'sand' || !BR.SandGrid || !BR.SandGrid.active) return S;
    const t = BR.SandGrid.at(v.x, v.y);
    if (t <= 0) return S;
    return this.blendSurface(ch.sv, S, this.SURFACES.packed, t);
  },

  blendSurface(dst, a, b, t) {
    dst.id       = t > 0.5 ? b.id : a.id;
    dst.roarHz   = a.roarHz   + (b.roarHz   - a.roarHz)   * t;
    dst.roar     = a.roar     + (b.roar     - a.roar)     * t;
    dst.band     = a.band     + (b.band     - a.band)     * t;
    dst.bandGain = a.bandGain + (b.bandGain - a.bandGain) * t;
    dst.flutter  = a.flutter  + (b.flutter  - a.flutter)  * t;
    dst.slide    = a.slide    + (b.slide    - a.slide)    * t;
    return dst;
  },

  /* ── UNDER THE BED ────────────────────────────────────────────────────────
     13_Audio.md open question 4, and the answer is yes.

     06_World_Town_Rug.md calls the under-bed run "the first use of a lighting
     state as gameplay". A lighting state that the ear cannot hear is half a
     state: the car goes somewhere genuinely different — enclosed, boards
     below, a mattress a car's length overhead — and everything about it
     already changes except the sound.

     ONE FILTER, per human CHANNEL, which is where it has to be. Not the master
     bus: in split screen one player can be under the bed while the other is
     out on the rug, and the countdown, the music and the room the house makes
     do not belong to either of them. Put it on a channel and it muffles that
     driver's car, their tyres, their collisions and the rivals near THEM,
     which is exactly the set of things that would actually be in the box.

     It does not erase the surface cue, and that is checked rather than hoped:
     the lowpass sits at 1600 Hz and takes roughly 3 dB off the boards' 1800 Hz
     band while leaving the 420 Hz rug band alone, so the CONTRAST between them
     — the part carrying the information — survives the effect that dulls both.

     `MUFFLE_OPEN` is 16 kHz rather than the top of hearing on purpose: the
     highest frequency this module ever synthesises is the music shaker's 6.5
     kHz highpass corner, so at 16 kHz the filter is transparent to everything
     the game can make, and it is far enough below Nyquist that the biquad is
     not warping up there either. */
  MUFFLE_OPEN: 16000,
  MUFFLE_UNDER: 1600,

  /* The boards, plus any cloth lying ON them. Cached on the arena the way the
     renderer caches a vehicle's shape, because a track is built once and raced
     many times.

     Cloth INSIDE the boards is a sock under the bed and must muffle with them
     — un-muffling for the eight car lengths of a sock and back would pump. Any
     other cloth on a rug track is a place mat and is not under anything, which
     is why this is a geometric test and not `type === 'blanket'`. */
  muffleRects(arena) {
    if (!arena) return null;
    if (arena._muffle !== undefined) return arena._muffle;
    let rects = null;
    const zones = arena.zones || [];
    if (arena.world === 'town-rug') {
      const boards = [];
      for (let i = 0; i < zones.length; i++) {
        if (zones[i].type === 'hardwood') boards.push(zones[i]);
      }
      if (boards.length) {
        rects = boards.slice();
        for (let i = 0; i < zones.length; i++) {
          const z = zones[i];
          if (z.type !== 'blanket') continue;
          for (let j = 0; j < boards.length; j++) {
            if (this.rectsOverlap(z, boards[j])) { rects.push(z); break; }
          }
        }
      }
    }
    arena._muffle = rects;
    return rects;
  },

  rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  },

  underBed(arena, v) {
    const rects = this.muffleRects(arena);
    if (!rects) return false;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (v.x >= r.x && v.x <= r.x + r.w &&
          v.y >= r.y && v.y <= r.y + r.h) return true;
    }
    return false;
  },

  /* One player's entire soundstage: their car, their tyres, their rivals.

     THE MUFFLE SITS IN THE OUTPUT PATH AND IS BUILT HERE, wide open, rather
     than inserted when a car first drives under the bed. Same reason the
     channels themselves are built up front: reconnecting a running graph
     clicks, and the click would land on the exact frame the effect is supposed
     to sell. */
  makeChannel() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 1;

    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = this.MUFFLE_OPEN;
    muffle.Q.value = 0.7;
    out.connect(muffle);

    let panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      muffle.connect(panner);
      panner.connect(this.sfxBus);
    } else {
      muffle.connect(this.sfxBus);   // older browsers just get it centred
    }

    return {
      out: out, panner: panner, muffle: muffle,
      engine:   this.makeEngine(out),
      /* THE FLOOR, IN TWO VOICES. `roar` is a lowpass carrying the body of the
         tyre note and `rattle` a bandpass carrying its texture — one filter
         cannot be both "dark and loud" (pile) and "bright and hard" (boards)
         while also being a bed that swells with speed. */
      roar:     this.makeRoar(out),
      rattle:   this.makeNoiseVoice(900, 1.2, out),
      /* WIND. The largest single thing that was missing: a broad band of noise
         whose level goes with the CUBE of speed, which is roughly what
         aerodynamic noise really does and is the reason the top of the range
         arrives as an event rather than as more of the same. Q 0.4 is nearly
         two octaves wide — a rush of air, not a resonance. */
      wind:     this.makeNoiseVoice(400, 0.4, out),
      /* THE TOP OF THE RANGE. A narrow whistle that does not exist below 82%
         of the car's maximum and swells in over the last 18%, so ARRIVING at
         top speed is a sound of its own. Deliberately a resonant band of noise
         rather than a tone: a pure high sine is a stinger, and 13_Audio.md is
         explicit that the audience includes noise-sensitive players. */
      whine:    this.makeNoiseVoice(2200, 8.0, out),
      drift:    this.makeNoiseVoice(1600, 4.0, out),
      boostAir: this.makeNoiseVoice(700, 0.9, out),
      ratchet:  this.makeRatchet(out),
      pack:     this.makeEngine(out),
      // Which material this channel is currently wearing. Null until the first
      // frame, so applyMaterial always runs once.
      material: null,
      prev: null,
      /* The boost's punch and its release, as two scalars that spike on an
         edge and decay on the RENDER clock. See updateChannel — a one-shot
         cannot make a continuous voice settle. */
      kick: 0, rel: 0,
      // Scratch, so blending sand does not allocate an object a frame.
      sv: {},
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

  makeNoiseVoice(freq, q, dest, type) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type || 'bandpass';
    filt.frequency.value = freq; filt.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start();
    return { src: src, filt: filt, gain: g };
  },

  /* THE TYRE ROAR, AND THE WHEEL UNDER IT.

     A lowpassed bed of noise carries the body of whatever is under the car.
     On top of it, a SINE LFO on the same gain whose rate rises with speed —
     because the strongest thing a tyre does that says "this is going fast" is
     go round, and a rotation rate is a modulation rate.

     Depth is the surface's `flutter`, so this doubles as a material axis: pile
     thumps at 0.58, moulded plastic barely moves at 0.08, and sand has no
     period in it at all. Held below the intrinsic gain, so it is a tremolo
     rather than the ratchet's gate — a gate here would sound like a fault.

     A GRAPH, for the same reason the ratchet is one: an LFO runs on the audio
     thread, so it cannot drift with frame rate or fire twice in a frame where
     the fixed step ran twice. */
  makeRoar(dest) {
    const ctx = this.ctx;
    const voice = this.makeNoiseVoice(700, 1.0, dest, 'lowpass');
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 4;
    const amp = ctx.createGain(); amp.gain.value = 0;
    lfo.connect(amp); amp.connect(voice.gain.gain);
    lfo.start();
    voice.lfo = lfo; voice.amp = amp;
    return voice;
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

  /* THE PUNCH. A boost has to arrive as a SHOVE, and the old one did not: a
     single sawtooth sweep and a soft noise thud, both fading in over the same
     8 ms as every other blip in the file. Three things now, in the order the
     ear reads them — a hard bright tick so there IS a transient, a low
     sawtooth sweeping up through the engine's own register, and a broad noise
     shove behind both.

     THE SETTLE IS NOT HERE, and cannot be: it is `ch.kick` in updateChannel,
     lifting the engine, its filter, the wind and the boost air and letting all
     four fall back. What has to settle is the continuous voice, and a one-shot
     has no way to touch one. */
  boostFire(dest) {
    this.blip(1500, 0.05, 'square', 0.09, 900, dest);
    this.blip(300, 0.34, 'sawtooth', 0.17, 1100, dest);
    this.thud(0.20, 1600, 0.34, 0.6, dest);
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

  /* ── THE VRRROOOM ─────────────────────────────────────────────────────────
     13_Audio.md open question 1: "is the vocal 'vrrrooom' a core identity
     element or a novelty that wears thin?"

     BOTH — and that is what decides where it goes, because the two halves are
     claims about different DURATIONS.

     It is identity. This document ranks scale reinforcement second of three
     jobs — "small plastic sounds in a large room, audio carries the toy
     fantasy as much as the art does" — and a child imitating an engine is the
     strongest scale cue available to a synthesiser. It says "these are toys
     and somebody is playing with them" in under a second and no arrangement of
     filtered noise can say it at all.

     And it wears thin, immediately, if it is the engine. A vocal layer under
     ninety seconds of racing is the definition of a novelty outstaying its
     welcome — and worse, it would break job ONE. A voice lives between about
     200 Hz and 3 kHz, which is where the drift note (1200–2600), the tyre band
     (300–3400) and both boost cues (560–1320) already are. A continuous vroom
     would mask the sounds this document says must never be cut.

     SO: KEEP IT, AND TAKE IT OFF THE ENGINE. It is punctuation, not texture.
     A frame is established once, not continuously, and there is exactly one
     moment in a race that belongs to the child rather than to the driver — the
     shove at the start. It fires ONCE PER RACE, on GO, centred, over an empty
     mix, on the one frame nobody is yet reading gameplay from sound.

     Built as a mouth, not an engine, and that is the difference between this
     and the engine voice six functions up:

       - a sawtooth larynx that rises and settles rather than tracking speed
       - a TRILL: an LFO gating the source at 34 Hz slowing to 19 as the breath
         runs out. Fluttering lips are a periodic gate, and this one is a graph
         for the usual reason — nothing on the render clock can machine-gun it
       - two bandpass FORMANTS sweeping down together, 480→300 and 1600→820,
         which is the vocal tract going from an open [r] to a closed [m]. The
         word ends humming, because "vrrrooom" does
       - a short noise puff at the front: the lips before the voice */
  vroom(dest) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 0.86;
    const out = dest || this.sfxBus;

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(132, t);
    o.frequency.exponentialRampToValueAtTime(232, t + 0.16);
    o.frequency.exponentialRampToValueAtTime(178, t + dur);

    /* The lip trill. Intrinsic 0.6 plus a ±0.4 triangle swings the gain
       between 0.2 and 1.0 — flutter, not a hard gate, because a hard gate at
       30 Hz is a buzzer and a mouth is not one. */
    const flut = ctx.createGain(); flut.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(34, t);
    lfo.frequency.exponentialRampToValueAtTime(19, t + dur);
    const lamp = ctx.createGain(); lamp.gain.value = 0.4;
    lfo.connect(lamp); lamp.connect(flut.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.42, t + 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(flut); flut.connect(env);

    const F = [[480, 300, 5, 0.10], [1600, 820, 6, 0.055]];
    for (let i = 0; i < F.length; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(F[i][0], t);
      f.frequency.exponentialRampToValueAtTime(F[i][1], t + dur);
      f.Q.value = F[i][2];
      const g = ctx.createGain(); g.gain.value = F[i][3];
      env.connect(f); f.connect(g); g.connect(out);
    }

    o.start(t); o.stop(t + dur + 0.05);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    this.thud(0.035, 700, 0.07, 0.9, out);   // the lips, before the voice
  },

  // Race-wide, so centred rather than on anyone's channel.
  countdownTick() { this.blip(520, 0.13, 'square', 0.13); },
  /* GO is the child's hand shoving the car, so the child is audible on it.
     Once a race, and never again — see vroom(). */
  go() {
    this.blip(880, 0.3, 'square', 0.17, 1320);
    this.vroom();
  },
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
      if (i < humans.length) this.updateChannel(ch, humans[i], game, racing, engOn, dt);
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
    ch.wind.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.whine.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.drift.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.boostAir.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.pack.gain.gain.setTargetAtTime(0, now, 0.08);
    /* The ratchet and the roar are both gated by two gains summed into ONE
       param, so BOTH halves have to go to zero. Leaving an LFO amplitude up on
       a silenced channel keeps it modulating around nothing, which is audible
       as the modulation itself — the ratchet shipped that bug once. */
    ch.ratchet.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.ratchet.amp.gain.setTargetAtTime(0, now, 0.08);
    ch.roar.gain.gain.setTargetAtTime(0, now, 0.08);
    ch.roar.amp.gain.setTargetAtTime(0, now, 0.08);
    // A channel handed to a different player later must not still be under
    // somebody else's bed.
    ch.muffle.frequency.setTargetAtTime(this.MUFFLE_OPEN, now, 0.08);
    ch.out.gain.setTargetAtTime(1, now, 0.08);
    ch.kick = 0; ch.rel = 0;
    ch.prev = null;
  },

  /* ── THE SOUND OF SPEED ───────────────────────────────────────────────────
     The complaint this exists to answer is "it doesn't feel fast enough", and
     the number is not allowed to change, so the feeling has to come from
     somewhere else. Audio's share of it is here, and it is four ideas:

     1. SPEED IS A CURVE, NOT A NUMBER. Everything below used to be linear in
        `ratio`, and linear is exactly what does not read as fast: the top
        third of the range sounded like the middle third with a little more of
        it. Now the wind goes with the CUBE of speed, the tyre roar with the
        SQUARE, and the engine's gain and cutoff with powers above one. Below
        half speed the mix is almost all engine; the top quarter is where four
        voices arrive at once. Measured, a crawl to flat out is a 23.5 dB
        swing across five voices where it used to be 11.7 dB across two.

     2. THE TOP OF THE RANGE IS A PLACE. `whine` does not exist below 82% of
        the car's maximum and swells in over the last 18%, so reaching top
        speed is a NEW SOUND rather than the end of a ramp. It also means the
        surfaces that cap your speed — loose sand at 0.68, a sock at 0.70 —
        can never produce it, which is the honest version of the cue.

     3. A BOOST PUNCHES AND THEN SETTLES. `kick` spikes to 1 on the boost edge
        and decays over about a third of a second, lifting the engine pitch,
        its cutoff, its level, the wind and the boost air together and letting
        all five fall back to a sustained value that is still clearly boosted.
        `rel` does the mirror image when it ends, so the boost has a shape at
        both ends instead of a step at one. Neither can live in a one-shot:
        the thing that has to settle is the CONTINUOUS voice.

     4. THE ENGINE BENDS UNDER DRIFT. Slipping wheels outrun the road, so the
        note goes up while the car is going sideways and falls as it hooks up.
        Scaled by speed, so a stationary spin cannot wail. This does not break
        13_Audio.md's rule that engine pitch tracks speed: at any fixed slip
        the curve is still monotone in speed, and the bend is itself
        proportional to speed, so it can never outrun the thing it decorates.

     Nothing here is a stat. No lap time can tell the difference, and the whole
     module still runs once per RENDERED frame. */
  updateChannel(ch, racer, game, racing, engOn, dt) {
    const v = racer.vehicle;
    const P = BR.PHYSICS;
    const now = this.ctx.currentTime;
    const dest = ch.out;
    // The render delta, clamped. `kick` and `rel` decay against real time and
    // a backgrounded tab must not skip them in one frame or restore them.
    const d = Math.min(0.1, Math.max(0.001, dt || 0.016));

    const speed = Math.hypot(v.vel.x, v.vel.y);
    const ratio = Math.min(1, speed / v.spec.maxSpeed);
    const r2 = ratio * ratio, r3 = r2 * ratio;

    /* What this car is made of. Cheap to look up every frame, and only
       re-applied when it actually changes — which is at most once a race,
       when a channel starts voicing a different car. */
    const m = this.materialFor(v.spec);
    if (ch.material !== m.id) this.applyMaterial(ch, m);

    // ...and what it is driving ON, which until now was one boolean.
    const arena = game && game.arena;
    const S = this.surfaceFor(ch, arena, v);

    if (!ch.prev) {
      ch.prev = { boost: v.boostMeter, boosting: v.boosting, grounded: v.grounded,
                  impacts: v.impacts || 0, cps: racer.cpsPassed, lap: racer.lap,
                  picks: v.itemPickups || 0, fires: v.itemFires || 0,
                  hits: v.stunHits || 0, pops: v.shieldPops || 0,
                  onRail: !!v.rail, recovers: v.recovered || 0,
                  falling: !!v.falling };
    }
    const p = ch.prev;

    /* THE BOOST EDGES ARE READ HERE, before anything continuous is written,
       so the punch lands on the frame the boost started rather than the one
       after it. The one-shots that go with them still fire further down, with
       the rest of the edge-detected sounds. */
    const boostStart = v.boosting && !p.boosting;
    const boostEnd = !v.boosting && p.boosting;
    if (boostStart) ch.kick = 1;
    if (boostEnd) ch.rel = 1;
    ch.kick = Math.max(0, ch.kick - d * 3.6);   // ~0.28s of punch
    ch.rel  = Math.max(0, ch.rel  - d * 4.6);   // ~0.22s of sigh

    // How hard this car is sliding, 0..1. Used twice: the drift voice, and the
    // engine note bending under it.
    const slip = Math.min(1, v.slip / 0.9);

    // ── engine ────────────────────────────────────────────────────────────
    /* Idle and flat-out pitch are unchanged at 62 and 272; the material still
       shifts the whole curve by a constant, so "faster is higher" and every
       number in the material table survive. What is new sits on top: the drift
       bend and the boost's punch, both of which return to zero.

       The response is faster than it was (0.035 against 0.05). An engine that
       takes a fifth of a second to acknowledge the throttle reads as a
       recording of a car rather than as the car. */
    const bend = slip * 34 * ratio;               // wheels outrunning the road
    const punch = ch.kick * 96 - ch.rel * 30;
    const base = Math.max(20,
      (62 + ratio * 210 + bend + (v.boosting ? 46 : 0) + punch) * m.pitch);
    ch.engine.o1.frequency.setTargetAtTime(base, now, 0.035);
    ch.engine.o2.frequency.setTargetAtTime(base * m.detune, now, 0.035);
    /* Cutoff opens LATE and fast — the exponent is the whole change, and it
       leaves both ends of every material's range exactly where the table says
       they are. A dull crawl is what makes an open throttle bright. */
    ch.engine.filt.frequency.setTargetAtTime(
      Math.max(80, m.cutBase + m.cutSpan * Math.pow(ratio, 1.3)
                   + ch.kick * 900 - ch.rel * 240), now, 0.05);
    /* 0.016 → 0.102 rather than 0.035 → 0.085: a 16 dB engine swing where it
       used to be under 8. Most of the "not fast enough" is here — going slowly
       was never QUIET, so going quickly could not be loud. A toy car sitting
       on the grid should be very nearly silent. */
    ch.engine.gain.gain.setTargetAtTime(
      engOn ? (0.016 + 0.086 * Math.pow(ratio, 1.35)) * m.engGain
              * (1 + 0.35 * ch.kick) : 0, now, 0.09);

    /* The ratchet. Silent on everything that is not a wind-up, so this costs
       three parameter writes and no voices on the rest of the roster. Rate
       tracks speed — a spring unwinding faster — and it is a GRAPH, so
       nothing here fires anything; see makeRatchet. */
    const rLevel = (engOn && m.ratchet) ? m.ratchet * (0.45 + 0.55 * ratio) : 0;
    ch.ratchet.lfo.frequency.setTargetAtTime(
      (m.rateBase + ratio * m.rateSpan) || 1, now, 0.08);
    ch.ratchet.gain.gain.setTargetAtTime(rLevel * 0.5, now, 0.07);
    ch.ratchet.amp.gain.setTargetAtTime(rLevel * 0.5, now, 0.07);

    // ── the floor ─────────────────────────────────────────────────────────
    /* The tyre note must change the instant the surface does, so the player
       learns the map by feel (13_Audio.md) — hence the 0.04 time constants,
       which is a snap rather than a fade. Material still scales BOTH ends of
       every split by the same factor, so the SIZE of a surface change — the
       part carrying the information — is identical in every car.

       Two voices now, and the second one is most of the sense of speed: the
       roar rises with the square of speed while the band rises with a power of
       1.6, so at a crawl there is almost no floor at all and flat out it is
       the loudest thing after the engine. */
    const onGround = v.grounded && engOn;
    const roarLevel = onGround ? 0.070 * r2 * S.roar : 0;
    ch.roar.filt.frequency.setTargetAtTime(S.roarHz, now, 0.04);
    ch.roar.gain.gain.setTargetAtTime(roarLevel, now, 0.05);
    // The wheel going round: 3.5 Hz crawling, ~30 Hz flat out. At the top that
    // is fast enough to read as grain in the timbre rather than as pulsing,
    // which is exactly what a surface at speed does.
    ch.roar.lfo.frequency.setTargetAtTime(3.5 + ratio * 26, now, 0.08);
    ch.roar.amp.gain.setTargetAtTime(roarLevel * S.flutter, now, 0.06);

    ch.rattle.filt.frequency.setTargetAtTime(S.band * m.rattleHz, now, 0.04);
    ch.rattle.gain.gain.setTargetAtTime(
      onGround ? 0.046 * Math.pow(ratio, 1.6) * S.bandGain * m.rattleGain : 0,
      now, 0.05);

    // ── wind ──────────────────────────────────────────────────────────────
    /* Cubic in speed, and MORE OF IT IN THE AIR — there is nothing between a
       jumping car and the room, so a ramp should hiss and a landing should
       shut it off. The band centre climbs with the square, so the wind gets
       both louder and brighter rather than just louder. */
    const air = engOn
      ? (0.052 * r3 + (v.grounded ? 0 : 0.022 * ratio)) * (1 + 0.6 * ch.kick)
      : 0;
    ch.wind.gain.gain.setTargetAtTime(air, now, 0.07);
    ch.wind.filt.frequency.setTargetAtTime(
      400 + 2000 * r2 + ch.kick * 700, now, 0.08);

    // ── the top of the range ──────────────────────────────────────────────
    /* Nothing until 82%, then it swells in as the square of what is left. The
       one voice in the game that says "this is as fast as this car goes", and
       the only reason the last tenth of the speedometer sounds like anything.

       Untouched by material, for the same reason the clean-landing chime is:
       every car's top end must feel like a top end, and a car whose ceiling
       was duller than everyone else's would be a car penalised for what it is
       made of. */
    const top = Math.max(0, (ratio - 0.82) / 0.18);
    ch.whine.filt.frequency.setTargetAtTime(2200 + 1200 * top, now, 0.08);
    ch.whine.gain.gain.setTargetAtTime(engOn ? 0.030 * top * top : 0, now, 0.09);

    // ── drift: pitch tracks slip, so how hard you slide is audible ────────
    /* The SLIP sets the pitch and the FLOOR sets the register. 13_Audio.md
       keeps drift out of the material table because "that is tyres against the
       floor: it belongs to the surface, not to the shell" — which is an
       argument that it belongs to the surface, so a slide on varnished boards
       squeals at 1.25x and the same slide into a sock is a dull 0.55x scrub.
       Still identical in all four materials. */
    ch.drift.filt.frequency.setTargetAtTime(
      (1200 + slip * 1400) * S.slide, now, 0.04);
    ch.drift.gain.gain.setTargetAtTime(
      v.grounded && racing ? slip * ratio * 0.11 : 0, now, 0.05);

    // ── boost ─────────────────────────────────────────────────────────────
    // The air layer takes the kick too, so the first third of a second of a
    // boost is nearly twice the level it settles to. That contrast IS the
    // shove; a boost that arrives at its sustained level has no attack.
    ch.boostAir.gain.gain.setTargetAtTime(
      (v.boosting ? 0.062 : 0) + ch.kick * 0.055, now, 0.05);
    ch.boostAir.filt.frequency.setTargetAtTime(
      (v.boosting ? 1500 : 700) + ch.kick * 900, now, 0.09);

    if (boostStart) this.boostFire(dest);
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

    /* ── under the bed ────────────────────────────────────────────────────
       One lowpass across this driver's whole channel — their car, their
       tyres, their collisions and the rivals near THEM. See MUFFLE_OPEN.

       The small gain lift is not compensation for the lost top end, it is the
       effect: inside a box everything is CLOSER as well as duller, and a
       muffle that only takes away reads as the volume going down.

       0.09 is about a quarter of a second, which at 350 units/second is three
       car lengths. Fast enough to be an event, slow enough not to click. */
    const boxed = this.underBed(arena, v);
    ch.muffle.frequency.setTargetAtTime(
      boxed ? this.MUFFLE_UNDER : this.MUFFLE_OPEN, now, 0.09);
    ch.out.gain.setTargetAtTime(boxed ? 1.14 : 1, now, 0.09);

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
    kitchen: {
      /* THE KITCHEN HAD NO BED. Both kitchen tracks raced to the bedroom
         floor's tune, under a bedroom clock, which is the audio version of the
         bug the art pass fixed when it found carpet pile printed on the
         kitchen tiles. A world is a place or it is not.

         Glazed tile and morning light. Lydian is major with the fourth raised
         — one interval, and it is the brightest mode in common use, which is
         what a kitchen at breakfast is. Highest register in the game because
         the room is hard and everything in it rings; a triangle lead over a
         square pulse is the only timbre pair not already taken. */
      name: 'breakfast on the table',
      beat: 0.206, root: 659, bass: 165,
      scale: [0, 2, 4, 6, 7, 9, 11],
      lead: 'triangle', pulse: 'square',
      leadVol: 0.065, bassVol: 0.12, shaker: 0.05, shakerHz: 4200,
      step: 4,
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
    /* The kitchen had no room of its own either, so it borrowed the bedroom's
       — a clock ticking in the dark over a race across a breakfast table. The
       room is part of the world; there are four worlds. */
    kitchen: {
      every: [3.0, 6.0],
      voices: [
        // The fridge, cycling in the corner. Low, flat, and the only thing in
        // here that is always about to stop.
        { w: 4, play: function (A, d) { A.gust(d, 2.6, 0.028, 180); } },
        // A tap not quite off, into a steel sink.
        { w: 3, play: function (A, d) {
            A.blip(2600, 0.014, 'sine', 0.026, 1500, A.sfxBus, d);
          } },
        // China settling on the drainer: two hard bright taps, close together.
        { w: 3, play: function (A, d) {
            A.blip(1900, 0.03, 'triangle', 0.026, 2300, A.sfxBus, d);
            A.blip(2300, 0.02, 'triangle', 0.018, 2700, A.sfxBus, d + 0.06);
          } },
        // A chair foot dragged on tile. The one soft thing in a hard room.
        { w: 2, play: function (A, d) {
            A.thud(0.040, 210, 0.30, 1.6, A.sfxBus, d);
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
