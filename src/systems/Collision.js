/* =============================================================================
   COLLISION — circle vs wall segments, plus ramp triggers.
   =============================================================================
   Vehicles are CIRCLES, not rotated rectangles. That is a design decision, not
   a shortcut: circles never wedge in a corner, and glancing blows slide off
   instead of catching. Both are required by "playful rather than punishing"
   (03_Driving_Physics.md).

   All maths here is on the flat world plane. Nothing in this file knows the
   camera is tilted.
   ========================================================================== */

window.BR = window.BR || {};

BR.Collision = {

  /**
   * Push the vehicle out of every wall it overlaps and reflect its velocity.
   * Mutates the vehicle. Returns the number of contacts this tick.
   */
  resolveWalls(v, walls) {
    const P = BR.PHYSICS;
    const M = BR.M;
    const r = v.radius;
    let contacts = 0;

    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];

      // A vehicle passes OVER anything lower than it is. Structural walls have
      // clearAt = Infinity and are never jumpable; low hurdles are. This is
      // what makes jumps into shortcuts work, and it is why height matters —
      // previously airborne vehicles skipped walls entirely, so any jump
      // cleared any barrier regardless of how high it went.
      if (v.z >= w.clearAt) continue;

      // A barrier on another deck is not in this car's world at all — it is the
      // kerb of a road passing overhead or underneath. Flat tracks leave
      // w.level undefined and every wall applies to everyone, as before.
      if (w.level !== undefined && w.level !== v.level) continue;

      // Closest point on the segment to the circle centre.
      const abx = w.bx - w.ax, aby = w.by - w.ay;
      const apx = v.x  - w.ax, apy = v.y  - w.ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
      t = M.clamp(t, 0, 1);

      const cx = w.ax + abx * t, cy = w.ay + aby * t;
      let dx = v.x - cx, dy = v.y - cy;
      let d = Math.hypot(dx, dy);

      if (d >= r) continue;

      /* Degenerate: centre exactly on the segment. Pick an arbitrary normal
         rather than dividing by zero.

         d MUST be set to 1, not to the epsilon. The next line divides by it to
         normalise, so an epsilon of 1e-6 produced a "unit" normal 1,000,000
         long and the depenetration below threw the car eleven million units
         across the world. It survived this long because a centre landing
         exactly on a segment is rare — but it is reachable, and the failure is
         total when it happens. */
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }

      const nx = dx / d, ny = dy / d;

      // Depenetrate first, so the reflection happens from a legal position.
      v.x += nx * (r - d);
      v.y += ny * (r - d);

      const speedBefore = Math.hypot(v.vel.x, v.vel.y);
      const vn = v.vel.x * nx + v.vel.y * ny;

      // Only respond if actually moving into the wall. Skipping outward
      // motion stops the car buzzing when resting against a barrier.
      if (vn >= 0) { contacts++; continue; }

      // How square was the hit? 0 = grazing, 1 = head-on. Everything scales
      // off this, which is what makes glancing blows barely register.
      const squareness = speedBefore > 1
        ? M.clamp(Math.abs(vn) / speedBefore, 0, 1)
        : 0;

      // Reflect the normal component, keep the tangential component.
      const bounce = 1 + P.collisionRestitution;
      v.vel.x -= bounce * vn * nx;
      v.vel.y -= bounce * vn * ny;

      // Heavier vehicles shrug off impacts (09_Vehicles.md: weight affects
      // collision outcomes). `forgiveness` layers difficulty on top.
      const forgive = v.forgiveness === undefined ? 1 : v.forgiveness;
      const loss = 1 - (P.collisionSpeedLoss * squareness * forgive) / v.spec.weight;
      v.vel.x *= loss;
      v.vel.y *= loss;

      /* ── the cost of leaning ──────────────────────────────────────────────
         Only the NORMAL component is damped, which is correct physics and is
         what makes a glancing blow slide off instead of catching. It also made
         leaning on a wall completely free: measured, holding a car lightly
         against a wall for 115 contact ticks cost 0.3% of its speed and 0% of
         its distance, so the wall was a better racing line than the road and any
         target time could be beaten by using one.

         A TANGENTIAL VELOCITY SCRUB DOES NOT FIX THIS, and it is worth recording
         why: the engine re-accelerates toward the speed cap every tick, so
         scrubbing speed the car can immediately buy back nets out to nothing.
         Measured, a per-tick scrub of 0.9955 — 24% a second on paper — moved the
         real cost from 0.3% to 2.9%.

         What the engine cannot out-accelerate is a lower CEILING. Contact marks
         the car, VehicleController reads the mark and drops its top speed while
         it lasts, and the mark decays in a few ticks. A glance is over before it
         bites; leaning through a corner is capped for the whole corner. The two
         differ by duration, not force, which is exactly the axis this separates
         them on. */
      v.wallContact = P.wallContactTime;

      // Notable hits only. Counting every grazing contact would machine-gun
      // the collision sound while sliding along a kerb.
      if (squareness * speedBefore > 55) {
        v.impacts++;
        v.lastImpact = squareness;
      }

      // Square, fast hits spin the car. HARD capped — see below.
      if (squareness > P.spinTriggerDot && speedBefore > 80 && v.spinTime <= 0) {
        const dir = Math.sign(v.vel.x * ny - v.vel.y * nx) || 1;
        v.spinTime = P.spinRecoveryTime * squareness * forgive;
        v.spinVel  = 7 * squareness * dir * forgive;
      }

      contacts++;
    }

    return contacts;
  },

  /**
   * Ramp triggers. Axis-aligned boxes; launch scales with entry speed so a
   * crawling approach barely leaves the ground.
   *
   * EDGE TRIGGERED. A ramp fires once on entry and cannot fire again until the
   * vehicle has left its box. Without this, a car that lands back inside the
   * trigger relaunches immediately and the ramp behaves like a trampoline
   * rather than a jump.
   */
  checkRamps(v, ramps) {
    let inside = -1;
    for (let i = 0; i < ramps.length; i++) {
      const rp = ramps[i];
      if (v.x < rp.x || v.x > rp.x + rp.w) continue;
      if (v.y < rp.y || v.y > rp.y + rp.h) continue;
      inside = i;
      break;
    }

    // Left every ramp — arm them all again.
    if (inside < 0) { v.rampIndex = -1; return; }

    // Already flying over it, or landed back on the one that launched us.
    if (!v.grounded) return;
    if (v.rampIndex === inside) return;

    const P = BR.PHYSICS;
    const rp = ramps[inside];
    const speed = Math.hypot(v.vel.x, v.vel.y);
    const frac  = Math.min(1, speed / v.spec.maxSpeed);

    // Too slow to get air — just drive over it.
    if (frac < P.rampMinSpeedFrac) return;

    // Must be heading UP the slope. Without this, bouncing back off whatever
    // the ramp launches you over re-enters the box travelling the other way
    // and fires it again, throwing the car backwards off the ramp's back face.
    const rise = rp.rise || [0, -1];
    const dot = (v.vel.x / speed) * rise[0] + (v.vel.y / speed) * rise[1];
    if (dot < P.rampMinApproachDot) return;

    // Launch from the LIP, not the foot of the wedge. How far along the ramp
    // the car has travelled, 0 at the low edge and 1 at the high edge.
    let progress;
    if (rise[0] < 0)      progress = (rp.x + rp.w - v.x) / rp.w;
    else if (rise[0] > 0) progress = (v.x - rp.x) / rp.w;
    else if (rise[1] < 0) progress = (rp.y + rp.h - v.y) / rp.h;
    else                  progress = (v.y - rp.y) / rp.h;
    if (progress < P.rampLipFrac) return;

    v.vz = rp.launch * frac;
    v.grounded = false;
    v.rampIndex = inside;
  },
};
