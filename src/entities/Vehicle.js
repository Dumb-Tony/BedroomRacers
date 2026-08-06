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

      /* ── height ────────────────────────────────────────────────────────
         `z` is height ABOVE THE TRACK SURFACE, not above the world. On a flat
         track those are the same thing and nothing changed; on an elevated one
         the deck itself is at `roadZ` and the car draws at roadZ + z.

         Keeping them apart is what leaves the jump physics and every clearAt
         threshold meaning exactly what they meant before. */
      z: 0, vz: 0, grounded: true,
      roadZ: 0,           // height of the deck under the car
      level: 0,           // which deck — only walls on it can be hit
      lineIdx: -1,        // last known centreline index, for windowed lookup

      // ── loops ───────────────────────────────────────────────────────────
      rail: null,         // the ride currently carrying this car, if any
      railIndex: -1,      // edge trigger, so a loop cannot immediately re-board

      // ── going over the edge ─────────────────────────────────────────────
      falling: false,
      fallTimer: 0,
      fallSpeed: 0,
      trackDist: 0,       // distance to the centreline, for the edge test
      lastSafeIdx: -1,    // last centreline index reached while ON the road
      recovered: 0,       // how many times this car has been put back

      // ── items (item races only) ─────────────────────────────────────────
      item: null,         // the one held item, or null. No stacking.
      itemHeld: false,    // edge trigger on the fire button
      windUp: 0,          // acceleration boost, seconds left
      shield: 0,          // absorbs one hit, seconds left
      shieldPopped: 0,    // brief flash after a shield eats something
      stunTime: 0,        // control lost, capped at Items.MAX_STUN

      /* Counters, not booleans. Audio edge-detects these once per RENDERED
         frame — a fixed step can run several times per frame, and firing a
         sound per sub-step machine-guns it (Audio.js). */
      itemPickups: 0,
      itemFires: 0,
      lastItemOffensive: false,
      stunHits: 0,
      shieldPops: 0,

      roll: 0,            // how far round a ride the car is — diagnostics
      /* Which way is up for THIS car — render only, and the simulation never
         reads it. A vector rather than an angle because a loop pitches and a
         corkscrew rolls, and one number cannot say which. */
      up: { x: 0, y: 0, z: 1 },
      prevUp: { x: 0, y: 0, z: 1 },

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

      // Impact counter and severity. Audio edge-detects the counter once per
      // rendered frame rather than being called from inside the fixed step —
      // see Audio.js.
      impacts: 0,
      lastImpact: 0,

      /* How hard collisions hit THIS vehicle. 04_AI.md promises "more forgiving
         collision handling" and "stronger player recovery" on Easy; this is
         where that lands. 1 is normal, lower is gentler. */
      forgiveness: 1,

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
    v.impacts = 0; v.lastImpact = 0;
    v.lastLanding = null; v.landingFlash = 0;
  },

  speed(v) {
    return Math.hypot(v.vel.x, v.vel.y);
  },
};
