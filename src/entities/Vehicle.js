/* =============================================================================
   VEHICLE — state only. All behaviour lives in VehicleController.
   =============================================================================
   Position is on the FLAT world plane. `z` is height above it, used only for
   jumps. Nothing here knows the camera is tilted.
   ========================================================================== */

window.BR = window.BR || {};

BR.Vehicle = {

  create(specId, x, y, heading) {
    const spec = BR.VEHICLES[specId];
    if (!spec) throw new Error('Unknown vehicle: ' + specId);

    const v = {
      spec: spec,
      radius: BR.collisionRadius(spec),

      // ── flat-plane state ────────────────────────────────────────────────
      x: x, y: y,
      vel: { x: 0, y: 0 },
      heading: heading || 0,

      // ── height (jumps only) ─────────────────────────────────────────────
      z: 0, vz: 0, grounded: true,

      // ── handling state ──────────────────────────────────────────────────
      retention: BR.PHYSICS.lateralRetentionNormal,  // current lateral slide
      slip: 0,            // rad between heading and travel direction
      surface: 'rugRoad',

      // ── boost ───────────────────────────────────────────────────────────
      boostMeter: 0,      // 0..1, banked and spendable
      boosting: false,
      boostTime: 0,
      driftCharge: 0,     // 0..1, DISPLAY ONLY — current drift's quality
      driftQuality: 0,

      // ── collision ───────────────────────────────────────────────────────
      spinTime: 0,
      spinVel: 0,
      // Which ramp last launched us. Stops a ramp re-firing when the car lands
      // back inside its trigger box.
      rampIndex: -1,

      // ── feedback ────────────────────────────────────────────────────────
      lastLanding: null,
      landingFlash: 0,

      // ── render interpolation (see main.js) ──────────────────────────────
      prevX: x, prevY: y, prevZ: 0, prevHeading: heading || 0,
    };

    return v;
  },

  reset(v, x, y, heading) {
    v.x = x; v.y = y;
    v.prevX = x; v.prevY = y;
    v.vel.x = 0; v.vel.y = 0;
    v.heading = heading || 0;
    v.prevHeading = v.heading;
    v.z = 0; v.vz = 0; v.prevZ = 0; v.grounded = true;
    v.retention = BR.PHYSICS.lateralRetentionNormal;
    v.slip = 0;
    v.boostMeter = 0; v.boosting = false; v.boostTime = 0;
    v.driftCharge = 0; v.driftQuality = 0;
    v.spinTime = 0; v.spinVel = 0;
    v.rampIndex = -1;
    v.lastLanding = null; v.landingFlash = 0;
  },

  speed(v) {
    return Math.hypot(v.vel.x, v.vel.y);
  },
};
