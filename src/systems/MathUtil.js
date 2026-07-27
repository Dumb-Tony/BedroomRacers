/* =============================================================================
   MATH — small helpers shared by the simulation.
   ========================================================================== */

window.BR = window.BR || {};

BR.M = {

  clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  /* Move `a` toward `b` by at most `maxStep`. Frame-rate safe when maxStep is
     already multiplied by dt. */
  approach(a, b, maxStep) {
    if (a < b) return Math.min(a + maxStep, b);
    if (a > b) return Math.max(a - maxStep, b);
    return b;
  },

  /* Wrap an angle to (-PI, PI]. */
  wrapAngle(a) {
    while (a >  Math.PI) a -= Math.PI * 2;
    while (a <= -Math.PI) a += Math.PI * 2;
    return a;
  },

  /* Smallest signed angle from a to b. */
  angleDelta(a, b) {
    return this.wrapAngle(b - a);
  },

  /* Per-tick decay factors in tuning.js are authored at 60Hz. This converts
     them to the actual timestep so the feel is identical if the timestep
     ever changes. */
  decay(factor, dt) {
    return Math.pow(factor, dt * 60);
  },
};
