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

     LOCKING THIS IS A PHASE 1 EXIT CRITERION. It blocks vehicle art, because
     sprites must be pre-rendered at this exact angle (12_Art_Guide.md).      */
  groundTilt: 0.62,

  /* How much one world unit of height lifts a sprite up the screen. The gap
     between a car and its shadow is the only height cue there is.           */
  heightScale: 0.85,

  // ── camera state (render-only — never read by the simulation) ────────────
  camX: 0,
  camY: 0,
  camYaw: 0,          // world angle that maps to straight up the screen

  _cos: 0,
  _sin: -1,

  /**
   * Set the camera. Call once per frame BEFORE any project() call.
   * @param {number} yaw world angle that should point up the screen
   */
  setCamera(x, y, yaw) {
    this.camX = x;
    this.camY = y;
    this.camYaw = yaw;
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
      sy: ry * this.groundTilt - (z || 0) * this.heightScale,
      depth: ry,
    };
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
