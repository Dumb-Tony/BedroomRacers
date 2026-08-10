/* =============================================================================
   INPUT — keyboard to a normalised input struct.
   =============================================================================
   The struct below is the ONLY way anything drives a vehicle.

   AI drivers will produce this same struct (04_AI.md), which is what
   guarantees AI cannot cheat — it has access to exactly the inputs a player
   has, no more. Do not add a second path into VehicleController.

       { steer: -1..1, throttle: 0..1, brake: 0..1, drift: bool, boost: bool }
   ========================================================================== */

window.BR = window.BR || {};

BR.Input = {
  keys: {},
  autoAccelerate: true,   // default ON per 02_Mechanics.md (simple scheme)

  /* Non-gameplay keys, consumed once then cleared. */
  pressed: {},

  /* Typing into a field must not also drive the car — otherwise Space drifts
     while you are selecting text, and arrows steer while a slider has focus. */
  isTypingTarget(el) {
    if (!el) return false;
    const t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
  },

  init() {
    window.addEventListener('keydown', (e) => {
      if (this.isTypingTarget(e.target)) return;
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      // Stop the page scrolling out from under the game
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    // Always clear on keyup, even from a field — otherwise a key pressed while
    // typing and released elsewhere stays stuck down.
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // Dropping focus mid-drift leaves keys stuck down otherwise
    window.addEventListener('blur', () => { this.keys = {}; });

    // Chrome will not report pads until one is used, so the connect event is
    // what actually wakes them up.
    const self = this;
    const recount = function () { self.padCount = self.pads().length; };
    window.addEventListener('gamepadconnected', recount);
    window.addEventListener('gamepaddisconnected', recount);
    recount();
  },

  down(...codes) {
    return codes.some((c) => !!this.keys[c]);
  },

  /* True once per physical press. For toggles and resets. */
  tapped(code) {
    if (this.pressed[code]) { this.pressed[code] = false; return true; }
    return false;
  },

  clearTaps() {
    this.pressed = {};
  },

  /* ── control profiles ────────────────────────────────────────────────────
     SOLO IS UNCHANGED. A whole session of muscle memory has been built on
     arrows-or-WASD with Space and Shift, and split-screen is not a reason to
     move it.

     The two-player profiles split the keyboard physically — one player on the
     arrows with the right-hand modifiers, one on WASD with the left-hand ones —
     so nobody is reaching across anybody. Ctrl is deliberately avoided: Ctrl+W
     closes the tab. */
  PROFILES: {
    solo: {
      left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
      up:   ['ArrowUp', 'KeyW'],   down:  ['ArrowDown', 'KeyS'],
      drift: ['Space'], boost: ['ShiftLeft', 'ShiftRight'],
      item: ['KeyE'],
    },
    p1: {
      left: ['ArrowLeft'], right: ['ArrowRight'],
      up:   ['ArrowUp'],   down:  ['ArrowDown'],
      drift: ['ShiftRight'], boost: ['Enter'],
      item: ['Slash'],
    },
    p2: {
      left: ['KeyA'], right: ['KeyD'],
      up:   ['KeyW'], down:  ['KeyS'],
      drift: ['ShiftLeft'], boost: ['Space'],
      item: ['KeyQ'],
    },
    // Three and four sit between the outer two, so the hands go
    // left-to-right: WASD, TFGH, IJKL, arrows. No numpad — laptops do not have
    // one, and a control scheme that excludes half the machines is not a
    // control scheme.
    p3: {
      left: ['KeyJ'], right: ['KeyL'],
      up:   ['KeyI'], down:  ['KeyK'],
      drift: ['KeyU'], boost: ['KeyO'],
      item: ['KeyP'],
    },
    p4: {
      left: ['KeyF'], right: ['KeyH'],
      up:   ['KeyT'], down:  ['KeyG'],
      drift: ['KeyR'], boost: ['KeyY'],
      item: ['KeyV'],
    },
  },

  LABELS: {
    /* The one seat that had no label — because labels were only ever drawn in
       split screen, so the SOLO player, who is the one most likely to be seeing
       this game for the first time, was told nothing at all.

       Its bindings are NOT p1's: solo drifts on Space and boosts on Shift,
       where p1 drifts on R-Shift and boosts on Enter. Borrowing p1's label
       would have taught the wrong keys, which is worse than silence. */
    solo: '← →  or  A D   ·   SPACE drift   ·   SHIFT boost   ·   E item',
    p1: '← →  ·  R-SHIFT drift  ·  ENTER boost',
    p2: 'A  D  ·  L-SHIFT drift  ·  SPACE boost',
    p3: 'J  L  ·  U drift  ·  O boost',
    p4: 'F  H  ·  R drift  ·  Y boost',
  },

  /* Same line for a pad, wherever a keyboard label would be shown. */
  PAD_LABEL: 'GAMEPAD   ·   stick   ·   A drift   ·   X boost',

  /* Profile order is also seating order, left to right across the keyboard. */
  PROFILE_ORDER: ['p2', 'p4', 'p3', 'p1'],

  /* ── gamepads ────────────────────────────────────────────────────────────
     The real answer to the keyboard rollover ceiling. Four drivers sharing one
     keyboard exceeds what most of them can physically report; four pads report
     independently and cannot ghost.

     They also give ANALOG steering, which the keyboard's -1/0/1 cannot. The
     vehicle controller already multiplies `steer` by a turn rate, so a stick
     works with no change to the simulation — it simply asks for less lock.

     Standard mapping. Seats claim CONNECTED pads in order, so seat one takes
     the first pad and anyone without one falls back to their keys. Two pads and
     four players is a perfectly sensible arrangement.                        */
  DEADZONE: 0.18,

  BUTTON: {
    drift:  [0, 4],    // A, or left bumper
    boost:  [2, 5],    // X, or right bumper
    item:   [1, 3],    // B or Y — the free face buttons
    brake:  [1],       // B
    accel:  [7],       // right trigger
    slow:   [6],       // left trigger
    pause:  [9],       // start
    dpadL:  [14],
    dpadR:  [15],
    // Menus only — driving never needs up or down on the pad.
    dpadU:  [12],
    dpadD:  [13],
  },

  padCount: 0,
  _padPrev: {},

  pads() {
    if (!navigator.getGamepads) return [];
    const raw = navigator.getGamepads();
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].connected) out.push(raw[i]);
    }
    return out;
  },

  /** The pad for a seat, or null if that seat is on the keyboard. */
  padFor(seat) {
    const list = this.pads();
    return list[seat] || null;
  },

  btn(pad, idx) {
    const b = pad.buttons[idx];
    if (!b) return 0;
    return typeof b === 'object' ? (b.pressed ? 1 : b.value) : b;
  },

  anyBtn(pad, list) {
    for (let i = 0; i < list.length; i++) {
      if (this.btn(pad, list[i]) > 0.5) return true;
    }
    return false;
  },

  /* Deadzone, then rescale so the usable range still reaches full lock —
     otherwise the stick can never ask for more than 82% of the steering. */
  axis(pad, i) {
    let v = pad.axes[i] || 0;
    const dz = this.DEADZONE;
    if (Math.abs(v) < dz) return 0;
    v = (v - Math.sign(v) * dz) / (1 - dz);
    return v < -1 ? -1 : (v > 1 ? 1 : v);
  },

  samplePad(pad) {
    let steer = this.axis(pad, 0);
    // D-pad as a fallback for anyone who prefers it, or a broken stick.
    if (steer === 0) {
      if (this.anyBtn(pad, this.BUTTON.dpadL)) steer = -1;
      else if (this.anyBtn(pad, this.BUTTON.dpadR)) steer = 1;
    }

    const accel = this.btn(pad, this.BUTTON.accel[0]);
    const slow  = this.btn(pad, this.BUTTON.slow[0]);

    return {
      steer: steer,
      throttle: this.autoAccelerate ? 1 : accel,
      brake: Math.max(slow, this.anyBtn(pad, this.BUTTON.brake) ? 1 : 0),
      drift: this.anyBtn(pad, this.BUTTON.drift),
      boost: this.anyBtn(pad, this.BUTTON.boost),
      item:  this.anyBtn(pad, this.BUTTON.item),
    };
  },

  /** True once per physical press of Start, on any pad. */
  padPauseTapped() {
    const list = this.pads();
    let hit = false;
    for (let i = 0; i < list.length; i++) {
      const down = this.anyBtn(list[i], this.BUTTON.pause);
      const key = 'pause' + i;
      if (down && !this._padPrev[key]) hit = true;
      this._padPrev[key] = down;
    }
    return hit;
  },

  /**
   * Build the frame's input struct for a seat.
   * A connected pad wins; otherwise the seat's keyboard profile is used.
   */
  sample(profileId, seat) {
    const pad = this.padFor(seat || 0);
    if (pad) return this.samplePad(pad);

    const p = this.PROFILES[profileId] || this.PROFILES.solo;
    let left  = this.down.apply(this, p.left);
    let right = this.down.apply(this, p.right);
    const up    = this.down.apply(this, p.up);
    const down  = this.down.apply(this, p.down);
    let drift = this.down.apply(this, p.drift);
    let boost = this.down.apply(this, p.boost);
    let item  = this.down.apply(this, p.item || []);

    /* On-screen buttons, ORed in for SEAT ONE ONLY. Touch produces the same
       booleans a key does and goes through this same struct, so the vehicle
       controller, the AI and every measured target time see no difference —
       the alternative, a separate touch driving model, would have been a
       second game to tune. Four thumbs on one phone is not a thing, so the
       split-screen seats stay on keys and pads. */
    const T = BR.Touch;
    if (T && T.active && (seat || 0) === 0) {
      const t = T.state;
      left  = left  || t.left;
      right = right || t.right;
      drift = drift || t.drift;
      boost = boost || t.boost;
      item  = item  || t.item;
    }

    return {
      steer:    (right ? 1 : 0) - (left ? 1 : 0),
      throttle: this.autoAccelerate ? 1 : (up ? 1 : 0),
      // Drift doubles as brake in the simple scheme (02_Mechanics.md). Drift
      // only bites while moving; at low speed it reads as braking.
      brake:    down ? 1 : 0,
      drift:    drift,
      boost:    boost,
      item:     item,
    };
  },
};
