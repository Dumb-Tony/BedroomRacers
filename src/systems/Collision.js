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

      // Degenerate: centre exactly on the segment. Pick an arbitrary normal
      // rather than dividing by zero.
      if (d < 1e-6) { dx = 1; dy = 0; d = 1e-6; }

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
      // collision outcomes).
      const loss = 1 - (P.collisionSpeedLoss * squareness) / v.spec.weight;
      v.vel.x *= loss;
      v.vel.y *= loss;

      // Square, fast hits spin the car. HARD capped — see below.
      if (squareness > P.spinTriggerDot && speedBefore > 80 && v.spinTime <= 0) {
        const dir = Math.sign(v.vel.x * ny - v.vel.y * nx) || 1;
        v.spinTime = P.spinRecoveryTime * squareness;
        v.spinVel  = 7 * squareness * dir;
      }

      contacts++;
    }

    return contacts;
  },

  /**
   * Ramp triggers. Axis-aligned boxes; launch scales with entry speed so a
   * crawling approach barely leaves the ground.
   */
  checkRamps(v, ramps) {
    if (!v.grounded) return;
    for (let i = 0; i < ramps.length; i++) {
      const rp = ramps[i];
      if (v.x < rp.x || v.x > rp.x + rp.w) continue;
      if (v.y < rp.y || v.y > rp.y + rp.h) continue;

      const speed = Math.hypot(v.vel.x, v.vel.y);
      const frac  = Math.min(1, speed / v.spec.maxSpeed);
      if (frac < 0.15) continue;

      v.vz = rp.launch * frac;
      v.grounded = false;
      return;
    }
  },
};
