/* =============================================================================
   RAILS — the loop. A scripted ride, on purpose.
   =============================================================================
   07_World_Stunt_Track.md option 3, and the last piece of the box-art fantasy:

     "Loops and corkscrews are scripted rides — the vehicle is constrained to a
      spline, keeps its speed, and control is limited to lateral adjustment.
      Pragmatic. Loops are non-interactive but look spectacular. Common in real
      arcade racers."

   WHY NOT SIMULATE IT. A loop needs the car inverted, held on by centripetal
   force, with gravity pointing into the track rather than away from it. Every
   one of those breaks the flat-plane model that the whole game rests on
   (03_Driving_Physics.md), and the payoff is a few seconds of spectacle the
   player barely steers through anyway. A rail buys the entire look for none of
   the risk — the simulation never learns that up has moved.

   THE HONEST PART. Being on a rail means the car is not being driven, so the
   ride is kept SHORT and the entry is the decision. Arrive fast enough and you
   are taken round; arrive slow and you are not, and you drive along the floor
   under the loop instead. Nothing is confiscated and nothing is punished — the
   loop is a reward you have to be carrying speed to collect, which is the only
   framing that does not feel like the game taking the wheel off you.
   ========================================================================== */

window.BR = window.BR || {};

BR.Rails = {

  /* Direction agreement required at the mouth. Same idea as the ramp's
     approach test: entering a loop backwards, or sliding into it sideways off
     a spin, should not put you on the rail. */
  MIN_APPROACH_DOT: 0.72,

  /**
   * Can this car get on a loop this tick, and if so, put it on.
   * Mirrors Collision.checkRamps: axis-aligned entry box, corner-anchored.
   */
  check(v, rails) {
    if (!rails || !rails.length || v.rail || !v.grounded) return;

    const speed = Math.hypot(v.vel.x, v.vel.y);

    let inside = -1;
    for (let i = 0; i < rails.length; i++) {
      const R = rails[i];
      if (v.x < R.x || v.x > R.x + R.w) continue;
      if (v.y < R.y || v.y > R.y + R.h) continue;
      inside = i;
      break;
    }
    // Clear of every mouth — arm them all again.
    if (inside < 0) { v.railIndex = -1; return; }

    /* EDGE TRIGGERED, for the same reason ramps are. A loop sets the car down
       `length` units along its own direction, which can still be inside the
       mouth it just came out of — so it boards again, and again, and the car
       spends the race going round and round. The full-grid race showed four
       rides over three laps before this was added. */
    if (v.railIndex === inside) return;

    {
      const R = rails[inside];

      // Too slow to make it round. Drive on along the floor — the loop is
      // above you and you simply did not take it.
      if (speed < R.minSpeed) return;

      const dot = (v.vel.x / (speed || 1)) * R.dir[0] +
                  (v.vel.y / (speed || 1)) * R.dir[1];
      if (dot < this.MIN_APPROACH_DOT) return;

      v.rail = {
        def: R,
        t: 0,
        speed: speed,
        // Where the ride started, so the ground track is exact rather than
        // integrated — a loop must put you back on the road, every time.
        x0: v.x, y0: v.y,
      };
      v.railIndex = inside;
      v.grounded = false;
      v.vz = 0;
    }
  },

  /** Arc length of one circuit, including the forward lean. */
  arcLength(R) {
    return Math.hypot(2 * Math.PI * R.radius, R.length);
  },

  /**
   * Carry the car round. Returns true while it is still on the rail.
   *
   * Speed is CONSTANT through the ride and carried out the far side, so a loop
   * neither gives nor takes pace. It costs the time it costs, which is the
   * same for everyone, and the exit boost is the reward for having arrived
   * quickly enough to be allowed on at all.
   */
  step(v, dt) {
    if (!v.rail) return false;
    const R = v.rail.def;

    v.rail.t += (v.rail.speed * dt) / this.arcLength(R);

    if (v.rail.t >= 1) {
      // Released travelling the way the loop points, at the speed it came in.
      v.x = v.rail.x0 + R.dir[0] * R.length;
      v.y = v.rail.y0 + R.dir[1] * R.length;
      v.z = 0;
      v.roll = 0;
      v.heading = Math.atan2(R.dir[1], R.dir[0]);
      v.vel.x = R.dir[0] * v.rail.speed;
      v.vel.y = R.dir[1] * v.rail.speed;
      v.grounded = true;
      v.vz = 0;
      if (R.exitBoost) {
        v.boostMeter = Math.min(1, v.boostMeter + R.exitBoost);
      }
      v.rail = null;
      return false;
    }

    const a = v.rail.t * Math.PI * 2;

    // Ground position creeps forward across the loop, so the exit is visibly
    // past the entry rather than on top of it.
    v.x = v.rail.x0 + R.dir[0] * R.length * v.rail.t;
    v.y = v.rail.y0 + R.dir[1] * R.length * v.rail.t;

    // Up and over. 1 - cos keeps both feet on the floor at t = 0 and t = 1.
    v.z = R.radius * (1 - Math.cos(a));

    // The car rotates with the track it is standing on, which is what sells it.
    v.roll = a;
    v.heading = Math.atan2(R.dir[1], R.dir[0]);
    v.vel.x = R.dir[0] * v.rail.speed;
    v.vel.y = R.dir[1] * v.rail.speed;

    return true;
  },

  /** Geometry of the ribbon, for the renderer. */
  ringPoint(R, t, side) {
    const a = t * Math.PI * 2;
    const nx = -R.dir[1], ny = R.dir[0];       // across the track
    const cx = R.x + R.w / 2 + R.dir[0] * R.length * t;
    const cy = R.y + R.h / 2 + R.dir[1] * R.length * t;
    const half = (R.width || 150) / 2;
    return [cx + nx * half * side, cy + ny * half * side,
            R.radius * (1 - Math.cos(a))];
  },
};
