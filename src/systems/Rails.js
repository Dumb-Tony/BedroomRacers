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
        // integrated — a ride must put you back on the road, every time.
        x0: v.x, y0: v.y,
      };
      // A ride on a raised deck starts from the deck, not the bedroom floor.
      R.deckZ = v.roadZ || 0;
      v.railIndex = inside;
      v.grounded = false;
      v.vz = 0;
    }
  },

  /** Arc length of the whole ride, including the forward travel. */
  arcLength(R) {
    return Math.hypot(2 * Math.PI * R.radius * (R.turns || 1), R.length);
  },

  /**
   * The complete frame at a point along a ride: where the surface is, which way
   * is up, and which way is across.
   *
   * A LOOP AND A CORKSCREW DIFFER ONLY IN WHICH AXIS THEY TURN ABOUT.
   *
   *   loop      — turns about the LATERAL axis. The car pitches: nose up, over
   *               the top on its back, nose down. Displacement is purely
   *               vertical, so it comes back down where it went up.
   *   corkscrew — turns about the TRAVEL axis. The car rolls, and the track
   *               spirals sideways as well as up, so it is displaced laterally
   *               through the middle and returns to the line at the end.
   *
   * Everything else — entry, capture, constant speed, release — is shared, so a
   * corkscrew cost this function and a `kind` flag rather than a second system.
   *
   * `up` is the car's own up vector. Handing the renderer a vector rather than
   * an angle is what makes both read correctly: the first version rolled the
   * car through the loop, which is a barrel roll where a pitch belongs.
   */
  frameAt(R, t) {
    const turns = R.turns || 1;
    const a = t * Math.PI * 2 * turns;
    const ca = Math.cos(a), sa = Math.sin(a);
    const fx = R.dir[0], fy = R.dir[1];
    const nx = -fy, ny = fx;                    // lateral, left of travel
    const cork = R.kind === 'corkscrew';

    /* BOTH RIDES PUT THEIR CIRCLE IN THE LATERAL/UP PLANE. That is a decision
       forced by the camera, and it is worth being plain about why.

       A real loop's circle lies in the plane containing the direction of
       travel. The camera's yaw follows the direction of travel, so it looks
       straight down that plane's axis — and in this projection screen-x comes
       only from lateral offset while both depth and height fold into screen-y.
       A travel-plane circle therefore has CONSTANT screen-x: it collapses to a
       vertical band, however large the radius. The first version drew exactly
       that, a flat slab of stacked stripes, while measuring perfectly — full
       rotation, correct apex, correct exit. Stretching it forward only makes a
       taller band; there is no radius that rescues it.

       A circle standing in the lateral/up plane projects to a proper ellipse,
       because lateral feeds screen-x and height feeds screen-y. So that is what
       both rides use, and what separates them is how many turns they make and
       how far they travel while making them:

         loop      one turn, short travel  — a ring you go round on the spot
         corkscrew two turns, long travel  — a spiral you travel along

       The car rolls through both. A pitching loop is the geometrically honest
       one and it is invisible here, which makes it the wrong answer. */
    const swing = R.radius * sa;

    return {
      a: a,
      off:    { x: nx * swing, y: ny * swing, z: R.radius * (1 - ca) },
      up:     { x: -nx * sa,   y: -ny * sa,   z: ca },
      across: { x:  nx * ca,   y:  ny * ca,   z: sa },
    };
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
      // Released travelling the way the ride points, at the speed it came in.
      v.x = v.rail.x0 + R.dir[0] * R.length;
      v.y = v.rail.y0 + R.dir[1] * R.length;
      v.z = 0;
      v.roll = 0;
      v.up = { x: 0, y: 0, z: 1 };
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

    const F = this.frameAt(R, v.rail.t);

    /* Ground position creeps forward across the ride, so the exit is past the
       entry rather than on top of it. A loop adds nothing sideways; a corkscrew
       adds the spiral's lateral swing on top. */
    v.x = v.rail.x0 + R.dir[0] * R.length * v.rail.t + F.off.x;
    v.y = v.rail.y0 + R.dir[1] * R.length * v.rail.t + F.off.y;

    // 1 - cos keeps both feet on the deck at t = 0 and t = 1.
    v.z = F.off.z;

    // The car turns with the track it is standing on, which is what sells it.
    v.roll = F.a;
    v.up = F.up;
    v.heading = Math.atan2(R.dir[1], R.dir[0]);
    v.vel.x = R.dir[0] * v.rail.speed;
    v.vel.y = R.dir[1] * v.rail.speed;

    return true;
  },

  /**
   * A point on the ribbon, for the renderer.
   * @param side  -1 or 1 across the track, 0 for the centre
   * @param lift  distance out along the surface normal, for the side rails
   */
  ringPoint(R, t, side, lift) {
    const F = this.frameAt(R, t);
    const half = (R.width || 150) / 2;
    const L = lift || 0;
    return [
      R.x + R.w / 2 + R.dir[0] * R.length * t + F.off.x
        + F.across.x * half * side + F.up.x * L,
      R.y + R.h / 2 + R.dir[1] * R.length * t + F.off.y
        + F.across.y * half * side + F.up.y * L,
      (R.deckZ || 0) + F.off.z + F.across.z * half * side + F.up.z * L,
    ];
  },
};
