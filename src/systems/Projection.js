/* =============================================================================
   PROJECTION — world space to screen space.
   =============================================================================
   THE most important architectural boundary in the project.

   The simulation is FLAT 2D. The camera is a render-time transform and nothing
   else. No gameplay code may read this module. If it does, the perspective
   becomes impossible to change later — and it keeps changing.

   The camera is a CHASE CAMERA: it sits behind the car and ROTATES so the
   direction of travel always points up the screen. Three stages, in order:

       1. translate   world position relative to the camera focus
       2. rotate      by camera yaw, so travel direction becomes screen "up"
       3. squash      the ground plane vertically by groundTilt,
                      and lift by height * heightScale

   Rotation happens BEFORE the squash, which is what makes the ground recede
   correctly. Doing it the other way round shears the world.

   See GAME_BIBLE/03_Driving_Physics.md "Perspective".
   ========================================================================== */

window.BR = window.BR || {};

BR.Projection = {

  /* Vertical squash of the ground plane, applied in CAMERA space.
       1.0  = looking straight down
       0.62 = current guess
       0.4  = low, close to the ground

     DIALLED IN, PHASE 1: 0.30, down from the guessed 0.62. That is a much
     lower, more behind-the-car view than "slightly angled 2.5D" implied, and
     it changes the art direction — vehicles are seen far more from behind and
     far less from above. See 12_Art_Guide.md.

     NOTE: 0.30 is the debug slider's minimum. If it wanted to go lower, the
     range needs widening rather than the value being treated as settled.

     Blocks vehicle art: sprites must be pre-rendered at this exact angle.    */
  groundTilt: 0.30,

  /* How much one world unit of height lifts a sprite up the screen. The gap
     between a car and its shadow is the only height cue there is.           */
  heightScale: 0.85,

  // ── camera state (render-only — never read by the simulation) ────────────
  camX: 0,
  camY: 0,
  camYaw: 0,          // world angle that maps to straight up the screen
  camZ: 0,            // deck height the camera is following — see setCamera

  _cos: 0,
  _sin: -1,

  /**
   * Set the camera. Call once per frame BEFORE any project() call.
   * @param {number} yaw world angle that should point up the screen
   */
  setCamera(x, y, yaw, z) {
    this.camX = x;
    this.camY = y;
    this.camYaw = yaw;
    /* The DECK the camera is following, not the car's jump height.
       Heights are drawn relative to this, so a player on a raised section stays
       framed instead of climbing the screen. Without it a car on the 300-high
       dresser sat 255px above the anchor, and a corkscrew on top of that put it
       394px up — off the top of the viewport entirely, along with the ride it
       was on. Jumps still bounce, because a jump is not a deck. */
    this.camZ = z || 0;
    // Rotate the world by -(yaw + PI/2) so the yaw direction lands on -y,
    // i.e. up the screen.
    const a = -(yaw + Math.PI / 2);
    this._cos = Math.cos(a);
    this._sin = Math.sin(a);
  },

  /**
   * World -> screen, relative to the camera. The caller centres the result.
   * `depth` is camera-space distance: LARGER means NEARER the viewer.
   */
  project(x, y, z) {
    const dx = x - this.camX;
    const dy = y - this.camY;
    const rx = dx * this._cos - dy * this._sin;
    const ry = dx * this._sin + dy * this._cos;
    return {
      sx: rx,
      sy: ry * this.groundTilt - ((z || 0) - this.camZ) * this.heightScale,
      depth: ry,
    };
  },

  /* ── depth scaling — a touch of fake perspective ─────────────────────────
     The projection is axonometric, so a car 2000 units away is drawn exactly
     the same size as one alongside. Shrinking distant objects gives depth back
     (12_Art_Guide.md, "The flatness problem").

     THIS SCALES OBJECTS, NOT THE GROUND. Discrete things with a single ground
     anchor — cars, props, hazards, toy pieces, wall extrusions — shrink about
     that anchor. The road, the rug, the markings and the finish line do not:
     they are the plane itself, and scaling them would mean true perspective,
     which is a different and much larger change.

     The trade is deliberate. A distant car on a road that has not narrowed is
     geometrically inconsistent, but the eye keys on objects rather than on
     absolute road width, and it buys depth for almost nothing. Set to 0 to
     compare.                                                                */
  depthScale: 0.30,    // how much smaller at the far edge. 0 = off
  depthRange: 2400,    // world units over which that shrink is spread

  /**
   * Scale factor for something at camera-space depth `ry`.
   * Things behind the focus are never enlarged — only distance shrinks.
   */
  scaleAt(ry) {
    if (this.depthScale <= 0) return 1;
    const ahead = ry < 0 ? -ry : 0;
    const t = ahead > this.depthRange ? 1 : ahead / this.depthRange;
    return 1 - t * this.depthScale;
  },

  /* Shadow contrast falls with distance — the third depth cue in
     12_Art_Guide.md. Depth scaling already shrinks a shadow with its object;
     this is the contrast half, and it is what atmosphere actually does to a
     shadow: the haze between you and it lifts its black toward the ambient.

     Shares depthRange with depthScale, so the two cues stay in step. */
  shadowFalloff: 0.5,   // opacity lost at the far edge. 0 = off

  shadowAlphaAt(ry) {
    if (this.shadowFalloff <= 0) return 1;
    const ahead = ry < 0 ? -ry : 0;
    const t = ahead > this.depthRange ? 1 : ahead / this.depthRange;
    return 1 - t * this.shadowFalloff;
  },

  /** Shrink a projected point toward an anchor. */
  shrink(p, anchor, s) {
    return { sx: anchor.sx + (p.sx - anchor.sx) * s,
             sy: anchor.sy + (p.sy - anchor.sy) * s };
  },

  /**
   * Draw order. Must be CAMERA-space y, not world y — with a rotating camera,
   * "further away" depends on where the camera is looking. Sort ascending and
   * the nearest things draw last.
   */
  depthAt(x, y) {
    const dx = x - this.camX;
    const dy = y - this.camY;
    return dx * this._sin + dy * this._cos;
  },
};
