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

  /* sandReading — how much a driver steers toward sand that has already been
     packed down (SandGrid.js). Inert on tracks without sand. It is the only
     trait that reads the world rather than the authored line, and it is what
     makes a worn line something opponents will take off you. */
  PERSONALITIES: {
    rookie: {
      name: 'Rookie',
      /* 0.80 made the Rookie a rolling roadblock rather than a beginner-
         friendly opponent: measured solo, 36.1s a lap against the Speedster's
         29.1 — a 24% deficit that a competent player turns into a full lap
         inside three. Being the slowest in the field is the point; being
         seven seconds a lap slower is not a difficulty setting, it is an
         absence of one. */
      targetSpeedMul: 0.91, lineAccuracy: 0.65, cornerCaution: 1.35,
      boostEfficiency: 0.25, mistakeChance: 0.16, driftSkill: 0.4,
      sandReading: 0.15,      // hasn't noticed the ground is different
      itemSkill: 0.25,        // sits on things and fires them late
    },
    technician: {
      name: 'Technician',
      targetSpeedMul: 0.99, lineAccuracy: 0.95, cornerCaution: 0.95,
      boostEfficiency: 0.90, mistakeChance: 0.03, driftSkill: 0.95,
      sandReading: 0.95,      // reading the surface is the whole personality
      itemSkill: 0.95,        // waits for a target, then uses it
    },
    speedster: {
      name: 'Speedster',
      targetSpeedMul: 1.10, lineAccuracy: 0.72, cornerCaution: 0.70,
      boostEfficiency: 0.60, mistakeChance: 0.14, driftSkill: 0.6,
      sandReading: 0.45,      // too busy going fast to look down
      itemSkill: 0.6,         // empties the slot the moment it fills
    },
    bully: {
      name: 'Bully',
      targetSpeedMul: 0.96, lineAccuracy: 0.70, cornerCaution: 1.05,
      boostEfficiency: 0.50, mistakeChance: 0.08, driftSkill: 0.5,
      sandReading: 0.55,      // will happily take the line you just made
      itemSkill: 0.8,         // saves the offensive ones for company
    },
  },

  /* NORMAL IS THE ANCHOR AND MUST NOT MOVE. Every target time in events.js is
     calibrated against a Technician on normal, so changing either would
     silently invalidate eighteen events' worth of medals. Difficulty is
     adjusted at the ends instead.

     Hard was 1.06 — a 6% lift on a field whose fastest car already lapped
     slower than a competent human, which is to say it was not a hard mode at
     all. */
  DIFFICULTY: {
    easy:   { speed: 0.90, mistake: 1.8,  boost: 0.6, forgiveness: 0.55 },
    normal: { speed: 1.00, mistake: 1.0,  boost: 1.0, forgiveness: 1.0 },
    hard:   { speed: 1.15, mistake: 0.40, boost: 1.3, forgiveness: 1.0 },
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
      wander: 0,          // the personality half of lateralTarget
      sandOffset: null,   // the packed-sand half, null when the sand is uniform
      sandTimer: 0,
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

  /* ── reading the sand ────────────────────────────────────────────────────
     Sample points across the road, as a fraction of the scan radius.

     THE SCAN RADIUS IS SET BY THE GRID, NOT THE ROAD. The first version scanned
     a fraction of the racing line's usable width, which on Dune Dash is 134
     units — so the whole five-point scan fitted inside a single 70-unit sand
     cell, every sample returned the same number, and half the reads came back
     "no opinion". The AI could not see a packed line it was driving alongside.
     A scan narrower than one cell cannot resolve anything by construction.

     8Hz, not per frame: the sand changes far slower than that, and the result
     is eased into ai.lateral anyway. Sampling faster only chases noise. */
  SAND_SAMPLES: [-1, -0.55, 0, 0.55, 1],
  SAND_INTERVAL: 0.125,
  SAND_MARGIN: 0.06,     // ignore differences this small — flat sand is a tie
  SAND_CLEARANCE: 45,    // never aim this close to the kerb, whatever the sand

  /**
   * Steer toward sand that is already packed.
   *
   * FAIRNESS: this reads BR.SandGrid, which is drawn on screen — the AI is
   * looking at the ground exactly as a player does. It gets no lap times, no
   * opponent state and no lookahead the player lacks. Keep it that way; the
   * moment an AI knows something invisible, the racing stops feeling fair
   * (04_AI.md).
   *
   * @returns {number} lateral offset in world units, or null for "no opinion"
   */
  readSand(ai, tgt, la, halfWidth) {
    const SG = BR.SandGrid;
    if (!SG || !SG.active) return null;

    /* At least one cell either side, or the scan cannot tell two cells apart —
       but never so far out that aiming there puts a wheel in the kerb.

       The clearance is not optional. Without it the scan asked for a full cell
       regardless of the road: on The Big Dig, 230 units wide with unjumpable
       trench walls, the driver aimed 70 units off the line with 115 to play
       with and spent the race grinding along the wall — 31 impacts and a
       63-second lap. Wide tracks never showed it. */
    const room = (halfWidth || tgt.width) - this.SAND_CLEARANCE;
    const radius = Math.min(Math.max(tgt.width * 0.5, SG.CELL), room);

    // A road too narrow for a full-cell scan cannot resolve one cell from the
    // next, so there is nothing honest to say. Drive the line.
    if (radius < SG.CELL * 0.7) return null;

    let bestOff = 0, best = -1, flattest = 2;

    for (let k = 0; k < this.SAND_SAMPLES.length; k++) {
      const off = this.SAND_SAMPLES[k] * radius;
      const c = SG.at(tgt.x - Math.sin(la) * off, tgt.y + Math.cos(la) * off);
      if (c > best) { best = c; bestOff = off; }
      if (c < flattest) flattest = c;
    }

    // On lap one every sample is loose and every sample is equal. Returning an
    // offset there would be the AI inventing a preference out of nothing.
    if (best - flattest < this.SAND_MARGIN) return null;
    return bestOff;
  },

  /* ── avoiding what is standing in the road ───────────────────────────────
     Step 6 of the driver loop in 04_AI.md — "checks for obstacles ahead, nudges
     the lateral offset to avoid" — which was specified and never built. It went
     unnoticed for six phases because every bedroom track keeps its props at the
     edges, where an AI on the line never meets one.

     Putting buckets in the road on Bucket Brigade found it immediately: the
     field drove into them lap after lap, 27 impacts and 2029 ticks stuck
     against a Dune Dash baseline of zero and 105. */
  AVOID_AHEAD: 300,      // how far up the road to care about, world units
  AVOID_BEHIND: -90,     // a little behind the aim point, for props alongside
  AVOID_MARGIN: 20,      // extra room beyond the two radii

  /**
   * Shifts a desired lateral offset sideways until it misses every prop ahead.
   * Picks whichever side needs less movement, so a driver already going round
   * one way commits rather than dithering across the middle.
   *
   * @param {number} want   desired offset from the line
   * @returns {number}      an offset that clears the obstacles
   */
  avoidProps(v, arena, tgt, la, want) {
    const props = arena.props;
    if (!props || !props.length) return want;

    const cos = Math.cos(la), sin = Math.sin(la);
    const limit = arena.halfWidth - v.radius - 8;

    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      // Jumpable, and currently being jumped. Let it through.
      if (p.clearAt !== undefined && p.clearAt !== Infinity && v.z > p.clearAt) {
        continue;
      }
      const dx = p.x - tgt.x, dy = p.y - tgt.y;
      const along  =  dx * cos + dy * sin;
      if (along < this.AVOID_BEHIND || along > this.AVOID_AHEAD) continue;

      const across = -dx * sin + dy * cos;
      const clear  = p.r + v.radius + this.AVOID_MARGIN;
      const gap    = want - across;
      if (Math.abs(gap) >= clear) continue;          // already misses it

      // Go round the near side, unless that would put us off the road.
      const near = across + (gap >= 0 ? clear : -clear);
      const far  = across + (gap >= 0 ? -clear : clear);
      want = Math.abs(near) <= limit ? near : far;
    }
    return Math.max(-limit, Math.min(limit, want));
  },

  /**
   * @returns {object} the same input struct a keyboard produces
   */
  drive(ai, v, arena, dt) {
    const M = BR.M;
    const line = arena.racingLine;
    const n = line.length;
    const input = { steer: 0, throttle: 1, brake: 0, drift: false, boost: false,
                    item: false };

    const speed = Math.hypot(v.vel.x, v.vel.y);
    this.advanceWaypoint(ai, v, line);

    // Look further ahead the faster we go, or the car saws at the wheel.
    const lookahead = 1 + Math.round(M.clamp(speed / 70, 0, 5));
    const tgt = line[(ai.wp + lookahead) % n];

    // Direction of the line at the target. Needed by the sand scan below as
    // well as by the aim, so it is computed before both.
    const ahead = line[(ai.wp + lookahead + 1) % n];
    const la = Math.atan2(ahead.y - tgt.y, ahead.x - tgt.x);

    // Lateral offset: a little personality-driven wander so the field doesn't
    // drive in a single file down one perfect line.
    if (Math.random() < 0.01) {
      ai.wander = (Math.random() * 2 - 1) * tgt.width * 0.34 *
                  (1 - ai.p.lineAccuracy);
    }

    // On sand, a pull toward ground that has already been packed down. Null
    // means the sand ahead is uniform — lap one, or a stretch nobody has used —
    // and the wander is left to do its job alone.
    ai.sandTimer -= dt;
    if (ai.sandTimer <= 0) {
      ai.sandTimer = this.SAND_INTERVAL;
      ai.sandOffset = this.readSand(ai, tgt, la, arena.halfWidth);
    }
    const pull = ai.sandOffset === null ? 0 : ai.p.sandReading;
    ai.lateralTarget = ai.wander * (1 - pull) + (ai.sandOffset || 0) * pull;

    // Whatever the personality and the sand wanted, do not drive into a bucket.
    ai.lateralTarget = this.avoidProps(v, arena, tgt, la, ai.lateralTarget);

    // Faster than the usual easing — an obstacle is not a preference.
    ai.lateral = M.approach(ai.lateral, ai.lateralTarget, 130 * dt);

    // Deliberate mistakes. An AI that never errs feels unbeatable even when
    // slow; an occasional overshoot is what lets a player pass and enjoy it.
    if (ai.mistakeTimer <= 0 && Math.random() < ai.p.mistakeChance * ai.d.mistake * dt) {
      ai.mistakeTimer = 0.25 + Math.random() * 0.4;
    }
    if (ai.mistakeTimer > 0) ai.mistakeTimer -= dt;

    // Aim, offset perpendicular to the line.
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
    /* catchUp is >= 1 always. Trailing cars get a nudge; a leading car is never
       slowed down, because holding a winning player back is the single most
       resented mechanic in arcade racing (04_AI.md).

       THE PRODUCT IS CAPPED. Personality, difficulty and catch-up all multiply
       the corner target, and unbounded they ask a driver to carry more speed
       than the authored line can hold — at which point it overshoots, scrubs,
       and gets SLOWER. Measured before the cap: the Speedster (1.10) on hard
       (1.15) lapped 29.5s against 27.8s on normal. A difficulty setting that
       makes a car slower is not a difficulty setting.

       1.18 is a little above the Technician on hard (0.99 x 1.15 = 1.139), so
       the cautious drivers still get the full benefit of hard and only the
       already-overdriving ones are held back. */
    const AGGRO_CAP = 1.18;
    const aggro = Math.min(AGGRO_CAP,
                           ai.p.targetSpeedMul * ai.d.speed * (ai.catchUp || 1));
    const wantSpeed = v.spec.maxSpeed * limit * aggro;

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

    /* Items (10_Items.md Q2). The AI fires through the SAME input field the
       keyboard uses, so it can do nothing a player cannot. Skill decides how
       long it will hold something: a Technician waits for a target, a Speedster
       empties the slot the moment it fills, a Rookie sits on it. The only
       opponent state read is distance to the nearest car — which is on screen
       for a player anyway, so it is not privileged information. */
    if (v.item && BR.Items) {
      const def = BR.Items.DEFS[v.item];
      if (def && def.offensive) {
        ai.itemHold = (ai.itemHold || 0) + dt;
        if (this.nearestRival(v) < 340 || ai.itemHold > 6 * ai.p.itemSkill) {
          input.item = true;
          ai.itemHold = 0;
        }
      } else if (Math.random() < ai.p.itemSkill * 1.6 * dt) {
        input.item = true;
      }
    } else {
      ai.itemHold = 0;
    }

    return input;
  },

  /** Distance to the closest other car. */
  nearestRival(v) {
    const list = (BR.Game && BR.Game.vehicles) || [];
    let best = Infinity;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === v || o.isGhost) continue;
      const d = Math.hypot(o.x - v.x, o.y - v.y);
      if (d < best) best = d;
    }
    return best;
  },
};
