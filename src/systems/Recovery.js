/* =============================================================================
   RECOVERY — what happens when you go over the edge.
   =============================================================================
   07_World_Stunt_Track.md open question 4, the last one it had left:

     "What does falling off do here? Under-track recovery is a whole subsystem."

   Both stunt tracks dodged it by running unbroken side rails, which is a fine
   answer for a track that never wants you to leave and no answer at all for one
   that does. Shelf Run now has a gap in the rail 440 units up.

   THE ANSWER IS: YOU FALL, YOU WATCH, YOU GET PUT BACK. Not a reset to a
   checkpoint half a lap behind — the car is lifted back to the last place it
   was legitimately on the road, pointing the right way, at a fraction of the
   speed it had. The cost is the seconds it took and the momentum it lost, which
   is enough to hurt without being the kind of punishment that makes a player
   stop taking the risk that caused it (03_Driving_Physics.md: playful rather
   than punishing).

   THE FALL IS SHOWN. Teleporting the car the instant it crosses the edge is
   cheaper and reads as a bug — the player sees their car vanish with no
   explanation. Letting it drop, tumbling, for most of a second is what makes it
   legible as a mistake they made.

   Flat tracks never enter any of this. Leaving the road on the rug is a
   shortcut, not a cliff.
   ========================================================================== */

window.BR = window.BR || {};

BR.Recovery = {

  /* How far past the kerb line counts as "off the deck" rather than "clipping
     the edge". Generous, because being dumped for grazing a kerb at speed would
     be exactly the punishing feel this is trying to avoid. */
  EDGE_MARGIN: 34,

  /* A deck this low is the bedroom floor. Leaving the road there is ordinary
     off-road driving and must not trigger anything. */
  FLOOR_Z: 40,

  FALL_TIME: 0.85,        // seconds of visible drop before the lift back
  HOLD_TIME: 0.35,        // beat at the bottom, so the fall reads as an event
  SPIN_RATE: 7.0,         // tumble, rad/sec — a falling toy car turns over
  KEEP_SPEED: 0.3,        // fraction of entry speed handed back on return

  /**
   * Has this car just left a raised deck?
   * Called every fixed step for every car on an elevated track.
   */
  check(v, arena) {
    if (!arena.elevated || v.falling || v.rail) return;

    // Off the side of the road, and the road it left is off the ground.
    const off = v.trackDist > arena.halfWidth + this.EDGE_MARGIN;
    if (!off || v.roadZ <= this.FLOOR_Z) return;

    v.falling = true;
    v.fallTimer = 0;
    v.fallFromZ = v.roadZ + v.z;
    v.fallSpeed = Math.hypot(v.vel.x, v.vel.y);
    v.grounded = false;
  },

  /**
   * Carry the fall. Returns true while the car is still not being driven.
   *
   * The car keeps its horizontal velocity — it went over the edge with momentum
   * and stopping it dead in mid-air would look like it hit a wall made of
   * nothing.
   */
  step(v, arena, dt) {
    if (!v.falling) return false;
    const P = BR.PHYSICS;

    v.fallTimer += dt;

    if (v.fallTimer < this.FALL_TIME) {
      v.x += v.vel.x * dt;
      v.y += v.vel.y * dt;
      v.vz -= P.gravity * dt;
      v.z += v.vz * dt;

      /* Land ON the floor rather than sinking through it. `z` is measured from
         the deck the car fell off, so the floor is at -roadZ. Without the clamp
         a 440-unit fall passes the carpet with time to spare and the last
         fraction of a second is spent underneath the room. */
      if (v.roadZ + v.z < 0) {
        v.z = -v.roadZ;
        v.vz = 0;
        v.vel.x *= 0.4;      // it has hit something
        v.vel.y *= 0.4;
      }

      v.heading += this.SPIN_RATE * dt;
      // Tumble: roll it as it goes, so it reads as falling rather than as
      // descending under control.
      const a = v.fallTimer * this.SPIN_RATE;
      v.up = { x: -Math.sin(v.heading) * Math.sin(a),
               y:  Math.cos(v.heading) * Math.sin(a),
               z:  Math.cos(a) };
      return true;
    }

    if (v.fallTimer < this.FALL_TIME + this.HOLD_TIME) return true;

    this.replace(v, arena);
    return false;
  },

  /**
   * Put the car back where it last legitimately was.
   *
   * NOT the last checkpoint — that can be_half a lap back, and losing a lap for
   * clipping an edge is the kind of thing that makes people stop playing. The
   * last on-road centreline index is both fair and always valid, because it is
   * a point the car actually occupied.
   */
  replace(v, arena) {
    const line = arena.centreline;
    const i = (v.lastSafeIdx >= 0 && v.lastSafeIdx < line.length)
      ? v.lastSafeIdx : 0;
    const t = BR.TrackManager.tangentAt(line, i);

    v.x = line[i][0];
    v.y = line[i][1];
    v.heading = Math.atan2(t[1], t[0]);

    const keep = v.fallSpeed * this.KEEP_SPEED;
    v.vel.x = t[0] * keep;
    v.vel.y = t[1] * keep;

    v.z = 0; v.vz = 0; v.grounded = true;
    v.up = { x: 0, y: 0, z: 1 };
    v.roll = 0;
    v.spinTime = 0; v.spinVel = 0;
    v.lineIdx = i;
    v.level = arena.elevation[i].level;
    v.roadZ = arena.elevation[i].z;

    v.falling = false;
    v.fallTimer = 0;
    v.recovered = (v.recovered || 0) + 1;
  },
};
