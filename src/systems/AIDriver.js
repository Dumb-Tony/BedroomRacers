/* =============================================================================
   AI DRIVER — waypoint following on an authored racing line.
   =============================================================================
   No pathfinding, no navmesh, no steering-behaviour stack. Waypoints on a
   bounded track are a solved problem and AI navigation is a listed project
   risk (04_AI.md).

   CRITICAL: an AI driver produces the SAME input struct a keyboard does, and
   the result goes through the same VehicleController. It has no special
   physics and no extra information. That is what guarantees it cannot cheat —
   if an AI car can do something the player's cannot, players notice and the
   racing stops feeling fair.

   Personalities are parameter bundles over one driver, not separate code paths.
   ========================================================================== */

window.BR = window.BR || {};

BR.AIDriver = {

  PERSONALITIES: {
    rookie: {
      name: 'Rookie',
      targetSpeedMul: 0.80, lineAccuracy: 0.65, cornerCaution: 1.35,
      boostEfficiency: 0.25, mistakeChance: 0.16, driftSkill: 0.4,
    },
    technician: {
      name: 'Technician',
      targetSpeedMul: 0.99, lineAccuracy: 0.95, cornerCaution: 0.95,
      boostEfficiency: 0.90, mistakeChance: 0.03, driftSkill: 0.95,
    },
    speedster: {
      name: 'Speedster',
      targetSpeedMul: 1.08, lineAccuracy: 0.72, cornerCaution: 0.70,
      boostEfficiency: 0.60, mistakeChance: 0.14, driftSkill: 0.6,
    },
    bully: {
      name: 'Bully',
      targetSpeedMul: 0.94, lineAccuracy: 0.70, cornerCaution: 1.05,
      boostEfficiency: 0.50, mistakeChance: 0.08, driftSkill: 0.5,
    },
  },

  DIFFICULTY: {
    easy:   { speed: 0.86, mistake: 1.8,  boost: 0.6, forgiveness: 0.55 },
    normal: { speed: 1.00, mistake: 1.0,  boost: 1.0, forgiveness: 1.0 },
    hard:   { speed: 1.06, mistake: 0.45, boost: 1.2, forgiveness: 1.0 },
  },

  /* Ceiling on dynamic assistance. 04_AI.md: it compresses the field, it does
     not decide the race. */
  MAX_CATCHUP: 0.06,

  create(personalityId, difficultyId) {
    const p = this.PERSONALITIES[personalityId] || this.PERSONALITIES.technician;
    const d = this.DIFFICULTY[difficultyId] || this.DIFFICULTY.normal;
    return {
      p: p, d: d,
      wp: 0,              // current waypoint index
      lateral: 0,         // offset from the line, for personality and traffic
      lateralTarget: 0,
      mistakeTimer: 0,    // seconds left of a deliberate error
      stuckTimer: 0,
      recoverTimer: 0,
      lastProgress: 0,
    };
  },

  /** Nearest waypoint ahead, searched locally so it cannot jump the lap. */
  advanceWaypoint(ai, v, line) {
    const n = line.length;
    let best = ai.wp, bd = Infinity;
    // Only look a short way forward — a global search would let a car that
    // cuts the infield teleport its progress round the lap.
    for (let k = 0; k < 12; k++) {
      const i = (ai.wp + k) % n;
      const d = Math.hypot(line[i].x - v.x, line[i].y - v.y);
      if (d < bd) { bd = d; best = i; }
    }
    ai.wp = best;
    return bd;
  },

  /**
   * @returns {object} the same input struct a keyboard produces
   */
  drive(ai, v, arena, dt) {
    const M = BR.M;
    const line = arena.racingLine;
    const n = line.length;
    const input = { steer: 0, throttle: 1, brake: 0, drift: false, boost: false };

    const speed = Math.hypot(v.vel.x, v.vel.y);
    this.advanceWaypoint(ai, v, line);

    // Look further ahead the faster we go, or the car saws at the wheel.
    const lookahead = 1 + Math.round(M.clamp(speed / 70, 0, 5));
    const tgt = line[(ai.wp + lookahead) % n];

    // Lateral offset: a little personality-driven wander so the field doesn't
    // drive in a single file down one perfect line.
    if (Math.random() < 0.01) {
      ai.lateralTarget = (Math.random() * 2 - 1) * tgt.width * 0.34 *
                         (1 - ai.p.lineAccuracy);
    }
    ai.lateral = M.approach(ai.lateral, ai.lateralTarget, 60 * dt);

    // Deliberate mistakes. An AI that never errs feels unbeatable even when
    // slow; an occasional overshoot is what lets a player pass and enjoy it.
    if (ai.mistakeTimer <= 0 && Math.random() < ai.p.mistakeChance * ai.d.mistake * dt) {
      ai.mistakeTimer = 0.25 + Math.random() * 0.4;
    }
    if (ai.mistakeTimer > 0) ai.mistakeTimer -= dt;

    // Aim, offset perpendicular to the line.
    const ahead = line[(ai.wp + lookahead + 1) % n];
    const la = Math.atan2(ahead.y - tgt.y, ahead.x - tgt.x);
    const aimX = tgt.x - Math.sin(la) * ai.lateral;
    const aimY = tgt.y + Math.cos(la) * ai.lateral;

    let want = Math.atan2(aimY - v.y, aimX - v.x);
    if (ai.mistakeTimer > 0) want += 0.32;    // drift wide of the apex

    let err = M.angleDelta(v.heading, want);
    input.steer = M.clamp(err * 2.4, -1, 1);

    // Corner speed. Scan ahead for the slowest waypoint we are about to reach
    // and brake for it early, scaled by caution.
    let limit = 1;
    // Waypoints are ~90 units apart. The old scan reached 9 of them — 810 units
    // — so on a track with a corner every ~800 units the AI was braking almost
    // permanently, and the heaviest car never got up to speed at all.
    const scan = 1 + Math.round(M.clamp(speed / 120, 0, 3) * ai.p.cornerCaution);
    for (let k = 1; k <= scan; k++) {
      const w = line[(ai.wp + k) % n];
      if (w.targetSpeed < limit) limit = w.targetSpeed;
    }
    // catchUp is >= 1 always. Trailing cars get a nudge; a leading car is never
    // slowed down, because holding a winning player back is the single most
    // resented mechanic in arcade racing (04_AI.md).
    const wantSpeed = v.spec.maxSpeed * limit * ai.p.targetSpeedMul *
                      ai.d.speed * (ai.catchUp || 1);

    if (speed > wantSpeed * 1.06) {
      input.brake = 1;
      input.throttle = 0;
    }

    // Drift when the corner demands more rotation than grip will give. Skill
    // decides how well it is timed.
    const needed = Math.abs(err);
    if (needed > 0.34 && speed > 90 && Math.random() < ai.p.driftSkill) {
      input.drift = true;
    }

    // Boost on the exit, when the line ahead is open.
    if (v.boostMeter >= BR.PHYSICS.boostMinToFire &&
        limit > 0.9 && Math.abs(err) < 0.22 &&
        Math.random() < ai.p.boostEfficiency * ai.d.boost * 0.1) {
      input.boost = true;
    }

    // Stuck detection, measured by PROGRESS not speed. Speed-based detection
    // missed the worst case: a car oscillating against a wall under its own
    // brake/reverse recovery is moving fast enough to look fine while going
    // nowhere. Green Pickup managed one lap in 400 seconds that way.
    if (ai.wp !== ai.lastProgress) {
      ai.lastProgress = ai.wp;
      ai.stuckTimer = 0;
    } else {
      ai.stuckTimer += dt;
    }
    if (ai.stuckTimer > 2.5) {
      ai.recoverTimer = 0.8;
      ai.stuckTimer = 0;
    }
    if (ai.recoverTimer > 0) {
      ai.recoverTimer -= dt;
      input.throttle = 0;
      input.brake = 1;              // reverse out
      input.steer = -input.steer;
      input.drift = false;
      input.boost = false;
    }

    return input;
  },
};
