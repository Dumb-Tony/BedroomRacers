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

  /** Build the frame's input struct. */
  sample() {
    const left  = this.down('ArrowLeft',  'KeyA');
    const right = this.down('ArrowRight', 'KeyD');
    const up    = this.down('ArrowUp',    'KeyW');
    const down  = this.down('ArrowDown',  'KeyS');

    return {
      steer:    (right ? 1 : 0) - (left ? 1 : 0),
      throttle: this.autoAccelerate ? 1 : (up ? 1 : 0),
      // Space is drift AND brake in the simple scheme (02_Mechanics.md).
      // Drift only bites while moving; at low speed it reads as braking.
      brake:    down ? 1 : 0,
      drift:    this.down('Space'),
      boost:    this.down('ShiftLeft', 'ShiftRight'),
    };
  },
};
