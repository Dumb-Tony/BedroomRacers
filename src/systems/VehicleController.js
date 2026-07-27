/* =============================================================================
   VEHICLE CONTROLLER — the core of the game.
   =============================================================================
   Arcade model: FACING is separated from MOTION, and the gap between them is
   the drift. Custom integration, no physics engine — see 03_Driving_Physics.md
   for why.

   Per-frame order:
     1. decompose velocity into forward / lateral in the CURRENT basis
     2. shed lateral velocity according to grip      <- the drift lever
     3. rotate heading (steering)
     4. apply engine / brake / boost along forward
     5. friction and drag
     6. recompose in the OLD basis                   <- this is what creates slip
     7. integrate position on the flat plane
     8. integrate height under gravity

   Step 6 is the subtle one. Recomposing with the OLD basis means rotating the
   car does NOT rotate its velocity. Next tick, decomposing in the new basis
   finds a lateral component that wasn't there before — that is slip, and it is
   the entire reason the car can drift.

   This function is used by the player AND by AI (04_AI.md). Both supply the
   same input struct. There is no second path in, which is what guarantees AI
   cannot cheat.
   ========================================================================== */

window.BR = window.BR || {};

BR.VehicleController = {

  /**
   * @param {object} v     vehicle state
   * @param {object} input { steer, throttle, brake, drift, boost }
   * @param {number} dt    fixed timestep, seconds
   */
  step(v, input, dt) {
    const P = BR.PHYSICS;
    const M = BR.M;
    const S = BR.SURFACES[v.surface] || BR.SURFACES.rugRoad;
    const spec = v.spec;

    // Snapshot for render interpolation. The renderer draws between the last
    // two simulation states, so a 144Hz display doesn't stutter on a 60Hz sim.
    v.prevX = v.x; v.prevY = v.y; v.prevZ = v.z; v.prevHeading = v.heading;

    // ── 1. basis vectors from heading (flat world plane) ───────────────────
    const fx = Math.cos(v.heading), fy = Math.sin(v.heading);
    const lx = -fy,                 ly = fx;

    let vF = v.vel.x * fx + v.vel.y * fy;   // forward component
    let vL = v.vel.x * lx + v.vel.y * ly;   // lateral component
    const speed = Math.hypot(v.vel.x, v.vel.y);

    // ── 2. grip — THE drift lever ──────────────────────────────────────────
    // `retention` is the fraction of LATERAL velocity kept each tick.
    //   low  (0.86) = lateral killed fast  = car goes where it points
    //   high (0.97) = lateral persists     = car slides
    const target = input.drift ? P.lateralRetentionDrift : P.lateralRetentionNormal;
    v.retention = M.approach(v.retention, target, P.retentionBlendRate * dt);

    // Handling and surface scale it as an EXPONENT, which keeps the result in
    // (0,1) for any stat combination. Exponent < 1 pushes retention toward 1
    // (more slide), > 1 pushes it toward 0 (more bite).
    const retentionEff = Math.pow(v.retention, spec.handling * S.grip);
    vL *= M.decay(retentionEff, dt);

    // ── 3. steering ────────────────────────────────────────────────────────
    let authority = 1;
    if (!v.grounded)    authority *= P.airControl;   // limited air correction
    if (v.spinTime > 0) authority *= 0.15;           // barely any control mid-spin

    let turn = this.turnRateFor(speed, spec) * input.steer * authority;
    if (input.drift) turn *= P.driftTurnBonus;       // why drifting corners tighter
    if (vF < -5)     turn = -turn;                   // reversing flips steering

    v.heading += turn * dt;

    // Collision spin, hard-capped by spinRecoveryTime. Frustration scales
    // non-linearly with time spent not driving (02_Mechanics.md).
    if (v.spinTime > 0) {
      v.heading += v.spinVel * dt;
      v.spinTime -= dt;
      v.spinVel = M.approach(v.spinVel, 0, 12 * dt);
      if (v.spinTime <= 0) { v.spinTime = 0; v.spinVel = 0; }
    }

    // ── 4. engine, brake, boost ────────────────────────────────────────────
    const accelMul = spec.acceleration / BR.ACCEL_REFERENCE;

    if (input.throttle > 0 && v.grounded) {
      vF += P.engineForce * accelMul * S.accel * input.throttle * dt;
    }

    if (input.brake > 0 && v.grounded) {
      if (vF > 0) {
        vF = Math.max(0, vF - P.brakeForce * dt);
      } else {
        // Reverse is deliberately slow — it exists to recover from a wall.
        vF = Math.max(-P.reverseMaxSpeed, vF - P.brakeForce * P.reverseForceMul * dt);
      }
    }

    if (input.boost && !v.boosting && v.boostMeter >= P.boostMinToFire && v.grounded) {
      v.boosting = true;
      v.boostTime = P.boostDuration;
    }
    if (v.boosting) {
      vF += P.boostForce * spec.boostPower * dt;
      v.boostMeter = Math.max(0, v.boostMeter - P.boostDrainRate * dt);
      v.boostTime -= dt;
      if (v.boostTime <= 0 || v.boostMeter <= 0) {
        v.boosting = false;
        v.boostTime = 0;
      }
    }

    // Soft speed cap. Decaying rather than clamping means boost ending is a
    // fade, not a snap.
    const boostMul = v.boosting ? 1 + (P.boostMaxSpeedMul - 1) * spec.boostPower : 1;
    const maxForward = spec.maxSpeed * S.maxSpeed * boostMul;
    if (vF > maxForward) {
      vF = Math.max(maxForward, vF - P.overspeedDecay * dt);
    }

    // ── 5. friction and drag ───────────────────────────────────────────────
    // Rolling friction is tyres against the floor, so it must NOT apply in
    // mid-air. It used to, which scrubbed so much speed off a jump that the
    // car landed far shorter than its launch velocity implied and every jump
    // felt like being caught in a net. Air drag still applies.
    if (v.grounded) vF *= M.decay(P.rollingFriction, dt);
    vF -= P.dragCoefficient * vF * Math.abs(vF) * dt;

    // ── 6. recompose in the OLD basis (see header) ─────────────────────────
    v.vel.x = fx * vF + lx * vL;
    v.vel.y = fy * vF + ly * vL;

    // ── 7. integrate on the flat plane ─────────────────────────────────────
    v.x += v.vel.x * dt;
    v.y += v.vel.y * dt;

    // ── slip angle, for drift charge and the HUD ───────────────────────────
    const newSpeed = Math.hypot(v.vel.x, v.vel.y);
    if (newSpeed > 5) {
      let s = Math.abs(M.angleDelta(v.heading, Math.atan2(v.vel.y, v.vel.x)));
      // Past 90 degrees the car is travelling backwards, not drifting.
      if (s > Math.PI / 2) s = Math.PI - s;
      v.slip = s;
    } else {
      v.slip = 0;
    }

    // ── drift charge — continuous on slip, deliberately NOT tiered ─────────
    // Tiers reward holding a drift for a fixed duration, which trains players
    // to slide on straights to farm boost. Charging on slip angle rewards
    // drifting where the corners actually are. See 03_Driving_Physics.md.
    if (input.drift && v.grounded &&
        v.slip > P.driftMinAngle && newSpeed > P.driftMinSpeed) {
      const q = M.clamp((v.slip - P.driftMinAngle) / P.driftQualitySpan, 0, 1);
      const rate = P.driftChargeRate * (0.4 + 0.6 * q);
      // Banked immediately — no "lose it if you release wrong" moment. The
      // audience includes eight-year-olds (00_Vision.md).
      v.boostMeter  = Math.min(1, v.boostMeter + rate * dt);
      v.driftCharge = Math.min(1, v.driftCharge + rate * 1.5 * dt);
      v.driftQuality = q;
    } else {
      v.driftCharge = Math.max(0, v.driftCharge - P.driftChargeFalloff * dt);
      v.driftQuality = 0;
    }

    // ── 8. height ──────────────────────────────────────────────────────────
    if (!v.grounded || v.z > 0) {
      v.vz -= P.gravity * dt;
      v.z  += v.vz * dt;
      if (v.z <= 0) this.land(v, newSpeed);
    }

    if (v.landingFlash > 0) v.landingFlash = Math.max(0, v.landingFlash - dt);
  },

  /**
   * Turn rate as a CURVE over speed, not a constant.
   * Sluggish when crawling, tightest mid-range, reduced at top speed so fast
   * straights feel committed rather than twitchy.
   */
  turnRateFor(speed, spec) {
    const P = BR.PHYSICS;
    const M = BR.M;
    let rate;

    if (speed < P.turnSpeedFloor) {
      // Ramp in — a stationary car shouldn't pirouette.
      rate = P.turnRateBase * M.lerp(0.3, 1, speed / P.turnSpeedFloor);
    } else if (speed <= P.turnSpeedPeak) {
      rate = P.turnRateBase;
    } else {
      const span = Math.max(1, spec.maxSpeed - P.turnSpeedPeak);
      const t = M.clamp((speed - P.turnSpeedPeak) / span, 0, 1);
      rate = P.turnRateBase * M.lerp(1, P.turnRateAtMax, t);
    }

    return rate * spec.handling;
  },

  /** Landing. Clean landings pay out, bad ones scrub speed — never a crash. */
  land(v, speed) {
    const P = BR.PHYSICS;
    const M = BR.M;

    v.z = 0; v.vz = 0; v.grounded = true;

    if (speed < 5) { v.lastLanding = null; return; }

    let m = Math.abs(M.angleDelta(v.heading, Math.atan2(v.vel.y, v.vel.x)));
    if (m > Math.PI / 2) m = Math.PI - m;

    if (m < P.landingGraceAngle) {
      v.boostMeter = Math.min(1, v.boostMeter + P.cleanLandingBoost);
      v.lastLanding = 'clean';
    } else {
      const t = M.clamp(
        (m - P.landingGraceAngle) / (Math.PI / 2 - P.landingGraceAngle), 0, 1);
      const loss = 1 - P.badLandingPenalty * t;
      v.vel.x *= loss;
      v.vel.y *= loss;
      v.lastLanding = 'bad';
    }

    v.landingFlash = 0.6;
  },
};
