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
    },
    p1: {
      left: ['ArrowLeft'], right: ['ArrowRight'],
      up:   ['ArrowUp'],   down:  ['ArrowDown'],
      drift: ['ShiftRight'], boost: ['Enter'],
    },
    p2: {
      left: ['KeyA'], right: ['KeyD'],
      up:   ['KeyW'], down:  ['KeyS'],
      drift: ['ShiftLeft'], boost: ['Space'],
    },
    // Three and four sit between the outer two, so the hands go
    // left-to-right: WASD, TFGH, IJKL, arrows. No numpad — laptops do not have
    // one, and a control scheme that excludes half the machines is not a
    // control scheme.
    p3: {
      left: ['KeyJ'], right: ['KeyL'],
      up:   ['KeyI'], down:  ['KeyK'],
      drift: ['KeyU'], boost: ['KeyO'],
    },
    p4: {
      left: ['KeyF'], right: ['KeyH'],
      up:   ['KeyT'], down:  ['KeyG'],
      drift: ['KeyR'], boost: ['KeyY'],
    },
  },

  LABELS: {
    p1: '← →  ·  R-SHIFT drift  ·  ENTER boost',
    p2: 'A  D  ·  L-SHIFT drift  ·  SPACE boost',
    p3: 'J  L  ·  U drift  ·  O boost',
    p4: 'F  H  ·  R drift  ·  Y boost',
  },

  /* Profile order is also seating order, left to right across the keyboard. */
  PROFILE_ORDER: ['p2', 'p4', 'p3', 'p1'],

  /** Build the frame's input struct for a control profile. */
  sample(profileId) {
    const p = this.PROFILES[profileId] || this.PROFILES.solo;
    const left  = this.down.apply(this, p.left);
    const right = this.down.apply(this, p.right);
    const up    = this.down.apply(this, p.up);
    const down  = this.down.apply(this, p.down);

    return {
      steer:    (right ? 1 : 0) - (left ? 1 : 0),
      throttle: this.autoAccelerate ? 1 : (up ? 1 : 0),
      // Drift doubles as brake in the simple scheme (02_Mechanics.md). Drift
      // only bites while moving; at low speed it reads as braking.
      brake:    down ? 1 : 0,
      drift:    this.down.apply(this, p.drift),
      boost:    this.down.apply(this, p.boost),
    };
  },
};
